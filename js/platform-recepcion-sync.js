/**
 * Recepción — sync en vivo via Firebase RTDB (portal ↔ pantallas TV)
 */
(function (global) {
  'use strict';

  var FB_PATH = 'recepcion/snapshot';
  var FB = function () { return global.PlatformFirebaseBridge; };
  var Store = function () { return global.PlatformRecepcionStore; };

  var readyPromise = null;
  var live = false;
  var pushing = false;
  var pendingPush = null;
  var unsub = null;
  var applyingRemote = false;
  var lastPushAt = 0;
  var lastRemoteSig = '';
  var pushTimer = null;

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
    if (!p || !Array.isArray(p.rows)) return null;
    return {
      monthKey: p.monthKey || '',
      fileName: p.fileName || '',
      uploadedAt: p.uploadedAt || '',
      uploadedBy: p.uploadedBy || '',
      sheet: p.sheet || 'Reporte Diario',
      headers: (p.headers || []).slice(),
      rows: (p.rows || []).map(function (r) {
        return {
          values: (r.values || []).slice(),
          fechaKey: r.fechaKey || '',
          fechaLlegadaKey: r.fechaLlegadaKey || '',
          fechaDescargaKey: r.fechaDescargaKey || ''
        };
      })
    };
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
      contenedores: (data.contenedores || []).map(slimContenedor).filter(Boolean)
    };
  }

  function signature(payload) {
    try {
      return JSON.stringify({
        updatedAt: payload && payload.updatedAt,
        live: !!(payload && payload.liveShareBoard && payload.liveShareBoard.active),
        planillaAt: payload && payload.planilla && payload.planilla.uploadedAt,
        rows: payload && payload.planilla && payload.planilla.rows
          ? payload.planilla.rows.length
          : 0,
        cont: payload && payload.contenedores ? payload.contenedores.length : 0
      });
    } catch (e) {
      return String(Date.now());
    }
  }

  function applyRemote(remote) {
    var store = Store();
    if (!store || !remote || typeof remote !== 'object') return false;
    if (!remote.planilla && !(remote.contenedores && remote.contenedores.length) && !remote.liveShareBoard) {
      return false;
    }
    var sig = signature(remote);
    if (sig === lastRemoteSig && Date.now() - lastPushAt < 1500) return false;

    applyingRemote = true;
    try {
      var local = store.load();
      var localTs = Date.parse(local.updatedAt) || 0;
      var remoteTs = Date.parse(remote.updatedAt) || 0;
      // Si acabamos de empujar, no pisar con eco viejo
      if (lastPushAt && remoteTs && remoteTs + 50 < lastPushAt && localTs >= remoteTs) {
        return false;
      }
      var next = Object.assign({}, local, {
        updatedAt: remote.updatedAt || local.updatedAt,
        liveShareBoard: remote.liveShareBoard || null,
        planilla: remote.planilla || local.planilla || null,
        contenedores: Array.isArray(remote.contenedores)
          ? remote.contenedores
          : (local.contenedores || [])
      });
      // Si llega planilla sin contenedores, regenerar desde planilla
      if (remote.planilla && (!remote.contenedores || !remote.contenedores.length) &&
          store.mapPlanillaToContenedores) {
        next.contenedores = store.mapPlanillaToContenedores(remote.planilla);
      }
      store.save(next, { silent: true, keepUpdatedAt: true, skipCloud: true });
      lastRemoteSig = sig;
      live = true;
      notifyLocal(next);
      return true;
    } finally {
      applyingRemote = false;
    }
  }

  function pushNow(data) {
    var bridge = FB();
    if (!bridge || !bridge.ensureReady) return Promise.resolve(false);
    if (applyingRemote) return Promise.resolve(false);
    pendingPush = data || (Store() && Store().load ? Store().load() : null);
    if (pushing) return Promise.resolve(true);

    pushing = true;
    function flush() {
      var payloadData = pendingPush;
      pendingPush = null;
      var payload = buildCloudPayload(payloadData);
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
      }).finally(function () {
        pushing = false;
        if (pendingPush) return flush();
      });
    }
    return flush();
  }

  function schedulePush(data) {
    if (applyingRemote) return;
    pendingPush = data || pendingPush;
    if (pushTimer) return;
    pushTimer = global.setTimeout(function () {
      pushTimer = null;
      pushNow(pendingPush);
    }, 280);
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
      if (db && db.ref && !bridge.isRestMode()) {
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
    readyPromise = pull().then(function (ok) {
      subscribe();
      // Si hay datos locales y nube vacía, publicar
      if (!ok && Store() && Store().load) {
        var local = Store().load();
        if ((local.planilla && local.planilla.rows && local.planilla.rows.length) ||
            (local.contenedores && local.contenedores.length) ||
            (local.liveShareBoard && local.liveShareBoard.active)) {
          return pushNow(local).then(function () { return true; });
        }
      }
      return !!ok;
    }).catch(function () {
      subscribe();
      return false;
    });
    return readyPromise;
  }

  function isLive() {
    return !!live || !!(FB() && FB().isConnected && FB().isConnected());
  }

  // Auto-push cuando el store guarda (si no viene de nube)
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('recepcion-updated', function (ev) {
      if (applyingRemote) return;
      if (ev && ev.detail && ev.detail.source === 'cloud') return;
      var data = ev && ev.detail && ev.detail.data;
      schedulePush(data);
    });
    global.addEventListener('recepcion-live-board', function (ev) {
      if (applyingRemote) return;
      if (ev && ev.detail && ev.detail.source === 'cloud') return;
      schedulePush(Store() && Store().load ? Store().load() : null);
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
