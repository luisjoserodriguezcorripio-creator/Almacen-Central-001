/**
 * Agenda operativa — store en memoria + suscripción
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformAgendaCore; };
  var Sync = function () { return global.PlatformAgendaSync; };
  var shared = { state: null, live: false, error: '' };
  var listeners = [];
  var initPromise = null;
  var unsub = null;

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(shared); } catch (e) { /* noop */ }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function applyRemote(data) {
    shared.state = C().normalizeState(data);
    shared.live = true;
    shared.error = '';
    notify();
  }

  function init() {
    if (initPromise) return initPromise;
    shared.state = C().normalizeState(null);
    shared.live = false;
    shared.error = '';
    notify();

    var sync = Sync();
    if (!sync) {
      shared.error = 'No se pudo cargar la conexión con la nube.';
      return Promise.resolve(shared);
    }

    initPromise = sync.ready().then(function (res) {
      if (!res.ok) {
        shared.live = false;
        shared.error = 'Sin conexión con la nube. Verifique internet.';
        notify();
        return shared;
      }
      shared.live = !res.degraded;
      shared.error = res.degraded ? 'Modo local — reintente conexión.' : '';
      applyRemote(res.data);
      if (unsub) unsub();
      unsub = sync.onChange(function (kind, data) {
        if (kind === 'sync' && data) applyRemote(data);
      });
      return shared;
    });

    return initPromise;
  }

  function getState() {
    return shared;
  }

  function updateTask(dayKey, puestoId, taskId, patch, user) {
    var sync = Sync();
    if (!sync) return Promise.resolve({ ok: false, msg: shared.error || 'Sin sync' });
    var name = user && (user.name || user.username);
    return sync.updateTaskProgress(dayKey, puestoId, taskId, patch, name).then(function (rec) {
      return pullFresh().then(function () {
        return { ok: true, progress: rec };
      });
    }).catch(function (err) {
      return { ok: false, msg: (err && err.message) || 'No se pudo guardar.' };
    });
  }

  function pullFresh() {
    var sync = Sync();
    if (!sync) return Promise.resolve(shared);
    return sync.pullState().then(function (data) {
      applyRemote(data);
      return shared;
    }).catch(function () { return shared; });
  }

  global.PlatformAgendaStore = {
    init: init,
    subscribe: subscribe,
    getState: getState,
    updateTask: updateTask,
    pullFresh: pullFresh
  };
})(typeof window !== 'undefined' ? window : this);
