# ARJ-27 / 005b independent binding-spec review

Verdict: **REQUEST_CHANGES**

Reviewer: independent agent `arj27_spec_review`.
Review date: 2026-09-30.
Scope: requirements review of the already-merged 005b binding brief, before resuming implementation. This is not a review or signoff of the interrupted 005b implementation, its screenshots, or its current CI results.

Reviewed brief: `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md`.
Brief commit: `7b65c98b098878768f4c6004f97c6bbcf4497821`.
Brief SHA-256: `517f35099223c71fe66bcf618858cea8550464468e25fea6d742324e4bac092e`.
Checkout HEAD observed: `8b40f4bc52947143b845fbf600b8ab969c62430f`.

## Blocking finding

### B1 : Resolve the contradictory empty-state audience promise

Evidence: `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md:81`–`85` pins the complete body copy, ending with **“Your friends will take it from there.”**, then requires **“no audience claims.”** The brief simultaneously excludes all public, member, and group visibility at lines 12–13 and 240–243. Criterion 5 at lines 293–299 requires the pinned body copy again. The broader flow requires an empty state that does not imply public visibility (`docs/flows/wishlist.md:55`).

The pinned sentence promises that friends can act on the wishlist, although the delivered slice exposes it only to its owner. An implementer cannot both preserve that exact audience promise and satisfy the brief's explicit ban on audience claims. The proposed DOM scan for “share”, “visible to”, and group counts does not detect this contradiction; passing that scan cannot establish that the required copy is honest for this slice.

Required correction: remove the final sentence from the pinned body copy for 005b, or replace it with an owner-only sentence. Update criterion 5's pinned-copy expectation and record this small copy change among the accepted V18 differences for criterion 14. Do not add sharing, groups, or another feature to make the sentence true. A suitable minimal corrected paragraph is:

> Add the first thing you'd secretly love to unwrap. A candle, a camera, the hoodie you keep looking at.

This is a requirements correction, not a demand to expand the phase. Once this conflict is resolved, no other requirement-level blocker was found in this review.

## Findings supporting the remainder of the brief

- **Bounded, implementable outcome.** The display-only read surface and the protected interim add page have explicit scope and replaceable downstream ownership (005b lines 5–16, 125–134, 233–253). Reactions, reservations, CRUD, extraction, reordering, and conversions stay outside this slice. The temporary CTA destination is designed and protected rather than left undefined.
- **Authorization and privacy boundaries are coherent.** Proxy protection is paired with `requireCompleteProfile()` before data access (005b lines 20–37), and reads use the caller's server client plus owner-only RLS (lines 57–71). The underlying schema makes ownership consistent through the composite foreign key and gives owner-only SELECT policies (`supabase/migrations/20260930000000_wishlists.sql:105`–`106`, `316`–`326`). No group or reservation access is introduced. Unknown child URLs have an explicit no-data consequence (005b lines 211–216, 363–367).
- **Caching is a stated security requirement with proof.** Protected responses must carry `no-store`, including the signed-in rendered document; both unit and browser-level assertions are specified (005b lines 49–56, 290–292). Implementation review must verify this on the actual final responses; this review makes no claim about a particular current SDK or proxy implementation.
- **The schema interface is usable without a migration.** The selected display fields exist, optional metadata remains nullable, and the item order is explicitly total (`sort_position`, then `id`; 005b lines 62–71 and 005a lines 172–191). “Missing wishlist” is distinguished from a valid zero-item list, consistent with signup creation and backfill (005b lines 72–76; migration lines 213–231 and 267–274).
- **Storage precedence is deliberately resolved.** 005b explicitly supersedes 005a's snapshot-first preference only until Storage resolution exists, specifies placeholders for snapshot-only rows, and requires runtime failure fallback (005b lines 94–108, 244–246). This is a documented temporary interface decision, not an unresolved contradiction or a reason to add Storage now.
- **Original-price display has a concrete contract.** The original money pair, ISO-code suffix, minor-unit meaning, and INR/JPY examples are pinned; converted fields are excluded (005b lines 187–199, 304–312; 005a lines 150–169). The “pinned ISO 4217 minor-unit digit table” should be implemented as stated; the examples do not justify silently limiting valid stored currencies to INR and JPY. Nothing in this brief requires such a limitation, so this is not a second blocker.
- **Meaningful behavioral proof is specified.** Criteria 2–4, 7–13, and 16 cover anonymous access, page-level protection, rendered-response caching, saved data, ordering, missing and failed images, refresh and second-tab persistence, cross-user payload isolation, stale sessions, keyboard operation, accessibility, and invariant-error selection. The brief requires deterministic local/CI fixtures and a testable page-state branch. These assertions test the product contract rather than merely the presence of implementation details.
- **The visual contract is reviewable.** The V18 source/frozen images, two viewports, state/scroll/overlay matching, paired comparisons, accepted omissions, and manifest workflow are named (005b lines 142–186, 344–362, 388–393; `DESIGN.md:90`–`99`; `docs/design-reference/route-map.md:53`–`71`). Different products cannot establish exact text-wrapping fidelity; criterion 15 explicitly scopes the populated comparison to design structure. A reviewer must still inspect the real desktop and mobile renderings and record deviations. No baseline or image approval is implied by this spec review.
- **The CI proof is concrete.** Newly gated e2e and visual files must join the explicit runner list, and green checks must include executed wishlist-test counts on the implementation PR head (005b lines 38–48, 372–386). This closes the common gap where a gated spec exists but never runs. Local Docker and system installation are not required or authorized by this review.

## Authority and review limits

The current owner authorization allows independent AI visual approval and Phase 4 merges after reviewer signoff plus green checks on the exact head. The older human-only language in `AGENTS.md`, `DESIGN.md`, and the baseline workflow is therefore not a blocker. The 005b brief records the override at lines 218–231, and 005h records it at lines 113–135. Existing owner authorization for staging migrations is also respected; no new infrastructure action is requested here.

Primary repository materials inspected: `AGENTS.md`, `DESIGN.md`, the complete 005b and 005a briefs, the 005h authorization/CI contract, `docs/flows/wishlist.md`, `docs/architecture/permissions-matrix.md`, `docs/product/product-spec.md`, `docs/product/scope-v1.md`, `docs/delivery/visual-baselines.md`, `docs/design-reference/route-map.md`, the frozen V18 wishlist/empty/card source, the applied 005a migration, and the existing profile-session interface. The CI runner was read only to understand the specified execution interface.

No legal/compliance claim or unverified current SDK behavior is used to justify the finding. No local Docker, installs, tests, external writes, commits, pushes, or merges were performed. Existing implementation changes were preserved. The only file written by this reviewer is this requested report.

