/**
 * Cliente Supabase — config desde site-config.json
 */
(function (global) {
  'use strict';

  var OVERRIDE_KEY = 'platform_supabase_override';
  var client = null;
  var config = null;
  var readyPromise = null;
  var connected = false;

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

  function applyOverride(cfg) {
    cfg = cfg || {};
    try {
      var raw = global.localStorage.getItem(OVERRIDE_KEY);
      if (!raw) return cfg;
      var o = JSON.parse(raw);
      if (o && o.url && o.anonKey) {
        cfg.supabase = {
          enabled: true,
          url: o.url,
          anonKey: o.anonKey
        };
      }
    } catch (e) { /* noop */ }
    return cfg;
  }

  function getConfig() {
    return config;
  }

  function isEnabled() {
    var sb = config && config.supabase;
    return !!(sb && sb.enabled && sb.url && sb.anonKey);
  }

  function dispatchConnection(ok) {
    connected = !!ok;
    try {
      global.dispatchEvent(new CustomEvent('supabase-connection', {
        detail: { connected: connected, at: new Date().toISOString() }
      }));
    } catch (e) { /* noop */ }
  }

  function markConnected(ok) {
    dispatchConnection(!!ok);
  }

  function getClient() {
    return client;
  }

  function testConnection() {
    if (!client) return Promise.resolve(false);
    return client.from('web_snapshots').select('module').limit(1).then(function (res) {
      if (res.error) {
        return client.from('inv_users').select('employee_id').limit(1).then(function (res2) {
          var ok = !res2.error;
          dispatchConnection(ok);
          return ok;
        });
      }
      dispatchConnection(true);
      return true;
    }).catch(function () {
      dispatchConnection(false);
      return false;
    });
  }

  function saveOverride(url, anonKey) {
    try {
      global.localStorage.setItem(OVERRIDE_KEY, JSON.stringify({
        url: String(url || '').trim(),
        anonKey: String(anonKey || '').trim()
      }));
    } catch (e) { /* noop */ }
  }

  function clearOverride() {
    try { global.localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* noop */ }
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = global.fetch(siteConfigUrl(), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) {
        config = applyOverride(cfg || {});
        var sb = config.supabase;
        if (!sb || !sb.enabled || !sb.url || !sb.anonKey) {
          dispatchConnection(false);
          return false;
        }
        if (!global.supabase || !global.supabase.createClient) {
          dispatchConnection(false);
          return false;
        }
        client = global.supabase.createClient(sb.url, sb.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        markConnected(true);
        return testConnection();
      });
    return readyPromise;
  }

  global.PlatformSupabase = {
    init: init,
    isEnabled: isEnabled,
    getClient: getClient,
    getConfig: getConfig,
    testConnection: testConnection,
    markConnected: markConnected,
    saveOverride: saveOverride,
    clearOverride: clearOverride,
    isConnected: function () { return connected; }
  };
})(typeof window !== 'undefined' ? window : this);
