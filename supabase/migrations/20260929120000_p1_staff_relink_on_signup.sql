-- P1 hardening: re-link an unlinked staff row when its auth user (re)appears.
-- Why: staff.auth_user_id is ON DELETE SET NULL, so deleting + recreating the
-- owner's auth user silently dropped all RLS access (admin login "worked" but
-- every query returned nothing). This makes that recovery automatic.
--
-- STATUS: NOT YET APPLIED. Apply to STAGING first; prod only on explicit PROD go-ahead.
-- Run get_advisors (security + performance) before and after.

create schema if not exists private;

create or replace function private.link_staff_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only link confirmed emails, and only rows that are currently unlinked.
  -- (Without the confirmed-email guard, anyone who could sign up with a staff
  -- email before confirming it could inherit that staff role.)
  if new.email_confirmed_at is not null then
    update public.staff s
       set auth_user_id = new.id
     where s.auth_user_id is null
       and lower(s.email) = lower(new.email);
  end if;
  return new;
end;
$$;

revoke all on function private.link_staff_on_signup() from public, anon, authenticated;

drop trigger if exists trg_link_staff_on_signup on auth.users;
create trigger trg_link_staff_on_signup
after insert or update of email_confirmed_at on auth.users
for each row execute function private.link_staff_on_signup();

-- ROLLBACK:
-- drop trigger if exists trg_link_staff_on_signup on auth.users;
-- drop function if exists private.link_staff_on_signup();
