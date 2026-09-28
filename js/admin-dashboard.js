async function loadDashboard() {
  document.getElementById('statGrid').innerHTML = Array.from({ length: 4 }).map(() =>
    `<div class="stat-card glass"><div class="skeleton-bar" style="width:60%"></div><div class="skeleton-bar" style="width:40%;height:28px"></div></div>`
  ).join('');

  const [prodRes, pendingOrdersRes, pendingBookingsRes, recentOrdersRes, upcomingRes] = await Promise.all([
    db.from('products').select('id,name,stock_quantity,low_stock_threshold').eq('status', 'active'),
    api.orders.countByStatus('pending'),
    api.bookings.countByStatus('pending'),
    api.orders.recent(5),
    api.bookings.upcoming(5),
  ]);

  const lowStockItems = lowStockOf(prodRes.data || []);

  document.getElementById('statGrid').innerHTML = `
    <div class="stat-card glass"><span class="stat-label">Active Products</span><span class="stat-value">${(prodRes.data || []).length}</span></div>
    <div class="stat-card glass ${lowStockItems.length ? 'stat-alert' : ''}"><span class="stat-label">Low Stock Items</span><span class="stat-value">${lowStockItems.length}</span></div>
    <div class="stat-card glass"><span class="stat-label">Pending Orders</span><span class="stat-value">${pendingOrdersRes.count || 0}</span></div>
    <div class="stat-card glass"><span class="stat-label">Pending Bookings</span><span class="stat-value">${pendingBookingsRes.count || 0}</span></div>`;

  const recent = recentOrdersRes.data || [];
  document.getElementById('recentOrdersList').innerHTML = recent.length
    ? recent.slice(0, 5).map(o => {
        const meta = ORDER_STATUS_META[o.status] || ORDER_STATUS_META.pending;
        return `<div class="mini-row"><span>#${escapeHtml(o.order_number)} \u2014 ${escapeHtml(o.customer_name)}</span><span class="badge ${meta.badge}">${meta.label}</span></div>`;
      }).join('')
    : `<p class="empty-inline">No orders yet.</p>`;

  const upcoming = upcomingRes.data || [];
  document.getElementById('upcomingVisitsList').innerHTML = upcoming.length
    ? upcoming.slice(0, 5).map(b => `<div class="mini-row"><span>${escapeHtml(b.visitor_name)} \u2014 ${formatDate(b.visit_date)}</span><span class="cell-sub">${b.pax} pax</span></div>`).join('')
    : `<p class="empty-inline">No upcoming visits scheduled.</p>`;

  document.getElementById('dashLowStockList').innerHTML = lowStockItems.length
    ? lowStockItems.slice(0, 5).map(p => `<div class="mini-row"><span>${escapeHtml(p.name)}</span><span class="text-danger">${p.stock_quantity} left</span></div>`).join('')
    : `<p class="empty-inline">All active products are above their stock threshold.</p>`;
}

guardAuth(() => loadDashboard());
