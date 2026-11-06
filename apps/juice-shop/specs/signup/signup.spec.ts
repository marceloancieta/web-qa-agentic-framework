// Sign-up (registry/signup.md): the registration form at /#/register, for a visitor. The page starts
// signed out. Cases that register create accounts of their own from the builder; Juice Shop cannot
// remove them, and they go with the next container restart. Passwords come from
// `generatedPassword()`, so the run knows them and removes them from its artifacts; the boundary
// lengths are cut from or joined out of generated ones and never register an account.

import type { Locator } from '@playwright/test';
import { generatedPassword } from '../../../../helpers/actors';
import { knownGap } from '../../../../helpers/case-meta';
import { focusChangesRendering, tabUntil } from '../../../../helpers/keyboard';
import { animationsFinished, horizontalOverflow } from '../../../../helpers/layout';
import { storedText } from '../../../../helpers/storage';
import { loadDecisionTable } from '../../../../scripts/lib/decision-table.mjs';
import { AccountApi } from '../../api/account-api';
import { aCustomer, aMarkupEmail, securityAnswer } from '../../builders/account-builder';
import { longTerm } from '../../builders/search-terms';
import { expect, test } from '../../fixtures';
import { registerThroughForm, signInThroughForm } from '../../flows/shopping';
import { SECURITY_QUESTIONS, securityQuestionsFail } from '../../mocks/account-mocks';
import { RegisterPage } from '../../pages/register-page';

const worker = () => test.info().workerIndex;
// The shop answers a registration only after two writes in a row (the account, then its security
// answer); beside other workers each took 2.4 s, so the move to /#/login came after the 5 s an
// assertion waits by default.
const AFTER_REGISTERING = { timeout: 15_000 };

/** Each field with the message it shows when left empty. */
const emptyFieldMessages = (register: RegisterPage): [Locator, string][] => [
  [register.email(), 'Please provide an email address.'],
  [register.password(), 'Please provide a password.'],
  [register.repeat(), 'Please repeat your password.'],
  [register.question(), 'Please select a security question.'],
  [register.answer(), 'Please provide an answer to your security question.'],
];

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

test('TC-SIGNUP-02 an email left empty says "Please provide an email address." and a malformed one "Email address is not valid." @regression', async ({
  page,
}) => {
  const malformed = aCustomer('signup-email', worker()).username.replace('@', '');
  const register = new RegisterPage(page);
  const empty = register.fieldError('Please provide an email address.');
  const invalid = register.fieldError('Email address is not valid.');
  await register.open();
  await expect(empty).toHaveCount(0);

  await test.step('left empty: the message for the missing address', async () => {
    await register.email().focus();
    await register.leaveFields();
    await expect(empty).toBeVisible();
    await expect(invalid).toHaveCount(0);
  });

  await test.step('malformed: the message for the wrong address', async () => {
    await register.email().fill(malformed);
    await register.leaveFields();
    await expect(invalid).toBeVisible();
    await expect(empty).toHaveCount(0);
  });
});

test('TC-SIGNUP-04 a 41st character typed into the password is not taken: the field keeps 40 @regression @content', async ({
  page,
}) => {
  const typed = `${generatedPassword()}${generatedPassword()}`.slice(0, 41);
  const register = new RegisterPage(page);
  await register.open();
  // Typed key by key, as a person does: the limit applies to keys, and `fill` sets the value whole.
  await register.password().pressSequentially(typed);
  await expect(register.password()).toHaveValue(typed.slice(0, 40));
});

test('TC-SIGNUP-05 a repeated password that differs says "Passwords do not match"; once equal, the message goes @regression', async ({
  page,
}) => {
  const password = generatedPassword();
  const register = new RegisterPage(page);
  const differs = register.fieldError('Passwords do not match');
  await register.open();
  await register.password().fill(password);

  await register.repeat().fill(generatedPassword());
  await register.leaveFields();
  await expect(differs).toBeVisible();

  await register.repeat().fill(password);
  await register.leaveFields();
  await expect(differs).toHaveCount(0);
});

test('TC-SIGNUP-06 the question list offers the questions of the application; leaving it or the answer empty shows their messages @regression', async ({
  page,
}) => {
  const register = new RegisterPage(page);
  const noQuestion = register.fieldError('Please select a security question.');
  const noAnswer = register.fieldError('Please provide an answer to your security question.');
  await register.open();

  await test.step('left empty: each field says what is missing', async () => {
    await register.question().focus();
    await register.leaveFields();
    await expect(noQuestion).toBeVisible();
    await expect(noAnswer).toHaveCount(0);
    await register.answer().focus();
    await register.leaveFields();
    await expect(noAnswer).toBeVisible();
  });

  await test.step('the list offers what the application has', async () => {
    const questions = await new AccountApi(page.request).securityQuestions();
    expect(questions.length, 'the application offers questions').toBeGreaterThan(0);
    await register.openQuestions();
    await expect(register.questionOptions()).toHaveText(questions);
  });
});

test('TC-SIGNUP-09 both password fields are masked while typed @regression @security', async ({
  page,
}) => {
  const typed = generatedPassword();
  const register = new RegisterPage(page);
  await register.open();

  for (const field of [register.password(), register.repeat()]) {
    await field.fill(typed);
    await expect(field).toHaveValue(typed);
    await expect(field).toHaveAttribute('type', 'password');
  }
});

test('TC-SIGNUP-11 an email that carries markup is refused or shown back as text, and the page creates no element from it @regression @security', async ({
  page,
}) => {
  const { address, token } = aMarkupEmail(worker());
  const password = generatedPassword();
  const register = new RegisterPage(page);
  await register.open();

  // Every other field is valid, so a disabled Register can only come from the address.
  await register.password().fill(password);
  await register.repeat().fill(password);
  await register.chooseFirstQuestion();
  await register.answer().fill(securityAnswer());
  await register.email().fill(address);
  await register.leaveFields();
  await expect(register.fieldError('Email address is not valid.')).toBeVisible();
  await expect(register.submit()).toBeDisabled();
  await expect(register.injected(token)).toHaveCount(0);
});

test('TC-SIGNUP-12 the form is filled with the keyboard alone, the security question included, the focus visible in reading order @regression @a11y', async ({
  page,
}) => {
  const account = aCustomer('signup-keys', worker());
  const register = new RegisterPage(page);
  // Angular Material draws the focus on the form field, not on the control, and a text field's
  // label moves on focus while it is empty, so each is checked once it holds a value.
  const focusIsVisible = async (control: Locator, name: string) =>
    expect(
      await focusChangesRendering(control, register.formField(control)),
      `focus visible on ${name}`,
    ).toBe(true);
  const tabToAndType = async (control: Locator, name: string, value: string) => {
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    await page.keyboard.type(value);
    await expect(control).toHaveValue(value);
    await focusIsVisible(control, name);
    await control.focus();
  };

  await register.open();
  await expect(register.submit()).toBeDisabled();

  await test.step('Tab from the top of the page to the email', async () => {
    await tabUntil(page, register.email(), 15);
    await expect(register.email()).toBeFocused();
    await page.keyboard.type(account.username);
    await expect(register.email()).toHaveValue(account.username);
    await focusIsVisible(register.email(), 'the email');
    await register.email().focus();
  });

  await test.step('Tab to the two password fields and type', async () => {
    await tabToAndType(register.password(), 'the password', account.password);
    await tabToAndType(register.repeat(), 'the repeated password', account.password);
  });

  await test.step('Tab past the advice switch to the question and choose with the keys', async () => {
    await page.keyboard.press('Tab');
    await expect(register.passwordAdvice()).toBeFocused();
    expect(
      await focusChangesRendering(register.passwordAdvice(), register.passwordAdvice()),
      'focus visible on the advice switch',
    ).toBe(true);
    await page.keyboard.press('Tab');
    await expect(register.question()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(register.questionOptions().first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(register.questionOptions()).toHaveCount(0);
    await expect(register.question()).not.toHaveText(/^\s*$/);
    await expect(register.question()).toBeFocused();
    await focusIsVisible(register.question(), 'the question');
    await register.question().focus();
  });

  await test.step('Tab to the answer, type, and Tab to an enabled Register', async () => {
    await tabToAndType(register.answer(), 'the answer', securityAnswer());
    await page.keyboard.press('Tab');
    await expect(register.submit()).toBeFocused();
    await expect(register.submit()).toBeEnabled();
    expect(
      await focusChangesRendering(register.submit(), register.submit()),
      'focus visible on Register',
    ).toBe(true);
  });
});

test('TC-SIGNUP-13 each field message is tied to its field, and the page has no axe violation beyond the baseline with the messages shown @regression @a11y', async ({
  page,
  a11y,
}) => {
  // Two axe scans and ten fields walked: more than a case about one state.
  test.slow();
  const register = new RegisterPage(page);
  const isTied = async (field: Locator, message: string) => {
    await expect(register.fieldError(message)).toBeVisible();
    await expect(field).toHaveAccessibleDescription(message);
  };
  await register.open();

  await test.step('every field left empty: each message tied, no new violation', async () => {
    await register.leaveEveryFieldEmpty();
    for (const [field, message] of emptyFieldMessages(register)) await isTied(field, message);
    await animationsFinished(page);
    await a11y.expectNoNewViolations(page);
  });

  await test.step('a wrong email and repeat: their messages tied, no new violation', async () => {
    await register.email().fill(aCustomer('signup-tied', worker()).username.replace('@', ''));
    await register.password().fill(generatedPassword());
    await register.repeat().fill(generatedPassword());
    await register.leaveFields();
    await isTied(register.email(), 'Email address is not valid.');
    await isTied(register.repeat(), 'Passwords do not match');
    await animationsFinished(page);
    await a11y.expectNoNewViolations(page);
  });
});

test('TC-SIGNUP-14 "Already a customer?" opens /#/login @regression @navigation', async ({
  page,
}) => {
  const register = new RegisterPage(page);
  await register.open();
  await register.alreadyACustomer().click();
  await expect(page).toHaveURL(/#\/login$/);
});

test('TC-SIGNUP-15 the registration page has no horizontal scroll, empty and with every message shown @regression @responsive', async ({
  page,
}) => {
  const register = new RegisterPage(page);
  // Polled: the shell measures a few pixels wider for a moment while the page settles.
  const settled = (state: string) =>
    expect.poll(() => horizontalOverflow(page), { message: `sideways scroll ${state}` });
  await register.open();
  await expect(register.heading()).toBeVisible();
  await settled('on the empty form').toBe(0);

  await register.leaveEveryFieldEmpty();
  for (const [, message] of emptyFieldMessages(register)) {
    await expect(register.fieldError(message)).toBeVisible();
  }
  await settled('with every message').toBe(0);
});

test('TC-SIGNUP-16 <LONG_TEXT> as the email and as the answer stays inside its field @regression @content', async ({
  page,
}) => {
  const text = longTerm(200);
  const register = new RegisterPage(page);
  // How far the control's right edge passes its form field's; 0 or less while it stays inside.
  const spill = async (control: Locator) => {
    const inner = await control.boundingBox();
    const outer = await register.formField(control).boundingBox();
    if (!inner || !outer) throw new Error('The field is not on the page.');
    return inner.x + inner.width - (outer.x + outer.width);
  };
  await register.open();
  await expect(register.heading()).toBeVisible();

  for (const [name, field] of [
    ['the email', register.email()],
    ['the answer', register.answer()],
  ] as const) {
    await test.step(`${name} stays inside its field`, async () => {
      await field.fill(text);
      await expect(field).toHaveValue(text);
      await expect
        .poll(() => spill(field), { message: `${name} past its field` })
        .toBeLessThanOrEqual(0);
      await expect
        .poll(() => horizontalOverflow(page), { message: `sideways scroll with ${name}` })
        .toBe(0);
    });
  }
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
    await register.openQuestions();
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
