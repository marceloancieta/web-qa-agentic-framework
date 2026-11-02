// An in-memory stand-in for the Allure TestOps endpoints the `allure-testops` adapter calls, shaped
// after the OpenAPI a TestOps 26.3 instance serves and after what that instance did when used:
// uploads answer 202 and appear only after a few reads, closing twice is not an error, and a closed
// launch refuses uploads with 400. It is a `fetch` replacement: no network, no server.

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export function fakeTestOps({
  token = 'testops-fake-token',
  projectId = 7,
  processingReads = 2,
  // false: behave as an instance that ignores ALLURE_ID, so every result makes its own test case.
  linkByAllureId = true,
} = {}) {
  const launches = new Map();
  // Test cases by id, as `api/testcase` keeps them; tags come back sorted by name, as the instance
  // returned them.
  const cases = new Map();
  // A result without ALLURE_ID makes or reuses a test case keyed by its testCaseId (results-first).
  const testCases = new Map();
  let nextCase = 1;
  const newCase = (fields) => {
    const dto = { id: nextCase++, deleted: false, ...fields };
    dto.tags = (fields.tags ?? [])
      .map((tag, index) => ({ id: index + 1, name: tag.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    cases.set(dto.id, dto);
    return dto;
  };
  let nextLaunch = 1;
  let nextResult = 1;
  const calls = [];
  const uploads = [];

  const fetchImpl = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method;
    calls.push(`${method} ${pathname}`);
    if (init.headers.authorization !== `Api-Token ${token}`) {
      return json(401, { message: 'Unauthorized', status: 401 });
    }
    let match;
    if (method === 'POST' && pathname === '/api/testcase') {
      const body = JSON.parse(init.body);
      if (body.projectId !== projectId) return json(404, { message: 'project not found' });
      if (!body.name) return json(400, { message: 'name is required' });
      return json(200, newCase({ ...body, external: false }));
    }
    if (method === 'GET' && pathname === '/api/testcase/__search') {
      if (Number(searchParams.get('projectId')) !== projectId) return json(200, { content: [] });
      // Only the query the adapter sends: fullName = "<identity>".
      const rql = /^fullName = "(.*)"$/.exec(searchParams.get('rql') ?? '');
      if (!rql) return json(400, { message: `unsupported rql ${searchParams.get('rql')}` });
      const content = [...cases.values()].filter(
        (dto) => !dto.deleted && dto.fullName === rql[1].replaceAll('\\"', '"'),
      );
      return json(200, { content, last: true, number: 0 });
    }
    if ((match = pathname.match(/^\/api\/testcase\/(\d+)$/))) {
      const dto = cases.get(Number(match[1]));
      if (!dto) return json(404, { message: `test case with id ${match[1]} not found` });
      if (method === 'GET') return json(200, dto);
      if (method === 'PATCH') {
        const body = JSON.parse(init.body);
        Object.assign(dto, body);
        if (body.tags) {
          dto.tags = body.tags
            .map((tag, index) => ({ id: index + 1, name: tag.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
        return json(200, dto);
      }
    }
    if (method === 'POST' && pathname === '/api/launch') {
      const body = JSON.parse(init.body);
      if (body.projectId !== projectId) return json(404, { message: 'project not found' });
      const launch = {
        id: nextLaunch++,
        name: body.name,
        projectId: body.projectId,
        closed: false,
        tags: (body.tags ?? []).map((tag, index) => ({ id: index + 1, name: tag.name })),
        results: [],
        processing: [],
      };
      launches.set(launch.id, launch);
      return json(200, {
        id: launch.id,
        name: launch.name,
        projectId,
        closed: false,
        tags: launch.tags,
      });
    }
    if ((match = pathname.match(/^\/api\/launch\/(\d+)$/)) && method === 'GET') {
      const launch = launches.get(Number(match[1]));
      if (!launch) return json(404, { message: `launch with id ${match[1]} not found` });
      const { id, name, closed, tags } = launch;
      return json(200, { id, name, projectId: launch.projectId, closed, tags });
    }
    if ((match = pathname.match(/^\/api\/launch\/(\d+)$/)) && method === 'DELETE') {
      launches.delete(Number(match[1]));
      return json(204);
    }
    if ((match = pathname.match(/^\/api\/launch\/(\d+)\/close$/)) && method === 'POST') {
      const launch = launches.get(Number(match[1]));
      if (!launch) return json(404, { message: 'launch not found' });
      launch.closed = true;
      return json(204);
    }
    if ((match = pathname.match(/^\/api\/launch\/(\d+)\/upload\/file$/)) && method === 'POST') {
      const launch = launches.get(Number(match[1]));
      if (!launch) return json(404, { message: 'launch not found' });
      if (launch.closed) return json(400, { message: 'Launch is closed', status: 400 });
      const form = init.body;
      if (!(form instanceof FormData) || !form.get('info')) {
        return json(400, { message: 'multipart with info and file parts expected' });
      }
      const files = form.getAll('file');
      const names = files.map((file) => file.name);
      uploads.push({ launchId: launch.id, names });
      for (const file of files) {
        if (!file.name.endsWith('-result.json')) continue;
        const result = JSON.parse(await file.text());
        launch.processing.push({ result, readsLeft: processingReads });
      }
      return json(202, { filesCount: files.length, launchId: launch.id, testSessionId: 1 });
    }
    if (method === 'GET' && pathname === '/api/testresult') {
      const launch = launches.get(Number(searchParams.get('launchId')));
      if (!launch) return json(404, { message: 'launch not found' });
      // Processing finishes after a few reads, like the real background import.
      for (const item of launch.processing) item.readsLeft -= 1;
      for (const { result } of launch.processing.filter((item) => item.readsLeft < 0)) {
        // ALLURE_ID names an existing test case; without it the result makes or reuses its own.
        const allureId = Number(
          (result.labels ?? []).find((label) => label.name === 'ALLURE_ID')?.value,
        );
        let testCaseId = linkByAllureId && cases.has(allureId) ? allureId : null;
        if (testCaseId === null) {
          const key = result.testCaseId ?? result.fullName;
          if (!testCases.has(key)) {
            const made = newCase({ name: result.name, fullName: result.fullName, external: true });
            testCases.set(key, made.id);
          }
          testCaseId = testCases.get(key);
        }
        launch.results.push({
          id: nextResult++,
          launchId: launch.id,
          name: result.name,
          fullName: result.fullName,
          status: result.status,
          testCaseId,
          hidden: false,
        });
      }
      launch.processing = launch.processing.filter((item) => item.readsLeft >= 0);
      const page = Number(searchParams.get('page') ?? 0);
      const size = Number(searchParams.get('size') ?? 10);
      const content = launch.results.slice(page * size, (page + 1) * size);
      return json(200, { content, last: (page + 1) * size >= launch.results.length, number: page });
    }
    return json(404, { message: `No endpoint ${method} ${pathname}.` });
  };

  return { fetchImpl, calls, uploads, launches, cases, testCases, token, projectId };
}
