/* Balay Tablea — home page: featured products strip + storefront teaser (FE-P-02) */
(function () {
  'use strict';
  var U = window.BTUI, BT = window.BT;
  if (!U || !BT || BT.unavailable) return;
  BT.mountStorefronts('storefrontGridHome');

  var section = document.getElementById('featured'), grid = document.getElementById('featuredGrid');
  if (!section || !grid) return;
  BT.fetchActiveProducts().then(function (rows) {
    var list = rows.filter(function (p) { return p.is_featured && Number(p.stock_quantity) > 0; }).slice(0, 4);
    if (!list.length) return;                       // hide gracefully when nothing is featured
    grid.innerHTML = list.map(function (p) {
      var img = /^https:\/\//i.test(p.image_url || '') ? '<img src="' + U.esc(p.image_url) + '" alt="" width="600" height="600" loading="lazy" decoding="async">' : '';
      return '<a class="featured-card" href="shop.html#product-' + encodeURIComponent(p.slug || p.id) + '"><div class="thumb">' + img + '</div>' +
        '<div class="body"><h3>' + U.esc(p.name) + '</h3><div class="p-price">' + U.money(p.unit_price) + '</div></div></a>';
    }).join('');
    section.hidden = false;
  }).catch(function (e) { console.error(e); });   // API down: strip stays hidden, rest of page unaffected
})();
