# Version 18 design-freeze review

Review the screenshots in `baselines/v18/` before approving ARJ-5.

## Version boundary

- [x] Confirm Version 18 is the production design authority.
- [x] Confirm Versions 19 and 20 are not silently adopted.

## Public and identity

- [x] Landing hierarchy and responsive behavior are approved.
- [x] Email-entry intent variants are approved.
- [x] OTP default, error, and expired states are approved.
- [x] Magic-link valid and expired states are approved.
- [x] Onboarding and invitation preview are approved.

## Authenticated application

- [x] Established and new-account home are approved.
- [x] Filled, empty, reorder, and edit-profile wishlist states are approved.
- [x] Groups list, create-group, group-room, and organizer states are approved.
- [x] Secret draw, gift everyone, and wishlist-only modes are approved.

## Overlays and recovery

- [x] Account menu and logout confirmation are approved.
- [x] Add-item validation, loading, extraction, and manual fallback are approved.
- [x] Create-group validation and success states are approved.
- [x] Gifting-mode sheet is approved.

## Production exceptions

- [x] Prototype mock data will be replaced at the data boundary, not retained in UI components.
- [x] Remote prototype images will not ship without verified production rights.
- [x] Accessibility, security, real loading behavior, and framework conventions may intentionally differ from the prototype.

Approval decision:

- [x] Approved as frozen V18 baseline — Arjun Wadhwa, 2026-09-27.
- [ ] Changes requested and documented in ARJ-5.
