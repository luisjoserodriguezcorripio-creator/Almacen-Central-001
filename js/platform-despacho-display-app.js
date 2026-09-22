/**
 * Inicialización — despacho-pantalla.html (monitor / PC externa)
 */
(function (global) {
  'use strict';

  var view = 'auto';
  var waitingEl = null;

  function getViewParam() {
    try {
      var v = new URLSearchParams(global.location.search).get('v');
      if (v === 'barcode' || v === 'lista' || v === 'auto') return v;
    } catch (e) { /* noop */ }
    return 'auto';
  }

  function showWaiting(msg) {
    if (!waitingEl) return;
    waitingEl.hidden = false;
    waitingEl.setAttribute('aria-hidden', 'false');
    var txt = waitingEl.querySelector('.desp-display-wait-text');
    if (txt) txt.textContent = msg || 'Esperando que compartan desde el panel de control…';
  }

  function hideWaiting() {
    if (!waitingEl) return;
    waitingEl.hidden = true;
    waitingEl.setAttribute('aria-hidden', 'true');
  }

  function refreshWaiting() {
    var store = global.PlatformDespachoStore;
    if (!store) return;
    var data = store.load();
    var barcode = store.getLiveShare(data);
    var lista = store.getLiveShareLista(data);
    var showBarcode = view === 'barcode' || (view === 'auto' && barcode && barcode.active);
    var showLista = view === 'lista' || (view === 'auto' && !showBarcode && lista && lista.active);

    if (showBarcode && barcode && barcode.active) {
      hideWaiting();
      return;
    }
    if (showLista && lista && lista.active) {
      hideWaiting();
      return;
    }
    if (view === 'barcode') showWaiting('Esperando código de barras IDC…');
    else if (view === 'lista') showWaiting('Esperando seguimiento del validador…');
    else showWaiting('Esperando transmisión en vivo…');
  }

  function bindPresents() {
    if (view === 'barcode' || view === 'auto') {
      if (global.PlatformDespachoPresent) global.PlatformDespachoPresent.bind({ displayMode: true });
    }
    if (view === 'lista' || view === 'auto') {
      if (global.PlatformDespachoPresentLista) global.PlatformDespachoPresentLista.bind({ displayMode: true });
    }
  }

  function onUpdate() {
    refreshWaiting();
    if (global.PlatformDespachoPresent) global.PlatformDespachoPresent.refresh();
    if (global.PlatformDespachoPresentLista) global.PlatformDespachoPresentLista.refresh();
  }

  function init() {
    view = getViewParam();
    waitingEl = document.getElementById('despDisplayWaiting');
    document.body.classList.add('desp-display-mode', 'desp-display-view-' + view);

    bindPresents();
    refreshWaiting();

    if (global.PlatformWakeLock) global.PlatformWakeLock.acquire('desp-display');

    global.addEventListener('despacho-updated', onUpdate);
    global.addEventListener('despacho-live-share', onUpdate);
    global.addEventListener('despacho-live-lista', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (global.PlatformDespachoStore && global.PlatformDespachoStore.STORAGE_KEY)) onUpdate();
    });
    global.addEventListener('lan-ready', onUpdate);
    global.addEventListener('lan-sync', function (ev) {
      if (!ev.detail || ev.detail.store === 'despacho') onUpdate();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
