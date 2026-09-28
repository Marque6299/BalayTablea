// Mobile nav toggle
var menuToggle = document.getElementById('menuToggle');
var navLinks = document.getElementById('navLinks');
if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', function () {
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('open');
    });
  });
}

// Site-wide announcement bar, driven by public.announcements (Supabase)
(function () {
  var bar = document.getElementById('announceBar');
  if (!bar || !window.BT || window.BT.unavailable) return;
  var DISMISS_KEY = 'bt_announcement_dismissed';
  window.BT.fetchActiveAnnouncement().then(function (a) {
    if (!a) return;
    if (sessionStorage.getItem(DISMISS_KEY) === a.id) return;
    bar.innerHTML =
      '<span class="a-type">' + window.BT.escapeHtml(a.type || 'info') + '</span>' +
      '<span>' + window.BT.escapeHtml(a.title) + (a.body ? ' \u2014 ' + window.BT.escapeHtml(a.body) : '') + '</span>' +
      '<button class="a-close" aria-label="Dismiss">&times;</button>';
    bar.className = 'show type-' + (a.type || 'info');
    bar.querySelector('.a-close').addEventListener('click', function () {
      bar.classList.remove('show');
      sessionStorage.setItem(DISMISS_KEY, a.id);
    });
  }).catch(function (err) { console.error('announcement fetch failed', err); });
})();

// Generic inquiry form -> public.inquiries (name, email, phone only; no login)
var inquiryForm = document.getElementById('inquiryForm');
if (inquiryForm && window.BT && !window.BT.unavailable) {
  var formMsg = document.getElementById('formMsg');
  inquiryForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(inquiryForm);
    var payload = {
      inquiry_type: fd.get('inquiry_type') || 'general',
      name: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone') || null,
      company: fd.get('company') || null,
      message: fd.get('message')
    };
    var btn = inquiryForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending\u2026'; }
    window.BT.submitInquiry(payload).then(function () {
      formMsg.innerHTML = '<div class="form-success"><strong>Message sent.</strong>Salamat &mdash; we usually reply within a day. Message us on Facebook if it\'s urgent.</div>';
      inquiryForm.reset();
      window.BT.showToast('Your message was sent.', 'success');
    }).catch(function (err) {
      console.error(err);
      formMsg.innerHTML = '<div class="form-error"><strong>Couldn\'t send that.</strong>Please message us on Facebook instead &mdash; link above.</div>';
      window.BT.showToast('Something went wrong sending your message.', 'error');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
    });
  });
}
