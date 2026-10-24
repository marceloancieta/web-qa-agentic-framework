#!/usr/bin/env node
/**
 * Creates the skeleton of an app pack. Two steps, so nothing is written before someone has seen
 * the plan:
 *
 *   node scripts/scaffold-app.mjs --name <pack> --base-url <url> [--title <t>] [--version <v>]
 *       [--test-id-attribute <attr>] [--login-path <path>]
 *       prints the files it would write and the qa-config entry to add. Writes nothing.
 *   ... --write
 *       writes the pack. Refuses when apps/<pack>/ already exists: a pack is never overwritten.
 *
 * The skeleton runs at once: a provider that knows no accounts yet (anonymous only), a home page
 * object, and a smoke spec that opens the home page under the page health guard. Accounts, pages
 * and cases come later, through the phases.
 *
 * Exit codes: 0 planned or written; 1 refused (the pack exists); 2 usage error.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^[a-z0-9][a-z0-9.-]*$/;
const ATTRIBUTE = /^[a-z][a-z0-9-]*$/;

const pascal = (name) =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** The checked options of a scaffold, or an error naming the first bad one. */
export function planOptions(values) {
  const name = values.name ?? '';
  if (!NAME.test(name))
    throw new Error('--name must match ^[a-z][a-z0-9-]*$ (the folder under apps/).');
  let baseUrl;
  try {
    baseUrl = new URL(values['base-url'] ?? '');
  } catch {
    baseUrl = null;
  }
  if (!baseUrl || !['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('--base-url must be an absolute http(s) URL, such as http://localhost:8080.');
  }
  const version = values.version ?? '0.0.0';
  if (!VERSION.test(version)) throw new Error('--version must match ^[a-z0-9][a-z0-9.-]*$.');
  const testIdAttribute = values['test-id-attribute'];
  if (testIdAttribute !== undefined && !ATTRIBUTE.test(testIdAttribute)) {
    throw new Error('--test-id-attribute must be an attribute name, such as data-test.');
  }
  const loginPath = values['login-path'];
  if (loginPath !== undefined && !loginPath.startsWith('/')) {
    throw new Error('--login-path must start with /, such as /login or /#/login.');
  }
  return {
    name,
    title: values.title ?? pascal(name).replace(/([a-z])([A-Z])/g, '$1 $2'),
    version,
    baseUrl: baseUrl.toString().replace(/\/+$/, ''),
    testIdAttribute,
    loginPath,
  };
}

function manifest(plan) {
  return `${JSON.stringify(
    {
      name: plan.name,
      version: plan.version,
      title: plan.title,
      ...(plan.testIdAttribute ? { testIdAttribute: plan.testIdAttribute } : {}),
      ...(plan.loginPath ? { login_path: plan.loginPath } : {}),
      breakpoints: {},
      third_party_hosts: [],
      secret_keys: [],
      identity_fields: [],
    },
    null,
    2,
  )}\n`;
}

const fixtures = (
  plan,
) => `// The ${plan.title} pack's \`test\`: the core fixtures with this application's way of signing
// actors in. Until the provider says how accounts are created and signed in, only the built-in
// \`anonymous\` actor works.

import type { ActorProvider } from '../../helpers/actors';
import { createTest, expect } from '../../fixtures';

export const provider: ActorProvider = {
  async signIn({ role }) {
    throw new Error(
      \`The ${plan.name} pack cannot sign "\${role}" in yet: write signIn in apps/${plan.name}/fixtures.ts.\`,
    );
  },
};

export const test = createTest(provider);

export { expect };
`;

const homePage = () => `// The page the application opens on.

import type { Locator, Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('');
  }

  /** The first top-level heading, if the page has one. */
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 }).first();
  }
}
`;

const smokeSpec = (
  plan,
) => `// Smoke: the ${plan.title} home page opens on every device project without page health problems.

import { HomePage } from '../../pages/home-page';
import { expect, test } from '../../fixtures';

test('the home page opens with a title @smoke', async ({ page }) => {
  await new HomePage(page).open();
  await expect(page).toHaveTitle(/\\S/);
});
`;

const readme = (plan) => `# ${plan.title} pack

Created by \`npm run scaffold:app\`. Fill in what the skeleton does not know yet:

- [ ] \`app.json\`: the application version, layout \`breakpoints\`, \`third_party_hosts\` to block,
      extra \`secret_keys\` and \`identity_fields\`
- [ ] \`fixtures.ts\`: how accounts are created (\`provision\`) and signed in (\`signIn\`)
- [ ] the qa-config entry below, in \`qa-config.json\` (and the example, when the pack is shared)
- [ ] \`docs/app-notes.md\`: facts about the application that tests rely on

## Running it

\`\`\`sh
npx playwright test --project='${plan.name}-*'
\`\`\`
`;

const appNotes = (plan) => `# ${plan.title}: application notes

Facts about the application that its specs rely on and its pages do not show: layout breakpoints,
messages, how sessions work, what is safe to change. Each one says how it was observed.
`;

/** The qa-config entry the new pack needs, for the user to add. */
export function configEntry(plan) {
  return {
    [plan.name]: {
      base_url: plan.baseUrl,
      allow_writes: false,
      actors: {
        user: {
          account: 'existing',
          username_env: `${plan.name.toUpperCase().replace(/-/g, '_')}_USER`,
          password_env: `${plan.name.toUpperCase().replace(/-/g, '_')}_PASSWORD`,
        },
      },
    },
  };
}

/** Every file of the skeleton: path relative to the repository root, and its content. */
export function scaffoldFiles(plan) {
  const dir = `apps/${plan.name}`;
  return [
    [`${dir}/app.json`, manifest(plan)],
    [`${dir}/README.md`, readme(plan)],
    [`${dir}/docs/app-notes.md`, appNotes(plan)],
    [`${dir}/a11y-known.json`, '[]\n'],
    [`${dir}/fixtures.ts`, fixtures(plan)],
    [`${dir}/pages/home-page.ts`, homePage()],
    [`${dir}/specs/smoke/home.spec.ts`, smokeSpec(plan)],
  ];
}

/** Write the skeleton under `root`; refuses an existing pack. Returns the paths written. */
export function writeScaffold(plan, root = REPO_ROOT) {
  const dir = join(root, 'apps', plan.name);
  if (existsSync(dir))
    throw new Error(`apps/${plan.name}/ already exists; a pack is never overwritten.`);
  const files = scaffoldFiles(plan);
  for (const [path, content] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return files.map(([path]) => path);
}

function main() {
  let values;
  let plan;
  try {
    ({ values } = parseArgs({
      options: {
        name: { type: 'string' },
        'base-url': { type: 'string' },
        title: { type: 'string' },
        version: { type: 'string' },
        'test-id-attribute': { type: 'string' },
        'login-path': { type: 'string' },
        write: { type: 'boolean', default: false },
      },
    }));
    plan = planOptions(values);
  } catch (error) {
    console.error(`scaffold-app: ${error.message}`);
    process.exit(2);
  }
  const entry = JSON.stringify(configEntry(plan), null, 2);
  if (!values.write) {
    console.log(`scaffold-app: plan for apps/${plan.name}/ (nothing written; add --write):`);
    for (const [path] of scaffoldFiles(plan)) console.log(`  ${path}`);
    console.log(`\nAdd to app.environments.<env>.packs in qa-config.json:\n${entry}`);
    return;
  }
  try {
    const written = writeScaffold(plan);
    console.log(`scaffold-app: wrote ${written.length} files under apps/${plan.name}/.`);
    console.log(`\nAdd to app.environments.<env>.packs in qa-config.json:\n${entry}`);
  } catch (error) {
    console.error(`scaffold-app: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
