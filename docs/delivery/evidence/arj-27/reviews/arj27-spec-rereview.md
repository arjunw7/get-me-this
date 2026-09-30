# ARJ-27 / 005b independent binding-spec correction re-review

Verdict: **REQUEST_CHANGES**

Original finding B1: **NOT ADDRESSED** in full. The required copy contradiction is corrected, but the accepted-differences requirement has not been propagated consistently throughout the brief.

Reviewer: independent agent `arj27_spec_rereview`.
Review date: 2026-09-30.
Reviewed delta: `8b40f4bc52947143b845fbf600b8ab969c62430f..4f3ba3ac7eac6bb2876df718b90a687b5a230991`.
Scope: the binding-spec correction and any inconsistency introduced by that correction. This is not a review of the unchanged implementation, visual baselines, or CI.

## Remaining finding

### B1 follow-up: include resolution 8 in the required-proof list

Evidence: `docs/delivery/issues/005b-protected-wishlist-display-and-empty-state.md:365` now requires resolution 8's omission of the final audience sentence to be documented among the accepted visual differences. Resolution 8 itself requires the exact omission in visual evidence at line 226. However, the same brief's Required proof section still defines the accepted-differences list as only "resolutions 1, 3, and 4" at line 406.

Adding resolution 8 makes that exhaustive list incomplete. An implementer assembling the required PR and evidence pack from this checklist receives a different set of required differences from criterion 14. Update line 406 to include resolution 8, or reference all applicable accepted differences without an incomplete enumeration. This is a correction to the same copy/evidence contract, not additional feature scope.

## Verified corrections

- **Audience-copy contradiction: ADDRESSED.** Scope lines 81-85 and criterion 5 at lines 303-311 pin the same corrected paragraph ending with "the hoodie you keep looking at." The removed friends sentence survives only as the explicitly rejected V18 wording in resolution 8 at lines 220-226. The correction remains compatible with the owner-only scope at lines 12-13 and 250-253.
- **Criterion 14 copy divergence: ADDRESSED.** Lines 362-365 expressly include resolution 8's audience-sentence omission in the accepted visual differences.
- **Decision attribution: ADDRESSED.** Lines 138-141 distinguish the existing owner decisions from resolution 8. Lines 218-226 date resolution 8 as an agent decision under delegated owner authority and expressly disavow human-authored approval. Nothing in the correction claims that baseline image review, CI, or implementation signoff has already occurred.
- **Other delta: no new blocker.** The `Referrer-Policy: no-referrer` reflow at lines 292-293 preserves the existing requirement. The exact-commit whitespace check passes.

No blockers were waived. After the required-proof enumeration includes resolution 8, no other issue in this scoped correction remains identified. This report does not itself approve implementation, images, or a merge.

Read-only repository inspection was performed. Existing implementation changes were preserved. No tests, external actions, commits, pushes, or merges were performed. The only file written is this requested report.

