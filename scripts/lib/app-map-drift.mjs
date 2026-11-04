// What counts as drift between a tracked app map (apps/<pack>/docs/app-map.json) and a fresh walk of
// the same pack: the differences a spec or a contract depends on, and none of those a second walk of
// an unchanged application would show anyway.
//
// Compared, per route:
//   - the route itself (only in the tracked map: removed; only in the live one: added)
//   - the title
//   - the landmarks, headings and interactive elements, by role and accessible name, as sets
//   - the form fields, by tag and label: their `type` and every HTML constraint the map records
//
// Not compared, and why:
//   - the order of any list: the map sorts most of them, and a heading or field that moves on the
//     page changes no locator by role and name
//   - the repeat count of an element (`button "Add to Basket" x15`): it follows the data, such as the
//     number of products on a page, not the page's structure
//   - `api_calls`: what a page requests before the network goes idle depends on timing (polling,
//     sockets), and the mocks own the endpoints they replace
//   - `links`: they follow the data (a product, a review); a link to a new route shows up as that
//     route being added
//   - `blocked_writes`, `app_version` and `pack`: the walk's own bookkeeping, not the application
//
// A changed label is a field removed and another added: the label is how a spec finds the field.

const COUNT = /^(.*") x\d+$/;

/** An interactive entry without its repeat count: `button "Add" x2` becomes `button "Add"`. */
export function withoutCount(entry) {
  return COUNT.exec(entry)?.[1] ?? entry;
}

/** The constraints of a field with sorted keys, so their order never counts. */
function canonical(field) {
  const constraints = Object.fromEntries(
    Object.entries(field.constraints ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return { type: field.type ?? '', ...constraints };
}

/** The fields of a route grouped by `<tag> "<label>"`, each group a list of canonical descriptions. */
function fieldGroups(fields = []) {
  const groups = new Map();
  for (const field of fields) {
    const key = `${field.tag} "${field.label ?? ''}"`;
    groups.set(key, [...(groups.get(key) ?? []), canonical(field)]);
  }
  return groups;
}

const describe = (value) => (value === undefined ? '(none)' : JSON.stringify(value));

/** What differs between two canonical descriptions of one field: `minlength "8" -> "6"`. */
function attributeChanges(before, after) {
  const attributes = { ...before, ...after };
  return Object.keys(attributes)
    .sort()
    .filter((name) => before[name] !== after[name])
    .map((name) => `${name} ${describe(before[name])} -> ${describe(after[name])}`);
}

/** Entries of `after` not in `before`, sorted. */
const missingFrom = (before, after) => [...after].filter((entry) => !before.has(entry)).sort();

function setChanges(kind, before = [], after = [], normalize = (entry) => entry) {
  const was = new Set(before.map(normalize));
  const is = new Set(after.map(normalize));
  return [
    ...missingFrom(is, was).map((entry) => `${kind} removed: ${entry}`),
    ...missingFrom(was, is).map((entry) => `${kind} added: ${entry}`),
  ];
}

function fieldChanges(before, after) {
  const was = fieldGroups(before);
  const is = fieldGroups(after);
  const keys = [...new Set([...was.keys(), ...is.keys()])].sort();
  const changes = [];
  for (const key of keys) {
    const old = (was.get(key) ?? []).map((field) => JSON.stringify(field)).sort();
    const now = (is.get(key) ?? []).map((field) => JSON.stringify(field)).sort();
    if (JSON.stringify(old) === JSON.stringify(now)) continue;
    if (old.length === 1 && now.length === 1) {
      const attributes = attributeChanges(JSON.parse(old[0]), JSON.parse(now[0]));
      changes.push(`field ${key}: ${attributes.join(', ')}`);
      continue;
    }
    // Several fields share the key (often unlabelled ones): report the descriptions that differ.
    const remaining = [...now];
    for (const description of old) {
      const index = remaining.indexOf(description);
      if (index >= 0) remaining.splice(index, 1);
      else changes.push(`field removed: ${key} ${description}`);
    }
    for (const description of remaining) changes.push(`field added: ${key} ${description}`);
  }
  return changes;
}

/** The differences that matter between one route's tracked and live entries. */
export function routeChanges(before, after) {
  const changes = [];
  if ((before.title ?? '') !== (after.title ?? '')) {
    changes.push(`title ${describe(before.title)} -> ${describe(after.title)}`);
  }
  changes.push(
    ...setChanges('landmark', before.landmarks, after.landmarks),
    ...setChanges('heading', before.headings, after.headings),
    ...setChanges('element', before.interactive, after.interactive, withoutCount),
    ...fieldChanges(before.fields, after.fields),
  );
  return changes;
}

/**
 * The drift between a tracked map and a live one: `{ route, change }` per difference, routes in
 * order. An empty list means the live application still matches what the tracked map says.
 */
export function mapDrift(tracked, live) {
  const index = (map) => new Map((map.routes ?? []).map((entry) => [entry.route, entry]));
  const before = index(tracked);
  const after = index(live);
  const routes = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  return routes.flatMap((route) => {
    if (!after.has(route)) return [{ route, change: 'route removed' }];
    if (!before.has(route)) return [{ route, change: 'route added' }];
    return routeChanges(before.get(route), after.get(route)).map((change) => ({ route, change }));
  });
}

/** The drift as lines for a terminal: `  /#/login  element removed: button "Log in"`. */
export function driftLines(changes) {
  const width = Math.max(0, ...changes.map(({ route }) => route.length));
  return changes.map(({ route, change }) => `  ${route.padEnd(width)}  ${change}`);
}

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const cell = (text) => text.replace(/[\\|]/g, '\\$&').replace(/`/g, "'");

/**
 * One pack's section of a Markdown summary, such as the one a GitHub job writes to
 * `$GITHUB_STEP_SUMMARY`. `result` is `{ pack, baseUrl, routes, changes }`, or `{ pack, baseUrl,
 * error }` when the pack could not be mapped.
 */
export function driftMarkdown({ pack, baseUrl, routes, changes, error, note }) {
  const lines = [`### ${pack}`, '', `Mapped at ${baseUrl}.`, ''];
  if (error) {
    lines.push(`Could not be mapped: ${cell(error)}`, '');
    return lines.join('\n');
  }
  if (note) lines.push(note, '');
  if (changes.length === 0) {
    lines.push(
      `No drift: ${plural(routes, 'route')} ${routes === 1 ? 'matches' : 'match'} the tracked map.`,
      '',
    );
    return lines.join('\n');
  }
  lines.push(
    `${plural(changes.length, 'difference')} from the tracked map:`,
    '',
    '| Route | Change |',
    '|---|---|',
    ...changes.map(({ route, change }) => `| \`${cell(route)}\` | ${cell(change)} |`),
    '',
  );
  return lines.join('\n');
}
