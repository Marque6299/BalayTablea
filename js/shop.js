/* Balay Tablea — Shop page: dynamic product grid + guest cart + checkout
   Orders and order_items are written straight to Supabase. No account/login;
   checkout only collects the buyer's name, email and phone (+ delivery
   address, which is required to actually ship the order). */
(function () {
  if (!window.BT || window.BT.unavailable) return;
  var BT = window.BT;

  var grid = document.getElementById('shopGrid');
  var cartLines = document.getElementById('cartLines');
  var cartTotal = document.getElementById('cartTotal');
  var cartEmpty = document.getElementById('cartEmpty');
  var checkoutBtn = document.getElementById('checkoutBtn');
  var checkoutForm = document.getElementById('checkoutForm');
  var orderMsg = document.getElementById('orderMsg');
  if (!grid) return;

  var products = [];
  var cart = {}; // product id -> { product, qty }

  function stockLabel(p) {
    if (p.stock_quantity <= 0) return '<span class="p-stock out">Out of stock</span>';
    if (p.stock_quantity <= p.low_stock_threshold) return '<span class="p-stock low">Only ' + p.stock_quantity + ' left</span>';
    return '<span class="p-stock ok">In stock</span>';
  }

  function renderGrid() {
    if (!products.length) {
      grid.innerHTML = '<div class="empty-state">No products available right now — please check back soon.</div>';
      return;
    }
    grid.innerHTML = products.map(function (p) {
      var img = p.image_url || '';
      return (
        '<div class="product-card" data-id="' + p.id + '">' +
          '<div class="thumb">' + (img ? '<img src="' + BT.escapeHtml(img) + '" alt="' + BT.escapeHtml(p.name) + '" loading="lazy">' : '') + '</div>' +
          '<div class="p-body">' +
            '<span class="p-cat">' + BT.escapeHtml(p.category || '') + '</span>' +
            '<h3>' + BT.escapeHtml(p.name) + '</h3>' +
            '<div class="p-price">' + BT.money(p.unit_price) + '</div>' +
            stockLabel(p) +
            '<div class="qty-row">' +
              '<div class="qty-stepper">' +
                '<button type="button" class="qty-dec" aria-label="Decrease">\u2212</button>' +
                '<span class="qty-val">' + ((cart[p.id] && cart[p.id].qty) || 0) + '</span>' +
                '<button type="button" class="qty-inc" aria-label="Increase">+</button>' +
              '</div>' +
              '<button type="button" class="btn btn-primary add-to-cart"' + (p.stock_quantity <= 0 ? ' disabled' : '') + '>Add</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderCart() {
    var ids = Object.keys(cart).filter(function (id) { return cart[id].qty > 0; });
    if (!ids.length) {
      cartLines.innerHTML = '';
      cartEmpty.style.display = 'block';
      checkoutBtn.disabled = true;
      cartTotal.querySelector('b').textContent = BT.money(0);
      return;
    }
    cartEmpty.style.display = 'none';
    checkoutBtn.disabled = false;
    var total = 0;
    cartLines.innerHTML = ids.map(function (id) {
      var line = cart[id];
      var subtotal = line.qty * Number(line.product.unit_price);
      total += subtotal;
      return (
        '<li class="cart-line" data-id="' + id + '">' +
          '<span class="cl-name">' + BT.escapeHtml(line.product.name) + ' \u00d7' + line.qty + '</span>' +
          '<span>' + BT.money(subtotal) + '</span>' +
          '<button type="button" class="cl-remove" aria-label="Remove">&times;</button>' +
        '</li>'
      );
    }).join('');
    cartTotal.querySelector('b').textContent = BT.money(total);
  }

  function setQty(id, qty) {
    var product = products.find(function (p) { return p.id === id; });
    if (!product) return;
    qty = Math.max(0, Math.min(qty, product.stock_quantity));
    if (qty <= 0) { delete cart[id]; }
    else { cart[id] = { product: product, qty: qty }; }
    var card = grid.querySelector('.product-card[data-id="' + id + '"] .qty-val');
    if (card) card.textContent = qty;
    renderCart();
  }

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.product-card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var current = (cart[id] && cart[id].qty) || 0;
    if (e.target.classList.contains('qty-inc')) setQty(id, current + 1);
    else if (e.target.classList.contains('qty-dec')) setQty(id, current - 1);
    else if (e.target.classList.contains('add-to-cart')) {
      setQty(id, current > 0 ? current : 1);
      BT.showToast('Added to cart.', 'success');
    }
  });

  cartLines && cartLines.addEventListener('click', function (e) {
    if (!e.target.classList.contains('cl-remove')) return;
    var li = e.target.closest('.cart-line');
    setQty(li.getAttribute('data-id'), 0);
  });

  checkoutBtn && checkoutBtn.addEventListener('click', function () {
    checkoutForm.classList.add('open');
    checkoutBtn.style.display = 'none';
    checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  checkoutForm && checkoutForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var ids = Object.keys(cart).filter(function (id) { return cart[id].qty > 0; });
    if (!ids.length) return;
    var fd = new FormData(checkoutForm);
    var order = {
      customer_name: fd.get('name'),
      customer_email: fd.get('email'),
      customer_phone: fd.get('phone'),
      shipping_address: fd.get('address') || null
    };
    var items = ids.map(function (id) {
      var line = cart[id];
      return {
        product_name: line.product.name,
        quantity: line.qty,
        unit_price: line.product.unit_price,
        subtotal: (line.qty * Number(line.product.unit_price)).toFixed(2)
      };
    });
    var btn = checkoutForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Placing order\u2026';
    BT.submitOrder(order, items).then(function (row) {
      orderMsg.innerHTML = '<div class="form-success"><strong>Order placed \u2014 ' + row.order_number + '</strong>We\'ll text or email you to confirm payment and delivery. Salamat!</div>';
      cart = {};
      renderGrid();
      renderCart();
      checkoutForm.reset();
      checkoutForm.classList.remove('open');
      checkoutBtn.style.display = '';
      BT.showToast('Order placed \u2014 ' + row.order_number, 'success');
    }).catch(function (err) {
      console.error(err);
      orderMsg.innerHTML = '<div class="form-error"><strong>Couldn\'t place that order.</strong>Please try again, or message us on Facebook.</div>';
      BT.showToast('Order failed to send.', 'error');
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Place Order';
    });
  });

  grid.innerHTML = '<div class="skel" style="grid-column:1/-1; height:220px"></div>';
  BT.fetchActiveProducts().then(function (data) {
    products = data;
    renderGrid();
  });
})();
