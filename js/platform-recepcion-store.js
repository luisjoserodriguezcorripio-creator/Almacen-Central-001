/**
 * Store — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_recepcion';
  var TZ = 'America/Santo_Domingo';

  var TIPOS = [
    { id: 'importado', label: 'Importado' },
    { id: 'local', label: 'Local' }
  ];

  var DIVISIONES = ['COA/CP', 'COASIS', 'CPH', 'LIMENT', 'OTRO'];

  /** Listas del equipo — recepción elige el nombre; la TV suma lo registrado. */
  var OPERADORES_SENTADO = [
    'Pedro Rodriguez',
    'Robert Diaz'
  ];
  var VALIDADORES_RECEPCION = [
    'Julio Lugo',
    'Handerson Ogando',
    'Nelson Flete',
    'Richard Ortiz'
  ];
  var ENTRADA_RECEPCION = [
    'Andy Fernandez',
    'Yessica Florentino'
  ];
  var UBICADORES_RECEPCION = [
    'Rolando Corporan',
    'Obispo Abad',
    'Yeuri Paniagua',
    'Yeison Perez'
  ];

  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('recepcion-live-board')
    : null;

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function emptyPayload() {
    return {
      module: 'recepcion',
      version: 2,
      updatedAt: nowIso(),
      registroCounter: 0,
      contenedores: [],
      actividadLog: [],
      liveShareBoard: null,
      planilla: null,
      planillaHistorico: {}
    };
  }

  function currentMonthKey(dateObj) {
    var d = dateObj || new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit'
      }).formatToParts(d);
      var y = '';
      var m = '';
      parts.forEach(function (p) {
        if (p.type === 'year') y = p.value;
        if (p.type === 'month') m = p.value;
      });
      if (y && m) return y + '-' + m;
    } catch (e) { /* noop */ }
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function snapshotPlanilla(planilla) {
    if (!planilla) return null;
    return {
      monthKey: planilla.monthKey || '',
      fileName: planilla.fileName || '',
      uploadedAt: planilla.uploadedAt || nowIso(),
      uploadedBy: planilla.uploadedBy || '—',
      sheet: planilla.sheet || 'Reporte Diario',
      headers: (planilla.headers || []).slice(),
      rows: (planilla.rows || []).map(function (r) {
        return {
          values: (r.values || []).slice(),
          fechaKey: r.fechaKey || '',
          fechaLlegadaKey: r.fechaLlegadaKey || '',
          fechaDescargaKey: r.fechaDescargaKey || ''
        };
      })
    };
  }

  function normalizePlanilla(p) {
    if (!p || !Array.isArray(p.headers) || !Array.isArray(p.rows)) return null;
    return snapshotPlanilla(p);
  }

  function normalizeHistorico(h) {
    var out = {};
    if (!h || typeof h !== 'object') return out;
    Object.keys(h).forEach(function (k) {
      var snap = normalizePlanilla(h[k]);
      if (snap) out[k] = snap;
    });
    return out;
  }

  function statusFromText(v) {
    var s = String(v || '').trim().toUpperCase();
    if (!s) return 'pendiente';
    if (s === 'OK' || s === 'SI' || s === 'SÍ' || s === 'YES') return 'ok';
    return 'pendiente';
  }

  function mapPlanillaToContenedores(planilla) {
    if (!planilla || !Array.isArray(planilla.rows)) return [];
    return planilla.rows.map(function (r, idx) {
      var v = r.values || [];
      var fechaIso = '';
      if (r.fechaKey) fechaIso = r.fechaKey + 'T12:00:00.000Z';
      else fechaIso = nowIso();
      var validado = statusFromText(v[12]);
      var ubicado = statusFromText(v[13]);
      var remision = statusFromText(v[14]);
      return normalizeContenedor({
        id: 'pl_' + idx + '_' + String(v[0] || idx),
        registro: String(v[6] || v[0] || ('FILA-' + (idx + 1))).trim().toUpperCase(),
        fecha: fechaIso,
        contenedor: String(v[4] || '').trim().toUpperCase() || ('SIN-CONT-' + (idx + 1)),
        tipo: /local/i.test(String(v[21] || '')) ? 'local' : 'importado',
        division: String(v[3] || '').trim(),
        descripcion: String(v[8] || '').trim(),
        paletas: parseInt(v[22], 10) || 0,
        muelle: String(v[16] || '').trim().toUpperCase(),
        descargado: statusFromText(v[11]),
        validado: validado,
        entrada: remision,
        ubicado: ubicado,
        atDescargado: fechaIso,
        operadorDescarga: String(v[17] || '').trim() || '—',
        atValidado: validado === 'ok' ? fechaIso : '',
        validadorPor: String(v[18] || '').trim(),
        atEntrada: remision === 'ok' ? fechaIso : '',
        entradaPor: String(v[20] || '').trim(),
        atUbicado: ubicado === 'ok' ? fechaIso : '',
        ubicadorPor: String(v[19] || '').trim(),
        createdAt: fechaIso,
        createdBy: planilla.uploadedBy || 'planilla',
        updatedAt: planilla.uploadedAt || nowIso(),
        updatedBy: planilla.uploadedBy || 'planilla',
        historial: []
      });
    });
  }

  function importPlanilla(parsed, usuario) {
    if (!parsed || !parsed.ok) {
      return { ok: false, error: (parsed && parsed.error) || 'Planilla inválida.' };
    }
    var data = load();
    var monthKey = currentMonthKey();
    data.planillaHistorico = data.planillaHistorico || {};

    // Si hay carga de un mes anterior, asegure el histórico de ese mes.
    if (data.planilla && data.planilla.monthKey && data.planilla.monthKey !== monthKey) {
      if (!data.planillaHistorico[data.planilla.monthKey]) {
        data.planillaHistorico[data.planilla.monthKey] = snapshotPlanilla(data.planilla);
      }
    }

    var planilla = {
      monthKey: monthKey,
      fileName: parsed.fileName || 'planilla.xlsx',
      uploadedAt: nowIso(),
      uploadedBy: usuario || '—',
      sheet: parsed.sheet || 'Reporte Diario',
      headers: (parsed.headers || []).slice(),
      rows: (parsed.rows || []).map(function (r) {
        return {
          values: (r.values || []).slice(),
          fechaKey: r.fechaKey || '',
          fechaLlegadaKey: r.fechaLlegadaKey || '',
          fechaDescargaKey: r.fechaDescargaKey || ''
        };
      })
    };

    // Cada carga reemplaza la anterior.
    data.planilla = planilla;
    // El último archivo del mes queda en histórico mensual.
    data.planillaHistorico[monthKey] = snapshotPlanilla(planilla);
    data.contenedores = mapPlanillaToContenedores(planilla);

    appendActividadLog(data, {
      registro: 'PLANILLA',
      contenedor: planilla.fileName
    }, {
      at: planilla.uploadedAt,
      usuario: usuario || '—',
      accion: 'registro',
      nota: 'Carga Excel «' + planilla.sheet + '» · ' + planilla.rows.length + ' filas · reemplazo completo'
    });

    save(data);
    return {
      ok: true,
      data: data,
      planilla: planilla,
      count: planilla.rows.length,
      monthKey: monthKey
    };
  }

  function getPlanilla(data) {
    data = data || load();
    return data.planilla || null;
  }

  function getPlanillaHistorico(data) {
    data = data || load();
    return data.planillaHistorico || {};
  }

  function filterPlanillaRows(planilla, opts) {
    opts = opts || {};
    var rows = (planilla && planilla.rows) || [];
    var desde = String(opts.desde || '').trim();
    var hasta = String(opts.hasta || '').trim();
    var estado = String(opts.estado || '').trim().toLowerCase();
    var estadoIdx = {
      descargar: 11,
      validar: 12,
      ubicar: 13,
      remision: 14
    };
    var col = estadoIdx[estado];
    return rows.filter(function (r) {
      if (desde || hasta) {
        var key = r.fechaKey || r.fechaDescargaKey || r.fechaLlegadaKey || '';
        if (!key) return false;
        if (desde && key < desde) return false;
        if (hasta && key > hasta) return false;
      }
      if (col != null) {
        var v = (r.values || [])[col];
        if (isOkStatus(v)) return false;
      }
      return true;
    });
  }

  function formatRegistroNum(n) {
    return 'REC-' + String(Math.max(0, parseInt(n, 10) || 0)).padStart(4, '0');
  }

  function peekNextRegistro(data) {
    data = data || load();
    return formatRegistroNum((data.registroCounter || 0) + 1);
  }

  function nextRegistroNum(data) {
    data.registroCounter = (data.registroCounter || 0) + 1;
    return formatRegistroNum(data.registroCounter);
  }

  function parseRegistroNum(code) {
    var m = String(code || '').match(/^REC-(\d+)$/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function ensureRegistroNumbers(data) {
    var max = data.registroCounter || 0;
    (data.contenedores || []).forEach(function (c) {
      max = Math.max(max, parseRegistroNum(c.registro));
    });
    (data.contenedores || []).forEach(function (c) {
      if (!c.registro) {
        max += 1;
        c.registro = formatRegistroNum(max);
      }
    });
    data.registroCounter = max;
    return data;
  }

  function load() {
    if (!global.localStorage) return emptyPayload();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyPayload();
      var data = JSON.parse(raw);
      return normalizePayload(data);
    } catch (e) {
      return emptyPayload();
    }
  }

  function migrateActividadLog(data) {
    if (Array.isArray(data.actividadLog)) return data.actividadLog;
    var rows = [];
    (data.contenedores || []).forEach(function (c) {
      (c.historial || []).forEach(function (h) {
        rows.push({
          at: h.at,
          registro: c.registro,
          contenedor: c.contenedor,
          usuario: h.usuario,
          accion: h.accion,
          nota: h.nota
        });
      });
    });
    rows.sort(function (a, b) {
      return String(b.at || '').localeCompare(String(a.at || ''));
    });
    return rows.slice(0, 500);
  }

  function normalizePayload(data) {
    data = data || emptyPayload();
    data.module = 'recepcion';
    data.version = Math.max(2, parseInt(data.version, 10) || 2);
    data.registroCounter = Math.max(0, parseInt(data.registroCounter, 10) || 0);
    data.contenedores = (data.contenedores || []).map(normalizeContenedor);
    ensureRegistroNumbers(data);
    data.actividadLog = migrateActividadLog(data);
    data.liveShareBoard = normalizeLiveShare(data.liveShareBoard);
    data.planilla = normalizePlanilla(data.planilla);
    data.planillaHistorico = normalizeHistorico(data.planillaHistorico);
    return data;
  }

  function normalizeContenedor(c) {
    c = c || {};
    var item = {
      id: c.id || uid(),
      registro: String(c.registro || '').trim().toUpperCase(),
      fecha: c.fecha || c.createdAt || nowIso(),
      contenedor: String(c.contenedor || '').trim().toUpperCase(),
      tipo: c.tipo === 'local' ? 'local' : 'importado',
      division: String(c.division || '').trim(),
      descripcion: String(c.descripcion || '').trim(),
      paletas: Math.max(0, parseInt(c.paletas, 10) || 0),
      muelle: String(c.muelle || '').trim().toUpperCase(),
      descargado: c.descargado === 'ok' ? 'ok' : 'pendiente',
      validado: c.validado === 'ok' ? 'ok' : 'pendiente',
      entrada: c.entrada === 'ok' ? 'ok' : 'pendiente',
      ubicado: c.ubicado === 'ok' ? 'ok' : 'pendiente',
      atDescargado: c.atDescargado || c.createdAt || '',
      operadorDescarga: c.operadorDescarga || c.createdBy || '—',
      atValidado: c.atValidado || '',
      validadorPor: c.validadorPor || '',
      atEntrada: c.atEntrada || '',
      entradaPor: c.entradaPor || '',
      atUbicado: c.atUbicado || '',
      ubicadorPor: c.ubicadorPor || '',
      createdAt: c.createdAt || nowIso(),
      createdBy: c.createdBy || '—',
      updatedAt: c.updatedAt || c.createdAt || nowIso(),
      updatedBy: c.updatedBy || c.createdBy || '—',
      historial: Array.isArray(c.historial) ? c.historial.slice(0, 40) : []
    };
    syncEtapasFromHistorial(item);
    return item;
  }

  function normalizeLiveShare(share) {
    if (!share || !share.active) return null;
    return {
      active: true,
      updatedAt: share.updatedAt || nowIso(),
      sharedBy: share.sharedBy || '—'
    };
  }

  function save(data, opts) {
    opts = opts || {};
    data = normalizePayload(data);
    if (!opts.keepUpdatedAt) data.updatedAt = nowIso();
    if (global.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    if (!opts.silent) notify(data);
    return data;
  }

  function notify(data) {
    try {
      global.dispatchEvent(new CustomEvent('recepcion-updated', {
        detail: { data: data, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcast) {
      try { broadcast.postMessage({ type: 'recepcion-updated', at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function notifyLiveShare(share) {
    try {
      global.dispatchEvent(new CustomEvent('recepcion-live-board', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
  }

  function appendActividadLog(data, item, entry) {
    if (!data) return;
    data.actividadLog = data.actividadLog || [];
    data.actividadLog.unshift({
      at: entry.at || nowIso(),
      registro: item && item.registro ? item.registro : '—',
      contenedor: item && item.contenedor ? item.contenedor : '—',
      usuario: entry.usuario || '—',
      accion: entry.accion || '',
      nota: entry.nota || ''
    });
    data.actividadLog = data.actividadLog.slice(0, 500);
  }

  function pushHistorial(item, entry, data) {
    entry = entry || {};
    var row = {
      at: entry.at || nowIso(),
      usuario: entry.usuario || '—',
      accion: entry.accion || '',
      nota: entry.nota || ''
    };
    item.historial = item.historial || [];
    item.historial.unshift(row);
    item.historial = item.historial.slice(0, 40);
    if (data) appendActividadLog(data, item, row);
  }

  function formatFecha(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: TZ
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function formatFechaSolo(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeZone: TZ
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function formatFechaEtapa(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      var fecha = new Intl.DateTimeFormat('es-DO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: TZ
      }).format(d);
      var hora = new Intl.DateTimeFormat('es-DO', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: TZ
      }).format(d);
      return fecha + ' · ' + hora;
    } catch (e) {
      return formatFecha(iso);
    }
  }

  function historialEtapa(item, accion) {
    var rows = (item.historial || []).slice().sort(function (a, b) {
      return String(a.at || '').localeCompare(String(b.at || ''));
    });
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].accion === accion) return rows[i];
    }
    return null;
  }

  function syncEtapasFromHistorial(item) {
    if (!item.atDescargado) item.atDescargado = item.createdAt || '';
    if (!item.operadorDescarga) item.operadorDescarga = item.createdBy || '—';
    var hv = historialEtapa(item, 'validado');
    if (hv) {
      if (!item.atValidado) item.atValidado = hv.at;
      if (!item.validadorPor) item.validadorPor = hv.usuario;
    }
    var he = historialEtapa(item, 'entrada');
    if (he) {
      if (!item.atEntrada) item.atEntrada = he.at;
      if (!item.entradaPor) item.entradaPor = he.usuario;
    }
    var hu = historialEtapa(item, 'ubicado');
    if (hu) {
      if (!item.atUbicado) item.atUbicado = hu.at;
      if (!item.ubicadorPor) item.ubicadorPor = hu.usuario;
      if (item.ubicado !== 'ok') item.ubicado = 'ok';
    }
  }

  function registrarContenedor(payload, usuario) {
    payload = payload || {};
    usuario = usuario || '—';
    var contenedor = String(payload.contenedor || '').trim().toUpperCase();
    if (!contenedor) return { ok: false, error: 'Ingrese el número de contenedor.' };
    if (!String(payload.division || '').trim()) return { ok: false, error: 'Seleccione la división.' };
    if (!String(payload.descripcion || '').trim()) return { ok: false, error: 'Ingrese la descripción.' };
    var operador = validarPersonaEnRoster(payload.operadorDescarga, OPERADORES_SENTADO, 'el operador sentado');
    if (!operador.ok) return operador;

    var data = load();
    var dup = (data.contenedores || []).some(function (c) {
      return c.contenedor === contenedor && c.entrada !== 'ok';
    });
    if (dup) return { ok: false, error: 'Ese contenedor ya está en seguimiento activo.' };

    var ts = nowIso();
    var item = normalizeContenedor({
      id: uid(),
      registro: nextRegistroNum(data),
      fecha: payload.fecha || ts,
      contenedor: contenedor,
      tipo: payload.tipo === 'local' ? 'local' : 'importado',
      division: payload.division,
      descripcion: payload.descripcion,
      paletas: payload.paletas,
      muelle: payload.muelle || '',
      validado: 'pendiente',
      entrada: 'pendiente',
      ubicado: 'pendiente',
      atDescargado: ts,
      operadorDescarga: operador.nombre,
      createdAt: ts,
      createdBy: usuario,
      updatedAt: ts,
      updatedBy: usuario,
      historial: []
    });
    pushHistorial(item, {
      at: ts,
      usuario: usuario,
      accion: 'registro',
      nota: 'Registro ' + item.registro + ' · ' + (item.tipo === 'local' ? 'Local' : 'Importado')
    }, data);
    data.contenedores.unshift(item);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function findById(data, id) {
    return (data.contenedores || []).findIndex(function (c) { return c.id === id; });
  }

  function marcarValidado(id, usuario, validadorNombre) {
    var val = validarPersonaEnRoster(validadorNombre, VALIDADORES_RECEPCION, 'el validador');
    if (!val.ok) return val;
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.validado === 'ok') return { ok: true, data: data, item: item, unchanged: true };
    var ts = nowIso();
    item.validado = 'ok';
    item.atValidado = ts;
    item.validadorPor = val.nombre;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, { at: ts, usuario: usuario, accion: 'validado', nota: 'Validación OK' }, data);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function actualizarMuelle(id, muelle, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.entrada === 'ok') {
      return { ok: false, error: 'El muelle ya quedó confirmado con la entrada.' };
    }
    muelle = String(muelle || '').trim().toUpperCase();
    if (!muelle) return { ok: false, error: 'Indique el muelle.' };
    if (item.muelle === muelle) {
      return { ok: true, data: data, item: item, unchanged: true };
    }
    var ts = nowIso();
    item.muelle = muelle;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, {
      at: ts,
      usuario: usuario,
      accion: 'muelle',
      nota: 'Muelle asignado · ' + muelle
    }, data);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function marcarEntrada(id, muelle, usuario, entradaNombre) {
    var ent = validarPersonaEnRoster(entradaNombre, ENTRADA_RECEPCION, 'quien da la entrada');
    if (!ent.ok) return ent;
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.validado !== 'ok') return { ok: false, error: 'Debe validar el contenedor antes de dar entrada.' };
    muelle = String(muelle || item.muelle || '').trim().toUpperCase();
    if (!muelle) return { ok: false, error: 'Indique el muelle de entrada.' };
    if (item.entrada === 'ok' && item.muelle === muelle) {
      return { ok: true, data: data, item: item, unchanged: true };
    }
    var ts = nowIso();
    item.entrada = 'ok';
    item.muelle = muelle;
    item.atEntrada = ts;
    item.entradaPor = ent.nombre;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, { at: ts, usuario: usuario, accion: 'entrada', nota: 'Entrada OK · muelle ' + muelle }, data);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function marcarUbicado(id, usuario, ubicadorNombre) {
    var ubi = validarPersonaEnRoster(ubicadorNombre, UBICADORES_RECEPCION, 'el ubicador');
    if (!ubi.ok) return ubi;
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    if (item.entrada !== 'ok') return { ok: false, error: 'Debe dar entrada antes de ubicar.' };
    if (item.ubicado === 'ok') return { ok: true, data: data, item: item, unchanged: true };
    var ts = nowIso();
    item.ubicado = 'ok';
    item.atUbicado = ts;
    item.ubicadorPor = ubi.nombre;
    item.updatedAt = ts;
    item.updatedBy = usuario || '—';
    pushHistorial(item, { at: ts, usuario: usuario, accion: 'ubicado', nota: 'Ubicación OK' }, data);
    save(data);
    return { ok: true, data: data, item: item };
  }

  function eliminarContenedor(id, usuario) {
    var data = load();
    var idx = findById(data, id);
    if (idx < 0) return { ok: false, error: 'Contenedor no encontrado.' };
    var item = data.contenedores[idx];
    pushHistorial(item, {
      at: nowIso(),
      usuario: usuario || '—',
      accion: 'retirado',
      nota: 'Retirado del seguimiento activo · ' + String(item.contenedor || '')
    }, data);
    data.contenedores.splice(idx, 1);
    save(data);
    return { ok: true, data: data };
  }

  function getRegistroActividad(data, limit) {
    data = data || load();
    limit = limit || 80;
    var rows = (data.actividadLog || []).slice();
    rows.sort(function (a, b) {
      return String(b.at || '').localeCompare(String(a.at || ''));
    });
    return rows.slice(0, limit);
  }

  function getContenedoresActivos(contenedores) {
    return (contenedores || []).slice().sort(function (a, b) {
      return String(b.fecha || '').localeCompare(String(a.fecha || ''));
    });
  }

  function countResumen(contenedores) {
    var list = contenedores || [];
    var out = {
      total: list.length,
      importado: 0,
      local: 0,
      pendienteValidar: 0,
      pendienteDescargar: 0,
      pendienteRemision: 0,
      paletas: 0,
      validado: 0,
      conEntrada: 0,
      conUbicado: 0,
      pendienteUbicar: 0,
      contDescargados: 0,
      contValidados: 0,
      contUbicados: 0,
      contRemision: 0
    };
    list.forEach(function (c) {
      if (c.tipo === 'local') out.local += 1;
      else out.importado += 1;
      out.paletas += Number(c.paletas) || 0;
      if (c.descargado === 'ok') out.contDescargados += 1;
      else out.pendienteDescargar += 1;
      if (c.validado === 'ok') {
        out.validado += 1;
        out.contValidados += 1;
      } else {
        out.pendienteValidar += 1;
      }
      if (c.entrada === 'ok') {
        out.conEntrada += 1;
        out.contRemision += 1;
      } else {
        out.pendienteRemision += 1;
      }
      if (c.ubicado === 'ok') {
        out.conUbicado += 1;
        out.contUbicados += 1;
      } else if (c.entrada === 'ok') {
        out.pendienteUbicar += 1;
      } else {
        out.pendienteUbicar += 1;
      }
    });
    return out;
  }

  function isOkStatus(v) {
    return statusFromText(v) === 'ok';
  }

  function countPlanillaKpis(rows) {
    var list = rows || [];
    var out = {
      total: list.length,
      paletas: 0,
      pendienteValidar: 0,
      contDescargados: 0,
      contValidados: 0,
      contUbicados: 0,
      contRemision: 0,
      pendienteDescargar: 0,
      pendienteRemision: 0,
      pendienteUbicar: 0
    };
    list.forEach(function (r) {
      var v = r.values || [];
      out.paletas += parseInt(v[22], 10) || 0;
      // Totales = cantidad de celdas en OK (Descargado / Validado / Ubicado / Remisión)
      if (isOkStatus(v[11])) out.contDescargados += 1;
      else out.pendienteDescargar += 1;
      if (isOkStatus(v[12])) out.contValidados += 1;
      else out.pendienteValidar += 1;
      if (isOkStatus(v[13])) out.contUbicados += 1;
      else out.pendienteUbicar += 1;
      if (isOkStatus(v[14])) out.contRemision += 1;
      else out.pendienteRemision += 1;
    });
    return out;
  }

  function normalizarNombreRoster(nombre) {
    return String(nombre || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ');
  }

  function resolverNombreEnRoster(usuario, roster) {
    var u = String(usuario || '').trim();
    if (!u || u === '—') return '';
    if (roster.indexOf(u) >= 0) return u;
    var uNorm = normalizarNombreRoster(u);
    var i;
    for (i = 0; i < roster.length; i++) {
      if (normalizarNombreRoster(roster[i]) === uNorm) return roster[i];
    }
    var uFirst = uNorm.split(' ')[0];
    if (uFirst && uFirst.length > 2) {
      for (i = 0; i < roster.length; i++) {
        var rFirst = normalizarNombreRoster(roster[i]).split(' ')[0];
        if (rFirst === uFirst) return roster[i];
      }
    }
    return '';
  }

  function validarPersonaEnRoster(nombre, roster, label) {
    var resolved = resolverNombreEnRoster(nombre, roster);
    if (!resolved) {
      return { ok: false, error: 'Seleccione ' + (label || 'una persona') + ' de la lista.' };
    }
    return { ok: true, nombre: resolved };
  }

  function tallyCampo(contenedores, field, filterFn) {
    var map = Object.create(null);
    var sinAsignar = 0;
    (contenedores || []).forEach(function (c) {
      if (filterFn && !filterFn(c)) return;
      var name = String(c[field] || '').trim();
      if (!name || name === '—') {
        sinAsignar += 1;
        return;
      }
      map[name] = (map[name] || 0) + 1;
    });
    var rows = Object.keys(map).map(function (k) {
      return { name: k, n: map[k] };
    }).sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
    if (sinAsignar) rows.push({ name: 'Sin asignar', n: sinAsignar });
    return rows;
  }

  function resumenEquipoTv(contenedores) {
    var list = contenedores || [];
    var contDescargados = 0;
    var contValidados = 0;
    var contUbicados = 0;
    var contRemision = 0;
    list.forEach(function (c) {
      if (c.descargado === 'ok') contDescargados += 1;
      if (c.validado === 'ok') contValidados += 1;
      if (c.ubicado === 'ok') contUbicados += 1;
      if (c.entrada === 'ok') contRemision += 1;
    });
    // Totales = filas con OK; barras = persona (o Sin asignar)
    return {
      contDescargados: contDescargados,
      contValidados: contValidados,
      contUbicados: contUbicados,
      contRemision: contRemision,
      operadores: tallyCampo(list, 'operadorDescarga', function (c) {
        return c.descargado === 'ok';
      }),
      validadores: tallyCampo(list, 'validadorPor', function (c) {
        return c.validado === 'ok';
      }),
      ubicadores: tallyCampo(list, 'ubicadorPor', function (c) {
        return c.ubicado === 'ok';
      }),
      digitadores: tallyCampo(list, 'entradaPor', function (c) {
        return c.entrada === 'ok';
      })
    };
  }

  function getLiveShareBoard(data) {
    data = data || load();
    return data.liveShareBoard || null;
  }

  function isLiveShareBoardActive(data) {
    var s = getLiveShareBoard(data);
    return !!(s && s.active);
  }

  function startLiveShareBoard(usuario) {
    var data = load();
    data.liveShareBoard = {
      active: true,
      updatedAt: nowIso(),
      sharedBy: usuario || '—'
    };
    save(data, { silent: true });
    notifyLiveShare(data.liveShareBoard);
    notify(data);
    return data.liveShareBoard;
  }

  function stopLiveShareBoard() {
    var data = load();
    data.liveShareBoard = null;
    save(data, { silent: true });
    notifyLiveShare(null);
    notify(data);
    return null;
  }

  function toggleLiveShareBoard(usuario) {
    var data = load();
    if (isLiveShareBoardActive(data)) return stopLiveShareBoard();
    return startLiveShareBoard(usuario);
  }

  function bindSync(callback) {
    if (!callback) return function () {};
    function onCustom(ev) {
      callback(ev.detail && ev.detail.data ? ev.detail.data : load());
    }
    function onStorage(ev) {
      if (ev.key === STORAGE_KEY) callback(load());
    }
    function onLive() { callback(load()); }
    global.addEventListener('recepcion-updated', onCustom);
    global.addEventListener('recepcion-live-board', onLive);
    global.addEventListener('storage', onStorage);
    if (broadcast) {
      broadcast.onmessage = function () { callback(load()); };
    }
    return function () {
      global.removeEventListener('recepcion-updated', onCustom);
      global.removeEventListener('recepcion-live-board', onLive);
      global.removeEventListener('storage', onStorage);
    };
  }

  global.PlatformRecepcionStore = {
    STORAGE_KEY: STORAGE_KEY,
    TIPOS: TIPOS,
    DIVISIONES: DIVISIONES,
    OPERADORES_SENTADO: OPERADORES_SENTADO,
    VALIDADORES_RECEPCION: VALIDADORES_RECEPCION,
    ENTRADA_RECEPCION: ENTRADA_RECEPCION,
    UBICADORES_RECEPCION: UBICADORES_RECEPCION,
    load: load,
    save: save,
    formatFecha: formatFecha,
    formatFechaSolo: formatFechaSolo,
    formatFechaEtapa: formatFechaEtapa,
    formatRegistroNum: formatRegistroNum,
    peekNextRegistro: peekNextRegistro,
    getRegistroActividad: getRegistroActividad,
    registrarContenedor: registrarContenedor,
    marcarValidado: marcarValidado,
    actualizarMuelle: actualizarMuelle,
    marcarEntrada: marcarEntrada,
    marcarUbicado: marcarUbicado,
    eliminarContenedor: eliminarContenedor,
    getContenedoresActivos: getContenedoresActivos,
    countResumen: countResumen,
    countPlanillaKpis: countPlanillaKpis,
    resumenEquipoTv: resumenEquipoTv,
    validarPersonaEnRoster: validarPersonaEnRoster,
    resolverNombreEnRoster: resolverNombreEnRoster,
    getLiveShareBoard: getLiveShareBoard,
    isLiveShareBoardActive: isLiveShareBoardActive,
    startLiveShareBoard: startLiveShareBoard,
    stopLiveShareBoard: stopLiveShareBoard,
    toggleLiveShareBoard: toggleLiveShareBoard,
    bindSync: bindSync,
    currentMonthKey: currentMonthKey,
    importPlanilla: importPlanilla,
    getPlanilla: getPlanilla,
    getPlanillaHistorico: getPlanillaHistorico,
    filterPlanillaRows: filterPlanillaRows,
    mapPlanillaToContenedores: mapPlanillaToContenedores
  };
})(typeof window !== 'undefined' ? window : this);
