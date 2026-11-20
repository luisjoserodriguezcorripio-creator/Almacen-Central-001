/**
 * Agenda operativa — store en memoria + localStorage + sync
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformAgendaCore; };
  var Sync = function () { return global.PlatformAgendaSync; };
  var LS_KEY = 'almacen_agenda_state_v2';
  var LS_SEED_REV = 'almacen_agenda_seed_rev_v2';
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

  function readLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return C().normalizeState(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function writeLocal(state) {
    try {
      var payload = C().normalizeState(state);
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e) { /* noop */ }
  }

  function preferRicher(a, b) {
    var na = a && a.templates ? a.templates.length : 0;
    var nb = b && b.templates ? b.templates.length : 0;
    if (na && !nb) return a;
    if (nb && !na) return b;
    if (!a) return b;
    if (!b) return a;
    var ta = Date.parse(a.updatedAt) || 0;
    var tb = Date.parse(b.updatedAt) || 0;
    // Preferir el que tenga más plantillas; si empatan, el más reciente
    if (nb > na) return b;
    if (na > nb) return a;
    return tb >= ta ? b : a;
  }

  function readSeedRev() {
    try { return localStorage.getItem(LS_SEED_REV) || ''; } catch (e) { return ''; }
  }

  function writeSeedRev(rev) {
    try { if (rev) localStorage.setItem(LS_SEED_REV, rev); } catch (e) { /* noop */ }
  }

  function applyRemote(data, opts) {
    opts = opts || {};
    var incoming = C().normalizeState(data);
    var local = readLocal();
    var next = opts.force ? incoming : preferRicher(incoming, local);
    if (!opts.force && (!next.templates || !next.templates.length) && local && local.templates && local.templates.length) {
      next = local;
    }
    shared.state = next;
    if (!opts.skipPersist && next.templates && next.templates.length) {
      writeLocal(next);
    }
    shared.error = '';
    notify();
  }

  function applySeedPayload(seed, opts) {
    opts = opts || {};
    if (seed && seed.puestos && seed.puestos.length) C().applyPuestos(seed.puestos);
    var daily = (shared.state && shared.state.daily) || {};
    applyRemote({
      version: seed && seed.version || 2,
      templates: (seed && seed.templates) || [],
      daily: daily,
      updatedAt: (seed && seed.updatedAt) || new Date().toISOString()
    }, { force: !!opts.force });
    if (seed && seed.revision) writeSeedRev(seed.revision);
  }

  function persistAndMaybePush(state) {
    var next = C().normalizeState(state);
    next.updatedAt = new Date().toISOString();
    shared.state = next;
    writeLocal(next);
    notify();
    var sync = Sync();
    if (!sync || !sync.pushState) return Promise.resolve({ ok: true, local: true });
    return sync.pushState(next).then(function () {
      shared.live = !!sync.isLive();
      notify();
      return { ok: true };
    }).catch(function () {
      shared.live = false;
      shared.error = 'Guardado local. Nube no disponible.';
      notify();
      return { ok: true, local: true };
    });
  }

  function init() {
    if (initPromise) return initPromise;
    var cached = readLocal();
    shared.state = cached || C().normalizeState(null);
    shared.live = false;
    shared.error = '';
    notify();

    function ensureSeedApplied() {
      return C().loadSeed().then(function (seed) {
        var rev = seed.revision || '';
        var known = readSeedRev();
        var empty = !shared.state.templates || !shared.state.templates.length;
        var stale = !!(rev && rev !== known);
        if (empty || stale || (seed.puestos && seed.puestos.length && !C().PUESTOS.length)) {
          applySeedPayload(seed, { force: empty || stale });
        } else if (seed.puestos && seed.puestos.length) {
          C().applyPuestos(seed.puestos);
        }
        return shared;
      });
    }

    var sync = Sync();
    if (!sync) {
      initPromise = ensureSeedApplied().then(function () {
        shared.error = 'Modo local — plantillas cargadas.';
        notify();
        return shared;
      });
      return initPromise;
    }

    initPromise = sync.ready().then(function (res) {
      shared.live = !!(res && res.ok && !res.degraded && !res.local);
      if (res && res.data && res.data.templates && res.data.templates.length) {
        applyRemote(res.data);
      }
      return ensureSeedApplied().then(function () {
        if (res && (res.degraded || res.local)) {
          shared.error = 'Modo local — checklist activo.';
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
      });
    }).catch(function () {
      return ensureSeedApplied().then(function () {
        shared.live = false;
        shared.error = 'Modo local.';
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
    var name = user && (user.name || user.username);
    if (sync && sync.updateTaskProgress) {
      return sync.updateTaskProgress(dayKey, puestoId, taskId, patch, name).then(function (rec) {
        // Mantener copia local también
        var st = C().normalizeState(shared.state);
        var tasks = C().ensurePuestoBucket(st, dayKey, puestoId);
        tasks[taskId] = rec;
        writeLocal(st);
        shared.state = st;
        notify();
        return { ok: true, progress: rec };
      }).catch(function (err) {
        return { ok: false, msg: (err && err.message) || 'No se pudo guardar.' };
      });
    }
    return Promise.resolve({ ok: false, msg: 'Sin sync' });
  }

  function pullFresh() {
    return C().loadSeed().then(function (seed) {
      applySeedPayload(seed, { force: true });
      var sync = Sync();
      if (!sync || !sync.pullState) {
        shared.live = false;
        notify();
        return shared;
      }
      return sync.pullState().then(function (data) {
        // No dejar que una nube vacía/vieja pise el seed nuevo
        if (data && data.templates && data.templates.length) {
          var localN = shared.state && shared.state.templates ? shared.state.templates.length : 0;
          if (data.templates.length >= localN) applyRemote(data);
        }
        shared.live = !!sync.isLive();
        notify();
        return shared;
      }).catch(function () { return shared; });
    });
  }

  function saveTemplates(templates, user) {
    if (!C().canEditActivities(user)) {
      return Promise.resolve({ ok: false, msg: 'Solo el administrador puede editar actividades.' });
    }
    var st = C().normalizeState(shared.state);
    st.templates = (templates || []).map(C().normalizeTemplate).filter(Boolean);
    st.updatedAt = new Date().toISOString();
    st.updatedBy = user && (user.name || user.username) || '';
    return persistAndMaybePush(st).then(function (res) {
      return { ok: true, local: !!(res && res.local), count: st.templates.length };
    });
  }

  function upsertTemplate(template, user) {
    if (!C().canEditActivities(user)) {
      return Promise.resolve({ ok: false, msg: 'Solo el administrador puede editar actividades.' });
    }
    var st = C().normalizeState(shared.state);
    var t = C().normalizeTemplate(template);
    if (!t) return Promise.resolve({ ok: false, msg: 'Actividad inválida' });
    var list = st.templates.slice();
    var idx = -1;
    list.forEach(function (x, i) { if (x.id === t.id) idx = i; });
    if (idx >= 0) list[idx] = t;
    else list.push(t);
    return saveTemplates(list, user);
  }

  function removeTemplate(taskId, user) {
    if (!C().canEditActivities(user)) {
      return Promise.resolve({ ok: false, msg: 'Solo el administrador puede editar actividades.' });
    }
    var st = C().normalizeState(shared.state);
    var list = st.templates.filter(function (t) { return t.id !== taskId; });
    return saveTemplates(list, user);
  }

  global.PlatformAgendaStore = {
    init: init,
    subscribe: subscribe,
    getState: getState,
    updateTask: updateTask,
    pullFresh: pullFresh,
    saveTemplates: saveTemplates,
    upsertTemplate: upsertTemplate,
    removeTemplate: removeTemplate
  };
})(typeof window !== 'undefined' ? window : this);
