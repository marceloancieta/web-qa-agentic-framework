// The registration form (`/#/register`). Its fields carry descriptive accessible names; the security
// question is a list box that opens its options. Field messages are plain text under each field.

import type { Locator, Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  /**
   * Open the form once its security questions have arrived: a list opened before that stays empty
   * even after they come. With `questions: false` the form opens without waiting, for a case whose
   * questions never arrive.
   */
  async open({ questions = true }: { questions?: boolean } = {}): Promise<void> {
    const arrived = questions
      ? this.page.waitForResponse((r) => r.url().includes('/api/SecurityQuestions'))
      : null;
    await this.page.goto('#/register');
    await arrived;
  }

  heading(): Locator {
    return this.page.getByRole('heading', { name: 'User Registration' });
  }

  email(): Locator {
    return this.page.getByRole('textbox', { name: 'Email address field' });
  }

  password(): Locator {
    return this.page.getByRole('textbox', { name: 'Field for the password' });
  }

  repeat(): Locator {
    return this.page.getByRole('textbox', { name: 'Field to confirm the password' });
  }

  question(): Locator {
    return this.page.getByRole('combobox', { name: 'Selection list for the security question' });
  }

  questionOptions(): Locator {
    return this.page.getByRole('option');
  }

  answer(): Locator {
    return this.page.getByRole('textbox', {
      name: 'Field for the answer to the security question',
    });
  }

  submit(): Locator {
    return this.page.getByRole('button', { name: 'Button to complete the registration' });
  }

  /**
   * A field's error, as opposed to its hint: the password's hint and its error share the text
   * "Password must be 5-40 characters long.", and only the error replaces the hint when the value
   * is refused. The error element has no role, so it is found by its tag.
   */
  fieldError(text: string): Locator {
    return this.page.locator('mat-error').filter({ hasText: text }); // no role tells it from the hint
  }

  /** The form's alert, where a refused registration says why ("email must be unique"). */
  alert(): Locator {
    return this.page.getByRole('main').getByRole('alert');
  }

  /** A field's message, such as "Email address is not valid." or "Passwords do not match". */
  message(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /**
   * The character counters under the two password fields ("<n>/<limit>"), the password's first:
   * they have no name, so the order on the page is what tells them apart.
   */
  passwordCounter(): Locator {
    return this.page.getByText(/^\d+\/\d+$/).first(); // the password field comes before the repeat
  }

  /** The notification after a registration, such as "Registration completed successfully…". */
  notification(text: RegExp): Locator {
    return this.page.getByText(text);
  }

  /**
   * Open the list of security questions as a user does, with a click or a tap. The point is the
   * arrow at the select's right end: on the narrow WebKit layout (mobile-safari) the floating
   * label's required marker covers the middle of the select, and a click there lands on the marker,
   * which Playwright's hit test refuses (a user's tap on it still reaches the form field).
   */
  async openQuestions(): Promise<void> {
    const select = this.question();
    const box = await select.boundingBox();
    if (!box) throw new Error('The security question select is not on the page.');
    await select.click({ position: { x: box.width - 8, y: box.height / 2 } });
  }

  /** Choose the first question of the list; it waits for the list's overlay to close. */
  async chooseFirstQuestion(): Promise<void> {
    await this.openQuestions();
    await this.questionOptions().first().click(); // any question will do; the first is always there
    // The list's overlay takes a moment to close and swallows a click sent while it does.
    await this.page.getByRole('listbox').waitFor({ state: 'hidden' });
  }

  /** Leave the field that has the focus, so the form shows what is missing or wrong. */
  async leaveFields(): Promise<void> {
    await this.heading().click();
  }

  /** Fill the form with the first security question of the list, and send it. */
  async register(email: string, password: string, answer: string): Promise<void> {
    await this.email().fill(email);
    await this.password().fill(password);
    await this.repeat().fill(password);
    await this.chooseFirstQuestion();
    await this.answer().fill(answer);
    await this.submit().click();
  }
}
