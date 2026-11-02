// The run matrix: browser × form factor × role, reduced with pairwise (scripts/lib/pairwise.mjs).
// A run is one device project with one role, written `<project> as <role>`, such as
// `desktop-firefox as customer`. A device project fixes its browser and its form factor together
// (scripts/lib/devices.mjs), so only the pairs some project realizes are required: Firefox runs
// on the desktop alone, and a tablet is WebKit. Roles combine with every project.
//
// Two places use it:
//   - an environment with `pairwise: true` in qa-config must list projects that realize every
//     browser × form factor pair of the catalog (config:check), and `npm run pairwise` gives each
//     project the roles that complete the set for every pack the environment serves;
//   - a registry's `pairwise:` key lists the runs its cases were designed for, and lint-suite
//     reports a pair of browser, form factor and role that none of them covers.

import { coverageGaps, pairwiseSet } from './pairwise.mjs';

/** The role every pack has: no account, signed out. */
export const ANONYMOUS_ROLE = 'anonymous';
const RUN = /^([a-z][a-z0-9-]*) as ([a-z][a-z0-9-]*)$/;

/** The factors of the matrix and which rows exist, for these projects and roles. */
export function runFactors(projects, roles) {
  const unique = (values) => [...new Set(values)];
  const factors = {
    browser: unique(projects.map((project) => project.browser)),
    formFactor: unique(projects.map((project) => project.formFactor)),
    ...(roles.length ? { role: unique(roles) } : {}),
  };
  const allowed = (row) =>
    projects.some(
      (project) => project.browser === row.browser && project.formFactor === row.formFactor,
    );
  return { factors, allowed };
}

/** `{ project, role }` from `<project> as <role>`, or null when the text is not a run. */
export function parseRun(text) {
  const match = RUN.exec(String(text ?? '').trim());
  return match ? { project: match[1], role: match[2] } : null;
}

/** A pair of a gap as text: `browser firefox with role customer`. */
export function describePair(pair) {
  const name = { browser: 'browser', formFactor: 'form factor', role: 'role' };
  return pair
    .map((half) => Object.entries(half).map(([key, value]) => `${name[key]} ${value}`)[0])
    .join(' with ');
}

/**
 * A covering set of runs over `projects` (in their order) and `roles`: `[{ project, role }]`, each
 * row of the pairwise set given to the first project that realizes its browser and form factor.
 */
export function runSet(projects, roles) {
  const { factors, allowed } = runFactors(projects, roles);
  return pairwiseSet(factors, allowed).map((row) => ({
    project: projects.find((p) => p.browser === row.browser && p.formFactor === row.formFactor)
      .name,
    role: row.role,
  }));
}

/** How many runs every project with every role would be. */
export function fullRunCount(projects, roles) {
  return projects.length * Math.max(roles.length, 1);
}

/**
 * What keeps `runs` from covering browser × form factor × role over the `catalog` projects:
 * `{ unknown, missing }`, the runs that name no catalog project or a role outside `roles`, and the
 * required pairs no run covers, as text.
 */
export function runGaps(runs, catalog, roles) {
  const unknown = runs.filter(
    (run) => !catalog.some((p) => p.name === run.project) || !roles.includes(run.role),
  );
  const rows = runs
    .filter((run) => !unknown.includes(run))
    .map((run) => {
      const project = catalog.find((p) => p.name === run.project);
      return { browser: project.browser, formFactor: project.formFactor, role: run.role };
    });
  const { factors, allowed } = runFactors(catalog, roles);
  return { unknown, missing: coverageGaps(rows, factors, allowed).missing.map(describePair) };
}

/** The browser × form factor pairs of the catalog that `names` (a project list) do not realize. */
export function projectGaps(names, catalog) {
  const rows = catalog
    .filter((project) => names.includes(project.name))
    .map(({ browser, formFactor }) => ({ browser, formFactor }));
  const { factors, allowed } = runFactors(catalog, []);
  return coverageGaps(rows, factors, allowed).missing.map(describePair);
}
