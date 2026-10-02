# PostHog tracking plan

## Measurement goal

Measure whether a person can turn an occasion into a useful shared wishlist group. Prefer a small, stable vocabulary over recording every click.

## Activation definition

An **activated group** has:

- at least three accepted members; and
- at least two distinct members who have each published at least one wishlist item.

The server emits `group_activated` once per group when this threshold is first crossed. This is the primary activation event for v1.

## Initial funnel

1. `auth_completed`
2. `group_created`
3. `invite_sent`
4. `invite_accepted`
5. `wishlist_item_added`
6. `group_activated`

Secondary quality signals are extraction reliability and gifting-mode completion.

## Event catalog

| Event | Source | Required properties |
| --- | --- | --- |
| `auth_completed` | server | `method`, `is_new_user` |
| `onboarding_completed` | server | `avatar_selected` |
| `group_created` | server | `occasion_type`, `gifting_mode`, `currency`, `has_budget_cap` |
| `invite_sent` | server | `channel`, `group_member_count_bucket` |
| `invite_accepted` | server | `was_authenticated` |
| `wishlist_item_added` | server | `entry_method`, `has_price`, `has_image` |
| `product_extraction_completed` | server | `outcome`, `duration_bucket`, `manual_fallback_offered` |
| `gifting_mode_selected` | server | `gifting_mode`, `changed_from_existing` |
| `name_draw_completed` | server | `participant_count_bucket`, `is_redraw` |
| `group_activated` | server | `gifting_mode`, `member_count_bucket`, `time_to_activation_bucket` |
| `gift_checklist_progressed` | server | `action`, `checklist_total_bucket` |

Allowed enum values are defined in the typed analytics catalog during Phase 1. Do not add arbitrary strings from user content.

`gift_checklist_progressed` (added by 008b): server-emitted only, after a
successful authorization, exactly once per committed checklist status change.
Properties: `action` (`completed` | `reopened`) and `checklist_total_bucket`
(`one_to_five` | `six_to_ten` | `eleven_plus`). Every denial class, the
authorized-empty sentinel, and a conflict result emit nothing. Recipient
identities, giver-recipient mappings, entry counts below the bucket
granularity, group names, and item data are prohibited.

## Identity

- Use the internal Supabase user UUID as the PostHog distinct ID after authentication.
- Do not set email, name, avatar URL, or other direct identifiers as person properties.
- Before authentication, use PostHog's anonymous identifier and alias it once after successful authentication.
- Group analytics may use an internal group UUID; never use the group name.

## Prohibited data

Never send:

- Email addresses, names, handles, or invitation tokens.
- Product names, descriptions, notes, URLs, images, or merchant-specific identifiers.
- Group names or free-form occasion labels.
- Wishlist ownership/member mappings.
- Private draw assignments, recipients, reservations, purchase status, or reaction targets.
- Raw prices or budget values. Use booleans or coarse, pre-approved buckets only if a question requires them.
- Error payloads, stack traces, or network responses that may contain user content.

## Session replay

- Start disabled until the privacy configuration is verified in staging.
- Mask all text inputs and textareas.
- Block email, OTP, invitation, wishlist notes, extraction results, assignment, and reservation regions.
- Sample conservatively and define a short retention period for launch.
- Recheck masking whenever a new input or sensitive view is introduced.

## Feature flags

Flags are allowed for controlled rollout and experiments. Every flag needs an owner, hypothesis, success metric, guardrail, and removal date. Never use a flag as an authorization control.

## Verification

- Unit tests assert event names, allowed properties, and enum values.
- A development test sink makes emitted events inspectable without contacting PostHog.
- Staging uses synthetic accounts and confirms that prohibited data is absent.
- PostHog dashboards begin with activation, invite conversion, extraction success, and gifting-mode completion.

