/**
 * Código de barras Code 128 para IDC — render vía canvas → img (evita SVG negro en tema oscuro)
 * TV: render 3–4× en canvas y escala nítida para pantallas grandes / escáneres.
 */
(function (global) {
  'use strict';

  function resolveScale(opts) {
    if (opts && opts.scale != null) return Math.max(1, Number(opts.scale) || 1);
    if (opts && opts.tv) {
      var dpr = global.devicePixelRatio || 1;
      return Math.min(5, Math.max(4, Math.round(dpr * 2)));
    }
    return 1;
  }

  function renderToCanvas(text, opts) {
    if (!text || typeof global.JsBarcode !== 'function') return null;
    opts = opts || {};
    var tv = !!opts.tv;
    var scale = resolveScale(opts);
    var showText = opts.showText === true;
    try {
      var canvas = document.createElement('canvas');
      var barcodeOpts = {
        format: 'CODE128',
        displayValue: showText,
        height: Math.round((opts.height || (tv ? 220 : 72)) * scale),
        width: (opts.width || (tv ? 4 : 2)) * scale,
        margin: Math.round((opts.margin || (tv ? 28 : 8)) * scale),
        background: opts.background || '#ffffff',
        lineColor: '#000000'
      };
      if (showText) {
        barcodeOpts.fontSize = Math.round((opts.fontSize || (tv ? 44 : 20)) * scale);
        barcodeOpts.textAlign = 'center';
        barcodeOpts.textPosition = 'bottom';
        barcodeOpts.textMargin = Math.round((opts.textMargin != null ? opts.textMargin : 12) * scale);
        barcodeOpts.fontOptions = tv ? 'bold' : '';
        barcodeOpts.font = tv
          ? 'bold ' + Math.round((opts.fontSize || 44) * scale) + 'px "DM Sans", ui-monospace, monospace'
          : 'monospace';
      }
      global.JsBarcode(canvas, String(text), barcodeOpts);
      return {
        canvas: canvas,
        scale: scale,
        displayWidth: Math.max(1, Math.round(canvas.width / scale)),
        displayHeight: Math.max(1, Math.round(canvas.height / scale))
      };
    } catch (e) {
      return null;
    }
  }

  function renderToDataUrl(text, opts) {
    var out = renderToCanvas(text, opts);
    if (!out) return '';
    return out.canvas.toDataURL('image/png', 1);
  }

  function applyToImg(imgEl, text, opts) {
    if (!imgEl) return false;
    opts = opts || {};
    var out = renderToCanvas(text, opts);
    if (!out) {
      imgEl.removeAttribute('src');
      imgEl.removeAttribute('width');
      imgEl.removeAttribute('height');
      imgEl.alt = '';
      return false;
    }
    imgEl.src = out.canvas.toDataURL('image/png', 1);
    imgEl.alt = String(text);
    if (opts.tv) {
      imgEl.width = out.displayWidth;
      imgEl.height = out.displayHeight;
      imgEl.setAttribute('data-hq-scale', String(out.scale));
      imgEl.classList.add('desp-barcode-img--tv', 'desp-barcode-img--hq');
    } else {
      imgEl.removeAttribute('width');
      imgEl.removeAttribute('height');
      imgEl.removeAttribute('data-hq-scale');
      imgEl.classList.remove('desp-barcode-img--tv', 'desp-barcode-img--hq');
    }
    return true;
  }

  function render(targetEl, text, opts) {
    if (!targetEl || !text) return false;
    opts = opts || {};

    if (targetEl.tagName === 'IMG') {
      return applyToImg(targetEl, text, opts);
    }

    if (targetEl.tagName === 'SVG') {
      var img = document.createElement('img');
      img.className = (targetEl.className || '') + ' desp-barcode-img';
      img.id = targetEl.id || '';
      img.setAttribute('role', 'img');
      if (!applyToImg(img, text, opts)) return false;
      targetEl.replaceWith(img);
      return true;
    }

    var nested = targetEl.querySelector('img.desp-barcode-img');
    if (nested) return applyToImg(nested, text, opts);

    var created = document.createElement('img');
    created.className = 'desp-barcode-img';
    if (!applyToImg(created, text, opts)) return false;
    targetEl.innerHTML = '';
    targetEl.appendChild(created);
    return true;
  }

  global.PlatformDespachoBarcode = {
    render: render,
    renderToDataUrl: renderToDataUrl
  };
})(typeof window !== 'undefined' ? window : this);
