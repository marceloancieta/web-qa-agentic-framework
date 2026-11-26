# Admin design system and reduced motion contract

| | |
|---|---|
| Pack and version | `spree` `6.0.3` |
| Feature code | `DESIGN` (case ids `TC-DESIGN-NN`) |
| Routes | `/dashboard/login`<br>`/dashboard/forgot-password`<br>`/dashboard/<store id>`<br>`/dashboard/<store id>/orders` |
| Sources | no story or issue: intake from the application itself (FUT-05). The dashboard's stylesheet (its custom properties on `:root`, the Tailwind utilities its components use and its `prefers-reduced-motion` rules), the computed styles of the components, and the transitions and animations of each page with and without the preference, read through throwaway read-only scripts signed in as `admin` (2026-11-25; desktop Chromium at 1280 × 800, Pixel 7, iPhone 14, iPad Pro 11 and Galaxy Tab S4); REQ-DESIGN-01 to REQ-DESIGN-07 and the sign-in's motion read again with `helpers/design-tokens.ts` and `helpers/motion.ts` on the sign-in page, on the eight device projects of the local and ci environments, through a throwaway spec deleted after it ran (2026-11-25); the app map (`docs/app-map.json`, `docs/app-map.admin.json`) |
| Intake date | 2026-11-25; REQ-DESIGN-02 corrected and REQ-DESIGN-11 added the same day, after automate found that `/dashboard/orders`, measured at intake, is not a route and opens the dashboard's home |

## Purpose

As a member of the store's staff, I see every page of the dashboard drawn with one design system,
and when I ask my device for less motion the dashboard stops moving things, so that the interface
is consistent and does not make me unwell.

## Business rules

The tokens are in [`../../design-tokens.json`](../../design-tokens.json), written from the
variables the stylesheet declares (each token's `$description` names its variable or utility).
"Drawn with" means the computed style equals the token as the browser renders it
(`helpers/design-tokens.ts`, ADR 0015).

| ID | Rule | Source |
|---|---|---|
| REQ-DESIGN-01 | The page of the sign-in, the forgot-password page and the dashboard are drawn on `color.background` with text in `color.foreground`, `font.family.sans` and `font.size.base`. | stylesheet (`body { background-color: var(--background); color: var(--foreground); font-size: .875rem }`); computed styles, 2026-11-25 |
| REQ-DESIGN-02 | The heading of the sign-in, of the forgot-password page and of the dashboard's home is drawn in `color.foreground`, `font.family.sans`, `font.size.2xl` and `font.weight.bold`. | stylesheet (`.text-2xl`, `.font-bold`); computed styles on the three routes at 1280 px and 412 px, 2026-11-25 |
| REQ-DESIGN-03 | The primary button ("Sign in", "Send reset link") is drawn with `color.primary` behind `color.primary-foreground` text, `radius.lg`, `font.family.sans`, `font.size.sm` and `font.weight.medium`. | stylesheet (`.bg-primary`, `.text-primary-foreground`, `.rounded-lg`, `.text-sm`, `.font-medium`); computed styles, 2026-11-25 |
| REQ-DESIGN-04 | The Email field of the sign-in and of the forgot-password page, at rest, is drawn on `color.card` with `color.foreground` text, a `color.border` border, `radius.md`, `font.size.base` and `font.weight.normal`; its label in `color.foreground`, `font.size.sm` and `font.weight.medium`. | stylesheet (`.bg-card`, `.text-foreground`, `.border-border`, `.rounded-md`, `.text-base`, `.font-normal`; the label's `.text-sm .font-medium`); computed styles, 2026-11-25 |
| REQ-DESIGN-05 | With the focus, the Email field's border turns `color.ring`. | stylesheet (`--ring: var(--brand-blue)`); computed style with the focus, 2026-11-25 |
| REQ-DESIGN-06 | On a touch screen (a coarse pointer: the `tablet`, `mobile-chrome` and `mobile-safari` projects) the Email field's text is `font.size.touch-control`; with a mouse it is `font.size.base`. The primary button keeps `font.size.sm` on both. | stylesheet (`@media (pointer: coarse) { input… { font-size: max(1rem, var(--text-base)) } }`); 16 px on Pixel 7, iPhone 14, iPad Pro 11 and Galaxy Tab S4, 14 px on desktop Chromium, 2026-11-25 |
| REQ-DESIGN-07 | The links "Forgot password?" (sign-in) and "Back to sign in" (forgot-password) are drawn in `color.link` and `font.size.sm`; under the pointer they turn `color.link-hover` and are underlined. | stylesheet (`.link`, `.link:hover`); computed styles at rest and hovered, 2026-11-25 |
| REQ-DESIGN-08 | Without a motion preference, the dashboard moves things: its buttons transition `transform`, `translate` and `scale` over 0.1 s, the desktop sidebar transitions its `width` over 0.2 s, and the user menu opens with `opacity`, `transform`, `translate` and `scale` transitions of 0.1 s. | computed transitions on `/dashboard` and `/dashboard/orders`, and on the open user menu, 2026-11-25 |
| REQ-DESIGN-09 | With `prefers-reduced-motion: reduce`, no element of the sign-in, the forgot-password page, the dashboard's home or the orders page declares a transition on a property that moves or resizes, and the user menu opens with an `opacity` transition of 0.1 s only. | stylesheet (`@media (prefers-reduced-motion: reduce) { *, ::before, ::after { transition-property: color, background-color, border-color, box-shadow, opacity, fill, stroke; transition-duration: .1s; … } }`); computed transitions, 2026-11-25 |
| REQ-DESIGN-10 | With `prefers-reduced-motion: reduce`, no animation that moves anything runs on the dashboard's home or the orders page, and the loading pulses that run without the preference stop. | stylesheet (the same rule: `animation-duration: .01ms; animation-iteration-count: 1`); running animations with and without the preference, 2026-11-25 (without it: `pulse` on the loading placeholders; with it: none but `scroll-fade-reveal`, which animates custom properties only) |
| REQ-DESIGN-11 | The heading of a section of the dashboard (Orders) is drawn in `color.foreground`, `font.family.sans` and `font.weight.semibold`, at `font.size.2xl` from 640 px wide (`breakpoints.section_heading` in `app.json`) and at `font.size.xl` below. | stylesheet (`.font-semibold`, `.text-xl`, `sm:text-2xl`); computed styles on `/dashboard/<store id>/orders` and `/products` at 1280 px (600, 24 px) and 412 px (600, 20 px), 2026-11-25 |

## Acceptance criteria

- **Given** the sign-in page, **when** it has loaded, **then** its body, heading, Email field, label,
  "Sign in" and "Forgot password?" are drawn with their tokens (REQ-DESIGN-01 to REQ-DESIGN-04,
  REQ-DESIGN-07).
- **Given** a touch screen, **when** the sign-in page loads, **then** Email's text is 1rem
  (REQ-DESIGN-06).
- **Given** a device that asks for less motion, **when** the dashboard loads and the user menu opens,
  **then** nothing moves or resizes, and the menu only fades in (REQ-DESIGN-09, REQ-DESIGN-10);
  **given** no preference, the same pages do move (REQ-DESIGN-08).

## Roles and entry state

- `anonymous` for the sign-in and the forgot-password page: a fresh context.
- `admin` for the dashboard's home and the orders page, signed in by its actor fixture. Nothing is written:
  the cases read styles, hover, focus and open the user menu.
- The motion preference is set per context (`reducedMotion`: `reduce` or `no-preference`).

## Elements

- `/dashboard/login`: `heading "Welcome back"` (level 1), `textbox "Email"` and its label,
  `button "Sign in"`, `link "Forgot password?"`.
- `/dashboard/forgot-password`: `heading "Reset your password"` (level 1), `textbox "Email"`,
  `button "Send reset link"`, `link "Back to sign in"`.
- `/dashboard` (moves to `/dashboard/<store id>`) and `/dashboard/<store id>/orders`: the level-1 heading,
  `button "User menu"`, which opens a `menu` with "Edit Profile", "Documentation", "Community",
  "Contact Support", "Log out" and a "Theme" and "Language" preference.

## Validations

None: the cases submit nothing.

## States

- Hover and focus of the controls (REQ-DESIGN-05, REQ-DESIGN-07): reached with the pointer and the
  focus, no data. Both pages put the focus on Email when they load (REQ-LOGIN-10, REQ-PWRESET-01),
  so Email is at rest (REQ-DESIGN-04) only once the focus has left it.
- The open user menu (REQ-DESIGN-08, REQ-DESIGN-09): reached by pressing "User menu"; Escape closes
  it.
- The loading placeholders of the dashboard (REQ-DESIGN-10) pulse while its reports load
  (`POST /api/v3/admin/reporting/query`). A real answer ends them in a moment, so a case holds that
  answer back with a mock to read them (`@mocked`), and reads the other rules on the real page.

## Navigation

Not part of this feature: the routes are reached by their URL, as LOGIN, PWRESET and ROLES cover
how they link to each other.

## Responsive differences

- A section's heading is `font.size.xl` below 640 px and `font.size.2xl` from 640 px
  (REQ-DESIGN-11), the `sm` step of the stylesheet, recorded as `breakpoints.section_heading`; the
  `tablet` project (810 px) is above it, the mobile projects below.
- A coarse pointer raises the text of form controls to 1rem (REQ-DESIGN-06); the device projects
  `tablet`, `mobile-chrome` and `mobile-safari` have one, the desktop projects do not.
- Below 768 px (`breakpoints.sidebar`) the sidebar is a sheet that slides in (`left`, `right` and
  `width` transitions of 0.2 s); the width transition of REQ-DESIGN-08 belongs to the desktop
  sidebar.

## Network dependencies

Only REQ-DESIGN-10 depends on one: the dashboard's placeholders pulse until
`POST /api/v3/admin/reporting/query` answers. The read-only scripts blocked that request (it is a
write in form), so the placeholders kept pulsing for the whole look; with the real answer they stop
once the reports arrive. The rule's second half also needs a case that reads the page with the real
answer, so it is not covered by the mock alone.

## Quality dimensions

| Dimension | Applies? | Expected, or why not |
|---|---|---|
| responsive | applies | form controls at 1rem on a coarse pointer, `font.size.base` with a mouse (REQ-DESIGN-06) |
| perf | applies | perceived performance: what moves with and without `prefers-reduced-motion` (REQ-DESIGN-08 to REQ-DESIGN-10), as architecture section 6b places it |
| security | n/a: the cases read styles of pages whose security cases are LOGIN's and PWRESET's; nothing is typed or stored |
| layout | applies | the components are drawn with the design system's tokens (REQ-DESIGN-01 to REQ-DESIGN-07) |
| navigation | applies | the focused and hovered states of the field and the links (REQ-DESIGN-05, REQ-DESIGN-07) |
| a11y | applies | WCAG 2.3.3: with reduced motion nothing moves (REQ-DESIGN-09, REQ-DESIGN-10); the focus colour (REQ-DESIGN-05) |
| content | n/a: no user text on these components; long texts in the fields are LOGIN's and PWRESET's |

## Measurements

All on `<base_url>`, 2026-11-25.

| Component | Device | Computed |
|---|---|---|
| body, `/dashboard/login` | desktop Chromium | background `oklch(0.985 0.001 106.423)`, text `oklch(0.147 0.004 49.25)`, Geist Variable, 14 px |
| heading of the sign-in, the forgot-password page and the home | desktop Chromium, 412 px | `oklch(0.147 0.004 49.25)`, 24 px, 700 |
| heading of Orders and Products | desktop Chromium at 1280 px / 412 px | `oklch(0.147 0.004 49.25)`, 600, 24 px / 20 px |
| "Sign in", "Send reset link" | desktop Chromium | background `oklch(0.147 0.004 49.25)`, text `oklch(1 0 0)`, radius 10 px, 13 px, 500 |
| Email at rest / focused | desktop Chromium | background `oklch(1 0 0)`, border `oklch(0.923 0.003 48.717)` / `oklch(0.5967 0.2212 258)`, radius 8 px, 14 px, 400 |
| Email | Pixel 7, iPhone 14, iPad Pro 11, Galaxy Tab S4 | 16 px (the button 13 px) |
| "Forgot password?" at rest / hovered | desktop Chromium | `oklch(0.5106 0.1868 257.7)` / `oklch(0.44 0.16 257.7)`, underlined when hovered |
| transitions that move, no preference | desktop Chromium | 1 on the sign-in and the forgot-password page (the button), 13 on `/dashboard/<store id>`; the open user menu: `opacity, transform, translate, scale` 0.1 s |
| transitions that move, `reduce` | desktop Chromium | 0 on the four routes; the open user menu: `opacity` among colour properties only |
| running animations | desktop Chromium | no preference: `pulse` on the placeholders (their reports' request blocked by the script) and `scroll-fade-reveal-t/b`; `reduce`: `scroll-fade-reveal-t/b` only |

## Gaps and discrepancies

None found: every component read matched the design system's variables, and every transition and
animation that moves stops with the preference.

## Out of scope

- **The dark theme.** The stylesheet has a `.dark` theme and the user menu a "Theme" preference;
  switching it changes the member's preference, and the light theme is the one every case starts
  in. A later intake can add the dark tokens.
- **The rest of the dashboard's components** (tables, badges, status colours, charts, the
  sidebar's links): the rules hold the components every page shares; more join as features of
  those pages are taken in.
- **The loading spinner** (`.animate-spin`) keeps turning with the preference, as the stylesheet
  allows: motion that is essential to the meaning (WCAG 2.3.3). No page reached in the read-only
  look showed it.
- **Smoothness of an animation**: not measurable reliably in a test browser (ADR 0015).

## Assumptions to confirm

- **A1.** The variables the stylesheet declares are the design system's intent: there is no
  separate design specification, so a change to a variable reads as a change of the design, and
  `design-tokens.json` changes with it in a reviewed commit.
- **A2.** The emulated touch devices report a coarse pointer as the real ones do, so REQ-DESIGN-06
  holds on a real touch device.
