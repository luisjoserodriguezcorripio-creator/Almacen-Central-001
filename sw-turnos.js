/**
 * Service Worker — notificaciones turnos (chofer convocado + supervisor validación)
 * v2 — polling en segundo plano cuando la app está minimizada o cerrada (PWA)
 */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

var watchState = {
  active: false,
  role: null,
  pollUrl: null,
  apiKey: null,
  myTurnId: null,
  choferName: null,
  openUrl: './turnos.html',
  pollMs: 12000,
  knownEntries: {},
  convocadoSeen: {},
  timer: null
};

function stopPollTimer() {
  if (watchState.timer) {
    clearInterval(watchState.timer);
    watchState.timer = null;
  }
}

function entrySig(e) {
  return String(e.id || '') + '|' + String(e.updatedAt || e.createdAt || '') + '|' +
    String(e.estado || '') + '|' + String(e.convocadoAt || '') + '|' +
    (e.prioridad ? '1' : '0');
}

function showNotif(title, body, tag, url, requireInteraction, icon) {
  return self.registration.showNotification(title, {
    body: body,
    tag: tag || 'turnos-notify',
    requireInteraction: !!requireInteraction,
    renotify: true,
    icon: icon || 'assets/img/icon-turnos-gestion.svg',
    vibrate: [400, 150, 400, 150, 600],
    data: { url: url || './turnos.html' }
  });
}

function fetchTurnosData() {
  if (!watchState.pollUrl || !watchState.apiKey) return Promise.resolve(null);
  var url = watchState.pollUrl + '/rest/v1/web_snapshots?module=eq.turnos&select=data';
  return fetch(url, {
    headers: {
      apikey: watchState.apiKey,
      Authorization: 'Bearer ' + watchState.apiKey
    },
    cache: 'no-store'
  }).then(function (res) {
    if (!res.ok) return null;
    return res.json();
  }).then(function (rows) {
    return rows && rows[0] && rows[0].data ? rows[0].data : null;
  }).catch(function () { return null; });
}

function findChoferEntry(entries) {
  var list = entries || [];
  var i;
  if (watchState.myTurnId) {
    for (i = 0; i < list.length; i += 1) {
      if (list[i].id === watchState.myTurnId) return list[i];
    }
  }
  var name = String(watchState.choferName || '').trim().toLowerCase();
  if (!name) return null;
  for (i = 0; i < list.length; i += 1) {
    var e = list[i];
    if (e.estado === 'CANCELADO' || e.estado === 'ATENDIDO') continue;
    if (String(e.choferNombre || '').trim().toLowerCase() === name) return e;
  }
  return null;
}

function ventanaLabel(tipo) {
  if (tipo === 'DESPACHO') return 'ventana de despacho de facturas';
  if (tipo === 'LIQUIDACION') return 'ventana de liquidación de facturas';
  if (tipo === 'NOTA_CREDITO') return 'ventana de nota de crédito';
  return 'ventana de atención';
}

function tipoLabel(tipo) {
  if (tipo === 'DESPACHO') return 'Despacho';
  if (tipo === 'LIQUIDACION') return 'Liquidación';
  if (tipo === 'NOTA_CREDITO') return 'Nota de crédito';
  return tipo || 'Turno';
}

function processSupervisorEntries(entries, notify) {
  (entries || []).forEach(function (e) {
    if (!e || e.estado === 'CANCELADO') return;
    var key = e.id;
    var sig = entrySig(e);
    var prev = watchState.knownEntries[key];
    watchState.knownEntries[key] = sig;
    if (!notify || prev === sig) return;

    if (e.estado === 'PENDIENTE_VALIDACION' && !prev) {
      showNotif(
        'Solicitud por validar — ' + tipoLabel(e.tipo),
        (e.choferNombre || 'Chofer') + ' · ' + (e.choferCompania || '—') +
          ' — Confirme presencia en el almacén.',
        'turnos-admin-' + e.id,
        watchState.openUrl,
        true,
        'assets/img/icon-turnos-validacion.svg'
      );
      return;
    }
    if (e.estado === 'PENDIENTE' && e.prioridad && prev && prev.indexOf('|1') === -1) {
      showNotif(
        'Turno PRIORITARIO — ' + (e.turno || ''),
        (e.choferNombre || 'Chofer') + ' · ' + tipoLabel(e.tipo),
        'turnos-admin-prio-' + e.id,
        watchState.openUrl,
        true,
        'assets/img/icon-turnos-validacion.svg'
      );
    }
  });
}

function processChoferEntry(entry, notify) {
  if (!entry || !entry.convocadoAt) return;
  var seen = Number(watchState.convocadoSeen[entry.id]) || 0;
  if (seen >= entry.convocadoAt) return;
  var sig = entrySig(entry);
  var prev = watchState.knownEntries[entry.id];
  watchState.knownEntries[entry.id] = sig;
  if (!notify) return;
  if (prev && prev.indexOf(String(entry.convocadoAt)) !== -1) return;

  showNotif(
    '¡Ya es su turno! ' + (entry.turno || ''),
    'Diríjase a la ' + ventanaLabel(entry.tipo) + '.',
    'turnos-chofer-call-' + entry.id,
    watchState.openUrl,
    true,
    'assets/img/icon-turnos-gestion.svg'
  );
}

function pollOnce() {
  if (!watchState.active) return;
  fetchTurnosData().then(function (data) {
    if (!data) return;
    var entries = data.entries || [];
    if (watchState.role === 'supervisor') {
      processSupervisorEntries(entries, true);
    } else if (watchState.role === 'chofer') {
      processChoferEntry(findChoferEntry(entries), true);
    }
  });
}

function startWatch(data) {
  stopPollTimer();
  watchState.active = true;
  watchState.role = data.role || 'supervisor';
  watchState.pollUrl = data.pollUrl || null;
  watchState.apiKey = data.apiKey || null;
  watchState.myTurnId = data.myTurnId || null;
  watchState.choferName = data.choferName || null;
  watchState.openUrl = data.openUrl || (watchState.role === 'supervisor' ? './turnos-supervisor.html' : './turnos.html');
  watchState.pollMs = Math.max(Number(data.pollMs) || 12000, 8000);
  if (data.convocadoSeen && typeof data.convocadoSeen === 'object') {
    watchState.convocadoSeen = data.convocadoSeen;
  }

  watchState.knownEntries = {};
  if (data.bootstrap && data.bootstrapEntries && data.bootstrapEntries.length) {
    if (watchState.role === 'supervisor') {
      processSupervisorEntries(data.bootstrapEntries, false);
    } else {
      processChoferEntry(findChoferEntry(data.bootstrapEntries), false);
    }
  }

  watchState.timer = setInterval(pollOnce, watchState.pollMs);
  pollOnce();
}

function stopWatch() {
  watchState.active = false;
  stopPollTimer();
  watchState.knownEntries = {};
}

function updateWatch(data) {
  if (data.myTurnId !== undefined) watchState.myTurnId = data.myTurnId;
  if (data.choferName !== undefined) watchState.choferName = data.choferName;
  if (data.convocadoSeen && typeof data.convocadoSeen === 'object') {
    watchState.convocadoSeen = data.convocadoSeen;
  }
  if (data.markConvocadoSeen && data.markConvocadoSeen.id) {
    watchState.convocadoSeen[data.markConvocadoSeen.id] = data.markConvocadoSeen.at;
  }
}

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'turnos-call' || data.type === 'turnos-alert') {
    var title = data.title || 'Turnos DC';
    var options = {
      body: data.body || '',
      tag: data.tag || 'turnos-notify',
      requireInteraction: data.requireInteraction !== false,
      renotify: true,
      icon: data.icon || 'assets/img/icon-turnos-gestion.svg',
      vibrate: [400, 150, 400, 150, 600],
      data: { url: data.url || './turnos.html' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }
  if (data.type === 'turnos-watch-start') {
    startWatch(data);
    return;
  }
  if (data.type === 'turnos-watch-stop') {
    stopWatch();
    return;
  }
  if (data.type === 'turnos-watch-update') {
    updateWatch(data);
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './turnos.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      var i;
      for (i = 0; i < list.length; i += 1) {
        if ('focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
