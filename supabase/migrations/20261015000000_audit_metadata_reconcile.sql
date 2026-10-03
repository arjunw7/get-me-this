-- 007c/008c reconciliation of the shared audit metadata allowlist.
--
-- Both slices amend private.audit_metadata_is_safe: 007c
-- (20261010000002_reservations.sql) adds item_id and reservation_id; 008c
-- (20261012020000_secret_draw.sql) adds the three draw keys. Because
-- migrations run in version order, 008c's body would win in the union tree
-- and silently reject reservation audit metadata, failing the CHECK on
-- public.audit_events for every reservation event. This migration restores
-- the union of both amendments: exactly the 006a/006b keys plus the two
-- reservation keys plus the three draw keys. No key outside this list is
-- ever permitted, and no assignment-bearing or giver-identity key is added.

create or replace function private.audit_metadata_is_safe(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_metadata is null then true
    when jsonb_typeof(p_metadata) <> 'object' then false
    else coalesce(
      (
        select bool_and(
          e.k = any (
            array[
              'invitation_id',
              'membership_generation',
              'target_user_id',
              'previous_organizer_id',
              'new_organizer_id',
              'migration_version',
              'reason',
              'item_id',
              'reservation_id',
              'draw_version',
              'previous_draw_version',
              'participant_count'
            ]
          )
          and jsonb_typeof(e.v) = any (array['string', 'number'])
        )
        from jsonb_each(p_metadata) as e(k, v)
      ),
      true
    )
  end
$$;

comment on function private.audit_metadata_is_safe(jsonb) is
  'CHECK helper (007c+008c reconciliation): audit metadata is a bounded object of identifier/generation keys only; 006b''s two system migration keys, 007c''s item_id and reservation_id, and 008c''s three draw keys are all admitted. Nothing else.';
