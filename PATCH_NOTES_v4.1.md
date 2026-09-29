# Balay Tablea — v4.1 patch notes (admin login fix)

**Problem.** v4's `_headers` CSP (`script-src 'self' https://cdn.jsdelivr.net`, no
`'unsafe-inline'`) blocked the inline `<script>` and all inline `on*=` handlers in
`admin.html`, so the login form never called Supabase and Sign In just reloaded the page.
Font Awesome (cdnjs) was blocked too, so icons were missing.

**Fix (Option A — strict CSP kept, no `'unsafe-inline'`).**

| Change | Detail |
|---|---|
| `js/admin.js` (new) | The whole former inline script, unchanged logic, plus the wiring below |
| `admin.html` | Inline `<script>` removed; all 39 `on*=` attributes and 2 `javascript:` hrefs replaced with `data-action` / `data-tab` / `data-tab-link` hooks; `<script src="js/admin.js" defer>` added after the Supabase SDK tag |
| Event wiring (section 13 of `admin.js`) | One delegated click listener + `CLICK_ACTIONS` map; `change` listener for booking status; debounced (250 ms) `input` listeners for the 3 search boxes; logo `error` fallback (also checks already-failed images) |
| Dashboard "View all →" links | Previously used a broken `[onclick*=orders]` selector; now `data-tab-link` |
| Login handler | `signInWithPassword` wrapped in `try/catch/finally`; button always resets; email trimmed |
| `vendor/fontawesome/` (new) | Self-hosted Font Awesome Free 6.4.0, **solid only** (only `fa-solid` is used), woff2 only, licence included |
| `_headers` | `font-src` now includes `'self'` (required for the self-hosted font); `/js/admin.js` no-cache; `/vendor/*` 1-day cache. CSP otherwise unchanged |
| `supabase/migrations/20260929120000_p1_staff_relink_on_signup.sql` | **Not applied.** See below |

## Backend — NOT applied yet
`supabase/migrations/20260929120000_p1_staff_relink_on_signup.sql` (trigger that re-links
`public.staff.auth_user_id` by confirmed email when an auth user is (re)created; rollback
block inside). No staging project exists yet (task 1.0.1) and project rules require an explicit
`PROD` go-ahead for prod, so it was left unapplied. Timestamp is later than the newest
applied prod migration (`20260929041029`).

## Still open (unchanged, lower priority)
- supabase-js still loads from cdn.jsdelivr.net (works under the CSP). To remove: vendor
  `supabase.min.js` under `vendor/`, update the 12 pages, drop jsdelivr from `script-src`.
- `js/dev-stubs.js` still ships (FE-X-06). `public.admins` is unused by RLS — decide keep/drop.
- Hot-linked simpol.ph / region6.dost.gov.ph images remain whitelisted.

## Verify after deploy
1. `/admin.html` → F12 Console shows no CSP violations; icons render.
2. Sign in; Supabase auth logs show a `/token` event; session card shows Owner Admin / owner.
3. Tabs, hamburger, all 5 modals, 3 search boxes, booking dropdown, message View, staff Suspend/Reactivate.
4. `grep -nE ' on[a-z]+=' admin.html` returns nothing.
5. `curl -sI https://<site>/admin.html | grep -i content-security-policy` shows one policy.
