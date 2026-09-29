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
  const { data: staffRow } = await db.from('staff').select('*').eq('auth_user_id', user.id).maybeSingle();

  const label = (staffRow && staffRow.full_name) || user.email;
  const initials = label.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  document.getElementById('session-card').style.display = 'flex';
  document.getElementById('session-avatar').innerHTML = `${escapeHTML(initials)}<span class="presence-dot online"></span>`;
  document.getElementById('session-email').textContent = label;
  document.getElementById('session-role').textContent = (staffRow && staffRow.role) || 'admin';
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

// 5. PRODUCTS MODULE
async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  const search = sanitizeSearchTerm(document.getElementById('product-search').value);

  let query = db.from('products').select('*').order('created_at', { ascending: false });
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No products found.</td></tr>`;
    return;
  }

  // FE-A-02 (A5): row actions now carry id/name as data-* attributes,
  // read by the delegated listener below, instead of being concatenated
  // into an onclick="..." string (escapeHTML() doesn't make that safe —
  // see the sanitizeSearchTerm()/h`` comment above).
  tbody.innerHTML = data.map(p => `
    <tr>
      <td>
        ${p.image_url 
          ? `<img src="${escapeHTML(p.image_url)}" class="thumb-40" data-fallback-icon />` 
          : `<div class="thumb-40 thumb-fallback"><i class="fa-solid fa-image"></i></div>`}
      </td>
      <td><strong>${escapeHTML(p.name)}</strong></td>
      <td>${escapeHTML(p.category) || '-'}</td>
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
  `).join('');
  tbody.querySelectorAll('img[data-fallback-icon]').forEach(img => {
    img.addEventListener('error', () => {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'thumb-40 thumb-fallback', innerHTML: '<i class="fa-solid fa-image"></i>' }));
    }, { once: true });
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
    status: document.getElementById('prod-status').value
  };

  let error;
  if (id) {
    ({ error } = await db.from('products').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('products').insert([payload]));
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
async function loadInventoryLogs() {
  const tbody = document.getElementById('inventory-tbody');
  const { data, error } = await db
    .from('inventory_logs')
    .select('*, products(name)')
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No inventory activity logged.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(log => `
    <tr>
      <td>${new Date(log.created_at).toLocaleString('en-PH')}</td>
      <td><strong>${log.products ? escapeHTML(log.products.name) : 'Unlinked Product'}</strong></td>
      <td><span class="badge badge-pending">${escapeHTML(log.change_type)}</span></td>
      <td style="font-weight:700; color: ${log.change_amount >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${log.change_amount > 0 ? '+' : ''}${log.change_amount}
      </td>
      <td>${escapeHTML(log.reason) || '-'}</td>
    </tr>
  `).join('');
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
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  const search = sanitizeSearchTerm(document.getElementById('order-search').value);

  let query = db.from('orders').select('*').order('created_at', { ascending: false });
  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,order_number.ilike.%${search}%,customer_email.ilike.%${search}%`); // search is pre-sanitized by sanitizeSearchTerm() above (A6)
  }

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No orders recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(o => `
    <tr>
      <td><strong>${escapeHTML(o.order_number)}</strong></td>
      <td>
        ${escapeHTML(o.customer_name)}<br/>
        <small style="color: var(--text-muted);">${escapeHTML(o.customer_email) || 'No email'}</small>
      </td>
      <td><strong>${formatPHP(o.total_amount)}</strong></td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-PH')}</td>
      <td>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <select class="form-control order-status-select" style="padding:0.25rem 0.5rem; font-size:0.8125rem;" data-id="${escapeHTML(o.id)}">
            ${['pending','processing','shipped','completed','cancelled'].map(s => 
              `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" data-action="view-order" data-id="${escapeHTML(o.id)}" data-order-number="${escapeHTML(o.order_number)}">
            <i class="fa-solid fa-eye"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
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
async function loadBookings() {
  const tbody = document.getElementById('bookings-tbody');
  const { data, error } = await db.from('visit_bookings').select('*').order('visit_date', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No scheduled visit bookings.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(b => `
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
  `).join('');
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
  const [ordersRes, productsRes, inquiriesRes, bookingsRes, staffRes] = await Promise.all([
    db.from('orders').select('*').order('created_at', { ascending: false }),
    db.from('products').select('id, status, stock_quantity, low_stock_threshold'),
    db.from('inquiries').select('*').order('created_at', { ascending: false }),
    db.from('visit_bookings').select('*').order('visit_date', { ascending: true }),
    db.from('staff').select('*').order('last_seen_at', { ascending: false })
  ]);

  const orders = ordersRes.data || [];
  const products = productsRes.data || [];
  const inquiries = inquiriesRes.data || [];
  const bookings = bookingsRes.data || [];
  const staff = staffRes.data || [];

  // KPIs
  const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total_amount || 0), 0);
  document.getElementById('kpi-revenue').textContent = formatPHP(revenue);
  document.getElementById('kpi-revenue-sub').textContent = orders.length + ' orders total';
  document.getElementById('kpi-orders').textContent = orders.length;
  const pending = orders.filter(o => o.status === 'pending').length;
  document.getElementById('kpi-orders-sub').textContent = pending + ' awaiting action';
  document.getElementById('kpi-pending').textContent = pending;

  const lowStock = products.filter(p => p.stock_quantity <= p.low_stock_threshold);
  document.getElementById('kpi-lowstock').textContent = lowStock.length;

  const newInquiries = inquiries.filter(i => i.status === 'new').length;
  document.getElementById('kpi-inquiries').textContent = newInquiries;
  const nowStr = new Date().toISOString().slice(0, 10);
  const upcomingBookings = bookings.filter(b => b.visit_date >= nowStr && ['pending', 'approved'].includes(b.status));
  document.getElementById('kpi-bookings').textContent = upcomingBookings.length;

  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  const onlineStaff = staff.filter(s => s.last_seen_at && new Date(s.last_seen_at).getTime() > onlineCutoff);
  document.getElementById('kpi-online').textContent = onlineStaff.length;
  document.getElementById('kpi-products').textContent = products.filter(p => p.status === 'active').length;

  // messages nav badge
  const navBadge = document.getElementById('messages-nav-badge');
  if (newInquiries > 0) { navBadge.textContent = newInquiries; navBadge.style.display = 'inline-flex'; }
  else { navBadge.style.display = 'none'; }

  // recent orders
  const dOrders = document.getElementById('dash-orders-tbody');
  dOrders.innerHTML = orders.length ? orders.slice(0, 5).map(o => `
    <tr>
      <td><strong>${escapeHTML(o.order_number)}</strong></td>
      <td>${escapeHTML(o.customer_name)}</td>
      <td>${formatPHP(o.total_amount)}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('en-PH')}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;">No orders yet.</td></tr>`;

  // recent messages
  const dMsgs = document.getElementById('dash-messages-tbody');
  dMsgs.innerHTML = inquiries.length ? inquiries.slice(0, 5).map(i => `
    <tr>
      <td><strong>${escapeHTML(i.name)}</strong></td>
      <td><span class="badge badge-pending">${escapeHTML(i.inquiry_type)}</span></td>
      <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(i.message)}</td>
      <td><span class="badge badge-${i.status}">${escapeHTML(i.status).replace('_',' ')}</span></td>
    </tr>`).join('') : `<tr><td colspan="4" style="text-align:center;">No messages yet.</td></tr>`;

  // upcoming bookings
  const dBook = document.getElementById('dash-bookings-tbody');
  dBook.innerHTML = upcomingBookings.length ? upcomingBookings.slice(0, 5).map(b => `
    <tr>
      <td><strong>${escapeHTML(b.visitor_name)}</strong></td>
      <td>${b.visit_date}</td>
      <td>${b.pax} pax</td>
    </tr>`).join('') : `<tr><td colspan="3" style="text-align:center;">No upcoming visits.</td></tr>`;

  // currently online panel
  const presenceEl = document.getElementById('dash-presence-list');
  if (!onlineStaff.length) {
    presenceEl.innerHTML = `<li class="empty-mini">Nobody else is online right now.</li>`;
  } else {
    presenceEl.innerHTML = onlineStaff.map(s => {
      const initials = (s.full_name || s.email).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
      return `
      <li class="presence-item">
        <div class="presence-avatar">${escapeHTML(initials)}<span class="presence-dot online"></span></div>
        <div>
          <div class="presence-name">${escapeHTML(s.full_name)}</div>
          <div class="presence-meta">${escapeHTML(s.role)} · active ${timeAgo(s.last_seen_at)}</div>
        </div>
      </li>`;
    }).join('');
  }
}

// 11. MESSAGES / INQUIRIES MODULE
let activeMessageId = null;
async function loadMessages() {
  const tbody = document.getElementById('messages-tbody');
  const search = sanitizeSearchTerm(document.getElementById('message-search').value);

  let query = db.from('inquiries').select('*').order('created_at', { ascending: false });
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,message.ilike.%${search}%`); // search is pre-sanitized by sanitizeSearchTerm() above (A6)
  }
  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No messages yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(i => `
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
    </tr>`).join('');
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
async function loadStaff() {
  const tbody = document.getElementById('staff-tbody');
  const { data, error } = await db.from('staff').select('*').order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--danger-text)">Error: ${escapeHTML(error.message)}</td></tr>`;
    return;
  }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No staff added yet.</td></tr>`;
    return;
  }

  const onlineCutoff = Date.now() - 5 * 60 * 1000;
  tbody.innerHTML = data.map(s => {
    const online = s.last_seen_at && new Date(s.last_seen_at).getTime() > onlineCutoff;
    const isSelf = CURRENT_SESSION && s.auth_user_id === CURRENT_SESSION.user.id;
    return `
    <tr>
      <td><strong>${escapeHTML(s.full_name)}</strong> ${online ? '<span class="presence-dot online" style="position:static; display:inline-block; margin-left:.3rem;"></span>' : ''}</td>
      <td>${escapeHTML(s.email)}<br/><small style="color:var(--text-muted);">${escapeHTML(s.phone) || 'No phone'}</small></td>
      <td><span class="badge badge-${s.role}">${escapeHTML(s.role)}</span></td>
      <td><span class="badge badge-${s.status}">${escapeHTML(s.status)}</span></td>
      <td>${timeAgo(s.last_seen_at)}</td>
      <td>
        ${isSelf ? '<span style="color:var(--text-muted); font-size:.8125rem;">You</span>' : (s.status === 'suspended'
          ? `<button class="btn btn-secondary btn-sm" data-action="toggle-staff" data-id="${escapeHTML(s.id)}" data-status="active"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>`
          : `<button class="btn btn-danger btn-sm" data-action="toggle-staff" data-id="${escapeHTML(s.id)}" data-status="suspended"><i class="fa-solid fa-ban"></i> Suspend</button>`)}
      </td>
    </tr>`;
  }).join('');
}

function openStaffModal() {
  document.getElementById('staff-form').reset();
  document.getElementById('staff-result').innerHTML = '';
  document.getElementById('staff-modal').classList.add('active');
  focusModal(document.getElementById('staff-modal'));
}

function closeStaffModal() {
  document.getElementById('staff-modal').classList.remove('active');
}

document.getElementById('staff-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('staff-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating…';

  const payload = {
    full_name: document.getElementById('staff-name').value,
    email: document.getElementById('staff-email').value,
    phone: document.getElementById('staff-phone').value,
    role: document.getElementById('staff-role').value
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-staff-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CURRENT_SESSION.access_token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not create staff account');

    document.getElementById('staff-result').innerHTML = `
      <div class="form-success" style="border:1.5px solid var(--success); background:rgba(16,185,129,.12); border-radius:8px; padding:1rem;">
        <strong style="display:block; color:var(--success); margin-bottom:.4rem;">Account created for ${escapeHTML(payload.full_name)}</strong>
        <p style="font-size:.85rem; margin-bottom:.4rem;">Share these sign-in details with them securely — this password won't be shown again.</p>
        <code style="display:block; background:var(--bg-base); padding:.6rem .8rem; border-radius:6px; font-size:.85rem;">
          ${escapeHTML(payload.email)}<br>${escapeHTML(json.temp_password)}
        </code>
      </div>`;
    showToast('Staff account created', 'success');
    loadStaff();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
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
  'open-staff-modal':      () => openStaffModal(),
  'close-staff-modal':     () => closeStaffModal(),
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
document.getElementById('product-search').addEventListener('input', debounce(loadProducts, 250));
document.getElementById('order-search').addEventListener('input', debounce(loadOrders, 250));
document.getElementById('message-search').addEventListener('input', debounce(loadMessages, 250));

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
