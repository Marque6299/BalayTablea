-- v5 2.6b (applied as "v5_staff_enforce_downline"). Defence in depth: authenticated users currently
-- have no INSERT/UPDATE(role) privilege on staff at all; the edge functions do the primary check.
create or replace function private.staff_enforce_downline() returns trigger language plpgsql security definer set search_path = '' as $$
declare rank_of constant jsonb := '{"staff":1,"manager":2,"admin":3,"owner":4}'; caller_role text;
begin
  if (select auth.uid()) is null then return new; end if;
  select s.role into caller_role from public.staff s where s.auth_user_id = (select auth.uid()) and s.status <> 'suspended' limit 1;
  if caller_role is null or (rank_of->>new.role)::int >= (rank_of->>caller_role)::int then raise exception 'FORBIDDEN_ROLE' using errcode = '42501'; end if;
  return new;
end $$;
revoke all on function private.staff_enforce_downline() from public, anon, authenticated;
drop trigger if exists trg_staff_enforce_downline on public.staff;
create trigger trg_staff_enforce_downline before insert or update of role on public.staff for each row execute function private.staff_enforce_downline();
-- ROLLBACK: drop trigger if exists trg_staff_enforce_downline on public.staff; drop function if exists private.staff_enforce_downline();
