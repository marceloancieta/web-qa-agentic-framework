# 0011 - Security headers in every run, and a ZAP baseline lane for local packs only

**Status:** Accepted (2026-11-03)

## Context

The security cases of v0.1 check what a page shows: password fields, generic errors, protected
routes, nothing sensitive in the URL or in storage. What the server sends with each page is not
checked: the policies that limit scripts and framing, the transport policy, the cookies' attributes.
A missing header is invisible on screen and easy to lose in a release.

The two packs differ in a way that matters here. Juice Shop is insecure on purpose and runs in a
container on the machine, so most of its findings are known and deliberate. SauceDemo is a public
site that other people use; a scanner that crawls and probes it is not a test the framework may
run, even when the scan only reads.

A scanner such as OWASP ZAP finds more than a fixed list of headers (cross-origin policies, cookie
scope, information in comments), but it crawls, so it takes minutes and touches every page it can
reach.

## Decision

- **Headers in every run, against a baseline.** The core fixtures record the responses of the
  pack's origin every page receives (`helpers/security-headers.ts`): documents for the header rules
  (Content-Security-Policy, framing, Strict-Transport-Security on https, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) and the Set-Cookie lines of documents and XHR or fetch answers
  for the cookie rules (Secure on https, HttpOnly, SameSite). `securityHeaders.expectNoNewGaps(page)`
  compares them with `apps/<pack>/headers-known.json`, and each pack's sweep in
  `specs/security/headers.spec.ts` opens one route per document of its app maps. The rules are the
  core's; a pack's expectation is those rules minus its known gaps.
- **A known gap is one rule on one route.** An entry names a rule, a route or `*`, a cookie for a
  cookie rule, a tracker key and an expiry, as the accessibility baseline does. It excuses that rule
  only: a known missing policy never hides another header going missing, a weaker value of a header
  is its own finding, and an expired entry fails again. An entry whose subject was checked and passed
  is reported as gone.
- **ZAP in a lane, for local packs only.** `npm run lanes:zap -- --pack <pack>` runs ZAP's baseline
  scan (a spider, then the passive scan) from `zaproxy/zap-stable` pinned by digest in
  `docker/compose.yml`. The target is the pack's base URL; the lane refuses, before Docker starts,
  any host that is not a loopback address or an application of `docker/compose.yml`. There is no
  option to name another target.
- **Known alerts with a reason.** The lane judges the alerts itself rather than through ZAP's rule
  file: `apps/<pack>/zap-known.json` lists each accepted alert by plugin id, with a tracker key, an
  expiry and the reason it is accepted. A new alert of risk Low or above fails the lane;
  Informational alerts are listed only.
- **In CI on every change.** The scan takes about two minutes, less than a shard of the suite, so it
  is a job of its own beside the shards, with its own Juice Shop, and the required check waits for
  it. It writes no Playwright report, so the quality gate does not read it; its exit code is its
  verdict.

## Consequences

- A header the server stops sending fails the next run of the pack, on every device project, with
  the rule and the route in the message.
- An entry covers every instance of its ZAP alert: a new page with an alert of a known kind does not
  fail. The lane prints the count of instances, and the alert's first address, beside each one.
- The spider opens what `robots.txt` lists, and in Juice Shop that can solve challenges, which the
  shop announces on the pages open at the time. Locally the lane runs after the lanes that open pages, or
  against a Juice Shop of its own; in CI it has one.
- A CSP set in a `<meta>` element and a cookie written by a page script are not seen by the header
  check; the ZAP scan and the security cases cover what it cannot.
- A new pack gets a headers sweep from `scaffold-app`; a public pack is never scanned by ZAP.
