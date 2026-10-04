-- Commit enum values before the deletion function uses them.
alter type public.group_status add value 'deleted';
alter type public.group_audit_event_type add value 'group_deleted';
