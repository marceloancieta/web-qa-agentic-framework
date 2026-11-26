---
mission: Find where the cart badge and the cart disagree
pack: shop
environment: local
routes:
  - /inventory
role: anonymous
device: desktop-chromium
driver: person
writes: none
out_of_bounds: []
minutes: 90
opened: 2026-11-20T10:00:00.000Z
closed: 2026-11-20T11:20:00.000Z
ended: closed
---

# Cart badge, look-alikes that pass

A person may take 90 minutes; the items may be bold; a question needs no evidence; a heading inside
a code block is not a section.

```markdown
## Findings
### Not a finding
```

## Findings

### F1. The badge keeps a removed item

- **Steps:** open `<base_url>/inventory`, add two items, remove one from the cart
- **Expected:** the badge shows 1
- **Seen:** the badge shows 2 until the page reloads
- **Device:** desktop-chromium
- **Role:** anonymous
- **Reproduced:** 2 of 2
- **Evidence:** `reports/explore/2026-11-20-badge-look-alikes/trace-01.zip`, at 00:04

## Questions

### Q1. Does the badge poll the server?

- Seen: one request per minute, not sure what it carries

## Proposed charters

- The badge across two tabs.
