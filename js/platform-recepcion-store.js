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
      version: 1,
      updatedAt: nowIso(),
      registroCounter: 0,
      contenedores: [],
      actividadLog: [],
      liveShareBoard: null
    };
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
    data.registroCounter = Math.max(0, parseInt(data.registroCounter, 10) || 0);
    data.contenedores = (data.contenedores || []).map(normalizeContenedor);
    ensureRegistroNumbers(data);
    data.actividadLog = migrateActividadLog(data);
    data.liveShareBoard = normalizeLiveShare(data.liveShareBoard);
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
    data.updatedAt = nowIso();
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
      validado: 0,
      conEntrada: 0,
      conUbicado: 0,
      pendienteUbicar: 0
    };
    list.forEach(function (c) {
      if (c.tipo === 'local') out.local += 1;
      else out.importado += 1;
      if (c.validado !== 'ok') out.pendienteValidar += 1;
      else out.validado += 1;
      if (c.entrada === 'ok') out.conEntrada += 1;
      if (c.ubicado === 'ok') out.conUbicado += 1;
      if (c.entrada === 'ok' && c.ubicado !== 'ok') out.pendienteUbicar += 1;
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
    (contenedores || []).forEach(function (c) {
      if (filterFn && !filterFn(c)) return;
      var name = String(c[field] || '').trim();
      if (!name || name === '—') return;
      map[name] = (map[name] || 0) + 1;
    });
    return Object.keys(map).map(function (k) {
      return { name: k, n: map[k] };
    }).sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
  }

  function resumenEquipoTv(contenedores) {
    return {
      operadores: tallyCampo(contenedores, 'operadorDescarga'),
      validadores: tallyCampo(contenedores, 'validadorPor', function (c) {
        return c.validado === 'ok';
      }),
      ubicadores: tallyCampo(contenedores, 'ubicadorPor', function (c) {
        return c.ubicado === 'ok';
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
    resumenEquipoTv: resumenEquipoTv,
    validarPersonaEnRoster: validarPersonaEnRoster,
    resolverNombreEnRoster: resolverNombreEnRoster,
    getLiveShareBoard: getLiveShareBoard,
    isLiveShareBoardActive: isLiveShareBoardActive,
    startLiveShareBoard: startLiveShareBoard,
    stopLiveShareBoard: stopLiveShareBoard,
    toggleLiveShareBoard: toggleLiveShareBoard,
    bindSync: bindSync
  };
})(typeof window !== 'undefined' ? window : this);
