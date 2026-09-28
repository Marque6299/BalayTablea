async function loadSettings() {
  const { data, error } = await api.settings.list();
  if (error) { showToast(error.message, 'danger'); return; }
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  document.getElementById('setStoreOpen').checked = map.store_open === 'true';
  document.getElementById('setContactEmail').value = map.contact_email || '';
  document.getElementById('setContactPhone').value = map.contact_phone || '';
  document.getElementById('setContactAddress').value = map.contact_address || '';
  document.getElementById('setShippingRate').value = map.shipping_flat_rate || '';
}
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  setButtonLoading(btn, true, 'Saving\u2026');
  const rows = [
    { key: 'store_open', value: document.getElementById('setStoreOpen').checked ? 'true' : 'false' },
    { key: 'contact_email', value: document.getElementById('setContactEmail').value },
    { key: 'contact_phone', value: document.getElementById('setContactPhone').value },
    { key: 'contact_address', value: document.getElementById('setContactAddress').value },
    { key: 'shipping_flat_rate', value: document.getElementById('setShippingRate').value },
  ];
  const { error } = await api.settings.save(rows);
  setButtonLoading(btn, false);
  if (error) { showToast(error.message, 'danger'); return; }
  showToast('Settings saved.', 'success');
});

guardAuth(() => loadSettings());
