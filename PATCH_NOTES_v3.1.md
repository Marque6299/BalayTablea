# Balay Tablea — v3.1 patch notes

This patch fixes the bugs found and adds the features requested on top of the
v3 (Supabase-backed) build. Everything here has been verified against the
live Supabase project (`mmbdewpfmybfkczczdhn`) that the site already uses —
the `staff` table and two Edge Functions listed below are **already deployed
and live**, not just described.

## 1. Header logo
- Every public page's header and footer brand mark now renders `img/logo.png`
  instead of the "Balay Tablea" text wordmark (`.brand-logo` in `css/style.css`).

## 2. Order form / cart total — root cause found and fixed
`shop.html`'s cart total `<div>` was missing `id="cartTotal"`. `js/shop.js`
calls `document.getElementById('cartTotal')` on every quantity change and
throws when it's `null` — which silently broke `renderCart()`, so the
Checkout button could never enable and the form could never be reached.
Fixed by adding the id back. Verified by tracing every call site in
`shop.js`, `visit.js`, and `main.js` — no other submission path had this bug.

## 3. Contrast
Root cause: the 2026 dark-mode CSS token remap turned `--paper-soft` into a
*dark* slate color, but three rules still used it as **text** color on a dark
background (`.process-strip`, `.steps h3`, `.quote-block.on-dark`) — dark
text on a dark band, nearly unreadable. Switched those to `--text-main`
(always light). Also lightened `--text-muted` from `#94A3B8` to `#A9B7C9` for
better small-text contrast site-wide (labels, placeholders, captions).

## 4. Admin dashboard rebuild (`admin.html`)
- **New Dashboard tab** (now the default view): revenue, order count,
  pending orders, low-stock count, new-message count, upcoming-visit count,
  staff-online count, and active-product count, plus recent-orders,
  recent-messages, and upcoming-bookings panels.
- **New Messages tab**: full inbox for the `inquiries` table (search, status
  filter via detail modal, mark new / in progress / resolved).
- **New Staff tab**, backed by a new `public.staff` table + two Edge
  Functions (service-role only, never exposed to the browser):
  - `create-staff-account` — admin-only; creates a **real Supabase Auth
    login** for the new person and returns a one-time temporary password to
    hand them. Also grants dashboard access via `public.admins` for
    manager/admin roles.
  - `set-staff-status` — admin-only; suspends (bans the login server-side)
    or reactivates a staff member.
- **"Currently signed in" indicator** in the sidebar (name + role), plus a
  **live "Currently Online" panel** on the dashboard: `staff.last_seen_at`
  is heartbeated every 45s while the dashboard tab is open, and anyone active
  in the last 5 minutes shows as online.
- **Mobile responsiveness**: off-canvas sidebar with a hamburger topbar under
  980px, responsive KPI grid, stacked top-bars, scrollable tables — the
  previous build had zero `@media` rules in `admin.html`.

## 5. Background imagery
Added a reusable `.bg-photo` section style (dark scrim + light text, so
contrast stays solid) and applied it to three sections using photography
already present elsewhere in the codebase: the About page's "Journey" strip,
and the homepage's "As Seen In" and wholesale CTA sections.

---

## Database changes (already applied to your live project)

```sql
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null default 'staff' check (role in ('owner','admin','manager','staff')),
  status text not null default 'invited' check (status in ('invited','active','suspended')),
  last_seen_at timestamptz,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);
-- RLS: admins have full access (reuses the existing is_admin() function);
-- a signed-in staff member may update their own last_seen_at only.
```

Your existing admin (`jm.me6299@gmail.com`) was seeded into `staff` as
`owner` / `active` so the dashboard has data to show immediately.

## Deploying this

I don't have push access to `github.com/Marque6299/BalayTablea`, so I
couldn't commit this directly. Everything above is packaged in the zip next
to this file — pull it in, review, and push to `main`; Netlify will pick it
up on the next deploy the same way it already does.

## Recommended next steps (not built here, out of scope for this pass)
- Enable Supabase's leaked-password protection (Auth settings) — flagged by
  the project's own security advisor, unrelated to this patch.
- Swap the remaining hot-linked Simpol.ph/DOST photos for owned photography
  before a hard commercial launch (carried over from the v3 notes).
- Consider emailing the temp password from `create-staff-account` directly
  (e.g. via a Resend/SendGrid Edge Function call) instead of copy-pasting it
  from the modal.
