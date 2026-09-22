/**
 * Puente Supabase — sync central de TODA la web (WMS, averías, despacho, inventario)
 * Realtime: postgres_changes vía PlatformSupabaseRealtime + REST fallback
 */
(function (global) {
  'use strict';

  var TABLE = 'web_snapshots';
  var snapshotUnsubs = {};
  var lastPullAt = {};

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function isEnabled() {
    return !!(global.PlatformSupabase && global.PlatformSupabase.isEnabled());
  }

  function isPrimary() {
    if (!isEnabled()) return false;
    var cfg = global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sbCfg = cfg && cfg.supabase;
    if (sbCfg && sbCfg.primary === false) return false;
    return true;
  }

  function restConfig() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sb = cfg && cfg.supabase;
    if (!sb || !sb.enabled || !sb.url || !sb.anonKey) return null;
    return { url: String(sb.url).replace(/\/+$/, ''), key: sb.anonKey };
  }

  function pollFallbackMs() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    var sb = cfg && cfg.supabase;
    // Plan gratuito: poll REST moderado (menos egress / sin websockets)
    if (sb && (sb.freeTier || sb.preferPoll)) {
      var freeMs = cfg && cfg.syncTargetMs;
      if (typeof freeMs === 'number' && freeMs > 0) return Math.max(freeMs, 3000);
      var freeSec = cfg && cfg.pollSeconds;
      if (typeof freeSec === 'number' && freeSec > 0) return Math.max(freeSec * 1000, 3000);
      return 4000;
    }
    if (sb && sb.primary !== false) return 8000;
    var ms = cfg && cfg.syncTargetMs;
    if (typeof ms === 'number' && ms > 0) return Math.max(ms, 2000);
    var sec = cfg && cfg.pollSeconds;
    if (typeof sec === 'number' && sec > 0) return sec * 1000;
    return 5000;
  }

  function realtimeEnabled() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig && global.PlatformSupabase.getConfig();
    if (cfg && cfg.realtime === false) return false;
    var sb = cfg && cfg.supabase;
    // freeTier + preferPoll: sync solo por REST (plan gratuito estable)
    if (sb && (sb.preferPoll === true || sb.freeTier === true)) return false;
    return true;
  }

  function sanitize(data) {
    try { return JSON.parse(JSON.stringify(data || {})); } catch (e) { return data || {}; }
  }

  function markConnected(ok) {
    if (global.PlatformSupabase && global.PlatformSupabase.markConnected) {
      global.PlatformSupabase.markConnected(!!ok);
    }
  }

  function ensureReady() {
    if (!global.PlatformSupabase) return Promise.resolve(null);
    return global.PlatformSupabase.init().then(function () {
      return isEnabled() ? sb() : null;
    });
  }

  function pullViaRest(moduleKey) {
    var rc = restConfig();
    if (!rc || !moduleKey) return Promise.resolve(null);
    return global.fetch(
      rc.url + '/rest/v1/' + TABLE + '?module=eq.' + encodeURIComponent(moduleKey) + '&select=data,updated_at',
      {
        headers: {
          apikey: rc.key,
          Authorization: 'Bearer ' + rc.key
        },
        cache: 'no-store',
        mode: 'cors'
      }
    ).then(function (res) {
      if (!res.ok) return null;
      return res.json().then(function (rows) {
        var row = rows && rows[0];
        var data = row && row.data ? row.data : null;
        if (data) {
          markConnected(true);
          lastPullAt[moduleKey] = Date.now();
        }
        return data;
      });
    }).catch(function () { return null; });
  }

  function pushViaRest(moduleKey, data) {
    var rc = restConfig();
    if (!rc || !moduleKey || !data) return Promise.resolve(false);
    var updatedAt = new Date().toISOString();
    var row = {
      module: moduleKey,
      data: sanitize(data),
      updated_at: updatedAt
    };
    return global.fetch(rc.url + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: {
        apikey: rc.key,
        Authorization: 'Bearer ' + rc.key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row),
      mode: 'cors'
    }).then(function (res) {
      var ok = res.ok;
      if (ok) {
        markConnected(true);
        if (global.PlatformSupabaseRealtime && global.PlatformSupabaseRealtime.markLocalPush) {
          global.PlatformSupabaseRealtime.markLocalPush(moduleKey, updatedAt);
        }
      }
      return ok;
    }).catch(function () { return false; });
  }

  function pull(moduleKey) {
    if (!moduleKey) return Promise.resolve(null);
    return ensureReady().then(function (client) {
      if (!client) return pullViaRest(moduleKey);
      return client.from(TABLE)
        .select('data, updated_at')
        .eq('module', moduleKey)
        .maybeSingle()
        .then(function (res) {
          if (res.error || !res.data) return pullViaRest(moduleKey);
          markConnected(true);
          lastPullAt[moduleKey] = Date.now();
          return res.data.data || null;
        })
        .catch(function () { return pullViaRest(moduleKey); });
    }).catch(function () { return pullViaRest(moduleKey); });
  }

  function push(moduleKey, data) {
    if (!moduleKey || !data) return Promise.resolve(false);
    var updatedAt = new Date().toISOString();
    return ensureReady().then(function (client) {
      if (!client) return pushViaRest(moduleKey, data);
      var row = {
        module: moduleKey,
        data: sanitize(data),
        updated_at: updatedAt
      };
      return client.from(TABLE)
        .upsert(row, { onConflict: 'module' })
        .then(function (res) {
          if (res.error) return pushViaRest(moduleKey, data);
          markConnected(true);
          if (global.PlatformSupabaseRealtime && global.PlatformSupabaseRealtime.markLocalPush) {
            global.PlatformSupabaseRealtime.markLocalPush(moduleKey, updatedAt);
          }
          return true;
        })
        .catch(function () { return pushViaRest(moduleKey, data); });
    }).catch(function () { return pushViaRest(moduleKey, data); });
  }

  /**
   * Suscripción en tiempo real a un módulo (web_snapshots).
   * INSERT / UPDATE / DELETE → callback con data JSON actualizada.
   * Devuelve unsubscribe() síncrona.
   */
  function subscribe(moduleKey, callback) {
    if (!moduleKey || typeof callback !== 'function') return function () {};

    if (snapshotUnsubs[moduleKey]) {
      try { snapshotUnsubs[moduleKey](); } catch (e) { /* noop */ }
      delete snapshotUnsubs[moduleKey];
    }

    if (!realtimeEnabled() || !global.PlatformSupabaseRealtime) {
      var pollOnly = global.setInterval(function () {
        if (global.document && global.document.visibilityState === 'hidden') return;
        pull(moduleKey).then(function (data) {
          if (data) callback(data);
        });
      }, pollFallbackMs());
      snapshotUnsubs[moduleKey] = function () {
        global.clearInterval(pollOnly);
        delete snapshotUnsubs[moduleKey];
      };
      pull(moduleKey).then(function (data) {
        if (data) callback(data);
      });
      return snapshotUnsubs[moduleKey];
    }

    var unsub = global.PlatformSupabaseRealtime.subscribeSnapshot(moduleKey, function (data) {
      if (data) callback(data);
    }, {
      pollFallbackMs: pollFallbackMs(),
      safetyPollMs: Math.max(pollFallbackMs() * 2, 10000),
      pausePollOnRealtime: true
    });

    snapshotUnsubs[moduleKey] = function () {
      try { unsub(); } catch (e) { /* noop */ }
      delete snapshotUnsubs[moduleKey];
    };

    return snapshotUnsubs[moduleKey];
  }

  function unsubscribe(moduleKey) {
    if (snapshotUnsubs[moduleKey]) {
      snapshotUnsubs[moduleKey]();
    }
  }

  function unsubscribeAll() {
    Object.keys(snapshotUnsubs).forEach(function (key) {
      snapshotUnsubs[key]();
    });
    if (global.PlatformSupabaseRealtime && global.PlatformSupabaseRealtime.unsubscribeAll) {
      global.PlatformSupabaseRealtime.unsubscribeAll();
    }
  }

  global.PlatformSupabaseBridge = {
    TABLE: TABLE,
    ensureReady: ensureReady,
    isEnabled: isEnabled,
    isPrimary: isPrimary,
    pull: pull,
    push: push,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    unsubscribeAll: unsubscribeAll,
    getLastPullAt: function (moduleKey) { return lastPullAt[moduleKey] || 0; }
  };
})(typeof window !== 'undefined' ? window : this);
