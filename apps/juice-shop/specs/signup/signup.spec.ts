// Sign-up (registry/signup.md): the registration form at /#/register, for a visitor. The page starts
// signed out. Cases that register create accounts of their own from the builder; Juice Shop cannot
// remove them, and they go with the next container restart. Passwords come from
// `generatedPassword()`, so the run knows them and removes them from its artifacts; the boundary
// lengths are cut from or joined out of generated ones and never register an account.

import { generatedPassword } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { storedText } from '../../../../helpers/storage';
import { loadDecisionTable } from '../../../../scripts/lib/decision-table.mjs';
import { AccountApi } from '../../api/account-api';
import { aCustomer, securityAnswer } from '../../builders/account-builder';
import { expect, test } from '../../fixtures';
import { registerThroughForm, signInThroughForm } from '../../flows/shopping';
import { SECURITY_QUESTIONS, securityQuestionsFail } from '../../mocks/account-mocks';
import { RegisterPage } from '../../pages/register-page';

const worker = () => test.info().workerIndex;
// The shop answers a registration only after two writes in a row (the account, then its security
// answer); beside other workers each took 2.4 s, so the move to /#/login came after the 5 s an
// assertion waits by default.
const AFTER_REGISTERING = { timeout: 15_000 };

test('TC-SIGNUP-01 Register is enabled only when every field is valid, walking every combination of rules/TC-SIGNUP-01.yaml @regression @navigation', async ({
  page,
}) => {
  // 48 combinations on one form, four fields refilled at each step: five times a case's time (a
  // run beside other workers took 72 s, close to the 90 s of test.slow()).
  test.setTimeout(test.info().timeout * 5);
  const steps = loadDecisionTable('apps/juice-shop/rules/TC-SIGNUP-01.yaml');
  const valid = aCustomer('signup-table', worker()).username;
  const password = generatedPassword();
  const other = generatedPassword();
  const emails: Record<string, string> = {
    empty: '',
    malformed: valid.replace('@', ''),
    valid,
  };
  const passwords: Record<string, string> = {
    too_short: password.slice(0, 4),
    in_range: password.slice(0, 5),
  };
  const answer = securityAnswer();
  const register = new RegisterPage(page);

  // A chosen question cannot be taken back, so the combinations without one come first, on a form
  // where the question was never chosen; then the question is chosen once for the rest.
  const ordered = [
    ...steps.filter((step) => step.when.question === 'none'),
    ...steps.filter((step) => step.when.question === 'chosen'),
  ];
  expect(ordered).toHaveLength(steps.length);
  let chosen = false;
  await register.open();

  for (const { when, then } of ordered) {
    const name = Object.entries(when)
      .map(([condition, value]) => `${condition}=${value}`)
      .join(', ');
    await test.step(`${name}: Register ${then.register}`, async () => {
      if (when.question === 'chosen' && !chosen) {
        await register.chooseFirstQuestion();
        chosen = true;
      }
      const typed = passwords[when.password ?? ''] ?? '';
      await register.email().fill(emails[when.email ?? ''] ?? '');
      // The repeat is checked against the password when it changes, so it is filled after it.
      await register.password().fill(typed);
      await register.repeat().fill(when.repeat === 'same' ? typed : other);
      await register.answer().fill(when.answer === 'given' ? answer : '');
      if (then.register === 'enabled') await expect(register.submit()).toBeEnabled();
      else await expect(register.submit()).toBeDisabled();
    });
  }
});

test('TC-SIGNUP-03 a password of 4 characters shows "Password must be 5-40 characters long."; 5 and 40 characters are accepted @regression @content', async ({
  page,
}) => {
  const account = aCustomer('signup-length', worker());
  const base = generatedPassword();
  const lengths = {
    4: base.slice(0, 4),
    5: base.slice(0, 5),
    40: `${base}${generatedPassword()}`.slice(0, 40),
  };
  const register = new RegisterPage(page);
  // The error, not the hint with the same text that is always on screen.
  const lengthError = register.fieldError('Password must be 5-40 characters long.');
  await register.open();
  await register.email().fill(account.username);
  await register.chooseFirstQuestion();
  await register.answer().fill(securityAnswer());

  const typePassword = async (value: string) => {
    await register.password().fill(value);
    await register.repeat().fill(value);
    await register.leaveFields();
  };

  await test.step('a password of 4 characters is refused with the length message', async () => {
    await typePassword(lengths[4]);
    await expect(register.password()).toHaveValue(lengths[4]);
    await expect(lengthError).toBeVisible();
    await expect(register.password()).toHaveAccessibleDescription(
      'Password must be 5-40 characters long.',
    );
    await expect(register.password()).toHaveAttribute('aria-invalid', 'true');
    await expect(register.submit()).toBeDisabled();
  });

  for (const length of [5, 40] as const) {
    await test.step(`a password of ${length} characters is accepted`, async () => {
      await typePassword(lengths[length]);
      await expect(register.password()).toHaveValue(lengths[length]);
      await expect(register.password()).toHaveAttribute('aria-invalid', 'false');
      await expect(lengthError).toBeHidden();
      await expect(register.submit()).toBeEnabled();
    });
  }
});

test('TC-SIGNUP-07 a visitor registers <EMAIL> through the form, and the new account signs in with that email and password @smoke', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const guest = await actor('anonymous');
  const account = aCustomer('signup-new', worker());
  const register = new RegisterPage(page);

  await test.step('register through the form', async () => {
    await registerThroughForm(page, account, securityAnswer());
    await expect(page).toHaveURL(/#\/login$/, AFTER_REGISTERING);
    await expect(register.notification(/Registration completed successfully/)).toBeVisible();
  });

  await test.step('sign in through the login form with the new account', async () => {
    await signInThroughForm(page, account);
    await expect(page).toHaveURL(/#\/search$/);
  });

  await test.step('sign the new account in through the API', async () => {
    const { token } = await new AccountApi(guest.api).login(account);
    expect(await new AccountApi(guest.api).whoami(token)).toBe(account.username);
  });
});

test('TC-SIGNUP-08 registering <EMAIL> a second time is refused with a message, and the second password does not sign in @regression', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const guest = await actor('anonymous');
  const accounts = new AccountApi(guest.api);
  const first = aCustomer('signup-twice', worker());
  await accounts.register(first);
  const second = { ...first, password: generatedPassword() };
  const register = new RegisterPage(page);

  await test.step('register the same email again through the form', async () => {
    await register.open();
    await register.register(second.username, second.password, securityAnswer());
    await expect(register.alert()).toContainText(/must be unique/, AFTER_REGISTERING);
    await expect(page).toHaveURL(/#\/register$/);
  });

  await test.step('the second password does not sign in; the first still does', async () => {
    await expect(accounts.login(second)).rejects.toThrow(/refused the login/);
    const { token } = await accounts.login(first);
    expect(await accounts.whoami(token)).toBe(first.username);
  });
});

test('TC-SIGNUP-10 nothing typed into the form appears in the URL or in browser storage, before or after registering @regression @security', async ({
  page,
  actor,
  qa,
}) => {
  test.skip(!qa.allowWrites, 'the case registers an account; allow_writes is false');
  const guest = await actor('anonymous');
  const account = aCustomer('signup-storage', worker());
  const answer = securityAnswer();
  const typed = [account.username, account.password, answer];
  const register = new RegisterPage(page);

  const expectNowhere = async () => {
    const url = page.url();
    const stored = await storedText(page);
    for (const value of typed) {
      expect(url).not.toContain(value);
      expect(url).not.toContain(encodeURIComponent(value));
      expect(stored).not.toContain(value);
      // Cookies usually hold their values URL-encoded.
      expect(stored).not.toContain(encodeURIComponent(value));
    }
  };

  await register.open();
  await register.email().fill(account.username);
  await register.password().fill(account.password);
  await register.repeat().fill(account.password);
  await register.chooseFirstQuestion();
  await register.answer().fill(answer);
  await expect(register.submit()).toBeEnabled();

  await test.step('before registering', expectNowhere);

  await register.submit().click();
  await expect(page).toHaveURL(/#\/login$/, AFTER_REGISTERING);
  // A settled page: storage written while the login page starts is read too.
  await expect(register.notification(/Registration completed successfully/)).toBeVisible();
  await test.step('after registering', expectNowhere);

  await test.step('the account exists', async () => {
    const { token } = await new AccountApi(guest.api).login(account);
    expect(await new AccountApi(guest.api).whoami(token)).toBe(account.username);
  });
});

test.describe('security questions that fail to load', () => {
  // The 500 is the mocked answer the case is about; the guard keeps watching everything else.
  test.use({ pageHealth: { allowRequests: [SECURITY_QUESTIONS] } });

  test('TC-SIGNUP-17 when the security questions fail to load, the list is empty and Register stays disabled @regression @mocked', async ({
    page,
  }) => {
    const account = aCustomer('signup-noquestions', worker());
    const register = new RegisterPage(page);
    await securityQuestionsFail(page);
    const failed = page.waitForResponse((r) => SECURITY_QUESTIONS.test(new URL(r.url()).pathname));
    await register.open({ questions: false });
    expect((await failed).status()).toBe(500);

    await register.email().fill(account.username);
    await register.password().fill(account.password);
    await register.repeat().fill(account.password);
    await register.answer().fill(securityAnswer());
    await register.question().click();
    await expect(register.questionOptions()).toHaveCount(0);
    await expect(register.submit()).toBeDisabled();
  });
});

test("TC-SIGNUP-19 the counter under the password field shows the field's limit, /40 @regression @content @known-gap", async ({
  page,
}) => {
  const register = new RegisterPage(page);
  await register.open();
  await expect(register.password()).toHaveAttribute('maxlength', '40');
  test.fail(
    true,
    await knownGap('LOCAL-4', 'the password counter reads /20 while the field takes 40'),
  );
  await expect(register.passwordCounter()).toHaveText('0/40');
});
