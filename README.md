> **v5 (Phase 1 frontend)** — see `PATCH_NOTES_v5.md` and `docs/Masterplan.md`. Phase 2 (Supabase) is pending.

# Balay Tablea — Website (v3, Supabase-backed)

A responsive marketing, tourism and e-commerce website for Sunburst's Balay
Tablea (Cabatuan, Iloilo), built with plain HTML, CSS and JavaScript — no
build step, no framework required. Public pages are now backed directly by
Supabase: products, storefronts, announcements, wholesale/sourcing
inquiries, guest orders and visit bookings all read from and write to the
same project that already powers `admin.html`.

Visitors never create an account. Every form (shop checkout, visit booking,
contact/wholesale/sourcing inquiry) only asks for **name, email and contact
number** — nothing else is required to submit.

## Structure

```
balay-tablea-website/
├── index.html            Home — hero, story teaser, explore cards, storefront
│                          teaser (live from Supabase), wholesale CTA
├── about.html             Our Story — founder story, timeline, community section
├── process.html           Our Process — pod-to-cup process + DOST partnership
├── shop.html               Shop — live product grid + guest cart + checkout,
│                          writes to `orders` / `order_items`
├── recognition.html        Recognition — dated press list, award badges,
│                          culinary collaborations
├── visit.html               Visit Us — guest booking form (`visit_bookings`),
│                          live storefront/partner-kitchen list, FAQ, map
├── contact.html             Contact & Wholesale — inquiry form (`inquiries`:
│                          general / wholesale / sourcing / press)
├── admin.html                Internal admin dashboard (auth-gated) — products,
│                          orders, inventory, visit bookings, site settings
│                          (markup only — no inline JS; CSP forbids it)
├── vendor/fontawesome/     Self-hosted Font Awesome Free 6.4.0 (solid only)
├── supabase/migrations/    SQL migrations (each with a ROLLBACK block)
├── css/
│   └── style.css             Brand design system (Amber/Obsidian/Slate tokens)
│                          plus all page/component styles
├── js/
│   ├── admin.js               Admin console logic (loaded by admin.html, deferred)
│   ├── supabase-client.js    Shared anon Supabase client + data helpers
│   │                         (announcements, products, storefronts, guest
│   │                         inserts for inquiries/orders/visit bookings)
│   ├── main.js                Mobile nav toggle, site-wide announcement bar,
│   │                         generic inquiry-form wiring
│   ├── shop.js                 Shop page: product grid, cart, checkout
│   └── visit.js                 Visit page: booking form, storefront list
└── README.md                This file
```

Every page shares the same header/nav/footer and the same visual system
(Fraunces + Archivo type) so navigating between pages feels seamless.

## Brand design system (v2026)

The visual identity now runs on the same token set as `admin.html`, so the
public site and the admin dashboard feel like one product:

- **Accent:** Tablea Warm Amber `#D97706` (CTAs, links, active states)
- **Surfaces:** Cacao Obsidian `#0F172A` (page background), Surface Slate
  `#1E293B` (cards), Elevated Surface `#334155` (headers, dropdowns)
- **Text:** Crisp Slate `#F8FAFC` / Muted Slate `#94A3B8` / Faded `#64748B`
- **Semantic:** Emerald success `#10B981`, Amber warning `#F59E0B`, Crimson
  danger `#EF4444`

All tokens live at the top of `css/style.css` as CSS custom properties
(`--accent`, `--bg-base`, `--bg-surface`, etc.), with the legacy component
variable names (`--ink`, `--paper`, `--clay`, `--gold`...) remapped onto
them so every existing component picked up the new palette automatically.
A `[data-theme="light"]` override is still available for a lighter mode.

## Supabase integration

Project: `mmbdewpfmybfkczczdhn` (already the project used by `admin.html`).
Public pages use the anon key only and rely entirely on the RLS policies
already defined on each table — no service-role key is ever exposed
client-side.

| Table | Public site usage | RLS for anon |
|---|---|---|
| `products` | Shop page reads active products live | SELECT where `status = 'active'` |
| `announcements` | Site-wide banner on every page | SELECT where `is_active` and in date range |
| `storefronts` | Visit page + homepage teaser | SELECT where `is_active` |
| `inquiries` | Contact form (general/wholesale/sourcing/press) | INSERT only |
| `orders` / `order_items` | Shop checkout | INSERT only |
| `visit_bookings` | Visit page booking form | INSERT only |

Admin-side management of `announcements`, `storefronts` and `inquiries`
(currently only readable/writable by the public flows above) is a natural
next step for `admin.html` — see "Recommended next steps."

## Running it locally

No build tools needed. Either:
- Double-click `index.html` to open it directly in a browser, or
- Serve it locally for a closer-to-production preview:
  ```
  npx serve .
  ```
Supabase calls work the same locally as in production — the anon key is
public by design and scoped entirely by RLS.

## Deploying

This build is static — any host works. The contact/shop/visit forms no
longer depend on Netlify Forms; they post straight to Supabase from the
browser, so nothing host-specific is required. Push to `main` as usual and
redeploy on Netlify (or any static host) the same way you already do.

## What changed in this pass (v3)

- Replaced the static, price-less Shop page with a live product grid,
  quantity steppers, a cart, and guest checkout that writes real orders.
- Replaced the Netlify-Forms contact form with a direct `inquiries` insert,
  added a phone field, and added a "sourcing" option for farmers/suppliers
  who want to sell cacao to Balay Tablea (distinct from wholesale buyers).
- Added a real visit-booking form (date, group size, visit type, notes)
  writing to `visit_bookings`, replacing the old "message us" link.
- Added a site-wide announcement bar sourced from `announcements`.
- Added a live Storefronts section (main shop + partner kitchens) sourced
  from `storefronts`, on both the Visit page and the homepage.
- Full visual overhaul onto the Amber/Obsidian/Slate brand system shared
  with `admin.html`.

## ⚠️ About the images

Several photos are still hot-linked from Simpol.ph and DOST Region VI as
development placeholders (see the original v2 notes in git history). Before
a hard commercial launch, swap these for owned photography, particularly
on the Shop page where real product photos matter for conversion.

## Recommended next steps

1. **Admin management for `announcements`, `storefronts`, and `inquiries`.**
   These tables exist and are already used by the public site, but
   `admin.html` doesn't yet have UI to create/edit rows in them — someone
   has to use the Supabase table editor directly today.
2. **Owned product photography** for the Shop page.
3. **Stock decrement on order placement.** Orders currently insert into
   `orders`/`order_items` but don't touch `products.stock_quantity` (anon
   users have no UPDATE grant on `products` by design) — reconcile stock
   from the admin Orders view when fulfilling.
4. **Email/SMS notification on new order, booking or inquiry** (e.g. a
   Supabase Edge Function + webhook) so the team doesn't have to poll the
   admin dashboard.
5. **Google Business Profile** linked from the Visit page.
