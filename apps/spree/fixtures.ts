// The Spree Commerce admin pack's `test`: the core fixtures with this application's way of signing
// actors in. Until the provider says how accounts are created and signed in, only the built-in
// `anonymous` actor works.

import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect } from '../../fixtures';

export const provider: ActorProvider = {
  async signIn({ role }) {
    throw new Error(
      `The spree pack cannot sign "${role}" in yet: write signIn in apps/spree/fixtures.ts.`,
    );
  },
};

export const test = createTest(provider);

export { expect };
