/**
 * Sincronización en tiempo real — Despacho (operador ↔ validador ↔ pantalla TV)
 * JSONBin + LAN + proxy + GitHub static + Firebase + polling ~1s
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_despacho';
  var pollTimer = null;
  var pushing = false;
  var pendingPush = false;
  var pulling = false;
  var applyingRemote = false;
  var siteConfig = null;
  var publicBase = '';
  var serverReachable = false;
  var lastPullAt = 0;
  var lastAppliedSig = '';
  var lastJsonBinError = 0;
  var lastJsonBinOk = 0;
  var lastPushOkAt = 0;
  var staticPollCounter = 0;
  var firebaseDb = null;
  var firebaseBound = false;
  var warnedJsonBin = false;
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-cloud-live')
    : null;
  var reliableQueue = null;
  var stopWatchdog = null;

  function ensureReliableQueue() {
    if (reliableQueue) return reliableQueue;
    var Rel = global.PlatformSyncReliable;
    if (!Rel || !Rel.createPushQueue) return null;
    reliableQueue = Rel.createPushQueue({
      name: 'despacho',
      isBlocked: function () { return applyingRemote; },
      getPayload: function () { return getLocalData(); },
      pushFn: function () {
        return pushLocal(5, { force: true, fromReliable: true });
      },
      retryMs: 400,
      maxRetryMs: 12000
    });
    return reliableQueue;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function isPublicHost() {
    try {
      var h = global.location.hostname;
      return h.indexOf('github.io') >= 0 || h.indexOf('pages.dev') >= 0;
    } catch (e) {
      return false;
    }
  }

  function isLanHost() {
    try {
      var p = global.location.port;
      return p === '8080' || p === '3000' || p === '8787';
    } catch (e) {
      return false;
    }
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    return global.fetch(url, Object.assign({ cache: 'no-store', mode: 'cors' }, opts)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.configUrl) {
      return global.PlatformSecurity.configUrl();
    }
    if (isPublicHost()) {
      return '/Almacen-Central-001/data/site-config.json';
    }
    return 'data/site-config.json';
  }

  function loadSiteConfig() {
    return fetchJson(siteConfigUrl() + '?t=' + Date.now()).then(function (cfg) {
      siteConfig = cfg || {};
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl) || publicBase;
      return siteConfig;
    }).catch(function () {
      siteConfig = siteConfig || {};
      return siteConfig;
    });
  }

  function getJsonBinConfig() {
    var jb = siteConfig && siteConfig.despachoJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return null;
    return jb;
  }

  function hasFirebaseConfig() {
    if (global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.isPrimary && global.PlatformSupabaseBridge.isPrimary()) {
      return false;
    }
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled()) return true;
    var fb = siteConfig && siteConfig.firebase;
    return !!(fb && fb.enabled && fb.databaseURL);
  }

  function hasSupabaseConfig() {
    return !!(global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.isEnabled());
  }

  function isSupabasePrimary() {
    return !!(hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary && global.PlatformSupabaseBridge.isPrimary());
  }

  function persistMergedQuiet(merged, source) {
    if (!global.localStorage || !merged) return merged;
    // Crítico: re-leer local ANTES de escribir. Si Pichardo registró durante el await
    // de red, el snapshot capturado al inicio del push ya está viejo y borraría el pedido.
    var cur = getLocalData();
    if (cur) merged = retainAllPedidos(cur, mergeDespacho(cur, merged));
    merged.pedidos = asPedidoList(merged.pedidos).map(function (p) {
      if (!p) return p;
      p.historial = asPedidoList(p.historial);
      return p;
    });
    var sig = dataSignature(merged);
    if (sig === lastAppliedSig) return merged;
    applyingRemote = true;
    try {
      // Última salvaguarda: si hubo otro save mientras normalizábamos, no pisar
      var again = getLocalData();
      if (again) merged = retainAllPedidos(again, mergeDespacho(again, merged));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = dataSignature(merged);
    notifyApplied(merged, source || 'push-merge');
    return merged;
  }

  function prepareDataForPush(data) {
    if (!isSupabasePrimary()) return Promise.resolve(data);
    return pullFromSupabase().then(function (remote) {
      var fresh = getLocalData() || data;
      var merged = mergeDespacho(Object.assign({}, fresh || {}, { module: 'despacho' }), remote);
      merged.updatedAt = nowIso();
      return persistMergedQuiet(merged, 'push-merge') || merged;
    }).catch(function () {
      var fresh = getLocalData() || data || {};
      fresh = Object.assign({}, fresh, { module: 'despacho', updatedAt: nowIso() });
      return fresh;
    });
  }

  function promoteDespachoToCloudIfNeeded() {
    var local = getLocalData();
    if (!local || !hasLiveContent(local)) return Promise.resolve();

    if (isSupabasePrimary()) {
      return pullFromSupabase().then(function (remote) {
        var merged = mergeDespacho(local, remote);
        if (!remote || !hasLiveContent(remote) || dataSignature(merged) !== dataSignature(remote)) {
          return pushToSupabase(merged);
        }
      });
    }

    // Firebase vacío: subir la base local (PC con datos vivos, p.ej. Pichardo).
    // Si la nube ya tiene pedidos, NUNCA sobrescribir con una copia local incompleta.
    if (hasFirebaseConfig()) {
      return pullFirebaseInitial().then(function (remote) {
        if (remote && hasLiveContent(remote)) {
          var remoteN = asPedidoList(remote.pedidos).length;
          var localN = asPedidoList(local.pedidos).length;
          if (remoteN >= localN) {
            applyRemote(mergeDespacho(local, remote), 'firebase');
            return false;
          }
        }
        if (remote && hasLiveContent(remote)) return false;
        return pushLocal(3, { force: true });
      }).catch(function () {
        return Promise.resolve(false);
      });
    }

    return Promise.resolve();
  }

  function pullFromSupabase() {
    if (!hasSupabaseConfig()) return Promise.resolve(null);
    return global.PlatformSupabaseBridge.pull('despacho');
  }

  function pushToSupabase(data) {
    if (!hasSupabaseConfig()) return Promise.resolve(false);
    return global.PlatformSupabaseBridge.push('despacho', data);
  }

  function initSupabase() {
    if (!hasSupabaseConfig() || !global.PlatformSupabaseBridge.subscribe) return;
    global.PlatformSupabaseBridge.subscribe('despacho', function (remote) {
      if (!remote) return;
      applyRemote(mergeDespacho(getLocalData(), remote), 'supabase');
    });
  }

  function firebaseLive() {
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled()) {
      return !!(global.PlatformFirebaseBridge.isConnected() || global.PlatformFirebaseBridge.isRestMode());
    }
    return !!(firebaseDb && firebaseBound && hasFirebaseConfig());
  }

  function pushDelayMs(value) {
    try {
      var parsed = JSON.parse(value);
      if (parsed && parsed.liveShareLista && parsed.liveShareLista.active) return 12;
      if (parsed && parsed.liveShare && parsed.liveShare.active) return 12;
    } catch (e) { /* noop */ }
    if (!firebaseLive()) return 80;
    return 25;
  }

  function jsonBinAuthHeaders(jb) {
    var key = jb.accessKey;
    if (jb.keyType === 'master' || /^\$2[ab]\$/.test(String(key || ''))) {
      return { 'X-Master-Key': key };
    }
    return { 'X-Access-Key': key };
  }

  function resolvePublicBase() {
    if (publicBase) return publicBase;
    if (siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl)) {
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl);
      return publicBase;
    }
    if (global.PlatformNetworkRelay) {
      var relay = global.PlatformNetworkRelay.readRelayConfig && global.PlatformNetworkRelay.readRelayConfig();
      if (relay && relay.enabled && normalizeBase(relay.baseUrl)) {
        publicBase = normalizeBase(relay.baseUrl);
        return publicBase;
      }
    }
    return '';
  }

  function canUseServerApi() {
    return !!(resolvePublicBase() || isLanHost());
  }

  function apiUrl(path) {
    var base = resolvePublicBase();
    if (base) return base + path;
    return path;
  }

  function staticDataUrl() {
    if (siteConfig && siteConfig.githubPagesDespachoDataUrl) {
      return siteConfig.githubPagesDespachoDataUrl;
    }
    if (isPublicHost()) {
      return 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/despacho.json';
    }
    return 'data/despacho.json';
  }

  function isCloudConfigured() {
    return !!(
      hasSupabaseConfig() ||
      getJsonBinConfig() ||
      hasFirebaseConfig() ||
      (resolvePublicBase() && serverReachable) ||
      isLanHost() ||
      isPublicHost()
    );
  }

  function getLocalData() {
    if (!global.localStorage) return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function pedidoTime(p) {
    return Date.parse(p && p.updatedAt) || Date.parse(p && p.createdAt) || 0;
  }

  function shareTime(share) {
    return Date.parse(share && share.updatedAt) || 0;
  }

  function pickNewerShare(localShare, remoteShare) {
    if (!localShare && !remoteShare) return null;
    if (!localShare) {
      if (!remoteShare || remoteShare.active === false) return null;
      return remoteShare;
    }
    if (!remoteShare) {
      if (localShare.active === false) return null;
      return localShare;
    }
    var picked = shareTime(remoteShare) >= shareTime(localShare) ? remoteShare : localShare;
    if (!picked || picked.active === false) return null;
    return picked.active ? picked : null;
  }

  /** Lista TV: el contador liveShareSeq gana sobre timestamps (evita reactivar al dejar de compartir). */
  function pickNewerShareLista(local, remote) {
    local = local || {};
    remote = remote || {};
    var lSeq = local.liveShareSeq || 0;
    var rSeq = remote.liveShareSeq || 0;
    if (lSeq !== rSeq) {
      var win = lSeq > rSeq ? local : remote;
      return {
        liveShareSeq: Math.max(lSeq, rSeq),
        liveShareLista: win.liveShareLista && win.liveShareLista.active ? win.liveShareLista : null
      };
    }
    var lActive = !!(local.liveShareLista && local.liveShareLista.active);
    var rActive = !!(remote.liveShareLista && remote.liveShareLista.active);
    if (!lActive && !rActive) {
      return { liveShareSeq: lSeq, liveShareLista: null };
    }
    if (!lActive && rActive) {
      return { liveShareSeq: lSeq, liveShareLista: remote.liveShareLista };
    }
    if (lActive && !rActive) {
      return { liveShareSeq: lSeq, liveShareLista: local.liveShareLista };
    }
    return {
      liveShareSeq: lSeq,
      liveShareLista: pickNewerShare(local.liveShareLista, remote.liveShareLista)
    };
  }

  /** Barcode IDC: mismo criterio con liveShareBarcodeSeq. */
  function pickNewerShareBarcode(local, remote) {
    local = local || {};
    remote = remote || {};
    var lSeq = local.liveShareBarcodeSeq || 0;
    var rSeq = remote.liveShareBarcodeSeq || 0;
    if (lSeq !== rSeq) {
      var win = lSeq > rSeq ? local : remote;
      return {
        liveShareBarcodeSeq: Math.max(lSeq, rSeq),
        liveShare: win.liveShare && win.liveShare.active ? win.liveShare : null
      };
    }
    var lBarActive = !!(local.liveShare && local.liveShare.active);
    var rBarActive = !!(remote.liveShare && remote.liveShare.active);
    if (!lBarActive && !rBarActive) {
      return { liveShareBarcodeSeq: lSeq, liveShare: null };
    }
    if (!lBarActive && rBarActive) {
      return { liveShareBarcodeSeq: lSeq, liveShare: remote.liveShare };
    }
    if (lBarActive && !rBarActive) {
      return { liveShareBarcodeSeq: lSeq, liveShare: local.liveShare };
    }
    return {
      liveShareBarcodeSeq: lSeq,
      liveShare: pickNewerShare(local.liveShare, remote.liveShare)
    };
  }

  function wouldResurrectListaShare(cloud, upload) {
    if (!cloud || !upload) return false;
    var cloudOff = !(cloud.liveShareLista && cloud.liveShareLista.active);
    var uploadOn = !!(upload.liveShareLista && upload.liveShareLista.active);
    if (!cloudOff || !uploadOn) return false;
    return (upload.liveShareSeq || 0) < (cloud.liveShareSeq || 0);
  }

  function asPedidoList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object') {
      return Object.keys(value).map(function (k) { return value[k]; }).filter(Boolean);
    }
    return [];
  }

  function mergeHistorial(a, b) {
    var seen = {};
    var out = [];
    asPedidoList(a).concat(asPedidoList(b)).forEach(function (h) {
      if (!h) return;
      var key = String(h.at || '') + '|' + String(h.usuario || '') + '|' +
        String(h.hacia || '') + '|' + String(h.desde || '') + '|' + String(h.nota || '');
      if (seen[key]) return;
      seen[key] = true;
      out.push(h);
    });
    // Más reciente primero — igual que pushHistorial (unshift) en el store
    out.sort(function (x, y) {
      return String(y.at || '').localeCompare(String(x.at || ''));
    });
    return out.slice(0, 50);
  }

  function mergePedidoPair(a, b) {
    if (!a) return b;
    if (!b) return a;
    var newer = pedidoTime(b) >= pedidoTime(a) ? b : a;
    var older = newer === b ? a : b;
    var out = Object.assign({}, older, newer);
    out.historial = mergeHistorial(a.historial, b.historial);
    // Array vacío es intencional (quitaron validadores); no resucitar el older
    if (newer.cargasEquipo != null) {
      out.cargasEquipo = asPedidoList(newer.cargasEquipo);
    } else {
      out.cargasEquipo = asPedidoList(older.cargasEquipo);
    }
    return out;
  }

  function mergeDespacho(local, remote) {
    if (!remote) return local;
    if (!local) {
      var onlyRemote = Object.assign({}, remote, {
        module: 'despacho',
        pedidos: asPedidoList(remote.pedidos).map(function (p) {
          return Object.assign({}, p, { historial: asPedidoList(p.historial) });
        })
      });
      return onlyRemote;
    }

    var map = {};
    asPedidoList(local.pedidos).forEach(function (p) {
      if (p && p.id) map[p.id] = p;
    });
    asPedidoList(remote.pedidos).forEach(function (p) {
      if (!p || !p.id) return;
      map[p.id] = mergePedidoPair(map[p.id], p);
    });

    var merged = Object.assign({}, (Date.parse(remote.updatedAt) || 0) >= (Date.parse(local.updatedAt) || 0) ? remote : local, {
      module: 'despacho',
      pedidos: Object.keys(map).map(function (k) { return map[k]; })
    });

    var listaPick = pickNewerShareLista(local, remote);
    var barcodePick = pickNewerShareBarcode(local, remote);
    merged.liveShareLista = listaPick.liveShareLista;
    merged.liveShareSeq = listaPick.liveShareSeq;
    merged.liveShare = barcodePick.liveShare;
    merged.liveShareBarcodeSeq = barcodePick.liveShareBarcodeSeq;

    var tLocal = Date.parse(local.updatedAt) || 0;
    var tRemote = Date.parse(remote.updatedAt) || 0;
    merged.updatedAt = new Date(Math.max(tLocal, tRemote)).toISOString();
    return retainAllPedidos(local, merged);
  }

  /** Nunca eliminar un pedido que ya existía localmente (solo wipeAll lo borra a propósito). */
  function retainAllPedidos(prev, next) {
    if (!next) return prev;
    if (!prev) return next;
    var map = {};
    asPedidoList(next.pedidos).forEach(function (p) {
      if (p && p.id) map[p.id] = p;
    });
    var restored = 0;
    asPedidoList(prev.pedidos).forEach(function (p) {
      if (!p || !p.id) return;
      if (!map[p.id]) {
        map[p.id] = p;
        restored += 1;
      } else {
        map[p.id] = mergePedidoPair(map[p.id], p);
      }
    });
    next.pedidos = Object.keys(map).map(function (k) { return map[k]; });
    if (restored) {
      next.updatedAt = nowIso();
      pendingPush = true;
    }
    return next;
  }

  function pedidoSigPiece(p) {
    if (!p) return '';
    var cargas = (p.cargasEquipo || []).map(function (c) {
      return String(c.validador || '') + '=' + String(c.camiones || 0) +
        (c.explicit ? '!' : '');
    }).sort().join('+');
    var histN = asPedidoList(p.historial).length;
    return String(p.id) + ':' + String(p.estado) + '@' + String(p.updatedAt || '') +
      '~' + String(p.validadorAsignado || '') + '~' + cargas +
      '~' + String(p.jaula || '') + '~' + String(p.cliente || '') +
      '~h' + histN;
  }

  function dataSignature(data) {
    if (!data) return '';
    var ped = asPedidoList(data.pedidos).map(pedidoSigPiece).sort().join('|');
    var ls = data.liveShare && data.liveShare.active
      ? String(data.liveShare.idc) + '~' + String(data.liveShare.jaula) + '@' + String(data.liveShare.updatedAt) +
        '#' + String(data.liveShareBarcodeSeq || 0)
      : 'Boff#' + String(data.liveShareBarcodeSeq || 0);
    var ll = data.liveShareLista && data.liveShareLista.active
      ? 'L@' + String(data.liveShareLista.updatedAt) + '#' + String(data.liveShareSeq || 0)
      : 'Loff#' + String(data.liveShareSeq || 0);
    return ped + '||' + ls + '||' + ll + '||' + String(data.updatedAt || '');
  }

  function hasLiveContent(data) {
    if (!data) return false;
    if (data.liveShare && data.liveShare.active) return true;
    if (data.liveShareLista && data.liveShareLista.active) return true;
    return asPedidoList(data.pedidos).length > 0;
  }

  function prepareFirebasePayload(local) {
    return pullFirebaseInitial().then(function (remote) {
      // Re-leer DESPUÉS del await: el `local` del inicio del push puede estar viejo
      var fresh = getLocalData() || local;
      var base = Object.assign({}, fresh || {}, { module: 'despacho' });
      var merged = mergeDespacho(base, remote);
      merged.updatedAt = nowIso();
      if (remote && asPedidoList(remote.pedidos).length > asPedidoList(merged.pedidos).length) {
        merged = mergeDespacho(remote, base);
        merged.updatedAt = nowIso();
      }
      return persistMergedQuiet(merged, 'firebase-merge') || merged;
    }).catch(function () {
      var fresh = getLocalData() || local || {};
      return Object.assign({}, fresh, { module: 'despacho', updatedAt: nowIso() });
    });
  }

  function notifyApplied(data, source) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-updated', {
        detail: { data: data, at: nowIso(), source: source || 'cloud' }
      }));
    } catch (e) { /* noop */ }
    if (data && data.liveShare) {
      try {
        global.dispatchEvent(new CustomEvent('despacho-live-share', {
          detail: {
            share: data.liveShare && data.liveShare.active ? data.liveShare : null,
            at: nowIso(),
            source: source || 'cloud'
          }
        }));
      } catch (e) { /* noop */ }
    }
    try {
      global.dispatchEvent(new CustomEvent('despacho-live-lista', {
        detail: {
          share: data && data.liveShareLista && data.liveShareLista.active ? data.liveShareLista : null,
          at: nowIso(),
          source: source || 'cloud'
        }
      }));
    } catch (e) { /* noop */ }
  }

  function applyRemote(data, source) {
    if (!global.localStorage || !data) return false;
    var local = getLocalData();
    var localHadExtra = false;
    var remoteSig = dataSignature(data);
    if (local && data) {
      data = retainAllPedidos(local, mergeDespacho(local, data));
      // Si el merge aportó historial/pedidos que no estaban en la nube, re-empujar.
      localHadExtra = dataSignature(data) !== remoteSig;
    }
    var sig = dataSignature(data);
    if (sig === lastAppliedSig) {
      if (localHadExtra) pendingPush = true;
      return false;
    }
    applyingRemote = true;
    try {
      // Re-leer por si el operador registró durante el merge
      var again = getLocalData();
      if (again) data = retainAllPedidos(again, mergeDespacho(again, data));
      // Normalizar historial a arrays reales (Firebase a veces manda objetos indexados)
      data.pedidos = asPedidoList(data.pedidos).map(function (p) {
        if (!p) return p;
        p.historial = asPedidoList(p.historial);
        return p;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = dataSignature(data);
    localHadExtra = localHadExtra || dataSignature(data) !== remoteSig;
    notifyApplied(data, source);
    if (localHadExtra || pendingPush) {
      pendingPush = true;
      global.setTimeout(function () { drainPushQueue(); }, 120);
    }
    return true;
  }

  function probeServerBase(base) {
    if (!base) return Promise.resolve(false);
    return fetchJson(base + '/api/health').then(function (h) {
      return !!(h && h.ok);
    }).catch(function () { return false; });
  }

  function probeCurrentServer() {
    if (isLanHost()) {
      return fetchJson('/api/health').then(function (h) {
        serverReachable = !!(h && h.ok);
        return serverReachable;
      }).catch(function () {
        serverReachable = false;
        return false;
      });
    }
    var base = resolvePublicBase();
    if (!base) {
      serverReachable = false;
      return Promise.resolve(false);
    }
    return probeServerBase(base).then(function (alive) {
      serverReachable = !!alive;
      if (!alive && siteConfig && siteConfig.publicSyncBaseUrl) {
        publicBase = '';
      }
      return serverReachable;
    });
  }

  function initFirebase() {
    if (isSupabasePrimary()) return Promise.resolve(false);
    if (!hasFirebaseConfig()) return Promise.resolve(false);
    if (!global.PlatformFirebaseBridge || !global.PlatformFirebaseBridge.ensureReady) {
      return Promise.resolve(false);
    }
    return global.PlatformFirebaseBridge.ensureReady().then(function (db) {
      if (!db) return false;
      firebaseDb = db;
      if (firebaseBound) return true;
      firebaseBound = true;
      db.ref('despacho/snapshot').on('value', function (snap) {
        if (isSupabasePrimary()) return;
        var val = snap.val();
        if (!val) return;
        var merged = mergeDespacho(getLocalData(), val);
        applyRemote(merged, 'firebase');
      });
      return true;
    }).catch(function () {
      return false;
    });
  }

  function pullFromJsonBin() {
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(null);
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId + '/latest?t=' + Date.now(), {
      headers: jsonBinAuthHeaders(jb),
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (!res.ok) {
        lastJsonBinError = Date.now();
        if (!warnedJsonBin && res.status === 403) {
          warnedJsonBin = true;
          console.warn('[DespachoCloud] JSONBin agotado — ejecute SETUP-WEB-SYNC.bat');
        }
        throw new Error('jsonbin ' + res.status);
      }
      return res.json();
    }).then(function (body) {
      lastJsonBinOk = Date.now();
      return body && body.record ? body.record : null;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return null;
    });
  }

  function pullFromServer() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/data/despacho')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromCloudProxy() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/cloud/despacho')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromStatic() {
    staticPollCounter += 1;
    var fast = (getJsonBinConfig() && lastJsonBinOk && (Date.now() - lastJsonBinOk) < 10000) ||
      (canUseServerApi() && serverReachable);
    if (fast && staticPollCounter % 3 !== 0) return Promise.resolve(null);
    return fetchJson(staticDataUrl() + '?t=' + Date.now()).catch(function () { return null; });
  }

  function pullFirebaseInitial() {
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(null);
    var ready = global.PlatformFirebaseBridge.ensureReady
      ? global.PlatformFirebaseBridge.ensureReady()
      : Promise.resolve(null);
    return ready.then(function (adapter) {
      if (adapter) firebaseDb = adapter;
      if (global.PlatformFirebaseBridge.pull) {
        return global.PlatformFirebaseBridge.pull('despacho/snapshot');
      }
      if (!firebaseDb) return null;
      return firebaseDb.ref('despacho/snapshot').once('value').then(function (snap) {
        return snap.val() || null;
      });
    }).catch(function () { return null; });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(getLocalData());
    pulling = true;
    return pullFromJsonBin().then(function (jsonBinData) {
      return Promise.all([
        Promise.resolve(jsonBinData),
        pullFromSupabase(),
        pullFromServer(),
        pullFromCloudProxy(),
        pullFromStatic(),
        pullFirebaseInitial()
      ]).then(function (parts) {
        // Re-leer DESPUÉS de la red: el operador pudo registrar durante el await
        var localNow = getLocalData();
        var sbData = parts[1];
        var merged;
        var applySource = 'merge';

        if (isSupabasePrimary() && sbData) {
          merged = mergeDespacho(localNow, sbData);
          applySource = 'supabase';
        } else {
          merged = localNow;
        }

        if (jsonBinData && !isSupabasePrimary()) {
          merged = mergeDespacho(merged, jsonBinData);
          applySource = 'jsonbin';
        }

        parts.slice(2).forEach(function (part) {
          if (part) merged = mergeDespacho(merged, part);
        });

        if (jsonBinData && !isSupabasePrimary()) {
          merged = mergeDespacho(merged, jsonBinData);
        }

        if (!isSupabasePrimary() && localNow && hasLiveContent(localNow)) {
          merged = retainAllPedidos(localNow, mergeDespacho(localNow, merged));
        }

        if (merged) {
          applyRemote(merged, applySource);
          lastPullAt = Date.now();
          updateSyncUi();

          if (isSupabasePrimary() && sbData) {
            var localAfter = getLocalData();
            if (localAfter && hasLiveContent(localAfter)) {
              var upload = mergeDespacho(sbData, localAfter);
              if (dataSignature(upload) !== dataSignature(sbData || {}) &&
                  !wouldResurrectListaShare(sbData, upload)) {
                global.setTimeout(function () { pushLocal(2); }, 250);
              }
            }
          }

          if (getJsonBinConfig() && jsonBinData == null && hasLiveContent(localNow)) {
            global.setTimeout(function () { pushLocal(1); }, 200);
          }

          var firebasePart = parts[5];
          if (hasFirebaseConfig() && !isSupabasePrimary() &&
              (firebasePart == null || !hasLiveContent(firebasePart)) &&
              hasLiveContent(localNow)) {
            global.setTimeout(function () { pushLocal(2, { force: true }); }, 300);
          }
        }
        return merged;
      });
    }).finally(function () {
      pulling = false;
    });
  }

  function pushToJsonBin(data) {
    var jb = getJsonBinConfig();
    if (!jb || !data) return Promise.resolve(false);
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    data = Object.assign({}, data, { module: 'despacho', updatedAt: nowIso() });
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        lastJsonBinOk = Date.now();
        return true;
      }
      lastJsonBinError = Date.now();
      return false;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return false;
    });
  }

  function pushToServer(data) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/data/despacho'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data, source: 'client' })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function pushToCloudProxy(data) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/cloud/despacho'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function pushToFirebase(data) {
    if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) return Promise.resolve(false);
    if (!global.PlatformFirebaseBridge || !global.PlatformFirebaseBridge.ensureReady) {
      return Promise.resolve(false);
    }
    var payload = sanitizeForCloud(data);
    return global.PlatformFirebaseBridge.ensureReady().then(function (adapter) {
      if (!adapter) return false;
      firebaseDb = adapter;
      function casMerge(remote, intended) {
        // Union de nube + lo que queremos subir + lo que haya ahora en esta PC
        var fresh = getLocalData();
        var merged = mergeDespacho(intended, remote);
        if (fresh) merged = retainAllPedidos(fresh, mergeDespacho(fresh, merged));
        merged.updatedAt = nowIso();
        return merged;
      }
      // CAS evita que otra PC con snapshot viejo borre el IDC recién registrado
      if (global.PlatformFirebaseBridge.pushCas) {
        return global.PlatformFirebaseBridge.pushCas('despacho/snapshot', payload, casMerge)
          .then(function (r) {
            if (r && r.ok) {
              if (r.data) persistMergedQuiet(r.data, 'firebase-cas');
              return true;
            }
            console.warn('[DespachoCloud] Firebase CAS push falló — reintento con merge fresco');
            var fresh = casMerge(null, getLocalData() || payload);
            return adapter.ref('despacho/snapshot').set(sanitizeForCloud(fresh)).then(function (ok) {
              return !!ok;
            });
          });
      }
      if (adapter.ref('despacho/snapshot').setCas) {
        return adapter.ref('despacho/snapshot').setCas(payload, casMerge).then(function (ok) {
          if (!ok) console.warn('[DespachoCloud] Firebase push falló');
          return !!ok;
        });
      }
      return adapter.ref('despacho/snapshot').set(payload).then(function (ok) {
        if (!ok) console.warn('[DespachoCloud] Firebase push falló');
        return !!ok;
      });
    }).catch(function (err) {
      console.warn('[DespachoCloud] Firebase push error:', err);
      return false;
    });
  }

  function sanitizeForCloud(data) {
    try {
      return JSON.parse(JSON.stringify(data || {}));
    } catch (e) {
      return data;
    }
  }

  function drainPushQueue() {
    if (!pendingPush) return;
    if (pushing || applyingRemote) {
      global.setTimeout(function () { drainPushQueue(); }, 220);
      return;
    }
    pendingPush = false;
    pushLocal(5, { force: true });
  }

  function pushLocal(retries, opts) {
    opts = opts || {};
    // Siempre encolar: si se descarta el push (nube aplicando / otro push),
    // se pierden cambios de historial y la actividad “se detiene” en otras PCs.
    if (pushing || applyingRemote) {
      pendingPush = true;
      if (!opts.fromReliable && ensureReliableQueue()) {
        ensureReliableQueue().enqueue('busy');
      }
      global.setTimeout(function () { drainPushQueue(); }, 180);
      return Promise.resolve(false);
    }
    var local = getLocalData();
    if (!local || !hasLiveContent(local)) return Promise.resolve(false);
    if (!isCloudConfigured()) return Promise.resolve(false);

    function runPush() {
      pushing = true;
      retries = retries == null ? 3 : retries;

      if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) {
        return prepareDataForPush(Object.assign({}, local, { module: 'despacho' })).then(function (sbPayload) {
          return pushToSupabase(sbPayload).then(function (ok) {
            if (ok) {
              lastPushOkAt = Date.now();
              pendingPush = false;
              if (broadcast) {
                try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
              }
              updateSyncUi();
              return true;
            }
            pendingPush = true;
            return pushLocalFallback(retries);
          });
        }).finally(function () {
          pushing = false;
          drainPushQueue();
        });
      }

      if (hasFirebaseConfig()) {
        return prepareFirebasePayload(local).then(function (payload) {
          return pushToFirebase(payload).then(function (ok) {
            if (ok) {
              lastPushOkAt = Date.now();
              pendingPush = false;
              if (broadcast) {
                try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
              }
              updateSyncUi();
              return true;
            }
            pendingPush = true;
            return pushLocalFallback(retries);
          });
        }).finally(function () {
          pushing = false;
          drainPushQueue();
        });
      }
      return pushLocalFallback(retries).finally(function () {
        pushing = false;
        drainPushQueue();
      });
    }

    if (hasFirebaseConfig() && global.PlatformFirebaseBridge) {
      return global.PlatformFirebaseBridge.ensureReady().then(function () {
        return runPush();
      });
    }
    return runPush();
  }

  function pushLocalForce() {
    return pushLocal(5, { force: true });
  }

  /** Trae la nube y la impone sobre datos locales viejos (usar en Polanco si se quedó en el día anterior). */
  function forceResyncFromCloud() {
    return loadSiteConfig().then(function () {
      return global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.ensureReady
        ? global.PlatformFirebaseBridge.ensureReady()
        : null;
    }).then(function () {
      return pullFirebaseInitial();
    }).then(function (remote) {
      if (!remote || !hasLiveContent(remote)) {
        return pullAll();
      }
      var local = getLocalData();
      var merged = retainAllPedidos(local, mergeDespacho(local, remote));
      applyingRemote = true;
      try {
        if (global.localStorage) {
          var again = getLocalData();
          if (again) merged = retainAllPedidos(again, mergeDespacho(again, merged));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } finally {
        applyingRemote = false;
      }
      lastAppliedSig = dataSignature(merged);
      lastPullAt = Date.now();
      notifyApplied(merged, 'firebase-force');
      updateSyncUi();
      return merged;
    });
  }

  function pushLocalFallback(retries) {
    var local = getLocalData();
    if (!local) return Promise.resolve(false);
    retries = retries == null ? 2 : retries;

    function attempt(n, payload) {
      return Promise.all([
        pushToServer(payload),
        pushToCloudProxy(payload),
        pushToJsonBin(payload),
        pushToFirebase(payload)
      ]).then(function (results) {
        var jsonBinOk = results[2];
        var ok = getJsonBinConfig() ? (jsonBinOk || results[0] || results[1] || results[3]) : results.some(Boolean);
        if (ok) {
          lastPushOkAt = Date.now();
          if (broadcast) {
            try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
          }
          if (isLanHost()) {
            global.fetch('/api/publish-despacho-live', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: payload })
            }).catch(function () { /* noop */ });
          }
          updateSyncUi();
          return true;
        }
        if (n < retries) {
          return new Promise(function (resolve) {
            global.setTimeout(function () { resolve(attempt(n + 1, payload)); }, firebaseLive() ? 120 : 350);
          });
        }
        updateSyncUi();
        return false;
      });
    }

    return pullFromJsonBin().then(function (remote) {
      var fresh = getLocalData() || local;
      var payload = mergeDespacho(fresh, remote);
      payload = persistMergedQuiet(payload, 'fallback-merge') || payload || fresh;
      return attempt(0, payload);
    });
  }

  function syncStatusMessage() {
    if (global.PlatformLanSync && global.PlatformLanSync.isEnabled && global.PlatformLanSync.isEnabled()) {
      return { level: 'ok', text: 'LAN activo — sync instantáneo entre PCs en la misma red' };
    }
    if (firebaseLive()) {
      var conn = global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isConnected && global.PlatformFirebaseBridge.isConnected();
      var mode = global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.getMode && global.PlatformFirebaseBridge.getMode();
      if (conn === false) {
        return { level: 'warn', text: 'Firebase conectando… recargue con Ctrl+F5 si tarda más de 5 s' };
      }
      if (mode === 'rest') {
        return { level: 'ok', text: 'Sync en vivo activa (nube) — cambios cada ~0.5 s entre teléfono y PC' };
      }
      return { level: 'ok', text: 'Firebase en vivo — cambios en menos de 1 s entre todas las PCs' };
    }
    if (hasFirebaseConfig()) {
      return { level: 'err', text: 'Firebase no conectó — Ctrl+F5 en teléfono y PC (misma URL GitHub)' };
    }
    if (serverReachable && resolvePublicBase()) {
      return { level: 'ok', text: 'Sync en vivo vía servidor · hace ' + (lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) + ' s' : '—') };
    }
    if (isLanHost() && serverReachable) {
      return { level: 'ok', text: 'Servidor local activo — operador y validador sincronizados' };
    }
    if (getJsonBinConfig()) {
      var jsonBinAlive = lastJsonBinOk && (!lastJsonBinError || lastJsonBinOk >= lastJsonBinError);
      if (!jsonBinAlive && lastJsonBinError) {
        return {
          level: 'err',
          text: 'Sync nube caída (JSONBin agotado/403). Los datos de otras PCs no se ven. Ejecute SETUP-WEB-SYNC.bat con Master Key nueva de jsonbin.io y Ctrl+F5 en TODAS las PCs'
        };
      }
      if (jsonBinAlive && lastPullAt) {
        return {
          level: 'ok',
          text: 'Sync nube activa · hace ' + Math.round((Date.now() - lastPullAt) / 1000) + ' s'
        };
      }
    }
    if (isCloudConfigured() && lastPullAt) {
      return { level: 'ok', text: 'Sync automático · hace ' + Math.round((Date.now() - lastPullAt) / 1000) + ' s' };
    }
    return {
      level: 'err',
      text: 'Sin sync entre PCs. Ejecute SETUP-WEB-SYNC.bat (Master Key nueva de jsonbin.io)'
    };
  }

  function updateSyncUi() {
    var status = syncStatusMessage();
    try {
      global.dispatchEvent(new CustomEvent('despacho-cloud-status', { detail: status }));
    } catch (e) { /* noop */ }
    var badge = global.document && global.document.querySelector('.desp-live-badge');
    if (badge) {
      badge.title = status.text;
      badge.classList.toggle('desp-sync-err', status.level === 'err');
      badge.classList.toggle('desp-sync-warn', status.level === 'warn');
    }
  }

  function pollIntervalMs() {
    if (isSupabasePrimary()) {
      var cfg = siteConfig || {};
      var sb = cfg.supabase || {};
      if (sb.freeTier || sb.preferPoll) {
        var freeMs = parseInt(cfg.syncTargetMs, 10);
        if (freeMs > 0) return Math.max(3000, freeMs);
        var freeSec = parseInt(cfg.pollSeconds, 10);
        if (freeSec > 0) return Math.max(3000, freeSec * 1000);
        return 4000;
      }
      return 4000;
    }
    if (firebaseLive()) return 2000;
    var sec = (siteConfig && siteConfig.pollSeconds) || 4;
    if (siteConfig && siteConfig.realtime === false) sec = 5;
    return Math.max(1, sec) * 1000;
  }

  function startPolling() {
    clearTimeout(pollTimer);
    function loop() {
      if (global.document && global.document.visibilityState === 'hidden') {
        pollTimer = global.setTimeout(loop, pollIntervalMs() * 2);
        return;
      }
      pullAll().finally(function () {
        pollTimer = global.setTimeout(loop, pollIntervalMs());
      });
    }
    pollTimer = global.setTimeout(loop, pollIntervalMs());
  }

  function hookLocalStorage() {
    if (!global.localStorage || global.localStorage.__despachoCloudHooked) return;
    var proto = Storage.prototype;
    var orig = proto.setItem;
    proto.setItem = function (key, value) {
      orig.call(this, key, value);
      if (key === STORAGE_KEY && !applyingRemote) {
        clearTimeout(hookLocalStorage.pushTimer);
        hookLocalStorage.pushTimer = global.setTimeout(function () {
          pushLocal();
        }, pushDelayMs(value));
      }
    };
    global.localStorage.__despachoCloudHooked = true;
  }

  function init() {
    loadSiteConfig().then(function () {
      return (global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false));
    }).then(function () {
      return probeCurrentServer().then(function () {
        if (isSupabasePrimary()) return false;
        return initFirebase();
      });
    }).then(function () {
      initSupabase();
      if (isSupabasePrimary()) return null;
      return pullFirebaseInitial();
    }).then(function (remoteFirebase) {
      hookLocalStorage();
      var local = getLocalData();
      if (remoteFirebase && !isSupabasePrimary()) {
        applyRemote(mergeDespacho(local, remoteFirebase), 'firebase');
      }
      if (local) lastAppliedSig = dataSignature(getLocalData() || local);
      if (!isCloudConfigured()) {
        console.warn('[DespachoCloud] Sync limitada — configure LAN o Firebase');
        updateSyncUi();
        return;
      }
      return pullAll().then(function () {
        return promoteDespachoToCloudIfNeeded();
      });
    }).then(function () {
      if (!isCloudConfigured()) return;
      startPolling();
      updateSyncUi();
      ensureReliableQueue();
      if (global.PlatformSyncReliable && global.PlatformSyncReliable.attachWatchdog) {
        stopWatchdog = global.PlatformSyncReliable.attachWatchdog({
          queue: ensureReliableQueue(),
          intervalMs: 15000,
          staleMs: 45000
        });
      }
      // Heartbeat suave: solo si hay pendiente real (no reescribir la nube a ciegas)
      global.setInterval(function () {
        if (!hasLiveContent(getLocalData())) return;
        if (!(pendingPush || (reliableQueue && reliableQueue.hasPending && reliableQueue.hasPending()))) {
          return;
        }
        pushLocalForce();
      }, 20000);
      global.addEventListener('pageshow', function (ev) {
        if (!ev.persisted) return;
        pullAll().then(function () { pushLocalForce(); });
      }, { passive: true });
      global.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          probeCurrentServer().then(function () {
            return pullAll();
          }).then(function () { pushLocalForce(); });
        }
      }, { passive: true });
      global.addEventListener('focus', function () {
        probeCurrentServer().then(function () {
          return pullAll();
        }).then(function () { pushLocalForce(); });
      }, { passive: true });
      global.addEventListener('online', function () {
        pendingPush = true;
        pushLocalForce();
      }, { passive: true });
      global.addEventListener('lan-sync', function (ev) {
        if (ev.detail && ev.detail.store === 'despacho') pullAll();
      });
      global.addEventListener('lan-ready', function () {
        updateSyncUi();
        pullAll();
      });
      global.addEventListener('firebase-connection', function () {
        updateSyncUi();
        pendingPush = true;
        drainPushQueue();
      });
      if (broadcast) {
        broadcast.onmessage = function () { pullAll(); };
      }
      global.setInterval(function () {
        probeCurrentServer().then(function () { updateSyncUi(); });
      }, 20000);
    });
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.PlatformDespachoCloudSync = {
    pullAll: pullAll,
    pushLocal: pushLocal,
    pushLocalForce: pushLocalForce,
    forceResyncFromCloud: forceResyncFromCloud,
    mergeDespacho: mergeDespacho,
    isConfigured: isCloudConfigured,
    getLastPullAt: function () { return lastPullAt; },
    getStatus: syncStatusMessage
  };
})(typeof window !== 'undefined' ? window : this);
