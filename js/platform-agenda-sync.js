/**
 * Agenda operativa — sync nube (Supabase) + seed local de respaldo
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
  var cachedSeed = null;
  var seedPromise = null;

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

  function loadSeedCached() {
    if (cachedSeed && cachedSeed.length) return Promise.resolve(cachedSeed);
    if (seedPromise) return seedPromise;
    seedPromise = C().loadSeedTemplates().then(function (seed) {
      cachedSeed = Array.isArray(seed) ? seed : [];
      seedPromise = null;
      return cachedSeed;
    }).catch(function () {
      seedPromise = null;
      cachedSeed = cachedSeed || [];
      return cachedSeed;
    });
    return seedPromise;
  }

  function mergeSeedIfEmpty(state, seedTemplates) {
    var next = normalizeSnapshot(state);
    if (next.templates && next.templates.length) return next;
    next.templates = (seedTemplates || cachedSeed || []).slice();
    if (!next.updatedAt) next.updatedAt = new Date().toISOString();
    return next;
  }

  function withSeed(state) {
    return loadSeedCached().then(function (seed) {
      return mergeSeedIfEmpty(state, seed);
    });
  }

  function pullState() {
    var B = Bridge();
    if (!B || !B.isEnabled || !B.isEnabled()) {
      return withSeed(null).then(function (local) {
        live = false;
        return local;
      });
    }
    return B.pull(MODULE).then(function (data) {
      live = true;
      return withSeed(data);
    }).catch(function () {
      live = false;
      return withSeed(null);
    });
  }

  function pushState(state) {
    var B = Bridge();
    if (!B || !B.isEnabled || !B.isEnabled()) {
      return Promise.reject(new Error('Sin Supabase'));
    }
    return withSeed(state).then(function (payload) {
      if (!payload.templates || !payload.templates.length) {
        throw new Error('Plantillas de agenda vacías — no se publica para no borrar el checklist');
      }
      payload.updatedAt = new Date().toISOString();
      return B.push(MODULE, payload).then(function (ok) {
        if (!ok) throw new Error('No se pudo guardar en la nube');
        live = true;
        return payload;
      });
    });
  }

  function subscribeRealtime() {
    var B = Bridge();
    if (!B || !B.subscribe || !B.isEnabled || !B.isEnabled()) return;
    if (unsub) unsub();
    unsub = B.subscribe(MODULE, function (remote) {
      if (!remote) return;
      live = true;
      withSeed(remote).then(function (merged) {
        notify('sync', merged);
      });
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    var B = Bridge();

    readyPromise = loadSeedCached().then(function (seed) {
      if (!B || !B.ensureReady) {
        return { ok: true, local: true, degraded: true, data: mergeSeedIfEmpty(null, seed) };
      }
      return B.ensureReady().then(function () {
        if (!B.isEnabled || !B.isEnabled()) {
          return { ok: true, local: true, degraded: true, data: mergeSeedIfEmpty(null, seed) };
        }
        return pullState().then(function (remote) {
          var merged = mergeSeedIfEmpty(remote, seed);
          var needsPush = !remote || !remote.templates || !remote.templates.length;
          var chain = needsPush
            ? pushState(merged).then(function () { return merged; }).catch(function () { return merged; })
            : Promise.resolve(merged);
          return chain.then(function (data) {
            subscribeRealtime();
            return { ok: true, data: data, degraded: !live };
          });
        }).catch(function () {
          subscribeRealtime();
          return { ok: true, data: mergeSeedIfEmpty(null, seed), degraded: true };
        });
      }).catch(function () {
        return { ok: true, local: true, degraded: true, data: mergeSeedIfEmpty(null, seed) };
      });
    });

    return readyPromise;
  }

  function updateTaskProgress(dayKey, puestoId, taskId, patch, userName) {
    return pullState().then(function (state) {
      return withSeed(state).then(function (safe) {
        var tasks = C().ensurePuestoBucket(safe, dayKey, puestoId);
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

        var B = Bridge();
        if (!B || !B.isEnabled || !B.isEnabled()) {
          notify('sync', safe);
          return rec;
        }
        return pushState(safe).then(function () {
          notify('sync', safe);
          return rec;
        });
      });
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
    mergeSeedIfEmpty: mergeSeedIfEmpty,
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
