/* ==========================================================================
   Balay Tablea — order tracking (FE-P-07)
   Two-factor lookup (order number + email) via get_order_status().
   Tracker follows the fulfilment path; timeline comes from history[].
   ========================================================================== */
(function () {
  'use strict';
  var U = window.BTUI;
  if (!U) return;
  var $ = U.$, esc = U.esc, money = U.money;

  var PATHS = { pickup: ['pending', 'processing', 'ready_for_pickup', 'completed'], delivery: ['pending', 'processing', 'shipped', 'completed'] };
  var LABEL = { pending: 'Placed', processing: 'Processing', ready_for_pickup: 'Ready for pickup', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled' };
  var ICON = {
    pending: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>',
    processing: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    ready_for_pickup: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    shipped: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
    completed: '<path d="M5 12l5 5 9-10"/>',
    cancelled: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || '') + '</svg>'; }
  function when(iso) { return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }); }

  U.ready(function () {
    var form = $('#trackForm'), btn = $('#trackBtn'), err = $('#trackError'), out = $('#trackResult');
    if (!form) return;
    var params = new URLSearchParams(location.search);
    if (params.get('order')) $('#t-order').value = params.get('order');
    if (params.get('email')) $('#t-email').value = params.get('email');

    function showError(t) { err.textContent = t; err.classList.add('show'); err.setAttribute('role', 'alert'); }

    function render(o) {
      var fm = o.fulfillment_method || (o.shipping_address ? 'delivery' : 'pickup');
      var path = PATHS[fm] || PATHS.pickup, cancelled = o.status === 'cancelled';
      var cur = path.indexOf(o.status);
      var settings = window.BT_SETTINGS || {};
      var html = '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.75rem">' +
        '<div><div class="field-hint">Order</div><div style="font-family:Fraunces,serif; font-size:1.3rem; font-weight:700">' + esc(o.order_number) + '</div></div>' +
        '<span class="status-pill status-' + esc(o.status) + '">' + icon(o.status) + esc(LABEL[o.status] || o.status) + '</span></div>';
      if (cancelled) {
        html += '<div class="cancel-box" role="note"><strong>This order was cancelled.</strong><p style="margin:.4rem 0 0">Any items were returned to stock. If you didn\u2019t expect this, or you\u2019ve already paid, please <a href="contact.html">contact us</a> with your order number.</p></div>';
      } else {
        html += '<ol class="track-steps" aria-label="Order progress">' + path.map(function (s, i) {
          return '<li class="' + (i <= cur ? 'done' : '') + (i === cur ? ' current' : '') + '"' + (i === cur ? ' aria-current="step"' : '') + '>' + esc(LABEL[s]) + '</li>';
        }).join('') + '</ol>';
      }
      var pay = o.payment_status || 'unpaid', payLabel = { unpaid: 'Unpaid', paid: 'Paid', refunded: 'Refunded' }[pay] || pay;
      html += '<p class="field-hint" style="margin:0 0 .6rem">Placed ' + esc(when(o.created_at)) + ' \u00b7 ' + (fm === 'delivery' ? 'Delivery' : 'Pickup') +
        (o.shipping_address ? ' to ' + esc(o.shipping_address) : '') + '</p>';
      if (o.payment_method || o.payment_status) {
        html += '<p style="margin:.4rem 0"><span class="status-pill pay-' + esc(pay) + '">Payment: ' + esc(payLabel) + '</span></p>';
        if (pay === 'unpaid' && !cancelled && (o.payment_method === 'gcash' || o.payment_method === 'bank_transfer') && settings.payment_instructions) {
          html += '<div class="pay-box"><strong>How to pay</strong><br>' + esc(settings.payment_instructions) + '\nUse <b>' + esc(o.order_number) + '</b> as your payment reference.</div>';
        }
      }
      html += '<div class="track-items">' + ((o.items || []).map(function (it) {
        return '<div class="track-item-row"><span>' + esc(it.product_name) + ' <span class="qty">\u00d7' + it.quantity + '</span></span><span>' + money(it.subtotal) + '</span></div>';
      }).join('') || '<p class="field-hint">No line items on file.</p>') + '</div>' +
        '<div class="track-sums">' +
        (o.subtotal != null ? '<div><span>Subtotal</span><span>' + money(o.subtotal) + '</span></div>' : '') +
        (o.shipping_fee != null && fm === 'delivery' ? '<div><span>Shipping</span><span>' + (Number(o.shipping_fee) > 0 ? money(o.shipping_fee) : 'Free') + '</span></div>' : '') +
        '<div class="grand"><span>Total</span><span>' + money(o.total_amount) + '</span></div></div>';
      var hist = Array.isArray(o.history) ? o.history : [];
      if (hist.length) {
        html += '<h3 style="font-size:1rem; margin-top:1.4rem">History</h3><ul class="timeline-list">' + hist.map(function (h) {
          return '<li>' + esc(LABEL[h.status] || h.status) + '<time datetime="' + esc(h.at) + '">' + esc(when(h.at)) + '</time></li>';
        }).join('') + '</ul>';
      }
      html += '<div class="btn-row no-print"><button type="button" class="btn btn-ghost btn-sm" id="copyNo">Copy order number</button><button type="button" class="btn btn-ghost btn-sm" id="printBtn">Print receipt</button></div>';
      out.innerHTML = html; out.classList.add('show');
      $('#copyNo').addEventListener('click', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(o.order_number) : Promise.reject()).then(function () { U.toast('Order number copied.', 'success'); }, function () { U.toast('Select the number and copy it.', 'info'); });
      });
      $('#printBtn').addEventListener('click', function () { window.print(); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.classList.remove('show'); err.textContent = ''; out.classList.remove('show'); out.innerHTML = '';
      var orderEl = $('#t-order'), num = orderEl.value.trim().toUpperCase().replace(/\s+/g, ''), email = $('#t-email').value.trim();
      orderEl.value = num;
      if (!num || !email) return;
      var BT = window.BT;
      if (!BT || BT.unavailable) { showError('Order lookup is temporarily unavailable. Please try again shortly or message us on Facebook.'); return; }
      U.setBusy(btn, true, 'Checking\u2026');
      BT.lookupOrderStatus(num, email).then(function (o) {
        if (!o) { showError('We couldn\u2019t find an order with that order number and email. Check both and try again \u2014 order numbers look like BT-260928-K7M4QX.'); return; }
        render(o);
      }).catch(function (e2) {
        var m = BT.mapError(e2);
        showError(m.code === 'RATE_LIMITED' ? 'Too many lookups from this connection. Please try again in about an hour, or message us and we\u2019ll look it up.' : 'Something went wrong looking up your order. Please try again in a moment.');
      }).finally(function () { U.setBusy(btn, false, 'Check status'); });
    });
    if (params.get('order') && params.get('email')) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
})();
