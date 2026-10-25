# Reachability: stop when a system does not answer

The application under test, the test-management tool and the tracker are separate systems. Any of
them can be stopped, behind a VPN or misconfigured, and data missing from one is never filled in
from another.

- **Check before a phase calls a system.** The session probe reports, for each pack the active
  environment configures, whether its base URL and its login page answer. `npm test` checks again in
  each pack's `preflight-<pack>` project, and `npm run app:map` fails when a route does not load.
- **A local pack that is down is started, not worked around.** Juice Shop runs in Docker:
  `npm run juice-shop:up` starts the container and waits until it is healthy. If Docker itself is not
  running, say so and wait for the user.
- **Stop on a connection failure**: a refused connection, a timeout, a DNS or TLS error, a page that
  never loads. Name the system that did not answer and what to check (`QA_ENV`, the pack's entry
  under `app.environments.<env>.packs` in qa-config, the container, the VPN), then wait. Do not
  retry in a loop.
- **Do not substitute.** If the application cannot be reached, do not design from a story or an old
  screenshot instead; use the tracked app map (`apps/<pack>/docs/app-map.json`) and say that it is a
  tracked copy, with its date, or stop. If the tracker cannot be read, do not assume an issue's state.
- **An error page is not a reachability problem.** A `401`, a `404`, a `500` or an error message on
  the screen is an answer from the application. Read it as one, and check the account, the route and
  the data before suspecting the network.
- **Credentials come from the environment or the local `.env` file.** Name the missing variable;
  never print a value. `missingVariableMessage` in `scripts/lib/env-names.mjs` builds that message,
  and the preflight project names a missing actor variable before any case starts.
