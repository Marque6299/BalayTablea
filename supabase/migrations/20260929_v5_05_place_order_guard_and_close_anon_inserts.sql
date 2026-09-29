-- v5 2.5 + 2.5b (applied as "v5_place_order_online_only_guard" and "v5_close_anon_direct_order_inserts")
-- 1) public.place_order(): unchanged except this guard inside the product loop, right after the PRODUCT_UNAVAILABLE check:
--      if v_prod.sales_channel <> 'online' then
--        raise exception 'NOT_ONLINE' using detail = jsonb_build_object('product_id', v_prod.id, 'name', v_prod.name)::text;
--      end if;
--    Full function body lives in the database; export it with `supabase db pull` to keep this repo in sync.
-- 2) place_order() is the only live checkout path (api_contract_version() = 1), so anon direct inserts are closed:
drop policy if exists "Public create orders" on public.orders;
drop policy if exists "Public create order items" on public.order_items;
-- ROLLBACK: create policy "Public create orders" on public.orders for insert to anon with check (true);
--           create policy "Public create order items" on public.order_items for insert to anon with check (true);
