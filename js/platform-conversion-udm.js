/**
 * Portal Conversión UDM — escaneo / búsqueda de SKU
 */
(function (global) {
  'use strict';

  var bySku = Object.create(null);
  var stream = null;
  var detector = null;
  var detectTimer = null;

  function catalog() {
    return global.UDM_CATALOG || { items: [], totals: {}, sampleSkus: [] };
  }

  function indexCatalog() {
    bySku = Object.create(null);
    (catalog().items || []).forEach(function (item) {
      bySku[String(item.sku || '').trim().toUpperCase()] = item;
    });
  }

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    return n == null ? '—' : String(n);
  }

  function riskClass(r) {
    r = String(r || '').toUpperCase();
    if (r === 'ALTO') return 'udm-badge-alto';
    if (r === 'MEDIO') return 'udm-badge-medio';
    if (r === 'BAJO') return 'udm-badge-bajo';
    return 'udm-badge-na';
  }

  function setConv(boxId, valId, val) {
    var box = $(boxId);
    var el = $(valId);
    if (!box || !el) return;
    el.textContent = fmt(val);
    box.classList.toggle('is-empty', val == null);
  }

  function showEmpty(on) {
    var empty = $('udmEmpty');
    var result = $('udmResult');
    if (empty) empty.classList.toggle('is-on', !!on);
    if (result && on) result.classList.remove('is-on');
  }

  function lookup(raw) {
    var key = String(raw || '').trim().toUpperCase();
    var result = $('udmResult');
    var empty = $('udmEmpty');
    if (result) result.classList.remove('is-on');
    if (empty) empty.classList.remove('is-on');
    if (!key) return;

    var item = bySku[key];
    if (!item) {
      showEmpty(true);
      return;
    }

    $('udmResSku').textContent = item.sku;
    $('udmResName').textContent = item.name;
    $('udmResBrand').textContent = [item.marca, item.unidad].filter(Boolean).join(' · ') || 'Sin marca';
    var risk = $('udmResRisk');
    risk.textContent = item.riesgo || 'N/D';
    risk.className = 'udm-badge ' + riskClass(item.riesgo);

    setConv('udmC1', 'udmV1', item.unidadXCaja);
    setConv('udmC2', 'udmV2', item.cajasXCama);
    setConv('udmC3', 'udmV3', item.camasXPallet);
    setConv('udmC4', 'udmV4', item.cajasXPallet);

    var parts = [];
    if (item.unidadXCaja) parts.push('<strong>1 caja</strong> = ' + item.unidadXCaja + ' und');
    if (item.cajasXCama) parts.push('<strong>1 cama</strong> = ' + item.cajasXCama + ' cajas');
    if (item.camasXPallet) parts.push('<strong>1 pallet</strong> = ' + item.camasXPallet + ' camas');
    if (item.cajasXPallet) parts.push('<strong>1 pallet</strong> = ' + item.cajasXPallet + ' cajas');
    if (item.unidadXCaja && item.cajasXPallet) {
      parts.push('<strong>1 pallet</strong> ≈ ' + (item.unidadXCaja * item.cajasXPallet) + ' und');
    }
    $('udmLadder').innerHTML = parts.length
      ? parts.join(' · ')
      : 'Aún sin factores de conversión completos para este SKU.';

    result.classList.add('is-on');
  }

  function demoScan() {
    var samples = catalog().sampleSkus || [];
    if (!samples.length) return;
    var sku = samples[Math.floor(Math.random() * samples.length)];
    var input = $('udmSkuInput');
    if (input) input.value = sku;
    lookup(sku);
  }

  function stopCamera() {
    if (detectTimer) {
      clearInterval(detectTimer);
      detectTimer = null;
    }
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* noop */ } });
      stream = null;
    }
    var frame = $('udmScanFrame');
    var video = $('udmVideo');
    if (frame) frame.classList.remove('is-live');
    if (video) video.srcObject = null;
    var btn = $('udmBtnCamera');
    if (btn) btn.textContent = 'Abrir cámara';
  }

  function startDetectLoop(video) {
    if (!detector || !video) return;
    detectTimer = setInterval(function () {
      detector.detect(video).then(function (codes) {
        if (!codes || !codes.length) return;
        var raw = codes[0].rawValue || codes[0].rawData || '';
        if (!raw) return;
        var input = $('udmSkuInput');
        if (input) input.value = raw;
        lookup(raw);
      }).catch(function () { /* noop */ });
    }, 700);
  }

  function toggleCamera() {
    if (stream) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      demoScan();
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    }).then(function (media) {
      stream = media;
      var video = $('udmVideo');
      var frame = $('udmScanFrame');
      if (!video || !frame) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.play().catch(function () { /* noop */ });
      frame.classList.add('is-live');
      var btn = $('udmBtnCamera');
      if (btn) btn.textContent = 'Cerrar cámara';
      if (global.BarcodeDetector) {
        try {
          detector = new global.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code']
          });
          startDetectLoop(video);
        } catch (e) {
          detector = null;
        }
      }
    }).catch(function () {
      demoScan();
    });
  }

  function renderChips() {
    var chips = $('udmChips');
    if (!chips) return;
    chips.innerHTML = '';
    (catalog().sampleSkus || []).slice(0, 6).forEach(function (sku) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'udm-chip';
      b.textContent = sku;
      b.addEventListener('click', function () {
        var input = $('udmSkuInput');
        if (input) input.value = sku;
        lookup(sku);
      });
      chips.appendChild(b);
    });
  }

  function bind() {
    indexCatalog();
    var meta = $('udmMeta');
    var c = catalog();
    if (meta) {
      meta.textContent = (c.totals.skus || 0) + ' SKUs · ' +
        (c.totals.completos || 0) + ' con conversión completa';
    }
    renderChips();

    var input = $('udmSkuInput');
    $('udmBtnLookup') && $('udmBtnLookup').addEventListener('click', function () {
      lookup(input && input.value);
    });
    $('udmBtnDemo') && $('udmBtnDemo').addEventListener('click', demoScan);
    $('udmBtnCamera') && $('udmBtnCamera').addEventListener('click', toggleCamera);
    $('udmBtnClear') && $('udmBtnClear').addEventListener('click', function () {
      if (input) input.value = '';
      showEmpty(false);
      var result = $('udmResult');
      if (result) result.classList.remove('is-on');
      if (input) input.focus();
    });
    input && input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        lookup(input.value);
      }
    });
    $('udmDockScan') && $('udmDockScan').addEventListener('click', function () {
      if (input) input.focus();
      toggleCamera();
    });
    $('udmDockHome') && $('udmDockHome').addEventListener('click', function () {
      global.location.href = 'index.html';
    });
    $('udmDockList') && $('udmDockList').addEventListener('click', function () {
      if (c.sampleSkus && c.sampleSkus[0]) {
        if (input) input.value = c.sampleSkus[0];
        lookup(c.sampleSkus[0]);
      }
    });

    if (c.sampleSkus && c.sampleSkus[0]) {
      if (input) input.value = c.sampleSkus[0];
      lookup(c.sampleSkus[0]);
    }

    global.addEventListener('pagehide', stopCamera);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
