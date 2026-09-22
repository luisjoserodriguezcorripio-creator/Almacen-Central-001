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
    if (!global.localStorage || !merged) return;
    var sig = dataSignature(merged);
    if (sig === lastAppliedSig) return;
    applyingRemote = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = sig;
    notifyApplied(merged, source || 'push-merge');
  }

  function prepareDataForPush(data) {
    if (!isSupabasePrimary()) return Promise.resolve(data);
    var base = Object.assign({}, data, { module: 'despacho' });
    return pullFromSupabase().then(function (remote) {
      var merged = mergeDespacho(base, remote);
      merged.updatedAt = nowIso();
      persistMergedQuiet(merged, 'push-merge');
      return merged;
    }).catch(function () {
      base.updatedAt = nowIso();
      return base;
    });
  }

  function promoteDespachoToCloudIfNeeded() {
    if (!isSupabasePrimary()) return Promise.resolve();
    var local = getLocalData();
    if (!local || !hasLiveContent(local)) return Promise.resolve();
    return pullFromSupabase().then(function (remote) {
      var merged = mergeDespacho(local, remote);
      if (!remote || !hasLiveContent(remote) || dataSignature(merged) !== dataSignature(remote)) {
        return pushToSupabase(merged);
      }
    });
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

  function mergeDespacho(local, remote) {
    if (!remote) return local;
    if (!local) return remote;

    var map = {};
    (local.pedidos || []).forEach(function (p) {
      if (p && p.id) map[p.id] = p;
    });
    (remote.pedidos || []).forEach(function (p) {
      if (!p || !p.id) return;
      var prev = map[p.id];
      if (!prev || pedidoTime(p) >= pedidoTime(prev)) map[p.id] = p;
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
    return merged;
  }

  function pedidoSigPiece(p) {
    if (!p) return '';
    var cargas = (p.cargasEquipo || []).map(function (c) {
      return String(c.validador || '') + '=' + String(c.camiones || 0) +
        (c.explicit ? '!' : '');
    }).sort().join('+');
    return String(p.id) + ':' + String(p.estado) + '@' + String(p.updatedAt || '') +
      '~' + String(p.validadorAsignado || '') + '~' + cargas +
      '~' + String(p.jaula || '') + '~' + String(p.cliente || '');
  }

  function dataSignature(data) {
    if (!data) return '';
    var ped = (data.pedidos || []).map(pedidoSigPiece).sort().join('|');
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
    return !!(data.pedidos && data.pedidos.length);
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
    if (local && data) {
      data = mergeDespacho(local, data);
    }
    var sig = dataSignature(data);
    if (sig === lastAppliedSig) return false;
    applyingRemote = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = sig;
    notifyApplied(data, source);
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
    if (global.PlatformFirebaseBridge.pull) {
      return global.PlatformFirebaseBridge.pull('despacho/snapshot');
    }
    if (!firebaseDb) return Promise.resolve(null);
    return firebaseDb.ref('despacho/snapshot').once('value').then(function (snap) {
      return snap.val() || null;
    }).catch(function () { return null; });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(getLocalData());
    pulling = true;
    var localBefore = getLocalData();
    return pullFromJsonBin().then(function (jsonBinData) {
      return Promise.all([
        Promise.resolve(jsonBinData),
        pullFromSupabase(),
        pullFromServer(),
        pullFromCloudProxy(),
        pullFromStatic(),
        pullFirebaseInitial()
      ]).then(function (parts) {
        var sbData = parts[1];
        var merged;
        var applySource = 'merge';

        if (isSupabasePrimary() && sbData) {
          merged = mergeDespacho(getLocalData(), sbData);
          applySource = 'supabase';
        } else {
          merged = localBefore;
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

        if (!isSupabasePrimary() && localBefore && hasLiveContent(localBefore)) {
          var withLocal = mergeDespacho(localBefore, merged);
          if (dataSignature(withLocal) !== dataSignature(merged)) merged = withLocal;
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

          if (getJsonBinConfig() && jsonBinData == null && hasLiveContent(localBefore)) {
            global.setTimeout(function () { pushLocal(1); }, 200);
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
    if (!pendingPush || pushing || applyingRemote) return;
    pendingPush = false;
    pushLocal(5);
  }

  function pushLocal(retries, opts) {
    opts = opts || {};
    if (pushing || applyingRemote) {
      if (opts.force) pendingPush = true;
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
              if (broadcast) {
                try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
              }
              updateSyncUi();
              return true;
            }
            return pushLocalFallback(retries);
          });
        }).finally(function () {
          pushing = false;
          drainPushQueue();
        });
      }

      if (hasFirebaseConfig()) {
        var fastPayload = Object.assign({}, local, { module: 'despacho', updatedAt: nowIso() });
        return pushToFirebase(fastPayload).then(function (ok) {
          if (ok) {
            lastPushOkAt = Date.now();
            if (broadcast) {
              try { broadcast.postMessage({ type: 'despacho-sync', at: Date.now() }); } catch (e) { /* noop */ }
            }
            updateSyncUi();
            return true;
          }
          return pushLocalFallback(retries);
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
      var payload = mergeDespacho(local, remote);
      if (payload) {
        applyingRemote = true;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } finally {
          applyingRemote = false;
        }
        lastAppliedSig = dataSignature(payload);
      }
      return attempt(0, payload || local);
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
    if (getJsonBinConfig() && lastJsonBinError && (Date.now() - lastJsonBinError) < 30000 && !lastJsonBinOk) {
      return {
        level: 'err',
        text: 'JSONBin agotado. Ejecute SETUP-WEB-SYNC.bat y abra la misma URL en TODAS las PCs'
      };
    }
    if (isPublicHost() && lastPullAt) {
      return { level: 'warn', text: 'Lectura desde GitHub · el operador debe usar servidor LAN para escribir' };
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
    if (firebaseLive()) return 10000;
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
      global.addEventListener('pageshow', function (ev) {
        if (!ev.persisted) return;
        pullAll();
      }, { passive: true });
      global.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          probeCurrentServer().then(function () { pullAll(); });
        }
      }, { passive: true });
      global.addEventListener('focus', function () {
        probeCurrentServer().then(function () { pullAll(); });
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
    isConfigured: isCloudConfigured,
    getLastPullAt: function () { return lastPullAt; },
    getStatus: syncStatusMessage
  };
})(typeof window !== 'undefined' ? window : this);
