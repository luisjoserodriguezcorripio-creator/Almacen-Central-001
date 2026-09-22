/**
 * Control de Turnos — puente página ↔ Service Worker (polling en segundo plano)
 */
(function (global) {
  'use strict';

  var swReady = null;

  function getRestConfig() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sb = cfg && cfg.supabase;
    if (!sb || !sb.enabled || !sb.url || !sb.anonKey) return null;
    return { url: String(sb.url).replace(/\/+$/, ''), key: sb.anonKey };
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    swReady = navigator.serviceWorker.register('sw-turnos.js', { scope: './' }).catch(function () {
      return null;
    });
  }

  function postToSw(msg) {
    if (!('serviceWorker' in navigator)) return;
    function send() {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(msg);
        return;
      }
      if (swReady) {
        swReady.then(function (reg) {
          if (reg && reg.active) reg.active.postMessage(msg);
        }).catch(function () { /* noop */ });
      }
    }
    if (navigator.serviceWorker.controller) {
      send();
      return;
    }
    navigator.serviceWorker.ready.then(send).catch(function () { /* noop */ });
  }

  function startWatch(opts) {
    var rc = getRestConfig();
    if (!rc || !opts || !opts.role) return;
    postToSw({
      type: 'turnos-watch-start',
      role: opts.role,
      pollUrl: rc.url,
      apiKey: rc.key,
      myTurnId: opts.myTurnId || '',
      choferName: opts.choferName || '',
      convocadoSeen: opts.convocadoSeen || {},
      bootstrap: !!opts.bootstrap,
      bootstrapEntries: opts.bootstrapEntries || [],
      openUrl: opts.openUrl || (opts.role === 'supervisor' ? './turnos-supervisor.html' : './turnos.html'),
      pollMs: opts.pollMs || 12000
    });
  }

  function stopWatch() {
    postToSw({ type: 'turnos-watch-stop' });
  }

  function updateWatch(patch) {
    postToSw(Object.assign({ type: 'turnos-watch-update' }, patch || {}));
  }

  function showViaWorker(payload) {
    postToSw(Object.assign({ type: 'turnos-alert' }, payload || {}));
  }

  registerServiceWorker();

  global.PlatformTurnosSwWatch = {
    startWatch: startWatch,
    stopWatch: stopWatch,
    updateWatch: updateWatch,
    showViaWorker: showViaWorker,
    registerServiceWorker: registerServiceWorker
  };
})(typeof window !== 'undefined' ? window : this);
