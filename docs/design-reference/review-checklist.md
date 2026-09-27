# Version 18 design-freeze review

Review the screenshots in `baselines/v18/` before approving ARJ-5.

## Version boundary

- [ ] Confirm Version 18 is the production design authority.
- [ ] Confirm Versions 19 and 20 are not silently adopted.

## Public and identity

- [ ] Landing hierarchy and responsive behavior are approved.
- [ ] Email-entry intent variants are approved.
- [ ] OTP default, error, and expired states are approved.
- [ ] Magic-link valid and expired states are approved.
- [ ] Onboarding and invitation preview are approved.

## Authenticated application

- [ ] Established and new-account home are approved.
- [ ] Filled, empty, reorder, and edit-profile wishlist states are approved.
- [ ] Groups list, create-group, group-room, and organizer states are approved.
- [ ] Secret draw, gift everyone, and wishlist-only modes are approved.

## Overlays and recovery

- [ ] Account menu and logout confirmation are approved.
- [ ] Add-item validation, loading, extraction, and manual fallback are approved.
- [ ] Create-group validation and success states are approved.
- [ ] Gifting-mode sheet is approved.

## Production exceptions

- [ ] Prototype mock data will be replaced at the data boundary, not retained in UI components.
- [ ] Remote prototype images will not ship without verified production rights.
- [ ] Accessibility, security, real loading behavior, and framework conventions may intentionally differ from the prototype.

Approval decision:

- [ ] Approved as frozen V18 baseline.
- [ ] Changes requested and documented in ARJ-5.
