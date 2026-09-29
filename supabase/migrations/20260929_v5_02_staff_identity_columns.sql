-- v5 2.2 (applied as "v5_staff_identity_columns")
alter table public.staff add column if not exists first_name text, add column if not exists last_name text, add column if not exists date_of_birth date;
update public.staff set
  first_name = case when position(' ' in btrim(full_name)) > 0 then regexp_replace(btrim(full_name), '\s+\S+$', '') else btrim(full_name) end,
  last_name  = case when position(' ' in btrim(full_name)) > 0 then substring(btrim(full_name) from '\S+$') else null end
 where first_name is null and last_name is null;
alter table public.staff drop constraint if exists staff_dob_sane;
alter table public.staff add constraint staff_dob_sane check (date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date - interval '18 years'));
create or replace function private.staff_sync_full_name() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.full_name := btrim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,''));
  end if;
  return new;
end $$;
revoke all on function private.staff_sync_full_name() from public, anon, authenticated;
drop trigger if exists trg_staff_sync_full_name on public.staff;
create trigger trg_staff_sync_full_name before insert or update of first_name, last_name on public.staff for each row execute function private.staff_sync_full_name();
-- ROLLBACK: drop trigger if exists trg_staff_sync_full_name on public.staff; drop function if exists private.staff_sync_full_name(); alter table public.staff drop constraint if exists staff_dob_sane; alter table public.staff drop column if exists date_of_birth, drop column if exists last_name, drop column if exists first_name;
