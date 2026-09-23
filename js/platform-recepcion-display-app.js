/**
 * Boot — recepcion-pantalla.html (monitor externo)
 */
(function (global) {
  'use strict';

  var waitingEl = null;

  function showWaiting(msg) {
    if (!waitingEl) return;
    waitingEl.hidden = false;
    waitingEl.setAttribute('aria-hidden', 'false');
    var txt = waitingEl.querySelector('.rec-display-wait-text');
    if (txt) txt.textContent = msg || 'Esperando transmisión desde Gestión de Recepción y Ubicación…';
  }

  function hideWaiting() {
    if (!waitingEl) return;
    waitingEl.hidden = true;
    waitingEl.setAttribute('aria-hidden', 'true');
  }

  function refreshWaiting() {
    var store = global.PlatformRecepcionStore;
    if (!store) return;
    var share = store.getLiveShareBoard(store.load());
    if (share && share.active) hideWaiting();
    else showWaiting();
  }

  function onUpdate() {
    refreshWaiting();
    if (global.PlatformRecepcionPresent) global.PlatformRecepcionPresent.refresh();
  }

  function setMenuOpen(open) {
    var drawer = document.getElementById('recTvDrawer');
    var bd = document.getElementById('recTvDrawerBd');
    var btn = document.getElementById('recTvMenuOpen');
    if (!drawer) return;
    drawer.hidden = !open;
    if (bd) bd.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindMenu() {
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === 'recTvMenuOpen' || (t.closest && t.closest('#recTvMenuOpen'))) {
        setMenuOpen(true);
        return;
      }
      if (t.id === 'recTvMenuClose' || t.id === 'recTvDrawerBd' ||
          (t.closest && (t.closest('#recTvMenuClose') || t.id === 'recTvDrawerBd'))) {
        setMenuOpen(false);
      }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setMenuOpen(false);
    });
  }

  function init() {
    waitingEl = document.getElementById('recDisplayWaiting');
    document.body.classList.add('rec-display-mode');
    bindMenu();
    if (global.PlatformRecepcionPresent) {
      global.PlatformRecepcionPresent.bind({ displayMode: true });
    }
    refreshWaiting();
    if (global.PlatformWakeLock) global.PlatformWakeLock.acquire('rec-display');
    global.addEventListener('recepcion-updated', onUpdate);
    global.addEventListener('recepcion-live-board', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (global.PlatformRecepcionStore && global.PlatformRecepcionStore.STORAGE_KEY)) onUpdate();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
