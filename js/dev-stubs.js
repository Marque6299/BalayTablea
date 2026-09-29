/* ==========================================================================
   DEV STUBS (plan §2.8). Loaded only with ?stub=1 or localStorage bt_stub=1.
   In-memory implementation of the §1.5 / §1.8 contract so every screen can be
   built and demoed before the real RPCs exist. Removed in FE-X-06.
   ========================================================================== */
(function () {
  'use strict';
  function err(code, detail) { var e = new Error(code); e.details = JSON.stringify(detail || {}); throw e; }
  var products = [
    { id: 'p1', name: 'Tablea Roll 250g', slug: 'tablea-roll-250g', category: 'Pure Tablea', unit_price: 280, stock_quantity: 12, low_stock_threshold: 5, weight_label: '250 g', description: 'Stone-ground, banana-leaf wrapped tablea rolls.', is_featured: true, sort_order: 1, image_url: null },
    { id: 'p2', name: 'Hot Tsokolate Mix', slug: 'hot-tsokolate-mix', category: 'Sweetened', unit_price: 220, stock_quantity: 3, low_stock_threshold: 5, weight_label: '300 g', description: 'Just add hot water.', is_featured: true, sort_order: 2, image_url: null },
    { id: 'p3', name: 'Cacao Nibs', slug: 'cacao-nibs', category: 'Raw Cacao', unit_price: 180, stock_quantity: 0, low_stock_threshold: 5, weight_label: '200 g', description: 'Roasted nibs.', is_featured: false, sort_order: 3, image_url: null },
    { id: 'p4', name: "Nanay's Otap", slug: 'nanays-otap', category: 'Pasalubong', unit_price: 120, stock_quantity: 40, low_stock_threshold: 5, weight_label: '10 pcs', description: '', is_featured: true, sort_order: 4, image_url: null }
  ];
  var settings = { shipping_rate: '100', free_shipping_threshold: '500', operating_hours: 'Open daily, 8:00 AM \u2013 6:00 PM', contact_phone: '+63 928 524 5579',
    pickup_address: 'Rizal Street, Cabatuan, Iloilo', payment_instructions: 'GCash 0928 000 0000 (Balay Tablea).\nSend a screenshot to our Facebook page.',
    booking_time_slots: '["09:00","10:30","14:00"]', booking_max_pax: '30', booking_lead_days: '1', maintenance_mode: 'false' };
  var seq = 0;
  function ref(p, n) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * 32)]; var d = new Date(); return p + '-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + s; }

  window.BT_STUB = {
    tables: {
      products: products, storefronts: [{ id: 's1', name: 'Balay Tablea Workshop', address: 'Rizal Street', city: 'Cabatuan', hours: '8am\u20136pm', phone: '+63 928 524 5579', map_url: 'https://maps.google.com', image_url: null, sort_order: 1 }],
      announcements: [{ id: 'a1', type: 'promo', title: 'Stub mode', body: 'You are using in-memory dev data.', created_at: new Date().toISOString() }],
      site_settings: Object.keys(settings).map(function (k) { return { key: k, value: settings[k] }; })
    },
    rpc: {
      api_contract_version: function () { return 3; },
      place_order: function (a) {
        if (a.p_hp) return { order_number: 'BT-000000-XXXXXX', total_amount: 0, items: [] };
        var sub = 0, items = [];
        a.p_items.forEach(function (i) {
          var p = products.filter(function (x) { return x.id === i.product_id; })[0];
          if (!p) err('PRODUCT_UNAVAILABLE', { product_id: i.product_id });
          if (i.quantity > p.stock_quantity) err('OUT_OF_STOCK', { product_id: p.id, name: p.name, available: p.stock_quantity });
          sub += p.unit_price * i.quantity; items.push({ product_id: p.id, product_name: p.name, quantity: i.quantity, unit_price: p.unit_price, subtotal: p.unit_price * i.quantity });
        });
        a.p_items.forEach(function (i) { products.filter(function (x) { return x.id === i.product_id; })[0].stock_quantity -= i.quantity; });
        var ship = a.p_fulfillment === 'delivery' && sub < 500 ? 100 : 0;
        return { order_number: ref('BT', 6), status: 'pending', payment_status: 'unpaid', fulfillment_method: a.p_fulfillment, payment_method: a.p_payment_method, subtotal: sub, shipping_fee: ship, total_amount: sub + ship, created_at: new Date().toISOString(), items: items, payment_instructions: /gcash|bank/.test(a.p_payment_method) ? settings.payment_instructions : null };
      },
      submit_inquiry: function () { return { id: 'i' + (++seq), reference: ref('INQ', 4) }; },
      submit_visit_booking: function (a) { if (a.p_payload.visit_date.slice(-2) === '13') err('DATE_UNAVAILABLE', { date: a.p_payload.visit_date, reason: 'full' }); return { id: 'b' + (++seq), booking_ref: ref('VB', 4), status: 'pending' }; },
      get_booking_availability: function (a) {
        var out = [], d = new Date(a.p_from + 'T00:00:00Z'), e = new Date(a.p_to + 'T00:00:00Z');
        for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) { var s = d.toISOString().slice(0, 10), n = +s.slice(-2); out.push({ day: s, capacity: 30, booked_pax: n % 7 === 0 ? 30 : 10, remaining: n % 7 === 0 ? 0 : 20, is_closed: n % 11 === 0 }); }
        return out;
      },
      get_order_status: function (a) {
        var n = String(a.p_order_number).toUpperCase(); if (/^BT-000000/.test(n) === false && !/^BT-/.test(n)) return null;
        var del = /D$/.test(n), now = new Date().toISOString();
        return { order_number: n, status: /X$/.test(n) ? 'cancelled' : (del ? 'shipped' : 'ready_for_pickup'), created_at: now, fulfillment_method: del ? 'delivery' : 'pickup', payment_method: 'gcash', payment_status: 'unpaid', subtotal: 560, shipping_fee: del ? 100 : 0, total_amount: del ? 660 : 560, shipping_address: del ? '12 Rizal St, Cabatuan' : null, items: [{ product_name: 'Tablea Roll 250g', quantity: 2, unit_price: 280, subtotal: 560 }], history: [{ status: 'pending', at: now }, { status: 'processing', at: now }] };
      }
    }
  };
  console.info('[Balay Tablea] dev stubs active \u2014 end BT order numbers in D (delivery) or X (cancelled) to preview states');
})();
