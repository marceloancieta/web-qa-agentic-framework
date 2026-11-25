# 0014 - One-time codes and mail come only from channels the test controls

**Status:** Accepted (2026-11-25)

## Context

Some features prove who a person is through a second channel: a code from an authenticator app
(two-factor sign-in), or a link sent by email (a password reset, an invitation, a confirmation). A
UI test has to reach that channel to get past the step, and the easy ways to do so are wrong:

- Reading a real inbox (an IMAP account, a shared address) puts real credentials in the run, makes
  the result depend on a provider's delivery and spam filters, and lets a case read what a person
  was sent.
- Asking the application for the token (a test-only endpoint, a database query, a log line) skips
  the very hand-over the case exists to prove: that the email is sent, to the right address, with a
  link that works.
- Typing a code written into the spec ties the case to one account and one moment, and puts a
  credential-shaped value in the repository.

## Decision

**A case gets a code or a message only from a channel the test itself controls.**

- **Codes are made by the test.** A case that needs a time-based one-time code holds the secret of
  an account it created, as an authenticator app would, and makes the code with
  `helpers/totp.ts` (RFC 6238). It never types a code written in the spec.
- **Mail goes to a catcher the test runs.** An application under test sends every email to a mail
  catcher that delivers nothing onwards, started beside it: Mailpit, pinned by digest in
  `docker/compose.yml`, for the Spree pack. The pack's entry in qa-config names the catcher per
  environment (`mail_catcher`: its provider and the URL of its HTTP API). A pack or an environment
  without a `mail_catcher` has no case that reads mail, and the `mail` fixture fails with the setting
  it needs.
- **Only addresses the case created.** `helpers/mail-catcher.ts` reads only addresses on a domain reserved
  for tests (RFC 2606 and RFC 6761: `.test`, `example.com` and the like). The builders make such an
  address per account, so a case reads the mail of its own account and of no one else.
- **Tokens are secrets of the run.** Every value a link in a read message carries in its query is
  handed to the run's redaction, like a generated password, so a reset or confirmation token does
  not survive in a trace or a report.
- **The case waits for the message, not for a time.** Applications send mail from a background job
  after the request has answered; `mail.waitForMessage` asks the catcher until the message
  arrives or its timeout passes, and its failure names what did arrive.

## Consequences

- A case about a reset, an invitation or a confirmation follows the link a person would follow, so
  a broken link is a failing case, not something the test steps around.
- The catcher is a service of the local stack: `npm run spree:up` and `npm run ci:spree` start it
  with Spree, and its API is published on the loopback address only. A shared or public environment
  with no catcher the test controls cannot run these cases; its qa-config entry leaves `mail_catcher`
  out.
- The catcher keeps its messages in memory and is emptied by a restart; nothing it holds is
  evidence after the run beyond what the case attached.
- Expiry windows that the server measures (a link valid for 15 minutes) cannot be tested by moving
  the browser's clock; such a rule is out of scope unless the environment can shorten it.
