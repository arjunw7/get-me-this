# Design alignment and sharing — PR evidence

This PR contains the user-requested design corrections and the subsequent Vibe,
public-wishlist, reaction, control, and invitation changes. It is a review proposal,
not a claim of complete pixel parity. The implementation branch starts at the
current `main` commit `0efab0e`.

## Acceptance criteria and evidence

There is no corresponding open GitHub issue. These criteria are copied from the
user's requests in the implementation conversation.

| User requirement | Result and evidence |
| --- | --- |
| “use mail pit for logging in” | Real local email/OTP flows exercised by `tests/helpers/mailpit-signin.ts`; no authentication codes or capability URLs are included in this pack. |
| “check for fresh accounts empty states and for existing account loaded screens” | First-use and populated Home, Groups, wishlist, and member screens implemented and tested. See `tests/e2e/home-groups-matrix-local.spec.ts` and the populated screenshots below. |
| “No groups”, “Multiple groups, same gift mode”, “One group, with different gift modes”, “Multiple groups, different gift modes” | 16 desktop/mobile scenario journeys passed. Each single-group mode was exercised separately; multiple-group same-mode pairs and a mixed-mode account were exercised. |
| “Groups design and features with multiple people already added” | Five-member rooms, member wishlist rails, private assignment/checklist/browse modes, and populated/empty member states exercised. |
| “the add item screen does not have the left nav” | Standalone Add Item layout and larger selected-photo review implemented. [Desktop](add-item-review-desktop.png), [mobile](add-item-review-mobile.png). |
| “the price didn't come through” | Amazon current-price extraction, selected-product/offer matching, entity decoding, challenge/ambiguity detection, and safe editable fallback covered by extraction tests. The supplied Plantex link was manually verified during the audit with INR 1,749. Universal extraction accuracy is not promised. |
| “call it Vibe”; “Choose your Vibe”; “Edit your profile” | Persisted allowlisted Vibe in normal/invitation onboarding and owner profile editing; propagated to authorized member views. 33 database assertions and 10 browser journeys passed. |
| “This is the menu in the designs. Does not match” | Paper menu with icon rows, muted email, divider, correct hover/dismissal and profile/logout transitions. Matched before/after below. |
| “share just my wishlist as a public link”; “Public automatically for every wishlist”; “will not show what items are reserved” | Automatically available opaque public link; public page excludes reservations, purchases, assignments, group data/activity and private group reactions. Signed-in visitors alone can react; owner remains read-only. |
| “date selector … brand”; “currency dropdowns … searchable”; “edit profile CTA … hovering”; “remove the down/up arrows” | Branded keyboard-accessible date and searchable currency controls, edit hover/focus feedback, pointer/touch/keyboard drag reordering with persistence/recovery. |
| “on clicking on invite people … open a modal”; “copy invite link”; “share on whatsapp” | Organizer-only modal with the group name, URL and those two actions. Reopening/reloading recovers the same new link. Legacy digest-only links require explicit replacement confirmation. |
| “remove the stop sharing option”; “remove … open public wishlist CTA”; “just add an icon” | Share sheet has one Copy link action and an accessible open-link icon beside its URL. Actual icon navigation, copying and mobile fit pass. |
| “100% accurate” | **Not marked complete:** outstanding strict visual comparisons and limitations are listed below. No baseline was replaced. |

## Screenshot review

Screenshots use desktop **1440×1000** and mobile **390×844**, DPR 1. Before/after
pairs use the same synthetic account/content and interaction where applicable.
The invitation change intentionally compares the previous destination page with
the newly requested in-room modal; these are different flows, not pixel-diff
baselines. Bearer text is hidden in sharing screenshots, with field geometry and
icons intact. All local audit dumps, token-bearing traces, and editor galleries
remain outside this PR.

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Account menu | [Before](account-menu-before-desktop.png) / [after](account-menu-after-desktop.png) | [Before](account-menu-before-mobile.png) / [after](account-menu-after-mobile.png) |
| Vibe edit and persistence | [Before](vibe-edit-before-tomato-desktop.png) / [after](vibe-edit-after-electric-desktop.png) | [Before](vibe-edit-before-tomato-mobile.png) / [after](vibe-edit-after-electric-mobile.png) |
| Vibe onboarding | [Screen](vibe-electric-onboarding-desktop.png) | [Screen](vibe-electric-onboarding-mobile.png) |
| Group controls | [Before](group-form-controls-before-desktop.png) / [calendar](group-branded-calendar-desktop.png) / [currency](group-currency-search-desktop.png) | [Before](group-form-controls-before-mobile.png) / [calendar](group-branded-calendar-mobile.png) / [currency](group-currency-search-mobile.png) |
| Wishlist reordering | [Before](wishlist-interactions-before-desktop.png) / [drag](wishlist-drag-reorder-desktop.png) | [Before](wishlist-interactions-before-mobile.png) / [drag](wishlist-drag-reorder-mobile.png) |
| Member hover clipping | [Before](room-invite-hover-before-desktop.png) / [after](room-invite-hover-after-desktop.png) | [Before](room-invite-hover-before-mobile.png) / [after](room-invite-hover-after-mobile.png) |
| Group invites | [Previous page](room-invitation-page-before-desktop.png) / [modal](room-invitation-dialog-after-desktop.png) | [Previous page](room-invitation-page-before-mobile.png) / [modal](room-invitation-dialog-after-mobile.png) |
| Wishlist sharing | [Before](owner-sharing-sheet-before-desktop.png) / [after](owner-sharing-sheet-desktop.png) / [public](public-populated-anonymous-desktop.png) | [Before](owner-sharing-sheet-before-mobile.png) / [after](owner-sharing-sheet-mobile.png) / [public](public-populated-anonymous-mobile.png) |
| Loaded Home | [Screen](home-active-desktop.png) | [Screen](home-active-mobile.png) |
| Groups index | [Screen](groups-index-desktop.png) | [Screen](groups-index-mobile.png) |
| Secret draw | [Room](group-secret-desktop.png) / [gifting](gifting-secret-desktop.png) | [Room](group-secret-mobile.png) / [gifting](gifting-secret-mobile.png) |
| Gift everyone | [Room](group-everyone-desktop.png) / [gifting](gifting-everyone-desktop.png) | [Room](group-everyone-mobile.png) / [gifting](gifting-everyone-mobile.png) |
| Wishlist-only group | [Room](group-browse-desktop.png) / [gifting](gifting-browse-desktop.png) | [Room](group-browse-mobile.png) / [gifting](gifting-browse-mobile.png) |
| Loaded wishlist | [Screen](wishlist-loaded-desktop.png) | [Screen](wishlist-loaded-mobile.png) |

Populated captures use real synthetic database fixtures matching the frozen V18
names/products where supported. Countdown dates, authorized activity/reaction
counts, and available member fields differ legitimately from prototype samples;
whole-screen equality is not asserted. Approved immutable references remain in
`docs/design-reference/baselines/v18`. No golden image was changed.

## Verification

- Final `pnpm verify` **passed** in an isolated copy of this source: format,
  lint (zero errors; two existing unused-variable warnings), route types,
  TypeScript, **1,501 tests / 153 files**, and production build. Git metadata
  was supplied only to the read-only whitespace check. The live review server
  remained available while checks ran.
- Final sharing/invite browser pass: **8 distinct desktop/mobile cases**; **4
  additional smoke cases** passed on the updated port-3100 review app.
- Earlier focused checks on this branch: **16** group-scenario matrix cases,
  **10** final Vibe/menu cases, **4** control/drag cases, **10** reorder/recovery
  cases. These are scoped results, not a claim that the entire stack suite passed.
- Database: Vibe **33**, public wishlist **83**, invitation recovery **43**, and
  existing generic invitations **70** assertions passed. Public-sharing two-session
  race harness: **5 scenarios passed**.
- Negative coverage includes anonymous/non-owner writes, former/non-joined
  organizers, archived/cross-group access, public private-data exclusion,
  revoked public documents/images, stale CAS, and changed membership authority.
- One existing reorder unit test now explicitly mocks the request-bound storage
  dependency so configured local credentials cannot trigger Next request APIs
  during a unit test. One existing invitation assertion now counts only its
  fixture organizer's groups, avoiding unrelated review records.

## Remaining review gates and limits

- Eight strict macOS-versus-pinned visual comparisons remain unresolved: four
  wishlist states and four mobile create-group states. Text rasterization is a
  possible contributor, not proof that all differences are harmless. No golden
  screenshots or tolerance thresholds were changed.
- The broader earlier stack run had failures in group-activity cleanup,
  organizer-member stale/transfer flows, and desktop too-early auth resend.
  These remain review gaps; the final focused pass does not erase them.
- Full database runs on the populated review stack encounter existing global
  seed-count assumptions in `groups.sql`, `groups-008c.sql` and `smoke.sql`.
  Review data was preserved. A clean-stack CI result is still required.
- The additional invitation-recovery race probe was not run: automatic approval
  review rejected synthetic-record cleanup and local-session termination. Its
  unvalidated local probe is excluded from this PR. Lock ordering was independently
  reviewed; runtime concurrency proof remains outstanding.
- No Railway preview has been provisioned for this local branch. No production
  Supabase/Railway resources were changed. CI and independent review are required
  before merge; no merge is authorized by this PR request.
- Universal successful extraction is impossible to guarantee for login walls,
  bot challenges, ambiguous variants and unavailable/market-specific prices.
  Editable manual recovery remains the contract. Manual photo upload and new
  currency-conversion behavior were not added.

## Migrations and rollback

Apply additive migrations in order before deploying dependent app code:

1. `20261022000000_profiles_vibe.sql`: allowlisted owner-editable profile Vibe and
   narrow authorized member projection. [Rollout/rollback](../../../architecture/profile-vibe.md).
2. `20261023000000_public_wishlists.sql`: opaque public sharing, separate public
   reactions and restricted image projection. [Security/rollback](../../../architecture/public-wishlists.md).
3. `20261024000000_recoverable_group_invite_links.sql`: deny-all private generic
   invite-token storage and current-organizer recovery RPC. Legacy active links
   are preserved until explicit replacement. [Rollout/rollback](../../../architecture/recoverable-group-invites.md).

Prefer rolling app code back while retaining additive data. Destructive removal
of saved preferences, tokens or reactions needs a reviewed migration and explicit
approval. No Magic Patterns mock data, contexts, routing, Vite/editor plumbing,
or preview controls are shipped in the application. Reference assets are confined
to test fixtures and review screenshots. No new dependency was introduced.
