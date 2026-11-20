/**
 * Agenda operativa — sync nube via Firebase RTDB (+ seed local de respaldo)
 */
(function (global) {
  'use strict';

  var MODULE = 'agenda';
  var FB_PATH = 'agenda/snapshot';
  var C = function () { return global.PlatformAgendaCore; };
  var FB = function () { return global.PlatformFirebaseBridge; };
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var live = false;
  var cachedSeed = null;
  var seedPromise = null;
  var pushing = false;
  var pendingPush = null;

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

  function countDailyTasks(daily) {
    var n = 0;
    if (!daily || typeof daily !== 'object') return 0;
    Object.keys(daily).forEach(function (day) {
      var puestos = daily[day] || {};
      Object.keys(puestos).forEach(function (puesto) {
        var tasks = puestos[puesto] && puestos[puesto].tasks;
        if (tasks) n += Object.keys(tasks).length;
        if (puestos[puesto] && puestos[puesto].saved) n += 10;
      });
    });
    return n;
  }

  function mergeAgendaStates(a, b) {
    var left = normalizeSnapshot(a);
    var right = normalizeSnapshot(b);
    var templates = (left.templates && left.templates.length)
      ? left.templates
      : (right.templates || []);
    if (right.templates && right.templates.length > templates.length) {
      templates = right.templates;
    }
    var Store = global.PlatformAgendaStore;
    var daily = left.daily || {};
    if (Store && Store.mergeDaily) {
      daily = Store.mergeDaily(left.daily, right.daily);
    } else {
      // fallback simple
      daily = Object.assign({}, left.daily || {}, right.daily || {});
    }
    var ta = Date.parse(left.updatedAt) || 0;
    var tb = Date.parse(right.updatedAt) || 0;
    return {
      version: Math.max(Number(left.version) || 1, Number(right.version) || 1),
      templates: templates,
      daily: daily,
      updatedAt: ta >= tb ? (left.updatedAt || right.updatedAt || '') : (right.updatedAt || left.updatedAt || ''),
      updatedBy: ta >= tb ? (left.updatedBy || '') : (right.updatedBy || '')
    };
  }

  function firebaseEnabled() {
    var bridge = FB();
    return !!(bridge && bridge.ensureReady);
  }

  function pullState() {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) {
      return withSeed(null).then(function (local) {
        live = false;
        return local;
      });
    }
    return bridge.ensureReady().then(function () {
      return bridge.pull(FB_PATH);
    }).then(function (data) {
      live = !!(data && (data.templates || data.daily));
      return withSeed(data);
    }).catch(function () {
      live = false;
      return withSeed(null);
    });
  }

  function pushState(state) {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) {
      return Promise.reject(new Error('Sin Firebase'));
    }
    pendingPush = state;
    if (pushing) {
      return Promise.resolve(state);
    }
    pushing = true;

    function flush() {
      var payload = pendingPush;
      pendingPush = null;
      return withSeed(payload).then(function (safe) {
        if (!safe.templates || !safe.templates.length) {
          throw new Error('Plantillas de agenda vacías — no se publica');
        }
        safe.updatedAt = new Date().toISOString();
        return bridge.ensureReady().then(function () {
          return bridge.push(FB_PATH, safe);
        }).then(function (ok) {
          if (!ok) throw new Error('No se pudo guardar Agenda en Firebase');
          live = true;
          notify('sync', safe);
          return safe;
        });
      }).finally(function () {
        pushing = false;
        if (pendingPush) return flush();
      });
    }

    return flush();
  }

  function subscribeRealtime() {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) return;
    if (unsub) {
      try { unsub(); } catch (e) { /* noop */ }
      unsub = null;
    }
    bridge.ensureReady().then(function (db) {
      if (!db || !db.ref) {
        // REST adapter via bridge.ref
        if (bridge.ref) {
          var r = bridge.ref(FB_PATH);
          r.on('value', function (snap) {
            var val = snap && snap.val ? snap.val() : null;
            if (!val) return;
            live = true;
            withSeed(val).then(function (merged) {
              notify('sync', merged);
            });
          });
          unsub = function () { /* poller managed by bridge */ };
        }
        return;
      }
      var ref = db.ref(FB_PATH);
      var handler = function (snap) {
        var val = snap && snap.val ? snap.val() : null;
        if (!val) return;
        live = true;
        withSeed(val).then(function (merged) {
          notify('sync', merged);
        });
      };
      ref.on('value', handler);
      unsub = function () {
        try { ref.off('value', handler); } catch (e) { /* noop */ }
      };
    });
  }

  function currentStoreState() {
    var Store = global.PlatformAgendaStore;
    if (Store && Store.getState) {
      var snap = Store.getState();
      if (snap && snap.state) return C().normalizeState(snap.state);
    }
    return null;
  }

  function ready() {
    if (readyPromise) return readyPromise;

    readyPromise = loadSeedCached().then(function (seed) {
      if (!firebaseEnabled()) {
        return { ok: true, local: true, degraded: true, data: mergeSeedIfEmpty(null, seed) };
      }
      return pullState().then(function (remote) {
        var local = currentStoreState();
        var merged = mergeAgendaStates(remote, local || mergeSeedIfEmpty(null, seed));
        merged = mergeSeedIfEmpty(merged, seed);

        var remoteDaily = countDailyTasks(remote && remote.daily);
        var localDaily = countDailyTasks(local && local.daily);
        var cloudEmpty = !remote || !remote.templates || !remote.templates.length;
        var localHasProgress = localDaily > remoteDaily;

        var chain = (cloudEmpty || localHasProgress)
          ? pushState(merged).then(function () { return merged; }).catch(function () { return merged; })
          : Promise.resolve(merged);

        return chain.then(function (data) {
          live = true;
          subscribeRealtime();
          return { ok: true, data: data, degraded: false };
        });
      }).catch(function () {
        subscribeRealtime();
        return { ok: true, data: mergeSeedIfEmpty(null, seed), degraded: true, local: true };
      });
    });

    return readyPromise;
  }

  function updateTaskProgress(dayKey, puestoId, taskId, patch, userName) {
    var base = currentStoreState();
    return withSeed(base).then(function (safe) {
      if (base && base.daily) safe.daily = base.daily;
      var tasks = C().ensurePuestoBucket(safe, dayKey, puestoId);
      var rec = Object.assign({}, tasks[taskId] || C().emptyTaskProgress());
      var prevEstado = C().normalizeEstado(rec.estado);
      if (patch.estado) rec.estado = C().normalizeEstado(patch.estado);
      if (patch.comentarios !== undefined) rec.comentarios = String(patch.comentarios || '');
      if (patch.horaEjecucion !== undefined) rec.horaEjecucion = String(patch.horaEjecucion || '');
      rec.updatedAt = new Date().toISOString();
      rec.updatedBy = String(userName || '');
      rec.history = Array.isArray(rec.history) ? rec.history.slice() : [];
      if (patch.estado && rec.estado !== prevEstado) {
        rec.history.push({
          from: prevEstado,
          to: rec.estado,
          at: rec.updatedAt,
          by: rec.updatedBy
        });
        if (rec.estado === C().ESTADO_COMPLETADO && !rec.horaEjecucion) {
          rec.horaEjecucion = C().formatClockTime().slice(0, 5);
        }
        if (rec.estado !== C().ESTADO_COMPLETADO && prevEstado === C().ESTADO_COMPLETADO) {
          rec.horaEjecucion = '';
        }
      }
      tasks[taskId] = rec;
      safe.updatedAt = rec.updatedAt;
      return pushState(safe).then(function () {
        return rec;
      }).catch(function () {
        notify('sync', safe);
        return rec;
      });
    });
  }

  function teardown() {
    if (unsub) {
      try { unsub(); } catch (e) { /* noop */ }
    }
    unsub = null;
  }

  global.PlatformAgendaSync = {
    MODULE: MODULE,
    FB_PATH: FB_PATH,
    ready: ready,
    pullState: pullState,
    pushState: pushState,
    updateTaskProgress: updateTaskProgress,
    onChange: onChange,
    isLive: function () { return live; },
    mergeSeedIfEmpty: mergeSeedIfEmpty,
    mergeAgendaStates: mergeAgendaStates,
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
