/**
 * Control de Turnos — estado compartido (solo nube Supabase)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var Sync = function () { return global.PlatformTurnosSync; };
  var shared = {
    counter: 0,
    entries: [],
    live: false,
    error: '',
    dashboardDay: '',
    autoResetDashboard: true
  };
  var listeners = [];
  var initPromise = null;

  function cloudError(msg) {
    return { ok: false, msg: msg || 'Sin conexión con la nube. Verifique internet e intente de nuevo.' };
  }

  function applyRemote(data) {
    if (!data) return;
    shared.entries = C().sortForAttendanceQueue(data.entries || []);
    shared.counter = Number(data.counter) || 0;
    shared.dashboardDay = String(data.dashboardDay || data.operatingDay || '').trim();
    shared.autoResetDashboard = data.autoResetDashboard !== false;
    if (!shared.counter && shared.entries.length) {
      shared.counter = C().recalcCounterFromEntries(shared.entries);
    }
    notify();
  }

  function upsertEntry(entry) {
    var idx = shared.entries.findIndex(function (e) { return e.id === entry.id; });
    if (idx >= 0) shared.entries[idx] = entry;
    else shared.entries.unshift(entry);
    shared.entries = C().sortForAttendanceQueue(shared.entries);
    shared.counter = Math.max(
      shared.counter,
      parseInt(String(entry.turno || '').replace(/\D/g, ''), 10) || 0
    );
  }

  function notify() {
    listeners.forEach(function (fn) {
      try { fn(shared); } catch (e) { /* noop */ }
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function findById(id) {
    return shared.entries.find(function (e) { return e.id === id; }) || null;
  }

  function findActiveByChofer(nombre) {
    return C().findActiveTurnForChofer(shared.entries, nombre);
  }

  function migrateLocalOnce(sync) {
    var local = C().loadLegacyLocalState();
    if (!local.entries.length) {
      C().clearLegacyLocalState();
      return Promise.resolve();
    }
    if (shared.entries.length) {
      C().clearLegacyLocalState();
      return Promise.resolve();
    }
    return sync.pushState(local).then(function () {
      C().clearLegacyLocalState();
      applyRemote(local);
    }).catch(function () { /* noop */ });
  }

  function addTurn(payload) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.insertTurn(payload).then(function (entry) {
        upsertEntry(entry);
        C().rememberChoferName(payload.choferNombre);
        if (payload.choferCompania) C().rememberChoferCompania(payload.choferCompania);
        C().saveMyTurn(entry);
        if (entry.estado !== C().ESTADO_PENDIENTE_VALIDACION) C().playBeep();
        notify();
        return { ok: true, entry: entry };
      }).catch(function (err) {
        return cloudError((err && err.message) || shared.error);
      });
    });
  }

  function setEstado(id, estado, adminUser) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.updateEstado(id, estado, adminUser).then(function (entry) {
        upsertEntry(entry);
        notify();
        return { ok: true, entry: entry };
      }).catch(function (err) {
        return cloudError((err && err.message) || 'No se pudo actualizar en la nube.');
      });
    });
  }

  function convocarChofer(id, adminUser) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.convocarChofer(id, adminUser).then(function (entry) {
        upsertEntry(entry);
        notify();
        return { ok: true, entry: entry };
      }).catch(function () {
        return cloudError('No se pudo convocar en la nube.');
      });
    });
  }

  function cancelTurn(id, cancelledBy) {
    return init().then(function () {
      var entry = findById(id);
      if (!entry) return { ok: false, msg: 'Turno no encontrado.' };
      var by = cancelledBy || 'chofer';
      if (by === 'chofer' && !C().canCancelByChofer(entry)) {
        return { ok: false, msg: 'Este turno ya no puede cancelarse.' };
      }
      if (!C().isValidTransition(entry, 'CANCELADO')) {
        return { ok: false, msg: 'No se pudo cancelar el turno.' };
      }
      return setEstado(id, 'CANCELADO', by);
    });
  }

  function setHoraLimite(id, horaLimite, adminUser) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.setHoraLimite(id, horaLimite, adminUser).then(function (entry) {
        upsertEntry(entry);
        notify();
        return { ok: true, entry: entry };
      }).catch(function (err) {
        return cloudError((err && err.message) || 'No se pudo guardar la hora límite.');
      });
    });
  }

  function setCompania(id, compania, adminUser) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.setCompania(id, compania, adminUser).then(function (entry) {
        upsertEntry(entry);
        notify();
        return { ok: true, entry: entry };
      }).catch(function (err) {
        return cloudError((err && err.message) || 'No se pudo guardar la compañía.');
      });
    });
  }

  function saveConfig(patch) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.saveConfig(patch || {}).then(function (state) {
        applyRemote(state);
        return { ok: true };
      }).catch(function (err) {
        return cloudError((err && err.message) || 'No se pudo guardar la configuración.');
      });
    });
  }

  function resetCounter() {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.resetCounter().then(function () {
        notify();
        return { ok: true };
      }).catch(function () {
        return cloudError('No se pudo reiniciar en la nube.');
      });
    });
  }

  function clearAllHistory() {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.clearAllHistory().then(function () {
        shared.entries = [];
        shared.counter = 0;
        notify();
        return { ok: true };
      }).catch(function () {
        return cloudError('No se pudo borrar el historial en la nube.');
      });
    });
  }

  function getState() {
    return shared;
  }

  function load() {
    notify();
    return shared;
  }

  function init() {
    if (initPromise) return initPromise;
    shared.entries = [];
    shared.counter = 0;
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
      shared.live = true;
      shared.error = '';
      applyRemote(res.data);
      sync.onChange(function (kind, data) {
        if (kind === 'sync' && data) {
          shared.live = true;
          shared.error = '';
          applyRemote(data);
        }
      });
      return migrateLocalOnce(sync).then(function () { return shared; });
    });

    return initPromise;
  }

  function validateTurn(id, adminUser, opts) {
    return init().then(function () {
      var sync = Sync();
      if (!sync || !shared.live) return cloudError(shared.error);
      return sync.validateTurn(id, adminUser, opts).then(function (entry) {
        upsertEntry(entry);
        C().playBeep();
        notify();
        return { ok: true, entry: entry };
      }).catch(function (err) {
        return cloudError((err && err.message) || 'No se pudo validar la solicitud.');
      });
    });
  }

  function rejectSolicitud(id, adminUser) {
    return setEstado(id, 'CANCELADO', adminUser || 'supervisor');
  }

  global.PlatformTurnosStore = {
    load: load,
    init: init,
    subscribe: subscribe,
    addTurn: addTurn,
    validateTurn: validateTurn,
    rejectSolicitud: rejectSolicitud,
    setEstado: setEstado,
    convocarChofer: convocarChofer,
    cancelTurn: cancelTurn,
    setHoraLimite: setHoraLimite,
    setCompania: setCompania,
    saveConfig: saveConfig,
    resetCounter: resetCounter,
    clearAllHistory: clearAllHistory,
    getState: getState,
    findById: findById,
    findActiveByChofer: findActiveByChofer
  };
})(typeof window !== 'undefined' ? window : this);
