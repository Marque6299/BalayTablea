/* ==========================================================================
   Balay Tablea — Shop (FE-P-04): catalogue, persistent cart, checkout.
   • Cart persists in localStorage (ids + qty only, js/cart.js).
   • Server is authoritative for prices/stock: place_order receives ids + qty.
   • Mobile (<900px): sticky bottom bar + bottom-sheet cart with focus trap.
   ========================================================================== */
(function () {
  'use strict';
  var U = window.BTUI, BT = window.BT, Cart = window.BTCart;
  var grid = document.getElementById('shopGrid');
  if (!U || !Cart || !grid) return;
  var $ = U.$, $$ = U.$$, esc = U.esc, money = U.money;

  var panel = $('#cartPanel'), backdrop = $('#cartBackdrop'), bar = $('#cartBar');
  var linesEl = $('#cartLines'), emptyEl = $('#cartEmpty'), noticeEl = $('#cartNotice');
  var checkoutBtn = $('#checkoutBtn'), form = $('#checkoutForm'), dlg = $('#productDialog');
  var REQ = (BT && BT.REQUIRED && BT.REQUIRED.checkoutRpc) || 1;
  var products = [], byId = {}, settings = {}, apiV = 0, maint = false, submitting = false;
  var state = { cat: '', sort: 'featured', q: '' };
  var releaseTrap = null, dialogOpener = null;
  var PLACEHOLDER = '<div class="ph" aria-hidden="true"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3c4 2 7 6 7 10a7 7 0 01-14 0c0-4 3-8 7-10z"/><path d="M12 3v18M8 8c1 3 1 7 0 10M16 8c-1 3-1 7 0 10"/></svg></div>';
  var PAY_LABEL = {
    cod: ['Cash on delivery', 'Pay the rider in cash when your order arrives.'],
    pay_on_pickup: ['Pay on pickup', 'Pay at the counter when you collect.'],
    gcash: ['GCash', 'Send payment after ordering; we\u2019ll show the details.'],
    bank_transfer: ['Bank transfer', 'Send payment after ordering; we\u2019ll show the details.']
  };
  var PAY_BY_FULFILLMENT = { pickup: ['pay_on_pickup', 'gcash', 'bank_transfer'], delivery: ['cod', 'gcash', 'bank_transfer'] };

  /* ---------- helpers ---------- */
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function safeImg(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }
  function fulfillment() { var r = form && form.querySelector('input[name="fulfillment"]:checked'); return r ? r.value : 'pickup'; }
  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }
  function announce(msg) { noticeEl.hidden = !msg; noticeEl.textContent = msg || ''; }

  /* ---------- filters (persisted in the URL hash) ---------- */
  function readHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h || h === 'cart' || h.indexOf('product-') === 0) return;
    var p = new URLSearchParams(h);
    state.cat = p.get('cat') || ''; state.sort = p.get('sort') || 'featured'; state.q = p.get('q') || '';
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.cat) p.set('cat', state.cat);
    if (state.sort !== 'featured') p.set('sort', state.sort);
    if (state.q) p.set('q', state.q);
    var s = p.toString();
    history.replaceState(null, '', location.pathname + location.search + (s ? '#' + s : ''));
  }
  function visible() {
    var q = state.q.trim().toLowerCase();
    var list = products.filter(function (p) {
      if (state.cat && p.category !== state.cat) return false;
      if (!q) return true;
      return (p.name + ' ' + (p.category || '') + ' ' + (p.description || '')).toLowerCase().indexOf(q) >= 0;
    });
    var idx = {}; products.forEach(function (p, i) { idx[p.id] = i; });
    list.sort(function (a, b) {
      if (state.sort === 'price-asc') return num(a.unit_price, 0) - num(b.unit_price, 0);
      if (state.sort === 'price-desc') return num(b.unit_price, 0) - num(a.unit_price, 0);
      return (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0) || num(a.sort_order, 0) - num(b.sort_order, 0) || idx[a.id] - idx[b.id];
    });
    return list;
  }

  /* ---------- catalogue ---------- */
  function stockHtml(p) {
    if (p.stock_quantity <= 0) return '<span class="p-stock out">Out of stock</span>';
    if (p.stock_quantity <= num(p.low_stock_threshold, 0)) return '<span class="p-stock low">Only ' + p.stock_quantity + ' left</span>';
    return '<span class="p-stock ok">In stock</span>';
  }
  function ctlHtml(p) {
    var q = Cart.qty(p.id), n = esc(p.name);
    if (p.stock_quantity <= 0) return '<button type="button" class="btn btn-primary" disabled>Out of stock</button>';
    if (q <= 0) return '<button type="button" class="btn btn-primary" data-action="add" aria-label="Add ' + n + ' to cart">Add to cart</button>';
    return '<div class="qty-stepper" role="group" aria-label="Quantity of ' + n + '">' +
      '<button type="button" data-action="dec" aria-label="Decrease quantity of ' + n + '">\u2212</button>' +
      '<span aria-live="polite">' + q + '</span>' +
      '<button type="button" data-action="inc" aria-label="Increase quantity of ' + n + '"' + (q >= p.stock_quantity ? ' disabled' : '') + '>+</button></div>';
  }
  function cardHtml(p) {
    var img = safeImg(p.image_url);
    return '<article class="product-card" id="product-' + esc(p.slug || p.id) + '" data-id="' + esc(p.id) + '">' +
      '<div class="thumb" data-action="open">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" width="600" height="600" loading="lazy" decoding="async">' : PLACEHOLDER) + '</div>' +
      '<div class="p-body">' +
        '<span class="p-cat">' + esc(p.category || '') + '</span>' +
        '<h3><button type="button" class="p-open" data-action="open" aria-haspopup="dialog">' + esc(p.name) + '</button></h3>' +
        (p.weight_label ? '<span class="p-weight">' + esc(p.weight_label) + '</span>' : '') +
        '<div class="p-price">' + money(p.unit_price) + '</div>' + stockHtml(p) +
        '<p class="p-cap" aria-live="polite"></p>' +
        '<div class="add-ctl">' + ctlHtml(p) + '</div>' +
      '</div></article>';
  }
  function renderChips() {
    var cats = [];
    products.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    var row = $('#chipRow');
    if (cats.length < 2) { row.innerHTML = ''; return; }
    row.innerHTML = ['All'].concat(cats).map(function (c) {
      var val = c === 'All' ? '' : c;
      return '<button type="button" class="chip" data-cat="' + esc(val) + '" aria-pressed="' + (state.cat === val) + '">' + esc(c) + '</button>';
    }).join('');
  }
  function renderGrid() {
    var list = visible();
    grid.removeAttribute('aria-busy');
    if (!products.length) { grid.innerHTML = '<div class="empty-state shop-empty">No products available right now \u2014 please check back soon.</div>'; return; }
    if (!list.length) { grid.innerHTML = '<div class="empty-state shop-empty">Nothing matches that search. <button type="button" class="btn btn-ghost btn-sm" data-action="reset">Clear filters</button></div>'; return; }
    grid.innerHTML = list.map(cardHtml).join('');
  }
  function refreshCard(id, focusAction) {
    var p = byId[id]; if (!p) return;
    var card = grid.querySelector('.product-card[data-id="' + id + '"]');
    if (card) {
      $('.add-ctl', card).innerHTML = ctlHtml(p);
      var cap = $('.p-cap', card), q = Cart.qty(id);
      cap.textContent = q >= p.stock_quantity && p.stock_quantity > 0 ? 'Only ' + p.stock_quantity + ' available' : '';
      if (focusAction) { var t = $('[data-action="' + focusAction + '"]', card) || $('[data-action="add"]', card) || $('[data-action="inc"]', card); if (t) t.focus(); }
    }
    if (dlg && dlg.open && dlg.getAttribute('data-id') === id) fillDialog(p, focusAction);
  }

  /* ---------- product dialog ---------- */
  function fillDialog(p, focusAction) {
    var img = safeImg(p.image_url), q = Cart.qty(p.id);
    dlg.setAttribute('data-id', p.id);
    dlg.innerHTML = '<button type="button" class="dlg-close" data-action="close" aria-label="Close">&times;</button>' +
      '<div class="dlg-body"><div class="dlg-img">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(p.name) + '" width="600" height="600" decoding="async">' : PLACEHOLDER) + '</div>' +
      '<div class="dlg-info"><span class="p-cat">' + esc(p.category || '') + '</span><h2 id="dlgTitle" style="font-size:1.5rem">' + esc(p.name) + '</h2>' +
      (p.weight_label ? '<span class="p-weight">' + esc(p.weight_label) + '</span>' : '') +
      '<div class="p-price">' + money(p.unit_price) + '</div>' + stockHtml(p) +
      (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
      '<p class="p-cap" aria-live="polite">' + (q >= p.stock_quantity && p.stock_quantity > 0 ? 'Only ' + p.stock_quantity + ' available' : '') + '</p>' +
      '<div class="add-ctl">' + ctlHtml(p) + '</div></div></div>';
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    if (focusAction) { var t = $('[data-action="' + focusAction + '"]', dlg) || $('[data-action="add"]', dlg); if (t) t.focus(); }
  }
  function openDialog(p, opener) {
    dialogOpener = opener || document.activeElement;
    fillDialog(p);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    history.replaceState(null, '', '#product-' + (p.slug || p.id));
    var c = $('.dlg-close', dlg); if (c) c.focus();
  }
  function closeDialog() { if (dlg.open && dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
  dlg.addEventListener('close', function () {
    writeHash();
    if (dialogOpener && document.body.contains(dialogOpener)) dialogOpener.focus();
  });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) return closeDialog();
    var b = e.target.closest('[data-action]'); if (!b) return;
    var a = b.getAttribute('data-action'), id = dlg.getAttribute('data-id');
    if (a === 'close') closeDialog(); else handleQty(a, id);
  });

  /* ---------- cart logic ---------- */
  function handleQty(action, id) {
    var p = byId[id]; if (!p) return;
    var cur = Cart.qty(id), next = cur;
    if (action === 'add') next = cur > 0 ? cur : 1;
    if (action === 'inc') next = cur + 1;
    if (action === 'dec') next = cur - 1;
    setQty(id, next, action);
  }
  function setQty(id, q, action) {
    var p = byId[id]; if (!p) return;
    var capped = q > p.stock_quantity;
    q = Math.max(0, Math.min(q, p.stock_quantity));
    Cart.set(id, q);
    renderCart();
    var focus = action === 'add' ? 'inc' : (q === 0 ? 'add' : action);
    refreshCard(id, focus);
    if (capped) { var cap = $('.product-card[data-id="' + id + '"] .p-cap'); if (cap) cap.textContent = 'Only ' + p.stock_quantity + ' available'; }
    if (action === 'add') U.toast('Added to cart.', 'success');
  }
  function shippingFor(sub) {
    if (apiV < REQ || fulfillment() !== 'delivery') return 0;
    var rate = num(settings.shipping_rate, 0), free = num(settings.free_shipping_threshold, 0);
    return free > 0 && sub >= free ? 0 : rate;
  }
  function cartLines() {
    return Cart.items().map(function (l) { return { p: byId[l.product_id], qty: l.qty }; }).filter(function (l) { return l.p; });
  }
  function renderCart() {
    var lines = cartLines(), sub = 0, count = 0;
    lines.forEach(function (l) { sub += l.qty * num(l.p.unit_price, 0); count += l.qty; });
    emptyEl.hidden = lines.length > 0;
    linesEl.innerHTML = lines.map(function (l) {
      return '<li class="cart-line" data-id="' + esc(l.p.id) + '"><span class="cl-name">' + esc(l.p.name) + ' \u00d7' + l.qty +
        '<span class="cl-meta">' + money(l.p.unit_price) + ' each</span></span><span>' + money(l.qty * num(l.p.unit_price, 0)) + '</span>' +
        '<button type="button" class="cl-remove" data-action="remove" aria-label="Remove ' + esc(l.p.name) + ' from cart">&times;</button></li>';
    }).join('');
    var ship = shippingFor(sub), total = sub + ship;
    $('#tSub').textContent = money(sub);
    var showShip = apiV >= REQ;
    $('#tShipRow').hidden = !showShip;
    $('#tShip').textContent = fulfillment() === 'delivery' ? (ship > 0 ? money(ship) : 'Free') : 'Pickup \u2014 free';
    $('#tTotal').textContent = money(total);
    var free = num(settings.free_shipping_threshold, 0), hint = $('#freeShip');
    if (showShip && fulfillment() === 'delivery' && free > 0 && sub > 0 && sub < free) { hint.hidden = false; hint.textContent = 'Add ' + money(free - sub) + ' more for free shipping.'; }
    else hint.hidden = true;
    checkoutBtn.disabled = !lines.length || maint;
    if (!lines.length && form.classList.contains('open')) { form.classList.remove('open'); checkoutBtn.style.display = ''; }
    // mobile bottom bar
    $('#cbCount').textContent = count + (count === 1 ? ' item' : ' items');
    $('#cbTotal').textContent = money(total);
    var showBar = count > 0 && isMobile() && !panel.classList.contains('open');
    bar.classList.toggle('show', showBar);
    document.body.classList.toggle('has-cart-bar', showBar);
    var head = $('#cartHeading'); if (head) head.textContent = 'Your cart' + (count ? ' (' + count + ')' : '');
  }
  // re-validate a persisted cart against fresh product data
  function validateCart() {
    var changes = [];
    Cart.items().forEach(function (l) {
      var p = byId[l.product_id];
      if (!p || p.stock_quantity <= 0) { Cart.set(l.product_id, 0); changes.push((p ? p.name : 'An item') + ' is no longer available and was removed'); }
      else if (l.qty > p.stock_quantity) { Cart.set(l.product_id, p.stock_quantity); changes.push(p.name + ' was reduced to ' + p.stock_quantity + ' (all we have)'); }
    });
    if (changes.length) announce('Your cart changed: ' + changes.join('; ') + '.');
  }

  /* ---------- cart sheet (mobile) / focus (desktop) ---------- */
  function openCart() {
    if (!isMobile()) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); var h = $('#cartHeading'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } return; }
    panel.classList.add('open'); backdrop.classList.add('show'); document.body.classList.add('sheet-open');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'cartHeading');
    bar.classList.remove('show'); document.body.classList.remove('has-cart-bar');
    releaseTrap = U.trap(panel, closeCart);
    $('#cartClose').focus();
  }
  function closeCart() {
    if (!panel.classList.contains('open')) return;
    panel.classList.remove('open'); backdrop.classList.remove('show'); document.body.classList.remove('sheet-open');
    panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); panel.removeAttribute('aria-labelledby');
    if (releaseTrap) { releaseTrap(); releaseTrap = null; }
    renderCart();
    var b = $('#cartBarBtn'); if (b && bar.classList.contains('show')) b.focus();
  }
  window.addEventListener('bt:open-cart', openCart);
  $('#cartBarBtn').addEventListener('click', openCart);
  $('#cartClose').addEventListener('click', closeCart);
  backdrop.addEventListener('click', closeCart);
  window.matchMedia('(min-width: 901px)').addEventListener('change', function (m) { if (m.matches) closeCart(); renderCart(); });

  /* ---------- events ---------- */
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]'); if (!b) return;
    var a = b.getAttribute('data-action');
    if (a === 'reset') { state = { cat: '', sort: 'featured', q: '' }; $('#shopSearch').value = ''; $('#shopSort').value = 'featured'; renderChips(); renderGrid(); writeHash(); return; }
    var card = b.closest('.product-card'); if (!card) return;
    var id = card.getAttribute('data-id');
    if (a === 'open') openDialog(byId[id], b.classList.contains('p-open') ? b : card.querySelector('.p-open'));
    else handleQty(a, id);
  });
  linesEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action="remove"]'); if (!b) return;
    var id = b.closest('.cart-line').getAttribute('data-id');
    Cart.set(id, 0); renderCart(); refreshCard(id);
    U.toast('Removed from cart.', 'info');
  });
  $('#chipRow').addEventListener('click', function (e) {
    var c = e.target.closest('.chip'); if (!c) return;
    state.cat = c.getAttribute('data-cat'); renderChips(); renderGrid(); writeHash();
    var again = $('.chip[aria-pressed="true"]'); if (again) again.focus();
  });
  var t; $('#shopSearch').addEventListener('input', function (e) { clearTimeout(t); var v = e.target.value; t = setTimeout(function () { state.q = v; renderGrid(); writeHash(); }, 150); });
  $('#shopSort').addEventListener('change', function (e) { state.sort = e.target.value; renderGrid(); writeHash(); });
  window.addEventListener('bt:cart:external', function () { renderCart(); renderGrid(); });
  window.addEventListener('hashchange', route);

  checkoutBtn.addEventListener('click', function () {
    form.classList.add('open'); checkoutBtn.style.display = 'none';
    $('#co-name').focus();
  });
  $$('input[name="fulfillment"]', form).forEach(function (r) { r.addEventListener('change', syncFulfillment); });

  function syncFulfillment() {
    var del = fulfillment() === 'delivery';
    var af = $('#addressField'); af.hidden = !del;
    var a = $('#co-address'); a.required = del; a.setAttribute('aria-required', del ? 'true' : 'false');
    renderPay();
    renderCart();
  }
  function renderPay() {
    var group = $('#payGroup');
    if (apiV < REQ) { group.hidden = true; return; }
    group.hidden = false;
    var opts = PAY_BY_FULFILLMENT[fulfillment()];
    var cur = form.querySelector('input[name="payment_method"]:checked'); cur = cur && opts.indexOf(cur.value) >= 0 ? cur.value : opts[0];
    $('#payChoices').innerHTML = opts.map(function (k) {
      return '<label class="choice"><input type="radio" name="payment_method" value="' + k + '"' + (k === cur ? ' checked' : '') + '><span>' + PAY_LABEL[k][0] + '<small>' + PAY_LABEL[k][1] + '</small></span></label>';
    }).join('');
  }
  function paintFulfillmentHints() {
    var pick = $('#pickupHint'), del = $('#deliveryHint');
    pick.textContent = settings.pickup_address ? 'Collect at ' + settings.pickup_address : 'Collect at our Cabatuan shop';
    var rate = num(settings.shipping_rate, 0), free = num(settings.free_shipping_threshold, 0);
    del.textContent = apiV >= REQ
      ? (rate > 0 ? 'Flat ' + money(rate) + ' shipping' + (free > 0 ? '; free over ' + money(free) : '') : 'We\u2019ll confirm the delivery fee')
      : 'We\u2019ll confirm the delivery fee';
  }

  /* ---------- checkout ---------- */
  var CO_FIELD = { name: 'co-name', email: 'co-email', phone: 'co-phone', address: 'co-address' };
  function fieldFail(id, msg) { U.setFieldError(document.getElementById(id), msg); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitting) return;
    U.clearFieldErrors(form); announce('');
    var lines = cartLines();
    if (!lines.length) return;
    var fd = new FormData(form), del = fulfillment() === 'delivery';
    var name = String(fd.get('name') || '').trim(), email = String(fd.get('email') || '').trim(), address = String(fd.get('address') || '').trim();
    var phone = BT.normalizePhone(fd.get('phone')), bad = false;
    if (name.length < 2) { fieldFail('co-name', 'Enter your name.'); bad = true; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { fieldFail('co-email', 'Enter a valid email, like you@example.com.'); bad = true; }
    if (!phone) { fieldFail('co-phone', 'Enter a mobile number, like 0917 123 4567.'); bad = true; }
    if (del && address.length < 8) { fieldFail('co-address', 'Enter your full delivery address (street, barangay, town).'); bad = true; }
    if (bad) { U.focusFirstError(form); return; }
    if (!BT || BT.unavailable) { announce('We can\u2019t reach the shop right now. Please try again shortly or message us on Facebook.'); return; }

    submitting = true;
    var btn = $('button[type="submit"]', form), payMethod = fd.get('payment_method') || (del ? 'cod' : 'pay_on_pickup');
    U.setBusy(btn, true, 'Placing order\u2026');
    BT.placeOrder({
      customer: { name: name, email: email, phone: phone, address: del ? address : '' },
      items: lines.map(function (l) { return { product_id: l.p.id, quantity: l.qty }; }),
      fulfillment: fulfillment(), payment_method: payMethod, hp: fd.get('p_hp'),
      legacyLines: lines.map(function (l) { return { product_name: l.p.name, quantity: l.qty, unit_price: l.p.unit_price }; })
    }).then(function (res) {
      Cart.clear();
      try { U.session.removeItem('bt_products'); } catch (x) { /* ignore */ }
      showConfirmation(res, email, lines);
      form.reset(); form.classList.remove('open'); checkoutBtn.style.display = ''; syncFulfillment();
      closeCart(); renderCart(); products.forEach(function (p) { refreshCard(p.id); });
      BT.fetchActiveProducts().then(function (rows) { setProducts(rows); renderGrid(); renderCart(); }).catch(function () {});
    }).catch(function (err) {
      var m = BT.mapError(err), d = m.detail || {};
      if (m.code === 'OUT_OF_STOCK' && d.product_id) {
        var avail = num(d.available, 0), p = byId[d.product_id];
        if (p) { p.stock_quantity = avail; Cart.set(p.id, Math.min(Cart.qty(p.id), avail)); refreshCard(p.id); }
        announce((d.name || 'An item') + ': ' + (avail > 0 ? 'only ' + avail + ' available \u2014 we lowered your quantity.' : 'just sold out \u2014 we removed it.') + ' Please review your cart and try again.');
        renderCart();
      } else if (m.code === 'PRODUCT_UNAVAILABLE') {
        if (d.product_id) { Cart.set(d.product_id, 0); if (byId[d.product_id]) refreshCard(d.product_id); }
        announce((d.name || 'An item') + ' is no longer available and was removed from your cart.'); renderCart();
      } else if (m.code === 'RATE_LIMITED') {
        announce('Too many attempts \u2014 please try again in a while, or message us on Facebook.');
      } else if (m.code === 'CLOSED') {
        maint = true; paintMaintenance(); announce('The shop is temporarily closed for orders.');
      } else if (m.code === 'INVALID_INPUT' && d.field && CO_FIELD[d.field]) {
        fieldFail(CO_FIELD[d.field], 'Please check this field.'); U.focusFirstError(form);
      } else {
        announce('Something went wrong, please try again \u2014 your cart is safe. You can also message us on Facebook.');
      }
      if (!noticeEl.hidden) noticeEl.focus();
    }).finally(function () { submitting = false; U.setBusy(btn, false, 'Place order'); btn.disabled = false; });
  });

  function showConfirmation(r, email, lines) {
    var box = $('#orderConfirm'), items = (r.items && r.items.length ? r.items : lines.map(function (l) { return { product_name: l.p.name, quantity: l.qty, subtotal: l.qty * num(l.p.unit_price, 0) }; }));
    var method = r.payment_method, isPickup = r.fulfillment_method === 'pickup', pay = r.payment_instructions || ((method === 'gcash' || method === 'bank_transfer') ? settings.payment_instructions : '');
    var steps = [];
    if (r.legacy) steps.push('We\u2019ll text or email you to confirm payment and delivery or pickup.');
    else {
      steps.push(isPickup ? 'We\u2019ll prepare your order and message you when it\u2019s ready to collect at ' + esc(settings.pickup_address || 'our Cabatuan shop') + '. Bring your order number.'
                          : 'We\u2019ll confirm your delivery details by text or email, then ship your order.');
      if (method === 'gcash' || method === 'bank_transfer') steps.push('Send your payment using the details above and use your order number as the reference. We\u2019ll mark it paid once we see it.');
      if (method === 'cod') steps.push('Pay in cash when your order arrives.');
      if (method === 'pay_on_pickup') steps.push('Pay at the counter when you pick up.');
    }
    box.innerHTML = '<div class="confirm-card" tabindex="-1" role="status"><h2>Order placed \u2014 salamat!</h2>' +
      '<p>Keep your order number; you\u2019ll need it to track your order.</p>' +
      '<div class="order-no"><code>' + esc(r.order_number) + '</code><button type="button" class="btn btn-ghost btn-sm" data-copy="' + esc(r.order_number) + '">Copy</button></div>' +
      '<div class="confirm-lines">' + items.map(function (i) { return '<div><span>' + esc(i.product_name) + ' \u00d7' + i.quantity + '</span><span>' + money(i.subtotal) + '</span></div>'; }).join('') +
      (r.legacy ? '' : '<div><span>Subtotal</span><span>' + money(r.subtotal) + '</span></div><div><span>Shipping</span><span>' + (num(r.shipping_fee, 0) > 0 ? money(r.shipping_fee) : 'Free') + '</span></div>') +
      '<div><strong>Total</strong><strong>' + money(r.total_amount) + '</strong></div></div>' +
      (pay ? '<div class="pay-box"><strong>How to pay</strong><br>' + esc(pay) + '</div>' : '') +
      '<h3 style="font-size:1.05rem">What happens next</h3><ol class="next-steps">' + steps.map(function (s) { return '<li>' + (r.legacy ? esc(s) : s) + '</li>'; }).join('') + '</ol>' +
      '<div class="btn-row"><a class="btn btn-primary" href="order-status.html?order=' + encodeURIComponent(r.order_number) + '&email=' + encodeURIComponent(email) + '">Track this order</a>' +
      '<button type="button" class="btn btn-ghost" data-dismiss>Keep shopping</button></div></div>';
    box.hidden = false;
    var c = $('.confirm-card', box); c.focus(); c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    U.toast('Order placed \u2014 ' + r.order_number, 'success');
  }
  $('#orderConfirm').addEventListener('click', function (e) {
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      var v = cp.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { U.toast('Order number copied.', 'success'); }, function () { U.toast('Select the number and copy it.', 'info'); });
    }
    if (e.target.closest('[data-dismiss]')) { this.hidden = true; this.innerHTML = ''; $('#shop-list').scrollIntoView({ behavior: 'smooth' }); }
  });

  /* ---------- maintenance mode (FE-P-03) ---------- */
  function paintMaintenance() {
    var b = $('#maintBanner');
    b.hidden = !maint;
    checkoutBtn.disabled = maint || !cartLines().length;
    if (maint && form.classList.contains('open')) { form.classList.remove('open'); checkoutBtn.style.display = ''; }
  }

  /* ---------- JSON-LD ItemList (FE-X-05) ---------- */
  function paintJsonLd() {
    var old = document.getElementById('ldProducts'); if (old) old.remove();
    if (!products.length) return;
    var s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldProducts';
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: products.map(function (p, i) {
        var o = { '@type': 'Product', name: p.name, offers: { '@type': 'Offer', price: num(p.unit_price, 0).toFixed(2), priceCurrency: 'PHP', availability: p.stock_quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: location.origin + '/shop.html#product-' + (p.slug || p.id) } };
        if (safeImg(p.image_url)) o.image = p.image_url;
        if (p.description) o.description = p.description;
        return { '@type': 'ListItem', position: i + 1, item: o };
      })
    });
    document.head.appendChild(s);
  }

  /* ---------- routing: #cart, #product-slug, filters ---------- */
  function route() {
    var h = (location.hash || '').replace(/^#/, '');
    if (h === 'cart') { openCart(); return; }
    if (h.indexOf('product-') === 0) {
      var slug = decodeURIComponent(h.slice(8));
      var p = products.filter(function (x) { return (x.slug || x.id) === slug; })[0];
      if (p && !dlg.open) openDialog(p, null);
    }
  }

  /* ---------- init ---------- */
  function setProducts(rows) {
    products = rows || []; byId = {};
    products.forEach(function (p) { p.stock_quantity = num(p.stock_quantity, 0); byId[p.id] = p; });
  }
  function boot() {
    readHash();
    $('#shopSearch').value = state.q; $('#shopSort').value = state.sort;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = '<div class="skel" style="grid-column:1/-1; height:240px" aria-hidden="true"></div>';
    renderCart();
    if (!BT || BT.unavailable) { grid.innerHTML = '<p class="load-error shop-empty">We can\u2019t load the shop right now. Please refresh, or message us on Facebook.</p>'; return; }
    Promise.all([BT.fetchActiveProducts(), BT.getSettings(), BT.apiVersion()]).then(function (r) {
      setProducts(r[0]); settings = r[1] || {}; apiV = r[2] || 0;
      maint = String(settings.maintenance_mode || 'false').toLowerCase() === 'true';
      validateCart(); renderChips(); renderGrid(); renderPay(); paintFulfillmentHints(); paintMaintenance(); renderCart(); paintJsonLd(); route();
    }).catch(function (err) {
      console.error(err);
      grid.removeAttribute('aria-busy');
      grid.innerHTML = '<div class="load-error shop-empty">Couldn\u2019t load products. <button type="button" class="btn btn-ghost btn-sm" id="retryLoad">Try again</button></div>';
      var rb = $('#retryLoad'); if (rb) rb.addEventListener('click', boot);
    });
  }
  window.addEventListener('bt:settings', function (e) {
    settings = e.detail || settings;
    maint = String(settings.maintenance_mode || 'false').toLowerCase() === 'true';
    paintFulfillmentHints(); paintMaintenance(); renderCart();
  });
  syncFulfillment();
  boot();
})();
