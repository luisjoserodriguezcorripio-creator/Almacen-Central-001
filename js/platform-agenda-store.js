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
    var sync = Sync();
    var normalized = C().normalizeState(data);
    if ((!normalized.templates || !normalized.templates.length) &&
        sync && typeof sync.mergeSeedIfEmpty === 'function') {
      // Defensa: si llega vacío, el sync ya debió mergear; no borrar checklist.
      shared.state = normalized;
    } else {
      shared.state = normalized;
    }
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
      shared.error = 'No se pudo cargar la conexión.';
      return C().loadSeedTemplates().then(function (seed) {
        shared.state = C().normalizeState({ templates: seed, daily: {} });
        shared.live = false;
        shared.error = 'Modo local — plantillas cargadas.';
        notify();
        return shared;
      });
    }

    initPromise = sync.ready().then(function (res) {
      shared.live = !!(res && res.ok && !res.degraded && !res.local);
      if (res && res.data) {
        applyRemote(res.data);
      } else {
        return C().loadSeedTemplates().then(function (seed) {
          applyRemote({ templates: seed, daily: {} });
          return shared;
        });
      }
      if (res && res.degraded) {
        shared.error = 'Modo local — checklist activo sin nube.';
      } else if (res && res.local) {
        shared.error = 'Modo local — Supabase no configurado.';
      } else {
        shared.error = '';
      }
      notify();
      if (unsub) unsub();
      unsub = sync.onChange(function (kind, data) {
        if (kind === 'sync' && data) {
          applyRemote(data);
          shared.live = !!sync.isLive();
          notify();
        }
      });
      return shared;
    }).catch(function () {
      return C().loadSeedTemplates().then(function (seed) {
        applyRemote({ templates: seed, daily: {} });
        shared.live = false;
        shared.error = 'Modo local — no se pudo conectar.';
        notify();
        return shared;
      });
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
      // En modo local el sync ya notificó; en nube re-pull con seed merge.
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
      shared.live = !!sync.isLive();
      notify();
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
