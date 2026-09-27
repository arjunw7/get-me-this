# Version 18 visual baselines

These screenshots were rendered from Magic Patterns artifact `a5d1a9ef-f965-43dd-819e-e9fbf30c6a5b`, not from the mutable live deployment.

## Capture contract

- Mobile viewport: 390 × 844.
- Desktop viewport: 1440 × 1000.
- Browser: installed Google Chrome, headless, device scale factor 1.
- Reduced motion: enabled.
- Fonts awaited before capture.
- Screenshots: full-page PNG.
- Capture date: 2026-09-27.

There are 66 screenshots: 44 route/state baselines and 22 interaction-state baselines.

## Base states

- Landing.
- Email entry for home, wishlist, and create-group intents.
- OTP default, error, and expired states.
- Magic-link valid and expired states.
- Onboarding.
- Valid invitation preview.
- Established and new-account home.
- Filled and empty wishlist.
- Add-item initial state.
- Groups list, create-group form, and group room.
- Secret, gift-everyone, and wishlist-only gifting views.

## Interaction states

- Add-item empty validation, loading, extracted review, and manual fallback.
- Create-group validation and created confirmation.
- Wishlist reorder.
- Edit-profile sheet.
- Account menu.
- Logout confirmation.
- Gifting-mode sheet.

## File naming

`<state>--mobile-390x844.png` and `<state>--desktop-1440x1000.png` identify an equivalent state at the two approved widths.

## Assets and licences

- Display font: Bricolage Grotesque, loaded from Google Fonts by the prototype.
- Body font: DM Sans, loaded from Google Fonts by the prototype.
- Product imagery: Magic Patterns generated-image CDN URLs embedded in V18.

The CDN product imagery is frozen inside these screenshots for design-review purposes only. The artifact does not provide transferable production licensing evidence. Production must use owned, licensed, or deterministic fixture imagery before launch; it must not treat these remote prototype URLs as approved production assets.

## Approval

These files are candidate baselines until the product owner completes `../../review-checklist.md`. After approval, changes require an explicit design decision and a new baseline version.
