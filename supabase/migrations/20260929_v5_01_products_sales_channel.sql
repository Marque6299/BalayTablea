-- v5 2.1 (applied to prod as "v5_products_sales_channel")
alter table public.products add column if not exists sales_channel text not null default 'online';
alter table public.products drop constraint if exists products_sales_channel_check;
alter table public.products add constraint products_sales_channel_check check (sales_channel in ('online','onsite'));
create index if not exists products_active_channel_sort_idx on public.products (sales_channel, sort_order, created_at) where status = 'active';
-- ROLLBACK: drop index if exists public.products_active_channel_sort_idx; alter table public.products drop constraint if exists products_sales_channel_check; alter table public.products drop column if exists sales_channel;
