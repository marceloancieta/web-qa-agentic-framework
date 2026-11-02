// The `allure-testops` adapter: definitions first. `tm:publish` creates or updates one automated
// TestOps test case per case, keyed by its identity as the test case's fullName; a run is a TestOps
// launch, and each uploaded result names its test case by the `ALLURE_ID` label, so a result never
// creates a test case of its own. Built and checked against TestOps 26.3 (its OpenAPI is served at
// /api-docs/).
//
// What a test case holds: the name `<case id> <title>`, the fullName, the tags without `@`, and a
// description with one `Label: value` line each for the case id, feature, technique, priority and
// spec, which is how the definition is read back.
//
// Options (qa-config test_management.options), each with an environment fallback:
//   endpoint      instance URL                     (ALLURE_ENDPOINT)
//   project_id    numeric project id               (ALLURE_PROJECT_ID)
//   token_env     variable holding the API token   (default ALLURE_TOKEN; never a flag)
//   resultsDir    Allure results to upload from    (default allure-results)
//   wait_seconds  how long to wait for TestOps to process an upload (default 120)
//
// What is uploaded: for each attributed result of a published case, its last attempt's result file
// and the attachments it references, with `fullName` and `testCaseId` set to the identity, the
// manifest's status and the `ALLURE_ID` of its test case. A result without an identity, or of a
// case not published to the project, is skipped with a reason. The `host` and `thread` labels name
// the machine and stay local. A result with no file behind it is uploaded as a minimal result built
// from the manifest.
//
// Read-back: a published test case is read back by its identity. An upload is processed
// asynchronously, so the launch's results are polled until every uploaded identity shows its status
// on its own test case; the launch is read back after it is created and closed.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { credential } from '../../../lib/env.mjs';
import { httpClient } from '../../../lib/http.mjs';
import { assertReadBack } from '../../adapter.mjs';

const LOCAL_LABELS = new Set(['host', 'thread']);
// The label that links an uploaded result to an existing TestOps test case by its id.
const ALLURE_ID = 'ALLURE_ID';
const UPLOAD_BATCH = 50;
const PAGE_SIZE = 100;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Every attachment file a result references, in the result and in its steps at any depth. */
export function attachmentSources(item) {
  return [
    ...(item.attachments ?? []).map((attachment) => attachment.source).filter(Boolean),
    ...(item.steps ?? []).flatMap(attachmentSources),
  ];
}

/**
 * The result as uploaded: keyed by identity, without machine labels, with the manifest's status,
 * and linked to its published test case by the `ALLURE_ID` label when its TestOps id is known.
 * The file's own status can differ: a known gap's expected failure is `passed` in the file and
 * `failed` in the manifest while its issue is open (scripts/tm/manifest.mjs knownGapOutcome).
 */
export function uploadedResult(source, identity, status = source.status, tmId = null) {
  const labels = (source.labels ?? []).filter(
    (label) => !LOCAL_LABELS.has(label.name) && label.name !== ALLURE_ID,
  );
  return {
    ...source,
    status,
    fullName: identity,
    testCaseId: identity,
    labels: tmId ? [...labels, { name: ALLURE_ID, value: String(tmId) }] : labels,
  };
}

// A definition's fields that TestOps has no field for are kept in the description, one per line.
const DESCRIPTION_KEYS = [
  ['Case', 'caseId'],
  ['Feature', 'feature'],
  ['Technique', 'technique'],
  ['Priority', 'priority'],
  ['Spec', 'spec'],
];

const specText = (spec) =>
  spec?.file ? (spec.line ? `${spec.file}:${spec.line}` : spec.file) : 'none';

function specFrom(text) {
  if (!text || text === 'none') return null;
  const match = /^(.*):(\d+)$/.exec(text);
  return match ? { file: match[1], line: Number(match[2]) } : { file: text };
}

const sortedTags = (tags) => [...(tags ?? [])].sort();

/** The TestOps test case for a manifest case: named by its case id and title, keyed by identity. */
export function testCaseBody(testCase) {
  const values = { ...testCase, spec: specText(testCase.spec) };
  return {
    name: `${testCase.caseId} ${testCase.title}`,
    fullName: testCase.identity,
    automated: true,
    description: DESCRIPTION_KEYS.map(([label, key]) => `${label}: ${values[key] ?? ''}`).join(
      '\n',
    ),
    tags: sortedTags(testCase.tags).map((tag) => ({ name: tag.replace(/^@/, '') })),
  };
}

/** A TestOps test case read back as a definition (the local adapter's DEFINITION_FIELDS). */
export function definitionFrom(dto) {
  const fields = {};
  for (const line of String(dto.description ?? '').split(/\r?\n/)) {
    const entry = DESCRIPTION_KEYS.find(([label]) => line.startsWith(`${label}: `));
    if (entry) fields[entry[1]] = line.slice(entry[0].length + 2);
  }
  const prefix = fields.caseId ? `${fields.caseId} ` : '';
  const name = String(dto.name ?? '');
  return {
    tmId: String(dto.id),
    title: prefix && name.startsWith(prefix) ? name.slice(prefix.length) : name,
    feature: fields.feature ?? null,
    technique: fields.technique ?? null,
    priority: fields.priority ?? null,
    tags: sortedTags((dto.tags ?? []).map((tag) => `@${tag.name}`)),
    spec: specFrom(fields.spec),
  };
}

/** The definition a manifest case should have in TestOps, in the shape definitionFrom reads. */
const wantedDefinition = (testCase) => ({
  title: testCase.title,
  feature: testCase.feature ?? null,
  technique: testCase.technique ?? null,
  priority: testCase.priority ?? null,
  tags: sortedTags(testCase.tags),
  spec: specFrom(specText(testCase.spec)),
});

const DEFINITION_FIELDS = ['title', 'feature', 'technique', 'priority', 'tags', 'spec'];
const pick = (definition) => DEFINITION_FIELDS.map((field) => definition[field]);

/** A minimal Allure result for a manifest result that has no result file behind it. */
export function synthesizedResult(result, now = Date.now()) {
  const stop = result.stop ?? now;
  return {
    uuid: randomUUID(),
    historyId: result.identity,
    testCaseId: result.identity,
    fullName: result.identity,
    name: result.name || result.identity,
    status: result.status,
    stage: 'finished',
    start: result.start ?? stop - (result.durationMs ?? 0),
    stop,
    labels: result.run ? [{ name: 'run', value: result.run }] : [],
    links: (result.issues ?? []).map((key) => ({ type: 'issue', name: key })),
  };
}

export function createAdapter(
  options = {},
  { root = process.cwd(), env = process.env, fetchImpl = fetch, log = null, wait = sleep } = {},
) {
  const endpoint = String(options.endpoint ?? env.ALLURE_ENDPOINT ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error(
      'The allure-testops adapter needs test_management.options.endpoint or ALLURE_ENDPOINT.',
    );
  }
  const projectId = Number(options.project_id ?? env.ALLURE_PROJECT_ID);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(
      'The allure-testops adapter needs a numeric test_management.options.project_id or ALLURE_PROJECT_ID.',
    );
  }
  const token = credential(env, options.token_env ?? 'ALLURE_TOKEN', 'The allure-testops adapter');
  const resultsDir = resolve(root, options.resultsDir ?? 'allure-results');
  const waitMs = (options.wait_seconds ?? 120) * 1000;
  const pollMs = options.poll_ms ?? 2000;
  const request = httpClient({
    baseUrl: endpoint,
    headers: { authorization: `Api-Token ${token}` },
    fetchImpl,
    log,
    wait,
  });
  const expectOk = (response, what) => {
    if (response.ok) return response.json;
    const detail = response.json?.message ?? response.text.slice(0, 200);
    throw new Error(`Allure TestOps: ${what} failed with ${response.status}: ${detail}`);
  };

  const readLaunch = async (id) => {
    const response = await request('GET', `api/launch/${id}`);
    return response.status === 404 ? null : expectOk(response, `read launch ${id}`);
  };

  const launchResults = async (id) => {
    const rows = [];
    for (let page = 0; ; page += 1) {
      const body = expectOk(
        await request('GET', `api/testresult?launchId=${id}&page=${page}&size=${PAGE_SIZE}`),
        `read the results of launch ${id}`,
      );
      rows.push(...(body.content ?? []));
      if (body.last !== false) return rows;
    }
  };

  const readRun = async (run) => {
    const launch = await readLaunch(run.id);
    if (!launch) return null;
    const results = {};
    // Uploaded results carry the identity as their fullName; hidden rows are superseded retries.
    for (const row of await launchResults(run.id)) {
      if (!row.hidden)
        results[row.fullName ?? row.name] = { status: row.status, testCaseId: row.testCaseId };
    }
    return { id: launch.id, name: launch.name, closed: launch.closed === true, results };
  };

  // The test case published under an identity (its fullName), or null. Two cases with one identity
  // are a broken project, not a choice to make here.
  const findCase = async (identity) => {
    const rql = encodeURIComponent(`fullName = "${identity.replaceAll('"', '\\"')}"`);
    const body = expectOk(
      await request('GET', `api/testcase/__search?projectId=${projectId}&rql=${rql}&page=0&size=2`),
      `find the test case of ${identity}`,
    );
    const found = (body.content ?? []).filter((dto) => dto.fullName === identity);
    if (found.length > 1) {
      throw new Error(
        `Allure TestOps project ${projectId} holds ${found.length} test cases for ${identity} (ids ${found.map((dto) => dto.id).join(', ')}); keep one.`,
      );
    }
    if (!found[0]) return null;
    return expectOk(
      await request('GET', `api/testcase/${found[0].id}`),
      `read test case ${found[0].id}`,
    );
  };

  const readDefinitions = async (identities) => {
    const definitions = {};
    for (const identity of identities) {
      const dto = await findCase(identity);
      if (dto) definitions[identity] = definitionFrom(dto);
    }
    return definitions;
  };

  // The files for one attributed result: the result itself, then the attachments it references.
  const filesFor = (result) => {
    const file = result.file && join(resultsDir, basename(result.file));
    if (!file || !existsSync(file)) {
      const synthesized = uploadedResult(
        synthesizedResult(result),
        result.identity,
        result.status,
        result.tmId,
      );
      return [{ name: `${synthesized.uuid}-result.json`, content: JSON.stringify(synthesized) }];
    }
    const source = JSON.parse(readFileSync(file, 'utf8'));
    const files = [
      {
        name: basename(file),
        content: JSON.stringify(
          uploadedResult(source, result.identity, result.status, result.tmId),
        ),
      },
    ];
    for (const attachment of attachmentSources(source)) {
      const path = join(resultsDir, basename(attachment));
      if (existsSync(path)) files.push({ name: basename(attachment), content: readFileSync(path) });
      else log?.warn('attachment missing, not uploaded', { identity: result.identity, attachment });
    }
    return files;
  };

  const upload = async (launchId, files) => {
    const form = new FormData();
    form.append('info', new Blob(['{}'], { type: 'application/json' }));
    for (const { name, content } of files) form.append('file', new Blob([content]), name);
    expectOk(
      await request('POST', `api/launch/${launchId}/upload/file`, form),
      `upload to launch ${launchId}`,
    );
  };

  return {
    name: 'allure-testops',
    capabilities: { definitions: true, runs: true },
    readRun,
    readDefinitions,

    async publishDefinitions(cases) {
      const published = [];
      const unchanged = [];
      for (const testCase of cases) {
        const wanted = wantedDefinition(testCase);
        const existing = await findCase(testCase.identity);
        const current = existing && definitionFrom(existing);
        if (current && JSON.stringify(pick(current)) === JSON.stringify(pick(wanted))) {
          unchanged.push(testCase.identity);
          continue;
        }
        const body = testCaseBody(testCase);
        const written = existing
          ? expectOk(
              await request('PATCH', `api/testcase/${existing.id}`, body),
              `update test case ${existing.id} (${testCase.identity})`,
            )
          : expectOk(
              await request('POST', 'api/testcase', { ...body, projectId }),
              `create the test case of ${testCase.identity}`,
            );
        const tmId = String(existing?.id ?? written.id);
        const [readBack] = Object.values(await readDefinitions([testCase.identity]));
        assertReadBack(`test case ${testCase.identity}`, { tmId, ...wanted }, readBack, [
          'tmId',
          ...DEFINITION_FIELDS,
        ]);
        published.push({
          identity: testCase.identity,
          tmId,
          url: `${endpoint}/project/${projectId}/test-cases/${tmId}`,
        });
      }
      return { published, unchanged };
    },

    async startRun({ name, runId }) {
      const body = {
        name,
        projectId,
        autoclose: false,
        tags: runId ? [{ name: `run-${runId}` }] : [],
      };
      const launch = expectOk(await request('POST', 'api/launch', body), 'create a launch');
      assertReadBack(
        `launch ${launch.id}`,
        { name, projectId, closed: false },
        await readLaunch(launch.id),
        ['name', 'projectId', 'closed'],
      );
      return { id: launch.id, url: `${endpoint}/launch/${launch.id}` };
    },

    async reportResults(run, results) {
      const launch = await readLaunch(run.id);
      if (!launch) throw new Error(`Launch ${run.id} does not exist.`);
      if (launch.closed) throw new Error(`Launch ${run.id} is closed; start a new run to report.`);
      const skipped = [];
      const accepted = [];
      for (const result of results) {
        if (!result.identity) {
          skipped.push({ identity: result.name ?? '(unnamed)', reason: 'no case identity' });
          continue;
        }
        const definition = (await readDefinitions([result.identity]))[result.identity];
        if (!definition) {
          skipped.push({
            identity: result.identity,
            reason: `not published to Allure TestOps project ${projectId}: run npm run tm:publish first`,
          });
        } else accepted.push({ ...result, tmId: definition.tmId });
      }
      for (let start = 0; start < accepted.length; start += UPLOAD_BATCH) {
        await upload(run.id, accepted.slice(start, start + UPLOAD_BATCH).flatMap(filesFor));
      }
      // TestOps processes uploads in the background: wait until every result shows its status,
      // on the test case it was published as.
      const expected = Object.fromEntries(accepted.map((r) => [r.identity, r]));
      const landed = (identity, stored) =>
        stored[identity]?.status === expected[identity].status &&
        String(stored[identity]?.testCaseId) === expected[identity].tmId;
      const deadline = Date.now() + waitMs;
      let pending = Object.keys(expected);
      while (pending.length > 0) {
        const stored = (await readRun(run)).results;
        pending = pending.filter((identity) => !landed(identity, stored));
        if (pending.length === 0) break;
        if (Date.now() >= deadline) {
          const differences = pending.map(
            (identity) =>
              `${identity}: wrote ${expected[identity].status} on test case ${expected[identity].tmId}, read back ${stored[identity] ? `${stored[identity].status} on test case ${stored[identity].testCaseId}` : 'nothing'}`,
          );
          throw new Error(
            `Read-back of launch ${run.id} after ${waitMs / 1000}s does not match what was uploaded:\n  ${differences.join('\n  ')}`,
          );
        }
        await wait(pollMs);
      }
      return { reported: accepted.map((r) => r.identity), skipped };
    },

    async closeRun(run) {
      const launch = await readLaunch(run.id);
      if (!launch) throw new Error(`Launch ${run.id} does not exist.`);
      if (launch.closed) return { closed: true, alreadyClosed: true };
      expectOk(await request('POST', `api/launch/${run.id}/close`), `close launch ${run.id}`);
      const deadline = Date.now() + waitMs;
      let current = await readLaunch(run.id);
      while (!current?.closed && Date.now() < deadline) {
        await wait(pollMs);
        current = await readLaunch(run.id);
      }
      assertReadBack(`launch ${run.id}`, { closed: true }, current, ['closed']);
      return { closed: true, alreadyClosed: false };
    },
  };
}
