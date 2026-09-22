/**
 * Red privada (túnel) — invisible para usuarios finales.
 * El admin activa/desactiva; en WiFi restringido redirige o enruta datos al servidor LAN.
 * Nota: no es VPN del sistema; es relay/redirección dentro de la app.
 */
(function (global) {
  'use strict';

  var CONFIG_KEY = 'almacen_platform_config';
  var REDIRECT_FLAG = 'dc_relay_redirect_v1';
  var patched = false;

  function readRelayConfig() {
    try {
      var cfg = JSON.parse(global.localStorage.getItem(CONFIG_KEY) || '{}');
      return cfg.networkRelay || null;
    } catch (e) {
      return null;
    }
  }

  function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function isPublicHost() {
    var h = global.location && global.location.hostname;
    if (!h) return false;
    return h.indexOf('github.io') !== -1 || h.indexOf('githubusercontent.com') !== -1;
  }

  function isLanHost() {
    var h = global.location && global.location.hostname;
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    return false;
  }

  function isRelayEnabled() {
    var r = readRelayConfig();
    return !!(r && r.enabled && normalizeBase(r.baseUrl));
  }

  function getRelayBase() {
    var r = readRelayConfig();
    return r ? normalizeBase(r.baseUrl) : '';
  }

  function canFetchViaRelay() {
    if (!isRelayEnabled() || isLanHost()) return false;
    var base = getRelayBase();
    if (!base) return false;
    if (global.location.protocol === 'https:' && /^http:\/\//i.test(base)) return false;
    return true;
  }

  function shouldAutoRedirect() {
    var r = readRelayConfig();
    if (!r || !r.enabled || !normalizeBase(r.baseUrl)) return false;
    if (r.autoRedirect === false) return false;
    if (!isPublicHost()) return false;
    if (global.sessionStorage && global.sessionStorage.getItem(REDIRECT_FLAG)) return false;
    return true;
  }

  function rewriteUrl(url) {
    if (!canFetchViaRelay()) return url;
    var base = getRelayBase();
    var rel = String(url || '');
    if (/^https?:\/\//i.test(rel)) {
      try {
        var u = new global.URL(rel, global.location.href);
        if (u.origin !== global.location.origin) return url;
        rel = u.pathname + u.search;
      } catch (e) {
        return url;
      }
    }
    rel = rel.replace(/^\.\//, '');
    if (/^\/?data\//.test(rel) || rel.indexOf('data/web-users.json') === 0) {
      return base + '/' + rel.replace(/^\//, '');
    }
    if (/^\/?api\//.test(rel)) {
      return base + '/' + rel.replace(/^\//, '');
    }
    return url;
  }

  function patchFetch() {
    if (patched || !global.fetch) return;
    patched = true;
    var nativeFetch = global.fetch.bind(global);
    global.fetch = function (input, init) {
      if (typeof input === 'string') {
        return nativeFetch(rewriteUrl(input), init);
      }
      if (input && input.url) {
        var next = rewriteUrl(input.url);
        if (next !== input.url) {
          input = new global.Request(next, input);
        }
      }
      return nativeFetch(input, init);
    };
  }

  function applyStealthClass() {
    var root = global.document && global.document.documentElement;
    if (!root) return;
    var on = isRelayEnabled() && (isPublicHost() || canFetchViaRelay());
    root.classList.toggle('dc-relay-stealth', on);
  }

  function fetchWithTimeout(url, ms) {
    ms = ms || 2800;
    var ctrl = typeof global.AbortController !== 'undefined' ? new global.AbortController() : null;
    var timer = global.setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, ms);
    var opts = { cache: 'no-store', mode: 'cors' };
    if (ctrl) opts.signal = ctrl.signal;
    return global.fetch(url, opts).finally(function () {
      global.clearTimeout(timer);
    });
  }

  function tryAutoRedirect() {
    if (!shouldAutoRedirect()) return;
    var base = getRelayBase();
    if (!base) return;
    var healthUrl = base + '/api/health';
    fetchWithTimeout(healthUrl, 3200).then(function (res) {
      if (!res || !res.ok) return;
      if (global.sessionStorage) global.sessionStorage.setItem(REDIRECT_FLAG, '1');
      var target = base + global.location.pathname + global.location.search + global.location.hash;
      global.location.replace(target);
    }).catch(function () { /* sin servidor alcanzable */ });
  }

  function probeRelayUrl(url) {
    var base = normalizeBase(url);
    if (!base) return Promise.resolve({ ok: false, error: 'URL vacía' });
    return fetchWithTimeout(base + '/api/health', 4000).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.ok) throw new Error('Servidor no responde');
        return { ok: true, base: base, health: body };
      });
    });
  }

  function saveRelayConfig(patch) {
    if (!global.localStorage || !global.PlatformStore) return null;
    var cfg = global.PlatformStore.getConfig();
    cfg.networkRelay = Object.assign({
      enabled: false,
      baseUrl: '',
      autoRedirect: true
    }, cfg.networkRelay || {}, patch || {});
    global.PlatformStore.saveConfig(cfg);
    return cfg.networkRelay;
  }

  function applyRelayFromConfig() {
    patchFetch();
    applyStealthClass();
    if (shouldAutoRedirect()) tryAutoRedirect();
    return isRelayEnabled();
  }

  function toggleRelayEnabled(force) {
    var r = readRelayConfig() || {};
    var next = typeof force === 'boolean' ? force : !r.enabled;
    saveRelayConfig({ enabled: next });
    applyRelayFromConfig();
    return next;
  }

  function syncAdminToggleUi() {
    var btn = global.document && global.document.getElementById('btnNetworkRelay');
    if (!btn) return;
    var on = isRelayEnabled();
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Red privada: activa (solo admin)' : 'Red privada: inactiva (solo admin)';
  }

  function init() {
    patchFetch();
    applyStealthClass();
    if (shouldAutoRedirect()) {
      tryAutoRedirect();
    }
    syncAdminToggleUi();
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.PlatformNetworkRelay = {
    readRelayConfig: readRelayConfig,
    isRelayEnabled: isRelayEnabled,
    canFetchViaRelay: canFetchViaRelay,
    isPublicHost: isPublicHost,
    isLanHost: isLanHost,
    rewriteUrl: rewriteUrl,
    probeRelayUrl: probeRelayUrl,
    saveRelayConfig: saveRelayConfig,
    applyRelayFromConfig: applyRelayFromConfig,
    toggleRelayEnabled: toggleRelayEnabled,
    syncAdminToggleUi: syncAdminToggleUi,
    tryAutoRedirect: tryAutoRedirect
  };
})(typeof window !== 'undefined' ? window : this);
