# Balay Tablea — v4 patch notes (front-end)

This patch implements the **front-end** portion of `BalayTablea_Improvement_Plan.md`
(Part 2, tasks `FE-P-xx` / `FE-X-xx` / the no-backend-needed slice of `FE-A-xx`).
It does **not** touch Supabase (no new tables, RPCs, or Edge Functions were
created) — see "What's still open" below for what depends on the backend
agent's `SB-xx` work.

## What changed

### Cross-cutting (FE-X)
- **FE-X-01 — Shared UI kit.** New `js/ui.js`: toasts, form-field error
  helpers, a real focus trap, the mobile nav, and the cart-count badge. Every
  public page now loads it. Skip-to-content link, visible `:focus-visible`
  rings, and `prefers-reduced-motion` support added site-wide.
- **FE-X-02 — Colour contrast.** `--accent` on white text was 3.19:1 (fails
  WCAG AA); introduced `--accent-strong` (`#B45309`, 5.02:1) for filled
  buttons. `--text-disabled` and other low-contrast text tokens raised to
  pass AA. Same fixes applied to `admin.html`'s separate token set, plus its
  `.btn-danger` (white on `#EF4444` was 3.76:1 → now `#DC2626`, 4.83:1).
- **FE-X-03 — Owned imagery.** `img/logo.png` (306 KB, 591×414 for a 40px
  display) cropped and re-encoded as `img/logo.webp` (5 KB). Generated
  `img/og-default.jpg`, an owned 1200×630 share image, replacing the
  hotlinked `simpol.ph` image in every page's `og:image`/JSON-LD.
  **Not fully done:** product/story photography on `shop.html`, `about.html`,
  etc. still hot-links `simpol.ph` / `region6.dost.gov.ph` — flagged in
  `_headers`' CSP comment and left for the owner to supply real photos or
  licensing confirmation before removal.
- **FE-X-04 — `window.BT` data layer.** Rewrote `js/supabase-client.js`:
  feature-detects the backend contract version (`api_contract_version()`,
  cached per tab), maps RPC errors to the plan's `{code, detail}` shape, and
  runs every new-contract call (`place_order`, `submit_inquiry`,
  `submit_visit_booking`, availability, settings) behind a **legacy
  fallback** to the old direct-table inserts so the site keeps working
  before the backend milestones land. Legacy paths are commented
  `LEGACY (delete in FE-X-06)` for easy removal later.
- **FE-X-05 — Security headers / SEO files.** Added `_headers` (CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS,
  `noindex` on `admin.html`/`order-status.html`), `netlify.toml` (custom
  404), updated `robots.txt` to disallow `/admin.html`, added `privacy.html`
  / `terms.html` to `sitemap.xml`.

### Public site (FE-P)
- **FE-P-01 — Nav/header/footer.** Cart icon with a live item-count badge on
  every page, linking to `shop.html#cart`. Mobile menu is a proper dialog
  (`Esc`, focus trap, closes on outside click). Footer now shows
  hours/phone from live settings and links to the new legal pages.
- **FE-P-02 — Home page.** Added a "Featured" product strip (hidden
  gracefully if nothing is marked featured) and wired the storefront teaser
  to live data.
- **FE-P-03 — Site settings → live content.** `js/main.js` now paints every
  `[data-setting]` element from `site_settings` (5-minute cache,
  stale-while-revalidate), with the original hard-coded text as the offline
  fallback.
- **FE-P-04 — Shop rebuild.** This was the biggest piece:
  - Cart now persists in `localStorage` (`js/cart.js`) and **survives a
    refresh** — the mobile "cart drops below the grid" bug (A19) is gone;
    cart is a bottom-sheet on mobile with a sticky "View cart · ₱total" bar.
  - Category chips, search, sort; a product detail dialog; per-product qty
    stepper that respects live stock.
  - Checkout now has an explicit **pickup vs. delivery** choice, a payment
    method choice, and a real totals breakdown (subtotal / shipping / total)
    — all driven by settings once the new contract is live, and hidden
    gracefully (pickup-only, no shipping row) on the legacy path.
  - **Client never sends price.** `place_order` is called with
    `{product_id, quantity}` only; the legacy fallback (pre-M1) still prices
    order lines client-side because there's no other option until `SB-04`
    ships — this is called out explicitly in the code as the thing to delete.
  - Full error handling for `OUT_OF_STOCK`, `PRODUCT_UNAVAILABLE`,
    `RATE_LIMITED`, `CLOSED` (maintenance mode), and field-level
    `INVALID_INPUT`.
- **FE-P-05 — Contact & wholesale.** One form, typed by reason (general /
  wholesale / sourcing / press) with conditional fields, honeypot,
  server-mapped field errors.
- **FE-P-06 — Visit booking.** Date/pax validated against live availability
  (closed days, full days, remaining capacity), configurable time slots and
  lead time from settings, and an **`.ics` download** on confirmation.
- **FE-P-07 — Order tracking.** Rebuilt `order-status.html` around
  `get_order_status(order_number, email)`: status pill, a path-aware step
  tracker (pickup vs. delivery), payment status/instructions, itemised
  totals, history timeline, print stylesheet.
- **FE-P-08 — Trust pages.** Added `privacy.html`, `terms.html`, `404.html`.
  **These are plain-language drafts, clearly marked as such on the page** —
  the owner (ideally with a lawyer) needs to review them before they're
  relied on; see the `<div class="draft-banner">` on each.

### Admin (FE-A) — safe fixes only, no backend needed
The plan's admin work is a full SPA rebuild (`FE-A-03`…`FE-A-17`) gated
behind backend milestones M1–M4 (`admin_dashboard_summary`, paginated RPCs,
Realtime, Storage buckets, etc.) that don't exist in this repo yet. Rebuilding
the whole admin UI against RPCs that don't exist would just be more code to
throw away, so **this patch only does the `F0` "safe fixes, no backend
needed" items**:
- **A5 (XSS)** — `deleteProduct('${id}','${escapeHTML(name)}')`-style
  `onclick` strings are gone from the products/orders tables; rows now carry
  `data-*` attributes read by one delegated listener per table, so a product
  name with an apostrophe (e.g. *Nanay's Tablea*) can no longer break the
  button or inject markup. (`escapeHTML` turning `'` into `&#39;` doesn't
  make it safe inside an `onclick="..."` attribute — the browser decodes
  entities before treating the value as JS.)
- **A6 (filter injection)** — order/message search now runs through
  `sanitizeSearchTerm()` before it's interpolated into a PostgREST `.or()`
  filter, so `,`, `(`, `)` in the search box can't change the filter shape.
- **A13 (duplicate handlers)** — `initApp()` and the login submit handler
  both used to trigger `onSignedIn()` for the same sign-in, and
  `startHeartbeat()` added a new `visibilitychange` listener every call.
  Fixed with a `lastHandledUserId` guard and moving the listener registration
  to run once.
- **A24 (modal a11y)** — every `.modal-backdrop` now has `role="dialog"`,
  traps `Tab`, closes on `Esc` and on backdrop click, and returns focus to
  whatever opened it.
- **FE-X-02 contrast** and **FE-X-05 `noindex`** applied to `admin.html` too.
- Removed the `via.placeholder.com` third-party fallback for broken product
  images (now a local CSS placeholder).

**Not done** (needs backend first, tracked against the plan's own IDs):
`FE-A-03` dashboard v2, `FE-A-04` reusable data table + pagination,
`FE-A-06` orders fulfilment centre, `FE-A-07` bookings calendar,
`FE-A-09` reports/charts, `FE-A-10` global search, `FE-A-11`/`FE-A-12`
announcements/storefronts CRUD, `FE-A-13` messages CRM, `FE-A-15` forced
password change + real session expiry, `FE-A-16` audit log, `FE-A-17`
role-aware UI, and the router/shell restructure in `FE-A-01` beyond the
safe fixes above.

## Dev stubs
`js/dev-stubs.js` (loaded only via `?stub=1` in the URL, or
`localStorage.bt_stub = "1"`) provides in-memory fake data/RPCs matching the
plan's §1.5/§1.8 contract, so every public-site screen can be reviewed today
without a live backend. It's meant to be deleted in `FE-X-06` alongside the
legacy fallbacks. Order numbers ending in `D` simulate delivery, ending in
`X` simulate a cancelled order, when testing `order-status.html?stub=1`.

## Known limitations / what to check next
- Third-party product photography (`simpol.ph`, `region6.dost.gov.ph`) is
  still hot-linked — see FE-X-03 above.
- `privacy.html` / `terms.html` are drafts and need an owner/legal review
  (retention period, delivery areas, refund policy — marked `[Owner to
  confirm]` inline).
- Everything gated on the new RPC contract (checkout pricing server-side,
  shipping fee, payment instructions, booking capacity, order history) runs
  on the **legacy fallback path** until the backend agent ships M1. The code
  is written to switch over automatically (`BT.apiVersion()` feature
  detection) — no front-end changes should be needed when that happens.
