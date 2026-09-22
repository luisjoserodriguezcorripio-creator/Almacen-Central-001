/**
 * Control de Turnos — modelo, estados y persistencia v2
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'dc_turnos_despacho_v2';
  var CHOFER_NAME_KEY = 'dc_turnos_chofer_name';
  var CHOFER_COMPANIA_KEY = 'dc_turnos_chofer_compania';
  var MY_TURN_KEY = 'dc_turnos_my_active';
  var CONVOCADO_SEEN_PREFIX = 'dc_turnos_convocado_seen_';
  var DEDUP_MS = 8000;

  var TIPOS = {
    DESPACHO: 'despacho_facturas',
    LIQUIDACION: 'liquidacion_facturas',
    NOTA_CREDITO: 'nota_credito'
  };

  var TIPO_LABELS = {
    despacho_facturas: 'Despacho de facturas',
    liquidacion_facturas: 'Liquidación de facturas',
    nota_credito: 'Nota de crédito'
  };

  var VENTANA_LABELS = {
    despacho_facturas: 'Ventana de Despacho de facturas',
    liquidacion_facturas: 'Ventana de Liquidación de facturas',
    nota_credito: 'Ventana de Nota de crédito'
  };

  var COMPANIAS_CHOFER = [
    'Almacén Central 001',
    'Transportes del Centro',
    'Logística Nacional',
    'Ruta Norte',
    'Ruta Sur',
    'Transporte tercero',
    'Otra'
  ];

  var TIPOS_CAMION = ['T1', 'T2', 'T4'];

  var PASO_LABELS = {
    REGISTRO: 'Registro del turno',
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    CONFIRMADO: 'Confirmado',
    COMPLETADO: 'Completado',
    ASENTADO: 'Asentado',
    CANCELADO: 'Cancelado',
    CONVOCADO: 'Convocado a ventana',
    HORA_LIMITE: 'Hora límite',
    COMPANIA: 'Compañía asignada',
    SOLICITUD: 'Solicitud enviada',
    PENDIENTE_VALIDACION: 'Pendiente validación',
    VALIDACION_SUPERVISOR: 'Validado por supervisor'
  };

  var ESTADO_PENDIENTE_VALIDACION = 'PENDIENTE_VALIDACION';

  var TZ_RD = 'America/Santo_Domingo';
  var LOCALE_RD = 'es-DO';

  function partsInTZ(d, tz) {
    d = d || new Date();
    tz = tz || TZ_RD;
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(d).forEach(function (p) {
        if (p.type !== 'literal') parts[p.type] = p.value;
      });
    } catch (e) {
      parts.year = String(d.getFullYear());
      parts.month = String(d.getMonth() + 1).padStart(2, '0');
      parts.day = String(d.getDate()).padStart(2, '0');
      parts.hour = String(d.getHours()).padStart(2, '0');
      parts.minute = String(d.getMinutes()).padStart(2, '0');
      parts.second = String(d.getSeconds()).padStart(2, '0');
    }
    return parts;
  }

  function todayKey(d) {
    var p = partsInTZ(d);
    return p.year + '-' + p.month + '-' + p.day;
  }

  function formatTime(d) {
    var p = partsInTZ(d);
    return p.hour + ':' + p.minute + ':' + p.second;
  }

  function formatTimeInput(d) {
    var p = partsInTZ(d);
    return p.hour + ':' + p.minute;
  }

  function hourInTZ(d) {
    return parseInt(partsInTZ(d).hour, 10) || 0;
  }

  function formatClockTime(d) {
    d = d || new Date();
    try {
      return d.toLocaleTimeString(LOCALE_RD, {
        timeZone: TZ_RD,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return formatTime(d).slice(0, 5);
    }
  }

  function formatClockDate(d) {
    d = d || new Date();
    try {
      return d.toLocaleDateString(LOCALE_RD, {
        timeZone: TZ_RD,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return formatFechaDisplay(todayKey(d));
    }
  }

  function formatDateTimeLocale(at) {
    if (!at) return '—';
    var d = new Date(at);
    if (isNaN(d.getTime())) return '—';
    try {
      return d.toLocaleString(LOCALE_RD, {
        timeZone: TZ_RD,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return d.toLocaleString('es-DO');
    }
  }

  function formatTurno(n) {
    return 'T-' + String(Math.max(0, n)).padStart(4, '0');
  }

  function formatFechaDisplay(fecha) {
    if (!fecha) return '—';
    var p = String(fecha).split('-');
    if (p.length !== 3) return fecha;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatFechaLongRD(d) {
    d = d || new Date();
    try {
      return d.toLocaleDateString(LOCALE_RD, {
        timeZone: TZ_RD,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return formatFechaDisplay(todayKey(d));
    }
  }

  function recalcCounterFromEntries(entries) {
    return (entries || []).reduce(function (max, e) {
      var n = parseInt(String(e.turno || '').replace(/\D/g, ''), 10) || 0;
      return Math.max(max, n);
    }, 0);
  }

  /** Solo actualiza la fecha de vista del dashboard — nunca borra turnos ni reinicia numeración. */
  function syncDashboardMeta(state) {
    state = state || { counter: 0, entries: [], dashboardDay: '', autoResetDashboard: true };
    var day = todayKey();
    var auto = state.autoResetDashboard !== false;
    var dashDay = String(state.dashboardDay || state.operatingDay || '').trim();
    var next = Object.assign({}, state, {
      autoResetDashboard: auto,
      dashboardDay: dashDay || day,
      operatingDay: dashDay || day
    });

    if (auto && dashDay && dashDay !== day) {
      next.dashboardDay = day;
      next.operatingDay = day;
      return { changed: true, freshDay: true, state: next };
    }

    if (!dashDay) {
      next.dashboardDay = day;
      next.operatingDay = day;
      return { changed: true, freshDay: true, state: next };
    }

    return { changed: false, freshDay: auto && dashDay === day, state: next };
  }

  function formatFechaHora(entry) {
    if (!entry) return '—';
    return formatFechaDisplay(entry.fecha) + ' · ' + (entry.hora || '—');
  }

  function pasoLabel(paso) {
    return PASO_LABELS[paso] || String(paso || '').replace(/_/g, ' ');
  }

  function createSeguimientoItem(ev, compania) {
    ev = ev || {};
    var at = Number(ev.at) || Date.now();
    var d = ev.fecha ? null : new Date(at);
    return {
      at: at,
      fecha: ev.fecha || (d ? todayKey(d) : todayKey()),
      hora: ev.hora || (d ? formatTime(d) : formatTime()),
      paso: ev.paso || 'REGISTRO',
      estado: ev.estado || 'PENDIENTE',
      nota: String(ev.nota || '').trim(),
      por: String(ev.por || '').trim(),
      compania: String(ev.compania || compania || '').trim()
    };
  }

  function appendSeguimiento(historial, ev, compania) {
    var hist = (historial || []).slice();
    hist.push(createSeguimientoItem(ev, compania));
    return hist;
  }

  function ensureSeguimiento(entry) {
    if (!entry) return [];
    if (entry.historial && entry.historial.length) return entry.historial;
    return [createSeguimientoItem({
      at: entry.createdAt,
      fecha: entry.fecha,
      hora: entry.hora,
      paso: 'REGISTRO',
      estado: entry.estado || 'PENDIENTE',
      nota: entry.detalle || 'Registro inicial',
      por: entry.choferNombre
    }, entry.choferCompania)];
  }

  function mergeSeguimientoOnPatch(old, patch, updatedBy) {
    var hist = (old.historial || []).slice();
    var compania = old.choferCompania || '';
    var por = updatedBy || patch.updatedBy || 'admin';
    if (patch.estado && patch.estado !== old.estado) {
      hist = appendSeguimiento(hist, {
        paso: patch.estado,
        estado: patch.estado,
        nota: 'Estado actualizado',
        por: por,
        compania: compania
      }, compania);
    }
    if (patch.convocadoAt && Number(patch.convocadoAt) !== Number(old.convocadoAt || 0)) {
      hist = appendSeguimiento(hist, {
        paso: 'CONVOCADO',
        estado: patch.estado || old.estado,
        nota: 'Convocado a ventana de atención',
        por: por,
        compania: compania
      }, compania);
    }
    if (patch.turno && patch.turno !== old.turno && old.estado === ESTADO_PENDIENTE_VALIDACION) {
      hist = appendSeguimiento(hist, {
        paso: 'VALIDACION_SUPERVISOR',
        estado: 'PENDIENTE',
        nota: 'Supervisor validó presencia — turno ' + patch.turno,
        por: por,
        compania: compania
      }, compania);
    }
    if (patch.horaLimite && patch.horaLimite !== old.horaLimite) {
      hist = appendSeguimiento(hist, {
        paso: 'HORA_LIMITE',
        estado: old.estado,
        nota: 'Hora límite: ' + patch.horaLimite,
        por: por,
        compania: compania
      }, compania);
    }
    if (patch.choferCompania !== undefined && patch.choferCompania !== old.choferCompania) {
      hist = appendSeguimiento(hist, {
        paso: 'COMPANIA',
        estado: old.estado,
        nota: 'Compañía: ' + patch.choferCompania,
        por: por,
        compania: patch.choferCompania
      }, patch.choferCompania);
    }
    return hist;
  }

  function normalizeHistorialItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return createSeguimientoItem(raw, raw.compania);
  }

  function normalizeTipoCamion(val) {
    var v = String(val || '').trim().toUpperCase();
    return TIPOS_CAMION.indexOf(v) >= 0 ? v : '';
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var estado = String(raw.estado || 'PENDIENTE').toUpperCase();
    if (estado === 'VALIDADO') estado = 'COMPLETADO';
    var tipo = raw.tipo || TIPOS.DESPACHO;
    if (!TIPO_LABELS[tipo]) tipo = TIPOS.DESPACHO;
    var entry = {
      id: raw.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
      turno: raw.estado === ESTADO_PENDIENTE_VALIDACION
        ? String(raw.turno || '').trim()
        : (raw.turno || formatTurno(0)),
      fecha: raw.fecha || todayKey(),
      hora: raw.hora || formatTime(),
      createdAt: Number(raw.createdAt) || Date.now(),
      tipo: tipo,
      choferNombre: String(raw.choferNombre || '').trim(),
      choferCompania: String(raw.choferCompania || '').trim(),
      idsCarga: String(raw.idsCarga || raw.qrContent || '').trim(),
      tipoCamion: normalizeTipoCamion(raw.tipoCamion),
      cantidadPaletas: raw.cantidadPaletas != null && raw.cantidadPaletas !== ''
        ? Number(raw.cantidadPaletas) : null,
      cantidadViajes: raw.cantidadViajes != null ? Number(raw.cantidadViajes) : null,
      detalle: String(raw.detalle || '').trim(),
      estado: estado,
      convocadoAt: raw.convocadoAt != null ? Number(raw.convocadoAt) : null,
      updatedAt: raw.updatedAt != null ? Number(raw.updatedAt) : null,
      updatedBy: String(raw.updatedBy || '').trim(),
      prioridad: !!raw.prioridad,
      horaLimite: String(raw.horaLimite || '').trim(),
      prioridadAutorizadaPor: String(raw.prioridadAutorizadaPor || '').trim(),
      historial: Array.isArray(raw.historial)
        ? raw.historial.map(normalizeHistorialItem).filter(Boolean)
        : []
    };
    entry.historial = ensureSeguimiento(entry);
    return entry;
  }

  /** PIN turnos prioritarios: nacimiento Juan Pablo Duarte — 26/01/1813 */
  var PRIORITY_PIN = '26011813';
  var PRIORITY_PIN_HINT = '26/01/1813';

  function priorityPinValue() {
    return PRIORITY_PIN;
  }

  function normalizePriorityPin(pin) {
    return String(pin || '').replace(/\D/g, '');
  }

  function priorityPinHint() {
    return PRIORITY_PIN_HINT;
  }

  function verifyAdminPin(pin) {
    return normalizePriorityPin(pin) === PRIORITY_PIN;
  }

  function attendanceRank(entry) {
    if (!entry) return 99;
    if (entry.estado === 'PENDIENTE') return 0;
    if (entry.estado === 'EN_PROCESO' || entry.estado === 'CONFIRMADO') return 1;
    if (entry.estado === 'COMPLETADO' || entry.estado === 'ASENTADO') return 2;
    if (entry.estado === 'CANCELADO') return 3;
    return 4;
  }

  /** Cola de atención: pendientes arriba (FIFO), prioritarios adelante; cerrados abajo. */
  function sortForAttendanceQueue(entries) {
    return (entries || []).slice().sort(function (a, b) {
      var ra = attendanceRank(a);
      var rb = attendanceRank(b);
      if (ra !== rb) return ra - rb;
      if (!!a.prioridad !== !!b.prioridad) return a.prioridad ? -1 : 1;
      var ta = Number(a.createdAt) || 0;
      var tb = Number(b.createdAt) || 0;
      if (ta !== tb) return ta - tb;
      return String(a.turno || '').localeCompare(String(b.turno || ''));
    });
  }

  function sortEntries(entries) {
    return sortForAttendanceQueue(entries);
  }

  /** Orden de llegada cronológico (prioritarios adelante). */
  function sortByArrivalOrder(entries) {
    return (entries || []).slice().sort(function (a, b) {
      if (!!a.prioridad !== !!b.prioridad) return a.prioridad ? -1 : 1;
      var ta = Number(a.createdAt) || 0;
      var tb = Number(b.createdAt) || 0;
      if (ta !== tb) return ta - tb;
      return String(a.turno || '').localeCompare(String(b.turno || ''));
    });
  }

  function latestEntry(entries, filterFn) {
    var list = (entries || []).filter(filterFn || function () { return true; });
    if (!list.length) return null;
    return list.reduce(function (best, e) {
      return (Number(e.createdAt) || 0) > (Number(best.createdAt) || 0) ? e : best;
    });
  }

  function ventanaLabel(tipo) {
    return VENTANA_LABELS[tipo] || 'Ventana de atención';
  }

  function isPendingValidation(entry) {
    return !!entry && entry.estado === ESTADO_PENDIENTE_VALIDACION;
  }

  function isChoferSessionActive(entry) {
    if (!entry || entry.estado === 'CANCELADO') return false;
    if (entry.estado === ESTADO_PENDIENTE_VALIDACION) return true;
    return isTurnActive(entry);
  }

  function isTurnActive(entry) {
    if (!entry) return false;
    if (entry.estado === ESTADO_PENDIENTE_VALIDACION) return false;
    if (entry.estado === 'COMPLETADO' || entry.estado === 'ASENTADO' || entry.estado === 'CANCELADO') return false;
    return true;
  }

  function canCancelByChofer(entry) {
    if (!entry || !isChoferSessionActive(entry)) return false;
    if (entry.estado === ESTADO_PENDIENTE_VALIDACION) return true;
    return entry.estado === 'PENDIENTE' || entry.estado === 'EN_PROCESO' || entry.estado === 'CONFIRMADO';
  }

  function sessionStore() {
    try { return global.sessionStorage; } catch (e) { return null; }
  }

  function saveMyTurn(entry) {
    if (!entry || !entry.id) return;
    var ss = sessionStore();
    if (!ss) return;
    try {
      ss.setItem(MY_TURN_KEY, JSON.stringify({
        id: entry.id,
        turno: entry.turno,
        tipo: entry.tipo,
        choferNombre: entry.choferNombre
      }));
    } catch (e) { /* noop */ }
  }

  function getMyTurnRef() {
    var ss = sessionStore();
    if (!ss) return null;
    try {
      var raw = ss.getItem(MY_TURN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearMyTurn() {
    var ss = sessionStore();
    if (!ss) return;
    try { ss.removeItem(MY_TURN_KEY); } catch (e) { /* noop */ }
  }

  function findActiveTurnForChofer(entries, nombre) {
    var ref = getMyTurnRef();
    if (ref && ref.id) {
      var byId = (entries || []).find(function (e) { return e.id === ref.id; });
      if (byId && isChoferSessionActive(byId)) return byId;
    }
    var key = String(nombre || ref && ref.choferNombre || getRememberedChoferName() || '').trim().toLowerCase();
    if (!key) return null;
    return (entries || []).find(function (e) {
      return isChoferSessionActive(e) && e.choferNombre.toLowerCase() === key;
    }) || null;
  }

  function getConvocadoSeen(id) {
    var ss = sessionStore();
    if (!ss) return 0;
    try {
      return Number(ss.getItem(CONVOCADO_SEEN_PREFIX + id)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function markConvocadoSeen(id, ts) {
    var ss = sessionStore();
    if (!ss) return;
    try {
      ss.setItem(CONVOCADO_SEEN_PREFIX + id, String(ts || Date.now()));
    } catch (e) { /* noop */ }
  }

  function vibrateCall() {
    try {
      if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500, 120, 500]);
    } catch (e) { /* noop */ }
    playBeep();
  }

  function migrateState(parsed) {
    var entries = (parsed.entries || []).map(normalizeEntry).filter(Boolean);
    return {
      counter: Number(parsed.counter) || 0,
      entries: entries
    };
  }

  function loadLegacyLocalState() {
    try {
      if (!global.localStorage) return { counter: 0, entries: [] };
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return migrateState(JSON.parse(raw));
      raw = localStorage.getItem('dc_turnos_despacho_v1');
      if (raw) return migrateState(JSON.parse(raw));
    } catch (e) { /* noop */ }
    return { counter: 0, entries: [] };
  }

  function clearLegacyLocalState() {
    try {
      if (!global.localStorage) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('dc_turnos_despacho_v1');
    } catch (e) { /* noop */ }
  }

  function loadState() {
    return loadLegacyLocalState();
  }

  function saveState() {
    /* Los turnos ya no se guardan en localStorage — solo nube. */
  }

  function buildDetalle(payload) {
    var nombre = String(payload.choferNombre || '').trim();
    var compania = String(payload.choferCompania || '').trim();
    var base = '';
    if (compania) base = 'Compañía: ' + compania + ' · ';
    if (payload.tipo === TIPOS.DESPACHO) {
      var cam = normalizeTipoCamion(payload.tipoCamion);
      var pal = payload.cantidadPaletas;
      base += 'Chofer: ' + nombre + ' · Camión ' + (cam || '—') + ' · ' + (pal != null ? pal : '—') + ' paletas';
    } else if (payload.tipo === TIPOS.LIQUIDACION) {
      base += 'Chofer: ' + nombre + ' · Viajes: ' + String(payload.cantidadViajes || '');
    } else if (payload.tipo === TIPOS.NOTA_CREDITO) {
      base += 'Chofer: ' + nombre + ' · Nota de crédito';
    } else {
      base += nombre;
    }
    if (payload.prioridad) base += ' · PRIORIDAD';
    return base;
  }

  function seguimientoResumen(entry) {
    return ensureSeguimiento(entry).map(function (h) {
      return formatFechaDisplay(h.fecha) + ' ' + h.hora + ' — ' + pasoLabel(h.paso) +
        (h.compania ? ' (' + h.compania + ')' : '');
    }).join(' | ');
  }

  function createSolicitudTurno(payload) {
    var now = new Date();
    payload = payload || {};
    var compania = String(payload.choferCompania || '').trim();
    return normalizeEntry({
      id: String(now.getTime()) + '-' + Math.random().toString(36).slice(2, 7),
      turno: '',
      fecha: todayKey(now),
      hora: formatTime(now),
      createdAt: now.getTime(),
      tipo: payload.tipo || TIPOS.DESPACHO,
      choferNombre: payload.choferNombre,
      choferCompania: compania,
      idsCarga: payload.idsCarga,
      tipoCamion: normalizeTipoCamion(payload.tipoCamion),
      cantidadPaletas: payload.cantidadPaletas != null ? Number(payload.cantidadPaletas) : null,
      cantidadViajes: payload.cantidadViajes,
      detalle: buildDetalle(payload),
      estado: ESTADO_PENDIENTE_VALIDACION,
      prioridad: !!payload.prioridad,
      horaLimite: '',
      prioridadAutorizadaPor: payload.prioridad ? String(payload.prioridadAutorizadaPor || 'admin').trim() : '',
      historial: [createSeguimientoItem({
        paso: 'SOLICITUD',
        estado: ESTADO_PENDIENTE_VALIDACION,
        nota: 'Solicitud enviada — espera validación del supervisor en el almacén',
        por: payload.choferNombre,
        compania: compania,
        fecha: todayKey(now),
        hora: formatTime(now)
      }, compania)]
    });
  }

  function createTurn(counter, payload) {
    var now = new Date();
    payload = payload || {};
    var compania = String(payload.choferCompania || '').trim();
    var entry = normalizeEntry({
      id: String(now.getTime()) + '-' + Math.random().toString(36).slice(2, 7),
      turno: formatTurno(counter),
      fecha: todayKey(now),
      hora: formatTime(now),
      createdAt: now.getTime(),
      tipo: payload.tipo || TIPOS.DESPACHO,
      choferNombre: payload.choferNombre,
      choferCompania: compania,
      idsCarga: payload.idsCarga,
      tipoCamion: normalizeTipoCamion(payload.tipoCamion),
      cantidadPaletas: payload.cantidadPaletas != null ? Number(payload.cantidadPaletas) : null,
      cantidadViajes: payload.cantidadViajes,
      detalle: buildDetalle(payload),
      estado: 'PENDIENTE',
      prioridad: !!payload.prioridad,
      horaLimite: '',
      prioridadAutorizadaPor: payload.prioridad ? String(payload.prioridadAutorizadaPor || 'admin').trim() : '',
      historial: [createSeguimientoItem({
        paso: 'REGISTRO',
        estado: 'PENDIENTE',
        nota: 'Turno registrado por el chofer',
        por: payload.choferNombre,
        compania: compania,
        fecha: todayKey(now),
        hora: formatTime(now)
      }, compania)]
    });
    return entry;
  }

  function allowedStates(tipo) {
    if (tipo === TIPOS.NOTA_CREDITO) {
      return ['PENDIENTE', 'CONFIRMADO', 'ASENTADO', 'CANCELADO'];
    }
    return ['PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'CANCELADO'];
  }

  function isValidTransition(entry, nextEstado) {
    if (entry.estado === ESTADO_PENDIENTE_VALIDACION) {
      return nextEstado === 'CANCELADO';
    }
    if (nextEstado === 'CANCELADO') {
      return isTurnActive(entry);
    }
    if (entry.estado === 'CANCELADO') return false;
    var allowed = allowedStates(entry.tipo);
    return allowed.indexOf(nextEstado) >= 0;
  }

  function isDuplicateSubmit(entries, payload) {
    var cutoff = Date.now() - DEDUP_MS;
    var nombre = String(payload.choferNombre || '').trim().toLowerCase();
    var tipo = payload.tipo;
    return entries.some(function (e) {
      if (!isChoferSessionActive(e) || e.createdAt < cutoff || e.tipo !== tipo) return false;
      if (e.choferNombre.toLowerCase() !== nombre) return false;
      if (tipo === TIPOS.DESPACHO) {
        return normalizeTipoCamion(e.tipoCamion) === normalizeTipoCamion(payload.tipoCamion) &&
          Number(e.cantidadPaletas) === Number(payload.cantidadPaletas);
      }
      if (tipo === TIPOS.LIQUIDACION) {
        return Number(e.cantidadViajes) === Number(payload.cantidadViajes);
      }
      return true;
    });
  }

  function statsToday(entries) {
    var day = todayKey();
    var today = entries.filter(function (e) { return e.fecha === day; });
    return {
      totalHoy: today.length,
      pendientes: today.filter(function (e) { return e.estado === 'PENDIENTE'; }).length,
      pendientesValidacion: today.filter(function (e) { return e.estado === ESTADO_PENDIENTE_VALIDACION; }).length,
      enProceso: today.filter(function (e) { return e.estado === 'EN_PROCESO'; }).length,
      completados: today.filter(function (e) { return e.estado === 'COMPLETADO'; }).length,
      notasPendientes: today.filter(function (e) {
        return e.tipo === TIPOS.NOTA_CREDITO && e.estado === 'PENDIENTE';
      }).length,
      confirmados: today.filter(function (e) { return e.estado === 'CONFIRMADO'; }).length,
      asentados: today.filter(function (e) { return e.estado === 'ASENTADO'; }).length,
      cancelados: today.filter(function (e) { return e.estado === 'CANCELADO'; }).length,
      prioridades: today.filter(function (e) { return e.prioridad && e.estado !== 'CANCELADO'; }).length
    };
  }

  function entriesToday(entries) {
    var day = todayKey();
    return entries.filter(function (e) { return e.fecha === day; });
  }

  function filterByTipo(entries, tipo, includeCancelados) {
    return entries.filter(function (e) {
      if (e.tipo !== tipo) return false;
      if (!includeCancelados && e.estado === 'CANCELADO') return false;
      return true;
    });
  }

  function filterCancelados(entries) {
    return entries.filter(function (e) { return e.estado === 'CANCELADO'; });
  }

  function rememberChoferName(name) {
    var ss = sessionStore();
    if (!ss) return;
    try {
      ss.setItem(CHOFER_NAME_KEY, String(name || '').trim());
    } catch (e) { /* noop */ }
  }

  function rememberChoferCompania(name) {
    var ss = sessionStore();
    if (!ss) return;
    try {
      ss.setItem(CHOFER_COMPANIA_KEY, String(name || '').trim());
    } catch (e) { /* noop */ }
  }

  function getRememberedChoferName() {
    var ss = sessionStore();
    if (!ss) return '';
    try {
      return ss.getItem(CHOFER_NAME_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function getRememberedChoferCompania() {
    var ss = sessionStore();
    if (!ss) return '';
    try {
      return ss.getItem(CHOFER_COMPANIA_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function playBeep() {
    try {
      var ctx = new (global.AudioContext || global.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.26);
      setTimeout(function () { ctx.close(); }, 400);
    } catch (e) { /* noop */ }
  }

  function filterPendingValidation(entries) {
    return (entries || []).filter(function (e) { return e.estado === ESTADO_PENDIENTE_VALIDACION; });
  }

  function statusClass(estado) {
    if (estado === ESTADO_PENDIENTE_VALIDACION) return 'warn';
    if (estado === 'CANCELADO') return 'cancel';
    if (estado === 'COMPLETADO' || estado === 'ASENTADO') return 'ok';
    if (estado === 'EN_PROCESO' || estado === 'CONFIRMADO') return 'process';
    return 'pending';
  }

  function priorityBadgeHtml(entry) {
    if (!entry || !entry.prioridad) return '';
    return '<span class="turnos-badge turnos-badge--priority">PRIORIDAD</span>';
  }

  global.PlatformTurnosCore = {
    STORAGE_KEY: STORAGE_KEY,
    TIPOS: TIPOS,
    TIPOS_CAMION: TIPOS_CAMION,
    TIPO_LABELS: TIPO_LABELS,
    loadState: loadState,
    loadLegacyLocalState: loadLegacyLocalState,
    clearLegacyLocalState: clearLegacyLocalState,
    saveState: saveState,
    createSolicitudTurno: createSolicitudTurno,
    createTurn: createTurn,
    normalizeTipoCamion: normalizeTipoCamion,
    buildDetalle: buildDetalle,
    allowedStates: allowedStates,
    isValidTransition: isValidTransition,
    isDuplicateSubmit: isDuplicateSubmit,
    statsToday: statsToday,
    formatTurno: formatTurno,
    playBeep: playBeep,
    todayKey: todayKey,
    formatTime: formatTime,
    formatTimeInput: formatTimeInput,
    hourInTZ: hourInTZ,
    formatClockTime: formatClockTime,
    formatClockDate: formatClockDate,
    formatDateTimeLocale: formatDateTimeLocale,
    TZ_RD: TZ_RD,
    rememberChoferName: rememberChoferName,
    rememberChoferCompania: rememberChoferCompania,
    getRememberedChoferName: getRememberedChoferName,
    getRememberedChoferCompania: getRememberedChoferCompania,
    formatFechaDisplay: formatFechaDisplay,
    formatFechaLongRD: formatFechaLongRD,
    syncDashboardMeta: syncDashboardMeta,
    recalcCounterFromEntries: recalcCounterFromEntries,
    formatFechaHora: formatFechaHora,
    pasoLabel: pasoLabel,
    ensureSeguimiento: ensureSeguimiento,
    mergeSeguimientoOnPatch: mergeSeguimientoOnPatch,
    seguimientoResumen: seguimientoResumen,
    COMPANIAS_CHOFER: COMPANIAS_CHOFER,
    statusClass: statusClass,
    normalizeEntry: normalizeEntry,
    ventanaLabel: ventanaLabel,
    filterPendingValidation: filterPendingValidation,
    isPendingValidation: isPendingValidation,
    isChoferSessionActive: isChoferSessionActive,
    isTurnActive: isTurnActive,
    ESTADO_PENDIENTE_VALIDACION: ESTADO_PENDIENTE_VALIDACION,
    canCancelByChofer: canCancelByChofer,
    entriesToday: entriesToday,
    filterByTipo: filterByTipo,
    filterCancelados: filterCancelados,
    findActiveTurnForChofer: findActiveTurnForChofer,
    saveMyTurn: saveMyTurn,
    getMyTurnRef: getMyTurnRef,
    clearMyTurn: clearMyTurn,
    getConvocadoSeen: getConvocadoSeen,
    markConvocadoSeen: markConvocadoSeen,
    vibrateCall: vibrateCall,
    verifyAdminPin: verifyAdminPin,
    priorityPinValue: priorityPinValue,
    priorityPinHint: priorityPinHint,
    sortEntries: sortEntries,
    sortByArrivalOrder: sortByArrivalOrder,
    sortForAttendanceQueue: sortForAttendanceQueue,
    latestEntry: latestEntry,
    priorityBadgeHtml: priorityBadgeHtml,
    VENTANA_LABELS: VENTANA_LABELS
  };
})(typeof window !== 'undefined' ? window : this);
