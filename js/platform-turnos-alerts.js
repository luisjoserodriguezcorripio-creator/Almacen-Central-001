/**
 * Control de Turnos — notificaciones supervisor (PWA / segundo plano / app cerrada)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var Sw = function () { return global.PlatformTurnosSwWatch; };
  var seen = {};
  var bootstrapped = false;
  var burstTimer = null;

  function isAdminViewActive() {
    var root = document.getElementById('turnosAdminRoot');
    return !!(root && document.body.classList.contains('turnos-admin-mode') &&
      !root.classList.contains('is-hidden'));
  }

  function shouldNotify() {
    if (!isAdminViewActive()) return false;
    if (document.visibilityState === 'hidden') return true;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
    return false;
  }

  function requestPermission() {
    if (!global.Notification) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    try {
      return Notification.requestPermission().then(function (p) { return p === 'granted'; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function buildNotificationContent(entry) {
    var isValidation = entry.estado === C().ESTADO_PENDIENTE_VALIDACION;
    var title = isValidation
      ? 'Solicitud por validar — ' + (C().TIPO_LABELS[entry.tipo] || entry.tipo)
      : (entry.prioridad ? 'Turno PRIORITARIO — ' + entry.turno : 'Nuevo turno — ' + entry.turno);
    var body = (entry.choferNombre || 'Chofer') + ' · ' + (entry.choferCompania || '—');
    if (isValidation) {
      body += ' — Confirme presencia en el almacén antes de asignar turno.';
    } else {
      body += ' · ' + (C().TIPO_LABELS[entry.tipo] || entry.tipo);
    }
    return {
      title: title,
      body: body,
      tag: 'turnos-admin-' + entry.id,
      requireInteraction: !!(entry.prioridad || isValidation),
      icon: 'assets/img/icon-turnos-validacion.svg',
      url: global.location ? global.location.href.split('#')[0] : './turnos-supervisor.html'
    };
  }

  function showBrowserNotification(entry) {
    if (!global.Notification || Notification.permission !== 'granted') return;
    if (!shouldNotify()) return;
    var content = buildNotificationContent(entry);

    function viaWindow() {
      try {
        var n = new Notification(content.title, {
          body: content.body,
          tag: content.tag,
          renotify: true,
          requireInteraction: content.requireInteraction
        });
        n.onclick = function () {
          try { global.focus(); } catch (e) { /* noop */ }
          n.close();
        };
      } catch (e) { /* noop */ }
    }

    if (Sw()) {
      Sw().showViaWorker(content);
    } else {
      viaWindow();
    }
  }

  function startBurst(entry) {
    if (burstTimer) clearInterval(burstTimer);
    showBrowserNotification(entry);
    burstTimer = setInterval(function () {
      if (!shouldNotify()) return;
      showBrowserNotification(entry);
    }, 10000);
    setTimeout(function () {
      if (burstTimer) {
        clearInterval(burstTimer);
        burstTimer = null;
      }
    }, 120000);
  }

  function alertForEntry(entry) {
    if (!entry || entry.estado === 'CANCELADO') return;
    if (!isAdminViewActive()) return;
    if (!shouldNotify()) return;
    if (entry.estado === C().ESTADO_PENDIENTE_VALIDACION) {
      startBurst(entry);
    } else {
      showBrowserNotification(entry);
    }
  }

  function trackEntry(entry) {
    var key = entry.id;
    var sig = String(entry.updatedAt || entry.createdAt || '') + '|' + entry.estado +
      '|' + (entry.horaLimite || '') + '|' + (entry.prioridad ? '1' : '0') +
      '|' + (entry.convocadoAt || '');
    var prev = seen[key];
    seen[key] = sig;
    return { isNew: !prev, changed: prev && prev !== sig, prev: prev };
  }

  function bootstrap(entries) {
    (entries || []).forEach(function (e) { trackEntry(e); });
    bootstrapped = true;
  }

  function syncBackgroundWatch(entries) {
    if (!Sw() || !isAdminViewActive()) return;
    Sw().startWatch({
      role: 'supervisor',
      bootstrap: !bootstrapped,
      bootstrapEntries: entries || [],
      openUrl: global.location ? global.location.href.split('#')[0] : './turnos-supervisor.html',
      pollMs: 12000
    });
  }

  function onStoreUpdate(shared) {
    if (!isAdminViewActive()) return;
    var entries = (shared && shared.entries) || [];
    if (!bootstrapped) {
      bootstrap(entries);
      syncBackgroundWatch(entries);
      return;
    }
    entries.forEach(function (e) {
      var t = trackEntry(e);
      if (t.isNew && e.estado !== 'CANCELADO') {
        alertForEntry(e);
        return;
      }
      if (t.changed && e.prioridad && e.estado === 'PENDIENTE' && shouldNotify()) {
        if (/prioridad/.test(t.prev || '') === false && e.prioridad) {
          alertForEntry(e);
        }
      }
    });
    syncBackgroundWatch(entries);
  }

  function onPageHide() {
    if (!isAdminViewActive()) return;
    var entries = (global.PlatformTurnosStore && global.PlatformTurnosStore.getState().entries) || [];
    var pending = entries.filter(function (e) {
      return e.estado === C().ESTADO_PENDIENTE_VALIDACION;
    });
    if (!pending.length || Notification.permission !== 'granted') return;
    showBrowserNotification(pending[pending.length - 1]);
  }

  function reset() {
    seen = {};
    bootstrapped = false;
    if (burstTimer) {
      clearInterval(burstTimer);
      burstTimer = null;
    }
  }

  function start() {
    reset();
    requestPermission();
    document.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && isAdminViewActive()) {
        var shared = global.PlatformTurnosStore && global.PlatformTurnosStore.getState();
        if (shared) syncBackgroundWatch(shared.entries || []);
      }
    });
  }

  function stop() {
    reset();
    if (Sw()) Sw().stopWatch();
  }

  global.PlatformTurnosAlerts = {
    start: start,
    stop: stop,
    reset: reset,
    onStoreUpdate: onStoreUpdate,
    requestPermission: requestPermission,
    stopAlarm: function () { /* compat admin */ },
    isAdminViewActive: isAdminViewActive
  };
})(typeof window !== 'undefined' ? window : this);
