/* ==========================================================================
   Balay Tablea — shared public UI kit (FE-X-01, FE-P-01)
   No Supabase dependency: nav, toasts, form helpers, cart indicator,
   announcement bar helpers, focus trap. Exposes window.BTUI.
   ========================================================================== */
(function () {
  'use strict';
  var CART_KEY = 'bt_cart_v1';

  /* ---------- tiny helpers ---------- */
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return '\u20b1' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function safeStore(kind) {
    try { var s = window[kind]; s.setItem('__t', '1'); s.removeItem('__t'); return s; }
    catch (e) { var mem = {}; return { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } }; }
  }
  var local = safeStore('localStorage');
  var session = safeStore('sessionStorage');

  /* ---------- toasts (aria-live) ---------- */
  function toastBox() {
    var c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }
  function toast(message, type) {
    var box = toastBox();
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    if (type === 'error') t.setAttribute('role', 'alert');
    t.textContent = message;
    box.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0'; t.style.transition = 'opacity .3s ease';
      setTimeout(function () { t.remove(); }, 300);
    }, type === 'error' ? 6000 : 4200);
  }

  /* ---------- form helpers ---------- */
  function setFieldError(input, msg) {
    if (!input) return;
    var id = (input.id || input.name || 'f') + '-err';
    var wrap = input.closest('.field, fieldset') || input.parentNode;
    var p = document.getElementById(id);
    if (!p) {
      p = document.createElement('p');
      p.className = 'field-error';
      p.id = id;
      wrap.appendChild(p);
    }
    p.textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    var d = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (d.indexOf(id) < 0) d.push(id);
    input.setAttribute('aria-describedby', d.join(' '));
  }
  function clearFieldErrors(form) {
    $$('.field-error', form).forEach(function (p) { p.remove(); });
    $$('[aria-invalid="true"]', form).forEach(function (i) {
      i.removeAttribute('aria-invalid');
      var d = (i.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && !/-err$/.test(x); });
      if (d.length) i.setAttribute('aria-describedby', d.join(' ')); else i.removeAttribute('aria-describedby');
    });
  }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + esc(label || 'Please wait\u2026');
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label || btn.dataset.label || btn.textContent;
      delete btn.dataset.label;
    }
  }
  function focusFirstError(form) {
    var el = $('[aria-invalid="true"]', form);
    if (el) el.focus();
  }

  /* ---------- focus trap ---------- */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trap(container, onEsc) {
    function handler(e) {
      if (e.key === 'Escape' && onEsc) { e.preventDefault(); onEsc(); return; }
      if (e.key !== 'Tab') return;
      var items = $$(FOCUSABLE, container).filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handler);
    return function release() { document.removeEventListener('keydown', handler); };
  }

  /* ---------- mobile menu ---------- */
  function initNav() {
    var toggle = document.getElementById('menuToggle');
    var nav = document.getElementById('navLinks');
    if (!toggle || !nav) return;
    function setOpen(open, returnFocus) {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-open', open);
      if (!open && returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true);
    });
    // close when focus leaves the header entirely
    document.addEventListener('focusin', function (e) {
      if (nav.classList.contains('open') && !e.target.closest('header')) setOpen(false);
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (m) { if (m.matches) setOpen(false); });
  }

  /* ---------- cart indicator (reads the localStorage cart; see cart.js) ---------- */
  function cartCount() {
    try {
      var list = JSON.parse(local.getItem(CART_KEY) || '[]');
      return list.reduce(function (n, l) { return n + (Number(l.qty) || 0); }, 0);
    } catch (e) { return 0; }
  }
  function paintCartCount() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = n > 99 ? '99+' : n;
      el.hidden = n === 0;
    });
    $$('.cart-link').forEach(function (a) { a.setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items')); });
  }
  window.addEventListener('storage', function (e) { if (e.key === CART_KEY) paintCartCount(); });
  window.addEventListener('bt:cart', paintCartCount);

  /* ---------- reveal shop links: header cart link on shop page opens the cart ---------- */
  function initCartLink() {
    $$('.cart-link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (/shop\.html$/.test(location.pathname) || /\/shop$/.test(location.pathname)) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('bt:open-cart'));
        }
      });
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () { initNav(); paintCartCount(); initCartLink(); });

  window.BTUI = {
    esc: esc, money: money, $: $, $$: $$, local: local, session: session,
    toast: toast, setFieldError: setFieldError, clearFieldErrors: clearFieldErrors,
    setBusy: setBusy, focusFirstError: focusFirstError, trap: trap, ready: ready,
    CART_KEY: CART_KEY, paintCartCount: paintCartCount
  };
})();
