import { expect, test } from '@playwright/test';
import { missingEnvVars, requiredEnvVars, type ActorConfig } from '../config';
import { missingActorVariables } from '../preflight';

const qa = {
  pack: 'shop',
  source: 'qa-config.json',
  environment: 'local',
  actors: {
    customer: { account: 'provisioned' },
    admin: { account: 'existing', username_env: 'SHOP_ADMIN_USER', password_env: 'SHOP_PASSWORD' },
    clerk: { account: 'existing', username_env: 'SHOP_CLERK_USER', password_env: 'SHOP_PASSWORD' },
  } satisfies Record<string, ActorConfig>,
};

const check = (env: NodeJS.ProcessEnv) =>
  missingActorVariables(qa, (actor) => missingEnvVars(requiredEnvVars(actor), env));

test('nothing missing: no message', () => {
  expect(check({ SHOP_ADMIN_USER: 'a', SHOP_CLERK_USER: 'c', SHOP_PASSWORD: 'p' })).toBeNull();
});

test('each missing variable is named once with every actor that needs it, and where it is configured', () => {
  expect(check({ SHOP_ADMIN_USER: 'a' })).toBe(
    'Missing environment variables for pack "shop": SHOP_PASSWORD (admin, clerk), ' +
      'SHOP_CLERK_USER (clerk). They are named in qa-config.json at ' +
      'app.environments.local.packs.shop.actors. Set them in the shell, the CI secret store or ' +
      'the local .env file.',
  );
});

test('a value pasted where a variable name belongs is never printed', () => {
  const pasted = 'S3cret!pasted';
  const message = missingActorVariables(
    {
      ...qa,
      actors: {
        admin: { account: 'existing', username_env: 'SHOP_ADMIN_USER', password_env: pasted },
      },
    },
    (actor) => missingEnvVars(requiredEnvVars(actor), { SHOP_ADMIN_USER: 'a' }),
  );
  expect(message).toContain('[redacted: not an environment variable name] (admin)');
  expect(message).not.toContain(pasted);
});
