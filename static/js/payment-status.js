// Polls the server (which asks the payment provider) until the payment settles.
(function () {
  'use strict';
  var card = document.getElementById('payment-status');
  if (!card || card.getAttribute('data-status') !== 'pending') return;
  var url = card.getAttribute('data-status-url');
  var attempts = 0;

  function poll() {
    attempts += 1;
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.status && data.status !== 'pending') {
          window.location.reload();
          return;
        }
        if (attempts < 60) window.setTimeout(poll, attempts < 10 ? 3000 : 6000);
      })
      .catch(function () {
        if (attempts < 60) window.setTimeout(poll, 6000);
      });
  }
  window.setTimeout(poll, 2500);
})();
