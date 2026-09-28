const state = { orders: [], ordersById: {}, products: [], productsById: {} };
let orderItemRows = [];

function generateOrderNumber() {
  const d = new Date();
  const stamp = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return stamp + rand;
}

async function loadOrders() {
  document.getElementById('ordersTableBody').innerHTML = skeletonRows(7, 3);
  const [ordersRes, productsRes] = await Promise.all([api.orders.list(), api.products.list()]);
  if (ordersRes.error) { showToast(ordersRes.error.message, 'danger'); return; }
  state.orders = ordersRes.data || [];
  state.ordersById = Object.fromEntries(state.orders.map(o => [o.id, o]));
  state.products = productsRes.data || [];
  state.productsById = Object.fromEntries(state.products.map(p => [p.id, p]));
  applyFilters();
}

/* ---- per-column filtering (client-side) ---- */
function getFilteredOrders() {
  const search = document.getElementById('ofSearch').value.trim().toLowerCase();
  const status = document.getElementById('ofStatus').value;
  const from = document.getElementById('ofFrom').value;
  const to = document.getElementById('ofTo').value;
  const min = parseFloat(document.getElementById('ofMin').value);
  const max = parseFloat(document.getElementById('ofMax').value);
  return state.orders.filter(o => {
    if (status && o.status !== status) return false;
    if (search) {
      const hay = `${o.order_number} ${o.customer_name} ${o.customer_email || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (from && o.created_at < from) return false;
    if (to && o.created_at > (to + 'T23:59:59')) return false;
    if (!isNaN(min) && Number(o.total_amount) < min) return false;
    if (!isNaN(max) && Number(o.total_amount) > max) return false;
    return true;
  });
}
function applyFilters() { renderOrdersTable(getFilteredOrders()); }
['ofSearch', 'ofStatus', 'ofFrom', 'ofTo', 'ofMin', 'ofMax'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', debounce(applyFilters, 250));
});
document.getElementById('ofReset').addEventListener('click', () => {
  ['ofSearch', 'ofStatus', 'ofFrom', 'ofTo', 'ofMin', 'ofMax'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
});

function renderOrdersTable(rows) {
  const tbody = document.getElementById('ordersTableBody');
  document.getElementById('orderResultCount').textContent = `${rows.length} of ${state.orders.length} orders`;
  if (!rows.length) { tbody.innerHTML = emptyRow(7, 'No orders match this view.'); return; }
  tbody.innerHTML = rows.map(o => {
    const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.pending;
    const idx = ORDER_PIPELINE.indexOf(o.status);
    const nextStatus = idx > -1 && idx < ORDER_PIPELINE.length - 1 ? ORDER_PIPELINE[idx + 1] : null;
    return `<tr>
      <td><strong>#${escapeHtml(o.order_number)}</strong></td>
      <td>${escapeHtml(o.customer_name)}<br><span class="cell-sub">${escapeHtml(o.customer_email || '')}</span></td>
      <td>${formatCurrency(o.shipping_fee || 0)}</td>
      <td><strong>${formatCurrency(o.total_amount)}</strong></td>
      <td>
        <span class="badge ${meta.badge}">${meta.label}</span>
        <div class="row-actions">
          ${nextStatus ? `<button class="btn-link" onclick="advanceOrder('${o.id}','${nextStatus}')">Mark ${ORDER_STATUS_META[nextStatus].label}</button>` : ''}
          ${o.status !== 'cancelled' && o.status !== 'completed' ? `<button class="btn-link btn-link-danger" onclick="cancelOrder('${o.id}')">Cancel</button>` : ''}
        </div>
      </td>
      <td class="cell-sub">${formatDate(o.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewOrderItems('${o.id}')">View Items</button></td>
    </tr>`;
  }).join('');
}

async function advanceOrder(id, status) {
  if (status === 'shipped') {
    const { error } = await api.orders.markShipped(id);
    if (error) { showToast(error.message, 'danger'); return; }
    showToast('Order marked shipped \u2014 inventory updated.', 'success');
    loadOrders();
    return;
  }
  const { error } = await api.orders.updateStatus(id, status);
  if (error) { showToast(error.message, 'danger'); return; }
  showToast(`Order marked ${ORDER_STATUS_META[status].label.toLowerCase()}.`, 'success');
  loadOrders();
}
function cancelOrder(id) {
  confirmAction('Cancel this order? Remember to notify the customer separately.', async () => {
    const { error } = await api.orders.updateStatus(id, 'cancelled');
    if (error) { showToast(error.message, 'danger'); return; }
    showToast('Order cancelled.', 'success');
    loadOrders();
  }, 'Cancel Order');
}

async function viewOrderItems(orderId) {
  const order = state.ordersById[orderId];
  openModal(`Order #${order.order_number}`, `<p class="modal-loading">Loading items\u2026</p>`);
  const { data, error } = await api.orders.items(orderId);
  if (error) { document.getElementById('modalBody').innerHTML = `<p class="text-danger">${escapeHtml(error.message)}</p>`; return; }
  const items = data || [];
  const subtotal = items.reduce((sum, it) => sum + Number(it.subtotal), 0);
  const rows = items.length
    ? items.map(it => `<tr><td>${escapeHtml(it.product_name)}</td><td>${it.quantity}</td><td>${formatCurrency(it.unit_price)}</td><td>${formatCurrency(it.subtotal)}</td></tr>`).join('')
    : `<tr><td colspan="4"><div class="empty-state"><p>No line items recorded for this order.</p></div></td></tr>`;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-order-meta">
      <p><strong>${escapeHtml(order.customer_name)}</strong> \u00B7 ${escapeHtml(order.customer_email || '')}${order.customer_phone ? (' \u00B7 ' + escapeHtml(order.customer_phone)) : ''}</p>
      ${order.shipping_address ? `<p class="cell-sub">${escapeHtml(order.shipping_address)}</p>` : ''}
    </div>
    <table class="data-table">
      <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Items Subtotal</td><td>${formatCurrency(subtotal)}</td></tr></tfoot>
    </table>
    <div class="field" style="margin-top:1.2rem">
      <label for="editShippingFee">Shipping Fee</label>
      <input id="editShippingFee" type="number" step="0.01" min="0" value="${order.shipping_fee || 0}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="saveShippingFeeBtn">Save Shipping Fee</button>
    </div>
    <p class="cell-sub" style="margin-top:1rem">Order Total: <strong>${formatCurrency(order.total_amount)}</strong></p>
  `;
  document.getElementById('saveShippingFeeBtn').addEventListener('click', async (e) => {
    const newFee = parseFloat(document.getElementById('editShippingFee').value) || 0;
    const newTotal = Math.round((subtotal + newFee) * 100) / 100;
    setButtonLoading(e.target, true, 'Saving\u2026');
    const { error } = await api.orders.updateShippingFee(orderId, newFee, newTotal);
    setButtonLoading(e.target, false);
    if (error) { showToast(error.message, 'danger'); return; }
    showToast('Shipping fee updated.', 'success');
    closeModal();
    loadOrders();
  });
}

/* ---- create order: dynamic line-item builder ---- */
function addOrderItemRow() {
  orderItemRows.push({ rowId: 'r' + Math.random().toString(36).slice(2), product_id: '', quantity: 1 });
  renderOrderItemsBuilder();
}
function removeOrderItemRow(rowId) {
  orderItemRows = orderItemRows.filter(r => r.rowId !== rowId);
  renderOrderItemsBuilder();
}
function renderOrderItemsBuilder() {
  const el = document.getElementById('orderItemsBuilder');
  const activeProducts = state.products.filter(p => p.status !== 'archived');
  el.innerHTML = orderItemRows.length ? orderItemRows.map(r => {
    const p = state.productsById[r.product_id];
    const price = p ? p.unit_price : 0;
    return `<div class="order-item-row" data-row="${r.rowId}">
      <select class="oi-product" data-row="${r.rowId}">
        <option value="">Select product\u2026</option>
        ${activeProducts.map(ap => `<option value="${ap.id}" ${ap.id === r.product_id ? 'selected' : ''}>${escapeHtml(ap.name)}</option>`).join('')}
      </select>
      <input class="oi-qty" type="number" min="1" value="${r.quantity}" data-row="${r.rowId}">
      <span class="cell-sub">${formatCurrency(price)} each</span>
      <strong class="oi-subtotal">${formatCurrency(price * r.quantity)}</strong>
      <button type="button" class="btn-link btn-link-danger" onclick="removeOrderItemRow('${r.rowId}')">Remove</button>
    </div>`;
  }).join('') : '<p class="empty-inline">No items yet \u2014 add one below.</p>';

  el.querySelectorAll('.oi-product').forEach(sel => sel.addEventListener('change', (e) => {
    const row = orderItemRows.find(r => r.rowId === e.target.dataset.row);
    row.product_id = e.target.value;
    renderOrderItemsBuilder();
    recomputeOrderTotals();
  }));
  el.querySelectorAll('.oi-qty').forEach(inp => inp.addEventListener('input', (e) => {
    const row = orderItemRows.find(r => r.rowId === e.target.dataset.row);
    row.quantity = parseInt(e.target.value, 10) || 0;
    const p = state.productsById[row.product_id];
    const rowEl = e.target.closest('.order-item-row');
    rowEl.querySelector('.oi-subtotal').textContent = formatCurrency((p ? p.unit_price : 0) * row.quantity);
    recomputeOrderTotals();
  }));
  recomputeOrderTotals();
}
function recomputeOrderTotals() {
  const subtotal = orderItemRows.reduce((sum, r) => {
    const p = state.productsById[r.product_id];
    return sum + (p ? p.unit_price * (r.quantity || 0) : 0);
  }, 0);
  const shipping = parseFloat(document.getElementById('orderShippingFee').value) || 0;
  document.getElementById('orderSubtotalDisplay').textContent = formatCurrency(subtotal);
  document.getElementById('orderTotalDisplay').textContent = formatCurrency(subtotal + shipping);
}
document.getElementById('orderShippingFee').addEventListener('input', recomputeOrderTotals);
document.getElementById('addOrderItemBtn').addEventListener('click', addOrderItemRow);

function openOrderForm() {
  document.getElementById('orderFormCard').hidden = false;
  document.getElementById('toggleOrderFormBtn').textContent = 'Hide Form';
  document.getElementById('orderNumber').value = generateOrderNumber();
  if (!orderItemRows.length) addOrderItemRow();
  db.from('site_settings').select('value').eq('key', 'shipping_flat_rate').maybeSingle().then(({ data }) => {
    if (data && data.value) { document.getElementById('orderShippingFee').value = data.value; recomputeOrderTotals(); }
  });
}
function closeOrderForm() {
  document.getElementById('orderFormCard').hidden = true;
  document.getElementById('toggleOrderFormBtn').textContent = '+ New Order';
  document.getElementById('createOrderForm').reset();
  orderItemRows = [];
}
document.getElementById('toggleOrderFormBtn').addEventListener('click', () => {
  document.getElementById('orderFormCard').hidden ? openOrderForm() : closeOrderForm();
});
document.getElementById('cancelOrderFormBtn').addEventListener('click', closeOrderForm);

document.getElementById('createOrderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const validRows = orderItemRows.filter(r => r.product_id && r.quantity > 0);
  if (!validRows.length) { showToast('Add at least one item with a product and quantity.', 'danger'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  setButtonLoading(btn, true, 'Creating\u2026');
  const shippingFee = parseFloat(document.getElementById('orderShippingFee').value) || 0;
  const subtotal = validRows.reduce((sum, r) => sum + state.productsById[r.product_id].unit_price * r.quantity, 0);
  const orderPayload = {
    order_number: document.getElementById('orderNumber').value,
    customer_name: document.getElementById('orderCustomerName').value,
    customer_email: document.getElementById('orderCustomerEmail').value || null,
    customer_phone: document.getElementById('orderCustomerPhone').value || null,
    shipping_address: document.getElementById('orderShippingAddress').value || null,
    shipping_fee: shippingFee,
    total_amount: Math.round((subtotal + shippingFee) * 100) / 100,
    status: 'pending',
  };
  const itemPayload = validRows.map(r => {
    const p = state.productsById[r.product_id];
    return { product_id: p.id, product_name: p.name, unit_price: p.unit_price, quantity: r.quantity };
  });
  const { error } = await api.orders.create(orderPayload, itemPayload);
  setButtonLoading(btn, false);
  if (error) { showToast(error.message, 'danger'); return; }
  showToast('Order created.', 'success');
  closeOrderForm();
  loadOrders();
});

guardAuth(() => loadOrders());
