const state = { logs: [], products: [] };

async function loadInventory() {
  document.getElementById('inventoryTableBody').innerHTML = skeletonRows(6, 3);
  const [logsRes, productsRes] = await Promise.all([api.inventory.list(), api.products.list()]);
  if (logsRes.error) { showToast(logsRes.error.message, 'danger'); return; }
  if (productsRes.error) { showToast(productsRes.error.message, 'danger'); return; }
  state.logs = logsRes.data || [];
  state.products = productsRes.data || [];
  renderProductOptions();
  renderLowStockBanner('inventoryLowStock');
  applyFilters();
}
function renderProductOptions() {
  const opts = state.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.stock_quantity} in stock)</option>`).join('');
  document.getElementById('invProductId').innerHTML = opts;
  document.getElementById('ifProduct').innerHTML = `<option value="">All products</option>` + opts;
}
function renderLowStockBanner(targetId) {
  const el = document.getElementById(targetId);
  const items = lowStockOf(state.products);
  el.innerHTML = items.length
    ? items.map(p => `<div class="mini-row"><span>${escapeHtml(p.name)}</span><span class="text-danger">${p.stock_quantity} left</span></div>`).join('')
    : `<p class="empty-inline">All active products are above their stock threshold.</p>`;
}

/* ---- per-column filtering (client-side) ---- */
function getFilteredLogs() {
  const productId = document.getElementById('ifProduct').value;
  const type = document.getElementById('ifType').value;
  const orderTerm = document.getElementById('ifOrder').value.trim().toLowerCase();
  const reasonTerm = document.getElementById('ifReason').value.trim().toLowerCase();
  const from = document.getElementById('ifFrom').value;
  const to = document.getElementById('ifTo').value;
  return state.logs.filter(log => {
    if (productId && log.product_id !== productId) return false;
    if (type && log.change_type !== type) return false;
    if (orderTerm && !(log.orders && String(log.orders.order_number).toLowerCase().includes(orderTerm))) return false;
    if (reasonTerm && !(log.reason || '').toLowerCase().includes(reasonTerm)) return false;
    if (from && log.created_at < from) return false;
    if (to && log.created_at > (to + 'T23:59:59')) return false;
    return true;
  });
}
function applyFilters() { renderInventoryTable(getFilteredLogs()); }
['ifProduct', 'ifType', 'ifOrder', 'ifReason', 'ifFrom', 'ifTo'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', debounce(applyFilters, 200));
});
document.getElementById('ifReset').addEventListener('click', () => {
  ['ifProduct', 'ifType', 'ifOrder', 'ifReason', 'ifFrom', 'ifTo'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
});

function renderInventoryTable(rows) {
  const tbody = document.getElementById('inventoryTableBody');
  document.getElementById('inventoryResultCount').textContent = `${rows.length} of ${state.logs.length} entries`;
  if (!rows.length) { tbody.innerHTML = emptyRow(6, 'No stock movements match these filters.'); return; }
  tbody.innerHTML = rows.map(log => {
    const positive = log.change_amount > 0;
    return `<tr>
      <td class="cell-sub">${formatDateTime(log.created_at)}</td>
      <td><strong>${escapeHtml((log.products && log.products.name) || 'Unknown item')}</strong></td>
      <td class="${positive ? 'text-success' : 'text-danger'}"><strong>${positive ? '+' : ''}${log.change_amount}</strong></td>
      <td><span class="badge badge-outline">${escapeHtml(log.change_type)}</span></td>
      <td>${log.orders ? '#' + escapeHtml(log.orders.order_number) : '<span class="cell-sub">\u2014</span>'}</td>
      <td>${escapeHtml(log.reason || '\u2014')}</td>
    </tr>`;
  }).join('');
}

document.getElementById('inventoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setButtonLoading(btn, true, 'Saving\u2026');
  const payload = {
    product_id: document.getElementById('invProductId').value,
    change_amount: parseInt(document.getElementById('invChange').value, 10),
    change_type: document.getElementById('invType').value,
    reason: document.getElementById('invReason').value,
  };
  const { error } = await api.inventory.log(payload);
  setButtonLoading(btn, false);
  if (error) { showToast(error.message, 'danger'); return; }
  e.target.reset();
  showToast('Stock movement recorded.', 'success');
  loadInventory();
});

guardAuth(() => loadInventory());
