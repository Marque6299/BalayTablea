/* Balay Tablea — Visit page: guest booking form + dynamic storefront list */
(function () {
  if (!window.BT || window.BT.unavailable) return;
  var BT = window.BT;

  BT.mountStorefronts('storefrontGrid');

  var form = document.getElementById('bookingForm');
  var msg = document.getElementById('bookingMsg');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = {
      visitor_name: fd.get('visitor_name'),
      visitor_email: fd.get('visitor_email'),
      visitor_phone: fd.get('visitor_phone'),
      visit_date: fd.get('visit_date'),
      time_slot: fd.get('time_slot') || null,
      pax: Number(fd.get('pax') || 1),
      visit_type: fd.get('visit_type') || 'workshop',
      notes: fd.get('notes') || null
    };
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Booking\u2026';
    BT.submitVisitBooking(payload).then(function () {
      msg.innerHTML = '<div class="form-success"><strong>Booking request sent.</strong>We\'ll confirm your visit by email or phone \u2014 usually within a day.</div>';
      form.reset();
      BT.showToast('Visit request sent.', 'success');
    }).catch(function (err) {
      console.error(err);
      msg.innerHTML = '<div class="form-error"><strong>Couldn\'t send that.</strong>Please message us on Facebook instead.</div>';
      BT.showToast('Booking failed to send.', 'error');
    }).finally(function () {
      btn.disabled = false; btn.textContent = 'Request Booking';
    });
  });
})();
