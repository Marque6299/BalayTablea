/* ==========================================================================
   Balay Tablea — order status lookup (order-status.html)
   Looks up an order by order_number + email via the get_order_status()
   RPC (see js/supabase-client.js). No auth required, no order browsing:
   both fields must match exactly or nothing is returned.
   ========================================================================== */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('trackForm');
    var btn = document.getElementById('trackBtn');
    var errorBox = document.getElementById('trackError');
    var resultBox = document.getElementById('trackResult');

    if (!form) return;

    // Prefill from ?order=...&email=... if arriving from an email link
    var params = new URLSearchParams(window.location.search);
    if (params.get('order')) document.getElementById('t-order').value = params.get('order');
    if (params.get('email')) document.getElementById('t-email').value = params.get('email');

    var STEP_ORDER = ['pending', 'processing', 'shipped', 'completed'];

    function renderResult(order) {
      var money = (window.BT && window.BT.money) || function (n) { return '₱' + Number(n || 0).toFixed(2); };
      var esc = (window.BT && window.BT.escapeHtml) || function (s) { return s; };

      document.getElementById('r-order-number').textContent = order.order_number;
      document.getElementById('r-date').textContent = new Date(order.created_at).toLocaleDateString('en-PH', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      var pill = document.getElementById('r-status-pill');
      pill.textContent = order.status;
      pill.className = 'status-pill status-' + order.status;

      var addrWrap = document.getElementById('r-address-wrap');
      if (order.shipping_address) {
        document.getElementById('r-address').textContent = order.shipping_address;
        addrWrap.style.display = 'inline';
      } else {
        addrWrap.style.display = 'none';
      }

      // step tracker — cancelled orders get no progress fill, everything else
      // fills up to (and including) its current step
      var currentIdx = STEP_ORDER.indexOf(order.status);
      document.querySelectorAll('#r-steps li').forEach(function (li, i) {
        li.classList.toggle('done', order.status !== 'cancelled' && i <= currentIdx);
      });
      if (order.status === 'cancelled') {
        document.getElementById('r-steps').style.opacity = '.5';
      }

      var itemsHtml = (order.items || []).map(function (it) {
        return '<div class="track-item-row"><span>' + esc(it.product_name) + ' <span class="qty">×' + it.quantity + '</span></span><span>' + money(it.subtotal) + '</span></div>';
      }).join('');
      document.getElementById('r-items').innerHTML = itemsHtml || '<p style="color:var(--text-muted,#94A3B8); font-size:.85rem;">No line items on file.</p>';
      document.getElementById('r-total').textContent = money(order.total_amount);

      resultBox.classList.add('show');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.classList.remove('show');
      resultBox.classList.remove('show');

      var orderNum = document.getElementById('t-order').value.trim();
      var email = document.getElementById('t-email').value.trim();
      if (!orderNum || !email) return;

      btn.disabled = true;
      var originalLabel = btn.textContent;
      btn.textContent = 'Checking…';

      if (!window.BT || window.BT.unavailable) {
        errorBox.textContent = 'Order lookup is temporarily unavailable. Please try again shortly or message us on Facebook.';
        errorBox.classList.add('show');
        btn.disabled = false;
        btn.textContent = originalLabel;
        return;
      }

      window.BT.lookupOrderStatus(orderNum, email)
        .then(function (order) {
          if (!order) {
            errorBox.textContent = "We couldn't find an order with that Order ID and email. Double-check both and try again — order IDs look like BT-260115-A9K2.";
            errorBox.classList.add('show');
            return;
          }
          renderResult(order);
        })
        .catch(function (err) {
          console.error(err);
          errorBox.textContent = 'Something went wrong looking up your order. Please try again in a moment.';
          errorBox.classList.add('show');
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = originalLabel;
        });
    });
  });
})();
