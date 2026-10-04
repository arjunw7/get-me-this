# Invitation sharing evidence

This is a separate invitation-sharing change from the delete-group proposal in
PR #84. Production remains unchanged; the live repair requires authorization
under AGENTS.md. The exact repair is documented in
[invitation-sharing-rollout.md](../../../ops/invitation-sharing-rollout.md).

## Acceptance criteria from the user

- [x] “I'm not able to create an invitation link for a particular group. Can you
  see why it's not working?” Read-only inspection found the live modal's
  `get_group_invite_link(uuid)` function absent and the migration ledger ending
  at 20261021. The live web service also lacks its invitation cookie secret.
  The matching Wadhwa Diwali group exists and is active.
- [x] “The banner of that link” has “that group name,” “the organizer's name,”
  and “a date as well.” The HTML metadata and generated PNG use those exact
  fields from a live, read-only database projection; the date is the occasion
  date in the group's own time zone.
- [x] “These dynamic images are always in the same fonts as our app.” Images
  embed Bricolage Grotesque 800 and DM Sans 400 derived from the existing app
  font files. A paired source/output font hash test detects font drift.
- [x] “On the top it should be the actual logo of get me this.” The banner
  renders the same Wordmark component, including its tomato underline.
- [x] “As colorful and as quirky as possible.” Uses the app's marigold,
  electric blue, tomato, lime and paper tokens, the existing gift mark, a
  tilted invitation chip and offset shadows.
- [x] “Move the host and date within the box which has group name” and
  “increase the size of you're invited.” Both details now sit inside the
  marigold card.
- [x] “Don’t keep the date box tilted” and “make the date bold like host name.”
  The date panel is straight and uses Bricolage Grotesque 800 at 30px.
- [x] Remove the star; put the favicon gift before the top-left logo; keep
  only a bold invitation chip at top right and make it “30% more bigger.”
  The star is removed, the gift precedes the wordmark, and the chip uses
  Bricolage Grotesque 800 at 46.8px (30% larger than the previous 36px).
- [ ] Apply the production repair and verify the user's real group. No
  production mutation has been performed or claimed as complete.

## Automated proof

- `pnpm verify`: format, lint, strict types, 163 files / 1,583 unit/component
  tests and build passed on the main base including merged PR #84.
  Two pre-existing unrelated lint warnings
  remain in copy-button.tsx and redraw-section.test.tsx.
- Full local database suite: 28 suites / 1,881 assertions passed, including the new three-field projection,
  malformed/unknown capabilities, join-capability separation, live organizer
  name, group-zone midnight rollover, no use/membership changes, and denial
  for expired, revoked, exhausted, targeted, archived and deleted-group invitations.
- 14 browser tests passed across 390×844 and 1440×1000: organizer modal stable
  reopening; non-organizer denial; signed-out OTP/onboarding/final Join;
  signed-in joining; invalid tokens; foreign-origin replay denial; pending
  delivery/logout ordering; dynamic HTML and PNG; ordinary browser preview;
  and revoked HTML/image denial.
- Rendering checks decode real PNGs, check dimensions and headers, and render
  maximum-length names using the bundled fonts without external asset requests.
- Existing invitation tests and new tests ran against an isolated local stack,
  with external provider settings removed and no production credentials.

The first local browser attempt used a port outside the app's explicit auth
allowlist; corrected to its existing 3200 origin. The initial new test reached
all assertions but omitted continuation cleanup; corrected to the existing
scoped cleanup helper. Tests were rerun after both corrections. The database
suite is run on a fresh synthetic fixture state, as its existing smoke/group
counts assume no leftover browser fixtures.

## Visual evidence

The actual PNG returned by the route is [invitation-banner.png](invitation-banner.png).
Its responsive display is captured at [desktop](banner-desktop.png) and
[mobile](banner-mobile.png). The same synthetic group, organizer and occasion
are used at both widths. These screenshots show the image itself; they do not
claim an actual WhatsApp/other third-party card render.

The user's final layout revision has exact before comparisons from the banner
shown earlier in this conversation: [desktop before](banner-before-desktop.png)
and [mobile before](banner-before-mobile.png). Same image endpoint, group fixture,
viewport and display state; only the requested layout and styling changed.
These are design-iteration comparisons, not pre-existing production banners.

The ordinary guest preview is captured at [desktop](invite-browser-desktop.png)
and [mobile](invite-browser-mobile.png). The organizer modal is captured at
[desktop](room-invitation-dialog-after-desktop.png) and
[mobile](room-invitation-dialog-after-mobile.png); its bearer field is masked.

There is no existing group-specific image route or approved V18 group-share
banner screenshot for a like-for-like before comparison. Before this change,
the raw invite route only returned a cookie-dependent 302 with no HTML Open Graph
metadata; the app's general image remains `public/assets/brand/share-banner-v2.png`.
The user explicitly requested the new banner, app fonts, actual logo and colorful
styling. No existing app layout or frozen visual baseline was replaced. No
Magic Patterns mock data or editor artifacts are included in production code.

## Deployment and rollback

Apply the new read-only preview function migration before deploying this web
revision. It adds no table or data writes. Revert the web change, then revoke
the function's anon/authenticated EXECUTE grants to disable banners. The live
invitation repair and its non-destructive rollback are separate and documented
in the rollout guide. Cached cards already stored by chat applications cannot
be erased by this app's no-store/revocation checks.
