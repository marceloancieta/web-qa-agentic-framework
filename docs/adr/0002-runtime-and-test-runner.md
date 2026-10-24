# 0002 - Node and TypeScript only, with Playwright Test

**Status:** Accepted (2026-10-24)

## Context

UI test frameworks tend to collect runtimes: TypeScript for the tests, Python or PowerShell for
hooks, reporting and tracker scripts. Each one is another toolchain for every contributor and CI
agent, and some do not run everywhere (Windows PowerShell scripts on a Linux agent). The test runner
choice also decides what the framework can do in the browser: engines, mobile emulation, network
interception, HTTP calls for state, traces.

## Decision

- **Node (>= 22) is the only runtime.** Hooks and scripts are Node ES modules tested with the
  built-in `node:test` runner. Docker is the only other dependency, for the local applications under
  test and the pinned browser image of the visual lane.
- **Playwright Test with TypeScript** runs the suites. It covers Chromium, Firefox and WebKit
  natively, emulates devices through projects, prepares state with `APIRequestContext` in the same
  runner, intercepts the network with `page.route`, shards without a paid service and records a
  trace per step. The comparison with Cypress and WebdriverIO is in
  [architecture section 1.1](../architecture.md#11-tool-playwright-with-typescript).
- Native mobile apps are out of scope; WebdriverIO with Appium would be the tool for them.

## Consequences

- One toolchain on Windows, macOS, Linux and CI.
- The sibling API framework uses the same stack, so fixtures, lanes, adapters and linters can be
  shared and, later, extracted into a common core.
