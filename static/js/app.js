// Shared page behavior. No inline scripts anywhere: the Content Security Policy forbids them.
(function () {
  'use strict';

  // Mobile navigation
  var toggle = document.querySelector('[data-nav-toggle]');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Dismissible alerts
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dismiss]');
    if (btn) btn.closest('[data-dismissible]').remove();
  });

  // Confirmation before destructive actions
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var message = form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) {
      e.preventDefault();
      return;
    }
    // Prevent double submits (e.g. paying twice) and show progress.
    if (form.hasAttribute('data-upload')) return;
    if (form.dataset.submitting) { e.preventDefault(); return; }
    form.dataset.submitting = '1';
    var button = e.submitter || form.querySelector('[type=submit]');
    if (button && button.dataset.busyText) {
      window.setTimeout(function () {
        button.disabled = true;
        button.textContent = button.dataset.busyText;
      }, 0);
    }
  });

  // Show/hide password ("eye") button on every password field
  var EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  var EYE_OFF = '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"/><path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>';
  function eyeIcon(paths) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  document.querySelectorAll('input[type=password]').forEach(function (input) {
    var wrap = document.createElement('div');
    wrap.className = 'password-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = eyeIcon(EYE);
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = eyeIcon(show ? EYE_OFF : EYE);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });
    wrap.appendChild(btn);
    // Never submit with the password visible (browser autosave/autofill stay correct).
    if (input.form) input.form.addEventListener('submit', function () { input.type = 'password'; });
  });

  // Auto-submit filter selects
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // Live countdowns: <span data-countdown="epoch-ms">
  function formatRemaining(ms) {
    if (ms <= 0) return 'expired';
    var minutes = Math.floor(ms / 60000);
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    var mins = minutes % 60;
    if (days) return days + ' day' + (days > 1 ? 's' : '') + ' ' + hours + ' h';
    if (hours) return hours + ' h ' + mins + ' min';
    return Math.max(mins, 1) + ' min';
  }
  var countdowns = document.querySelectorAll('[data-countdown]');
  function tick() {
    var now = Date.now();
    countdowns.forEach(function (el) {
      var end = Number(el.getAttribute('data-countdown'));
      if (!end) return;
      el.textContent = formatRemaining(end - now);
      if (end <= now && el.hasAttribute('data-reload-on-expire') && !el.dataset.reloaded) {
        el.dataset.reloaded = '1';
        window.setTimeout(function () { window.location.reload(); }, 1500);
      }
    });
  }
  if (countdowns.length) {
    tick();
    window.setInterval(tick, 20000);
  }
})();
