/* Balay Tablea — admin console logic.
 * Moved out of admin.html so the site-wide CSP (script-src 'self' …, no
 * 'unsafe-inline') doesn't block it. No inline JS / on*= handlers anywhere:
 * all wiring is via data-action / data-tab attributes (see section 13).
 * Loaded by admin.html with `defer` after the Supabase SDK <script>.
 */
// 1. SUPABASE CLIENT INITIALIZATION
// Replace these credentials with your Netlify environment variables or direct Supabase details
const SUPABASE_URL = 'https://mmbdewpfmybfkczczdhn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmRld3BmbXliZmtjemN6ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODMwNDYsImV4cCI6MjEwNjA1OTA0Nn0.S5MVJu4X2nz_jg20nWBSGOl28OqYrHZgCvh9UVFVxdQ';

if (typeof supabase === 'undefined' || !supabase.createClient) {
  // This file is loaded with `defer`, so the DOM already exists here.
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100%;background:#0f172a;color:#f8fafc;text-align:center;padding:2rem;font-family:sans-serif;">
      <div>
        <h2 style="margin-bottom:0.75rem;">⚠️ Failed to load Supabase SDK</h2>
        <p style="color:#94a3b8;">Check your internet connection or ad-blocker, then refresh the page.</p>
      </div>
    </div>`;
  throw new Error('Supabase SDK failed to load.');
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. GLOBAL UTILITIES & NOTIFICATIONS
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, match => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
  });
}

// FE-A-02 (A6): PostgREST's .or() filter string treats , ( ) * and % as
// syntax, so raw user search text could change or break the filter.
// Strip everything except letters, numbers, spaces and a few safe
// punctuation marks before it goes anywhere near a filter string.
function sanitizeSearchTerm(str) {
  return String(str || '').replace(/[,()%*]/g, '').trim().slice(0, 100);
}

// FE-A-02 (A5): every list row used to build onclick="fn('${id}','${escapeHTML(name)}')"
// strings. escapeHTML turns ' into &#39;, which the HTML parser turns back
// into ' inside an attribute — so a name containing an apostrophe (e.g.
// "Nanay's Tablea") broke the onclick, and a crafted name could inject
// script. Rows now carry data-* attributes instead, read by one delegated
// listener per table (see "delegated row actions" below), so no value is
// ever concatenated into HTML as code.
function h(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? escapeHTML(values[i]) : ''), '');
}

// FE-A-01 (A24): modals had no focus trap, no Esc-to-close and no
// backdrop click — keyboard and screen-reader users could tab out into
// the page behind them. This is generic across all five .modal-backdrop
// dialogs, so it's handled once here instead of per modal.
let modalReturnFocus = null;
function activeModal() { return document.querySelector('.modal-backdrop.active'); }
function trapModalTab(e) {
  const modal = activeModal(); if (!modal || e.key !== 'Tab') return;
  const items = [...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', (e) => {
  const modal = activeModal();
  if (!modal) return;
  if (e.key === 'Escape') { e.preventDefault(); closeAnyModal(modal); }
  else trapModalTab(e);
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeAnyModal(backdrop); });
});
function closeAnyModal(backdrop) {
  backdrop.classList.remove('active');
  if (modalReturnFocus && document.body.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}
// Call right after `<id>.classList.add('active')` wherever a modal opens,
// so Esc/backdrop-click can return focus to whatever triggered it.
function focusModal(backdrop) {
  modalReturnFocus = document.activeElement;
  const first = backdrop.querySelector('input,select,textarea,button');
  if (first) first.focus();
}

function formatPHP(amount) {
  return '₱' + parseFloat(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function handleImageError(imgEl) {
  imgEl.style.display = 'none';
  const fallbackText = document.getElementById('brand-text-fallback');
  if (fallbackText) fallbackText.style.display = 'inline';
  const authTitle = document.getElementById('auth-title-brand');
  if (authTitle) authTitle.style.display = 'block';
}

// 3. AUTHENTICATION CONTROLLER
const authOverlay = document.getElementById('auth-overlay');
const loginForm = document.getElementById('login-form');
let CURRENT_SESSION = null;
let heartbeatTimer = null;

// --- 24-hour hard session timeout, counted from the moment the person
// actually typed their credentials in (not from each page reload / token
// refresh). Supabase's own JWT auto-refreshes indefinitely by default,
// so this is enforced client-side against a timestamp in localStorage.
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const LOGIN_AT_KEY = 'bt_admin_login_at';

function markLoginNow() {
  localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
}
function getLoginAt() {
  const v = localStorage.getItem(LOGIN_AT_KEY);
  return v ? Number(v) : null;
}
function clearLoginAt() {
  localStorage.removeItem(LOGIN_AT_KEY);
}
function sessionExpired() {
  const loginAt = getLoginAt();
  if (!loginAt) return false;
  return (Date.now() - loginAt) >= SESSION_TIMEOUT_MS;
}
async function enforceSessionTimeout() {
  if (!CURRENT_SESSION) return;
  if (sessionExpired()) {
    await db.auth.signOut();
    clearLoginAt();
    showToast('Your session expired after 24 hours — please sign in again.', 'info');
  }
}

// FE-A-01 fix (A13): onAuthStateChange AND the post-login getSession() call
// could both reach here for the same sign-in, restarting the heartbeat
// interval and re-running setupSessionCard/switchTab every time. Skip the
// repeat work when it's the same already-signed-in user.
let lastHandledUserId = null;
async function onSignedIn(session) {
  // No recorded login time (e.g. very first run after this feature
  // shipped) — treat this moment as the start of the 24h window.
  if (!getLoginAt()) markLoginNow();

  if (sessionExpired()) {
    await db.auth.signOut();
    clearLoginAt();
    showToast('Your session expired after 24 hours — please sign in again.', 'info');
    return;
  }

  const already = lastHandledUserId === session.user.id && !!heartbeatTimer;
  CURRENT_SESSION = session;
  authOverlay.style.display = 'none';
  if (already) return; // same session already initialized — just refreshed the token
  lastHandledUserId = session.user.id;
  await setupSessionCard(session);
  startHeartbeat();
  switchTab('dashboard', document.querySelector('.nav-item'));
}

function onSignedOut() {
  CURRENT_SESSION = null;
  lastHandledUserId = null;
  authOverlay.style.display = 'flex';
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  document.getElementById('session-card').style.display = 'none';
}

async function initApp() {
  // Single source of truth for auth state (fixes A13): onAuthStateChange
  // fires once on subscribe with whatever session already exists, and
  // again on every future sign-in/out, so a separate getSession() call
  // here would just duplicate the very first event.
  db.auth.onAuthStateChange((event, session) => {
    if (session) onSignedIn(session); else onSignedOut();
  });
  // Once for the very first paint, in case the SDK's initial event fires late.
  const { data: { session } } = await db.auth.getSession();
  if (session) onSignedIn(session); else onSignedOut();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && CURRENT_SESSION) heartbeat();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showToast('Login Failed: ' + error.message, 'error');
    } else {
      markLoginNow(); // a real, fresh sign-in — this starts the 24h clock
      showToast('Signed in successfully', 'success');
      // onAuthStateChange (above) fires SIGNED_IN from this call and handles
      // the rest — calling onSignedIn again here would double-run it (A13).
    }
  } catch (err) {
    // Network failure / SDK error: never leave the button stuck on "Authenticating…".
    showToast('Login Failed: ' + ((err && err.message) || 'network error, please try again'), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Sign In`;
  }
});

async function handleLogout() {
  await db.auth.signOut();
  clearLoginAt();
  showToast('Logged out', 'info');
}

// 4. TAB SWITCHING SYSTEM
function switchTab(tabKey, element) {
  if (tabKey === 'registration' && !canRegister()) {   // UI guard only; server enforces
    tabKey = 'dashboard'; element = document.querySelector('.nav-item[data-tab="dashboard"]');
  }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

  if (element) element.classList.add('active');
  document.getElementById(`sec-${tabKey}`).classList.add('active');
  toggleSidebar(false);

  if (tabKey === 'dashboard') loadDashboard();
  if (tabKey === 'products') loadProducts();
  if (tabKey === 'inventory') loadInventoryLogs();
  if (tabKey === 'orders') loadOrders();
  if (tabKey === 'bookings') loadBookings();
  if (tabKey === 'messages') loadMessages();
  if (tabKey === 'staff') loadStaff();
  if (tabKey === 'registration') initRegistrationForm();
  if (tabKey === 'settings') loadSettings();
}

function toggleSidebar(force) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  overlay.classList.toggle('show', open);
}

// 5. SESSION / "CURRENTLY SIGNED IN" + PRESENCE HEARTBEAT
async function setupSessionCard(session) {
  const user = session.user;
  const { data: staffRow } = await db.from('staff').select('full_name,role,status').eq('auth_user_id', user.id).maybeSingle();

  const label = (staffRow && staffRow.full_name) || user.email;
  const initials = label.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  document.getElementById('session-card').style.display = 'flex';
  document.getElementById('session-avatar').innerHTML = `${escapeHTML(initials)}<span class="presence-dot online"></span>`;
  document.getElementById('session-email').textContent = label;
  document.getElementById('session-role').textContent = (staffRow && staffRow.role) || 'no role';
  CURRENT_ROLE = (staffRow && staffRow.status !== 'suspended' && ROLE_RANK[staffRow.role]) ? staffRow.role : null;
  applyRoleUI();
}

async function heartbeat() {
  if (!CURRENT_SESSION) return;
  await enforceSessionTimeout();
  if (!CURRENT_SESSION) return; // may have just been signed out above
  await db.from('staff')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('auth_user_id', CURRENT_SESSION.user.id);
}

function startHeartbeat() {
  // visibilitychange is handled once, globally, next to initApp (A13) —
  // registering it again here on every sign-in used to stack listeners.
  heartbeat();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(heartbeat, 45000);
}

// ---------------------------------------------------------------------------
// v5 PAGINATION — 10 rows per page. Only the ACTIVE page is requested
// (.range + exact count in the same call). Other pages are never prefetched,
// and a tab only fetches when it is opened (switchTab).
// ---------------------------------------------------------------------------
const PAGE_SIZE = 10;
const pagerState = {};
let PRODUCT_HAS_CHANNEL = true;

async function pagedLoad(key, cfg, retried) {
  const st = pagerState[key] || (pagerState[key] = { page: 1, total: 0, req: 0 });
  if (cfg.reset) st.page = 1;
  const my = ++st.req;
  const tbody = document.getElementById(cfg.tbody);
  tbody.style.opacity = '.55';
  const from = (st.page - 1) * PAGE_SIZE;
  const q = cfg.build(db.from(cfg.table).select(cfg.columns, { count: 'exact' })).range(from, from + PAGE_SIZE - 1);
  const { data, error, count } = await q;
  if (my !== st.req) return;                       // a newer request superseded this one
  tbody.style.opacity = '';
  if (error) {
    if (!retried && cfg.fallbackColumns && cfg.fallbackMatch && cfg.fallbackMatch.test(error.message || '')) {
      if (cfg.onFallback) cfg.onFallback();
      return pagedLoad(key, { ...cfg, columns: cfg.fallbackColumns, fallbackColumns: null, reset: false }, true);
    }
    if (error.code === 'PGRST103' && st.page > 1) { st.page = 1; return pagedLoad(key, { ...cfg, reset: false }, true); } // page beyond range
    tbody.innerHTML = `<tr><td colspan="${cfg.colspan}" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    renderPager(key, 0, 0, 0);
    return;
  }
  st.total = count || 0;
  const pages = Math.max(1, Math.ceil(st.total / PAGE_SIZE));
  if (st.page > pages) { st.page = pages; return pagedLoad(key, { ...cfg, reset: false }, true); } // e.g. last row deleted
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cfg.colspan}" style="text-align:center;">${cfg.empty}</td></tr>`;
  } else {
    tbody.innerHTML = data.map(cfg.row).join('');
    if (cfg.after) cfg.after(tbody, data);
  }
  renderPager(key, pages, from, data ? data.length : 0);
}

function pageWindow(cur, pages) {
  const set = new Set([1, pages, cur - 1, cur, cur + 1]);
  const list = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = []; let prev = 0;
  for (const n of list) { if (n - prev > 1) out.push('gap'); out.push(n); prev = n; }
  return out;
}

function renderPager(key, pages, from, shown) {
  const el = document.getElementById(`pager-${key}`); if (!el) return;
  const st = pagerState[key];
  if (!st || !st.total) { el.innerHTML = ''; return; }
  const btns = pageWindow(st.page, pages).map(n => n === 'gap'
    ? '<span class="pager-gap" aria-hidden="true">…</span>'
    : `<button type="button" class="pager-btn" data-page="${n}" ${n === st.page ? 'aria-current="page"' : ''} aria-label="Page ${n}">${n}</button>`).join('');
  el.innerHTML = `
    <span class="pager-info">Showing ${from + 1}–${from + shown} of ${st.total}</span>
    <nav class="pager-btns" aria-label="Pagination">
      <button type="button" class="pager-btn" data-page="prev" aria-label="Previous page" ${st.page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      ${btns}
      <button type="button" class="pager-btn" data-page="next" aria-label="Next page" ${st.page >= pages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </nav>`;
}

const PAGER_RELOAD = {
  products: () => loadProducts(), inventory: () => loadInventoryLogs(), orders: () => loadOrders(),
  bookings: () => loadBookings(), messages: () => loadMessages(), staff: () => loadStaff()
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('.pager-btn[data-page]'); if (!b || b.disabled) return;
  const key = b.closest('.pager').id.replace('pager-', '');
  const st = pagerState[key]; if (!st) return;
  const pages = Math.max(1, Math.ceil(st.total / PAGE_SIZE));
  const v = b.dataset.page;
  st.page = v === 'prev' ? Math.max(1, st.page - 1) : v === 'next' ? Math.min(pages, st.page + 1) : Number(v);
  if (PAGER_RELOAD[key]) PAGER_RELOAD[key]();
});

// ---- role model (mirrors public.has_role hierarchy; server enforces it too) ----
const ROLE_RANK = { staff: 1, manager: 2, admin: 3, owner: 4 };
let CURRENT_ROLE = null;                      // least privilege until proven otherwise
const canRegister = () => CURRENT_ROLE === 'owner' || CURRENT_ROLE === 'manager';
const allowedRoles = () => Object.keys(ROLE_RANK).filter(r => ROLE_RANK[r] < (ROLE_RANK[CURRENT_ROLE] || 0)).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
const canManageRole = (targetRole) => (ROLE_RANK[CURRENT_ROLE] || 0) > (ROLE_RANK[targetRole] || 99);

function applyRoleUI() {
  const nav = document.querySelector('.nav-item[data-tab="registration"]');
  if (nav) nav.classList.toggle('is-hidden', !canRegister());
  const sel = document.getElementById('reg-role');
  if (sel) {
    const labels = { admin: 'Admin (full access)', manager: 'Manager (orders, inventory, bookings)', staff: 'Staff' };
    const roles = allowedRoles();
    sel.innerHTML = roles.map(r => `<option value="${r}">${labels[r]}</option>`).join('');
    sel.value = roles.includes('staff') ? 'staff' : (roles[0] || '');
    sel.disabled = roles.length <= 1;
  }
}

// 5. PRODUCTS MODULE
async function loadProducts(reset) {
  const search = sanitizeSearchTerm(document.getElementById('product-search').value);
  const base = 'id,name,image_url,category,unit_price,stock_quantity,low_stock_threshold,status';
  return pagedLoad('products', {
    reset, table: 'products', tbody: 'products-tbody', colspan: 7, empty: 'No products found.',
    columns: PRODUCT_HAS_CHANNEL ? base + ',sales_channel' : base,
    fallbackColumns: base, fallbackMatch: /sales_channel/, onFallback: () => { PRODUCT_HAS_CHANNEL = false; },
    build: q => { q = q.order('created_at', { ascending: false }); return search ? q.ilike('name', `%${search}%`) : q; },
    row: p => `
    <tr>
      <td>
        ${p.image_url 
          ? `<img src="${escapeHTML(p.image_url)}" class="thumb-40" data-fallback-icon />` 
          : `<div class="thumb-40 thumb-fallback"><i class="fa-solid fa-image"></i></div>`}
      </td>
      <td><strong>${escapeHTML(p.name)}</strong></td>
      <td>${escapeHTML(p.category) || '-'}${p.sales_channel === 'onsite' ? '<br/><small style="color:var(--accent);">In-store only</small>' : ''}</td>
      <td>${formatPHP(p.unit_price)}</td>
      <td>
        ${p.stock_quantity <= p.low_stock_threshold 
          ? `<span style="color: var(--danger-text); font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> ${p.stock_quantity}</span>` 
          : p.stock_quantity}
      </td>
      <td><span class="badge badge-${escapeHTML(p.status)}">${escapeHTML(p.status)}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" data-action="edit-product" data-id="${escapeHTML(p.id)}">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="btn btn-danger btn-sm" data-action="delete-product" data-id="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `,
    after: (tbody) => {
tbody.querySelectorAll('img[data-fallback-icon]').forEach(img => {
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb-40 thumb-fallback', innerHTML: '<i class="fa-solid fa-image"></i>' }));
    }, { once: true });
  });
    }
  });
}
document.getElementById('products-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  if (btn.dataset.action === 'edit-product') editProduct(btn.dataset.id);
  if (btn.dataset.action === 'delete-product') deleteProduct(btn.dataset.id, btn.dataset.name);
});

function openProductModal() {
  document.getElementById('product-form').reset();
  document.getElementById('prod-id').value = '';
  document.getElementById('modal-product-title').innerText = 'Add New Product';
  document.getElementById('product-modal').classList.add('active');
  focusModal(document.getElementById('product-modal'));
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  const payload = {
    name,
    slug,
    image_url: document.getElementById('prod-image').value || null,
    category: document.getElementById('prod-category').value || null,
    unit_price: parseFloat(document.getElementById('prod-price').value),
    stock_quantity: parseInt(document.getElementById('prod-stock').value),
    low_stock_threshold: parseInt(document.getElementById('prod-threshold').value),
    status: document.getElementById('prod-status').value,
    sales_channel: document.getElementById('prod-channel').value
  };

  const save = (pl) => id ? db.from('products').update(pl).eq('id', id) : db.from('products').insert([pl]);
  let { error } = await save(payload);
  if (error && /sales_channel/.test(error.message || '')) {       // column not deployed yet (Phase 2)
    const { sales_channel, ...legacy } = payload;
    ({ error } = await save(legacy));
    if (!error) showToast('Saved, but "Sales channel" needs the database update first.', 'info');
  }

  if (error) {
    showToast('Error saving product: ' + error.message, 'error');
  } else {
    showToast(`Product ${id ? 'updated' : 'created'} successfully!`, 'success');
    closeProductModal();
    loadProducts();
  }
});

async function editProduct(id) {
  const { data, error } = await db.from('products').select('*').eq('id', id).single();
  if (error || !data) return showToast('Could not fetch product details', 'error');

  document.getElementById('prod-id').value = data.id;
  document.getElementById('prod-name').value = data.name;
  document.getElementById('prod-image').value = data.image_url || '';
  document.getElementById('prod-category').value = data.category || '';
  document.getElementById('prod-price').value = data.unit_price;
  document.getElementById('prod-stock').value = data.stock_quantity;
  document.getElementById('prod-threshold').value = data.low_stock_threshold || 5;
  document.getElementById('prod-status').value = data.status;
  document.getElementById('prod-channel').value = data.sales_channel || 'online';

  document.getElementById('modal-product-title').innerText = 'Edit Product';
  document.getElementById('product-modal').classList.add('active');
  focusModal(document.getElementById('product-modal'));
}

async function deleteProduct(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

  const { error } = await db.from('products').delete().eq('id', id);
  if (error) showToast('Delete failed: ' + error.message, 'error');
  else {
    showToast(`Deleted ${name}`, 'success');
    loadProducts();
  }
}

// 6. INVENTORY LOGS & STOCK ADJUSTMENT MODULE
async function loadInventoryLogs(reset) {
  return pagedLoad('inventory', {
    reset, table: 'inventory_logs', tbody: 'inventory-tbody', colspan: 5, empty: 'No inventory activity logged.',
    columns: 'id,created_at,change_type,change_amount,reason,products(name)',
    build: q => q.order('created_at', { ascending: false }),
    row: log => `
    <tr>
      <td>${new Date(log.created_at).toLocaleString('en-PH')}</td>
      <td><strong>${log.products ? escapeHTML(log.products.name) : 'Unlinked Product'}</strong></td>
      <td><span class="badge badge-pending">${escapeHTML(log.change_type)}</span></td>
      <td style="font-weight:700; color: ${log.change_amount >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${log.change_amount > 0 ? '+' : ''}${log.change_amount}
      </td>
      <td>${escapeHTML(log.reason) || '-'}</td>
    </tr>
  `
  });
}

async function openLogModal() {
  const select = document.getElementById('log-product');
  const { data } = await db.from('products').select('id, name, stock_quantity');
  
  select.innerHTML = (data || []).map(p => 
    `<option value="${p.id}">${escapeHTML(p.name)} (Current Stock: ${p.stock_quantity})</option>`
  ).join('');

  document.getElementById('log-form').reset();
  document.getElementById('log-modal').classList.add('active');
  focusModal(document.getElementById('log-modal'));
}

function closeLogModal() {
  document.getElementById('log-modal').classList.remove('active');
}

document.getElementById('log-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = document.getElementById('log-product').value;
  const changeAmount = parseInt(document.getElementById('log-amount').value);
  const changeType = document.getElementById('log-type').value;
  const reason = document.getElementById('log-reason').value;

  // 1. Fetch current stock
  const { data: prod } = await db.from('products').select('stock_quantity').eq('id', productId).single();
  if (!prod) return showToast('Target product not found', 'error');

  const updatedStock = Math.max(0, prod.stock_quantity + changeAmount);

  // 2. Insert Log
  const { error: logErr } = await db.from('inventory_logs').insert([{
    product_id: productId,
    change_amount: changeAmount,
    change_type: changeType,
    reason: reason
  }]);

  if (logErr) return showToast('Log entry failed: ' + logErr.message, 'error');

  // 3. Sync update product stock
  const { error: prodErr } = await db.from('products').update({ stock_quantity: updatedStock }).eq('id', productId);
  if (prodErr) showToast('Stock quantity sync failed: ' + prodErr.message, 'error');

  showToast('Stock adjustment applied!', 'success');
  closeLogModal();
  loadInventoryLogs();
});

// 7. ORDERS MODULE
async function loadOrders(reset) {
  const search = sanitizeSearchTerm(document.getElementById('order-search').value);
  return pagedLoad('orders', {
    reset, table: 'orders', tbody: 'orders-tbody', colspan: 6, empty: 'No orders recorded.',
    columns: 'id,order_number,customer_name,customer_email,total_amount,status,created_at',
    build: q => {
      q = q.order('created_at', { ascending: false });
      // search is pre-sanitized by sanitizeSearchTerm() (A6)
      return search ? q.or(`customer_name.ilike.%${search}%,order_number.ilike.%${search}%,customer_email.ilike.%${search}%`) : q;
    },
    row: o => `
    <tr>
      <td><strong>${escapeHTML(o.order_number)}</strong></td>
      <td>
        ${escapeHTML(o.customer_name)}<br/>
        <small style="color: var(--text-muted);">${escapeHTML(o.customer_email) || 'No email'}</small>
      </td>
      <td><strong>${formatPHP(o.total_amount)}</strong></td>
      <td><span class="badge badge-${o.status}">${escapeHTML(String(o.status).replace(/_/g, ' '))}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-PH')}</td>
      <td>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <select class="form-control order-status-select" style="padding:0.25rem 0.5rem; font-size:0.8125rem;" data-id="${escapeHTML(o.id)}">
            ${['pending','processing','ready_for_pickup','shipped','completed','cancelled'].map(s => 
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`
            ).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" data-action="view-order" data-id="${escapeHTML(o.id)}" data-order-number="${escapeHTML(o.order_number)}">
            <i class="fa-solid fa-eye"></i>
          </button>
        </div>
      </td>
    </tr>
  `
  });
}
document.getElementById('orders-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="view-order"]'); if (!btn) return;
  viewOrderItems(btn.dataset.id, btn.dataset.orderNumber);
});
document.getElementById('orders-tbody').addEventListener('change', (e) => {
  const sel = e.target.closest('.order-status-select'); if (!sel) return;
  updateOrderStatus(sel.dataset.id, sel.value);
});

async function updateOrderStatus(orderId, status) {
  const { error } = await db.from('orders').update({ status }).eq('id', orderId);
  if (error) showToast('Failed updating order: ' + error.message, 'error');
  else showToast('Order status updated', 'success');
  loadOrders();
}

async function viewOrderItems(orderId, orderNum) {
  document.getElementById('order-modal-title').innerText = `Order #${orderNum}`;
  const tbody = document.getElementById('order-items-tbody');
  const detailsDiv = document.getElementById('order-details-content');

  const { data: order } = await db.from('orders').select('*').eq('id', orderId).single();
  const { data: items } = await db.from('order_items').select('*').eq('order_id', orderId);

  if (order) {
    detailsDiv.innerHTML = `
      <strong>Customer:</strong> ${escapeHTML(order.customer_name)} (${escapeHTML(order.customer_phone || 'No phone')})<br/>
      <strong>Shipping Address:</strong> ${escapeHTML(order.shipping_address || 'N/A')}
    `;
  }

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No line items found for this order.</td></tr>`;
  } else {
    tbody.innerHTML = items.map(item => `
      <tr>
        <td>${escapeHTML(item.product_name)}</td>
        <td>${formatPHP(item.unit_price)}</td>
        <td>${item.quantity}</td>
        <td>${formatPHP(item.subtotal)}</td>
      </tr>
    `).join('');
  }

  document.getElementById('order-modal').classList.add('active');
  focusModal(document.getElementById('order-modal'));
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
}

// 8. VISIT BOOKINGS MODULE
async function loadBookings(reset) {
  return pagedLoad('bookings', {
    reset, table: 'visit_bookings', tbody: 'bookings-tbody', colspan: 6, empty: 'No scheduled visit bookings.',
    columns: 'id,visitor_name,visitor_email,visitor_phone,visit_date,time_slot,pax,visit_type,status',
    build: q => q.order('visit_date', { ascending: false }),   // newest visit first
    row: b => `
    <tr>
      <td>
        <strong>${escapeHTML(b.visitor_name)}</strong><br/>
        <small style="color:var(--text-muted);">${escapeHTML(b.visitor_email || b.visitor_phone || '')}</small>
      </td>
      <td>${b.visit_date}<br/><small style="color:var(--text-muted);">${escapeHTML(b.time_slot || '')}</small></td>
      <td>${b.pax} pax</td>
      <td><span class="badge badge-pending">${escapeHTML(b.visit_type)}</span></td>
      <td><span class="badge badge-${b.status}">${b.status}</span></td>
      <td>
        <select class="form-control" style="padding:0.25rem 0.5rem; font-size:0.8125rem;" data-action="booking-status" data-id="${escapeHTML(b.id)}">
          ${['pending','approved','completed','declined','cancelled'].map(s => 
            `<option value="${s}" ${b.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </td>
    </tr>
  `
  });
}

async function updateBookingStatus(bookingId, status) {
  const { error } = await db.from('visit_bookings').update({ status }).eq('id', bookingId);
  if (error) showToast('Booking update failed: ' + error.message, 'error');
  else showToast('Booking status saved', 'success');
  loadBookings();
}

document.getElementById('bookings-tbody').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-action="booking-status"]'); if (!sel) return;
  updateBookingStatus(sel.dataset.id, sel.value);
});

// 9. SITE SETTINGS MODULE
async function loadSettings() {
  const { data } = await db.from('site_settings').select('*');
  if (data) {
    data.forEach(item => {
      if (item.key === 'shipping_rate') document.getElementById('setting-shipping').value = item.value;
      if (item.key === 'operating_hours') document.getElementById('setting-hours').value = item.value;
      if (item.key === 'contact_phone') document.getElementById('setting-contact').value = item.value;
      if (item.key === 'announcement_banner') document.getElementById('setting-banner').value = item.value;
    });
  }
}

async function saveSettings() {
  const rows = [
    { key: 'shipping_rate', value: document.getElementById('setting-shipping').value },
    { key: 'operating_hours', value: document.getElementById('setting-hours').value },
    { key: 'contact_phone', value: document.getElementById('setting-contact').value },
    { key: 'announcement_banner', value: document.getElementById('setting-banner').value }
  ];

  const { error } = await db.from('site_settings').upsert(rows, { onConflict: 'key' });
  if (error) showToast('Error saving settings: ' + error.message, 'error');
  else showToast('Store settings updated!', 'success');
}

// 10. DASHBOARD MODULE
function timeAgo(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.round(hrs / 24) + 'd ago';
}

async function loadDashboard() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });   // YYYY-MM-DD in PH time
  const [kpiRes, ordersRes, msgsRes, bookRes] = await Promise.all([
    db.rpc('admin_dashboard_kpis'),
    db.from('orders').select('id,order_number,customer_name,total_amount,status,created_at').order('created_at', { ascending: false }).limit(5),
    db.from('inquiries').select('id,name,inquiry_type,message,status,created_at').order('created_at', { ascending: false }).limit(5),
    db.from('visit_bookings').select('id,visitor_name,visit_date,time_slot,visit_type,pax,status')
      .gte('visit_date', today).in('status', ['pending', 'approved']).order('visit_date', { ascending: true }).limit(5)
  ]);
  const orders = ordersRes.data || [], inquiries = msgsRes.data || [], upcoming = bookRes.data || [];

  // KPIs: one RPC when deployed (Phase 2); otherwise light count queries.
  const k = (!kpiRes.error && kpiRes.data) ? kpiRes.data : await dashboardKpisFallback(today);
  const setK = (id, v) => { document.getElementById(id).textContent = v; };
  setK('kpi-revenue', formatPHP(k.revenue));
  setK('kpi-orders', k.orders_total);
  setK('kpi-pending', k.orders_pending);
  setK('kpi-lowstock', k.low_stock);
  setK('kpi-inquiries', k.inquiries_new);
  setK('kpi-bookings', k.bookings_upcoming);
  setK('kpi-online', k.staff_online);
  setK('kpi-products', k.products_active);

  const navBadge = document.getElementById('messages-nav-badge');
  if (k.inquiries_new > 0) { navBadge.textContent = k.inquiries_new; navBadge.style.display = 'inline-flex'; }
  else { navBadge.style.display = 'none'; }

  document.getElementById('dash-orders-tbody').innerHTML = orders.length ? orders.map(o => `
    <tr>
      <td><strong>${escapeHTML(o.order_number)}</strong></td>
      <td>${escapeHTML(o.customer_name)}</td>
      <td>${formatPHP(o.total_amount)}</td>
      <td><span class="badge badge-${escapeHTML(o.status)}">${escapeHTML(String(o.status).replace(/_/g, ' '))}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-PH')}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;">No orders yet.</td></tr>`;

  document.getElementById('dash-messages-tbody').innerHTML = inquiries.length ? inquiries.map(i => `
    <tr>
      <td><strong>${escapeHTML(i.name)}</strong></td>
      <td><span class="badge badge-pending">${escapeHTML(i.inquiry_type)}</span></td>
      <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(i.message)}</td>
      <td><span class="badge badge-${escapeHTML(i.status)}">${escapeHTML(i.status).replace('_', ' ')}</span></td>
    </tr>`).join('') : `<tr><td colspan="4" style="text-align:center;">No messages yet.</td></tr>`;

  document.getElementById('dash-bookings-tbody').innerHTML = upcoming.length ? upcoming.map(b => `
    <tr>
      <td><strong>${escapeHTML(b.visitor_name)}</strong></td>
      <td>${escapeHTML(b.visit_date)}<br/><small style="color:var(--text-muted);">${escapeHTML(b.time_slot || '')}</small></td>
      <td><span class="badge badge-pending">${escapeHTML(b.visit_type)}</span></td>
      <td>${b.pax} pax</td>
      <td><span class="badge badge-${escapeHTML(b.status)}">${escapeHTML(b.status)}</span></td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;">No upcoming visits.</td></tr>`;
}

// Fallback for before admin_dashboard_kpis() exists: two narrow selects + head-only counts.
async function dashboardKpisFallback(today) {
  const head = (t) => db.from(t).select('id', { count: 'exact', head: true });
  const [o, p, inq, bk, online] = await Promise.all([
    db.from('orders').select('total_amount,status'),
    db.from('products').select('status,stock_quantity,low_stock_threshold'),
    head('inquiries').eq('status', 'new'),
    head('visit_bookings').gte('visit_date', today).in('status', ['pending', 'approved']),
    head('staff').gt('last_seen_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
  ]);
  const orders = o.data || [], products = p.data || [];
  return {
    revenue: orders.filter(x => x.status !== 'cancelled').reduce((sum, x) => sum + Number(x.total_amount || 0), 0),
    orders_total: orders.length,
    orders_pending: orders.filter(x => x.status === 'pending').length,
    low_stock: products.filter(x => x.stock_quantity <= x.low_stock_threshold).length,
    inquiries_new: inq.count || 0,
    bookings_upcoming: bk.count || 0,
    products_active: products.filter(x => x.status === 'active').length,
    staff_online: online.count || 0
  };
}

// 11. MESSAGES / INQUIRIES MODULE
let activeMessageId = null;
async function loadMessages(reset) {
  const search = sanitizeSearchTerm(document.getElementById('message-search').value);
  return pagedLoad('messages', {
    reset, table: 'inquiries', tbody: 'messages-tbody', colspan: 6, empty: 'No messages yet.',
    columns: 'id,name,email,inquiry_type,message,created_at,status',
    build: q => {
      q = q.order('created_at', { ascending: false });
      // search is pre-sanitized by sanitizeSearchTerm() (A6)
      return search ? q.or(`name.ilike.%${search}%,email.ilike.%${search}%,message.ilike.%${search}%`) : q;
    },
    row: i => `
    <tr>
      <td>
        <strong>${escapeHTML(i.name)}</strong><br/>
        <small style="color:var(--text-muted);">${escapeHTML(i.email)}</small>
      </td>
      <td><span class="badge badge-pending">${escapeHTML(i.inquiry_type)}</span></td>
      <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(i.message)}</td>
      <td>${new Date(i.created_at).toLocaleDateString('en-PH')}</td>
      <td><span class="badge badge-${i.status}">${escapeHTML(i.status).replace('_',' ')}</span></td>
      <td><button class="btn btn-secondary btn-sm" data-action="view-message" data-id="${escapeHTML(i.id)}"><i class="fa-solid fa-eye"></i> View</button></td>
    </tr>`
  });
}

async function openMessageModal(id) {
  const { data, error } = await db.from('inquiries').select('*').eq('id', id).single();
  if (error || !data) return showToast('Could not load message', 'error');
  activeMessageId = id;
  document.getElementById('message-modal-title').textContent = `${data.name} — ${data.inquiry_type}`;
  document.getElementById('message-modal-content').innerHTML = `
    <p><strong>Email:</strong> ${escapeHTML(data.email)}</p>
    <p><strong>Phone:</strong> ${escapeHTML(data.phone) || 'Not provided'}</p>
    ${data.company ? `<p><strong>Business/Farm:</strong> ${escapeHTML(data.company)}</p>` : ''}
    <p><strong>Received:</strong> ${new Date(data.created_at).toLocaleString('en-PH')}</p>
    <hr style="border-color:var(--border-color); margin:1rem 0;">
    <p style="white-space:pre-wrap;">${escapeHTML(data.message)}</p>
  `;
  document.getElementById('message-status-select').value = data.status;
  document.getElementById('message-modal').classList.add('active');
  focusModal(document.getElementById('message-modal'));
}

function closeMessageModal() {
  document.getElementById('message-modal').classList.remove('active');
  activeMessageId = null;
}

async function saveMessageStatus() {
  if (!activeMessageId) return;
  const status = document.getElementById('message-status-select').value;
  const { error } = await db.from('inquiries').update({ status }).eq('id', activeMessageId);
  if (error) return showToast('Failed to update: ' + error.message, 'error');
  showToast('Message status updated', 'success');
  closeMessageModal();
  loadMessages();
}

// 12. STAFF MODULE
async function loadStaff(reset) {
  const base = 'id,auth_user_id,full_name,email,phone,role,status,last_seen_at';
  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  return pagedLoad('staff', {
    reset, table: 'staff', tbody: 'staff-tbody', colspan: 5, empty: 'Nobody has signed in yet.',
    columns: base + ',first_name,last_name', fallbackColumns: base, fallbackMatch: /first_name|last_name/,
    // only staff who have logged in at least once, most recent first
    build: q => q.not('last_seen_at', 'is', null).order('last_seen_at', { ascending: false, nullsFirst: false }),
    row: (s) => {
      const online = s.last_seen_at && new Date(s.last_seen_at).getTime() > onlineCutoff;
      const isSelf = CURRENT_SESSION && s.auth_user_id === CURRENT_SESSION.user.id;
      const fullName = (s.first_name || s.last_name) ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : s.full_name;
      let action = '<span style="color:var(--text-muted);">—</span>';
      if (isSelf) action = '<span style="color:var(--text-muted); font-size:.8125rem;">You</span>';
      else if (canManageRole(s.role)) action = s.status === 'suspended'
        ? `<button class="btn btn-secondary btn-sm" data-action="toggle-staff" data-id="${escapeHTML(s.id)}" data-status="active"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>`
        : `<button class="btn btn-danger btn-sm" data-action="toggle-staff" data-id="${escapeHTML(s.id)}" data-status="suspended"><i class="fa-solid fa-ban"></i> Suspend</button>`;
      return `
    <tr>
      <td><strong>${escapeHTML(fullName)}</strong> ${online ? '<span class="presence-dot online" style="position:static; display:inline-block; margin-left:.3rem;"></span>' : ''}</td>
      <td>${escapeHTML(s.email)}<br/><small style="color:var(--text-muted);">${escapeHTML(s.phone) || 'No phone'}</small></td>
      <td><span class="badge badge-${escapeHTML(s.role)}">${escapeHTML(s.role)}</span> <span class="badge badge-${escapeHTML(s.status)}">${escapeHTML(s.status)}</span></td>
      <td>${timeAgo(s.last_seen_at)}</td>
      <td>${action}</td>
    </tr>`;
    }
  });
}

// ---- Staff Registration tab (owner + manager only; server re-checks) ----
const PH_PHONE = /^(\+63|0)9\d{9}$/;
function initRegistrationForm() {
  const dob = document.getElementById('reg-dob');
  const d = new Date(); d.setFullYear(d.getFullYear() - 18);
  dob.max = d.toISOString().slice(0, 10);          // must be at least 18
  dob.min = '1900-01-01';
}

document.getElementById('reg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canRegister()) return showToast('You do not have permission to register staff.', 'error');
  const btn = document.getElementById('reg-submit-btn');
  const val = id => document.getElementById(id).value.trim();
  const payload = {
    first_name: val('reg-first'), last_name: val('reg-last'), date_of_birth: val('reg-dob'),
    email: val('reg-email').toLowerCase(), phone: val('reg-phone').replace(/[\s-]/g, ''), role: val('reg-role')
  };
  payload.full_name = `${payload.first_name} ${payload.last_name}`.trim();   // for the v1 edge function
  const err = document.getElementById('reg-error'); err.textContent = '';
  const fail = (m) => { err.textContent = m; };
  if (!payload.first_name || !payload.last_name) return fail('First and last name are required.');
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) return fail('Enter a valid email address.');
  if (!PH_PHONE.test(payload.phone)) return fail('Enter a valid PH mobile number (09XX XXX XXXX or +63 9XX XXX XXXX).');
  const limit = new Date(); limit.setFullYear(limit.getFullYear() - 18);
  if (!payload.date_of_birth || new Date(payload.date_of_birth) > limit) return fail('Staff must be at least 18 years old.');
  if (!allowedRoles().includes(payload.role)) return fail('You can only register roles below your own.');

  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-staff-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CURRENT_SESSION.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error('This email is already registered.');
    if (res.status === 403) throw new Error('You are not allowed to create that role.');
    if (!res.ok) throw new Error(json.error || 'Could not create staff account');

    document.getElementById('reg-result').innerHTML = `
      <div class="form-success" style="border:1.5px solid var(--success); background:rgba(16,185,129,.12); border-radius:8px; padding:1rem;">
        <strong style="display:block; color:var(--success); margin-bottom:.4rem;">Account created for ${escapeHTML(payload.full_name)}</strong>
        <p style="font-size:.85rem; margin-bottom:.4rem;">Share these sign-in details securely — this password won't be shown again.</p>
        <code style="display:block; background:var(--bg-base); padding:.6rem .8rem; border-radius:6px; font-size:.85rem;">
          ${escapeHTML(payload.email)}<br>${escapeHTML(json.temp_password)}
        </code>
      </div>`;
    document.getElementById('reg-form').reset(); applyRoleUI();
    showToast('Staff account created', 'success');
    if (pagerState.staff) loadStaff();              // refresh only if that tab was already loaded
  } catch (ex) {
    showToast('Error: ' + ex.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
});

async function toggleStaffStatus(staffId, status) {
  if (status === 'suspended' && !confirm('Suspend this staff member? They will be signed out and unable to log in until reactivated.')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/set-staff-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CURRENT_SESSION.access_token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ staff_id: staffId, status })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not update staff status');
    showToast('Staff status updated', 'success');
    loadStaff();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// 13. EVENT WIRING (replaces every inline on*= attribute; the CSP forbids them)
// One delegated click listener for all [data-action] buttons. Row actions that
// already have their own per-table listeners (edit-product, delete-product,
// view-order) are simply absent from this map, so they're ignored here.
const CLICK_ACTIONS = {
  'toggle-sidebar':        () => toggleSidebar(),
  'close-sidebar':         () => toggleSidebar(false),
  'logout':                () => handleLogout(),
  'open-product-modal':    () => openProductModal(),
  'close-product-modal':   () => closeProductModal(),
  'open-log-modal':        () => openLogModal(),
  'close-log-modal':       () => closeLogModal(),
  'close-order-modal':     () => closeOrderModal(),
  'save-settings':         () => saveSettings(),
  'close-message-modal':   () => closeMessageModal(),
  'save-message-status':   () => saveMessageStatus(),
  'view-message':          (el) => openMessageModal(el.dataset.id),
  'toggle-staff':          (el) => toggleStaffStatus(el.dataset.id, el.dataset.status)
};
document.addEventListener('click', (e) => {
  // Sidebar navigation
  const tabItem = e.target.closest('.nav-item[data-tab]');
  if (tabItem) { switchTab(tabItem.dataset.tab, tabItem); return; }
  // "View all →" links on the dashboard
  const tabLink = e.target.closest('a[data-tab-link]');
  if (tabLink) {
    e.preventDefault();
    const key = tabLink.dataset.tabLink;
    switchTab(key, document.querySelector(`.nav-item[data-tab="${key}"]`));
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = CLICK_ACTIONS[el.dataset.action];
  if (fn) fn(el);
});

// Live search (was onkeyup="load…()"); small debounce so we don't query on every keystroke.
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
document.getElementById('product-search').addEventListener('input', debounce(() => loadProducts(true), 250));
document.getElementById('order-search').addEventListener('input', debounce(() => loadOrders(true), 250));
document.getElementById('message-search').addEventListener('input', debounce(() => loadMessages(true), 250));

// Logo fallback (was onerror="handleImageError(this)"). The error can fire
// before this script runs, so also check images that have already failed.
document.querySelectorAll('img.js-logo').forEach(img => {
  img.addEventListener('error', () => handleImageError(img));
  if (img.complete && img.naturalWidth === 0) handleImageError(img);
});

// INITIALIZE APPLICATION
// Deferred scripts run before DOMContentLoaded, but stay safe either way.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
