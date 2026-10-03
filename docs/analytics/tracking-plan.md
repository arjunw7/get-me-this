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

| Event                          | Source | Required properties                                                 |
| ------------------------------ | ------ | ------------------------------------------------------------------- |
| `auth_completed`               | server | `method`, `is_new_user`                                             |
| `onboarding_completed`         | server | `avatar_selected`                                                   |
| `group_created`                | server | `occasion_type`, `gifting_mode`, `currency`, `has_budget_cap`       |
| `invite_sent`                  | server | `channel`, `group_member_count_bucket`                              |
| `invite_accepted`              | server | `was_authenticated`                                                 |
| `wishlist_item_added`          | server | `entry_method`, `has_price`, `has_image`                            |
| `product_extraction_completed` | server | `outcome`, `duration_bucket`, `manual_fallback_offered`             |
| `gifting_mode_selected`        | server | `gifting_mode`, `changed_from_existing`                             |
| `name_draw_completed`          | server | `participant_count_bucket`, `is_redraw`                             |
| `group_activated`              | server | `gifting_mode`, `member_count_bucket`, `time_to_activation_bucket`  |
| `gift_checklist_progressed`    | server | `action`, `checklist_total_bucket`                                  |
| `member_wishlist_viewed`       | server | `view_scope`, `wishlist_state`, `item_count_bucket`, `gifting_mode` |
| `group_activity_viewed`        | server | `scope`, `entry_count_bucket`, `gifting_mode`                       |
| `item_reacted`                 | server | `reaction_kind`, `action`                                           |
| `reservation_created`          | server | `outcome`, `gifting_mode`                                           |
| `reservation_released`         | server | `reason`, `gifting_mode`                                            |

Allowed enum values are defined in the typed analytics catalog during Phase 1. Do not add arbitrary strings from user content.

`gift_checklist_progressed` (added by 008b): server-emitted only, after a
successful authorization, exactly once per committed checklist status change.
Properties: `action` (`completed` | `reopened`) and `checklist_total_bucket`
(`one_to_five` | `six_to_ten` | `eleven_plus`). Every denial class, the
authorized-empty sentinel, and a conflict result emit nothing. Recipient
identities, giver-recipient mappings, entry counts below the bucket
granularity, group names, and item data are prohibited.

Closed property vocabularies for the gifting-social events (briefs 007a/007c; no identifiers, counts, names, titles, or timestamps are ever sent with them):

- `member_wishlist_viewed` (added by 006e): server-emitted only, after
  successful authorization, exactly once per authorized page render (a
  refresh is a new event). Properties: `view_scope` (`own` | `friend`),
  `wishlist_state` (`populated` | `empty`), `item_count_bucket` (`zero` |
  `one_to_five` | `six_to_ten` | `eleven_plus`), and `gifting_mode`
  (`secret_draw` | `gift_everyone` | `wishlist_only`). No other property,
  identifier, or count is sent: no group IDs (this event does not attach
  the group context), user IDs, member names, titles, URLs, notes, prices,
  currencies, or item IDs. Every denial class — signed-out, incomplete
  profile, outsider, pending, declined, left, removed, cross-group, stale
  target, unknown group — emits no event at all.

- `group_activity_viewed` (added by 007d): server-emitted only, after
  successful authorization, exactly once per authorized group-room render
  (a refresh is a new event). Properties: `scope` (`group`),
  `entry_count_bucket` (`zero` | `one_to_five` | `six_to_twenty` |
  `twenty_one_plus` — counted over the viewer's visible entries only, so
  the bucket cannot reveal withheld entries), and `gifting_mode`
  (`secret_draw` | `gift_everyone` | `wishlist_only`). No other property,
  identifier, or count is sent: no item, group, user, reservation, or event
  ids, no titles, no kinds, no timestamps. Every denial class emits no
  `group_activity_viewed` event and no other new event.

- `item_reacted`: `reaction_kind` is `very_you`, `questionable`, or `want_it_too`; `action` is `added`, `replaced`, or `removed`. Emitted only after a successful write, exactly once per successful call; every denial class emits nothing.
- `item_copied` (added by 007b): server-emitted only, after a successful
  copy path, exactly once per call. Properties: `copy_outcome`
  (`created` | `already_copied`). No other property is sent: no user,
  group, item, member, or copied-item IDs, no titles, URLs, prices,
  currencies, or counts. Every denial class — signed-out, outsider,
  pending, declined, left, removed, cross-group, unknown group/item,
  invisible extraction state, own item — and every generic failure emits
  no event at all. The event never reveals to the source owner or any
  third party that an item was copied, by whom, or how often.
- `reservation_created`: `outcome` is `reserved` — the only emitting outcome; `already_yours`, `conflict`, and every denial never emit. `gifting_mode` is `secret_draw`, `gift_everyone`, or `wishlist_only`.
- `reservation_released`: `reason` is `by_reserver` or `reserver_departed` (never emitted for `item_deleted`); `gifting_mode` as above. Emitted only for a release that changes state.

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
