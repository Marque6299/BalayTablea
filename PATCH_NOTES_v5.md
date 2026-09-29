# Balay Tablea v5 — Phase 1 (frontend) patch notes

Baseline: v4.1. See `docs/Masterplan.md` for the full plan (Phase 2 = Supabase changes).

## What changed
**Admin (`admin.html`, `js/admin.js`)**
- Dashboard: 8 compact KPI cards in one row (scrolls sideways under 1200px); Recent Orders + Recent Messages side by side (5 rows each); Upcoming Bookings full width (5 rows); "Currently Online" list removed. Upcoming uses Philippine-time "today".
- Products, Inventory Logs, Orders, Bookings, Messages, Staff: 10 rows/page, footer with page numbers + prev/next. Only the active page is requested; a tab loads only when opened. Columns selected explicitly instead of `select('*')`.
- Staff & Access: columns Full Name / Contact / Role-Status / Last Active / Actions; lists only staff who have signed in; Suspend/Reactivate shown only for roles below yours. "Add Staff" modal removed.
- New tab **Staff Registration** (Owner + Manager only; hidden and guarded in `switchTab`). Fields: First/Last name, DOB (18+), Email, PH phone, Role (only roles below yours: owner -> admin/manager/staff, manager -> staff).
- Product form: new **Sales Channel** (online / in-store only). Orders: `ready_for_pickup` status added.

**Shop (`shop.html`, `js/shop.js`, `css/style.css`)**
- 4-column compact product grid (3 / 2 / 1 on smaller screens).
- "Your cart" box removed; cart is a hidden, collapsible right sidebar directly under the header, full remaining height. Header cart icon and a right-edge tab toggle it. >=1200px it pushes content; below that it overlays with focus trap. Esc closes.
- Two channels: **Order Online** and **In-Store Only** (display only, no purchase controls). Stale carts drop in-store items.

**All customer pages (`css/style.css`)**
- Section and hero heights scaled to one third via `--sec-scale` (`:root`, default `.3333`; use `.6667` for "reduce by one third"). Inline hero styles replaced by classes.

**Other:** assets cache-busted `?v=5`; `.gitignore` added.

## Phase 2 — APPLIED to production (project mmbdewpfmybfkczczdhn)
| Change | Result |
|---|---|
| `products.sales_channel` (`online`/`onsite`, default `online`) | All 5 existing products are `online`. Flip products to `onsite` from the admin product form. |
| `staff.first_name / last_name / date_of_birth` + backfill + name-sync trigger + 18+ check | Owner row backfilled ("Owner" / "Admin"). |
| Indexes | Only 3 added (inquiries, inventory_logs, products by created_at). `orders`, `visit_bookings`, `staff` were already covered. |
| `admin_dashboard_kpis()` RPC (manager+ only, Manila-time) | Owner call OK; anon = permission denied; non-staff = FORBIDDEN. |
| `place_order()` guard `NOT_ONLINE` | Online product ordered OK; in-store product blocked. Tested inside rolled-back transactions, no test data left. |
| Closed anon direct INSERT on `orders` / `order_items` | `place_order()` still works for anon; direct insert is blocked by RLS. |
| Edge functions `create-staff-account` v3 and `set-staff-status` v2 | Downline-only rules, 409 on duplicate email, crypto password, CORS. No longer use the `admins` table (nothing else referenced it). |
| Trigger `trg_staff_enforce_downline` | Defence in depth only: signed-in users have no INSERT/UPDATE(role) privilege on `staff` anyway. |

Sources: `supabase/migrations/20260929_v5_*.sql`, `supabase/functions/*/index.ts`. The full `place_order` body is in the database; run `supabase db pull` to export it.

**Not tested end to end:** the two edge functions with real owner/manager/staff logins (I had no user JWTs). Run the role matrix in `docs/Masterplan.md` 2.7 step 4 from the admin UI.

## Verify
Sign in as owner / manager / staff and run the checklist in `docs/Masterplan.md` section 1.10. Network tab: opening Products sends one request returning <=10 rows.
