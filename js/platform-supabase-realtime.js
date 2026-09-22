/**
 * Supabase Realtime — postgres_changes para apps vanilla JS
 *
 * Uso básico (tabla genérica):
 *   var off = PlatformSupabaseRealtime.subscribeTable({
 *     table: 'inv_entries',
 *     events: ['INSERT', 'UPDATE', 'DELETE'],
 *     onEvent: function (ev) {
 *       // ev.eventType, ev.new, ev.old, ev.table, ev.commitTimestamp
 *       if (ev.eventType === 'INSERT') addRow(ev.new);
 *       if (ev.eventType === 'UPDATE') updateRow(ev.new);
 *       if (ev.eventType === 'DELETE') removeRow(ev.old.id);
 *     }
 *   });
 *   // Al salir: off();
 *
 * Snapshots JSON (web_snapshots):
 *   PlatformSupabaseRealtime.subscribeSnapshot('averias', function (data, meta) {
 *     applyState(data, meta.eventType);
 *   });
 */
(function (global) {
  'use strict';

  var subs = {};
  var subSeq = 0;
  var localPushMarks = {};
  var recentEvents = {};
  var DEDUPE_MS = 100;
  var ECHO_MS = 4000;

  function ensureReady() {
    if (!global.PlatformSupabase) return Promise.resolve(null);
    return global.PlatformSupabase.init().then(function () {
      return global.PlatformSupabase.isEnabled() ? global.PlatformSupabase.getClient() : null;
    });
  }

  /** Plan gratuito: REST poll como fuente de verdad; Realtime es opcional. */
  function preferPollOnly() {
    var cfg = global.PlatformSupabase && global.PlatformSupabase.getConfig &&
      global.PlatformSupabase.getConfig();
    if (!cfg) return false;
    if (cfg.realtime === false) return true;
    var sb = cfg.supabase;
    return !!(sb && (sb.preferPoll === true || sb.freeTier === true));
  }

  function safetyPollMs(baseMs, options) {
    if (options && options.safetyPollMs != null) return Math.max(Number(options.safetyPollMs) || 0, 2000);
    var base = Number(baseMs) || 5000;
    return Math.max(base * 2, 8000);
  }

  function nextId(prefix) {
    subSeq += 1;
    return String(prefix || 'rt') + ':' + subSeq;
  }

  function parseUpdatedAt(row) {
    if (!row) return '';
    return String(row.updated_at || row.updatedAt || '');
  }

  function markLocalPush(key, updatedAt) {
    if (!key) return;
    localPushMarks[key] = {
      at: Date.now(),
      updatedAt: String(updatedAt || '')
    };
  }

  function isEcho(key, updatedAt) {
    var mark = localPushMarks[key];
    if (!mark) return false;
    if (Date.now() - mark.at > ECHO_MS) return false;
    return !!updatedAt && updatedAt === mark.updatedAt;
  }

  function isDuplicate(key) {
    var now = Date.now();
    var prev = recentEvents[key];
    recentEvents[key] = now;
    if (prev && now - prev < DEDUPE_MS) return true;
    return false;
  }

  function pruneRecentEvents() {
    var now = Date.now();
    Object.keys(recentEvents).forEach(function (k) {
      if (now - recentEvents[k] > DEDUPE_MS * 4) delete recentEvents[k];
    });
  }

  function normalizeEvents(events) {
    if (!events || !events.length) return ['*'];
    return events;
  }

  function buildDedupeKey(table, payload) {
    var row = payload.new || payload.old || {};
    var id = row.module || row.id || row.employee_id || '';
    return table + ':' + String(payload.eventType || '*') + ':' + String(id) + ':' +
      String(payload.commit_timestamp || '');
  }

  function dispatchChange(opts, payload) {
    var dedupeKey = buildDedupeKey(opts.table, payload);
    if (isDuplicate(dedupeKey)) return;
    pruneRecentEvents();

    var eventType = payload.eventType || 'UPDATE';
    var row = eventType === 'DELETE' ? payload.old : payload.new;
    var meta = {
      eventType: eventType,
      table: opts.table,
      updatedAt: parseUpdatedAt(row),
      commitTimestamp: payload.commit_timestamp || null
    };

    if (typeof opts.shouldApply === 'function') {
      var allow = opts.shouldApply(row, meta, payload);
      if (allow === false) return;
    }

    if (opts.echoKey && isEcho(opts.echoKey, meta.updatedAt)) return;

    if (typeof opts.onEvent === 'function') {
      opts.onEvent({
        eventType: eventType,
        new: payload.new || null,
        old: payload.old || null,
        table: opts.table,
        commitTimestamp: meta.commitTimestamp
      });
    }

    if (typeof opts.onRow === 'function' && row) {
      opts.onRow(row, meta);
    }

    if (typeof opts.onData === 'function' && row && row.data !== undefined) {
      opts.onData(row.data, meta);
      return;
    }

    if (typeof opts.onChange === 'function') {
      opts.onChange(eventType, row, payload);
    }
  }

  function clearPoll(sub) {
    if (sub.pollTimer) {
      global.clearInterval(sub.pollTimer);
      sub.pollTimer = null;
    }
  }

  function teardown(sub) {
    if (!sub || sub.closed) return;
    sub.closed = true;
    clearPoll(sub);
    if (sub.client && sub.channel) {
      try { sub.client.removeChannel(sub.channel); } catch (e) { /* noop */ }
    }
    delete subs[sub.id];
  }

  /**
   * Suscripción genérica a postgres_changes.
   * Devuelve función unsubscribe() síncrona (lista para producción).
   */
  function subscribeTable(options) {
    options = options || {};
    var table = options.table;
    if (!table) return function () {};

    var id = options.id || nextId(table);
    teardown(subs[id]);

    var sub = {
      id: id,
      table: table,
      closed: false,
      client: null,
      channel: null,
      pollTimer: null,
      options: options
    };
    subs[id] = sub;

    var events = normalizeEvents(options.events);
    var filter = options.filter || null;
    var pollMs = options.pollFallbackMs != null ? options.pollFallbackMs : 0;

    function bindChannel(client) {
      if (sub.closed || !client) return;
      sub.client = client;
      if (sub.channel) {
        try { client.removeChannel(sub.channel); } catch (e) { /* noop */ }
      }

      var ch = client.channel('rt_' + id.replace(/[^a-zA-Z0-9_-]/g, '_'));
      events.forEach(function (ev) {
        var cfg = {
          event: ev,
          schema: options.schema || 'public',
          table: table
        };
        if (filter) cfg.filter = filter;
        ch = ch.on('postgres_changes', cfg, function (payload) {
          dispatchChange(options, payload);
        });
      });

      sub.channel = ch.subscribe(function (status) {
        // Nunca apagar el poll por completo: en plan gratuito Realtime puede
        // marcar SUBSCRIBED sin entregar postgres_changes.
        if (status === 'SUBSCRIBED' && pollMs > 0 && typeof options.pull === 'function') {
          if (options.pausePollOnRealtime !== false) {
            startPoll(sub, options, safetyPollMs(pollMs, options));
          }
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') &&
            pollMs > 0 && typeof options.pull === 'function') {
          startPoll(sub, options, pollMs);
        }
        if (typeof options.onStatus === 'function') {
          options.onStatus(status, { id: id, table: table });
        }
      });
    }

    function startPoll(subRef, opts, ms) {
      if (!ms || subRef.closed || typeof opts.pull !== 'function') return;
      clearPoll(subRef);
      var pull = function () {
        if (subRef.closed) return;
        if (global.document && global.document.visibilityState === 'hidden' && opts.pollWhenHidden !== true) return;
        opts.pull().then(function (data) {
          if (subRef.closed || data == null) return;
          if (typeof opts.onData === 'function') {
            opts.onData(data, { eventType: 'POLL', table: table });
          } else if (typeof opts.onChange === 'function') {
            opts.onChange('POLL', data, null);
          }
        }).catch(function () { /* noop */ });
      };
      pull();
      subRef.pollTimer = global.setInterval(pull, ms);
    }

    ensureReady().then(function (client) {
      if (sub.closed) return;
      if (client && !preferPollOnly()) bindChannel(client);
      if (pollMs > 0) startPoll(sub, options, pollMs);
    }).catch(function () {
      if (pollMs > 0) startPoll(sub, options, pollMs);
    });

    return function unsubscribe() {
      teardown(sub);
    };
  }

  /**
   * Atajo para public.web_snapshots (un módulo = una fila JSON).
   */
  function subscribeSnapshot(moduleKey, onData, extra) {
    extra = extra || {};
    if (typeof onData !== 'function') return function () {};

    return subscribeTable({
      id: 'snapshot:' + moduleKey,
      table: 'web_snapshots',
      filter: 'module=eq.' + moduleKey,
      events: extra.events || ['INSERT', 'UPDATE', 'DELETE'],
      echoKey: moduleKey,
      shouldApply: extra.shouldApply,
      onData: onData,
      onEvent: extra.onEvent,
      onStatus: extra.onStatus,
      pull: function () {
        if (!global.PlatformSupabaseBridge || !global.PlatformSupabaseBridge.pull) {
          return Promise.resolve(null);
        }
        return global.PlatformSupabaseBridge.pull(moduleKey);
      },
      pollFallbackMs: extra.pollFallbackMs != null ? extra.pollFallbackMs : 5000,
      safetyPollMs: extra.safetyPollMs,
      pausePollOnRealtime: extra.pausePollOnRealtime !== false,
      pollWhenHidden: extra.pollWhenHidden === true
    });
  }

  function unsubscribe(id) {
    if (subs[id]) teardown(subs[id]);
  }

  function unsubscribeAll() {
    Object.keys(subs).forEach(function (id) { teardown(subs[id]); });
    subs = {};
    recentEvents = {};
  }

  function getActiveCount() {
    return Object.keys(subs).length;
  }

  if (global.addEventListener) {
    global.addEventListener('beforeunload', unsubscribeAll);
    global.addEventListener('pagehide', unsubscribeAll);
  }

  global.PlatformSupabaseRealtime = {
    ensureReady: ensureReady,
    preferPollOnly: preferPollOnly,
    subscribeTable: subscribeTable,
    subscribeSnapshot: subscribeSnapshot,
    unsubscribe: unsubscribe,
    unsubscribeAll: unsubscribeAll,
    markLocalPush: markLocalPush,
    getActiveCount: getActiveCount
  };
})(typeof window !== 'undefined' ? window : this);
