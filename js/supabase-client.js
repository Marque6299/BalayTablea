/* ==========================================================================
   Balay Tablea — window.BT : the ONLY place public pages talk to Supabase
   (FE-X-04). A contract change (Improvement Plan §1) touches this file only.

   • Feature detection: BT.apiVersion() reads public.api_contract_version()
     (0 when the RPC is missing) and caches it in sessionStorage (bt_api_v).
     New RPC paths are used only when apiVersion >= BT.REQUIRED[feature];
     otherwise the LEGACY path runs (removed in FE-X-06 after milestone M3).
   • Errors from RPCs are mapped to {code, detail, message} (§1.2).
   • Prices are never sent by the browser: place_order receives ids + qty.
   ========================================================================== */
(function () {
  'use strict';
  var SUPABASE_URL = 'https://mmbdewpfmybfkczczdhn.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmRld3BmbXliZmtjemN6ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODMwNDYsImV4cCI6MjEwNjA1OTA0Nn0.S5MVJu4X2nz_jg20nWBSGOl28OqYrHZgCvh9UVFVxdQ';

  var U = window.BTUI || {};
  var esc = U.esc || function (s) { return String(s == null ? '' : s); };
  var money = U.money || function (n) { return '\u20b1' + Number(n || 0).toFixed(2); };
  var sess = U.session || window.sessionStorage;

  /* Minimum contract version per feature. Rollback switch: set a value to 99
     (e.g. checkoutRpc: 99) and redeploy to force the legacy path. */
  var REQUIRED = { checkoutRpc: 1, inquiryRpc: 1, bookingRpc: 1, availability: 1, orderStatusV2: 1, settings: 1, history: 2 };

  var KNOWN_CODES = ['INVALID_INPUT', 'OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE', 'RATE_LIMITED', 'NOT_ALLOWED', 'NOT_FOUND', 'INVALID_TRANSITION', 'DATE_UNAVAILABLE', 'CLOSED'];

  var PRODUCT_COLS = 'id,name,slug,image_url,category,unit_price,stock_quantity,low_stock_threshold,description,weight_label,is_featured,sort_order';
  var PRODUCT_COLS_LEGACY = 'id,name,slug,image_url,category,unit_price,stock_quantity,low_stock_threshold';
  var STOREFRONT_COLS = 'id,name,address,city,hours,phone,map_url,image_url,sort_order';

  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('Supabase SDK failed to load \u2014 check network/ad-blocker.');
    window.BT = { unavailable: true, showToast: U.toast || function () {}, money: money, escapeHtml: esc };
    return;
  }
  var db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  /* ---------- dev stubs (?stub=1 or localStorage bt_stub=1) — plan §2.8 ---------- */
  var wantStub = /[?&]stub=1/.test(location.search) || (U.local && U.local.getItem('bt_stub') === '1');
  var ready = Promise.resolve();
  if (wantStub) {
    ready = new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'js/dev-stubs.js'; s.onload = res; s.onerror = function () { console.warn('dev-stubs.js missing'); res(); };
      document.head.appendChild(s);
    });
  }
  function stub() { return window.BT_STUB || null; }

  /* ---------- error mapping (§1.2) ---------- */
  function mapError(err) {
    if (!err) return { code: 'UNKNOWN', detail: {}, message: 'Something went wrong, please try again.' };
    var msg = String(err.message || '');
    var det = {};
    try { det = err.details ? JSON.parse(err.details) : {}; } catch (e) { det = {}; }
    if (err.code === 'PGRST202' || /Could not find the function/i.test(msg)) return { code: 'RPC_MISSING', detail: {}, message: msg };
    if (KNOWN_CODES.indexOf(msg) >= 0) return { code: msg, detail: det, message: msg };
    if (err.__timeout) return { code: 'TIMEOUT', detail: {}, message: 'The request timed out.' };
    console.error(err);
    return { code: 'UNKNOWN', detail: {}, message: 'Something went wrong, please try again.' };
  }

  /* ---------- rpc wrapper: timeout + one retry for reads only ---------- */
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, rej) { setTimeout(function () { rej({ __timeout: true, message: 'timeout' }); }, ms || 10000); })]);
  }
  function rpc(name, args, opts) {
    opts = opts || {};
    return ready.then(function () {
      var st = stub();
      if (st && st.rpc && st.rpc[name]) {
        return Promise.resolve().then(function () { return st.rpc[name](args || {}); }).then(function (d) { return d; });
      }
      function call() {
        return withTimeout(db.rpc(name, args || {}), opts.timeout).then(function (res) {
          if (res.error) throw res.error;
          return res.data;
        });
      }
      return call().catch(function (err) {
        var isNet = err && (err.__timeout || /fetch|network|Failed to fetch/i.test(String(err.message || '')));
        if (opts.retry && isNet) return call();
        throw err;
      });
    });
  }

  /* ---------- api version ---------- */
  var versionPromise = null;
  function apiVersion() {
    var cached = sess.getItem('bt_api_v');
    if (cached !== null && cached !== '') return Promise.resolve(Number(cached));
    if (!versionPromise) {
      versionPromise = rpc('api_contract_version', {}, { retry: true }).then(function (v) {
        var n = Number(v) || 0; sess.setItem('bt_api_v', String(n)); return n;
      }).catch(function (err) {
        var m = mapError(err);
        if (m.code === 'RPC_MISSING') { sess.setItem('bt_api_v', '0'); return 0; }
        versionPromise = null; return 0; // network error: assume legacy, do not cache
      });
    }
    return versionPromise;
  }
  function supports(feature) {
    return apiVersion().then(function (v) { return v >= (REQUIRED[feature] == null ? 99 : REQUIRED[feature]); });
  }

  /* ---------- small cache ---------- */
  function cacheGet(key, ttl) {
    try {
      var o = JSON.parse(sess.getItem(key) || 'null');
      if (o && Date.now() - o.t < ttl) return o.v;
    } catch (e) { /* ignore */ }
    return null;
  }
  function cacheGetStale(key) { try { var o = JSON.parse(sess.getItem(key) || 'null'); return o ? o.v : null; } catch (e) { return null; } }
  function cacheSet(key, v) { try { sess.setItem(key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* quota */ } }

  /* ---------- reads ---------- */
  function fromStub(table) { var st = stub(); return st && st.tables && st.tables[table] ? st.tables[table] : null; }

  // Public settings (§1.7): 5-minute cache, stale-while-revalidate.
  function getSettings(force) {
    var fresh = force ? null : cacheGet('bt_settings', 5 * 60 * 1000);
    if (fresh) return Promise.resolve(fresh);
    var stale = cacheGetStale('bt_settings');
    var p = ready.then(function () {
      var sd = fromStub('site_settings');
      if (sd) return sd;
      return db.from('site_settings').select('key,value').eq('is_public', true).then(function (res) {
        if (!res.error) return res.data || [];
        // pre-M1: no is_public column \u2014 read only the three keys the site knows about
        return db.from('site_settings').select('key,value').in('key', ['shipping_rate', 'operating_hours', 'contact_phone']).then(function (r2) {
          return r2.error ? [] : (r2.data || []);
        });
      });
    }).then(function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.key] = r.value; });
      cacheSet('bt_settings', map);
      return map;
    }).catch(function () { return stale || {}; });
    return stale && !force ? Promise.resolve(stale).then(function (s) { p.then(function () {}); return s; }) : p;
  }

  function fetchActiveAnnouncement() {
    return ready.then(function () {
      var sd = fromStub('announcements');
      if (sd) return sd[0] || null;
      var iso = new Date().toISOString();
      return db.from('announcements').select('id,type,title,body,is_active,starts_at,ends_at,created_at')
        .eq('is_active', true)
        .or('starts_at.is.null,starts_at.lte.' + iso)
        .or('ends_at.is.null,ends_at.gte.' + iso)
        .order('created_at', { ascending: false }).limit(1)
        .then(function (res) {
          if (res.error) { console.error(res.error); return null; }
          return (res.data || [])[0] || null;
        });
    });
  }

  function fetchActiveProducts() {
    var c = cacheGet('bt_products', 60 * 1000);
    if (c) return Promise.resolve(c);
    return ready.then(function () {
      var sd = fromStub('products');
      if (sd) return sd;
      function q(cols, ordered) {
        var b = db.from('products').select(cols).eq('status', 'active');
        return (ordered ? b.order('sort_order', { ascending: true }) : b).order('created_at', { ascending: true });
      }
      return q(PRODUCT_COLS, true).then(function (res) {
        if (!res.error) return res.data || [];
        return q(PRODUCT_COLS_LEGACY, false).then(function (r2) { if (r2.error) throw r2.error; return r2.data || []; });
      });
    }).then(function (rows) { cacheSet('bt_products', rows); return rows; });
  }

  function fetchActiveStorefronts() {
    var c = cacheGet('bt_storefronts', 60 * 1000);
    if (c) return Promise.resolve(c);
    return ready.then(function () {
      var sd = fromStub('storefronts');
      if (sd) return sd;
      return db.from('storefronts').select(STOREFRONT_COLS).eq('is_active', true).order('sort_order', { ascending: true })
        .then(function (res) { if (res.error) throw res.error; return res.data || []; });
    }).then(function (rows) { cacheSet('bt_storefronts', rows); return rows; });
  }

  /* ---------- writes ---------- */
  function orderNumberLegacy() {
    var d = new Date();
    return 'BT-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
      '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  /* placeOrder({customer:{name,email,phone,address}, items:[{product_id,quantity}], fulfillment, payment_method, hp, legacyLines:[{product_name,quantity,unit_price}]})
     Resolves to the place_order JSON (\u00a71.5). Never retried automatically. */
  function placeOrder(o) {
    return supports('checkoutRpc').then(function (ok) {
      if (ok) {
        return rpc('place_order', {
          p_customer: o.customer,
          p_items: o.items.map(function (i) { return { product_id: i.product_id, quantity: i.quantity }; }), // NO prices
          p_fulfillment: o.fulfillment,
          p_payment_method: o.payment_method,
          p_hp: o.hp || ''
        });
      }
      /* ---- LEGACY direct insert (delete in FE-X-06) ---- */
      var lines = o.legacyLines || [];
      var total = lines.reduce(function (s, l) { return s + l.quantity * Number(l.unit_price); }, 0);
      var row = {
        customer_name: o.customer.name, customer_email: o.customer.email, customer_phone: o.customer.phone,
        shipping_address: o.fulfillment === 'delivery' ? o.customer.address : null,
        order_number: orderNumberLegacy(), total_amount: total
      };
      return db.from('orders').insert([row]).select().single().then(function (res) {
        if (res.error) throw res.error;
        var orderRow = res.data;
        var items = lines.map(function (l) {
          return { order_id: orderRow.id, product_name: l.product_name, quantity: l.quantity, unit_price: l.unit_price, subtotal: (l.quantity * Number(l.unit_price)).toFixed(2) };
        });
        return db.from('order_items').insert(items).then(function (r2) {
          if (r2.error) throw r2.error;
          return {
            order_number: orderRow.order_number, status: 'pending', payment_status: 'unpaid', fulfillment_method: o.fulfillment,
            payment_method: null, subtotal: total, shipping_fee: 0, total_amount: total, created_at: orderRow.created_at,
            items: lines.map(function (l) { return { product_name: l.product_name, quantity: l.quantity, unit_price: l.unit_price, subtotal: l.quantity * Number(l.unit_price) }; }),
            payment_instructions: null, legacy: true
          };
        });
      });
    });
  }

  function submitInquiry(payload, hp) {
    return supports('inquiryRpc').then(function (ok) {
      if (ok) return rpc('submit_inquiry', { p_payload: payload, p_hp: hp || '' });
      /* ---- LEGACY (delete in FE-X-06): metadata is folded into the message ---- */
      var meta = payload.metadata || {};
      var extra = Object.keys(meta).filter(function (k) { return meta[k] !== '' && meta[k] != null; })
        .map(function (k) { return k.replace(/_/g, ' ') + ': ' + meta[k]; }).join('\n');
      var row = { inquiry_type: payload.inquiry_type, name: payload.name, email: payload.email, phone: payload.phone || null, company: payload.company || null,
        message: payload.message + (extra ? '\n\n\u2014\n' + extra : '') };
      return db.from('inquiries').insert([row]).select().single().then(function (res) {
        if (res.error) throw res.error;
        return { id: res.data.id, reference: null };
      });
    });
  }

  function submitVisitBooking(payload, hp) {
    return supports('bookingRpc').then(function (ok) {
      if (ok) return rpc('submit_visit_booking', { p_payload: payload, p_hp: hp || '' });
      /* ---- LEGACY (delete in FE-X-06) ---- */
      return db.from('visit_bookings').insert([payload]).select().single().then(function (res) {
        if (res.error) throw res.error;
        return { id: res.data.id, booking_ref: null, status: 'pending' };
      });
    });
  }

  function getBookingAvailability(from, to) {
    return supports('availability').then(function (ok) {
      if (!ok) return null;
      return rpc('get_booking_availability', { p_from: from, p_to: to }, { retry: true });
    });
  }

  function lookupOrderStatus(orderNum, email) {
    return rpc('get_order_status', { p_order_number: String(orderNum).trim().toUpperCase().replace(/\s+/g, ''), p_email: String(email).trim() })
      .then(function (d) { return d || null; });
  }

  /* ---------- helpers ---------- */
  function normalizePhone(v) {
    var d = String(v || '').replace(/[\s\-().]/g, '');
    if (/^(\+?63)9\d{9}$/.test(d)) return '+63' + d.replace(/^\+?63/, '');
    if (/^09\d{9}$/.test(d)) return '+63' + d.slice(1);
    if (/^\+?\d{7,15}$/.test(d)) return d;
    return null;
  }

  var ICON = {
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h4l2 5-2.5 1.5a11 11 0 005 5L14 14l5 2v4a2 2 0 01-2 2C9 22 2 15 2 7a2 2 0 012-2z"/></svg>'
  };
  function safeHttps(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }
  function storefrontCardHtml(s) {
    return '<div class="storefront-card">' +
      (s.image_url ? '<div class="sf-thumb"><img src="' + esc(s.image_url) + '" alt="' + esc(s.name) + '" width="640" height="400" loading="lazy" decoding="async"></div>' : '') +
      '<div class="sf-body"><h3>' + esc(s.name) + '</h3>' +
      '<div class="sf-line">' + ICON.pin + '<span>' + esc(s.address) + ', ' + esc(s.city) + '</span></div>' +
      (s.hours ? '<div class="sf-line">' + ICON.clock + '<span>' + esc(s.hours) + '</span></div>' : '') +
      (s.phone ? '<div class="sf-line">' + ICON.phone + '<span>' + esc(s.phone) + '</span></div>' : '') +
      (safeHttps(s.map_url) ? '<a href="' + esc(s.map_url) + '" class="btn btn-ghost btn-sm" style="margin-top:.8rem" target="_blank" rel="noopener">View on map</a>' : '') +
      '</div></div>';
  }
  function mountStorefronts(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = '<div class="skel" style="grid-column:1/-1; height:180px" aria-hidden="true"></div>';
    fetchActiveStorefronts().then(function (rows) {
      el.innerHTML = rows.length ? rows.map(storefrontCardHtml).join('') : '<div class="empty-state" style="grid-column:1/-1">Storefront details coming soon.</div>';
    }).catch(function (err) {
      console.error(err);
      el.innerHTML = '<p class="load-error" style="grid-column:1/-1">Couldn\u2019t load locations \u2014 see the <a href="visit.html">Visit page</a> or message us on Facebook.</p>';
    }).finally(function () { el.removeAttribute('aria-busy'); });
  }

  window.BT = {
    db: db, REQUIRED: REQUIRED, ready: ready,
    showToast: U.toast || function () {}, money: money, escapeHtml: esc,
    mapError: mapError, rpc: rpc, apiVersion: apiVersion, supports: supports,
    hasRpc: function (name) { return supports(name === 'place_order' ? 'checkoutRpc' : name === 'submit_inquiry' ? 'inquiryRpc' : 'bookingRpc'); },
    getSettings: getSettings,
    fetchActiveAnnouncement: fetchActiveAnnouncement,
    fetchActiveProducts: fetchActiveProducts,
    fetchActiveStorefronts: fetchActiveStorefronts,
    mountStorefronts: mountStorefronts,
    placeOrder: placeOrder, submitInquiry: submitInquiry, submitVisitBooking: submitVisitBooking,
    getBookingAvailability: getBookingAvailability, lookupOrderStatus: lookupOrderStatus,
    normalizePhone: normalizePhone
  };
})();
