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

// Contact / inquiry form — works with Netlify Forms when deployed there,
// falls back gracefully if fetch is unavailable.
var form = document.getElementById('inquiryForm');
if (form) {
  var formMsg = document.getElementById('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data).toString()
    })
      .then(function () {
        formMsg.innerHTML = '<div class="form-success"><strong>Message sent.</strong>Salamat &mdash; we usually reply within a day. Message us on Facebook if it\'s urgent.</div>';
        form.reset();
      })
      .catch(function () {
        formMsg.innerHTML = '<div class="form-success" style="border-color:var(--clay)"><strong>Couldn\'t send that.</strong>Please message us on Facebook instead &mdash; link above.</div>';
      });
  });
}
