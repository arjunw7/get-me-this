# ARJ-69 — Join navigation feedback

Join with a link now shows Opening invite… immediately, marks the form busy, and disables repeat submissions while navigating. Hover uses the pointer cursor. Invalid links remain editable; navigation-start failure restores the form with recovery copy.

## Acceptance criteria and evidence
- [x] “The cursor does not change to a pointer on hover, and the button lacks a loading state before navigating.” — browser regression checks computed cursor and disabled/busy loading state while the real invite response is held; component coverage also proves duplicate prevention, invalid-link handling and error recovery.

[ARJ-69](https://linear.app/arjun-wadhwa/issue/ARJ-69/join-with-a-link-lacks-loading-state-and-cursor-change)

`pnpm verify` passed with two workers (all unit/component tests, formatting, lint, types, worker check, build). Local browser regression passes on desktop/mobile with the same signed-in fixture and delayed response against base and PR builds. [Before/after screenshots](docs/delivery/evidence/arj-69/README.md) included. Full database/E2E/visual CI required on this head. No baseline changes. Railway preview pending availability. No schema/dependency changes; rollback by reverting. No Magic Patterns mock data or editor artifacts shipped.
