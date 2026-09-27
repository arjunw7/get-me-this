# Design reference inventory

## Approved source

- Magic Patterns editor: https://magicpatterns.com/c/6mqikx9odrcmu2eke7g6bs
- Deployed prototype: https://project-agile-otter-357.magicpatterns.app/
- Approved version observed during build-pack creation: **Version 18**

Do not sync or copy the generated project into production wholesale. Export it into a clearly marked reference-only location when beginning Phase 0, then inventory and discard prototype scaffolding, mock data, local contexts, and editor plumbing.

Use the deployed prototype for live side-by-side review. Because that deployment can change, capture and commit approved screenshots before implementation. The frozen screenshots—not an unversioned future deployment—decide whether an unapproved visual regression occurred.

## Observed page inventory

- Landing
- Home, including established-user and new-account states
- My wishlist, including populated, empty, edit-profile, and reorder states
- Add from link, including loading, extracted, editable, and manual-fallback states
- Groups list
- Create group
- Group room
- Private gifting view and recipient checklist
- Invitation acceptance/preview
- Email entry
- OTP verification
- Magic-link confirmation and expired/invalid recovery
- Onboarding
- Account menu and logout confirmation

## Observed component/behavior inventory

- Group demonstration section on landing
- Hero product-card collage
- Responsive application shell
- Product/wishlist card
- Desire selector
- Price/original-currency presentation
- Reaction summary and one-of-three reaction action row
- Member wishlist horizontal rows with stable left-gutter snapping
- Mode chooser and organizer tools
- Assignment card and recipient checklist
- Account menu, edit profile, and logout confirmation

## Reference capture checklist

Before the static-fidelity pilot:

- [ ] Export Version 18 code to a reference-only directory outside the production import graph.
- [ ] Capture every approved route at 390px and 1440px widths.
- [ ] Capture loading, empty, success, failure, modal/sheet, and destructive-confirmation states.
- [ ] Record exact fonts and asset sources/licences.
- [ ] Extract semantic colour, typography, spacing, radius, shadow, and motion tokens.
- [ ] Replace unstable remote images with licensed deterministic test assets.
- [ ] Commit approved Playwright baselines only after human review.
- [ ] Record each route/state pairing in `route-map.md` so reviewers compare equivalent screens rather than merely similar pages.

