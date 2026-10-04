-- 007c (part 1 of 2): audit event vocabulary for reservations.
--
-- Forward-only migration implementing the binding brief
-- docs/delivery/issues/007c-atomic-private-reservations.md (006a amendment
-- 1 of 2: the two new audit event values). Shipped as its own migration
-- because an added enum value cannot be used by statements in the same
-- migration transaction; runtime appends are unaffected.
--
-- Never edit this file once applied anywhere; fix forward.

alter type public.group_audit_event_type add value 'item_reserved';
alter type public.group_audit_event_type add value 'reservation_released';
