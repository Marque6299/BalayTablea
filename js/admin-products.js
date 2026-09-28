const state = {
  products: [], productsById: {}, selectedProductIds: new Set(),
};

async function loadProducts() {
  document.getElementById('productsTableBody').innerHTML = skeletonRows(8, 3);
  const { data, error } = await api.products.list();
  if (error) { showToast(error.message, 'danger'); return; }
  state.products = data || [];
  state.productsById = Object.fromEntries(state.products.map(p => [p.id, p]));
  renderProductSelectOptions();
  renderCategoryFilterOptions();
  applyFilters();
}

function renderProductSelectOptions() {
  const dl = document.getElementById('categoryList');
  const existing = state.products.map(p => p.category).filter(Boolean);
  const all = [...new Set([...DEFAULT_CATEGORIES, ...existing])];
  dl.innerHTML = all.map(c => `<option value="${escapeHtml(c)}">`).join('');
}
function renderCategoryFilterOptions() {
  const sel = document.getElementById('pfCategory');
  const current = sel.value;
  const cats = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All</option>` + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  sel.value = current;
}

/* ---- per-column filtering (client-side) ---- */
function getFilteredProducts() {
  const name = document.getElementById('pfName').value.trim().toLowerCase();
  const category = document.getElementById('pfCategory').value;
  const status = document.getElementById('pfStatus').value;
  const stockFilter = document.getElementById('pfStock').value;
  const min = parseFloat(document.getElementById('pfPriceMin').value);
  const max = parseFloat(document.getElementById('pfPriceMax').value);
  return state.products.filter(p => {
    if (name && !(p.name.toLowerCase().includes(name) || (p.slug || '').toLowerCase().includes(name))) return false;
    if (category && p.category !== category) return false;
    if (status && p.status !== status) return false;
    if (stockFilter === 'low' && !(p.stock_quantity <= p.low_stock_threshold)) return false;
    if (stockFilter === 'out' && !(p.stock_quantity <= 0)) return false;
    if (!isNaN(min) && p.unit_price < min) return false;
    if (!isNaN(max) && p.unit_price > max) return false;
    return true;
  });
}
function applyFilters() { renderProductsTable(getFilteredProducts()); }
['pfName', 'pfCategory', 'pfStatus', 'pfStock', 'pfPriceMin', 'pfPriceMax'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', debounce(applyFilters, 200));
});
document.getElementById('pfReset').addEventListener('click', () => {
  ['pfName', 'pfCategory', 'pfStatus', 'pfStock', 'pfPriceMin', 'pfPriceMax'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
});

function renderProductsTable(rows) {
  const tbody = document.getElementById('productsTableBody');
  document.getElementById('productResultCount').textContent = `${rows.length} of ${state.products.length} product${state.products.length === 1 ? '' : 's'}`;
  if (!rows.length) { tbody.innerHTML = emptyRow(8, state.products.length ? 'No products match these filters.' : 'No products yet \u2014 add your first one above.'); return; }
  tbody.innerHTML = rows.map(p => {
    const meta = PRODUCT_STATUS_META[p.status] || PRODUCT_STATUS_META.draft;
    const low = p.stock_quantity <= p.low_stock_threshold;
    const img = p.image_url ? `<img class="thumb" src="${escapeHtml(p.image_url)}" alt="">` : `<div class="thumb thumb-empty">No Img</div>`;
    return `<tr>
      <td><input type="checkbox" class="row-check" data-id="${p.id}" ${state.selectedProductIds.has(p.id) ? 'checked' : ''}></td>
      <td>${img}</td>
      <td><strong>${escapeHtml(p.name)}</strong><br><span class="cell-sub">${escapeHtml(p.slug)}</span></td>
      <td>${p.category ? `<span class="badge badge-outline">${escapeHtml(p.category)}</span>` : '<span class="cell-sub">\u2014</span>'}</td>
      <td>${formatCurrency(p.unit_price)}</td>
      <td class="${low ? 'text-danger' : ''}">${p.stock_quantity}${low ? ' \u26A0' : ''}</td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="editProduct('${p.id}')">Edit</button></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.row-check').forEach(cb => cb.addEventListener('change', onProductCheck));
}

document.getElementById('prodStatusSeg').querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => setSegmented('prodStatusSeg', 'prodStatus', btn.dataset.value));
});
function resetProductForm() {
  document.getElementById('productForm').reset();
  document.getElementById('prodId').value = '';
  document.getElementById('prodThreshold').value = 5;
  setSegmented('prodStatusSeg', 'prodStatus', 'draft');
  document.getElementById('productFormTitle').textContent = 'Add a Product';
}
document.getElementById('prodResetBtn').addEventListener('click', resetProductForm);

function editProduct(id) {
  const p = state.productsById[id];
  if (!p) return;
  document.getElementById('prodId').value = p.id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodSlug').value = p.slug;
  document.getElementById('prodImage').value = p.image_url || '';
  document.getElementById('prodCategory').value = p.category || '';
  document.getElementById('prodPrice').value = p.unit_price;
  document.getElementById('prodStock').value = p.stock_quantity;
  document.getElementById('prodThreshold').value = p.low_stock_threshold;
  setSegmented('prodStatusSeg', 'prodStatus', p.status);
  document.getElementById('productFormTitle').textContent = `Editing \u201C${p.name}\u201D`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setButtonLoading(btn, true, 'Saving\u2026');
  const id = document.getElementById('prodId').value;
  const payload = {
    name: document.getElementById('prodName').value,
    slug: document.getElementById('prodSlug').value,
    image_url: document.getElementById('prodImage').value || null,
    category: document.getElementById('prodCategory').value || null,
    unit_price: parseFloat(document.getElementById('prodPrice').value),
    stock_quantity: parseInt(document.getElementById('prodStock').value, 10),
    low_stock_threshold: parseInt(document.getElementById('prodThreshold').value, 10) || 5,
    status: document.getElementById('prodStatus').value,
  };
  const { error } = await api.products.save(payload, id || null);
  setButtonLoading(btn, false);
  if (error) { showToast(error.message, 'danger'); return; }
  showToast(id ? 'Product updated.' : 'Product added.', 'success');
  resetProductForm();
  loadProducts();
});

/* ---- bulk selection & pricing ---- */
function onProductCheck(e) {
  const id = e.target.dataset.id;
  if (e.target.checked) state.selectedProductIds.add(id); else state.selectedProductIds.delete(id);
  renderBulkBar();
}
function renderBulkBar() {
  const bar = document.getElementById('bulkBar');
  const n = state.selectedProductIds.size;
  bar.hidden = n === 0;
  if (n) document.getElementById('bulkCount').textContent = `${n} selected`;
}
document.getElementById('selectAllProducts').addEventListener('change', (e) => {
  getFilteredProducts().forEach(p => e.target.checked ? state.selectedProductIds.add(p.id) : state.selectedProductIds.delete(p.id));
  applyFilters();
  renderBulkBar();
});
document.getElementById('bulkClearBtn').addEventListener('click', () => {
  state.selectedProductIds.clear();
  document.getElementById('selectAllProducts').checked = false;
  applyFilters();
  renderBulkBar();
});
document.getElementById('bulkApplyBtn').addEventListener('click', async () => {
  const mode = document.getElementById('bulkMode').value;
  const type = document.getElementById('bulkType').value;
  const amount = parseFloat(document.getElementById('bulkAmount').value);
  if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount.', 'danger'); return; }
  const btn = document.getElementById('bulkApplyBtn');
  setButtonLoading(btn, true, 'Updating\u2026');
  const ids = [...state.selectedProductIds];
  const results = await Promise.all(ids.map(id => {
    const p = state.productsById[id];
    const delta = type === 'percent' ? p.unit_price * (amount / 100) : amount;
    let newPrice = mode === 'increase' ? p.unit_price + delta : p.unit_price - delta;
    newPrice = Math.max(0, Math.round(newPrice * 100) / 100);
    return api.products.updatePrice(id, newPrice);
  }));
  setButtonLoading(btn, false);
  const failed = results.filter(r => r.error);
  showToast(failed.length ? `${failed.length} update(s) failed.` : `Updated pricing for ${ids.length} product(s).`, failed.length ? 'danger' : 'success');
  state.selectedProductIds.clear();
  document.getElementById('bulkAmount').value = '';
  loadProducts();
});

guardAuth(() => loadProducts());
