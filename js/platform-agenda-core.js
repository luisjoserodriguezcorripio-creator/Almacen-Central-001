/**
 * Agenda operativa — núcleo (puestos, estados, reglas del día)
 */
(function (global) {
  'use strict';

  var TZ = 'America/Santo_Domingo';
  var SEED_URL = (function () {
    try {
      var h = global.location && global.location.hostname || '';
      if (h.indexOf('github.io') >= 0) return '/Almacen-Central-001/data/agenda-seed.json';
    } catch (e) { /* noop */ }
    return 'data/agenda-seed.json';
  })();

  var ESTADO_NO_COMPLETADO = 'NO_COMPLETADO';
  var ESTADO_COMPLETADO = 'COMPLETADO';
  /** Compatibilidad con datos viejos */
  var ESTADO_PENDIENTE = ESTADO_NO_COMPLETADO;
  var ESTADO_EN_PROCESO = ESTADO_NO_COMPLETADO;

  var ESTADOS = [ESTADO_NO_COMPLETADO, ESTADO_COMPLETADO];

  var ESTADO_LABELS = {
    NO_COMPLETADO: 'No completado',
    COMPLETADO: 'Completado',
    PENDIENTE: 'No completado',
    EN_PROCESO: 'No completado'
  };

  var FREQ_LABELS = {
    AUDITORIA: 'Auditoría',
    DIARIA: 'Auditoría',
    INTER_DIARIA: 'Auditoría',
    SEMANAL: 'Auditoría'
  };

  /** Se reemplaza al cargar agenda-seed.json (una tarjeta por persona a medir). */
  var PUESTOS = [];
  var PUESTO_BY_ID = {};

  function applyPuestos(list) {
    PUESTOS.length = 0;
    Object.keys(PUESTO_BY_ID).forEach(function (k) { delete PUESTO_BY_ID[k]; });
    (list || []).forEach(function (raw) {
      if (!raw || !raw.id) return;
      var p = {
        id: String(raw.id),
        label: String(raw.label || raw.id),
        short: String(raw.short || raw.nombrePersona || raw.label || raw.id).slice(0, 24),
        puestoBase: raw.puestoBase ? String(raw.puestoBase) : '',
        puestoNombre: raw.puestoNombre ? String(raw.puestoNombre) : '',
        nombrePersona: raw.nombrePersona ? String(raw.nombrePersona) : ''
      };
      PUESTOS.push(p);
      PUESTO_BY_ID[p.id] = p;
    });
    return PUESTOS;
  }

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

  /** Checklist de auditoría: todas las actividades aplican en la fecha seleccionada. */
  function isTaskDueOnDay(template, dayKey) {
    if (!template || !dayKey) return false;
    return true;
  }

  function normalizeTemplate(raw) {
    if (!raw || !raw.id || !raw.puesto || !raw.actividad) return null;
    var freq = String(raw.frecuencia || 'AUDITORIA').toUpperCase();
    if (freq === 'DIARIA' || freq === 'INTER_DIARIA' || freq === 'SEMANAL') freq = 'AUDITORIA';
    return {
      id: String(raw.id),
      puesto: String(raw.puesto),
      numero: Number(raw.numero) || 0,
      frecuencia: freq,
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

  function normalizeEstado(value) {
    var e = String(value || '').toUpperCase();
    if (e === ESTADO_COMPLETADO || e === 'COMPLETADO') return ESTADO_COMPLETADO;
    return ESTADO_NO_COMPLETADO;
  }

  function emptyTaskProgress() {
    return {
      estado: ESTADO_NO_COMPLETADO,
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

  function ensurePuestoDay(state, dayKey, puestoId) {
    var day = ensureDayBucket(state, dayKey);
    if (!day[puestoId]) day[puestoId] = { tasks: {} };
    if (!day[puestoId].tasks) day[puestoId].tasks = {};
    return day[puestoId];
  }

  function ensurePuestoBucket(state, dayKey, puestoId) {
    return ensurePuestoDay(state, dayKey, puestoId).tasks;
  }

  function getAuditMeta(state, dayKey, puestoId) {
    var bucket = state && state.daily && state.daily[dayKey] && state.daily[dayKey][puestoId];
    if (!bucket) return { saved: false, savedAt: '', savedBy: '' };
    return {
      saved: !!bucket.saved,
      savedAt: String(bucket.savedAt || ''),
      savedBy: String(bucket.savedBy || '')
    };
  }

  function getTaskProgress(state, dayKey, puestoId, taskId) {
    var bucket = state.daily && state.daily[dayKey] && state.daily[dayKey][puestoId];
    var raw = bucket && bucket.tasks && bucket.tasks[taskId];
    if (!raw) return emptyTaskProgress();
    return {
      estado: normalizeEstado(raw.estado),
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
    var pending = total - done;
    var pct = total ? Math.round((done / total) * 100) : 0;
    var minutesTotal = tasks.reduce(function (s, x) { return s + (x.template.minutos || 0); }, 0);
    var minutesDone = tasks.filter(function (x) { return x.progress.estado === ESTADO_COMPLETADO; })
      .reduce(function (s, x) { return s + (x.template.minutos || 0); }, 0);
    return {
      total: total,
      done: done,
      inProg: 0,
      pending: pending,
      pct: pct,
      minutesTotal: minutesTotal,
      minutesDone: minutesDone,
      savedDays: 0
    };
  }

  /** Alcance en portada: solo días auditados y guardados (ignora el filtro de fecha). */
  function statsForPuestoSavedAudits(state, puestoId) {
    var templates = templatesForPuesto(state, puestoId);
    var daily = (state && state.daily) || {};
    var done = 0;
    var total = 0;
    var minutesTotal = 0;
    var minutesDone = 0;
    var savedDays = 0;
    Object.keys(daily).forEach(function (dayKey) {
      var bucket = daily[dayKey] && daily[dayKey][puestoId];
      if (!bucket || !bucket.saved) return;
      savedDays += 1;
      templates.forEach(function (t) {
        if (!isTaskDueOnDay(t, dayKey)) return;
        total += 1;
        minutesTotal += t.minutos || 0;
        var prog = getTaskProgress(state, dayKey, puestoId, t.id);
        if (prog.estado === ESTADO_COMPLETADO) {
          done += 1;
          minutesDone += t.minutos || 0;
        }
      });
    });
    var pct = total ? Math.round((done / total) * 100) : 0;
    return {
      total: total,
      done: done,
      inProg: 0,
      pending: total - done,
      pct: pct,
      minutesTotal: minutesTotal,
      minutesDone: minutesDone,
      savedDays: savedDays
    };
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

  /** Solo administradores pueden crear/editar/eliminar actividades. agenda.all no alcanza. */
  function canEditActivities(user) {
    if (!user) return false;
    if (user.isPrimaryAdmin) return true;
    return user.role === 'administrador';
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

  function loadSeed() {
    return fetch(SEED_URL, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return { templates: [], puestos: [], revision: '', version: 1 };
        if (data.puestos && data.puestos.length) applyPuestos(data.puestos);
        var templates = (data.templates || []).map(normalizeTemplate).filter(Boolean);
        return {
          templates: templates,
          puestos: PUESTOS.slice(),
          revision: String(data.updatedAt || data.version || ''),
          version: Number(data.version) || 1,
          updatedAt: String(data.updatedAt || '')
        };
      })
      .catch(function () {
        return { templates: [], puestos: [], revision: '', version: 1 };
      });
  }

  function loadSeedTemplates() {
    return loadSeed().then(function (seed) { return seed.templates || []; });
  }

  function nextEstado(current) {
    return normalizeEstado(current) === ESTADO_COMPLETADO ? ESTADO_NO_COMPLETADO : ESTADO_COMPLETADO;
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
    ESTADO_NO_COMPLETADO: ESTADO_NO_COMPLETADO,
    ESTADO_COMPLETADO: ESTADO_COMPLETADO,
    ESTADOS: ESTADOS,
    ESTADO_LABELS: ESTADO_LABELS,
    normalizeEstado: normalizeEstado,
    FREQ_LABELS: FREQ_LABELS,
    PUESTOS: PUESTOS,
    PUESTO_BY_ID: PUESTO_BY_ID,
    applyPuestos: applyPuestos,
    todayKey: todayKey,
    formatDateDisplay: formatDateDisplay,
    formatClockTime: formatClockTime,
    isTaskDueOnDay: isTaskDueOnDay,
    normalizeTemplate: normalizeTemplate,
    normalizeState: normalizeState,
    normalizeAgendaPuesto: normalizeAgendaPuesto,
    emptyTaskProgress: emptyTaskProgress,
    ensurePuestoDay: ensurePuestoDay,
    ensurePuestoBucket: ensurePuestoBucket,
    getAuditMeta: getAuditMeta,
    getTaskProgress: getTaskProgress,
    templatesForPuesto: templatesForPuesto,
    tasksForDay: tasksForDay,
    statsForPuesto: statsForPuesto,
    statsForPuestoSavedAudits: statsForPuestoSavedAudits,
    statsAllPuestos: statsAllPuestos,
    canManageAll: canManageAll,
    canEditActivities: canEditActivities,
    getUserAgendaPuesto: getUserAgendaPuesto,
    resolveUserPuestos: resolveUserPuestos,
    userHasAgendaAccess: userHasAgendaAccess,
    puestoLabel: puestoLabel,
    loadSeed: loadSeed,
    loadSeedTemplates: loadSeedTemplates,
    nextEstado: nextEstado
  };
})(typeof window !== 'undefined' ? window : this);
