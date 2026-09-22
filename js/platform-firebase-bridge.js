/**
 * Firebase RTDB — REST primero (funciona sin API key válida) + SDK opcional
 */
(function (global) {
  'use strict';

  var readyPromise = null;
  var db = null;
  var fbConfig = null;
  var connected = false;
  var restMode = true;
  var sdkFailed = true;
  var pollers = {};
  var lastPollSig = {};
  var pollMs = 400;

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.configUrl) {
      return global.PlatformSecurity.configUrl();
    }
    try {
      var h = global.location.hostname || '';
      if (h.indexOf('github.io') >= 0) return '/Almacen-Central-001/data/site-config.json';
    } catch (e) { /* noop */ }
    return 'data/site-config.json';
  }

  function dispatchConnection() {
    try {
      global.dispatchEvent(new CustomEvent('firebase-connection', {
        detail: {
          connected: connected,
          mode: restMode ? 'rest' : 'sdk',
          at: new Date().toISOString()
        }
      }));
    } catch (e) { /* noop */ }
  }

  function sanitize(data) {
    try {
      return JSON.parse(JSON.stringify(data || {}));
    } catch (err) {
      return {};
    }
  }

  function restUrl(path) {
    var base = String(fbConfig.databaseURL || '').replace(/\/+$/, '');
    var clean = String(path || '').replace(/^\//, '');
    return base + '/' + clean + '.json';
  }

  function fetchWithTimeout(url, opts, ms) {
    ms = ms || 8000;
    var ctrl = typeof global.AbortController !== 'undefined' ? new global.AbortController() : null;
    var timer;
    var p = global.fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}));
    if (ctrl) {
      timer = global.setTimeout(function () {
        try { ctrl.abort(); } catch (e) { /* noop */ }
      }, ms);
    }
    return p.finally(function () {
      if (timer) global.clearTimeout(timer);
    });
  }

  function restPush(path, data) {
    if (!fbConfig || !fbConfig.databaseURL) return Promise.resolve(false);
    return fetchWithTimeout(restUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitize(data)),
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        connected = true;
        restMode = true;
        dispatchConnection();
        return true;
      }
      return res.text().then(function (txt) {
        console.warn('[FirebaseBridge] REST push', res.status, path, txt);
        if (txt && txt.indexOf('Permission denied') >= 0) {
          try {
            global.dispatchEvent(new CustomEvent('firebase-denied', {
              detail: { path: path, hint: 'Publique firebase-database.rules.json en Firebase Console' }
            }));
          } catch (e) { /* noop */ }
        }
        return false;
      });
    }).catch(function (err) {
      console.warn('[FirebaseBridge] REST push error:', err && err.message ? err.message : err);
      return false;
    });
  }

  function restPull(path) {
    if (!fbConfig || !fbConfig.databaseURL) return Promise.resolve(null);
    return fetchWithTimeout(restUrl(path) + '?t=' + Date.now(), {
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    }).catch(function () {
      return null;
    });
  }

  function makeSnap(val) {
    return {
      val: function () { return val; },
      exists: function () { return val != null; }
    };
  }

  function startRestPoll(path, callback) {
    if (pollers[path]) return;
    function tick() {
      restPull(path).then(function (val) {
        if (val == null) return;
        connected = true;
        restMode = true;
        var sig;
        try { sig = JSON.stringify(val); } catch (e) { sig = String(Date.now()); }
        if (sig !== lastPollSig[path]) {
          lastPollSig[path] = sig;
          try { callback(makeSnap(val)); } catch (e) { /* noop */ }
        }
        dispatchConnection();
      });
    }
    tick();
    pollers[path] = global.setInterval(tick, pollMs);
  }

  function makeRef(path) {
    return {
      set: function (data) {
        return restPush(path, data);
      },
      on: function (event, callback) {
        if (event !== 'value' || typeof callback !== 'function') return;
        startRestPoll(path, callback);
      },
      once: function (event) {
        if (event !== 'value') return Promise.resolve(makeSnap(null));
        return restPull(path).then(function (val) { return makeSnap(val); });
      }
    };
  }

  function makeDbAdapter() {
    return {
      ref: function (path) { return makeRef(path); },
      goOnline: function () { /* REST siempre activo */ }
    };
  }

  function loadFirebaseConfig() {
    if (fbConfig) return Promise.resolve(fbConfig);
    return global.fetch(siteConfigUrl() + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('site-config HTTP ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        fbConfig = cfg && cfg.firebase ? cfg.firebase : null;
        if (cfg && cfg.syncTargetMs) {
          pollMs = Math.max(350, Math.min(1000, parseInt(cfg.syncTargetMs, 10) || 400));
        }
        return fbConfig;
      });
  }

  function tryInitSdk() {
    if (!global.firebase || !fbConfig || !fbConfig.apiKey) return null;
    try {
      var app;
      try {
        app = global.firebase.app();
      } catch (e) {
        app = global.firebase.initializeApp(fbConfig);
      }
      var rtdb = global.firebase.database(app);
      sdkFailed = false;
      restMode = false;
      db = rtdb;
      return rtdb;
    } catch (err) {
      console.warn('[FirebaseBridge] SDK init:', err && err.message ? err.message : err);
      sdkFailed = true;
      return null;
    }
  }

  function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = loadFirebaseConfig().then(function (fb) {
      if (!fb || !fb.enabled || !fb.databaseURL) return null;
      var sdk = tryInitSdk();
      if (sdk) {
        connected = true;
        restMode = false;
        dispatchConnection();
        return sdk;
      }
      connected = true;
      restMode = true;
      dispatchConnection();
      return makeDbAdapter();
    }).catch(function (err) {
      console.warn('[FirebaseBridge] config error:', err);
      return null;
    });
    return readyPromise;
  }

  global.PlatformFirebaseBridge = {
    ensureReady: ensureReady,
    getDb: function () {
      if (db) return db;
      if (fbConfig && fbConfig.enabled && fbConfig.databaseURL) return makeDbAdapter();
      return null;
    },
    isConnected: function () { return connected; },
    isRestMode: function () { return restMode; },
    getMode: function () { return restMode ? 'rest' : 'sdk'; },
    isEnabled: function () { return !!(fbConfig && fbConfig.enabled && fbConfig.databaseURL); },
    push: restPush,
    pull: restPull,
    ref: function (path) { return makeRef(path); },
    getPollMs: function () { return pollMs; }
  };

  if (global.document) {
    ensureReady();
  }
})(typeof window !== 'undefined' ? window : this);
