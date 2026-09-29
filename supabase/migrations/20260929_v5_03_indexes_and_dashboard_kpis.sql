-- v5 2.3 + 2.4 (applied as "v5_pagination_indexes_and_dashboard_kpis")
create index if not exists inquiries_created_at_idx on public.inquiries (created_at desc);
create index if not exists inventory_logs_created_at_idx on public.inventory_logs (created_at desc);
create index if not exists products_created_at_idx on public.products (created_at desc);
create or replace function public.admin_dashboard_kpis() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'revenue', coalesce((select sum(total_amount) from public.orders where status <> 'cancelled'), 0),
    'orders_total', (select count(*) from public.orders),
    'orders_pending', (select count(*) from public.orders where status = 'pending'),
    'low_stock', (select count(*) from public.products where stock_quantity <= low_stock_threshold),
    'inquiries_new', (select count(*) from public.inquiries where status = 'new'),
    'bookings_upcoming', (select count(*) from public.visit_bookings where visit_date >= (now() at time zone 'Asia/Manila')::date and status in ('pending','approved')),
    'products_active', (select count(*) from public.products where status = 'active'),
    'staff_online', (select count(*) from public.staff where last_seen_at > now() - interval '5 minutes'));
end $$;
revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;
-- ROLLBACK: drop function if exists public.admin_dashboard_kpis(); drop index if exists public.inquiries_created_at_idx, public.inventory_logs_created_at_idx, public.products_created_at_idx;
