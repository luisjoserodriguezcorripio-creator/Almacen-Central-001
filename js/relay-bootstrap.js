(function (global) {
  'use strict';
  var SK = 'dc_relay_redirect_v1';
  var CFG_SK = 'dc_site_public_sync_v1';

  function isPublicHost() {
    try {
      var h = global.location.hostname || '';
      return h.indexOf('github.io') >= 0 || h.indexOf('githubusercontent.com') >= 0;
    } catch (e) {
      return false;
    }
  }

  function siteConfigUrl() {
    if (isPublicHost()) return '/Almacen-Central-001/data/site-config.json';
    return 'data/site-config.json';
  }

  function tryRedirectToPublicSync(base) {
    base = String(base || '').trim().replace(/\/+$/, '');
    if (!base) return;
    try {
      if (global.sessionStorage && global.sessionStorage.getItem(SK)) return;
      var ctrl = global.AbortController ? new global.AbortController() : null;
      var timer = global.setTimeout(function () { if (ctrl) ctrl.abort(); }, 3200);
      var opts = { cache: 'no-store', mode: 'cors' };
      if (ctrl) opts.signal = ctrl.signal;
      global.fetch(base + '/api/health', opts).then(function (res) {
        global.clearTimeout(timer);
        if (!res || !res.ok) return;
        if (global.sessionStorage) global.sessionStorage.setItem(SK, '1');
        global.location.replace(base + global.location.pathname + global.location.search + global.location.hash);
      }).catch(function () { global.clearTimeout(timer); });
    } catch (e) { /* noop */ }
  }

  function applyPublicSyncFromSiteConfig() {
    if (!isPublicHost()) return;
    try {
      if (global.sessionStorage && global.sessionStorage.getItem(CFG_SK)) return;
    } catch (e) { /* noop */ }
    var url = siteConfigUrl() + '?t=' + Date.now();
    global.fetch(url, { cache: 'no-store', mode: 'cors' }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (cfg) {
      if (!cfg) return;
      try { if (global.sessionStorage) global.sessionStorage.setItem(CFG_SK, '1'); } catch (e) { /* noop */ }
      var base = String(cfg.publicSyncBaseUrl || '').trim().replace(/\/+$/, '');
      if (!base) return;
      try {
        var raw = global.localStorage.getItem('almacen_platform_config') || '{}';
        var localCfg = JSON.parse(raw);
        localCfg.networkRelay = Object.assign({}, localCfg.networkRelay || {}, {
          enabled: true,
          baseUrl: base,
          autoRedirect: true
        });
        global.localStorage.setItem('almacen_platform_config', JSON.stringify(localCfg));
      } catch (e) { /* noop */ }
      tryRedirectToPublicSync(base);
    }).catch(function () { /* noop */ });
  }

  try {
    if (global.sessionStorage && global.sessionStorage.getItem(SK)) {
      applyPublicSyncFromSiteConfig();
      return;
    }
    var cfg = JSON.parse(global.localStorage.getItem('almacen_platform_config') || '{}');
    var r = cfg.networkRelay;
    if (r && r.enabled && r.baseUrl && r.autoRedirect !== false && isPublicHost()) {
      tryRedirectToPublicSync(r.baseUrl);
      return;
    }
    applyPublicSyncFromSiteConfig();
  } catch (e) { /* noop */ }
})(typeof window !== 'undefined' ? window : this);
