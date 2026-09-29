/* ==========================================================================
   Balay Tablea — Visit page (FE-P-06)
   Booking form driven by public settings + live availability; .ics download.
   ========================================================================== */
(function () {
  'use strict';
  var U = window.BTUI, BT = window.BT;
  if (!U || !BT || BT.unavailable) return;
  var $ = U.$, esc = U.esc;

  BT.mountStorefronts('storefrontGrid');

  var form = $('#bookingForm'), msg = $('#bookingMsg');
  if (!form) return;

  var cfg = { slots: ['09:00', '10:30', '14:00'], maxPax: 30, lead: 1 };
  var avail = {}, loadedBlocks = {}, hasAvail = false;
  var dateEl = $('#v-date'), paxEl = $('#v-pax'), slotEl = $('#v-slot'), dateMsg = $('#dateMsg'), legend = $('#unavailList');

  /* ---------- date helpers (Asia/Manila calendar day) ---------- */
  function manilaToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); }
  function addDays(ymd, n) { var d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function nice(ymd) { return new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }); }
  function slotLabel(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s); if (!m) return s; var h = +m[1]; return ((h + 11) % 12 + 1) + ':' + m[2] + (h < 12 ? ' AM' : ' PM'); }
  function minDate() { return addDays(manilaToday(), cfg.lead); }
  function maxDate() { return addDays(manilaToday(), 180); }

  function applyConfig(s) {
    s = s || {};
    try { var sl = JSON.parse(s.booking_time_slots || 'null'); if (Array.isArray(sl) && sl.length) cfg.slots = sl.map(String); } catch (e) { /* keep defaults */ }
    if (Number(s.booking_max_pax) > 0) cfg.maxPax = Number(s.booking_max_pax);
    if (s.booking_lead_days !== undefined && s.booking_lead_days !== '' && Number(s.booking_lead_days) >= 0) cfg.lead = Number(s.booking_lead_days);
    slotEl.innerHTML = '<option value="">Any time \u2014 we\u2019ll confirm</option>' + cfg.slots.map(function (t) { return '<option value="' + esc(t) + '">' + esc(slotLabel(t)) + '</option>'; }).join('');
    dateEl.min = minDate(); dateEl.max = maxDate();
    paxEl.max = cfg.maxPax;
    $('#paxHint').textContent = 'Up to ' + cfg.maxPax + ' guests per booking.';
  }

  /* ---------- availability ---------- */
  function loadBlock(start) {
    if (loadedBlocks[start]) return loadedBlocks[start];
    loadedBlocks[start] = BT.getBookingAvailability(start, addDays(start, 91)).then(function (rows) {
      if (!rows) return false;
      hasAvail = true;
      rows.forEach(function (r) { avail[r.day] = r; });
      return true;
    }).catch(function (err) { delete loadedBlocks[start]; console.error(err); return false; });
    return loadedBlocks[start];
  }
  function blockStartFor(ymd) {
    var base = minDate(), diff = Math.floor((new Date(ymd + 'T00:00:00Z') - new Date(base + 'T00:00:00Z')) / 864e5);
    return addDays(base, Math.max(0, Math.floor(diff / 92) * 92));
  }
  function paintLegend() {
    var bad = Object.keys(avail).sort().filter(function (d) { return d >= minDate() && (avail[d].is_closed || avail[d].remaining <= 0); }).slice(0, 8);
    legend.innerHTML = bad.map(function (d) { return '<li>' + esc(nice(d)) + (avail[d].is_closed ? ' \u2014 closed' : ' \u2014 full') + '</li>'; }).join('');
    $('#unavailWrap').hidden = !bad.length;
  }
  function dayState(ymd) {
    if (!hasAvail) return { ok: true };
    var r = avail[ymd];
    if (!r) return { ok: true };
    if (r.is_closed) return { ok: false, reason: 'closed' };
    if (r.remaining <= 0) return { ok: false, reason: 'full' };
    return { ok: true, remaining: r.remaining };
  }
  function checkDate() {
    var v = dateEl.value; dateMsg.className = 'avail-msg'; dateMsg.textContent = '';
    if (!v) return Promise.resolve(false);
    if (v < minDate()) { dateMsg.className = 'avail-msg bad'; dateMsg.textContent = cfg.lead > 0 ? 'Please book at least ' + cfg.lead + (cfg.lead === 1 ? ' day' : ' days') + ' ahead.' : 'That date has passed.'; return Promise.resolve(false); }
    if (v > maxDate()) { dateMsg.className = 'avail-msg bad'; dateMsg.textContent = 'We\u2019re taking bookings up to 6 months ahead.'; return Promise.resolve(false); }
    return loadBlock(blockStartFor(v)).then(function () {
      var st = dayState(v);
      if (!st.ok) { dateMsg.className = 'avail-msg bad'; dateMsg.textContent = st.reason === 'closed' ? 'We\u2019re closed to visitors that day \u2014 please pick another date.' : 'That day is fully booked \u2014 please pick another date.'; paxEl.max = cfg.maxPax; return false; }
      if (st.remaining != null) {
        dateMsg.className = 'avail-msg ' + (st.remaining <= 5 ? 'warn' : 'ok');
        dateMsg.textContent = st.remaining + (st.remaining === 1 ? ' spot' : ' spots') + ' left that day.';
        paxEl.max = Math.min(cfg.maxPax, st.remaining);
      }
      paintLegend();
      return true;
    });
  }
  dateEl.addEventListener('change', checkDate);

  /* ---------- .ics ---------- */
  function icsEscape(t) { return String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
  function stamp(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function buildIcs(p, ref) {
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Balay Tablea//Visit//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + (ref || Date.now()) + '@balaytablea.netlify.app', 'DTSTAMP:' + stamp(new Date())];
    var slot = /^(\d{1,2}):(\d{2})/.exec(p.time_slot || ''), y = +p.visit_date.slice(0, 4), m = +p.visit_date.slice(5, 7), d = +p.visit_date.slice(8, 10);
    if (slot) {
      // Asia/Manila is UTC+8 with no DST, so a fixed offset gives the right instant in every calendar app
      var start = new Date(Date.UTC(y, m - 1, d, +slot[1] - 8, +slot[2]));
      L.push('DTSTART:' + stamp(start), 'DTEND:' + stamp(new Date(start.getTime() + 2 * 3600e3)));
    } else {
      L.push('DTSTART;VALUE=DATE:' + p.visit_date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(p.visit_date, 1).replace(/-/g, ''));
    }
    L.push('SUMMARY:' + icsEscape('Visit to Balay Tablea'), 'LOCATION:' + icsEscape('Rizal Street, Cabatuan, Iloilo, Philippines'),
      'DESCRIPTION:' + icsEscape('Booking ' + (ref || '') + ' for ' + p.pax + ' guest(s). Pending until confirmed by the Balay Tablea team.'), 'END:VEVENT', 'END:VCALENDAR');
    return L.join('\r\n');
  }
  function downloadIcs(p, ref) {
    var blob = new Blob([buildIcs(p, ref)], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'balay-tablea-visit.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- submit ---------- */
  var VT = { workshop: 'Workshop', farm_visit: 'Farm visit', both: 'Workshop + farm visit' };
  var FIELD = { visitor_name: 'v-name', visitor_email: 'v-email', visitor_phone: 'v-phone', visit_date: 'v-date', pax: 'v-pax', time_slot: 'v-slot' };
  var REASON = { too_soon: 'That date is too soon \u2014 please pick a later one.', too_far: 'That date is too far ahead.', closed: 'We\u2019re closed to visitors that day.', full: 'That day just filled up.' };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    U.clearFieldErrors(form); msg.innerHTML = '';
    var fd = new FormData(form), bad = false;
    var name = String(fd.get('visitor_name') || '').trim(), email = String(fd.get('visitor_email') || '').trim();
    var phone = BT.normalizePhone(fd.get('visitor_phone')), pax = parseInt(fd.get('pax'), 10), date = String(fd.get('visit_date') || '');
    if (name.length < 2) { U.setFieldError($('#v-name'), 'Enter your name.'); bad = true; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { U.setFieldError($('#v-email'), 'Enter a valid email, like you@example.com.'); bad = true; }
    if (!phone) { U.setFieldError($('#v-phone'), 'Enter a mobile number, like 0917 123 4567.'); bad = true; }
    if (!date) { U.setFieldError(dateEl, 'Choose a visit date.'); bad = true; }
    if (!(pax >= 1)) { U.setFieldError(paxEl, 'Enter how many guests (at least 1).'); bad = true; }
    if (bad) { U.focusFirstError(form); return; }
    checkDate().then(function (ok) {
      if (!ok) { U.setFieldError(dateEl, dateMsg.textContent || 'Pick another date.'); dateEl.focus(); return; }
      if (pax > Number(paxEl.max)) { U.setFieldError(paxEl, 'We can take up to ' + paxEl.max + ' guests that day.'); paxEl.focus(); return; }
      var payload = { visitor_name: name, visitor_email: email, visitor_phone: phone, visit_date: date, time_slot: fd.get('time_slot') || null, pax: pax, visit_type: fd.get('visit_type') || 'workshop', notes: String(fd.get('notes') || '').trim() || null };
      var btn = $('button[type="submit"]', form); U.setBusy(btn, true, 'Sending\u2026');
      return BT.submitVisitBooking(payload, fd.get('p_hp')).then(function (res) {
        var ref = res && res.booking_ref;
        msg.innerHTML = '<div class="form-success" role="status" tabindex="-1"><strong>Booking request sent</strong>' +
          '<p>Your visit is <b>pending until our team confirms it</b> \u2014 usually within a day, by email or phone.</p>' +
          '<dl class="confirm-summary">' + (ref ? '<dt>Reference</dt><dd><b>' + esc(ref) + '</b></dd>' : '') +
          '<dt>Date</dt><dd>' + esc(nice(date)) + (payload.time_slot ? ', ' + esc(slotLabel(payload.time_slot)) : '') + '</dd>' +
          '<dt>Guests</dt><dd>' + pax + '</dd><dt>Visit</dt><dd>' + esc(VT[payload.visit_type] || '') + '</dd></dl>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="icsBtn">Add to calendar</button></div>';
        $('#icsBtn').addEventListener('click', function () { downloadIcs(payload, ref); });
        $('.form-success', msg).focus();
        form.reset(); dateMsg.textContent = ''; U.toast('Visit request sent.', 'success');
        loadedBlocks = {}; avail = {}; loadBlock(blockStartFor(minDate())).then(paintLegend);
      }).catch(function (err) {
        var m = BT.mapError(err), d = m.detail || {};
        if (m.code === 'DATE_UNAVAILABLE') {
          loadedBlocks = {}; avail = {};
          checkDate();
          U.setFieldError(dateEl, REASON[d.reason] || 'That date isn\u2019t available.'); dateEl.focus();
        } else if (m.code === 'INVALID_INPUT' && FIELD[d.field]) { U.setFieldError(document.getElementById(FIELD[d.field]), 'Please check this field.'); U.focusFirstError(form); }
        else if (m.code === 'RATE_LIMITED') msg.innerHTML = '<div class="form-error" role="alert"><strong>Too many attempts.</strong>Please try again in about an hour, or message us on Facebook.</div>';
        else msg.innerHTML = '<div class="form-error" role="alert"><strong>Couldn\u2019t send that.</strong>Something went wrong, please try again \u2014 or message us on Facebook.</div>';
      }).finally(function () { U.setBusy(btn, false, 'Request booking'); });
    });
  });

  applyConfig({});
  BT.getSettings().then(function (s) { applyConfig(s); return loadBlock(blockStartFor(minDate())); }).then(paintLegend);
})();
