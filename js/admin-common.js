/* =====================================================================
   BALAY TABLEA — ADMIN SHARED LOGIC
   Loaded on every admin-*.html page, before that page's own script.
   ===================================================================== */

/* ---- Supabase client ---- */
const SUPABASE_URL = 'https://mmbdewpfmybfkczczdhn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmRld3BmbXliZmtjemN6ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODMwNDYsImV4cCI6MjEwNjA1OTA0Nn0.S5MVJu4X2nz_jg20nWBSGOl28OqYrHZgCvh9UVFVxdQ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   AUTH GUARD — every admin-*.html page (except admin-login.html) calls
   guardAuth(callback) at the bottom of its own script. Redirects to the
   login page if there's no session; otherwise fills in the topbar/
   sidebar user info and runs the callback.
   ===================================================================== */
function guardAuth(onReady) {
  db.auth.getSession().then(({ data: { session } }) => {
    if (!session) { window.location.href = 'admin-login.html'; return; }
    applySessionToShell(session);
    onReady(session);
  });
  db.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.href = 'admin-login.html';
  });
}
function applySessionToShell(session) {
  const email = (session.user && session.user.email) || '';
  const a = document.getElementById('userEmail');
  const b = document.getElementById('sidebarUserEmail');
  if (a) a.textContent = email;
  if (b) b.textContent = email;
}
function wireShellChrome() {
  ['logoutBtn', 'logoutBtnSidebar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => db.auth.signOut());
  });
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (toggle && sidebar && backdrop) {
    toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('open'); });
    backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); });
  }
}
wireShellChrome();

/* =====================================================================
   SUPABASE API — namespaced by entity. Every admin page shares this
   single source of truth for how it talks to the database.
   ===================================================================== */
const api = {
  auth: {
    signIn: (email, password) => db.auth.signInWithPassword({ email, password }),
  },
  products: {
    list: () => db.from('products').select('*').order('created_at', { ascending: false }),
    save: (payload, id) => id
      ? db.from('products').update(payload).eq('id', id)
      : db.from('products').insert([payload]),
    updatePrice: (id, unit_price) => db.from('products').update({ unit_price }).eq('id', id),
  },
  inventory: {
    list: () => db.from('inventory_logs').select('*, products(name), orders(order_number)').order('created_at', { ascending: false }).limit(1000),
    log: (payload) => db.from('inventory_logs').insert([payload]),
  },
  orders: {
    list: () => db.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
    create: (order, items) => db.from('orders').insert([order]).select().single()
      .then(({ data, error }) => {
        if (error) return { data, error };
        return db.from('order_items').insert(items.map(it => ({ ...it, order_id: data.id })))
          .then(({ error: itemsError }) => ({ data, error: itemsError }));
      }),
    updateStatus: (id, status) => db.from('orders').update({ status }).eq('id', id),
    markShipped: (id) => db.rpc('mark_order_shipped', { p_order_id: id }),
    updateShippingFee: (id, shipping_fee, total_amount) => db.from('orders').update({ shipping_fee, total_amount }).eq('id', id),
    items: (orderId) => db.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
    recent: (n) => db.from('orders').select('*').order('created_at', { ascending: false }).limit(n),
    countByStatus: (status) => db.from('orders').select('id', { count: 'exact', head: true }).eq('status', status),
  },
  bookings: {
    list: () => db.from('visit_bookings').select('*').order('visit_date', { ascending: true }).limit(1000),
    create: (payload) => db.from('visit_bookings').insert([payload]),
    updateStatus: (id, status) => db.from('visit_bookings').update({ status }).eq('id', id),
    updateNotes: (id, admin_notes) => db.from('visit_bookings').update({ admin_notes }).eq('id', id),
    upcoming: (n) => db.from('visit_bookings').select('*').gte('visit_date', new Date().toISOString().slice(0, 10)).order('visit_date', { ascending: true }).limit(n),
    countByStatus: (status) => db.from('visit_bookings').select('id', { count: 'exact', head: true }).eq('status', status),
  },
  settings: {
    list: () => db.from('site_settings').select('*'),
    save: (rows) => db.from('site_settings').upsert(rows, { onConflict: 'key' }),
  },
};

/* =====================================================================
   LOOKUP TABLES
   ===================================================================== */
const PRODUCT_STATUS_META = {
  draft: { label: 'Draft', badge: 'badge-muted' },
  active: { label: 'Active', badge: 'badge-success' },
  archived: { label: 'Archived', badge: 'badge-outline' },
};
const ORDER_PIPELINE = ['pending', 'processing', 'shipped', 'completed'];
const ORDER_STATUS_META = {
  pending: { label: 'Pending', badge: 'badge-warning' },
  processing: { label: 'Processing', badge: 'badge-accent' },
  shipped: { label: 'Shipped', badge: 'badge-accent-2' },
  completed: { label: 'Completed', badge: 'badge-success' },
  cancelled: { label: 'Cancelled', badge: 'badge-danger' },
};
const BOOKING_STATUS_META = {
  pending: { label: 'Pending Review', badge: 'badge-warning' },
  approved: { label: 'Approved', badge: 'badge-accent' },
  completed: { label: 'Completed', badge: 'badge-success' },
  declined: { label: 'Declined', badge: 'badge-danger' },
  cancelled: { label: 'Cancelled', badge: 'badge-muted' },
};
const BOOKING_TYPE_LABELS = { workshop: 'Workshop', farm_visit: 'Farm Visit', both: 'Workshop + Farm' };
const DEFAULT_CATEGORIES = ['Tablea Rolls', 'Hot Tsokolate Mix', 'Raw Cacao Nibs', 'Pasalubong Gift Sets', 'Otap'];

/* =====================================================================
   SHARED HELPERS
   ===================================================================== */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatCurrency(n) {
  return '\u20B1' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(d) { return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
function formatDateTime(d) { return new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function debounce(fn, delay) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }
function setButtonLoading(btn, loading, loadingText) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${escapeHtml(loadingText || 'Working\u2026')}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
    btn.disabled = false;
  }
}
function emptyRow(colspan, message) { return `<tr><td colspan="${colspan}"><div class="empty-state"><p>${escapeHtml(message)}</p></div></td></tr>`; }
function skeletonRows(colspan, count) {
  return Array.from({ length: count || 3 }).map(() => `<tr><td colspan="${colspan}"><div class="skeleton-bar"></div></td></tr>`).join('');
}
function setSegmented(containerId, hiddenId, value) {
  document.getElementById(containerId).querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === value));
  document.getElementById(hiddenId).value = value;
}
function lowStockOf(products) {
  return products.filter(p => p.status === 'active' && p.stock_quantity <= p.low_stock_threshold);
}

/* ---- toast ---- */
function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type || 'success'}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

/* ---- modal ---- */
function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  const overlay = document.getElementById('modalOverlay');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));
}
function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => { overlay.hidden = true; document.getElementById('modalBody').innerHTML = ''; }, 200);
}
function confirmAction(message, onConfirm, confirmLabel) {
  openModal('Please Confirm', `
    <p class="modal-text">${escapeHtml(message)}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="confirmCancelBtn">Never Mind</button>
      <button class="btn btn-danger" id="confirmOkBtn">${escapeHtml(confirmLabel || 'Confirm')}</button>
    </div>`);
  document.getElementById('confirmCancelBtn').addEventListener('click', closeModal);
  document.getElementById('confirmOkBtn').addEventListener('click', () => { closeModal(); onConfirm(); });
}
(function wireModalChrome() {
  const closeBtn = document.getElementById('modalCloseBtn');
  const overlay = document.getElementById('modalOverlay');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();
