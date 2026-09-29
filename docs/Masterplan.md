# Balay Tablea — v5 Masterplan

**Baseline:** `BalayTablea_v4_1_frontend.zip` (static HTML/CSS/JS, Netlify, Supabase project `mmbdewpfmybfkczczdhn`)
**Target:** v5 — admin console rework, shop rework, slimmer customer-facing sections
**This session's output:** this document only. No code, zip or database change has been made.

| Phase | What | Expected output |
|---|---|---|
| **1** | Frontend update | `BalayTablea_v5_frontend.zip`, ready to push to GitHub |
| **2** | Backend alignment | Direct Supabase changes (migrations, RPC, edge function) applied by Claude via the Supabase connector |

---

## 0. What I found in the codebase and the live project

I read `admin.html`, `js/admin.js`, `shop.html`, `js/shop.js`, `css/style.css` and `_headers`, and inspected the live Supabase schema, RLS policies, functions and edge functions (read-only). These findings shape the plan.

**Current state**

- `admin.js` fetches **every row** for every tab (`select('*')` with no limit). The dashboard downloads all orders, inquiries, bookings, products and staff just to compute 8 counters and show 5 rows each.
- The `staff` table has only `full_name`, `email`, `phone`, `role`, `status`, `last_seen_at`. There is **no first name, last name or date of birth**, so Staff Registration needs a schema change.
- Roles already exist as a hierarchy (`staff < manager < admin < owner`) via `has_role()`. `is_admin()` means "manager or above". The `staff` table only allows `authenticated` to UPDATE the `last_seen_at` column, so self-promotion is not possible. Good.
- `products` has `category`, `status`, `is_featured`, `sort_order`, but **no field for "online" vs "on-site only"**. That needs a new column.
- The shop already has a cart panel (`#cartPanel`) with a mobile bottom-sheet mode, and a legacy fallback column list in `supabase-client.js`. Both help us degrade gracefully.
- `section{padding:clamp(3rem,7vw,6.5rem) 0}` and `.page-hero{min-height:clamp(15rem,32vw,22rem)}` control most of the section height. Hero **content** also has its own top padding (`clamp(5rem,14vw,8rem)`), so shrinking `min-height` alone would barely change anything. The home hero and four utility pages also use inline `style=` overrides.

**Problems found that touch this work (fixes are folded into the plan)**

| # | Issue | Why it matters here |
|---|---|---|
| A | Edge function `create-staff-account` authorizes via the `admins` table and has **no downline rule**: any manager can create an `owner` (an upline). It also upserts on `email`, so a caller could overwrite an existing higher-role row. Passwords use `Math.random()`. `set-staff-status` needs the same review. | Registration must follow the **downline-only rule** (section R). The server has to enforce it, not just the UI. |
| B | `setupSessionCard` falls back to role `'admin'` when no staff row is found. | The new tab's visibility check must default to **least privilege**. |
| C | Dashboard "upcoming" compares against `new Date().toISOString().slice(0,10)` (UTC). | Between 00:00 and 08:00 Philippine time it uses yesterday's date. Fix while rewriting the dashboard. |
| D | DB allows order status `ready_for_pickup`, but the admin dropdown and badge CSS don't include it. | We are rewriting the orders loader anyway. Small fix. |
| E | `orders` allows anon `INSERT` with `with_check = true`. `place_order()` is the intended path, but a direct insert bypasses any rule inside it. | The new "on-site only" rule can be bypassed unless direct anon inserts are closed. **Verify `order_items` policy before relying on this.** |
| F | Migration `20260929120000_p1_staff_relink_on_signup.sql` from v4.1 is **still unapplied**. | Must be applied first in Phase 2 (or explicitly dropped). |

---

## R. Role hierarchy rule (confirmed)

**Rank:** `owner` (4) > `admin` (3) > `manager` (2) > `staff` (1). This matches the order already used by `has_role()` in the database.

**Rule:** a person can only create, and only manage (suspend / reactivate), accounts **strictly below** their own rank ("downline"). Never the same rank, never an upline.

| Caller | May create / manage | May NOT |
|---|---|---|
| Owner | admin, manager, staff | another owner |
| Admin | *(no registration access, see D5)* | — |
| Manager | staff | manager, admin, owner |
| Staff | nothing | everything |

- Enforced in **three layers**: UI (dropdown only lists allowed roles, buttons hidden), edge functions (authoritative, return 403), and a database trigger as a last line of defence (item 2.6b).
- Consequence: the existing owner cannot be suspended, edited or replaced by anyone else, including via a crafted request.
- Consequence: creating a second owner is not possible through the app. It would be a manual database action.

## A. Assumptions and open decisions

Some requests can be read two ways. I picked a default for each so work can start. **Please confirm or correct the ones marked ⚠️ before Phase 1 begins.**

| # | Request | Default I'll build | Alternative |
|---|---|---|---|
| ⚠️ D1 | Customer pages: "reduce the section height **be 1/3**" | Every `section`, hero `min-height` and hero top padding becomes **one-third** of today's value. Driven by one CSS variable `--sec-scale: .3333`. | "Reduce **by** one-third" means `--sec-scale: .6667`. One-line change either way. |
| ⚠️ D2 | Staff & Access: "Only display all logged in" | List only staff who have **signed in at least once** (`last_seen_at IS NOT NULL`), newest activity first. | Only staff **online right now** (active in last 5 min). Side effect of the default: staff who were invited but never logged in disappear from this tab, so they can't be suspended from there. |
| D3 | Staff Registration form | The five fields you listed **plus a Role selector** (required now because of the downline rule). Owner sees admin / manager / staff. Manager sees only "Staff" (fixed, not editable). Default is Staff. | Drop the selector and always create Staff. Then only the database could promote people later. |
| D4 | "Role Status" column | One combined column showing a role badge and a status badge stacked. | Two separate columns. |
| ⚠️ D5 | Registration tab visibility | **Owner and Manager only**, exactly as written. `admin` (which sits *above* manager) does **not** see it, so an admin can't register anyone even though they outrank managers. | Include `admin`, who could then create manager and staff. Tell me if the exclusion is intended. |
| D6 | Dashboard KPI cards | Keep all 8 cards, in one row on desktop, compact. On narrow screens the row scrolls horizontally. | Drop "Staff Online" now that the online list is removed. |
| D7 | On-site-only products | Show the **price** (as a reference) but no quantity controls or add-to-cart. Hide stock counts. | Hide the price too. |
| D8 | Booking sort | Bookings tab sorted **newest visit date first**. Today it's oldest first, which would put only past visits on page 1. | Keep oldest first. |
| D9 | Minimum staff age | DOB must be ≥ **18 years** ago (validated in UI and edge function). | 16 or none. |

---

# PHASE 1 — Frontend update

**Output:** `BalayTablea_v5_frontend.zip` — same folder layout as v4.1, plus `PATCH_NOTES_v5.md`, updated `README.md`, and a `.gitignore`.
**Guardrail:** the CSP forbids inline JS and `on*=` handlers. Everything continues to use `data-action` hooks and delegated listeners. After each workstream: `grep -nE ' on[a-z]+=' *.html` must return nothing.
**Deploy-safe before Phase 2:** every frontend change either works on today's schema or falls back gracefully (details in each workstream). Phase 2 can therefore be applied before *or* after the deploy.

## 1.1 Shared admin pagination (built once, used by 7 tabs)

**File:** `js/admin.js` (new section "Pager"), `admin.html` (footer containers), `admin.html` `<style>` (pager styles).

A small factory `createPager({ key, pageSize, fetchPage, renderRows, colspan })`:

- **Fetches only the active page** using `query.range(from, to)` with `{ count: 'exact' }` on the same request, so total pages come free with the first page. Pages 2..N are **never** prefetched.
- **Footer:** `‹` prev, page numbers, `›` next. Long lists use a window with ellipses (`1 … 4 5 6 … 20`). Prev/next disabled at the ends. Current page uses `aria-current="page"`. Controls are real `<button>`s with `data-page` attributes and one delegated click listener (CSP-safe). Also shows "Showing 11–20 of 47".
- **State per tab:** `{page, total, loading}`. Search boxes reset to page 1 (existing 250 ms debounce stays). A stale-response guard (request counter) prevents a slow earlier request from overwriting a newer one.
- **A tab loads only when opened** (already true via `switchTab`), and re-opening a tab keeps its current page.
- **After a mutation** (edit product, change order status, etc.) the current page is refetched. If a delete empties the last page, step back one page.
- Loading state: keep the current rows dimmed, don't blank the table (avoids layout jump).

**Applied to (page size 10):**

| Tab | Query change |
|---|---|
| Products | `products` + `.range()`, keeps name search |
| Inventory Logs | `inventory_logs` + `products(name)` join + `.range()` |
| Customer Orders | `orders` + `.range()`, keeps `.or()` search |
| Visit & Workshop Bookings | `visit_bookings` + `.range()`, order per D8 |
| Messages & Inquiries | `inquiries` + `.range()`, keeps search |
| Staff & Access | `staff` + `.range()`, filter per D2 |

Also select **only the columns each table displays** instead of `*` (smaller payload; also keeps date of birth out of the list responses).

**Acceptance**

- Network tab: opening Products sends exactly one request, returning ≤ 10 rows. Clicking page 3 sends exactly one more.
- Keyboard-only navigation works. No console CSP errors.
- Empty state and error state still render inside the table.

## 1.2 Admin Dashboard

**Files:** `admin.html` (markup + CSS), `js/admin.js` (`loadDashboard`).

1. **KPI cards — one horizontal row.** Merge the two `.kpi-grid` blocks into one: `display:grid; grid-template-columns:repeat(8,minmax(0,1fr))`. Reduce padding (~1.4rem → .6rem), value font (1.85rem → 1.1rem), label (.78rem → .65rem), subtext (.78rem → .65rem). Shorten labels so they don't wrap ("Revenue", "Orders", "Pending", "Low Stock", "Messages", "Visits", "Staff Online", "Active Products"). Below ~1100px the row becomes `overflow-x:auto` with scroll-snap (still one row). The existing 2-column / 1-column mobile rules are removed.
2. **Layout:**
   - Row 2: two equal cards side by side, **Recent Orders** and **Recent Messages**, latest **5** each.
   - Row 3: **Upcoming Bookings**, full width, latest **5**. Add columns since there's now room: Visitor, Date & time, Type, Pax, Status.
   - Stack to one column under 980px.
3. **Remove** the "Currently Online" list: markup, `.presence-*` dashboard usage, and the `dash-presence-list` code. The `.presence-*` CSS stays only where the sidebar session card still uses it.
4. **Data:** stop downloading all tables. Use three limited queries (`.limit(5)`) plus one KPI call:
   - Preferred: RPC `admin_dashboard_kpis()` (created in Phase 2, item 2.4).
   - **Fallback until the RPC exists:** count queries with `select('id', { count: 'exact', head: true })` plus filters, so it works on today's schema. The code tries the RPC first and falls back on a "function not found" error.
5. Upcoming bookings: server-side filter `visit_date >= today (Asia/Manila)` and `status in ('pending','approved')`, ordered by `visit_date` ascending, limit 5. Fixes issue C.
6. Keep the messages nav badge (needs `inquiries_new` count).

## 1.3 Staff & Access rework

**Files:** `admin.html`, `js/admin.js` (`loadStaff`).

- Columns become: **Full Name · Contact · Role / Status · Last Active · Actions**.
- **Downline rule on Actions:** Suspend / Reactivate is shown only for rows **below** the viewer's rank. Same-rank and higher-rank rows show a muted "—" (your own row still shows "You"). Staff-role viewers see no action buttons. The server re-checks this (2.6).
- Full Name = `first_name + last_name` when present, else `full_name` (works before and after Phase 2 backfill). The green "online" dot stays next to the name.
- Contact = email + phone (as now). Actions = Suspend/Reactivate (as now); "You" for your own row.
- Filter and pagination per D2 and 1.1.
- Remove the **Add Staff** button and `#staff-modal`, since registration moves to its own tab (1.4). Remove matching entries from `CLICK_ACTIONS`.

## 1.4 New tab: "Staff Registration" (Owner and Manager only)

**Files:** `admin.html` (nav item + `#sec-registration`), `js/admin.js`.

- **Role gating (UI):** `setupSessionCard` already loads the staff row. Store `CURRENT_ROLE` from it. **Default to no role / least privilege** if the row is missing (issue B). Show the nav item and section only when `CURRENT_ROLE` is `owner` or `manager` (per D5). `switchTab('registration')` must refuse and fall back to Dashboard if the role is wrong, so the section can't be reached by editing the DOM. This is convenience only; the real check is server-side (2.6).
- **Form fields:** First Name, Last Name, Date of Birth (`type="date"`, `max` = today − 18 years), Email, Phone Number, **Role** (per D3 and the rule in section R). The Role options are built from a single `ROLE_RANK` map: only roles with a rank **lower than** `CURRENT_ROLE` are listed. For a Manager that leaves just "Staff", shown as fixed text. Client validation: required fields, email format, PH mobile pattern (`09xx xxx xxxx` / `+63…`), age check.
- **Submit:** POST to the `create-staff-account` edge function with `{first_name, last_name, date_of_birth, email, phone, role}`. **Also send `full_name`** (first + last) so the current v1 function still works before Phase 2 is applied. The old function just won't store DOB and **won't enforce the downline rule**, which is why Phase 2 item 2.6 should be applied before the registration tab goes live to real users.
- **Result:** reuse the existing "temporary password shown once" success card. Warn that the password can't be viewed again.
- **After success:** reset the form, and refresh the Staff & Access page if it has already been loaded.
- Duplicate email → friendly "this email is already registered" message (edge function returns 409).
- **PII note:** date of birth is personal data (Data Privacy Act, RA 10173). It is never rendered in lists, never logged to the console, and only sent over the existing HTTPS/JWT call.

## 1.5 Admin Products form — sales channel field

**Files:** `admin.html` (product modal), `js/admin.js` (`editProduct`, save handler).

- Add a **Sales channel** select: *Sold online* (default) / *In-store only (display)*. Adds `sales_channel` to the create/update payload.
- Add a Channel column (or a small badge under Category) in the Products table.
- **Degrades gracefully:** if the column doesn't exist yet the save fails, so the UI catches the "column does not exist" error, retries without `sales_channel`, and shows a one-line toast.

## 1.6 Admin Orders — status fix (small)

**File:** `js/admin.js`, `admin.html` CSS.

Add `ready_for_pickup` to the status dropdown and add `.badge-ready_for_pickup` styling (issue D).

## 1.7 Shop page

**Files:** `shop.html`, `css/style.css`, `js/shop.js`, `js/supabase-client.js`, `js/cart.js`.

**a) Smaller product cards, 4 columns**
- `.shop-grid` becomes `repeat(4, minmax(0,1fr))` at ≥1100px, 3 columns at 800–1099px, 2 at 480–799px, 1 below that.
- Compact card: shorter image (aspect ~4:3 instead of tall), smaller title/price/description fonts, tighter padding, description clamped to 2 lines, smaller quantity stepper. Keep 44px minimum tap targets on the buttons (the stylesheet already enforces this for accessibility).

**b) Remove the "Your cart" container; add a collapsible right sidebar**
- Remove the two-column `.shop-layout` wrapper. The product grid uses the full page width.
- Move the existing `<aside id="cartPanel">` out of the grid, so it stays the same element with the same IDs (`cartLines`, `checkoutBtn`, `checkoutForm`, `tTotal` …). That means most of `shop.js` keeps working untouched.
- **Position:** `position:fixed; right:0; top:var(--header-h); height:calc(100dvh - var(--header-h)); width:min(380px, 100vw)`. It occupies the full remaining height **just below the header**. `--header-h` is measured with a `ResizeObserver` on the header plus the announcement bar (so it stays right when the announcement bar appears or the header wraps).
- **Hidden by default;** slides in with `transform`. Content scrolls inside the sidebar (`overflow-y:auto`); the Checkout button and totals are pinned in a sticky footer inside it so they're always reachable.
- **Toggle:** the header cart icon (currently a link to `#cart`) becomes a button that opens/closes it. A slim tab handle on the right edge also toggles it. The cart count badge stays. Adding an item does **not** force it open; the badge pulses briefly instead. State is remembered for the session.
- **Desktop ≥1200px:** opening the sidebar *pushes* content (`padding-right` on the shop area) so the grid stays at 4 columns. **Below 1200px:** it overlays with the existing dimmed backdrop.
- **Mobile:** the existing bottom "View cart" bar stays as the opener; the sidebar then goes full-width.
- **Accessibility:** `aria-expanded` on the toggle, `inert` on the sidebar while closed, `Esc` closes, focus moves into the sidebar on open and back to the toggle on close, focus trap only in overlay mode.
- `shop.js` changes are limited to `openCart`/`closeCart`/`isMobile` logic (lines ~34, ~227–247) and the media-query listener.

**c) Two product categories**
- Add a two-option switch above the existing category chips: **🛒 Order Online** and **🏠 In-Store Only**. URL hash carries it (e.g. `#channel=onsite`), like the existing search/sort state.
- **Online products:** as today (price, stock label, quantity stepper, add to cart).
- **In-store products (display only):** an "Available in store only" badge; price shown as a reference (D7); **no** stepper, **no** add-to-cart, **no** stock count; a "Visit us" link to `visit.html` instead. The product dialog follows the same rule.
- **Cart safety:** `validateCart()` also removes any cart line whose product is in-store only (covers stale carts in `localStorage`).
- **Data:** add `sales_channel` to the product column list. Rows without it default to `'online'`, so the site behaves like v4.1 until Phase 2 lands.
- JSON-LD: in-store items use `availability: https://schema.org/InStoreOnly`; the "paused" maintenance banner only affects the online tab.
- Update hero and section copy so it no longer says everything can be ordered online.

## 1.8 All customer-facing pages: section height to 1/3

**Files:** `css/style.css`, plus inline-style cleanup in `index.html`, `order-status.html`, `404.html`, `privacy.html`, `terms.html`.
**Pages:** `index, about, process, shop, recognition, visit, contact, order-status, 404, privacy, terms`.

Add tokens at the top of `style.css`:

```css
:root { --sec-scale: .3333; }            /* D1: use .6667 for "reduce by one-third" */
section { padding: clamp(calc(3rem*var(--sec-scale)), calc(7vw*var(--sec-scale)), calc(6.5rem*var(--sec-scale))) 0; }
.page-hero { min-height: clamp(calc(15rem*var(--sec-scale)), calc(32vw*var(--sec-scale)), calc(22rem*var(--sec-scale))); }
.page-hero .wrap { padding-top: clamp(calc(5rem*var(--sec-scale)), calc(14vw*var(--sec-scale)), calc(8rem*var(--sec-scale))); }
```

- The home hero's inline `min-height:clamp(26rem,60vw,38rem)` moves into a `.page-hero--home` class using the same scale. The four utility pages' inline `padding-block:clamp(3rem,7vw,5rem)` move into a shared class.
- Hero text can't shrink below its content, so at 1/3 the hero height will be content-driven with a floor. The **home hero** (title + lede + buttons) will end up taller than a literal 1/3; I'll check that it still looks intentional and tell you if a smaller scale for that one page is better.
- The `.hero` grid on the home page (`padding-top:clamp(3rem,8vw,6rem)`) is scaled too if it's on a `section`.
- Check the sticky header doesn't overlap hero titles at 320 / 375 / 768 / 1280 / 1920 px.

## 1.9 Packaging for GitHub

- Bump version in `README.md`; add `PATCH_NOTES_v5.md` (what changed, how to verify, Phase 2 dependency table); update the README's structure and "Recommended next steps".
- Add `.gitignore` (`.DS_Store`, `node_modules/`, `*.zip`, `.env*`).
- Cache-bust changed assets (`css/style.css?v=5`, `js/*.js?v=5`); update `_headers` if needed (CSP unchanged: no new hosts).
- Suggested flow: branch `feat/v5-admin-shop-ui`, one commit per workstream 1.1–1.8, open a PR, Netlify deploy preview, then merge.
- Build the zip as `BalayTablea_v5_frontend.zip` with the same top-level `BalayTablea/` folder.

## 1.10 Phase 1 test checklist

- **Admin (sign in as owner, manager and staff):** Registration tab visible only to owner and manager; hidden and unreachable for staff. Owner's Role list = admin / manager / staff; Manager's = Staff only. Suspend buttons appear only on rows below the viewer. Dashboard KPIs in one row at 1920/1440/1280 and scrollable on mobile; recent tables show ≤ 5 rows; no "Currently Online" panel. Every paginated tab: ≤ 10 rows, correct page numbers, one request per page, search resets to page 1.
- **Shop:** 4 columns at ≥1100px; no "Your cart" box in the page; sidebar closed by default, opens below the header at full remaining height, keeps checkout working end-to-end; in-store items show no purchase controls; a stale cart with an in-store item is cleaned.
- **Customer pages:** heights match D1 on all 11 pages; no clipped text at 320px.
- **Security/quality:** no inline handlers; no CSP violations in the console; Lighthouse accessibility not lower than v4.1.

---

# PHASE 2 — Backend changes (direct Supabase update)

**Output:** changes applied directly to project `mmbdewpfmybfkczczdhn` through the Supabase connector: migrations, one RPC, edge function v2, then verification. Every migration is additive and includes a `ROLLBACK` block (same convention as your v4.1 migration). Timestamps are later than the newest existing one (`20260929120000`).

## 2.0 Before touching anything

1. **Environment gate.** Your v4.1 notes say no staging project exists and prod changes need an explicit go-ahead. Options: (a) create a Supabase **development branch** and test there first (has a cost — I will check it with `get_cost` and `confirm_cost` before creating it), or (b) apply straight to production after you reply **"PROD"**. I won't apply anything to production without that word.
2. Run `get_advisors` (security + performance) **before** and **after**, and compare.
3. Back up what matters: export the `staff` table and the current `place_order` and `create-staff-account` definitions into the repo (`supabase/snapshots/`) so rollback is possible.
4. Resolve the unapplied `20260929120000_p1_staff_relink_on_signup.sql` (issue F): apply it first, or explicitly drop it.

## 2.1 `products.sales_channel` — migration `20260930000100`

```sql
alter table public.products
  add column if not exists sales_channel text not null default 'online'
  check (sales_channel in ('online','onsite'));

create index if not exists products_active_channel_sort_idx
  on public.products (status, sales_channel, sort_order);

-- ROLLBACK:
-- drop index if exists public.products_active_channel_sort_idx;
-- alter table public.products drop column if exists sales_channel;
```

- Existing 5 products (all `active`) become `online` automatically. Nothing changes visibly until you set one to `onsite`.
- The public read policy (`status = 'active'`) already lets anon see on-site products, so no policy change is needed for display.
- Decision to confirm at apply time: which existing products, if any, should be flipped to `onsite`.

## 2.2 `staff` identity columns — migration `20260930000200`

```sql
alter table public.staff
  add column if not exists first_name    text,
  add column if not exists last_name     text,
  add column if not exists date_of_birth date;

-- Backfill from full_name (last word = last name; single-word names -> first_name only)
update public.staff
   set first_name = coalesce(first_name, nullif(regexp_replace(btrim(full_name), '\s+\S+$', ''), '')),
       last_name  = coalesce(last_name,  nullif(substring(btrim(full_name) from '\S+$'), ''))
 where first_name is null and last_name is null;

alter table public.staff
  add constraint staff_dob_sane
  check (date_of_birth is null or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date - interval '18 years'));

-- Keep full_name (used by session card, edge functions) in sync automatically
create or replace function private.staff_sync_full_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.first_name is not null or new.last_name is not null then
    new.full_name := btrim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,''));
  end if;
  return new;
end $$;
create trigger trg_staff_sync_full_name before insert or update of first_name, last_name
  on public.staff for each row execute function private.staff_sync_full_name();

-- ROLLBACK:
-- drop trigger if exists trg_staff_sync_full_name on public.staff;
-- drop function if exists private.staff_sync_full_name();
-- alter table public.staff drop constraint if exists staff_dob_sane;
-- alter table public.staff drop column if exists date_of_birth, drop column if exists last_name, drop column if exists first_name;
```

- `full_name` stays NOT NULL and remains the display fallback, so nothing that reads it breaks.
- The DOB constraint mirrors D9. Existing rows have `NULL` DOB, which the constraint allows.
- DOB is only readable through the existing `is_admin()` (manager+) policy. `authenticated` still has UPDATE only on `last_seen_at`, so staff can't read others' DOB or edit anything. I'll re-verify this after the migration with a privilege query.

## 2.3 Pagination indexes — migration `20260930000300`

```sql
create index if not exists orders_created_at_idx         on public.orders (created_at desc);
create index if not exists inquiries_created_at_idx      on public.inquiries (created_at desc);
create index if not exists inventory_logs_created_at_idx on public.inventory_logs (created_at desc);
create index if not exists products_created_at_idx       on public.products (created_at desc);
create index if not exists visit_bookings_date_idx       on public.visit_bookings (visit_date desc, status);
create index if not exists staff_last_seen_idx           on public.staff (last_seen_at desc nulls last);
-- ROLLBACK: drop each index above.
```

Tables are tiny today (4–20 rows), so this is future-proofing, not a fix. `count: 'exact'` is fine at this scale. If any table passes ~50k rows, switch the pager to `count: 'estimated'` or a keyset approach. Advisors will confirm no duplicate or unused-index warnings.

## 2.4 Dashboard KPI RPC — migration `20260930000400`

One call replaces "download every table".

```sql
create or replace function public.admin_dashboard_kpis()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object(
    'revenue',           coalesce((select sum(total_amount) from public.orders where status <> 'cancelled'), 0),
    'orders_total',      (select count(*) from public.orders),
    'orders_pending',    (select count(*) from public.orders where status = 'pending'),
    'low_stock',         (select count(*) from public.products where stock_quantity <= low_stock_threshold),
    'inquiries_new',     (select count(*) from public.inquiries where status = 'new'),
    'bookings_upcoming', (select count(*) from public.visit_bookings
                           where visit_date >= (now() at time zone 'Asia/Manila')::date
                             and status in ('pending','approved')),
    'products_active',   (select count(*) from public.products where status = 'active'),
    'staff_online',      (select count(*) from public.staff where last_seen_at > now() - interval '5 minutes')
  );
end $$;
revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;
-- ROLLBACK: drop function if exists public.admin_dashboard_kpis();
```

Manila-timezone date fixes issue C on the server too. Verification: `anon` call fails; a staff-role user gets `FORBIDDEN`; manager+ gets the same numbers the old dashboard computed (compare against the current 4 orders / 5 products).

## 2.5 `place_order` — enforce "online only" — migration `20260930000500`

- Fetch the **complete** current definition with `pg_get_functiondef` (I've only seen the first part so far), then re-create it with one added guard where each product row is loaded:

```sql
if v_prod.sales_channel <> 'online' then
  raise exception 'NOT_ONLINE' using detail = jsonb_build_object('product_id', v_prod.id)::text;
end if;
```

- Frontend: map the `NOT_ONLINE` error to "This item is only available in store" and remove it from the cart (small addition to the error handler in `shop.js`).
- Only the guard is added; pricing, rate limiting, maintenance mode and honeypot logic are untouched.
- Rollback = restore the snapshot saved in 2.0.

**2.5b — close the bypass (issue E), migration `20260930000600`, conditional.** First check (read-only) the `order_items` policies and whether the frontend's "legacy" direct-insert path is still used in production. If `place_order` is the only live path, drop the anon `INSERT` policies on `orders` and `order_items`, and remove the legacy path in a follow-up frontend patch. If I find the legacy path is still in use, I'll stop and ask you, rather than break checkout.

## 2.6 Edge function `create-staff-account` v2

Deployed with the connector; `verify_jwt` stays `true`.

| Change | Why |
|---|---|
| Authorize the caller with the staff role (read the caller's `staff` row: role and `status <> 'suspended'`), not the `admins` table | Aligns with RLS and the UI (issue A) |
| **Downline rule:** `rank(requested_role) < rank(caller_role)` or → **403**. So owner → admin / manager / staff; manager → staff only; staff and unknown roles → 403. Requesting `owner` is always rejected | Implements section R on the server. Unknown or missing role no longer silently becomes `staff`; it is a 400 |
| Registration tab access (owner and manager only, D5) is also checked here, not just in the UI | A hidden tab is not a security control |
| Accept `first_name, last_name, date_of_birth, email, phone, role` (and still accept `full_name` for old clients) | New form |
| Validate: names 1–60 chars, email format, PH phone pattern, DOB ≥ 18 years and ≥ 1900 | Never trust the browser |
| `insert` into `staff` (no `upsert onConflict email`); on conflict return **409** with a clear message | Prevents overwriting an existing staff or owner row |
| Password from `crypto.getRandomValues` (14+ chars) instead of `Math.random()` | Cryptographically secure temp password |
| If the staff insert fails after the auth user was created, **delete the auth user** | Avoids orphaned logins |
| Stop relying on `public.admins` for authorization | Table is otherwise unused by RLS. Decide separately whether to drop it (not in this scope) |

Optional (recommended, needs your OK): store `must_change_password: true` in user metadata so the frontend can prompt a password change at first login.

**`set-staff-status` v2 (now required, not optional).** Same rule: the caller may change status only for a target whose rank is **strictly lower** than theirs. Also reject targeting yourself. I'll read the current source first, then deploy v2 with these checks. Result: a manager cannot suspend another manager, an admin or the owner, even by calling the function directly.

### 2.6b Database last line of defence — migration `20260930000250`

An edge function is not the only way to write to `staff`, so a trigger blocks any role escalation that slips past it. Service-role calls (the edge functions) still identify the real caller by passing the caller's user id, so the check works for both paths.

```sql
create or replace function private.staff_enforce_downline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rank_of constant jsonb := '{"staff":1,"manager":2,"admin":3,"owner":4}';
  caller_role text;
begin
  -- only guard inserts and role changes made by an authenticated end user
  if auth.uid() is null then return new; end if;   -- service-role / migrations / SQL editor
  select role into caller_role from public.staff
   where auth_user_id = auth.uid() and status <> 'suspended';
  if caller_role is null
     or (rank_of->>new.role)::int >= (rank_of->>caller_role)::int then
    raise exception 'FORBIDDEN_ROLE' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_staff_enforce_downline
before insert or update of role on public.staff
for each row execute function private.staff_enforce_downline();

-- ROLLBACK:
-- drop trigger if exists trg_staff_enforce_downline on public.staff;
-- drop function if exists private.staff_enforce_downline();
```

Note: because edge functions use the service role, `auth.uid()` is null there, so the trigger mostly protects against any future direct client write. The edge-function check remains the primary control. I'll confirm this behaviour in a test before relying on it, and adjust the trigger if it turns out differently.

## 2.7 Verification runbook (run after each step)

1. `list_migrations` shows the new versions in order, and `list_tables` (verbose) shows the new columns.
2. SQL checks: `sales_channel` distribution; `first_name/last_name` backfill result for the existing owner row; index list.
3. RPC checks as `anon` (must fail), `staff` (must fail) and `manager+` (must succeed).
4. Edge function checks with test callers (owner, manager, staff) against the role matrix in section R. Must-pass cases:
   - Owner creates admin / manager / staff → **200**. Owner creates owner → **403**.
   - Manager creates staff → **200**. Manager creates manager / admin / owner → **403**.
   - Staff creates anything → **403**. Suspended manager creates staff → **403**.
   - Manager suspends staff → **200**. Manager suspends another manager, an admin or the owner → **403**. Anyone suspends themselves → **403**.
   - Duplicate email → **409**, and the existing row is unchanged.
   Test accounts are deleted afterwards.
5. Place a real test order for an `online` product (must succeed) and for an `onsite` product (must fail with `NOT_ONLINE`). Cancel/clean up the test order.
6. `get_advisors` after, compared with the "before" snapshot. No new warnings.
7. Update `supabase/migrations/` in the repo with the applied files so GitHub and the database stay in sync, and note it in `PATCH_NOTES_v5.md`.

## 2.8 Frontend ↔ backend dependency map

| Frontend feature | Works before Phase 2? | Needs |
|---|---|---|
| Pagination (all tabs) | ✅ Yes | Indexes are optional |
| Dashboard layout | ✅ Yes (count-query fallback) | RPC 2.4 for a single call |
| Staff & Access columns / filter | ✅ Yes (falls back to `full_name`) | 2.2 for real first/last names |
| Staff Registration form | ⚠️ Partly. Creates accounts, DOB not stored, **downline rule NOT enforced server-side** | 2.2 + 2.6 + 2.6b |
| Suspend / Reactivate rules | ⚠️ UI hides buttons, but the server doesn't yet block a direct call | `set-staff-status` v2 (2.6) |
| Shop 4 columns + sidebar | ✅ Yes | — |
| Online / in-store split | ⚠️ Everything shows as "online" | 2.1 (+ 2.5 to enforce) |
| Section heights | ✅ Yes | — |

---

## S. Suggested order of work

1. **You confirm D1, D2 and D5** (the rest can stay as defaults; the downline rule in section R is already settled in section R).
2. **Phase 1**, in this order: 1.1 pager → 1.2 dashboard → 1.3/1.4 staff → 1.5/1.6 products & orders → 1.7 shop → 1.8 section heights → 1.9 packaging → 1.10 tests. Deliver the zip.
3. **You review** the zip (deploy preview).
4. **Phase 2**: 2.0 gate ("PROD" go-ahead or dev branch) → 2.1 → 2.2 → 2.3 → 2.4 → 2.6 (+ set-staff-status v2) → 2.6b → 2.5 → 2.5b (if safe) → 2.7 verification.
5. Final: sync migration files into the repo and tag `v5.0.0`.

## O. Out of scope (noticed, not touched)

- `js/dev-stubs.js` still ships, and hot-linked third-party images and jsDelivr remain whitelisted in the CSP (already listed in your v4.1 notes).
- Dropping `public.admins`, adding admin UI for announcements/storefronts, and email/SMS notifications (README "next steps").
