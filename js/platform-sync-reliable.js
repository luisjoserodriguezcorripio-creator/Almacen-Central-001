/**
 * Cola de sync confiable — nunca descarta un push pendiente.
 * Usado por Despacho, Agenda y Recepción.
 */
(function (global) {
  'use strict';

  function asArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object') {
      return Object.keys(value).map(function (k) { return value[k]; }).filter(Boolean);
    }
    return [];
  }

  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {function():*} opts.getPayload - datos a publicar
   * @param {function(*):Promise<boolean>} opts.pushFn - debe resolver true/false
   * @param {function():boolean} [opts.isBlocked] - true mientras no se deba empujar (p.ej. applyingRemote)
   * @param {number} [opts.retryMs]
   * @param {number} [opts.maxRetryMs]
   */
  function createPushQueue(opts) {
    opts = opts || {};
    var name = opts.name || 'sync';
    var pushing = false;
    var pending = false;
    var retryMs = opts.retryMs || 400;
    var maxRetryMs = opts.maxRetryMs || 8000;
    var failStreak = 0;
    var timer = null;
    var lastOkAt = 0;
    var lastAttemptAt = 0;

    function isBlocked() {
      return !!(opts.isBlocked && opts.isBlocked());
    }

    function schedule(delay) {
      if (timer) return;
      timer = global.setTimeout(function () {
        timer = null;
        flush();
      }, Math.max(0, delay || 0));
    }

    function enqueue(reason) {
      pending = true;
      if (pushing || isBlocked()) {
        schedule(retryMs);
        return;
      }
      schedule(40);
    }

    function flush() {
      if (!pending) return Promise.resolve(false);
      if (pushing || isBlocked()) {
        schedule(retryMs);
        return Promise.resolve(false);
      }
      pending = false;
      pushing = true;
      lastAttemptAt = Date.now();
      var payload;
      try {
        payload = opts.getPayload ? opts.getPayload() : null;
      } catch (e) {
        payload = null;
      }
      return Promise.resolve()
        .then(function () {
          return opts.pushFn(payload);
        })
        .then(function (ok) {
          if (ok) {
            failStreak = 0;
            lastOkAt = Date.now();
            return true;
          }
          failStreak += 1;
          pending = true;
          var wait = Math.min(maxRetryMs, retryMs * Math.pow(1.6, Math.min(failStreak, 6)));
          schedule(wait);
          return false;
        })
        .catch(function (err) {
          failStreak += 1;
          pending = true;
          console.warn('[SyncReliable:' + name + '] push error', err);
          schedule(Math.min(maxRetryMs, retryMs * Math.pow(1.6, Math.min(failStreak, 6))));
          return false;
        })
        .finally(function () {
          pushing = false;
          if (pending) schedule(retryMs);
        });
    }

    function forceNow() {
      pending = true;
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
      return flush();
    }

    return {
      enqueue: enqueue,
      flush: flush,
      forceNow: forceNow,
      isPushing: function () { return pushing; },
      hasPending: function () { return pending; },
      getLastOkAt: function () { return lastOkAt; },
      getLastAttemptAt: function () { return lastAttemptAt; },
      getFailStreak: function () { return failStreak; }
    };
  }

  /**
   * Watchdog: reintenta si hay pendiente o si el último OK quedó viejo.
   * No bombardea Firebase mientras el sync esté sano.
   */
  function attachWatchdog(opts) {
    opts = opts || {};
    var queue = opts.queue;
    var intervalMs = opts.intervalMs || 12000;
    var staleMs = opts.staleMs || 18000;
    if (!queue) return function () {};

    function kick(reason) {
      try { queue.enqueue(reason || 'watchdog'); } catch (e) { /* noop */ }
    }

    var timer = global.setInterval(function () {
      if (global.document && global.document.visibilityState === 'hidden') return;
      if (queue.hasPending && queue.hasPending()) {
        kick('pending');
        return;
      }
      var lastOk = queue.getLastOkAt ? queue.getLastOkAt() : 0;
      if (!lastOk || (Date.now() - lastOk) >= staleMs) {
        kick('stale');
      }
    }, intervalMs);

    function onVis() {
      if (global.document.visibilityState === 'visible') kick('visible');
    }
    function onOnline() { kick('online'); }
    function onFocus() { kick('focus'); }

    if (global.document) {
      global.document.addEventListener('visibilitychange', onVis, { passive: true });
    }
    global.addEventListener('online', onOnline, { passive: true });
    global.addEventListener('focus', onFocus, { passive: true });
    global.addEventListener('pageshow', function (ev) {
      if (ev.persisted) kick('pageshow');
    }, { passive: true });

    return function teardown() {
      global.clearInterval(timer);
      if (global.document) global.document.removeEventListener('visibilitychange', onVis);
      global.removeEventListener('online', onOnline);
      global.removeEventListener('focus', onFocus);
    };
  }

  global.PlatformSyncReliable = {
    asArray: asArray,
    createPushQueue: createPushQueue,
    attachWatchdog: attachWatchdog
  };
})(typeof window !== 'undefined' ? window : this);
