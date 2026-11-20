/**
 * Recepción — sync en vivo via Firebase RTDB (portal ↔ pantallas TV)
 * Cola confiable: nunca descarta cambios pendientes.
 */
(function (global) {
  'use strict';

  var FB_PATH = 'recepcion/snapshot';
  var FB = function () { return global.PlatformFirebaseBridge; };
  var Store = function () { return global.PlatformRecepcionStore; };
  var Rel = function () { return global.PlatformSyncReliable; };

  var readyPromise = null;
  var live = false;
  var unsub = null;
  var applyingRemote = false;
  var lastPushAt = 0;
  var lastRemoteSig = '';
  var pushQueue = null;
  var stopWatchdog = null;

  function asArray(v) {
    return Rel() && Rel().asArray ? Rel().asArray(v) : (Array.isArray(v) ? v : []);
  }

  function notifyLocal(data) {
    try {
      global.dispatchEvent(new CustomEvent('recepcion-updated', {
        detail: { data: data, at: new Date().toISOString(), source: 'cloud' }
      }));
    } catch (e) { /* noop */ }
    try {
      global.dispatchEvent(new CustomEvent('recepcion-live-board', {
        detail: { share: data && data.liveShareBoard, at: new Date().toISOString(), source: 'cloud' }
      }));
    } catch (e) { /* noop */ }
  }

  function firebaseEnabled() {
    var bridge = FB();
    return !!(bridge && bridge.ensureReady);
  }

  function slimContenedor(c) {
    if (!c) return null;
    return {
      id: c.id,
      registro: c.registro,
      fecha: c.fecha,
      contenedor: c.contenedor,
      tipo: c.tipo,
      division: c.division,
      descripcion: c.descripcion,
      paletas: c.paletas,
      muelle: c.muelle,
      descargado: c.descargado,
      validado: c.validado,
      entrada: c.entrada,
      ubicado: c.ubicado,
      atDescargado: c.atDescargado,
      atValidado: c.atValidado,
      atEntrada: c.atEntrada,
      atUbicado: c.atUbicado,
      operadorDescarga: c.operadorDescarga,
      validadorPor: c.validadorPor,
      entradaPor: c.entradaPor,
      ubicadorPor: c.ubicadorPor,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    };
  }

  function slimPlanilla(p) {
    if (!p) return null;
    var rows = asArray(p.rows);
    if (!rows.length && !p.headers) return null;
    return {
      monthKey: p.monthKey || '',
      fileName: p.fileName || '',
      uploadedAt: p.uploadedAt || '',
      uploadedBy: p.uploadedBy || '',
      sheet: p.sheet || 'Reporte Diario',
      headers: asArray(p.headers).length ? asArray(p.headers) : (p.headers || []).slice(),
      rows: rows.map(function (r) {
        return {
          values: asArray(r.values).length ? asArray(r.values) : (r.values || []).slice(),
          fechaKey: r.fechaKey || '',
          fechaLlegadaKey: r.fechaLlegadaKey || '',
          fechaDescargaKey: r.fechaDescargaKey || ''
        };
      })
    };
  }

  function mergeContenedores(localList, remoteList) {
    var map = Object.create(null);
    asArray(localList).forEach(function (c) {
      if (c && c.id) map[c.id] = c;
    });
    asArray(remoteList).forEach(function (c) {
      if (!c || !c.id) return;
      var prev = map[c.id];
      if (!prev) {
        map[c.id] = c;
        return;
      }
      var tL = Date.parse(prev.updatedAt) || 0;
      var tR = Date.parse(c.updatedAt) || 0;
      map[c.id] = tR >= tL ? Object.assign({}, prev, c) : Object.assign({}, c, prev);
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function buildCloudPayload(data) {
    data = data || (Store() && Store().load ? Store().load() : null) || {};
    return {
      module: 'recepcion',
      version: 1,
      updatedAt: data.updatedAt || new Date().toISOString(),
      liveShareBoard: data.liveShareBoard && data.liveShareBoard.active
        ? {
          active: true,
          updatedAt: data.liveShareBoard.updatedAt || data.updatedAt || '',
          sharedBy: data.liveShareBoard.sharedBy || '—'
        }
        : null,
      planilla: slimPlanilla(data.planilla),
      contenedores: asArray(data.contenedores).map(slimContenedor).filter(Boolean)
    };
  }

  function signature(payload) {
    try {
      return JSON.stringify({
        updatedAt: payload && payload.updatedAt,
        live: !!(payload && payload.liveShareBoard && payload.liveShareBoard.active),
        planillaAt: payload && payload.planilla && payload.planilla.uploadedAt,
        rows: payload && payload.planilla && payload.planilla.rows
          ? asArray(payload.planilla.rows).length
          : 0,
        cont: payload && payload.contenedores ? asArray(payload.contenedores).length : 0
      });
    } catch (e) {
      return String(Date.now());
    }
  }

  function ensureQueue() {
    if (pushQueue) return pushQueue;
    if (!Rel() || !Rel().createPushQueue) {
      // fallback mínimo
      pushQueue = {
        enqueue: function () { pushNow(); },
        forceNow: function () { return pushNow(); },
        hasPending: function () { return false; },
        getLastOkAt: function () { return lastPushAt; }
      };
      return pushQueue;
    }
    pushQueue = Rel().createPushQueue({
      name: 'recepcion',
      isBlocked: function () { return applyingRemote; },
      getPayload: function () {
        return Store() && Store().load ? Store().load() : null;
      },
      pushFn: function (data) {
        return doPush(data);
      },
      retryMs: 350,
      maxRetryMs: 10000
    });
    return pushQueue;
  }

  function doPush(data) {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) return Promise.resolve(false);
    var payload = buildCloudPayload(data);
    return bridge.ensureReady().then(function () {
      return bridge.push(FB_PATH, payload);
    }).then(function (ok) {
      if (ok) {
        live = true;
        lastPushAt = Date.now();
        lastRemoteSig = signature(payload);
      }
      return !!ok;
    }).catch(function () {
      return false;
    });
  }

  function pushNow(data) {
    ensureQueue();
    if (data && Store() && Store().save && !applyingRemote) {
      // no re-guardar; solo encolar con payload actual
    }
    return ensureQueue().forceNow();
  }

  function schedulePush() {
    ensureQueue().enqueue('local-change');
  }

  function applyRemote(remote) {
    var store = Store();
    if (!store || !remote || typeof remote !== 'object') return false;
    if (!remote.planilla && !asArray(remote.contenedores).length && !remote.liveShareBoard) {
      return false;
    }
    var remoteSig = signature(remote);
    if (remoteSig === lastRemoteSig && Date.now() - lastPushAt < 1200) return false;

    applyingRemote = true;
    var localHadExtra = false;
    try {
      var local = store.load();
      var localTs = Date.parse(local.updatedAt) || 0;
      var remoteTs = Date.parse(remote.updatedAt) || 0;
      if (lastPushAt && remoteTs && remoteTs + 80 < lastPushAt && localTs >= remoteTs) {
        localHadExtra = true;
        return false;
      }

      var remoteCont = asArray(remote.contenedores);
      var mergedCont = mergeContenedores(local.contenedores, remoteCont);
      var next = Object.assign({}, local, {
        updatedAt: remoteTs >= localTs ? (remote.updatedAt || local.updatedAt) : local.updatedAt,
        liveShareBoard: remote.liveShareBoard != null ? remote.liveShareBoard : local.liveShareBoard,
        planilla: slimPlanilla(remote.planilla) || local.planilla || null,
        contenedores: mergedCont
      });
      if (remote.planilla && !mergedCont.length && store.mapPlanillaToContenedores) {
        next.contenedores = store.mapPlanillaToContenedores(remote.planilla);
      }

      // Si el local tenía más contenedores/planilla reciente, re-empujar
      var localSig = signature(buildCloudPayload(local));
      var nextSig = signature(buildCloudPayload(next));
      localHadExtra = localSig !== remoteSig && nextSig !== remoteSig;

      store.save(next, { silent: true, keepUpdatedAt: true, skipCloud: true });
      lastRemoteSig = signature(buildCloudPayload(next));
      live = true;
      notifyLocal(next);
      return true;
    } finally {
      applyingRemote = false;
      if (localHadExtra) schedulePush();
    }
  }

  function pull() {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) return Promise.resolve(false);
    return bridge.ensureReady().then(function () {
      return bridge.pull(FB_PATH);
    }).then(function (data) {
      if (!data) {
        live = false;
        return false;
      }
      return applyRemote(data);
    }).catch(function () {
      live = false;
      return false;
    });
  }

  function subscribe() {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) return;
    if (unsub) {
      try { unsub(); } catch (e) { /* noop */ }
      unsub = null;
    }
    bridge.ensureReady().then(function (db) {
      function onVal(snap) {
        var val = snap && typeof snap.val === 'function' ? snap.val() : snap;
        if (!val) return;
        applyRemote(val);
      }
      if (db && db.ref && bridge.isRestMode && !bridge.isRestMode()) {
        var ref = db.ref(FB_PATH);
        ref.on('value', onVal);
        unsub = function () {
          try { ref.off('value', onVal); } catch (e) { /* noop */ }
        };
        return;
      }
      if (bridge.ref) {
        var r = bridge.ref(FB_PATH);
        r.on('value', onVal);
        unsub = function () { /* poller managed by bridge */ };
      }
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    ensureQueue();
    if (Rel() && Rel().attachWatchdog) {
      stopWatchdog = Rel().attachWatchdog({ queue: pushQueue, intervalMs: 10000 });
    }
    readyPromise = pull().then(function (ok) {
      subscribe();
      if (Store() && Store().load) {
        var local = Store().load();
        if ((local.planilla && asArray(local.planilla.rows).length) ||
            asArray(local.contenedores).length ||
            (local.liveShareBoard && local.liveShareBoard.active)) {
          schedulePush();
        }
      }
      return !!ok;
    }).catch(function () {
      subscribe();
      schedulePush();
      return false;
    });
    return readyPromise;
  }

  function isLive() {
    return !!live || !!(FB() && FB().isConnected && FB().isConnected());
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('recepcion-updated', function (ev) {
      if (ev && ev.detail && ev.detail.source === 'cloud') return;
      schedulePush();
    });
    global.addEventListener('recepcion-live-board', function (ev) {
      if (ev && ev.detail && ev.detail.source === 'cloud') return;
      schedulePush();
    });
  }

  global.PlatformRecepcionSync = {
    FB_PATH: FB_PATH,
    ready: ready,
    pull: pull,
    pushNow: pushNow,
    schedulePush: schedulePush,
    subscribe: subscribe,
    isLive: isLive,
    firebaseEnabled: firebaseEnabled,
    buildCloudPayload: buildCloudPayload
  };
})(typeof window !== 'undefined' ? window : this);
