// The security headers sweep: every document the app maps open, as the role each map was walked
// as, checked against headers-known.json (helpers/security-headers.ts). Not registry cases, so the
// titles carry no case id; a designed case checks its own pages with
// securityHeaders.expectNoNewGaps(page). In a pairwise environment each project checks only the
// roles the pairwise set gives it.

import { pairwiseSkip } from '../../../../helpers/a11y-sweep';
import { headerTargets } from '../../../../helpers/security-headers';
import { test } from '../../fixtures';

const plan = headerTargets('juice-shop');

test.describe('security headers', { tag: ['@regression', '@security'] }, () => {
  // The sweep's subject is what the server sends. What the page health guard finds on a route
  // opened directly belongs to the cases of that route's feature, which run with the guard on.
  test.use({
    pageHealth: {
      off: 'the sweep checks response headers; page health belongs to the feature cases',
    },
  });
  for (const problem of plan.problems) {
    test(`cannot plan: ${problem}`, () => {
      throw new Error(problem);
    });
  }

  for (const target of plan.targets) {
    test(`headers ${target.role} ${target.document}`, async ({
      actor,
      securityHeaders,
    }, testInfo) => {
      const skip = pairwiseSkip(target, testInfo.project);
      test.skip(skip !== null, skip ?? '');
      const { page } = await actor(target.role);
      await page.goto(target.route);
      await securityHeaders.expectNoNewGaps(page);
    });
  }
});
