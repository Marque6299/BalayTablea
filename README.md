# Balay Tablea — Website (v2, multi-page)

A responsive marketing, tourism and lead-generation website for Sunburst's
Balay Tablea (Cabatuan, Iloilo), built with plain HTML, CSS and JavaScript —
no build step, no framework required.

This is a full redesign of the original single-page site: real, separate
pages instead of scroll-anchors, image-backed page headers, expanded content
researched from public sources, and stronger credibility signals for
wholesale/hospitality and press visitors.

## Structure

```
balay-tablea-website/
├── index.html          Home — hero, story teaser, explore cards, recognition
│                        teaser, visit teaser, wholesale CTA
├── about.html           Our Story — founder story, full timeline, community
│                        / farmer-partnership section
├── process.html         Our Process — 6-step pod-to-cup process + DOST
│                        technology partnership
├── shop.html             Shop — 5 products, why pricing isn't fixed,
│                        wholesale teaser
├── recognition.html      Recognition — dated press list with source links,
│                        award badges, culinary collaborations
├── visit.html            Visit Us — hours/address, workshop + farm visit,
│                        FAQ accordion, embedded map
├── contact.html          Contact & Wholesale — inquiry form, wholesale
│                        4-step process
├── css/
│   └── style.css         All styling — original design system plus new
│                          components (page heroes, cards, quotes, press
│                          list, FAQ, badges)
├── js/
│   └── main.js            Mobile nav toggle + contact form submit handling
└── README.md              This file
```

Every page shares the same header/nav/footer and the same visual system
(Fraunces + Archivo type, moss/clay/gold palette) so navigating between real
pages feels seamless rather than like separate mini-sites.

## What changed from the original single-page build

- **Real navigation.** The top nav and footer now link to seven distinct
  HTML pages instead of scrolling to anchors on one long page.
- **Image-backed page headers.** Every interior page opens with a full-width
  photo banner (dark gradient overlay + heading) instead of a plain text
  block, so the site no longer feels empty on load.
- **New content**, researched from DOST Region VI, Daily Guardian, Iloilo
  Today, and a June 2025 Simpol.ph feature on the brand:
  - A fuller founder story and an expanded timeline (2012 → today)
  - A "Community First" section on the farmer partnership (20+ families,
    training, fair-pay-even-for-imperfect-batches practice)
  - A dedicated Recognition page with **dated, linked, sourced** press
    mentions instead of unlabelled tags
  - Named culinary collaborations (Richmonde Hotel Iloilo's Tablea
    Cheesecake with Tultul and Ilonggo Tiramisu, Chef Ariel Castañeda Jr.)
  - A Visit page FAQ (booking, group tours, kids, combining with a farm
    visit) and an embedded map
  - A Contact/Wholesale page with a plain-language 4-step wholesale process
- **Schema.org `Bakery` structured data** on every page for search-engine
  and map-listing credibility.

## Running it locally

No build tools needed. Either:
- Double-click `index.html` to open it directly in a browser, or
- Serve it locally for a closer-to-production preview:
  ```
  npx serve .
  ```

## Deploying

**Netlify (recommended, zero config):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the whole folder in
3. Netlify auto-detects the contact form (`data-netlify="true"` is already
   set on `contact.html`) — submissions appear under your site's **Forms**
   tab with no extra setup

**Any other static host** (GitHub Pages, Vercel, Cloudflare Pages, plain
S3/CDN): works as-is. If you use a host other than Netlify, the contact
form's `fetch('/')` submit will need to point at whatever form backend you
use instead (e.g. Formspree, a simple serverless function).

## ⚠️ About the images — read before publishing live

To make every page feel real immediately, this build links to a small set
of real, already-public photos of Balay Tablea, Catherine Taleon, and
Cabatuan cacao, found via research:

| Used on | Image | Source |
|---|---|---|
| Home hero | Wide cover photo of wrapped tablea rolls | Simpol.ph (2025) |
| About hero | Cacao pods, Iloilo highlands | Simpol.ph |
| About / Home / Contact | Catherine Taleon with DOST Secretary dela Peña | DOST Region VI (government, 2018) |
| Process hero / Visit | Visitor grinding cacao on the metate | Simpol.ph |
| Shop hero / Process | Mangga't ibos with hot tsokolate | Simpol.ph |
| Recognition hero | Richmonde Hotel's Ilonggo Tiramisu | Simpol.ph |
| Visit hero / Home | Cabatuan LGU farm visit | Simpol.ph |

These are hot-linked (loaded directly from the original sites) as
**development placeholders**, not files copied into this project. The DOST
photos are government-published and lower-risk to reference; the Simpol.ph
photos are editorial photography owned by that outlet. **Before this site
goes live commercially, swap these for:**
- Balay Tablea's own product/shop/storefront photography (this is the
  single highest-impact thing left to do — see "Next steps" below), or
- Images you've licensed or gotten explicit permission to use.

If any hot-linked image ever goes offline or is removed by its host, that
`<img>` will simply break — another reason to replace them with owned
assets before launch.

## Content sources

Founder story, timeline, and recognition copy was written from public
reporting and paraphrased in original wording: Simpol.ph ("Filipino Tablea
Chocolate," Natalie U. Lim, June 2025), DOST Region VI press posts (2018),
Daily Guardian (2019), and Iloilo Today (2018–19). Direct links are cited
on the Recognition page. No pricing is listed on the site since current
prices weren't publicly confirmed — the shop page explains why (hand-made,
seasonal cacao cost) and routes visitors to Messenger/the contact form,
matching how the business already takes orders today.

## Recommended next steps (not built here)

1. **Owned photography** — storefront, product close-ups, Catherine at
   work, the actual shop interior. This is the #1 credibility gap.
2. **A confirmed price list or price ranges**, even indicative ones.
3. **A simple blog/news page** for ongoing press mentions and events (the
   Recognition page is ready to extend into one).
4. **Google Business Profile** linked from the Visit page, so reviews and
   map data show up alongside the embedded map.
5. **Analytics** (e.g. a privacy-friendly tool) so you can see which pages
   — Shop vs. Recognition vs. Visit — actually drive inquiries.

## Admin Dashboard (multi-page)

Staff-only pages, protected by Supabase Auth (no login = redirected to `admin-login.html`).

```
admin-login.html      Staff sign-in
admin.html            Dashboard — stat cards + latest 5 orders / upcoming visits / low-stock items
admin-products.html   Catalog CRUD, categories, draft/active/archived, bulk price update
admin-inventory.html  Stock movements, low-stock alerts, log linked to orders
admin-orders.html     Create orders (line items + shipping fee), status pipeline, order details
admin-bookings.html   Visit bookings: add, approve/decline/complete, internal notes
admin-settings.html   Store open/closed, contact info, default flat-rate shipping
css/admin.css         Shared admin theme (Deep Cocoa / Terracotta palette)
js/admin-common.js    Supabase client, auth guard, API layer, shared helpers
js/admin-*.js         One script per page
sql/                  Run in order in the Supabase SQL Editor (001, then 002)
```

Every table view has a filter for each column (client-side, instant).

**Order logic:** marking an order *Shipped* calls the `mark_order_shipped()` database
function, which in one transaction sets the status, deducts each line item's quantity
from stock (once only), and writes an inventory log entry per product linked to the
order. Order total = items subtotal + shipping fee (default comes from Settings).

**Setup checklist**
1. Run `sql/001_initial_admin_schema.sql`, then `sql/002_orders_shipping_and_inventory.sql`.
2. Supabase → Authentication → Users → add your staff login.
3. Deploy; sign in at `/admin-login.html`.
