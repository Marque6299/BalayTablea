const state = { bookings: [], bookingsById: {} };

async function loadBookings() {
  document.getElementById('bookingsTableBody').innerHTML = skeletonRows(6, 3);
  const { data, error } = await api.bookings.list();
  if (error) { showToast(error.message, 'danger'); return; }
  state.bookings = data || [];
  state.bookingsById = Object.fromEntries(state.bookings.map(b => [b.id, b]));
  applyFilters();
}

/* ---- per-column filtering (client-side) ---- */
function getFilteredBookings() {
  const search = document.getElementById('bfSearch').value.trim().toLowerCase();
  const type = document.getElementById('bfType').value;
  const status = document.getElementById('bfStatus').value;
  const from = document.getElementById('bfFrom').value;
  const to = document.getElementById('bfTo').value;
  return state.bookings.filter(b => {
    if (search && !b.visitor_name.toLowerCase().includes(search)) return false;
    if (type && b.visit_type !== type) return false;
    if (status && b.status !== status) return false;
    if (from && b.visit_date < from) return false;
    if (to && b.visit_date > to) return false;
    return true;
  });
}
function applyFilters() { renderBookingsTable(getFilteredBookings()); }
['bfSearch', 'bfType', 'bfStatus', 'bfFrom', 'bfTo'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', debounce(applyFilters, 200));
});
document.getElementById('bfReset').addEventListener('click', () => {
  ['bfSearch', 'bfType', 'bfStatus', 'bfFrom', 'bfTo'].forEach(id => document.getElementById(id).value = '');
  applyFilters();
});

function renderBookingsTable(rows) {
  const tbody = document.getElementById('bookingsTableBody');
  document.getElementById('bookingResultCount').textContent = `${rows.length} of ${state.bookings.length} bookings`;
  if (!rows.length) { tbody.innerHTML = emptyRow(6, 'No visit bookings match this view.'); return; }
  tbody.innerHTML = rows.map(b => {
    const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.pending;
    return `<tr>
      <td><strong>${escapeHtml(b.visitor_name)}</strong><br><span class="cell-sub">${escapeHtml(b.visitor_email || b.visitor_phone || '')}</span></td>
      <td>${formatDate(b.visit_date)}${b.time_slot ? '<br><span class="cell-sub">' + escapeHtml(b.time_slot) + '</span>' : ''}</td>
      <td>${b.pax}</td>
      <td><span class="badge badge-outline">${escapeHtml(BOOKING_TYPE_LABELS[b.visit_type] || b.visit_type)}</span></td>
      <td><span class="badge ${meta.badge}">${meta.label}</span></td>
      <td>
        <div class="row-actions">
          ${b.status === 'pending' ? `<button class="btn-link" onclick="approveBooking('${b.id}')">Approve</button><button class="btn-link btn-link-danger" onclick="declineBooking('${b.id}')">Decline</button>` : ''}
          ${b.status === 'approved' ? `<button class="btn-link" onclick="completeBooking('${b.id}')">Mark Completed</button>` : ''}
          <button class="btn-link" onclick="openBookingNotes('${b.id}')">Notes</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function approveBooking(id) {
  const { error } = await api.bookings.updateStatus(id, 'approved');
  if (error) { showToast(error.message, 'danger'); return; }
  showToast('Booking approved.', 'success');
  loadBookings();
}
function declineBooking(id) {
  confirmAction('Decline this visit booking?', async () => {
    const { error } = await api.bookings.updateStatus(id, 'declined');
    if (error) { showToast(error.message, 'danger'); return; }
    showToast('Booking declined.', 'success');
    loadBookings();
  }, 'Decline');
}
async function completeBooking(id) {
  const { error } = await api.bookings.updateStatus(id, 'completed');
  if (error) { showToast(error.message, 'danger'); return; }
  showToast('Booking marked completed.', 'success');
  loadBookings();
}
function openBookingNotes(id) {
  const b = state.bookingsById[id];
  openModal(`Notes \u2014 ${b.visitor_name}`, `
    ${b.notes ? `<p><strong>Visitor note:</strong> ${escapeHtml(b.notes)}</p>` : '<p class="cell-sub">No visitor note.</p>'}
    <div class="field" style="margin-top:1rem"><label for="bookingAdminNotes">Internal Notes</label><textarea id="bookingAdminNotes">${escapeHtml(b.admin_notes || '')}</textarea></div>
    <div class="modal-actions"><button class="btn btn-primary" id="saveBookingNotesBtn">Save Notes</button></div>
  `);
  document.getElementById('saveBookingNotesBtn').addEventListener('click', async (e) => {
    setButtonLoading(e.target, true, 'Saving\u2026');
    const { error } = await api.bookings.updateNotes(id, document.getElementById('bookingAdminNotes').value);
    setButtonLoading(e.target, false);
    if (error) { showToast(error.message, 'danger'); return; }
    showToast('Notes saved.', 'success');
    closeModal();
    loadBookings();
  });
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setButtonLoading(btn, true, 'Saving\u2026');
  const payload = {
    visitor_name: document.getElementById('bkName').value,
    visitor_email: document.getElementById('bkEmail').value || null,
    visitor_phone: document.getElementById('bkPhone').value || null,
    visit_date: document.getElementById('bkDate').value,
    time_slot: document.getElementById('bkTime').value || null,
    pax: parseInt(document.getElementById('bkPax').value, 10),
    visit_type: document.getElementById('bkType').value,
    notes: document.getElementById('bkNotes').value || null,
  };
  const { error } = await api.bookings.create(payload);
  setButtonLoading(btn, false);
  if (error) { showToast(error.message, 'danger'); return; }
  e.target.reset();
  showToast('Visit booking added.', 'success');
  loadBookings();
});

guardAuth(() => loadBookings());
