// The accessibility sweep (`@a11y-sweep`, selected only by the a11y lane): every route of the app
// maps, as the role each map was walked as, against a11y-known.json. Not registry cases, so the
// titles carry no case id. helpers/a11y-sweep.ts plans the routes and waits for each to be ready.

import { openForSweep, sweepPlan } from '../../../../helpers/a11y-sweep';
import { test } from '../../fixtures';

const plan = sweepPlan('juice-shop');

test.describe('a11y sweep', { tag: ['@regression', '@a11y-sweep'] }, () => {
  // The sweep's subject is accessibility. What the page health guard finds on a route opened
  // directly (a broken image, an error logged without the steps before it) belongs to the cases
  // of that route's feature, which run with the guard on.
  test.use({
    pageHealth: { off: 'the sweep checks accessibility; page health belongs to the feature cases' },
  });
  for (const problem of plan.problems) {
    test(`cannot plan: ${problem}`, () => {
      throw new Error(problem);
    });
  }

  for (const target of plan.targets) {
    test(`${target.role} ${target.route}`, async ({ actor, a11y }) => {
      const { page } = await actor(target.role);
      await openForSweep(page, target);
      await a11y.expectNoNewViolations(page);
    });
  }
});
