/* ==========================================================================
   Balay Tablea — site-wide behaviour (all pages)
   • live settings -> [data-setting] elements (FE-P-03)
   • announcement bar (FE-P-01)
   • contact / wholesale form (FE-P-05)
   Mobile-menu, toasts and form helpers live in js/ui.js.
   ========================================================================== */
(function () {
  'use strict';
  var U = window.BTUI, BT = window.BT;
  if (!U) return;
  var $ = U.$, $$ = U.$$;

  /* ---------- live settings ---------- */
  function paintSettings(s) {
    $$('[data-setting]').forEach(function (el) {
      var v = s[el.getAttribute('data-setting')];
      if (v == null || String(v).trim() === '') return; // keep the built-in text as the no-JS / offline fallback
      el.textContent = v;
      var h = el.getAttribute('data-setting-href');
      if (h === 'tel') el.setAttribute('href', 'tel:' + String(v).replace(/[^\d+]/g, ''));
      if (h === 'mailto') el.setAttribute('href', 'mailto:' + v);
    });
    window.BT_SETTINGS = s;
    window.dispatchEvent(new CustomEvent('bt:settings', { detail: s }));
  }
  if (BT && !BT.unavailable) BT.getSettings().then(paintSettings);

  /* ---------- announcement bar ---------- */
  (function () {
    var bar = document.getElementById('announceBar');
    if (!bar || !BT || BT.unavailable) return;
    var KEY = 'bt_announcement_dismissed';
    BT.fetchActiveAnnouncement().then(function (a) {
      if (!a) return;
      if (U.local.getItem(KEY) === a.id) return;
      var type = ['info', 'promo', 'urgent'].indexOf(a.type) >= 0 ? a.type : 'info';
      // stale informational notices quietly disappear after 30 days
      if (type === 'info' && a.created_at && Date.now() - new Date(a.created_at).getTime() > 30 * 864e5) return;
      bar.innerHTML = '<span class="a-type">' + U.esc(type) + '</span><span>' + U.esc(a.title) + (a.body ? ' \u2014 ' + U.esc(a.body) : '') +
        '</span><button type="button" class="a-close" aria-label="Dismiss announcement">&times;</button>';
      bar.className = 'show type-' + type;
      $('.a-close', bar).addEventListener('click', function () {
        bar.classList.remove('show');
        U.local.setItem(KEY, a.id);
      });
    }).catch(function (err) { console.error('announcement fetch failed', err); });
  })();

  /* ---------- contact & wholesale form ---------- */
  var form = document.getElementById('inquiryForm');
  if (!form) return;
  var msgBox = document.getElementById('formMsg');
  var typeSel = document.getElementById('reason');
  var groups = $$('.type-fields', form);

  function syncTypeFields() {
    var t = typeSel.value;
    groups.forEach(function (g) {
      var on = g.getAttribute('data-for') === t;
      g.hidden = !on;
      $$('input,select,textarea', g).forEach(function (i) { i.disabled = !on; });
    });
  }
  typeSel.addEventListener('change', syncTypeFields);
  syncTypeFields();
  // deep link: contact.html#wholesale preselects the topic
  var hashType = (location.hash || '').replace('#', '');
  if (['general', 'wholesale', 'sourcing', 'press'].indexOf(hashType) >= 0) { typeSel.value = hashType; syncTypeFields(); }

  var FIELD_MAP = { name: 'name', email: 'email', phone: 'phone', message: 'message', inquiry_type: 'reason' };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    U.clearFieldErrors(form);
    msgBox.innerHTML = '';
    var fd = new FormData(form);
    var name = String(fd.get('name') || '').trim();
    var email = String(fd.get('email') || '').trim();
    var phone = BT && BT.normalizePhone ? BT.normalizePhone(fd.get('phone')) : String(fd.get('phone') || '').trim();
    var message = String(fd.get('message') || '').trim();
    var bad = false;
    if (name.length < 2) { U.setFieldError($('#name'), 'Enter your name.'); bad = true; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { U.setFieldError($('#email'), 'Enter a valid email, like you@example.com.'); bad = true; }
    if (!phone) { U.setFieldError($('#phone'), 'Enter a mobile number, like 0917 123 4567.'); bad = true; }
    if (!message) { U.setFieldError($('#message'), 'Tell us how we can help.'); bad = true; }
    if (bad) { U.focusFirstError(form); return; }
    if (!BT || BT.unavailable) {
      msgBox.innerHTML = '<div class="form-error" role="alert"><strong>Can\u2019t send right now.</strong>Please message us on Facebook instead \u2014 link above.</div>';
      return;
    }

    var type = fd.get('inquiry_type') || 'general';
    var metadata = {};
    $$('.type-fields:not([hidden]) [name^="meta_"]', form).forEach(function (i) {
      var v = String(i.value || '').trim();
      if (v) metadata[i.name.replace('meta_', '')] = v;
    });
    var payload = { inquiry_type: type, name: name, email: email, phone: phone, company: String(fd.get('company') || '').trim() || null, message: message, metadata: metadata };
    var btn = $('button[type="submit"]', form);
    U.setBusy(btn, true, 'Sending\u2026');

    BT.submitInquiry(payload, fd.get('p_hp')).then(function (res) {
      var ref = res && res.reference;
      msgBox.innerHTML = '<div class="form-success" role="status" tabindex="-1"><strong>Message sent.</strong>Salamat \u2014 we usually reply within a day.' +
        (ref ? ' Your reference is <b>' + U.esc(ref) + '</b>.' : '') +
        ' If it\u2019s urgent, <a href="https://www.facebook.com/products.balaytablea/" rel="noopener">message us on Facebook</a>.</div>';
      var box = $('.form-success', msgBox); if (box) box.focus();
      form.reset(); syncTypeFields();
      U.toast('Your message was sent.', 'success');
    }).catch(function (err) {
      var m = BT.mapError(err);
      if (m.code === 'INVALID_INPUT' && m.detail && FIELD_MAP[m.detail.field]) {
        U.setFieldError(document.getElementById(FIELD_MAP[m.detail.field]), 'Please check this field.');
        U.focusFirstError(form);
      } else if (m.code === 'RATE_LIMITED') {
        msgBox.innerHTML = '<div class="form-error" role="alert"><strong>Too many attempts.</strong>Please try again in about an hour, or message us on Facebook.</div>';
      } else {
        msgBox.innerHTML = '<div class="form-error" role="alert"><strong>Couldn\u2019t send that.</strong>Something went wrong, please try again \u2014 or message us on Facebook.</div>';
      }
    }).finally(function () { U.setBusy(btn, false, 'Send Message'); });
  });
})();
