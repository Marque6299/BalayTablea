/* ==========================================================================
   Balay Tablea — cart store (FE-P-04)
   localStorage key bt_cart_v1 = [{product_id, qty}]. Ids + quantities ONLY —
   prices are never stored client-side; the server prices every order.
   ========================================================================== */
(function () {
  'use strict';
  var KEY = (window.BTUI && BTUI.CART_KEY) || 'bt_cart_v1';
  var store = (window.BTUI && BTUI.local) || window.localStorage;
  var lines = [];

  function load() {
    try {
      var raw = JSON.parse(store.getItem(KEY) || '[]');
      lines = (Array.isArray(raw) ? raw : []).filter(function (l) {
        return l && typeof l.product_id === 'string' && Number(l.qty) > 0;
      }).map(function (l) { return { product_id: l.product_id, qty: Math.min(99, Math.floor(Number(l.qty))) }; });
    } catch (e) { lines = []; }
  }
  function save() {
    try { store.setItem(KEY, JSON.stringify(lines)); } catch (e) { /* private mode: cart lives in memory */ }
    window.dispatchEvent(new CustomEvent('bt:cart'));
  }
  function qty(id) {
    for (var i = 0; i < lines.length; i++) if (lines[i].product_id === id) return lines[i].qty;
    return 0;
  }
  function set(id, q) {
    q = Math.max(0, Math.min(99, Math.floor(Number(q) || 0)));
    lines = lines.filter(function (l) { return l.product_id !== id; });
    if (q > 0) lines.push({ product_id: id, qty: q });
    save();
  }
  function clear() { lines = []; save(); }
  function items() { return lines.slice(); }
  function count() { return lines.reduce(function (n, l) { return n + l.qty; }, 0); }

  load();
  window.addEventListener('storage', function (e) { if (e.key === KEY) { load(); window.dispatchEvent(new CustomEvent('bt:cart:external')); } });
  window.BTCart = { items: items, qty: qty, set: set, clear: clear, count: count, reload: load };
})();
