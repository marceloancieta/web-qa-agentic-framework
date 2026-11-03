// Pairwise (all-pairs) coverage: a set of rows in which every pair of values of two different
// factors appears at least once, instead of every combination of all of them. Most defects that
// depend on the environment need two conditions together (a browser and a form factor, a form
// factor and a role), so a covering set finds them at a fraction of the full product.
//
// Factors are `{ name: [values] }`, in a fixed order; a row is `{ name: value }`. `allowed(row)`
// says which full rows can exist: a device project fixes its browser and its form factor together,
// so desktop Firefox exists and a Firefox tablet does not. A pair that no allowed row realizes is
// not required. The domains here are small (a few browsers, form factors and roles), so the
// allowed rows are enumerated and the set is built greedily: each step adds the allowed row that
// covers the most pairs still missing, the first one in enumeration order on a tie, so the same
// factors always give the same set.

/** Every full row of the factors, in order: the first factor varies slowest. */
export function product(factors) {
  return Object.entries(factors).reduce(
    (rows, [name, values]) =>
      rows.flatMap((row) => values.map((value) => ({ ...row, [name]: value }))),
    [{}],
  );
}

/** The pairs a row covers, as stable keys: `[[factor, value], [factor, value]]` in JSON. */
function rowPairs(row, names) {
  const pairs = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      pairs.push(
        JSON.stringify([
          [names[i], row[names[i]]],
          [names[j], row[names[j]]],
        ]),
      );
    }
  }
  return pairs;
}

/** The pairs some allowed row realizes: the pairs a covering set must hold. */
export function requiredPairs(factors, allowed = () => true) {
  const names = Object.keys(factors);
  return new Set(
    product(factors)
      .filter(allowed)
      .flatMap((row) => rowPairs(row, names)),
  );
}

/** A covering set of allowed rows: every required pair is in at least one of them. */
export function pairwiseSet(factors, allowed = () => true) {
  const names = Object.keys(factors);
  const candidates = product(factors)
    .filter(allowed)
    .map((row) => ({ row, pairs: rowPairs(row, names) }));
  const missing = new Set(candidates.flatMap((candidate) => candidate.pairs));
  const set = [];
  while (missing.size > 0) {
    let best = null;
    let bestGain = 0;
    for (const candidate of candidates) {
      const gain = candidate.pairs.filter((pair) => missing.has(pair)).length;
      if (gain > bestGain) [best, bestGain] = [candidate, gain];
    }
    set.push(best.row);
    for (const pair of best.pairs) missing.delete(pair);
  }
  return set;
}

/**
 * What keeps `rows` from being a covering set: `{ missing, notAllowed }`, the required pairs no row
 * holds (as `[{ factor: value }, { factor: value }]`) and the rows that cannot exist.
 */
export function coverageGaps(rows, factors, allowed = () => true) {
  const names = Object.keys(factors);
  const notAllowed = rows.filter((row) => !allowed(row));
  const covered = new Set(rows.filter(allowed).flatMap((row) => rowPairs(row, names)));
  const missing = [...requiredPairs(factors, allowed)]
    .filter((pair) => !covered.has(pair))
    .map((pair) => JSON.parse(pair).map((entry) => Object.fromEntries([entry])));
  return { missing, notAllowed };
}
