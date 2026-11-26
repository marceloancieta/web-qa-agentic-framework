// The password reset as a staff member does it: ask on the forgot page, then take the link from the
// email the mail catcher received (ADR 0014). Shared by the reset specs. A flow acts and returns
// what the case needs next; whether each step worked is for the spec to assert.

import type { Page } from '@playwright/test';
import { linkMatching, type MailCatcher } from '../../../helpers/mail-catcher';
import { ForgotPasswordPage } from '../pages/forgot-password-page';

/** The subject of a reset email: the store's name, then this (REQ-PWRESET-03). */
export const RESET_SUBJECT = /Password Reset Instructions$/;

/** The reset link in a reset email; the email's other link is the store's own address. */
export const RESET_LINK = /\/reset-password\?token=/;

/** The ids of the reset emails `email` has received so far. */
export async function resetEmailsTo(mail: MailCatcher, email: string): Promise<string[]> {
  return (await mail.messagesTo(email))
    .filter((message) => RESET_SUBJECT.test(message.subject))
    .map((message) => message.id);
}

/**
 * Ask for a reset of `email` on the forgot page, wait for the confirmation, then for a reset email
 * that was not there before, and return its reset link as the email gives it.
 */
export async function requestResetLink(
  page: Page,
  mail: MailCatcher,
  email: string,
): Promise<string> {
  const before = await resetEmailsTo(mail, email);
  const forgot = new ForgotPasswordPage(page);
  await forgot.open();
  await forgot.requestSent(email);
  await forgot.confirmation().waitFor();
  const message = await mail.waitForMessage(email, { subject: RESET_SUBJECT, except: before });
  return linkMatching(message, RESET_LINK);
}
