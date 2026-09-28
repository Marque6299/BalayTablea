/* If already signed in, skip straight to the dashboard. */
db.auth.getSession().then(({ data: { session } }) => {
  if (session) window.location.href = 'admin.html';
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.hidden = true;
  setButtonLoading(btn, true, 'Signing in\u2026');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const { error } = await api.auth.signIn(email, password);
  setButtonLoading(btn, false);
  if (error) {
    errEl.textContent = error.message;
    errEl.hidden = false;
    return;
  }
  window.location.href = 'admin.html';
});
