(function () {
  'use strict';

  // ---- Mobile sidebar ----
  var menuBtn = document.querySelector('[data-admin-menu]');
  var side = document.getElementById('admin-side');
  if (menuBtn && side) {
    menuBtn.addEventListener('click', function () {
      var open = side.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ---- Progress bars (widths set via CSSOM; inline styles are blocked by CSP) ----
  function setBar(el, pct) {
    el.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
  }
  document.querySelectorAll('[data-progress]').forEach(function (el) {
    setBar(el, el.getAttribute('data-progress'));
  });

  // ---- File drop zones ----
  function formatSize(bytes) {
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  }
  document.querySelectorAll('[data-dropzone]').forEach(function (zone) {
    var input = zone.querySelector('input[type=file]');
    var label = zone.querySelector('[data-file-label]');
    var original = label ? label.textContent : '';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!label) return;
      label.textContent = file ? file.name + ' · ' + formatSize(file.size) : original;
      label.classList.toggle('file-name', !!file);
    });
    ['dragenter', 'dragover'].forEach(function (type) {
      zone.addEventListener(type, function () { zone.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      zone.addEventListener(type, function () { zone.classList.remove('is-drag'); });
    });
  });

  // ---- Uploads with progress (CSRF token travels in a header) ----
  document.querySelectorAll('form[data-upload]').forEach(function (form) {
    var errorBox = form.querySelector('[data-upload-error]');
    var errorText = form.querySelector('[data-upload-error-text]');
    var progressBox = form.querySelector('[data-upload-progress]');
    var bar = form.querySelector('[data-upload-bar]');
    var percent = form.querySelector('[data-upload-percent]');
    var submit = form.querySelector('[data-upload-submit]');

    function showError(message) {
      errorText.textContent = message;
      errorBox.hidden = false;
      if (progressBox) progressBox.hidden = true;
      submit.disabled = false;
      window.onbeforeunload = null;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      var required = form.querySelectorAll('[required]');
      for (var i = 0; i < required.length; i++) {
        var field = required[i];
        var empty = field.type === 'file' ? !(field.files && field.files.length) : !String(field.value).trim();
        if (empty) {
          var name = (field.labels && field.labels[0] && field.labels[0].textContent.trim()) || field.name;
          return showError(field.type === 'file' ? 'Please choose a file.' : 'Please fill in: ' + name);
        }
      }

      var csrf = form.getAttribute('data-csrf');
      function showProgress(pct) {
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        if (bar) setBar(bar, pct);
        if (percent) percent.textContent = pct + '%';
      }

      // Sends one request; resolves { status, data }. onProgress(loadedBytes) is optional.
      function send(method, url, body, onProgress) {
        return new Promise(function (resolve) {
          var xhr = new XMLHttpRequest();
          xhr.open(method, url);
          xhr.setRequestHeader('X-CSRF-Token', csrf);
          xhr.setRequestHeader('Accept', 'application/json');
          if (typeof body === 'string') xhr.setRequestHeader('Content-Type', 'application/json');
          if (onProgress) xhr.upload.addEventListener('progress', function (ev) { onProgress(ev.loaded); });
          xhr.addEventListener('load', function () {
            var data = null;
            try { data = JSON.parse(xhr.responseText); } catch (err) { /* not JSON */ }
            resolve({ status: xhr.status, data: data });
          });
          xhr.addEventListener('error', function () { resolve({ status: 0, data: null }); });
          xhr.addEventListener('abort', function () { resolve({ status: 0, data: null }); });
          xhr.send(body);
        });
      }

      // Large videos go up in pieces (hosting proxies cut long requests). Each
      // piece is retried a few times; the server tells us where to resume.
      function uploadInPieces(file) {
        return send('POST', '/admin/uploads', JSON.stringify({ name: file.name, size: file.size })).then(function (start) {
          if (!start.data || !start.data.ok) throw new Error((start.data && start.data.error) || 'Could not start the upload.');
          var id = start.data.uploadId;
          var size = start.data.chunkSize;
          var offset = 0;
          var failures = 0;
          function next() {
            if (offset >= file.size) return id;
            var piece = file.slice(offset, Math.min(offset + size, file.size));
            return send('PUT', '/admin/uploads/' + encodeURIComponent(id) + '?offset=' + offset, piece, function (loaded) {
              showProgress(((offset + loaded) / file.size) * 98);
            }).then(function (r) {
              if (r.data && typeof r.data.received === 'number' && (r.status === 200 || r.status === 409)) {
                offset = r.data.received;
                failures = 0;
                return next();
              }
              if (r.status === 404 || ++failures > 5) throw new Error((r.data && r.data.error) || 'The upload was interrupted. Check your connection and try again.');
              return new Promise(function (wait) { window.setTimeout(wait, 2000 * failures); }).then(next);
            });
          }
          return next();
        });
      }

      submit.disabled = true;
      if (progressBox) progressBox.hidden = false;
      showProgress(0);
      window.onbeforeunload = function () { return 'Upload in progress'; };

      var videoInput = form.querySelector('input[type=file][name=video]');
      var videoFile = videoInput && videoInput.files && videoInput.files[0];
      var formData = new FormData(form);
      var ready = Promise.resolve();
      if (videoFile) {
        formData.delete('video');
        ready = uploadInPieces(videoFile).then(function (id) { formData.set('upload_id', id); });
      }
      ready
        .then(function () {
          return send('POST', form.action, formData, videoFile ? null : function (loaded) { showProgress((loaded / Math.max(1, totalSize(formData))) * 100); });
        })
        .then(function (r) {
          if (r.status >= 200 && r.status < 300 && r.data && r.data.ok) {
            showProgress(100);
            window.onbeforeunload = null;
            window.location.href = r.data.redirect;
          } else {
            showError((r.data && r.data.error) || (r.status ? 'Upload failed (HTTP ' + r.status + '). Please try again.' : 'Network error. Check your connection and try again.'));
          }
        })
        .catch(function (err) { showError(err.message); });
    });
  });

  function totalSize(formData) {
    var total = 0;
    formData.forEach(function (value) { if (value && typeof value.size === 'number') total += value.size; });
    return total;
  }

  // ---- Live processing status ----
  var processing = Array.prototype.slice.call(document.querySelectorAll('[data-processing]'));
  if (processing.length) {
    var ids = processing.map(function (el) { return el.getAttribute('data-processing'); });
    var pollStatus = function () {
      fetch('/admin/videos/status.json?ids=' + encodeURIComponent(ids.join(',')), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var done = false;
          (data.videos || []).forEach(function (v) {
            if (v.status !== 'processing') { done = true; return; }
            var row = document.querySelector('[data-processing="' + v.public_id + '"]');
            if (!row) return;
            var barEl = row.querySelector('[data-progress]');
            var text = row.querySelector('[data-progress-text]');
            if (barEl) setBar(barEl, v.progress);
            if (text) text.textContent = (text.textContent.indexOf('Encrypting') === 0 ? 'Encrypting… ' : '') + v.progress + '%';
          });
          if (done) window.location.reload();
          else window.setTimeout(pollStatus, 3000);
        })
        .catch(function () { window.setTimeout(pollStatus, 6000); });
    };
    window.setTimeout(pollStatus, 2000);
  }

  // ---- Revenue chart (single series: no legend, the card title names it) ----
  var chartEl = document.getElementById('revenue-chart');
  if (chartEl) {
    var series = JSON.parse(chartEl.getAttribute('data-series') || '[]');
    var currency = chartEl.getAttribute('data-currency') || 'USD';
    var minor = currency === 'LBP' ? 1 : 100;
    var money = function (v) {
      return currency === 'LBP'
        ? 'LBP ' + Math.round(v).toLocaleString('en-US')
        : new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, maximumFractionDigits: v % 100 === 0 ? 0 : 2 }).format(v / minor);
    };
    var compact = function (v) {
      var major = v / minor;
      if (currency === 'LBP') return major >= 1e6 ? (major / 1e6).toFixed(major >= 1e7 ? 0 : 1) + 'M' : major >= 1e3 ? Math.round(major / 1e3) + 'K' : String(major);
      return '$' + (major >= 1000 ? (major / 1000).toFixed(major >= 10000 ? 0 : 1) + 'K' : Math.round(major));
    };
    var NS = 'http://www.w3.org/2000/svg';
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    var tipValue = document.createElement('strong');
    var tipLabel = document.createElement('span');
    tip.appendChild(tipValue);
    tip.appendChild(tipLabel);

    var niceStep = function (max, count) {
      var raw = max / count;
      var pow = Math.pow(10, Math.floor(Math.log10(raw)));
      var steps = [1, 2, 2.5, 5, 10];
      for (var i = 0; i < steps.length; i++) if (steps[i] * pow >= raw) return steps[i] * pow;
      return 10 * pow;
    };

    var el = function (name, attrs) {
      var node = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      return node;
    };

    var draw = function () {
      chartEl.textContent = '';
      chartEl.appendChild(tip);
      var width = chartEl.clientWidth;
      var height = chartEl.clientHeight;
      var m = { top: 22, right: 4, bottom: 26, left: 48 };
      var pw = width - m.left - m.right;
      var ph = height - m.top - m.bottom;
      var max = Math.max.apply(null, series.map(function (d) { return d.revenue; }));
      var step = niceStep(max, 4);
      var top = Math.ceil(max / step) * step;
      var svg = el('svg', { width: width, height: height, viewBox: '0 0 ' + width + ' ' + height });

      for (var t = 0; t <= top + 0.0001; t += step) {
        var y = m.top + ph - (t / top) * ph;
        svg.appendChild(el('line', { x1: m.left, x2: width - m.right, y1: y, y2: y, class: t === 0 ? 'baseline' : 'grid-line' }));
        var label = el('text', { x: m.left - 10, y: y + 4, 'text-anchor': 'end', class: 'tick' });
        label.textContent = compact(t);
        svg.appendChild(label);
      }

      var band = pw / series.length;
      var barW = Math.min(24, Math.max(2, band - 2)); // <=24px, 2px surface gap between neighbours
      var peakIndex = series.reduce(function (best, d, i) { return d.revenue > series[best].revenue ? i : best; }, 0);
      var labelEvery = Math.ceil(series.length / Math.max(2, Math.floor(pw / 70)));

      series.forEach(function (d, i) {
        var cx = m.left + band * i + band / 2;
        var x = cx - barW / 2;
        var h = top ? (d.revenue / top) * ph : 0;
        var base = m.top + ph;
        var bar = null;
        if (h > 0) {
          var r = Math.min(4, barW / 2, h); // rounded data-end, square at the baseline
          var path = 'M' + x + ',' + base + 'V' + (base - h + r) + 'Q' + x + ',' + (base - h) + ' ' + (x + r) + ',' + (base - h) +
            'H' + (x + barW - r) + 'Q' + (x + barW) + ',' + (base - h) + ' ' + (x + barW) + ',' + (base - h + r) + 'V' + base + 'Z';
          bar = el('path', { d: path, class: 'bar' });
          svg.appendChild(bar);
        }
        if (i === peakIndex && d.revenue > 0) {
          var peak = el('text', { x: cx, y: base - h - 7, 'text-anchor': 'middle', class: 'peak-label' });
          peak.textContent = compact(d.revenue);
          svg.appendChild(peak);
        }
        if ((series.length - 1 - i) % labelEvery === 0) {
          var xl = el('text', { x: cx, y: height - 6, 'text-anchor': 'middle', class: 'tick' });
          xl.textContent = d.label;
          svg.appendChild(xl);
        }
        // Hit target: the whole column, wider than the painted bar.
        var hit = el('rect', { x: m.left + band * i, y: m.top, width: band, height: ph, class: 'hit', tabindex: '0', role: 'img',
          'aria-label': d.label + ': ' + money(d.revenue) + ', ' + d.sales + ' sold' });
        var show = function () {
          tipValue.textContent = money(d.revenue);
          tipLabel.textContent = d.label + ' · ' + d.sales + ' lecture' + (d.sales === 1 ? '' : 's') + ' sold';
          tip.hidden = false;
          tip.style.left = Math.min(Math.max(cx, 70), width - 70) + 'px';
          tip.style.top = (base - h) + 'px';
          if (bar) bar.classList.add('is-hover');
        };
        var hide = function () { tip.hidden = true; if (bar) bar.classList.remove('is-hover'); };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('pointerleave', hide);
        hit.addEventListener('focus', show);
        hit.addEventListener('blur', hide);
        svg.appendChild(hit);
      });
      chartEl.insertBefore(svg, tip);
    };
    draw();
    var resizeTimer;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(draw, 150);
    });
  }
})();
