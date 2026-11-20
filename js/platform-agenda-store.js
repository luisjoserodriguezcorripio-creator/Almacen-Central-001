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

  function mergeDaily(a, b) {
    var out = {};
    function absorb(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (day) {
        if (!out[day]) out[day] = {};
        var daySrc = src[day] || {};
        Object.keys(daySrc).forEach(function (puesto) {
          if (!out[day][puesto]) out[day][puesto] = { tasks: {} };
          if (!out[day][puesto].tasks) out[day][puesto].tasks = {};
          var srcBucket = daySrc[puesto] || {};
          var tasks = srcBucket.tasks || {};
          Object.keys(tasks).forEach(function (taskId) {
            var cur = out[day][puesto].tasks[taskId];
            var incoming = tasks[taskId];
            if (!cur) {
              out[day][puesto].tasks[taskId] = incoming;
              return;
            }
            var ta = Date.parse(cur.updatedAt) || 0;
            var tb = Date.parse(incoming && incoming.updatedAt) || 0;
            if (tb >= ta) out[day][puesto].tasks[taskId] = incoming;
          });
          var outSavedAt = Date.parse(out[day][puesto].savedAt) || 0;
          var srcSavedAt = Date.parse(srcBucket.savedAt) || 0;
          if (srcBucket.saved && srcSavedAt >= outSavedAt) {
            out[day][puesto].saved = true;
            out[day][puesto].savedAt = srcBucket.savedAt;
            out[day][puesto].savedBy = srcBucket.savedBy || '';
          } else if (out[day][puesto].saved) {
            /* keep existing */
          } else if (srcBucket.saved) {
            out[day][puesto].saved = true;
            out[day][puesto].savedAt = srcBucket.savedAt || '';
            out[day][puesto].savedBy = srcBucket.savedBy || '';
          }
        });
      });
    }
    absorb(a);
    absorb(b);
    return out;
  }

  function applyRemote(data, opts) {
    opts = opts || {};
    var incoming = C().normalizeState(data);
    var local = readLocal();
    var mem = shared.state ? C().normalizeState(shared.state) : null;
    var next = opts.force ? incoming : preferRicher(incoming, preferRicher(local, mem));
    if (!opts.force && (!next.templates || !next.templates.length) && local && local.templates && local.templates.length) {
      next = local;
    }
    // Conservar avance diario: fusionar memoria + local + entrante
    next.daily = mergeDaily(mergeDaily(mem && mem.daily, local && local.daily), incoming.daily);
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
    var localSnap = readLocal();
    var daily = mergeDaily(
      (shared.state && shared.state.daily) || {},
      (localSnap && localSnap.daily) || {}
    );
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

  function applyTaskPatch(rec, patch, userName) {
    var prevEstado = C().normalizeEstado(rec.estado);
    if (patch.estado) rec.estado = C().normalizeEstado(patch.estado);
    if (patch.comentarios !== undefined) rec.comentarios = String(patch.comentarios || '');
    if (patch.horaEjecucion !== undefined) rec.horaEjecucion = String(patch.horaEjecucion || '');
    rec.updatedAt = new Date().toISOString();
    rec.updatedBy = String(userName || '');
    rec.history = Array.isArray(rec.history) ? rec.history.slice() : [];
    if (patch.estado && patch.estado !== prevEstado) {
      rec.history.push({
        from: prevEstado,
        to: patch.estado,
        at: rec.updatedAt,
        by: rec.updatedBy
      });
      if (patch.estado === C().ESTADO_COMPLETADO && !rec.horaEjecucion) {
        rec.horaEjecucion = C().formatClockTime().slice(0, 5);
      }
      if (patch.estado !== C().ESTADO_COMPLETADO && prevEstado === C().ESTADO_COMPLETADO) {
        rec.horaEjecucion = '';
      }
    }
    return rec;
  }

  function updateTask(dayKey, puestoId, taskId, patch, user) {
    if (!dayKey || !puestoId || !taskId) {
      return Promise.resolve({ ok: false, msg: 'Falta fecha, persona o actividad.' });
    }
    var name = user && (user.name || user.username);
    // Actualizar SIEMPRE sobre el estado en memoria (no re-seed vacío).
    var st = C().normalizeState(shared.state || readLocal() || null);
    var tasks = C().ensurePuestoBucket(st, dayKey, puestoId);
    var rec = applyTaskPatch(
      Object.assign({}, tasks[taskId] || C().emptyTaskProgress()),
      patch || {},
      name
    );
    tasks[taskId] = rec;
    st.updatedAt = new Date().toISOString();
    st.updatedBy = name || '';
    shared.state = st;
    writeLocal(st);
    notify();

    var sync = Sync();
    if (sync && sync.pushState) {
      return sync.pushState(st).then(function () {
        shared.live = !!sync.isLive();
        shared.error = '';
        notify();
        return { ok: true, progress: rec, local: !shared.live };
      }).catch(function () {
        shared.live = false;
        shared.error = 'Guardado local. Nube no disponible.';
        notify();
        return { ok: true, progress: rec, local: true };
      });
    }
    return Promise.resolve({ ok: true, progress: rec, local: true });
  }

  function saveAudit(dayKey, puestoId, user, commentMap) {
    if (!dayKey || !puestoId) {
      return Promise.resolve({ ok: false, msg: 'Falta fecha o persona.' });
    }
    var name = user && (user.name || user.username) || '';
    var st = C().normalizeState(shared.state || readLocal() || null);
    var bucket = C().ensurePuestoDay(st, dayKey, puestoId);
    var tasks = bucket.tasks;
    if (commentMap && typeof commentMap === 'object') {
      Object.keys(commentMap).forEach(function (taskId) {
        var rec = Object.assign({}, tasks[taskId] || C().emptyTaskProgress());
        rec.comentarios = String(commentMap[taskId] || '');
        rec.updatedAt = new Date().toISOString();
        rec.updatedBy = name;
        tasks[taskId] = rec;
      });
    }
    bucket.saved = true;
    bucket.savedAt = new Date().toISOString();
    bucket.savedBy = name;
    st.updatedAt = bucket.savedAt;
    st.updatedBy = name;
    shared.state = st;
    writeLocal(st);
    notify();

    var sync = Sync();
    if (sync && sync.pushState) {
      return sync.pushState(st).then(function () {
        shared.live = !!sync.isLive();
        shared.error = '';
        notify();
        return { ok: true, savedAt: bucket.savedAt, local: !shared.live };
      }).catch(function () {
        shared.live = false;
        shared.error = 'Guardado local. Nube no disponible.';
        notify();
        return { ok: true, savedAt: bucket.savedAt, local: true };
      });
    }
    return Promise.resolve({ ok: true, savedAt: bucket.savedAt, local: true });
  }

  function pullFresh() {
    var sync = Sync();
    return C().loadSeed().then(function (seed) {
      if (seed && seed.puestos && seed.puestos.length) C().applyPuestos(seed.puestos);
      if (!sync || !sync.pullState) {
        applySeedPayload(seed, { force: false });
        shared.live = false;
        notify();
        return shared;
      }
      return sync.pullState().then(function (remote) {
        var merged = sync.mergeAgendaStates
          ? sync.mergeAgendaStates(remote, shared.state)
          : remote;
        if ((!merged.templates || !merged.templates.length) && seed && seed.templates) {
          merged.templates = seed.templates;
        }
        applyRemote(merged, { force: false });
        shared.live = !!sync.isLive();
        // Si esta PC tiene avance y la nube estaba vacía, publicar
        if (sync.pushState && shared.state) {
          return sync.pushState(shared.state).then(function () {
            shared.live = true;
            notify();
            return shared;
          }).catch(function () {
            notify();
            return shared;
          });
        }
        notify();
        return shared;
      }).catch(function () {
        applySeedPayload(seed, { force: false });
        return shared;
      });
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
    saveAudit: saveAudit,
    pullFresh: pullFresh,
    saveTemplates: saveTemplates,
    upsertTemplate: upsertTemplate,
    removeTemplate: removeTemplate,
    mergeDaily: mergeDaily
  };
})(typeof window !== 'undefined' ? window : this);
