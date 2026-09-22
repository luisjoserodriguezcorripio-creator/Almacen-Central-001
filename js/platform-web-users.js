/**
 * Usuarios publicados en la web (GitHub Pages) — data/web-users.json
 * Permite que el personal entre desde luisjoserodriguezcorripio-creator.github.io
 */
(function (global) {
  'use strict';

  var WEB_USERS_URL = 'data/web-users.json';
  var readyPromise = null;

  function isPublicWeb() {
    if (global.PlatformPerf && global.PlatformPerf.isPublicWeb) {
      return global.PlatformPerf.isPublicWeb();
    }
    var h = global.location && global.location.hostname;
    return !!(h && (h.indexOf('github.io') !== -1 || h.indexOf('githubusercontent.com') !== -1));
  }

  function getStaffUsersPayload() {
    return global.PlatformAdmin && global.PlatformAdmin.getUsers
      ? global.PlatformAdmin.getUsers()
      : [];
  }

  function getPublishBases() {
    var bases = [];
    var seen = Object.create(null);

    function add(base) {
      var b = String(base || '').replace(/\/+$/, '');
      var key = b || '__same__';
      if (seen[key]) return;
      seen[key] = 1;
      bases.push(b);
    }

    add('');
    add('http://localhost:8080');
    add('http://127.0.0.1:8080');

    try {
      var cfg = JSON.parse(global.localStorage.getItem('almacen_platform_config') || '{}');
      if (cfg.networkRelay && cfg.networkRelay.baseUrl) {
        add(cfg.networkRelay.baseUrl);
      }
    } catch (e) { /* noop */ }

    if (global.PlatformLanSync && global.PlatformLanSync.getServerInfo) {
      var info = global.PlatformLanSync.getServerInfo();
      if (info && info.urls) {
        info.urls.forEach(add);
      }
    }

    return bases;
  }

  function postPublishEndpoint(endpoint, users) {
    var bases = getPublishBases();
    var index = 0;

    function attempt() {
      if (index >= bases.length) {
        return Promise.reject(new Error('No se encontró servidor local. Ejecuta serve-dashboard.ps1 en este PC.'));
      }
      var base = bases[index++];
      var url = base ? (base + endpoint) : endpoint;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: users })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.ok) {
            throw new Error((body && body.error) || ('HTTP ' + res.status));
          }
          return body;
        });
      }).catch(function () {
        return attempt();
      });
    }

    return attempt();
  }

  function fetchWebUsersPayload() {
    var url = WEB_USERS_URL + '?v=' + encodeURIComponent(String(Date.now()));
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function isCloudPrimary() {
    return !!(global.PlatformRegistryCloudSync && global.PlatformRegistryCloudSync.isCloudPrimary &&
      global.PlatformRegistryCloudSync.isCloudPrimary());
  }

  function syncFromCloud() {
    if (!global.PlatformRegistryCloudSync || !global.PlatformRegistryCloudSync.whenReady) {
      return Promise.resolve({ ok: false, reason: 'no-registry-sync' });
    }
    return global.PlatformRegistryCloudSync.whenReady().then(function () {
      return { ok: true, source: 'registry' };
    });
  }

  function importFromWeb() {
    if (!global.PlatformAdmin || !global.PlatformAdmin.importWebUsers) {
      return Promise.resolve({ ok: false, reason: 'no-admin' });
    }
    return fetchWebUsersPayload().then(function (payload) {
      var result = global.PlatformAdmin.importWebUsers(payload);
      return { ok: true, count: result.count, updatedAt: result.updatedAt };
    }).catch(function (err) {
      return { ok: false, reason: err && err.message ? err.message : 'fetch-failed' };
    });
  }

  function mergeWebUsersAfterCloud() {
    return syncFromCloud().catch(function () {
      return { ok: false, reason: 'cloud-error' };
    }).then(function (cloud) {
      return importFromWeb().then(function (web) {
        return {
          ok: !!(web && web.ok) || !!(cloud && cloud.ok),
          cloud: cloud,
          web: web
        };
      });
    });
  }

  function ready() {
    if (!readyPromise) {
      readyPromise = mergeWebUsersAfterCloud();
    }
    return readyPromise;
  }

  function refresh() {
    var chain = Promise.resolve({ ok: false });
    if (isCloudPrimary() && global.PlatformRegistryCloudSync && global.PlatformRegistryCloudSync.pullAll) {
      chain = global.PlatformRegistryCloudSync.pullAll().then(function () {
        return { ok: true, source: 'registry-pull' };
      });
    } else {
      chain = syncFromCloud();
    }
    return chain.catch(function () {
      return { ok: false, reason: 'cloud-error' };
    }).then(function (cloud) {
      return importFromWeb().then(function (web) {
        return { ok: true, cloud: cloud, web: web };
      });
    });
  }

  function publishToDisk() {
    return postPublishEndpoint('/api/publish-web-users', getStaffUsersPayload());
  }

  function publishLive() {
    var cloudPush = (global.PlatformRegistryCloudSync && global.PlatformRegistryCloudSync.pushLocal)
      ? global.PlatformRegistryCloudSync.pushLocal()
      : Promise.resolve(false);
    return cloudPush.then(function (cloudOk) {
      return postPublishEndpoint('/api/publish-web-users-live', getStaffUsersPayload()).then(function (body) {
        if (body && body.ok) body.cloud = !!cloudOk;
        return body;
      }).catch(function (err) {
        if (cloudOk) {
          return {
            ok: true,
            live: true,
            cloud: true,
            pushed: true,
            message: 'Usuarios sincronizados en la nube (todos los dispositivos).'
          };
        }
        throw err;
      });
    });
  }

  function downloadWebUsersExport() {
    if (!global.PlatformAdmin || !global.PlatformAdmin.exportStaffForWeb) return;
    var payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      users: global.PlatformAdmin.exportStaffForWeb()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'web-users.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  }

  global.PlatformWebUsers = {
    isPublicWeb: isPublicWeb,
    ready: ready,
    refresh: refresh,
    publishToDisk: publishToDisk,
    publishLive: publishLive,
    downloadWebUsersExport: downloadWebUsersExport,
    WEB_USERS_URL: WEB_USERS_URL
  };
})(typeof window !== 'undefined' ? window : this);
