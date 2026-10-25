# Intake request

What to send when you ask for a feature of a web application to be tested. The `qa-intake` skill
turns it into a [feature contract](feature-contract.md). The app map already gives the structure
(routes, forms and their constraints, the accessibility tree, the calls each page makes), so a
request can be short: fill in the required sections and intake asks about the rest. Copy the
sections below into an issue, a story or a message.

---

## Application and routes _(required)_

The pack (`juice-shop`) and the routes the feature lives on, as the address bar shows them after the
host: `/#/login`, `/#/register`. Name the user goal the routes serve. Do not choose a case code;
intake agrees one with you.

## Purpose _(required)_

A sentence or two, as behaviour someone can watch happen:
`As <a role>, I <do something on the page> so that <outcome>.`

## Business rules _(required)_

A numbered list of rules a test can check, one per line. The contract gives each one an id, and the
cases trace back to it.

1. A wrong password shows the same message whether the email exists or not.
2. The submit button stays disabled until both fields have a value.

## Acceptance criteria _(required)_

One scenario per bullet, as given, when, then:

- **Given** a registered account, **when** its owner signs in with the right password, **then** the
  account menu shows their email.

## Roles and entry state

Who uses the feature (anonymous, customer, administrator) and the state they start from: signed in
or not, an empty or a full basket, a first visit or a returning one.

## States

What the page shows while loading, with no data, after an error and after success.
Say which of these you have seen and which you expect.

## Devices

Whether the feature behaves differently on a mobile device, a tablet or a desktop: a menu that
becomes a hamburger, a table that becomes cards, an action that only exists on one of them.

## Quality expectations

Anything specific about the seven quality dimensions (responsiveness, perceived performance, security
in the UI, layout, navigation and interaction, accessibility, content handling): a WCAG level, a
loading budget, a field that must never appear in the URL. Intake asks about each dimension anyway.

## Manual exploration notes

Notes from someone who used the feature by hand are welcome: what they did, what they saw, what
surprised them, with the date, the device and the browser. Screenshots help. Intake treats the notes
as a source like any other and checks each one against the live application before it enters the
contract. Leave out passwords, real names and real addresses.

## Links

The story or issue (Jira, GitHub, a local key), designs, earlier defects of the feature.

## Out of scope

What should not be tested this time, and why.
