// Encrypted HLS playback with a moving, per-student watermark.
// Real protection happens on the server (every segment and the key are
// authorized per request). This file adds deterrents on top: the watermark
// identifies whoever screen-records, and access stops the moment time is up.
(function () {
  'use strict';

  var shell = document.getElementById('player-shell');
  if (!shell) return;
  var video = shell.querySelector('video');
  var src = shell.getAttribute('data-src');
  var expiresAt = Number(shell.getAttribute('data-expires') || 0);
  var watermarkText = shell.getAttribute('data-watermark') || '';
  var hls = null;
  var stopped = false;

  function block(title, message) {
    if (stopped) return;
    stopped = true;
    try { video.pause(); } catch (e) { /* ignore */ }
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src');
    try { video.load(); } catch (e) { /* ignore */ }
    var overlay = shell.querySelector('.player-blocked');
    overlay.querySelector('[data-blocked-title]').textContent = title;
    overlay.querySelector('[data-blocked-msg]').textContent = message;
    overlay.hidden = false;
  }

  function accessEnded() {
    block('Your access has ended', 'Your viewing period for this lecture is over. You can unlock it again from the lecture page.');
  }

  shell.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---- Player UI ----
  var player = new window.Plyr(video, {
    iconUrl: 'vendor/plyr.svg',
    blankVideo: '',
    controls: ['play-large', 'play', 'rewind', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'fullscreen'],
    settings: ['speed'],
    speed: { selected: 1, options: [0.75, 1, 1.25, 1.5, 1.75, 2] },
    seekTime: 10,
    keyboard: { focused: true, global: false },
    tooltips: { controls: true, seek: true },
    fullscreen: { enabled: true, fallback: true, iosNative: false },
    disableContextMenu: true,
    invertTime: false,
  });

  // ---- Stream ----
  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 30,
      enableWorker: true,
    });
    hls.on(window.Hls.Events.ERROR, function (event, data) {
      var code = data && data.response && data.response.code;
      if (code === 401) return block('Signed out', 'Your session ended (for example because you signed in on another device). Sign in again to keep watching.');
      if (code === 403) return accessEnded();
      if (!data.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        window.setTimeout(function () { if (hls) hls.startLoad(); }, 2000);
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        block('Playback error', 'Something went wrong while playing this lecture. Please reload the page.');
      }
    });
    hls.loadSource(src);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src; // Safari / iOS native HLS (same-origin requests carry the session cookie)
    video.addEventListener('error', function () {
      fetch(src, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
        if (r.status === 403) accessEnded();
        else if (r.status === 401) block('Signed out', 'Sign in again to keep watching.');
      }).catch(function () { /* offline */ });
    });
  } else {
    block('Browser not supported', 'Please use a recent version of Chrome, Edge, Firefox or Safari.');
  }

  // ---- Watermark ----
  var wm = document.createElement('div');
  wm.className = 'wm';
  wm.setAttribute('aria-hidden', 'true');
  wm.textContent = watermarkText;

  function container() {
    return (player && player.elements && player.elements.container) || shell;
  }

  function placeWatermark() {
    wm.style.top = (6 + Math.random() * 74).toFixed(1) + '%';
    wm.style.left = (4 + Math.random() * 60).toFixed(1) + '%';
  }

  function ensureWatermark() {
    if (!watermarkText) return;
    var host = container();
    var style = window.getComputedStyle(wm);
    var tampered = !host.contains(wm) || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.2;
    if (tampered) {
      wm.removeAttribute('style');
      wm.className = 'wm';
      wm.textContent = watermarkText;
      host.appendChild(wm);
      placeWatermark();
      if (host.contains(wm) && !video.paused) video.pause();
    }
  }

  if (watermarkText) {
    container().appendChild(wm);
    placeWatermark();
    window.setInterval(placeWatermark, 7000);
    window.setInterval(ensureWatermark, 1500);
    player.on('ready', ensureWatermark);
    player.on('enterfullscreen', ensureWatermark);
  }

  // ---- Expiry ----
  if (expiresAt) {
    window.setInterval(function () {
      if (Date.now() >= expiresAt) accessEnded();
    }, 5000);
  }
})();
