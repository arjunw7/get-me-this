# ARJ-27 recovery review records

These reports preserve the rejected recovery snapshot and every subsequent review round. Approval of the spec or plan is not approval of the implementation, screenshots, CI, or merge.

Full reports and the decision journal are also recorded on [PR #28](https://github.com/arjunw7/get-me-this/pull/28#issuecomment-5916612079) and mirrored on [Linear ARJ-27](https://linear.app/arjun-wadhwa/issue/ARJ-27/005b-protected-wishlist-display-and-empty-state), comment ID `0e0ccbdc-5c7b-45ae-a7db-e40d6174aac6`.

| Round | Report | Result |
| --- | --- | --- |
| Original spec recovery | [Spec review](arj27-spec-review.md) | Changes requested: contradictory audience copy |
| Actual image review | [Visual review](arj27-visual-review.md) | Changes requested: divider collision and typography |
| Recovered implementation | [Code review](arj27-recovery-review.md) | Changes requested: seven correctness, privacy, and proof findings |
| Spec follow-up | [Spec re-review](arj27-spec-rereview.md) | Changes requested: propagate resolution 8 to required proof |
| Spec and plan | [Plan review](arj27-plan-review.md) | Spec approved; explicit provider-disabled browser proof missing |
| Plan follow-up | [Plan re-review](arj27-plan-rereview.md) | Plan approved; provider-disabled proof scheduled |
| Money transport addendum | [Independent addendum review](money-addendum-review.md) | Plan approved; exact full-bigint transport and formatting required |
| Recovery implementation | [Independent code and spec review](arj27-implementation-review.md) | Changes requested: separately obtain and inspect real Flight responses |
| Flight correction | [Independent scoped re-review](arj27-i1-rereview.md) | Source approved; real configured cases subsequently passed at both viewports |
| Configured execution | [CI c71f69d](../ci-c71f69d.md) | 233 database and 52 browser passes; four old-image mismatches and failed export |
| Screenshot export correction | [Author report](arj27-collector-fix-report.md) and [independent re-review](arj27-collector-review.md) | Bounded source correction approved at b50a5b3; actual CI artifact delivery and image review still required |

The [approved recovery implementation plan](arj27-recovery-implementation-plan.md) is preserved for audit. Its reviewed SHA-256 is `93d83c2dc56720b4640dce2f9b4d8cdf9312bb64e94d5f77eae20d722944ce03`. It schedules proof; it does not establish that proof passed.

The [money precision addendum](money-addendum.md), SHA-256 `68e3cd23f9a5f8877e45c34f320ff05dc84c30bceb85127fb29610eb1aa3f2c3`, supersedes Task 2's numeric amount interface and divide/toFixed instruction. A reproduced precision defect requires a read-time text cast and exact formatting, without changing schema or permissions. Its full approval and controller decision are [recorded on GitHub](https://github.com/arjunw7/get-me-this/pull/28#issuecomment-5916873593) and mirrored on ARJ-27, Linear comment `76b60ba6-23ed-422f-8cf5-242592f890ee`. Approval covers the plan, not its implementation or CI results.

Historical report paths refer to the isolated recovery checkout as it existed at review time. That checkout was subsequently relocated into the project with the original working diff unchanged. Reviewer text is preserved apart from punctuation normalization requested by the owner. The external journal records original source-report hashes.

## Gate at this checkpoint

The recovered code and images are not approved. Corrections are in progress. No final green CI or staging acceptance is claimed by this checkpoint. Later rounds must be added here and to both external logs before merge or task closure.

## Implementation handoff

The [author report](arj27-implementation-report.md) retains the failed formatting attempt, correction, successful local verification and decisions. The [provider-disabled browser proof](arj27-provider-disabled-proof.md) establishes six signed-out browser cases at both viewports on implementation commit `626aba6`; it does not establish configured database or image acceptance. The independent review covers audit head `2baa795`, whose executable code is identical. All three reports and the accepted correction are [published together on GitHub](https://github.com/arjunw7/get-me-this/pull/28#issuecomment-5917192916) and mirrored on ARJ-27, Linear comment `4ce98385-7a90-4d57-824b-7b4e39df0e38`.
