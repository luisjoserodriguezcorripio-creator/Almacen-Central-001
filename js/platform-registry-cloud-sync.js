/**
 * Sync usuarios, áreas y solicitudes — todos los dispositivos ven lo mismo (Supabase)
 */
(function (global) {
  'use strict';

  var MODULE = 'registry';
  var KEYS = {
    users: 'almacen_users',
    areas: 'almacen_areas',
    accessRequests: 'almacen_access_requests'
  };

  var pollTimer = null;
  var pushing = false;
  var pulling = false;
  var applyingRemote = false;
  var lastPullAt = 0;
  var lastAppliedSig = '';
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('platform-registry-cloud')
    : null;

  function nowIso() {
    return new Date().toISOString();
  }

  function hasSupabaseConfig() {
    return !!(global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.isEnabled());
  }

  function isSupabasePrimary() {
    return !!(hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary && global.PlatformSupabaseBridge.isPrimary());
  }

  function admin() {
    return global.PlatformAdmin || null;
  }

  function buildSnapshotFromLocal() {
    var A = admin();
    var snap = {
      version: 1,
      updatedAt: nowIso(),
      users: [],
      areas: [],
      accessRequests: []
    };
    if (!A) return snap;
    if (A.exportStaffForWeb) snap.users = A.exportStaffForWeb();
    if (A.getAreas) snap.areas = A.getAreas();
    if (A.getAccessRequests) snap.accessRequests = A.getAccessRequests();
    try {
      var ts = parseInt(global.localStorage.getItem(KEYS.users + '_sync') || '0', 10);
      if (ts) snap.updatedAt = new Date(ts).toISOString();
    } catch (e) { /* noop */ }
    return snap;
  }

  function mergeById(a, b) {
    var map = Object.create(null);
    (Array.isArray(a) ? a : []).forEach(function (x) {
      if (x && x.id != null) map[String(x.id)] = x;
    });
    (Array.isArray(b) ? b : []).forEach(function (x) {
      if (x && x.id != null) map[String(x.id)] = x;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function mergeRegistry(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    var lT = Date.parse(local.updatedAt) || 0;
    var rT = Date.parse(remote.updatedAt) || 0;
    var merged = {
      version: 1,
      updatedAt: new Date(Math.max(lT, rT)).toISOString(),
      users: [],
      areas: mergeById(local.areas, remote.areas),
      accessRequests: mergeById(local.accessRequests, remote.accessRequests)
    };
    var A = admin();
    if (A && A.mergeUserRegistries) {
      merged.users = A.mergeUserRegistries(local.users, remote.users);
    } else {
      merged.users = rT >= lT ? (remote.users || []) : (local.users || []);
    }
    return merged;
  }

  function snapshotSignature(snap) {
    if (!snap) return '';
    return String(snap.updatedAt || '') + '|u:' + (snap.users && snap.users.length) +
      '|a:' + (snap.areas && snap.areas.length) + '|r:' + (snap.accessRequests && snap.accessRequests.length);
  }

  function hasContent(snap) {
    return !!(snap && ((snap.users && snap.users.length) || (snap.areas && snap.areas.length) ||
      (snap.accessRequests && snap.accessRequests.length)));
  }

  function applySnapshot(snap, source) {
    if (!global.localStorage || !snap) return false;
    var sig = snapshotSignature(snap);
    if (sig === lastAppliedSig) return false;
    var A = admin();
    if (!A) return false;

    applyingRemote = true;
    try {
      if (snap.users && snap.users.length && A.importWebUsers) {
        A.importWebUsers({ users: snap.users, updatedAt: snap.updatedAt || '' });
      }
      if (snap.areas && A.saveAreas) A.saveAreas(snap.areas);
      if (snap.accessRequests && A.saveAccessRequests) A.saveAccessRequests(snap.accessRequests);
      if (A.forceSyncPrimaryCredentials) A.forceSyncPrimaryCredentials();
    } finally {
      applyingRemote = false;
    }

    lastAppliedSig = sig;
    try {
      global.dispatchEvent(new CustomEvent('registry-sync', {
        detail: { snapshot: snap, at: nowIso(), source: source || 'cloud' }
      }));
      global.dispatchEvent(new CustomEvent('lan-sync', {
        detail: { store: 'users', source: source || 'cloud' }
      }));
    } catch (e) { /* noop */ }
    return true;
  }

  function pullFromSupabase() {
    if (!hasSupabaseConfig()) return Promise.resolve(null);
    return global.PlatformSupabaseBridge.pull(MODULE);
  }

  function pushToSupabase(snap) {
    if (!hasSupabaseConfig()) return Promise.resolve(false);
    return global.PlatformSupabaseBridge.push(MODULE, snap);
  }

  function prepareSnapshotForPush(snap) {
    if (!isSupabasePrimary()) return Promise.resolve(snap);
    return pullFromSupabase().then(function (remote) {
      var merged = mergeRegistry(snap, remote);
      merged.updatedAt = nowIso();
      return merged;
    }).catch(function () {
      snap.updatedAt = nowIso();
      return snap;
    });
  }

  function promoteLocalToCloudIfNeeded() {
    if (!isSupabasePrimary()) return Promise.resolve();
    var local = buildSnapshotFromLocal();
    if (!hasContent(local)) return Promise.resolve();
    return pullFromSupabase().then(function (remote) {
      var merged = mergeRegistry(local, remote);
      if (!remote || !hasContent(remote) || snapshotSignature(merged) !== snapshotSignature(remote)) {
        merged.updatedAt = nowIso();
        return pushToSupabase(merged);
      }
    });
  }

  function bootstrapFromStaticIfEmpty() {
    if (!isSupabasePrimary()) return Promise.resolve();
    return pullFromSupabase().then(function (remote) {
      if (remote && hasContent(remote)) return;
      var url = 'data/web-users.json?v=' + encodeURIComponent(String(Date.now()));
      return global.fetch(url, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      }).then(function (payload) {
        if (!payload || !payload.users || !payload.users.length) return;
        var local = buildSnapshotFromLocal();
        var fromFile = {
          version: 1,
          updatedAt: payload.updatedAt || nowIso(),
          users: payload.users,
          areas: local.areas || [],
          accessRequests: local.accessRequests || []
        };
        var merged = mergeRegistry(local, fromFile);
        merged.updatedAt = nowIso();
        return pushToSupabase(merged).then(function (ok) {
          if (ok) applySnapshot(merged, 'bootstrap');
        });
      }).catch(function () {});
    });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(buildSnapshotFromLocal());
    pulling = true;
    var localBefore = buildSnapshotFromLocal();
    return pullFromSupabase().then(function (sbSnap) {
      var merged;
      var applySource = 'merge';

      if (isSupabasePrimary() && sbSnap) {
        merged = mergeRegistry(localBefore, sbSnap);
        applySource = 'supabase';
      } else if (sbSnap) {
        merged = mergeRegistry(localBefore, sbSnap);
      } else {
        merged = localBefore;
      }

      if (merged && hasContent(merged)) {
        applySnapshot(merged, applySource);
        lastPullAt = Date.now();

        if (isSupabasePrimary() && hasContent(localBefore)) {
          var upload = mergeRegistry(sbSnap, localBefore);
          if (!sbSnap || !hasContent(sbSnap) || snapshotSignature(upload) !== snapshotSignature(sbSnap || {})) {
            global.setTimeout(function () { pushLocal(2); }, 300);
          }
        }
      }
      return merged;
    }).finally(function () {
      pulling = false;
    });
  }

  function pushLocal(retries) {
    if (pushing || applyingRemote) return Promise.resolve(false);
    if (!hasSupabaseConfig()) return Promise.resolve(false);
    var local = buildSnapshotFromLocal();
    if (!hasContent(local)) return Promise.resolve(false);

    pushing = true;
    retries = retries == null ? 2 : retries;

    function attempt(n) {
      return prepareSnapshotForPush(local).then(function (payload) {
        return pushToSupabase(payload).then(function (ok) {
          if (ok) {
            lastAppliedSig = snapshotSignature(payload);
            if (broadcast) {
              try { broadcast.postMessage({ type: 'registry-sync', at: Date.now() }); } catch (e) { /* noop */ }
            }
            return true;
          }
          if (n < retries) {
            return new Promise(function (resolve) {
              global.setTimeout(function () { resolve(attempt(n + 1)); }, 200);
            });
          }
          return false;
        });
      });
    }

    return attempt(0).finally(function () {
      pushing = false;
    });
  }

  function initSupabase() {
    if (!hasSupabaseConfig() || !global.PlatformSupabaseBridge.subscribe) return;
    global.PlatformSupabaseBridge.subscribe(MODULE, function (remote) {
      if (remote) applySnapshot(remote, 'supabase-realtime');
    });
  }

  function pollIntervalMs() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig &&
      global.PlatformSupabase.getConfig();
    var sb = (cfg && cfg.supabase) || {};
    if (sb.freeTier || sb.preferPoll) {
      var freeMs = parseInt(cfg && cfg.syncTargetMs, 10);
      if (freeMs > 0) return Math.max(3000, freeMs);
      var freeSec = parseInt(cfg && cfg.pollSeconds, 10);
      if (freeSec > 0) return Math.max(3000, freeSec * 1000);
      return 4000;
    }
    return 4000;
  }

  function startPolling() {
    if (pollTimer) global.clearTimeout(pollTimer);
    function loop() {
      pullAll();
      pollTimer = global.setTimeout(loop, pollIntervalMs());
    }
    pollTimer = global.setTimeout(loop, pollIntervalMs());
  }

  function hookLocalStorage() {
    if (!global.localStorage || global.localStorage.__registryCloudHooked) return;
    var proto = Storage.prototype;
    var orig = proto.setItem;
    proto.setItem = function (key, value) {
      orig.call(this, key, value);
      if (!applyingRemote && (key === KEYS.users || key === KEYS.areas || key === KEYS.accessRequests)) {
        clearTimeout(hookLocalStorage.pushTimer);
        hookLocalStorage.pushTimer = global.setTimeout(function () {
          pushLocal();
        }, key === KEYS.users ? 180 : 350);
      }
    };
    global.localStorage.__registryCloudHooked = true;
  }

  function init() {
    var boot = global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false);
    return boot.then(function () {
      initSupabase();
      hookLocalStorage();
      return pullAll();
    }).then(function () {
      return bootstrapFromStaticIfEmpty();
    }).then(function () {
      return promoteLocalToCloudIfNeeded();
    }).then(function () {
      if (hasSupabaseConfig()) startPolling();
      if (broadcast) {
        broadcast.onmessage = function () { pullAll(); };
      }
      global.addEventListener('pageshow', function (ev) {
        if (!ev.persisted) return;
        pullAll();
      }, { passive: true });
      global.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') pullAll();
      }, { passive: true });
      if (readyResolve) {
        readyResolve(true);
        readyResolve = null;
      }
    }).catch(function () {
      if (readyResolve) {
        readyResolve(false);
        readyResolve = null;
      }
    });
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.PlatformRegistryCloudSync = {
    pullAll: pullAll,
    pushLocal: pushLocal,
    whenReady: function () { return readyPromise; },
    isCloudPrimary: isSupabasePrimary,
    getLastPullAt: function () { return lastPullAt; }
  };
})(typeof window !== 'undefined' ? window : this);
