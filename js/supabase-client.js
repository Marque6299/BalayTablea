/* ==========================================================================
   Balay Tablea — shared Supabase client & data helpers
   Public, anonymous-only access: visitors never log in. Every insert below
   only requires a name + email + phone, matching the RLS policies already
   configured on the `inquiries`, `orders`, `order_items` and
   `visit_bookings` tables (anon INSERT allowed; no SELECT/UPDATE/DELETE).
   ========================================================================== */
(function () {
  var SUPABASE_URL = 'https://mmbdewpfmybfkczczdhn.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmRld3BmbXliZmtjemN6ZGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0ODMwNDYsImV4cCI6MjEwNjA1OTA0Nn0.S5MVJu4X2nz_jg20nWBSGOl28OqYrHZgCvh9UVFVxdQ';

  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('Supabase SDK failed to load — check network/ad-blocker.');
    window.BT = window.BT || {};
    window.BT.unavailable = true;
    return;
  }

  var db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ---------------- toast notifications ---------------- */
  function ensureToastContainer() {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }
  function showToast(message, type) {
    var container = ensureToastContainer();
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .3s ease';
      setTimeout(function () { toast.remove(); }, 300);
    }, 4200);
  }

  function money(n) {
    var v = Number(n || 0);
    return '\u20b1' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function orderNumber() {
    var d = new Date();
    var stamp = d.getFullYear().toString().slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    return 'BT-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  /* ---------------- reads ---------------- */
  function fetchActiveAnnouncement() {
    return db.from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(function (res) {
        if (res.error) { console.error(res.error); return null; }
        var rows = (res.data || []).filter(function (a) {
          var now = new Date();
          if (a.starts_at && new Date(a.starts_at) > now) return false;
          if (a.ends_at && new Date(a.ends_at) < now) return false;
          return true;
        });
        return rows[0] || null;
      });
  }

  function fetchActiveProducts() {
    return db.from('products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { console.error(res.error); return []; }
        return res.data || [];
      });
  }

  function fetchActiveStorefronts() {
    return db.from('storefronts')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(function (res) {
        if (res.error) { console.error(res.error); return []; }
        return res.data || [];
      });
  }

  /* ---------------- writes (guest — name/email/phone only) ---------------- */
  function submitInquiry(payload) {
    // payload: { inquiry_type, name, email, phone, company, message }
    return db.from('inquiries').insert([payload]).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function submitVisitBooking(payload) {
    // payload: { visitor_name, visitor_email, visitor_phone, visit_date, time_slot, pax, visit_type, notes }
    return db.from('visit_bookings').insert([payload]).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  function submitOrder(order, items) {
    // order: { customer_name, customer_email, customer_phone, shipping_address }
    // items: [{ product_name, quantity, unit_price, subtotal }]
    var total = items.reduce(function (sum, i) { return sum + Number(i.subtotal); }, 0);
    order.order_number = orderNumber();
    order.total_amount = total;
    return db.from('orders').insert([order]).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        var orderRow = res.data;
        var rows = items.map(function (i) {
          return {
            order_id: orderRow.id,
            product_name: i.product_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            subtotal: i.subtotal
          };
        });
        return db.from('order_items').insert(rows).then(function (r2) {
          if (r2.error) throw r2.error;
          return orderRow;
        });
      });
  }

  function lookupOrderStatus(orderNum, email) {
    // Calls the get_order_status(p_order_number, p_email) RPC — a
    // SECURITY DEFINER function that only returns a match when BOTH the
    // order number and email are correct, so anon can never browse orders.
    return db.rpc('get_order_status', { p_order_number: orderNum, p_email: email })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || null;
      });
  }

  function storefrontCardHtml(s) {
    return (
      '<div class="storefront-card">' +
        (s.image_url ? '<div class="sf-thumb"><img src="' + escapeHtml(s.image_url) + '" alt="' + escapeHtml(s.name) + '" loading="lazy"></div>' : '') +
        '<div class="sf-body">' +
          '<h3>' + escapeHtml(s.name) + '</h3>' +
          '<div class="sf-line"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg><span>' + escapeHtml(s.address) + ', ' + escapeHtml(s.city) + '</span></div>' +
          (s.hours ? '<div class="sf-line"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg><span>' + escapeHtml(s.hours) + '</span></div>' : '') +
          (s.phone ? '<div class="sf-line"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h4l2 5-2.5 1.5a11 11 0 005 5L14 14l5 2v4a2 2 0 01-2 2C9 22 2 15 2 7a2 2 0 012-2z"/></svg><span>' + escapeHtml(s.phone) + '</span></div>' : '') +
          (s.map_url ? '<a href="' + escapeHtml(s.map_url) + '" class="btn btn-ghost btn-sm" style="margin-top:.8rem" target="_blank" rel="noopener">View on map</a>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function mountStorefronts(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<div class="skel" style="grid-column:1/-1; height:180px"></div>';
    fetchActiveStorefronts().then(function (rows) {
      if (!rows.length) { el.innerHTML = '<div class="empty-state">Storefront details coming soon.</div>'; return; }
      el.innerHTML = rows.map(storefrontCardHtml).join('');
    });
  }

  window.BT = {
    db: db,
    showToast: showToast,
    money: money,
    escapeHtml: escapeHtml,
    fetchActiveAnnouncement: fetchActiveAnnouncement,
    fetchActiveProducts: fetchActiveProducts,
    fetchActiveStorefronts: fetchActiveStorefronts,
    mountStorefronts: mountStorefronts,
    submitInquiry: submitInquiry,
    submitVisitBooking: submitVisitBooking,
    submitOrder: submitOrder,
    lookupOrderStatus: lookupOrderStatus
  };
})();
