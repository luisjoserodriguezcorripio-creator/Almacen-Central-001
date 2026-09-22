/**
 * Screen Wake Lock — evita suspensión/apagado mientras Modo TV, tablón o share activo
 */
(function (global) {
  'use strict';

  var holds = Object.create(null);
  var wakeLock = null;
  var supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  function syncLock() {
    if (!supported) return;
    var need = Object.keys(holds).length > 0;
    if (need && !wakeLock) {
      navigator.wakeLock.request('screen').then(function (sentinel) {
        wakeLock = sentinel;
        sentinel.addEventListener('release', function () {
          wakeLock = null;
          if (Object.keys(holds).length > 0) syncLock();
        });
      }).catch(function () { /* pestaña oculta o permiso denegado */ });
    } else if (!need && wakeLock) {
      wakeLock.release().catch(function () { /* noop */ });
      wakeLock = null;
    }
  }

  function setHeld(key, active) {
    if (active) holds[key] = true;
    else delete holds[key];
    syncLock();
  }

  function acquire(key) {
    setHeld(key, true);
  }

  function release(key) {
    setHeld(key, false);
  }

  function releaseAll() {
    holds = Object.create(null);
    syncLock();
  }

  if (supported && global.document) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible' && Object.keys(holds).length > 0) {
        wakeLock = null;
        syncLock();
      }
    });
  }

  global.PlatformWakeLock = {
    supported: supported,
    acquire: acquire,
    release: release,
    setHeld: setHeld,
    releaseAll: releaseAll
  };
})(typeof window !== 'undefined' ? window : this);
