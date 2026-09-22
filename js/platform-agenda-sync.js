/**
 * Agenda operativa — Supabase en vivo (web_snapshots module=agenda)
 */
(function (global) {
  'use strict';

  var MODULE = 'agenda';
  var C = function () { return global.PlatformAgendaCore; };
  var Bridge = function () { return global.PlatformSupabaseBridge; };
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var live = false;

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function normalizeSnapshot(raw) {
    return C().normalizeState(raw);
  }

  function pullState() {
    var B = Bridge();
    if (!B) return Promise.reject(new Error('Sin Supabase'));
    return B.pull(MODULE).then(function (data) {
      live = true;
      return normalizeSnapshot(data);
    });
  }

  function pushState(state) {
    var B = Bridge();
    if (!B) return Promise.reject(new Error('Sin Supabase'));
    var payload = normalizeSnapshot(state);
    payload.updatedAt = new Date().toISOString();
    return B.push(MODULE, payload).then(function (ok) {
      if (!ok) throw new Error('No se pudo guardar en la nube');
      live = true;
      return payload;
    });
  }

  function subscribeRealtime() {
    var B = Bridge();
    if (!B || !B.subscribe) return;
    if (unsub) unsub();
    unsub = B.subscribe(MODULE, function (remote) {
      if (!remote) return;
      live = true;
      notify('sync', normalizeSnapshot(remote));
    });
  }

  function mergeSeedIfEmpty(state, seedTemplates) {
    var next = normalizeSnapshot(state);
    if (next.templates && next.templates.length) return next;
    next.templates = (seedTemplates || []).slice();
    return next;
  }

  function ready() {
    if (readyPromise) return readyPromise;
    var B = Bridge();
    if (!B) {
      return Promise.resolve({ ok: false, local: true, data: normalizeSnapshot(null) });
    }
    readyPromise = B.ensureReady().then(function () {
      if (!B.isEnabled || !B.isEnabled()) {
        return { ok: false, local: true, data: normalizeSnapshot(null) };
      }
      return C().loadSeedTemplates().then(function (seed) {
        return pullState().then(function (remote) {
          var merged = mergeSeedIfEmpty(remote, seed);
          var needsPush = !remote.templates || !remote.templates.length;
          var chain = needsPush ? pushState(merged).then(function () { return merged; }) : Promise.resolve(merged);
          return chain.then(function (data) {
            subscribeRealtime();
            return { ok: true, data: data };
          });
        }).catch(function () {
          var local = mergeSeedIfEmpty(null, seed);
          subscribeRealtime();
          return { ok: true, data: local, degraded: true };
        });
      });
    });
    return readyPromise;
  }

  function updateTaskProgress(dayKey, puestoId, taskId, patch, userName) {
    return pullState().then(function (state) {
      var tasks = C().ensurePuestoBucket(state, dayKey, puestoId);
      var rec = tasks[taskId] || C().emptyTaskProgress();
      var prevEstado = rec.estado;
      if (patch.estado) rec.estado = patch.estado;
      if (patch.comentarios !== undefined) rec.comentarios = String(patch.comentarios || '');
      if (patch.horaEjecucion !== undefined) rec.horaEjecucion = String(patch.horaEjecucion || '');
      rec.updatedAt = new Date().toISOString();
      rec.updatedBy = String(userName || '');
      rec.history = Array.isArray(rec.history) ? rec.history : [];
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
      }
      tasks[taskId] = rec;
      return pushState(state).then(function () { return rec; });
    });
  }

  function teardown() {
    if (unsub) unsub();
    unsub = null;
  }

  global.PlatformAgendaSync = {
    MODULE: MODULE,
    ready: ready,
    pullState: pullState,
    pushState: pushState,
    updateTaskProgress: updateTaskProgress,
    onChange: onChange,
    isLive: function () { return live; },
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
