/**
 * Sync web — operaciones, productividad, facturas (lo que ves = lo ven todos)
 * JSONBin + Firebase + LAN + GitHub static + polling ~1s
 */
(function (global) {
  'use strict';

  var STORES = {
    operaciones: 'almacen_platform_data_operaciones',
    productividad: 'almacen_platform_data_productividad',
    facturas: 'almacen_platform_data_facturas'
  };

  var pollTimer = null;
  var pushing = false;
  var pulling = false;
  var applyingRemote = false;
  var siteConfig = null;
  var publicBase = '';
  var serverReachable = false;
  var lastPullAt = 0;
  var lastAppliedSig = '';
  var lastJsonBinError = 0;
  var lastJsonBinOk = 0;
  var staticPollCounter = 0;
  var firebaseDb = null;
  var firebaseBound = false;
  var warnedJsonBin = false;
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('platform-web-cloud')
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
    if (isPublicHost()) return '/Almacen-Central-001/data/site-config.json';
    return 'data/site-config.json';
  }

  function loadSiteConfig() {
    return fetchJson(siteConfigUrl() + '?t=' + Date.now()).then(function (cfg) {
      siteConfig = cfg || {};
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl) || publicBase;
      applySiteConfigRelay();
      return siteConfig;
    }).catch(function () {
      siteConfig = siteConfig || {};
      return siteConfig;
    });
  }

  function applySiteConfigRelay() {
    var url = siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl);
    if (!url || !global.PlatformNetworkRelay || !global.PlatformNetworkRelay.saveRelayConfig) return;
    global.PlatformNetworkRelay.saveRelayConfig({
      enabled: true,
      baseUrl: url,
      autoRedirect: false
    });
    if (global.PlatformNetworkRelay.applyRelayFromConfig) {
      global.PlatformNetworkRelay.applyRelayFromConfig();
    }
    publicBase = url;
  }

  function getJsonBinConfig() {
    var jb = siteConfig && siteConfig.platformJsonBin;
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

  function prepareSnapshotForPush(snap) {
    if (!isSupabasePrimary()) return Promise.resolve(snap);
    return pullFromSupabase().then(function (remote) {
      var merged = mergeSnapshots(snap, remote);
      merged.updatedAt = nowIso();
      return merged;
    }).catch(function () {
      snap.updatedAt = nowIso();
      return snap;
    });
  }

  function promotePlatformToCloudIfNeeded() {
    if (!isSupabasePrimary()) return Promise.resolve();
    var local = buildSnapshotFromLocal();
    if (!local || !hasAnyData(local)) return Promise.resolve();
    return pullFromSupabase().then(function (remote) {
      var merged = mergeSnapshots(local, remote);
      if (!remote || !hasAnyData(remote) || snapshotSignature(merged) !== snapshotSignature(remote)) {
        return pushToSupabase(merged);
      }
    });
  }

  function pullFromSupabase() {
    if (!hasSupabaseConfig()) return Promise.resolve(null);
    return global.PlatformSupabaseBridge.pull('platform');
  }

  function pushToSupabase(snap) {
    if (!hasSupabaseConfig()) return Promise.resolve(false);
    return global.PlatformSupabaseBridge.push('platform', snap);
  }

  function initSupabase() {
    if (!hasSupabaseConfig() || !global.PlatformSupabaseBridge.subscribe) return;
    global.PlatformSupabaseBridge.subscribe('platform', function (remote) {
      if (remote) applySnapshot(remote, 'supabase');
    });
  }

  function firebaseLive() {
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled()) {
      return !!(global.PlatformFirebaseBridge.isConnected() || global.PlatformFirebaseBridge.isRestMode());
    }
    return !!(firebaseDb && firebaseBound && hasFirebaseConfig());
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
    if (siteConfig && siteConfig.githubPagesPlatformDataUrl) {
      return siteConfig.githubPagesPlatformDataUrl;
    }
    if (isPublicHost()) {
      return 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/platform.json';
    }
    return 'data/platform.json';
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

  function moduleUpdatedAt(data) {
    return Date.parse(data && data.updatedAt) || 0;
  }

  function buildSnapshotFromLocal() {
    if (!global.localStorage) return null;
    var snap = {
      version: 1,
      updatedAt: nowIso(),
      operaciones: null,
      productividad: null,
      facturas: null
    };
    var maxT = 0;
    Object.keys(STORES).forEach(function (mod) {
      try {
        var raw = localStorage.getItem(STORES[mod]);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          snap[mod] = parsed;
          maxT = Math.max(maxT, moduleUpdatedAt(parsed));
        }
      } catch (e) { /* noop */ }
    });
    if (maxT) snap.updatedAt = new Date(maxT).toISOString();
    return snap;
  }

  function mergeSnapshots(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    var merged = {
      version: 1,
      updatedAt: nowIso(),
      operaciones: null,
      productividad: null,
      facturas: null
    };
    Object.keys(STORES).forEach(function (mod) {
      var a = local[mod];
      var b = remote[mod];
      if (!a) merged[mod] = b;
      else if (!b) merged[mod] = a;
      else merged[mod] = moduleUpdatedAt(a) >= moduleUpdatedAt(b) ? a : b;
    });
    var tLocal = Date.parse(local.updatedAt) || 0;
    var tRemote = Date.parse(remote.updatedAt) || 0;
    merged.updatedAt = new Date(Math.max(tLocal, tRemote)).toISOString();
    return merged;
  }

  function snapshotSignature(snap) {
    if (!snap) return '';
    return Object.keys(STORES).map(function (mod) {
      var d = snap[mod];
      return mod + ':' + (d ? String(d.updatedAt || '') + '@' + String((d.registros && d.registros.length) || (d.bd && d.bd.registros && d.bd.registros.length) || 0) : '0');
    }).join('|') + '||' + String(snap.updatedAt || '');
  }

  function hasAnyData(snap) {
    if (!snap) return false;
    return Object.keys(STORES).some(function (mod) {
      return !!(snap[mod] && typeof snap[mod] === 'object');
    });
  }

  function applySnapshot(snap, source) {
    if (!global.localStorage || !snap) return false;
    var sig = snapshotSignature(snap);
    if (sig === lastAppliedSig) return false;
    applyingRemote = true;
    try {
      Object.keys(STORES).forEach(function (mod) {
        if (snap[mod] && typeof snap[mod] === 'object') {
          localStorage.setItem(STORES[mod], JSON.stringify(snap[mod]));
        }
      });
    } finally {
      applyingRemote = false;
    }
    lastAppliedSig = sig;
    Object.keys(STORES).forEach(function (mod) {
      if (snap[mod]) {
        try {
          global.dispatchEvent(new CustomEvent('lan-sync', {
            detail: { store: mod, lsKey: STORES[mod], source: source || 'cloud' }
          }));
        } catch (e) { /* noop */ }
      }
    });
    try {
      global.dispatchEvent(new CustomEvent('web-cloud-sync', {
        detail: { snapshot: snap, at: nowIso(), source: source || 'cloud' }
      }));
    } catch (e) { /* noop */ }
    return true;
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
    return fetchJson(base + '/api/health').then(function (h) {
      serverReachable = !!(h && h.ok);
      if (!serverReachable) publicBase = '';
      return serverReachable;
    }).catch(function () {
      serverReachable = false;
      publicBase = '';
      return false;
    });
  }

  function initFirebase() {
    if (isSupabasePrimary()) return Promise.resolve(false);
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(false);
    return global.PlatformFirebaseBridge.ensureReady().then(function (db) {
      if (!db || firebaseBound) {
        if (db) firebaseDb = db;
        return !!db;
      }
      firebaseDb = db;
      firebaseBound = true;
      db.ref('platform/snapshot').on('value', function (snap) {
        if (isSupabasePrimary()) return;
        var val = snap.val();
        if (!val) return;
        var merged = mergeSnapshots(buildSnapshotFromLocal(), val);
        applySnapshot(merged, 'firebase');
      });
      return true;
    }).catch(function () { return false; });
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
          showSyncBanner('warn', 'Sync web — use Firebase (Ctrl+F5). JSONBin ya no es necesario.');
        }
        throw new Error('jsonbin ' + res.status);
      }
      return res.json();
    }).then(function (body) {
      lastJsonBinOk = Date.now();
      hideSyncBannerIfOk();
      return body && body.record ? body.record : null;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return null;
    });
  }

  function pullFromServer() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return Promise.all(Object.keys(STORES).map(function (mod) {
      return fetchJson(apiUrl('/api/data/' + mod)).then(function (res) {
        return res && res.data ? { mod: mod, data: res.data } : null;
      }).catch(function () { return null; });
    })).then(function (rows) {
      var snap = { version: 1, updatedAt: nowIso(), operaciones: null, productividad: null, facturas: null };
      var maxT = 0;
      rows.forEach(function (row) {
        if (row && row.data) {
          snap[row.mod] = row.data;
          maxT = Math.max(maxT, moduleUpdatedAt(row.data));
        }
      });
      if (!maxT) return null;
      snap.updatedAt = new Date(maxT).toISOString();
      return snap;
    });
  }

  function pullFromCloudProxy() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/cloud/platform')).then(function (res) {
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
      return global.PlatformFirebaseBridge.pull('platform/snapshot');
    }
    if (!firebaseDb) return Promise.resolve(null);
    return firebaseDb.ref('platform/snapshot').once('value').then(function (snap) {
      return snap.val() || null;
    }).catch(function () { return null; });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(buildSnapshotFromLocal());
    pulling = true;
    var localBefore = buildSnapshotFromLocal();
    return pullFromJsonBin().then(function (jsonBinSnap) {
      return Promise.all([
        Promise.resolve(jsonBinSnap),
        pullFromSupabase(),
        pullFromServer(),
        pullFromCloudProxy(),
        pullFromStatic(),
        pullFirebaseInitial()
      ]).then(function (parts) {
        var sbSnap = parts[1];
        var merged;
        var applySource = 'merge';

        if (isSupabasePrimary() && sbSnap) {
          merged = mergeSnapshots(buildSnapshotFromLocal(), sbSnap);
          applySource = 'supabase';
        } else {
          merged = localBefore;
        }

        if (jsonBinSnap && !isSupabasePrimary()) {
          merged = mergeSnapshots(merged, jsonBinSnap);
          applySource = 'jsonbin';
        }

        parts.slice(2).forEach(function (part) {
          if (part) merged = mergeSnapshots(merged, part);
        });

        if (jsonBinSnap && !isSupabasePrimary()) {
          merged = mergeSnapshots(merged, jsonBinSnap);
        }

        if (!isSupabasePrimary() && localBefore && hasAnyData(localBefore) &&
            snapshotSignature(mergeSnapshots(localBefore, merged)) !== snapshotSignature(merged)) {
          merged = mergeSnapshots(merged, localBefore);
        }

        if (merged && hasAnyData(merged)) {
          applySnapshot(merged, applySource);
          lastPullAt = Date.now();

          if (isSupabasePrimary() && localBefore && hasAnyData(localBefore)) {
            var upload = mergeSnapshots(sbSnap, localBefore);
            if (!sbSnap || !hasAnyData(sbSnap) ||
                snapshotSignature(upload) !== snapshotSignature(sbSnap || {})) {
              global.setTimeout(function () { pushLocal(2); }, 250);
            }
          }
        }

        if (getJsonBinConfig() && jsonBinSnap == null && hasAnyData(localBefore)) {
          global.setTimeout(function () { pushLocal(1); }, 200);
        }
        return merged;
      });
    }).finally(function () {
      pulling = false;
    });
  }

  function pushToJsonBin(snap) {
    var jb = getJsonBinConfig();
    if (!jb || !snap) return Promise.resolve(false);
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    snap = Object.assign({}, snap, { updatedAt: nowIso() });
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(snap),
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        lastJsonBinOk = Date.now();
        hideSyncBannerIfOk();
        return true;
      }
      lastJsonBinError = Date.now();
      return false;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return false;
    });
  }

  function pushToServer(snap) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    var tasks = Object.keys(STORES).map(function (mod) {
      if (!snap[mod]) return Promise.resolve(true);
      return global.fetch(apiUrl('/api/data/' + mod), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: snap[mod], source: 'client' })
      }).then(function (res) { return res.ok; }).catch(function () { return false; });
    });
    return Promise.all(tasks).then(function (r) { return r.some(Boolean); });
  }

  function pushToCloudProxy(snap) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/cloud/platform'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function pushToFirebase(snap) {
    if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) return Promise.resolve(false);
    if (!global.PlatformFirebaseBridge) return Promise.resolve(false);
    var payload;
    try { payload = JSON.parse(JSON.stringify(snap || {})); } catch (e) { payload = snap; }
    return global.PlatformFirebaseBridge.ensureReady().then(function (adapter) {
      if (!adapter) return false;
      firebaseDb = adapter;
      return adapter.ref('platform/snapshot').set(payload).then(function (ok) { return !!ok; });
    }).catch(function () { return false; });
  }

  function pushLocal(retries) {
    if (pushing || applyingRemote) return Promise.resolve(false);
    var local = buildSnapshotFromLocal();
    if (!local || !hasAnyData(local)) return Promise.resolve(false);
    if (!isCloudConfigured()) return Promise.resolve(false);

    function runPush() {
      pushing = true;
      retries = retries == null ? 2 : retries;

      if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) {
        return prepareSnapshotForPush(local).then(function (payload) {
          return pushToSupabase(payload).then(function (ok) {
            if (ok && broadcast) {
              try { broadcast.postMessage({ type: 'platform-sync', at: Date.now() }); } catch (e) { /* noop */ }
            }
            return ok;
          });
        }).finally(function () {
          pushing = false;
        });
      }

      if (hasFirebaseConfig() && !getJsonBinConfig()) {
        local.updatedAt = nowIso();
        return pushToFirebase(local).then(function (ok) {
          if (ok && broadcast) {
            try { broadcast.postMessage({ type: 'platform-sync', at: Date.now() }); } catch (e) { /* noop */ }
          }
          return ok;
        }).finally(function () {
          pushing = false;
        });
      }

      function attempt(n, payload) {
        return Promise.all([
          pushToServer(payload),
          pushToCloudProxy(payload),
          pushToJsonBin(payload),
          pushToSupabase(payload),
          pushToFirebase(payload)
        ]).then(function (results) {
          var jsonBinOk = results[2];
          var ok = getJsonBinConfig() ? (jsonBinOk || results[0] || results[1] || results[3] || results[4]) : results.some(Boolean);
          if (ok) {
            if (broadcast) {
              try { broadcast.postMessage({ type: 'platform-sync', at: Date.now() }); } catch (e) { /* noop */ }
            }
            return true;
          }
          if (n < retries) {
            return new Promise(function (resolve) {
              global.setTimeout(function () { resolve(attempt(n + 1, payload)); }, firebaseLive() ? 120 : 350);
            });
          }
          return false;
        });
      }

      return pullFromJsonBin().then(function (remote) {
        var payload = mergeSnapshots(local, remote);
        if (payload) lastAppliedSig = snapshotSignature(payload);
        return attempt(0, payload || local);
      }).finally(function () {
        pushing = false;
      });
    }

    if (hasFirebaseConfig() && global.PlatformFirebaseBridge) {
      return global.PlatformFirebaseBridge.ensureReady().then(function () {
        return runPush();
      });
    }
    return runPush();
  }

  function showSyncBanner(level, text) {
    if (!global.document || !global.document.body) return;
    var existing = global.document.getElementById('webCloudSyncBanner');
    if (existing) {
      existing.textContent = '';
      existing.appendChild(global.document.createTextNode(text + ' '));
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'web-cloud-sync-banner__btn';
      btn.textContent = 'Cómo activar';
      btn.addEventListener('click', function () {
        if (global.PlatformToast) {
          global.PlatformToast.info('Sync en vivo — misma URL en todos los dispositivos. Ctrl+F5 si no ve cambios.', 10000);
        }
      });
      existing.appendChild(btn);
      existing.hidden = false;
      return;
    }
    var bar = global.document.createElement('div');
    bar.id = 'webCloudSyncBanner';
    bar.className = 'web-cloud-sync-banner web-cloud-sync-banner--' + (level || 'warn');
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<span>' + text + '</span> <button type="button" class="web-cloud-sync-banner__btn">Cómo activar</button>';
    bar.querySelector('button').addEventListener('click', function () {
      if (global.PlatformToast) {
        global.PlatformToast.info('Sync en vivo — misma URL en todos los dispositivos. Ctrl+F5 si no ve cambios.', 10000);
      }
    });
    global.document.body.appendChild(bar);
  }

  function hideSyncBannerIfOk() {
    if (!hasFirebaseConfig() && !lastJsonBinOk) return;
    var bar = global.document && global.document.getElementById('webCloudSyncBanner');
    if (bar) bar.hidden = true;
  }

  function hookLocalStorage() {
    if (!global.localStorage || global.localStorage.__webCloudHooked) return;
    var proto = Storage.prototype;
    var orig = proto.setItem;
    proto.setItem = function (key, value) {
      orig.call(this, key, value);
      if (!applyingRemote && (key === STORES.operaciones || key === STORES.productividad || key === STORES.facturas)) {
        clearTimeout(hookLocalStorage.pushTimer);
        hookLocalStorage.pushTimer = global.setTimeout(function () {
          pushLocal();
        }, (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) || hasFirebaseConfig() ? 20 : 150);
      }
    };
    global.localStorage.__webCloudHooked = true;
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
      var local = buildSnapshotFromLocal();
      if (remoteFirebase && hasAnyData(remoteFirebase) && !isSupabasePrimary()) {
        applySnapshot(mergeSnapshots(local, remoteFirebase), 'firebase');
      }
      if (local) lastAppliedSig = snapshotSignature(buildSnapshotFromLocal() || local);
      return pullAll().then(function () {
        return promotePlatformToCloudIfNeeded();
      });
    }).then(function () {
      if (!isCloudConfigured()) return;
      startPolling();
      global.addEventListener('firebase-connection', function () {
        if (hasFirebaseConfig()) hideSyncBannerIfOk();
      });
      global.addEventListener('pageshow', function () {
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
      global.addEventListener('lan-sync', function () {
        /* LAN ya sincroniza; re-pull suave por si hay nube */
        if (!global.PlatformLanSync || !global.PlatformLanSync.isEnabled()) return;
      });
      global.addEventListener('lan-ready', function () {
        pullAll();
      });
      if (broadcast) {
        broadcast.onmessage = function () { pullAll(); };
      }
      global.setInterval(function () {
        probeCurrentServer();
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

  global.PlatformWebCloudSync = {
    pullAll: pullAll,
    pushLocal: pushLocal,
    isConfigured: isCloudConfigured,
    getLastPullAt: function () { return lastPullAt; }
  };
})(typeof window !== 'undefined' ? window : this);
