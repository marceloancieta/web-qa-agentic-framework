# Spree Commerce admin pack

The admin dashboard of [Spree Commerce](https://spreecommerce.org) 6, run locally in Docker (the
`spree` and `spree-db` services of [`docker/compose.yml`](../../docker/compose.yml), pinned by
digest). The storefront is not part of the pack.

Created by `npm run scaffold:app`. Still to fill in, through the phases:

- [ ] `app.json`: layout `breakpoints`, `third_party_hosts` to block, extra `secret_keys` and
      `identity_fields`
- [ ] `fixtures.ts`: how the `admin` actor signs in (`signIn`), and staff of other roles
- [ ] `docs/app-notes.md`: facts about the application that tests rely on
- [ ] `docs/app-map.json`: `npm run app:map -- --pack spree --write`
- [ ] `.claude/skills/spree-ui/SKILL.md`: the placeholders the skill still has

## Running it

```sh
npm run spree:up                    # start Spree, make the admin, load the sample data once
npx playwright test --project='spree-*'
npm run spree:down                  # remove both containers; the next start is empty
```

`spree:up` ([`scripts/spree-up.mjs`](../../scripts/spree-up.mjs)) reads the admin's email and
password from the variables the `admin` actor names in qa-config (`SPREE_ADMIN_EMAIL`,
`SPREE_ADMIN_PASSWORD` in `.env`), creates that admin with the admin role of the store, sets the
password again when it differs and clears a lockout. A Spree that is already running keeps its data.
The application answers on `http://localhost:3100`, the dashboard under `/dashboard`.
