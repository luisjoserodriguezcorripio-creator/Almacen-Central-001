/**
 * Agenda operativa — núcleo (puestos, estados, reglas del día)
 */
(function (global) {
  'use strict';

  var TZ = 'America/Santo_Domingo';
  var SEED_URL = 'data/agenda-seed.json';

  var ESTADO_PENDIENTE = 'PENDIENTE';
  var ESTADO_EN_PROCESO = 'EN_PROCESO';
  var ESTADO_COMPLETADO = 'COMPLETADO';

  var ESTADOS = [ESTADO_PENDIENTE, ESTADO_EN_PROCESO, ESTADO_COMPLETADO];

  var ESTADO_LABELS = {
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    COMPLETADO: 'Completado'
  };

  var FREQ_LABELS = {
    DIARIA: 'Diaria',
    INTER_DIARIA: 'Inter-diaria',
    SEMANAL: 'Semanal'
  };

  var PUESTOS = [
    { id: 'supervisor_inventario', label: 'Supervisor de Inventario', short: 'Inv. supervisor' },
    { id: 'digitadora_inventario', label: 'Digitadora de Inventario', short: 'Digitadora' },
    { id: 'coordinador_almacen', label: 'Coordinador Almacén', short: 'Coord. almacén' },
    { id: 'auxiliar_despacho', label: 'Auxiliar de Despacho', short: 'Aux. despacho' },
    { id: 'supervisor_despacho', label: 'Supervisor de Despacho', short: 'Sup. despacho' },
    { id: 'supervisor_validadores', label: 'Supervisor de Validadores', short: 'Validadores' },
    { id: 'supervisor_devoluciones', label: 'Supervisor de Devoluciones', short: 'Devoluciones' },
    { id: 'coordinador_recepcion', label: 'Coordinador Recepción', short: 'Recepción' },
    { id: 'supervisora_oficina', label: 'Supervisora de Oficina', short: 'Oficina' }
  ];

  var PUESTO_BY_ID = {};
  PUESTOS.forEach(function (p) { PUESTO_BY_ID[p.id] = p; });

  function partsInTZ(d) {
    d = d || new Date();
    var fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short'
    });
    var parts = fmt.formatToParts(d);
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return map;
  }

  function todayKey(d) {
    var p = partsInTZ(d);
    return p.year + '-' + p.month + '-' + p.day;
  }

  function formatDateDisplay(key) {
    if (!key) return '—';
    try {
      var d = new Date(key + 'T12:00:00');
      return new Intl.DateTimeFormat('es-DO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch (e) {
      return key;
    }
  }

  function formatClockTime(d) {
    d = d || new Date();
    return new Intl.DateTimeFormat('es-DO', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  }

  function weekdayIndex(d) {
    var p = partsInTZ(d);
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[p.weekday] != null ? map[p.weekday] : 0;
  }

  function dayOfYear(d) {
    var p = partsInTZ(d);
    var dt = new Date(Number(p.year), Number(p.month) - 1, Number(p.day));
    var start = new Date(Number(p.year), 0, 0);
    return Math.floor((dt - start) / 86400000);
  }

  function isTaskDueOnDay(template, dayKey) {
    if (!template) return false;
    var freq = String(template.frecuencia || 'DIARIA').toUpperCase();
    if (freq === 'DIARIA') return true;
    var d = new Date(dayKey + 'T12:00:00');
    if (freq === 'SEMANAL') return weekdayIndex(d) === 1;
    if (freq === 'INTER_DIARIA') return dayOfYear(d) % 2 === 0;
    return true;
  }

  function normalizeTemplate(raw) {
    if (!raw || !raw.id || !raw.puesto || !raw.actividad) return null;
    return {
      id: String(raw.id),
      puesto: String(raw.puesto),
      numero: Number(raw.numero) || 0,
      frecuencia: String(raw.frecuencia || 'DIARIA').toUpperCase(),
      actividad: String(raw.actividad).trim(),
      minutos: Math.max(Number(raw.minutos) || 0, 0)
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') {
      return { version: 1, templates: [], daily: {}, updatedAt: '' };
    }
    var templates = (raw.templates || []).map(normalizeTemplate).filter(Boolean);
    templates.sort(function (a, b) {
      if (a.puesto !== b.puesto) return a.puesto.localeCompare(b.puesto);
      return (a.numero || 999) - (b.numero || 999);
    });
    return {
      version: Number(raw.version) || 1,
      templates: templates,
      daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : {},
      updatedAt: String(raw.updatedAt || '')
    };
  }

  function emptyTaskProgress() {
    return {
      estado: ESTADO_PENDIENTE,
      comentarios: '',
      horaEjecucion: '',
      updatedAt: '',
      updatedBy: '',
      history: []
    };
  }

  function ensureDayBucket(state, dayKey) {
    if (!state.daily) state.daily = {};
    if (!state.daily[dayKey]) state.daily[dayKey] = {};
    return state.daily[dayKey];
  }

  function ensurePuestoBucket(state, dayKey, puestoId) {
    var day = ensureDayBucket(state, dayKey);
    if (!day[puestoId]) day[puestoId] = { tasks: {} };
    if (!day[puestoId].tasks) day[puestoId].tasks = {};
    return day[puestoId].tasks;
  }

  function getTaskProgress(state, dayKey, puestoId, taskId) {
    var bucket = state.daily && state.daily[dayKey] && state.daily[dayKey][puestoId];
    var raw = bucket && bucket.tasks && bucket.tasks[taskId];
    if (!raw) return emptyTaskProgress();
    return {
      estado: ESTADOS.indexOf(raw.estado) >= 0 ? raw.estado : ESTADO_PENDIENTE,
      comentarios: String(raw.comentarios || ''),
      horaEjecucion: String(raw.horaEjecucion || ''),
      updatedAt: String(raw.updatedAt || ''),
      updatedBy: String(raw.updatedBy || ''),
      history: Array.isArray(raw.history) ? raw.history.slice() : []
    };
  }

  function templatesForPuesto(state, puestoId) {
    return (state.templates || []).filter(function (t) { return t.puesto === puestoId; });
  }

  function tasksForDay(state, dayKey, puestoId) {
    return templatesForPuesto(state, puestoId)
      .filter(function (t) { return isTaskDueOnDay(t, dayKey); })
      .map(function (t) {
        var prog = getTaskProgress(state, dayKey, puestoId, t.id);
        return {
          template: t,
          progress: prog,
          overdue: prog.estado !== ESTADO_COMPLETADO
        };
      });
  }

  function statsForPuesto(state, dayKey, puestoId) {
    var tasks = tasksForDay(state, dayKey, puestoId);
    var total = tasks.length;
    var done = tasks.filter(function (x) { return x.progress.estado === ESTADO_COMPLETADO; }).length;
    var inProg = tasks.filter(function (x) { return x.progress.estado === ESTADO_EN_PROCESO; }).length;
    var pending = total - done - inProg;
    var pct = total ? Math.round((done / total) * 100) : 0;
    var minutesTotal = tasks.reduce(function (s, x) { return s + (x.template.minutos || 0); }, 0);
    var minutesDone = tasks.filter(function (x) { return x.progress.estado === ESTADO_COMPLETADO; })
      .reduce(function (s, x) { return s + (x.template.minutos || 0); }, 0);
    return { total: total, done: done, inProg: inProg, pending: pending, pct: pct, minutesTotal: minutesTotal, minutesDone: minutesDone };
  }

  function statsAllPuestos(state, dayKey) {
    return PUESTOS.map(function (p) {
      var st = statsForPuesto(state, dayKey, p.id);
      return { puesto: p, stats: st };
    });
  }

  function normalizeAgendaPuesto(value) {
    var id = String(value || '').trim();
    if (!id || !PUESTO_BY_ID[id]) return '';
    return id;
  }

  function canManageAll(user) {
    var Admin = global.PlatformAdmin;
    if (!user || !Admin) return false;
    if (user.isPrimaryAdmin) return true;
    if (user.role === 'administrador') return true;
    return Admin.can(user.role, 'agenda.all', user);
  }

  function getUserAgendaPuesto(user) {
    if (!user) return '';
    return normalizeAgendaPuesto(user.agendaPuesto);
  }

  function resolveUserPuestos(user) {
    if (canManageAll(user)) return null;
    var assigned = getUserAgendaPuesto(user);
    if (assigned) return [assigned];
    return [];
  }

  function userHasAgendaAccess(user) {
    if (!user) return false;
    var Admin = global.PlatformAdmin;
    if (!Admin || !Admin.can(user.role, 'agenda.use', user)) return false;
    if (canManageAll(user)) return true;
    return !!getUserAgendaPuesto(user);
  }

  function loadSeedTemplates() {
    return fetch(SEED_URL, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.templates) return [];
        return data.templates.map(normalizeTemplate).filter(Boolean);
      })
      .catch(function () { return []; });
  }

  function nextEstado(current) {
    if (current === ESTADO_PENDIENTE) return ESTADO_EN_PROCESO;
    if (current === ESTADO_EN_PROCESO) return ESTADO_COMPLETADO;
    return ESTADO_PENDIENTE;
  }

  function puestoLabel(id) {
    var p = PUESTO_BY_ID[id];
    return p ? p.label : id || '—';
  }

  global.PlatformAgendaCore = {
    TZ: TZ,
    SEED_URL: SEED_URL,
    ESTADO_PENDIENTE: ESTADO_PENDIENTE,
    ESTADO_EN_PROCESO: ESTADO_EN_PROCESO,
    ESTADO_COMPLETADO: ESTADO_COMPLETADO,
    ESTADOS: ESTADOS,
    ESTADO_LABELS: ESTADO_LABELS,
    FREQ_LABELS: FREQ_LABELS,
    PUESTOS: PUESTOS,
    PUESTO_BY_ID: PUESTO_BY_ID,
    todayKey: todayKey,
    formatDateDisplay: formatDateDisplay,
    formatClockTime: formatClockTime,
    isTaskDueOnDay: isTaskDueOnDay,
    normalizeTemplate: normalizeTemplate,
    normalizeState: normalizeState,
    normalizeAgendaPuesto: normalizeAgendaPuesto,
    emptyTaskProgress: emptyTaskProgress,
    ensurePuestoBucket: ensurePuestoBucket,
    getTaskProgress: getTaskProgress,
    templatesForPuesto: templatesForPuesto,
    tasksForDay: tasksForDay,
    statsForPuesto: statsForPuesto,
    statsAllPuestos: statsAllPuestos,
    canManageAll: canManageAll,
    getUserAgendaPuesto: getUserAgendaPuesto,
    resolveUserPuestos: resolveUserPuestos,
    userHasAgendaAccess: userHasAgendaAccess,
    puestoLabel: puestoLabel,
    loadSeedTemplates: loadSeedTemplates,
    nextEstado: nextEstado
  };
})(typeof window !== 'undefined' ? window : this);
