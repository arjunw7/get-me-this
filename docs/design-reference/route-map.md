# Prototype-to-production route map

## Comparison targets

- Live prototype base: `https://project-agile-otter-357.magicpatterns.app`
- Production implementation base: local app, Railway PR preview, staging, or production depending on review stage
- Approved design version: Magic Patterns Version 18

The prototype route and production route may differ internally, but they must represent the same user state. Every implemented row must eventually name a deterministic fixture and approved screenshots at mobile and desktop widths.

## Public and identity routes

| State | Prototype route | Intended production route | Required comparison |
|---|---|---|---|
| Landing | `/` | `/` | Full page; desktop and mobile |
| Email entry, default | `/auth?intent=home` | `/auth?intent=home` | Default, invalid email, submitting |
| Email entry, wishlist intent | `/auth?intent=wishlist` | `/auth?intent=wishlist` | Intent-specific helper copy if present |
| Email entry, create-group intent | `/auth?intent=create-group` | `/auth?intent=create-group` | Intent-specific helper copy |
| OTP verification | `/auth/verify` | `/auth/verify` | Default, invalid code, expired code, resend countdown |
| Magic-link completion | `/auth/confirm` | `/auth/confirm` | Loading, success, invalid/expired recovery |
| First-time onboarding | `/onboarding` | `/onboarding` | Empty, validation, avatar selected |
| Invitation preview | `/invite/diwali-scenes` | `/invite/[token]` | Valid signed-out preview, expired/revoked token |

Production uses an opaque invitation token rather than a human-readable group slug as the authorization credential. Fixture labels may still use `diwali-scenes` in tests.

## Authenticated application routes

| State | Prototype route or screen | Intended production route | Required comparison |
|---|---|---|---|
| Established-user Home | `/home` | `/home` | Assignment, activity, refresh prompt |
| New-account Home | `/home` prototype state | `/home` seeded new-user state | Empty/upcoming state and starter ideas |
| My wishlist | `/wishlist` | `/wishlist` | Populated, empty, owner reaction summaries |
| Add from link | `/add` | `/wishlist/items/new` | Initial, extracting, extracted, failed/manual |
| Groups | `/groups` prototype screen | `/groups` | Empty and populated |
| Create group | `CreateGroup` prototype screen | `/groups/new` | Every wizard step and validation state |
| Group room | `/groups/diwali-scenes` | `/groups/[groupId]` | Joined/pending members, horizontal rows, organizer/member views |
| Private gifting | `/groups/diwali-scenes/gifting` | `/groups/[groupId]/gifting` | Secret assignment, gift-everyone checklist, wishlist-only explanation |
| Account menu | Global prototype state | Global application shell | Desktop and mobile trigger/menu |
| Edit profile | Global sheet | Global account/profile sheet | Default, validation, avatar update |
| Logout confirmation | Global dialog | Global account dialog | Cancel and confirmed logout states |

## Apple-to-apple review procedure

For each changed route:

1. Open the deployed prototype and Railway preview side by side.
2. Set both to the same viewport: 390 by 844 or the approved desktop viewport.
3. Load matching deterministic people, products, prices, dates, and images.
4. Match scroll position and open UI state, including sheets, menus, errors, focus, hover, and selections.
5. Capture both screenshots in the same browser engine.
6. Produce a diff and review layout, typography, colour, imagery, responsive behavior, and content hierarchy.
7. Exercise the interaction. Confirm keyboard behavior, semantics, loading, errors, and privacy; the prototype may visually represent behavior it does not securely implement.
8. Document every accepted difference in the pull request.

## Review rules

- “Looks close” is not evidence; attach paired screenshots.
- A comparison with different mock data is not authoritative for geometry or wrapping.
- Do not copy prototype mock-state logic into production merely to obtain a closer screenshot.
- Production accessibility, security, real loading behavior, and framework conventions take precedence over prototype shortcuts.
- If the live prototype and frozen Version 18 screenshot differ, stop and ask which change is approved before updating a baseline.

