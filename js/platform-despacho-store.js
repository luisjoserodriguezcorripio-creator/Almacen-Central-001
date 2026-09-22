/**
 * Despacho — pedidos, estados y historial (localStorage + eventos)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'almacen_platform_data_despacho';
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-live-share')
    : null;
  var broadcastLista = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('despacho-live-lista')
    : null;

  var ESTADOS = {
    en_proceso: {
      id: 'en_proceso',
      label: 'En proceso',
      short: 'En proceso',
      icon: '🔄',
      fase: 'preparacion',
      color: 'amber',
      preparador: true,
      validador: false
    },
    facturado: {
      id: 'facturado',
      label: 'Facturado',
      short: 'Facturado',
      icon: '🧾',
      fase: 'facturacion',
      color: 'blue',
      preparador: true,
      validador: false
    },
    pendiente_carga: {
      id: 'pendiente_carga',
      label: 'Pendiente por validar',
      short: 'Pend. por validar',
      kpiLabel: 'Pendiente por validar',
      icon: '',
      iconType: 'lupa',
      fase: 'validacion',
      color: 'red',
      preparador: false,
      validador: true
    },
    en_validacion: {
      id: 'en_validacion',
      label: 'Validado',
      short: 'Validado',
      kpiLabel: 'Validado',
      icon: '',
      iconType: 'check',
      fase: 'validacion',
      color: 'yellow',
      preparador: false,
      validador: true
    },
    listo_despacho: {
      id: 'listo_despacho',
      label: 'Cargado',
      short: 'Cargado',
      kpiLabel: 'Cargado',
      icon: '',
      iconType: 'truck',
      fase: 'despacho',
      color: 'green',
      preparador: false,
      validador: true
    }
  };

  var PREPARADOR_ESTADOS = ['facturado'];
  var VALIDADOR_ESTADOS = ['pendiente_carga', 'en_validacion', 'listo_despacho'];
  var VALIDADORES_ASIGNABLES = [
    'Franklin M.',
    'Francisco Gil',
    'Eduardo L.',
    'Kelvin P.',
    'Ramon M.',
    'Raul M.',
    'José P.'
  ];
  /** No va en VALIDADORES_ASIGNABLES: no suma en el resumen TV. */
  var VALIDADOR_SIN_ASIGNAR = 'No asignado';
  var FLUJO = ['facturado', 'pendiente_carga', 'en_validacion', 'listo_despacho'];

  function uid() {
    return 'ped_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  /** Jornada laboral despacho: día operativo desde las 6:00 a.m. (hora RD). */
  var JORNADA_INICIO_HORA = 6;
  var TZ_DESPACHO = 'America/Santo_Domingo';

  function formatFechaDespacho(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: TZ_DESPACHO
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  /** Clave YYYY-MM-DD de la jornada laboral (inicia 6:00 a.m. hora RD). */
  function claveJornadaLaboral(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ_DESPACHO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false
      }).formatToParts(d);
      var y = '';
      var m = '';
      var day = '';
      var hour = 0;
      parts.forEach(function (p) {
        if (p.type === 'year') y = p.value;
        if (p.type === 'month') m = p.value;
        if (p.type === 'day') day = p.value;
        if (p.type === 'hour') hour = parseInt(p.value, 10) || 0;
      });
      if (hour < JORNADA_INICIO_HORA) {
        var dt = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10)));
        dt.setUTCDate(dt.getUTCDate() - 1);
        y = String(dt.getUTCFullYear());
        m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        day = String(dt.getUTCDate()).padStart(2, '0');
      }
      return y + '-' + m + '-' + day;
    } catch (e) {
      return '';
    }
  }

  function jornadaLaboralActualClave() {
    return claveJornadaLaboral(nowIso());
  }

  function emptyPayload() {
    return {
      module: 'despacho',
      version: 1,
      updatedAt: nowIso(),
      pedidos: [],
      liveShare: null,
      liveShareLista: null,
      liveShareSeq: 0,
      liveShareBarcodeSeq: 0
    };
  }

  function normalizeLiveShare(liveShare) {
    if (!liveShare || !liveShare.active) return null;
    return {
      active: true,
      seq: liveShare.seq != null ? liveShare.seq : null,
      idc: formatIdc(liveShare.idc || ''),
      jaula: String(liveShare.jaula || '').trim(),
      estado: ESTADOS[liveShare.estado] ? liveShare.estado : 'facturado',
      updatedAt: liveShare.updatedAt || nowIso(),
      sharedBy: liveShare.sharedBy || '—'
    };
  }

  function normalizeLiveShareLista(liveShareLista) {
    if (!liveShareLista || !liveShareLista.active) return null;
    return {
      active: true,
      seq: liveShareLista.seq != null ? liveShareLista.seq : null,
      updatedAt: liveShareLista.updatedAt || nowIso(),
      sharedBy: liveShareLista.sharedBy || '—'
    };
  }

  function load() {
    if (!global.localStorage) return emptyPayload();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyPayload();
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.pedidos)) return emptyPayload();
      data.module = 'despacho';
      var migrated = false;
      data.pedidos = (data.pedidos || []).map(function (p) {
        var before = p.estado;
        var beforeSeg = p.seguimientoValidador;
        var beforeCargas = JSON.stringify(p.cargasEquipo || []);
        var n = normalizePedido(p);
        if (n.estado !== before || n.seguimientoValidador !== beforeSeg) migrated = true;
        if (JSON.stringify(n.cargasEquipo || []) !== beforeCargas) migrated = true;
        return n;
      });
      data.liveShare = normalizeLiveShare(data.liveShare);
      data.liveShareLista = normalizeLiveShareLista(data.liveShareLista);
      if (!data.liveShareSeq && data.liveShareSeq !== 0) data.liveShareSeq = 0;
      if (!data.liveShareBarcodeSeq && data.liveShareBarcodeSeq !== 0) data.liveShareBarcodeSeq = 0;
      if (data.liveShareLista && data.liveShareLista.active && !data.liveShareSeq) {
        data.liveShareSeq = 1;
        migrated = true;
      }
      if (data.liveShare && data.liveShare.active && !data.liveShareBarcodeSeq) {
        data.liveShareBarcodeSeq = 1;
        migrated = true;
      }
      if (migrated) persistData(data, { silent: true });
      return data;
    } catch (e) {
      return emptyPayload();
    }
  }

  function normalizePedido(p) {
    p = p || {};
    var estado = ESTADOS[p.estado] ? p.estado : 'en_proceso';
    var seguimientoValidador = p.seguimientoValidador === true;
    if (p.seguimientoValidador == null && VALIDADOR_ESTADOS.indexOf(estado) >= 0) {
      seguimientoValidador = true;
    }
    if (seguimientoValidador && PREPARADOR_ESTADOS.indexOf(estado) >= 0) {
      estado = 'pendiente_carga';
    }
    if (!seguimientoValidador && p.visibleValidador !== false &&
        PREPARADOR_ESTADOS.indexOf(estado) >= 0) {
      seguimientoValidador = true;
      estado = 'pendiente_carga';
    }
    var estadoOperador = p.estadoOperador;
    if (!estadoOperador || PREPARADOR_ESTADOS.indexOf(estadoOperador) < 0) {
      estadoOperador = inferEstadoOperador(p);
    }
    if (estadoOperador === 'en_proceso') estadoOperador = 'facturado';
    var pedido = {
      id: p.id || uid(),
      idc: formatIdc(p.idc || ''),
      jaula: String(p.jaula || '').trim(),
      cliente: String(p.cliente || '').trim(),
      estadoOperador: estadoOperador,
      estado: estado,
      seguimientoValidador: seguimientoValidador,
      visibleValidador: p.visibleValidador !== false,
      archivadoValidadorAt: p.archivadoValidadorAt || null,
      archivadoValidadorBy: p.archivadoValidadorBy || null,
      archivadoPasillo: p.archivadoPasillo != null ? String(p.archivadoPasillo) : null,
      createdAt: p.createdAt || nowIso(),
      createdBy: p.createdBy || '—',
      validadorAsignado: String(p.validadorAsignado || '').trim(),
      cargasEquipo: [],
      cantidadCamiones: 0,
      validadoresTrabajo: [],
      updatedAt: p.updatedAt || p.createdAt || nowIso(),
      updatedBy: p.updatedBy || p.createdBy || '—',
      historial: Array.isArray(p.historial) ? p.historial : []
    };
    pedido.cargasEquipo = reconcileCargasEquipo(p);
    syncCargasLegacyFields(pedido);
    return pedido;
  }

  function inferEstadoOperador(p) {
    p = p || {};
    if (p.estadoOperador && PREPARADOR_ESTADOS.indexOf(p.estadoOperador) >= 0) {
      return p.estadoOperador;
    }
    var hist = p.historial || [];
    for (var i = 0; i < hist.length; i++) {
      var n = String(hist[i].nota || '');
      if (/facturado/i.test(n)) return 'facturado';
      if (/en proceso/i.test(n)) return 'en_proceso';
    }
    return 'facturado';
  }

  function save(data, opts) {
    return persistData(data, opts || {});
  }

  function notify(data) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-updated', { detail: { data: data, at: nowIso() } }));
    } catch (e) { /* noop */ }
    if (data && data.liveShareLista && data.liveShareLista.active) {
      notifyLiveShareLista(data.liveShareLista);
    }
  }

  function pushHistorial(pedido, entry) {
    pedido.historial = pedido.historial || [];
    pedido.historial.unshift({
      at: entry.at || nowIso(),
      usuario: entry.usuario || '—',
      panel: entry.panel || 'sistema',
      desde: entry.desde != null ? entry.desde : null,
      hacia: entry.hacia,
      nota: entry.nota || '',
      validadorAsignado: entry.validadorAsignado != null
        ? String(entry.validadorAsignado || '').trim()
        : String(pedido.validadorAsignado || '').trim()
    });
    pedido.historial = pedido.historial.slice(0, 50);
  }

  function findByIdc(pedidos, idc) {
    var n = formatIdc(idc).toLowerCase();
    if (!n) return -1;
    return (pedidos || []).findIndex(function (p) {
      return formatIdc(p.idc).toLowerCase() === n;
    });
  }

  function formatIdc(raw) {
    return String(raw || '').trim();
  }

  function normalizeCantidadCamiones(raw) {
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) return 0;
    if (n > 99) return 99;
    return n;
  }

  function normalizeCargaItem(raw) {
    raw = raw || {};
    var validador = String(raw.validador || raw.nombre || '').trim();
    if (!validador || validador === VALIDADOR_SIN_ASIGNAR) return null;
    if (VALIDADORES_ASIGNABLES.indexOf(validador) < 0) return null;
    return {
      validador: validador,
      camiones: normalizeCantidadCamiones(raw.camiones != null ? raw.camiones : 0),
      explicit: !!raw.explicit
    };
  }

  /** ¿El validador registró camiones a mano? (historial del IDC) */
  function cargaRegistradaEnHistorial(pedido, validador) {
    var nombre = String(validador || '').trim();
    if (!nombre) return false;
    var first = nombre.split(' ')[0];
    var hist = (pedido && pedido.historial) || [];
    for (var i = hist.length - 1; i >= 0; i--) {
      var h = hist[i];
      var nota = String(h.nota || '');
      if (nota.indexOf('cargó') < 0 && nota.indexOf('sumó carga') < 0) continue;
      var who = String(h.validadorAsignado || h.usuario || '').trim();
      if (who && who.toLowerCase() === nombre.toLowerCase()) return true;
      if (nota.indexOf(nombre) >= 0) return true;
      if (first && first.length > 2 && nota.indexOf(first) >= 0) return true;
    }
    return false;
  }

  function reconcileCargasEquipo(raw) {
    raw = raw || {};
    var out = [];
    var seen = {};
    if (!Array.isArray(raw.cargasEquipo)) return out;
    raw.cargasEquipo.forEach(function (item) {
      var c = normalizeCargaItem(item);
      if (!c || !c.validador || (c.camiones || 0) <= 0) return;
      var key = c.validador.toLowerCase();
      if (seen[key]) return;
      if (!c.explicit) {
        if (cargaRegistradaEnHistorial(raw, c.validador)) {
          c.explicit = true;
        } else {
          return;
        }
      }
      seen[key] = true;
      out.push(c);
    });
    return out;
  }

  function migrateCargasEquipo(p) {
    p = p || {};
    var names = [];
    if (Array.isArray(p.validadoresTrabajo)) {
      p.validadoresTrabajo.forEach(function (n) {
        n = String(n || '').trim();
        if (n && names.indexOf(n) < 0) names.push(n);
      });
    }
    var asignado = String(p.validadorAsignado || '').trim();
    if (asignado && asignado !== VALIDADOR_SIN_ASIGNAR && names.indexOf(asignado) < 0) {
      names.unshift(asignado);
    }
    if (!names.length) return [];
    var total = normalizeCantidadCamiones(p.cantidadCamiones) || names.length;
    if (names.length === 1) {
      return [{ validador: names[0], camiones: Math.max(1, total) }];
    }
    return names.map(function (n, i) {
      return {
        validador: n,
        camiones: i === 0 ? Math.max(1, total - (names.length - 1)) : 1
      };
    });
  }

  function normalizeCargasEquipo(p) {
    p = p || {};
    var out = [];
    var seen = {};
    if (Array.isArray(p.cargasEquipo)) {
      p.cargasEquipo.forEach(function (item) {
        var row = normalizeCargaItem(item);
        if (!row || !row.validador) return;
        var key = row.validador.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(row);
      });
    }
    return out;
  }

  /** Solo cargas que el validador registró a mano (no defaults del sistema). */
  function cargasEquipoExplicitas(p) {
    return normalizeCargasEquipo(p).filter(function (c) {
      return c.explicit && (c.camiones || 0) > 0;
    });
  }

  function syncCargasLegacyFields(pedido) {
    var cargas = normalizeCargasEquipo(pedido);
    pedido.cargasEquipo = cargas;
    pedido.validadoresTrabajo = cargas.map(function (c) { return c.validador; });
    var total = cargas.reduce(function (sum, c) { return sum + c.camiones; }, 0);
    pedido.cantidadCamiones = total > 0 ? total : 0;
    return cargas;
  }

  function totalCamionesEquipo(pedido) {
    return normalizeCargasEquipo(pedido).reduce(function (sum, c) {
      return sum + (c.camiones || 0);
    }, 0);
  }

  function formatCargasEquipoResumen(pedido, opts) {
    opts = opts || {};
    var cargas = normalizeCargasEquipo(pedido);
    if (!cargas.length) return '—';
    var parts = cargas.map(function (c) {
      var nombre = c.validador.split(' ')[0];
      if (opts.fullName) nombre = c.validador;
      return nombre + ' ' + c.camiones;
    });
    var txt = parts.join(' · ');
    if (opts.withTotal && cargas.length > 1) {
      txt += ' (total ' + totalCamionesEquipo(pedido) + ')';
    }
    return txt;
  }

  function normalizeValidadoresTrabajo(arr, validadorAsignado) {
    var out = [];
    var seen = {};
    function add(name) {
      name = String(name || '').trim();
      if (!name || name === VALIDADOR_SIN_ASIGNAR) return;
      var key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(name);
    }
    if (Array.isArray(arr)) arr.forEach(add);
    if (!out.length) add(validadorAsignado);
    return out;
  }

  function findCargaIndex(cargas, validadorNombre) {
    var key = String(validadorNombre || '').trim().toLowerCase();
    if (!key) return -1;
    return (cargas || []).findIndex(function (c) {
      return String(c.validador || '').toLowerCase() === key;
    });
  }

  function resolverValidadorUsuario(usuario) {
    usuario = String(usuario || '').trim();
    if (!usuario || usuario === '—') return '';
    if (VALIDADORES_ASIGNABLES.indexOf(usuario) >= 0) return usuario;
    var lower = usuario.toLowerCase();
    for (var i = 0; i < VALIDADORES_ASIGNABLES.length; i++) {
      var name = VALIDADORES_ASIGNABLES[i];
      if (lower === name.toLowerCase()) return name;
      var first = name.split(' ')[0].toLowerCase();
      if (first && lower.indexOf(first) >= 0) return name;
    }
    return '';
  }

  function ensureValidadorEnTrabajo(pedido, nombre, camiones) {
    nombre = String(nombre || '').trim();
    if (!nombre || nombre === VALIDADOR_SIN_ASIGNAR) return false;
    if (VALIDADORES_ASIGNABLES.indexOf(nombre) < 0) return false;
    var cargas = normalizeCargasEquipo(pedido);
    var idx = findCargaIndex(cargas, nombre);
    if (idx >= 0) return false;
    cargas.push({
      validador: nombre,
      camiones: normalizeCantidadCamiones(camiones != null ? camiones : 1) || 1
    });
    syncCargasLegacyFields(Object.assign(pedido, { cargasEquipo: cargas }));
    return true;
  }

  function formatValidadoresTrabajo(pedido) {
    return formatCargasEquipoResumen(pedido, { fullName: true });
  }

  function persistData(data, opts) {
    opts = opts || {};
    if (!global.localStorage) return false;
    data = data || emptyPayload();
    data.module = 'despacho';
    var listaLiveTouch = !opts.silent && !opts.shareListaToggle && !opts.liveShareOnly &&
      touchLiveShareListaForPedidos(data);
    data.updatedAt = nowIso();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (opts.liveShareOnly) {
      notifyLiveShare(data.liveShare || null);
      try {
        global.dispatchEvent(new CustomEvent('despacho-updated', {
          detail: { data: data, at: nowIso(), source: 'live-share' }
        }));
      } catch (e) { /* noop */ }
    } else if (!opts.silent) {
      notify(data);
    }
    /* Compartir barcode en vivo: solo local + TVs — no empujar toda la nube en cada tecla */
    if (!opts.silent && !opts.liveShareOnly && global.PlatformDespachoCloudSync) {
      if (opts.shareListaToggle || opts.shareBarcodeToggle || listaLiveTouch || opts.listaLivePush || opts.estadoPush) {
        if (global.PlatformDespachoCloudSync.pushLocalForce) {
          global.PlatformDespachoCloudSync.pushLocalForce();
        }
      } else if (global.PlatformDespachoCloudSync.pushLocal) {
        global.PlatformDespachoCloudSync.pushLocal(3);
      }
    }
    return true;
  }

  function promoverASeguimientoValidador(pedido, estadoOperador, usuario, ts) {
    estadoOperador = PREPARADOR_ESTADOS.indexOf(estadoOperador) >= 0 ? estadoOperador : 'facturado';
    var opLabel = ESTADOS[estadoOperador] ? ESTADOS[estadoOperador].short : estadoOperador;
    var prevEstado = pedido.estado;
    pedido.seguimientoValidador = true;
    pedido.visibleValidador = true;
    pedido.estadoOperador = estadoOperador;
    pedido.estado = 'pendiente_carga';
    pedido.archivadoValidadorAt = null;
    pedido.archivadoValidadorBy = null;
    pedido.archivadoPasillo = null;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario;
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario,
      panel: 'preparador',
      desde: prevEstado,
      hacia: 'pendiente_carga',
      nota: 'Operador registró como ' + opLabel + ' → ingresó a seguimiento validador'
    });
  }

  function registrarPedido(idc, jaula, estado, usuario, cliente, validadorAsignado) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    cliente = String(cliente || '').trim();
    validadorAsignado = String(validadorAsignado || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
    usuario = usuario || '—';

    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese la jaula.' };
    if (!validadorAsignado) return { ok: false, error: 'Seleccione el validador asignado al pedido.' };
    if (validadorAsignado !== VALIDADOR_SIN_ASIGNAR &&
        VALIDADORES_ASIGNABLES.indexOf(validadorAsignado) < 0) {
      return { ok: false, error: 'Seleccione un validador de la lista autorizada.' };
    }

    var data = load();
    var idx = findByIdc(data.pedidos, idc);
    var ts = nowIso();

    if (idx >= 0) {
      var existing = data.pedidos[idx];
      if (existing.seguimientoValidador && existing.visibleValidador !== false) {
        return { ok: false, error: 'El pedido ' + idc + ' está en seguimiento validador. El validador debe quitarlo.' };
      }
      var wasArchived = existing.visibleValidador === false;
      existing.jaula = jaula;
      existing.cliente = cliente;
      existing.validadorAsignado = validadorAsignado;
      existing.visibleValidador = true;
      promoverASeguimientoValidador(existing, estado, usuario, ts);
      if (wasArchived) {
        existing.historial[0].nota = 'Reactivado · ' + existing.historial[0].nota;
      }
      save(data);
      return { ok: true, data: data, pedido: existing, updated: true };
    }

    var pedido = {
      id: uid(),
      idc: idc,
      jaula: jaula,
      cliente: cliente,
      validadorAsignado: validadorAsignado,
      cargasEquipo: [],
      cantidadCamiones: 0,
      validadoresTrabajo: [],
      estadoOperador: estado,
      estado: 'pendiente_carga',
      seguimientoValidador: true,
      visibleValidador: true,
      archivadoValidadorAt: null,
      archivadoValidadorBy: null,
      archivadoPasillo: null,
      createdAt: ts,
      createdBy: usuario,
      updatedAt: ts,
      updatedBy: usuario,
      historial: []
    };
    var opLabel = ESTADOS[estado] ? ESTADOS[estado].short : estado;
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario,
      panel: 'preparador',
      desde: null,
      hacia: 'pendiente_carga',
      nota: 'Registro operador (' + opLabel + ') → validador ' + validadorAsignado
    });
    data.pedidos.unshift(pedido);
    save(data);
    return { ok: true, data: data, pedido: pedido, updated: false };
  }

  function enviarASeguimientoValidador(idc, jaula, usuario) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    usuario = usuario || '—';
    if (!idc) return { ok: false, error: 'Ingrese el ID del pedido (IDC).' };
    if (!jaula) return { ok: false, error: 'Ingrese la jaula.' };
    var data = load();
    var idx = findByIdc(data.pedidos, idc);
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };
    var pedido = data.pedidos[idx];
    if (pedido.seguimientoValidador && pedido.visibleValidador !== false) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }
    var ts = nowIso();
    pedido.jaula = jaula;
    promoverASeguimientoValidador(pedido, pedido.estado, usuario, ts);
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function cambiarEstado(pedidoId, nuevoEstado, usuario) {
    if (!ESTADOS[nuevoEstado] || VALIDADOR_ESTADOS.indexOf(nuevoEstado) < 0) {
      return { ok: false, error: 'Estado no válido para el validador.' };
    }
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador) {
      return { ok: false, error: 'Solo puede cambiar estado IDC en seguimiento validador.' };
    }
    var prev = pedido.estado;
    if (prev === nuevoEstado) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

    var prevFase = ESTADOS[prev] ? ESTADOS[prev].fase : '';
    var newFase = ESTADOS[nuevoEstado] ? ESTADOS[nuevoEstado].fase : '';
    var ts = nowIso();
    pedido.estado = nuevoEstado;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: prev,
      hacia: nuevoEstado,
      validadorAsignado: pedido.validadorAsignado,
      nota: nuevoEstado === 'listo_despacho'
        ? 'Validador marcó como cargado'
        : (prevFase === 'preparacion' && newFase !== 'preparacion')
          ? 'Validador cambió estado desde preparación'
          : 'Cambio de estado validador'
    });
    save(data, { estadoPush: true });
    return { ok: true, data: data, pedido: pedido };
  }

  function asignarValidador(pedidoId, validadorAsignado, usuario) {
    validadorAsignado = String(validadorAsignado || '').trim();
    if (!validadorAsignado) {
      return { ok: false, error: 'Seleccione el validador o «No asignado».' };
    }
    if (validadorAsignado !== VALIDADOR_SIN_ASIGNAR &&
        VALIDADORES_ASIGNABLES.indexOf(validadorAsignado) < 0) {
      return { ok: false, error: 'Seleccione un validador de la lista autorizada.' };
    }
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador || pedido.visibleValidador === false) {
      return { ok: false, error: 'Solo puede asignar validador a IDC en seguimiento activo.' };
    }

    var prev = String(pedido.validadorAsignado || '').trim();
    if (prev === validadorAsignado) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

    var ts = nowIso();
    pedido.validadorAsignado = validadorAsignado;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: prev || null,
      hacia: null,
      validadorAsignado: validadorAsignado,
      nota: prev
        ? 'Validador reasignado: ' + prev + ' → ' + validadorAsignado
        : 'Validador asignado: ' + validadorAsignado
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function actualizarCamionesValidador(pedidoId, validadorNombre, camiones, usuario) {
    validadorNombre = String(validadorNombre || '').trim();
    camiones = normalizeCantidadCamiones(camiones);
    if (!validadorNombre) return { ok: false, error: 'Validador no indicado.' };
    if (VALIDADORES_ASIGNABLES.indexOf(validadorNombre) < 0) {
      return { ok: false, error: 'Seleccione un validador de la lista autorizada.' };
    }

    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador || pedido.visibleValidador === false) {
      return { ok: false, error: 'Solo puede editar carga en IDC en seguimiento activo.' };
    }

    var cargas = normalizeCargasEquipo(pedido);
    var cidx = findCargaIndex(cargas, validadorNombre);
    var prev = cidx >= 0 ? cargas[cidx].camiones : null;

    if (camiones <= 0) {
      if (cidx < 0) return { ok: true, data: data, pedido: pedido, unchanged: true };
      cargas.splice(cidx, 1);
    } else if (cidx >= 0) {
      if (prev === camiones) return { ok: true, data: data, pedido: pedido, unchanged: true };
      cargas[cidx].camiones = camiones;
      cargas[cidx].explicit = true;
    } else {
      cargas.push({ validador: validadorNombre, camiones: camiones, explicit: true });
    }

    pedido.cargasEquipo = cargas;
    var ts = nowIso();
    syncCargasLegacyFields(pedido);
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: null,
      hacia: null,
      validadorAsignado: validadorNombre,
      nota: camiones <= 0
        ? validadorNombre + ' salió de la carga del IDC'
        : validadorNombre + ' cargó ' + camiones + ' camión' + (camiones === 1 ? '' : 'es')
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function actualizarCantidadCamiones(pedidoId, cantidad, usuario) {
    cantidad = normalizeCantidadCamiones(cantidad);
    if (cantidad < 1) cantidad = 1;
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };
    var pedido = data.pedidos[idx];
    var asignado = String(pedido.validadorAsignado || '').trim();
    if (!asignado || asignado === VALIDADOR_SIN_ASIGNAR) {
      asignado = resolverValidadorUsuario(usuario) || (normalizeCargasEquipo(pedido)[0] || {}).validador;
    }
    if (!asignado) return { ok: false, error: 'Asigne un validador primero.' };
    return actualizarCamionesValidador(pedidoId, asignado, cantidad, usuario);
  }

  function agregarValidadorTrabajo(pedidoId, validadorNombre, usuario, camiones) {
    validadorNombre = String(validadorNombre || '').trim();
    camiones = normalizeCantidadCamiones(camiones != null ? camiones : 1) || 1;
    if (!validadorNombre) {
      return { ok: false, error: 'Seleccione un validador del equipo.' };
    }
    if (validadorNombre !== VALIDADOR_SIN_ASIGNAR &&
        VALIDADORES_ASIGNABLES.indexOf(validadorNombre) < 0) {
      return { ok: false, error: 'Seleccione un validador de la lista autorizada.' };
    }

    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador || pedido.visibleValidador === false) {
      return { ok: false, error: 'Solo puede editar el equipo en IDC en seguimiento activo.' };
    }

    var cargas = normalizeCargasEquipo(pedido);
    if (findCargaIndex(cargas, validadorNombre) >= 0) {
      return actualizarCamionesValidador(pedidoId, validadorNombre, camiones, usuario);
    }

    var ts = nowIso();
    cargas.push({ validador: validadorNombre, camiones: camiones, explicit: true });
    pedido.cargasEquipo = cargas;
    syncCargasLegacyFields(pedido);
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: null,
      hacia: null,
      validadorAsignado: validadorNombre,
      nota: validadorNombre + ' sumó carga: ' + camiones + ' camión' + (camiones === 1 ? '' : 'es')
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function quitarValidadorTrabajo(pedidoId, validadorNombre, usuario) {
    return actualizarCamionesValidador(pedidoId, validadorNombre, 0, usuario);
  }

  /** Orden validador: fecha/hora de registro (no reordenar al cambiar estado). */
  function pedidoTimestamp(p) {
    var t = Date.parse(p && p.createdAt);
    if (t) return t;
    return Date.parse(p && p.updatedAt) || 0;
  }

  /** Cargado siempre debajo de pendiente/validado; dentro de cada grupo, más antiguos arriba. */
  function validadorEstadoSortRank(estado) {
    if (estado === 'listo_despacho') return 1;
    if (estado === 'pendiente_carga' || estado === 'en_validacion') return 0;
    return 2;
  }

  /** Validador: pendiente/validado arriba (viejos primero); cargado abajo (viejos primero entre cargados). */
  function sortPedidosValidador(pedidos) {
    return (pedidos || []).slice().sort(function (a, b) {
      var ra = validadorEstadoSortRank(a.estado);
      var rb = validadorEstadoSortRank(b.estado);
      if (ra !== rb) return ra - rb;
      var ta = pedidoTimestamp(a);
      var tb = pedidoTimestamp(b);
      if (ta !== tb) return ta - tb;
      var ja = String(a.jaula || '').localeCompare(String(b.jaula || ''), 'es', { numeric: true });
      if (ja !== 0) return ja;
      return String(a.idc || '').localeCompare(String(b.idc || ''), 'es', { numeric: true });
    });
  }

  function filterPedidos(pedidos, opts) {
    opts = opts || {};
    var list = (pedidos || []).slice();
    if (opts.estado && ESTADOS[opts.estado]) {
      list = list.filter(function (p) { return p.estado === opts.estado; });
    }
    if (opts.q) {
      var q = String(opts.q).trim().toLowerCase();
      if (q) {
        list = list.filter(function (p) {
          return String(p.idc).toLowerCase().indexOf(q) >= 0 ||
            String(p.jaula).toLowerCase().indexOf(q) >= 0 ||
            String(p.cliente || '').toLowerCase().indexOf(q) >= 0 ||
            String(p.validadorAsignado || '').toLowerCase().indexOf(q) >= 0 ||
            formatCargasEquipoResumen(p).toLowerCase().indexOf(q) >= 0;
        });
      }
    }
    if (opts.fase) {
      list = list.filter(function (p) {
        var e = ESTADOS[p.estado];
        return e && e.fase === opts.fase;
      });
    }
    if (opts.visiblesValidador) {
      list = list.filter(function (p) { return p.visibleValidador !== false; });
    }
    if (opts.archivadosValidador) {
      list = list.filter(function (p) { return p.visibleValidador === false; });
    }
    if (opts.soloPreparador) {
      list = list.filter(function (p) {
        return PREPARADOR_ESTADOS.indexOf(p.estado) >= 0 &&
          p.seguimientoValidador !== true &&
          p.visibleValidador !== false;
      });
    }
    if (opts.soloValidador) {
      list = list.filter(function (p) {
        return p.seguimientoValidador === true &&
          p.visibleValidador !== false &&
          VALIDADOR_ESTADOS.indexOf(p.estado) >= 0;
      });
    }
    if (opts.soloValidador || opts.visiblesValidador) {
      return sortPedidosValidador(list);
    }
    list.sort(function (a, b) {
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return list;
  }

  function countByEstado(pedidos, opts) {
    opts = opts || {};
    var counts = {};
    Object.keys(ESTADOS).forEach(function (k) { counts[k] = 0; });
    (pedidos || []).forEach(function (p) {
      if (p.visibleValidador === false) return;
      var enOperador = p.seguimientoValidador !== true;
      var enValidador = p.seguimientoValidador === true;
      if (PREPARADOR_ESTADOS.indexOf(p.estado) >= 0) {
        if (!enOperador) return;
      } else if (VALIDADOR_ESTADOS.indexOf(p.estado) >= 0) {
        if (!enValidador) return;
      }
      if (counts[p.estado] != null) counts[p.estado] += 1;
    });
    if (opts.soloPreparador) {
      VALIDADOR_ESTADOS.forEach(function (k) { counts[k] = 0; });
    }
    if (opts.soloValidador) {
      PREPARADOR_ESTADOS.forEach(function (k) { counts[k] = 0; });
    }
    return counts;
  }

  function formatEstado(id) {
    var e = ESTADOS[id];
    return e ? (e.short || e.label) : id;
  }

  function renderEstadoIconSvg(estadoId, opts) {
    opts = opts || {};
    var e = ESTADOS[estadoId];
    if (!e || !e.iconType) return '';
    var cls = 'desp-estado-icon desp-estado-icon--' + e.iconType;
    if (opts.compact) cls += ' desp-estado-icon--sm';
    if (opts.inBtn) cls += ' desp-estado-icon--btn';
    var svg = '';
    if (e.iconType === 'lupa') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';
    } else if (e.iconType === 'check') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20 6L9 17l-5-5"/></svg>';
    } else if (e.iconType === 'truck') {
      svg = '<svg class="desp-estado-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>' +
        '<path d="M15 18h2"/>' +
        '<path d="M19 18h2v-3.34a1 1 0 0 0-.76-.97L19 13V9a1 1 0 0 0-1-1h-3"/>' +
        '<circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>';
    }
    return '<span class="' + cls + '" aria-hidden="true">' + svg + '</span>';
  }

  function formatHistorialEntry(h) {
    if (!h) return '—';
    var desde = h.desde ? (ESTADOS[h.desde] ? ESTADOS[h.desde].short : h.desde) : '—';
    var hacia = h.hacia ? (ESTADOS[h.hacia] ? ESTADOS[h.hacia].short : h.hacia) : '—';
    return desde + ' → ' + hacia;
  }

  function notifyLiveShare(share) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-live-share', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcast) {
      try { broadcast.postMessage({ at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function notifyLiveShareLista(share) {
    try {
      global.dispatchEvent(new CustomEvent('despacho-live-lista', {
        detail: { share: share, at: nowIso() }
      }));
    } catch (e) { /* noop */ }
    if (broadcastLista) {
      try { broadcastLista.postMessage({ at: Date.now() }); } catch (e) { /* noop */ }
    }
  }

  function getLiveShare(data) {
    data = data || load();
    return data.liveShare && data.liveShare.active ? data.liveShare : null;
  }

  function isLiveShareActive(data) {
    return !!getLiveShare(data);
  }

  function startLiveShare(idc, jaula, estado, usuario) {
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
    var data = load();
    var seq = (data.liveShareBarcodeSeq || 0) + 1;
    var ts = nowIso();
    data.liveShareBarcodeSeq = seq;
    data.liveShare = {
      active: true,
      seq: seq,
      idc: idc,
      jaula: jaula,
      estado: estado,
      updatedAt: ts,
      sharedBy: usuario || '—'
    };
    persistData(data, { shareBarcodeToggle: true });
    return { ok: true, data: data, liveShare: data.liveShare };
  }

  function stopLiveShare(usuario) {
    var data = load();
    var seq = (data.liveShareBarcodeSeq || 0) + 1;
    data.liveShareBarcodeSeq = seq;
    data.liveShare = null;
    persistData(data, { shareBarcodeToggle: true });
    notifyLiveShare(null);
    return { ok: true, data: data, stoppedBy: usuario };
  }

  function syncLiveShare(idc, jaula, estado, usuario) {
    return publishLiveShare(idc, jaula, estado, usuario, { requireActive: true });
  }

  function publishLiveShare(idc, jaula, estado, usuario, opts) {
    opts = opts || {};
    idc = formatIdc(idc);
    jaula = String(jaula || '').trim();
    estado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0 ? estado : 'facturado';
    var data = load();
    var prev = data.liveShare;
    if (opts.requireActive && (!prev || !prev.active)) {
      return { ok: true, synced: false, data: data };
    }
    if (!idc && !jaula && opts.requireActive) {
      return { ok: true, synced: false, data: data };
    }
    var nextEstado = ESTADOS[estado] && PREPARADOR_ESTADOS.indexOf(estado) >= 0
      ? estado
      : ((prev && prev.estado) || 'facturado');
    var nextBy = usuario || (prev && prev.sharedBy) || '—';
    if (prev && prev.active &&
        formatIdc(prev.idc) === idc &&
        String(prev.jaula || '').trim() === jaula &&
        prev.estado === nextEstado &&
        String(prev.sharedBy || '') === String(nextBy)) {
      return { ok: true, synced: false, unchanged: true, data: data, liveShare: prev };
    }
    data.liveShare = {
      active: true,
      idc: idc,
      jaula: jaula,
      estado: nextEstado,
      updatedAt: nowIso(),
      sharedBy: nextBy
    };
    persistData(data, { liveShareOnly: true });
    return { ok: true, synced: true, data: data, liveShare: data.liveShare };
  }

  function toggleLiveShare(idc, jaula, estado, usuario) {
    if (isLiveShareActive()) {
      return stopLiveShare(usuario);
    }
    return startLiveShare(idc, jaula, estado, usuario);
  }

  function getLiveShareLista(data) {
    data = data || load();
    return data.liveShareLista && data.liveShareLista.active ? data.liveShareLista : null;
  }

  function isLiveShareListaActive(data) {
    return !!getLiveShareLista(data);
  }

  function normalizeShareUserKey(name) {
    return String(name || '').trim().toLowerCase()
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isListaShareByUser(share, usuario) {
    if (!share || !usuario) return false;
    var who = normalizeShareUserKey(share.sharedBy);
    var me = normalizeShareUserKey(usuario);
    if (!who || who === '—' || !me) return false;
    if (who === me) return true;
    var whoFirst = who.split(' ')[0];
    var meFirst = me.split(' ')[0];
    if (whoFirst && meFirst && whoFirst.length > 2 && whoFirst === meFirst) return true;
    var whoCompact = who.replace(/\s/g, '');
    var meCompact = me.replace(/\s/g, '');
    return !!(whoCompact && meCompact && whoCompact === meCompact);
  }

  function listaSharePermisos(data, usuario, isAdmin, panelOpts) {
    panelOpts = panelOpts || {};
    var sharing = getLiveShareLista(data);
    var active = !!(sharing && sharing.active);
    var own = active && isListaShareByUser(sharing, usuario);
    var isValidatorPanel = !!panelOpts.isValidatorPanel;
    return {
      active: active,
      sharing: sharing,
      own: own,
      canStart: !active,
      canStop: active && own,
      canTakeOver: active && !own && isValidatorPanel,
      isAdmin: !!isAdmin,
      isValidatorPanel: isValidatorPanel,
      sharedBy: sharing ? String(sharing.sharedBy || '').trim() : ''
    };
  }

  function touchLiveShareListaForPedidos(data) {
    if (!data || !data.liveShareLista || !data.liveShareLista.active) return false;
    data.liveShareLista = Object.assign({}, data.liveShareLista, { updatedAt: nowIso() });
    return true;
  }

  function startLiveShareLista(usuario, opts) {
    opts = opts || {};
    var data = load();
    if (isLiveShareListaActive(data) && !opts.takeOver) {
      if (isListaShareByUser(data.liveShareLista, usuario)) {
        return { ok: true, data: data, unchanged: true, liveShareLista: data.liveShareLista };
      }
      return { ok: false, error: 'Otro usuario ya comparte en pantalla TV.' };
    }
    var seq = Math.max((data.liveShareSeq || 0) + 1, Date.now());
    if (opts.takeOver) seq = Math.max(seq, Date.now() + 1);
    var ts = nowIso();
    data.liveShareSeq = seq;
    data.liveShareLista = {
      active: true,
      seq: seq,
      updatedAt: ts,
      sharedBy: usuario || '—'
    };
    persistData(data, { shareListaToggle: true });
    notifyLiveShareLista(data.liveShareLista);
    return { ok: true, data: data, liveShareLista: data.liveShareLista };
  }

  function stopLiveShareLista(usuario, opts) {
    opts = opts || {};
    var data = load();
    if (!isLiveShareListaActive(data)) {
      return { ok: true, data: data, unchanged: true };
    }
    if (!isListaShareByUser(data.liveShareLista, usuario)) {
      return { ok: false, error: 'Solo quien comparte puede detener su pantalla TV.' };
    }
    var seq = Math.max((data.liveShareSeq || 0) + 1, Date.now());
    if (opts.forceGlobal) {
      seq = Math.max(seq, Date.now() + 1);
    }
    data.liveShareSeq = seq;
    data.liveShareLista = null;
    persistData(data, { shareListaToggle: true });
    notifyLiveShareLista(null);
    return { ok: true, data: data, stoppedBy: usuario };
  }

  function toggleLiveShareLista(usuario, opts) {
    opts = opts || {};
    if (isLiveShareListaActive()) {
      return stopLiveShareLista(usuario, opts);
    }
    return startLiveShareLista(usuario);
  }

  function archivarDeVistaValidador(pedidoId, usuario) {
    var data = load();
    var idx = (data.pedidos || []).findIndex(function (p) { return p.id === pedidoId; });
    if (idx < 0) return { ok: false, error: 'Pedido no encontrado.' };

    var pedido = data.pedidos[idx];
    if (!pedido.seguimientoValidador) {
      if (VALIDADOR_ESTADOS.indexOf(pedido.estado) >= 0) {
        pedido.seguimientoValidador = true;
      } else {
        return { ok: false, error: 'Este IDC no está en seguimiento validador.' };
      }
    }
    if (pedido.visibleValidador === false) {
      return { ok: true, data: data, pedido: pedido, unchanged: true };
    }

    var ts = nowIso();
    var pasillo = String(pedido.jaula || '').trim();
    pedido.visibleValidador = false;
    pedido.archivadoValidadorAt = ts;
    pedido.archivadoValidadorBy = usuario || '—';
    pedido.archivadoPasillo = pasillo;
    pedido.updatedAt = ts;
    pedido.updatedBy = usuario || '—';
    pushHistorial(pedido, {
      at: ts,
      usuario: usuario || '—',
      panel: 'validador',
      desde: pedido.estado,
      hacia: pedido.estado,
      nota: 'Retirado de vista validador · IDC ' + pedido.idc + ' · Jaula ' + (pasillo || '—')
    });
    save(data);
    return { ok: true, data: data, pedido: pedido };
  }

  function getPedidosSeguimientoPreparador(pedidos) {
    return getPedidosActivos((pedidos || []).filter(function (p) {
      return p.seguimientoValidador !== true &&
        p.visibleValidador !== false &&
        PREPARADOR_ESTADOS.indexOf(p.estado) >= 0;
    }));
  }

  function getPedidosVisiblesValidador(pedidos) {
    return sortPedidosValidador((pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true &&
        p.visibleValidador !== false &&
        VALIDADOR_ESTADOS.indexOf(p.estado) >= 0;
    }));
  }

  function getPedidosArchivadosValidador(pedidos) {
    return (pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true && p.visibleValidador === false;
    }).sort(function (a, b) {
      return (b.archivadoValidadorAt || b.updatedAt || '').localeCompare(a.archivadoValidadorAt || a.updatedAt || '');
    });
  }

  function getRegistroEnviadosValidador(pedidos) {
    return (pedidos || []).filter(function (p) {
      return p.seguimientoValidador === true;
    }).sort(function (a, b) {
      return (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '');
    });
  }

  function countKpiOperador(pedidos) {
    var registro = getRegistroEnviadosValidador(pedidos);
    var activos = registro.filter(function (p) { return p.visibleValidador !== false; });
    var retirados = registro.filter(function (p) { return p.visibleValidador === false; });
    var stats = {
      activos: activos.length,
      retirados: retirados.length,
      total: registro.length
    };
    VALIDADOR_ESTADOS.forEach(function (id) {
      stats[id] = activos.filter(function (p) { return p.estado === id; }).length;
    });
    return stats;
  }

  function esValidadorContable(nombre) {
    var n = String(nombre || '').trim();
    return n && n !== VALIDADOR_SIN_ASIGNAR && VALIDADORES_ASIGNABLES.indexOf(n) >= 0;
  }

  function normalizarNombreValidador(nombre) {
    return String(nombre || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ');
  }

  function resolverValidadorEnHistorial(usuario) {
    var u = String(usuario || '').trim();
    if (!u || u === VALIDADOR_SIN_ASIGNAR) return '';
    if (esValidadorContable(u)) return u;
    var uNorm = normalizarNombreValidador(u);
    for (var i = 0; i < VALIDADORES_ASIGNABLES.length; i++) {
      var v = VALIDADORES_ASIGNABLES[i];
      if (normalizarNombreValidador(v) === uNorm) return v;
    }
    return '';
  }

  function validadorAsignadoContable(nombre) {
    var asignado = String(nombre || '').trim();
    if (!asignado || asignado === VALIDADOR_SIN_ASIGNAR) return '';
    if (VALIDADORES_ASIGNABLES.indexOf(asignado) < 0) return '';
    return asignado;
  }

  function validadorAsignadoEnPedido(p) {
    return validadorAsignadoContable(p && p.validadorAsignado ? p.validadorAsignado : '');
  }

  function parseValidadorNotaPreparador(nota) {
    var m = String(nota || '').match(/→\s*validador\s+(.+?)\.?\s*$/i);
    if (m) return validadorAsignadoContable(m[1].trim());
    return '';
  }

  function parseValidadorNotaAsignacion(nota) {
    var n = String(nota || '');
    var m = n.match(/reasignado:\s*.+?\s→\s*(.+)$/i);
    if (m) return validadorAsignadoContable(m[1].trim());
    m = n.match(/asignado:\s*(.+)$/i);
    if (m) return validadorAsignadoContable(m[1].trim());
    return '';
  }

  /** Solo transiciones reales del flujo validador (no asignaciones ni re-asignaciones). */
  function esTransicionContableValidador(h) {
    if (!h || !h.hacia) return false;
    var nota = String(h.nota || '');
    if (/validador reasignado|validador asignado:/i.test(nota)) return false;
    if (h.hacia === 'en_validacion') {
      return h.desde === 'pendiente_carga' || h.desde == null;
    }
    if (h.hacia === 'listo_despacho') {
      return h.desde === 'en_validacion' || h.desde === 'pendiente_carga' || h.desde == null;
    }
    return false;
  }

  function asignadoAlMomentoHistorial(p, targetH) {
    var asignado = '';
    var histAsc = (p.historial || []).slice().sort(function (a, b) {
      return String(a.at || '').localeCompare(String(b.at || ''));
    });
    var i;
    for (i = 0; i < histAsc.length; i++) {
      var h = histAsc[i];
      if (h === targetH) break;
      if (h.at === targetH.at && h.hacia === targetH.hacia && h.desde === targetH.desde &&
          h.usuario === targetH.usuario) break;
      var snap = validadorAsignadoContable(h.validadorAsignado);
      if (snap) {
        asignado = snap;
        continue;
      }
      if (h.panel === 'validador' && !h.hacia) {
        var fromAsign = parseValidadorNotaAsignacion(h.nota);
        if (fromAsign) asignado = fromAsign;
        continue;
      }
      if (h.panel === 'preparador') {
        var fromPrep = parseValidadorNotaPreparador(h.nota);
        if (fromPrep) asignado = fromPrep;
      }
    }
    return asignado;
  }

  /** Fallback seguro: validador del pedido, salvo reasignación posterior a la transición. */
  function validadorAsignadoEnMomentoFallback(p, h) {
    if (!esTransicionContableValidador(h)) return '';
    var enMomento = asignadoAlMomentoHistorial(p, h);
    if (enMomento) return enMomento;
    var assignadoActual = validadorAsignadoEnPedido(p);
    if (!assignadoActual) return '';
    var histAsc = (p.historial || []).slice().sort(function (a, b) {
      return String(a.at || '').localeCompare(String(b.at || ''));
    });
    var targetAt = String(h.at || '');
    var i;
    for (i = 0; i < histAsc.length; i++) {
      var e = histAsc[i];
      if (e === h) continue;
      if (String(e.at || '') <= targetAt) continue;
      if (e.panel !== 'validador' || e.hacia) continue;
      var m = String(e.nota || '').match(/reasignado:\s*(.+?)\s→/i);
      if (m) {
        var prev = validadorAsignadoContable(m[1].trim());
        if (prev) return prev;
      }
    }
    return assignadoActual;
  }

  /**
   * Acredita quien actuó (usuario) o el validador asignado en el momento del cambio.
   */
  function validadorCreditoHistorial(p, h) {
    var fromUser = resolverValidadorEnHistorial(h && h.usuario ? h.usuario : '');
    if (fromUser) return fromUser;
    var snap = validadorAsignadoContable(h && h.validadorAsignado ? h.validadorAsignado : '');
    if (snap) return snap;
    var enMomento = asignadoAlMomentoHistorial(p, h);
    if (enMomento) return enMomento;
    return validadorAsignadoEnMomentoFallback(p, h);
  }

  /** Quién debe figurar en el resumen por el estado actual (quien registró el cambio). */
  function validadorCreditoPorEstado(pedido, estadoObjetivo) {
    if (!pedido || pedido.estado !== estadoObjetivo) return '';
    var cicloDesde = inicioCicloValidador(pedido);
    var hist = pedido.historial || [];
    var i;
    for (i = hist.length - 1; i >= 0; i--) {
      var h = hist[i];
      if (!h || !h.at || (cicloDesde && h.at < cicloDesde)) continue;
      if (h.hacia !== estadoObjetivo) continue;
      var quien = validadorCreditoHistorial(pedido, h);
      if (quien) return quien;
    }
    return validadorAsignadoEnPedido(pedido);
  }

  /** Crédito de carga por validador en un IDC ya marcado cargado (camiones registrados). */
  function creditosCargadoPorPedido(pedido) {
    if (!pedido || pedido.estado !== 'listo_despacho') return [];
    var expl = cargasEquipoExplicitas(pedido);
    if (expl.length) {
      return expl.map(function (c) {
        return { validador: c.validador, unidades: c.camiones || 0 };
      }).filter(function (x) { return x.unidades > 0; });
    }
    var quien = validadorCreditoPorEstado(pedido, 'listo_despacho') || validadorAsignadoEnPedido(pedido);
    if (!quien) return [];
    return [{ validador: quien, unidades: 1 }];
  }

  /** Totales visibles en el panel del validador (activos, no retirados). */
  function countResumenValidador(pedidos) {
    var activos = getPedidosVisiblesValidador(pedidos);
    var counts = { total: activos.length, totalCamiones: 0, cargadoUnidades: 0 };
    VALIDADOR_ESTADOS.forEach(function (id) {
      counts[id] = activos.filter(function (p) { return p.estado === id; }).length;
    });
    activos.forEach(function (p) {
      if (p.estado !== 'listo_despacho') return;
      creditosCargadoPorPedido(p).forEach(function (c) {
        counts.cargadoUnidades += c.unidades || 0;
        counts.totalCamiones += c.unidades || 0;
      });
    });
    return counts;
  }

  /** Resumen por validador: IDC validados/cargados + camiones registrados por persona. */
  function resumenPorValidador(pedidos) {
    var activos = getPedidosVisiblesValidador(pedidos);
    var byName = {};
    function ensureRow(name) {
      if (!byName[name]) {
        byName[name] = { nombre: name, validado: 0, cargado: 0, camiones: 0, ultimaValidacion: null };
      }
      return byName[name];
    }
    activos.forEach(function (p) {
      var etapas = fechasEtapasValidador(p);
      if (p.estado === 'en_validacion') {
        var nameVal = validadorCreditoPorEstado(p, 'en_validacion');
        if (nameVal) {
          var rowVal = ensureRow(nameVal);
          rowVal.validado += 1;
          var tsVal = etapas.en_validacion;
          if (tsVal && (!rowVal.ultimaValidacion || tsVal > rowVal.ultimaValidacion)) {
            rowVal.ultimaValidacion = tsVal;
          }
        }
      } else if (p.estado === 'listo_despacho') {
        var creditos = creditosCargadoPorPedido(p);
        creditos.forEach(function (cred) {
          if (!cred || !cred.validador) return;
          var rowCar = ensureRow(cred.validador);
          rowCar.cargado += cred.unidades || 0;
          var tsCar = etapas.listo_despacho;
          if (tsCar && (!rowCar.ultimaValidacion || tsCar > rowCar.ultimaValidacion)) {
            rowCar.ultimaValidacion = tsCar;
          }
        });
      }
    });
    var list = Object.keys(byName).map(function (n) { return byName[n]; });
    list.sort(function (a, b) {
      var ta = (a.validado || 0) + (a.cargado || 0);
      var tb = (b.validado || 0) + (b.cargado || 0);
      if (tb !== ta) return tb - ta;
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    var totValidado = 0;
    var totCargado = 0;
    list.forEach(function (r) {
      totValidado += r.validado;
      totCargado += r.cargado;
    });
    return { filas: list, totalValidado: totValidado, totalCargado: totCargado, totalCamiones: totCargado };
  }

  function getPedidosActivos(pedidos) {
    return (pedidos || []).slice().sort(function (a, b) {
      var ja = String(a.jaula || '').localeCompare(String(b.jaula || ''), 'es', { numeric: true });
      if (ja !== 0) return ja;
      return String(a.idc || '').localeCompare(String(b.idc || ''), 'es', { numeric: true });
    });
  }

  function bindSync(callback) {
    if (!callback) return function () {};
    function onCustom(ev) {
      callback(ev.detail && ev.detail.data ? ev.detail.data : load());
    }
    function onStorage(ev) {
      if (ev.key === STORAGE_KEY) callback(load());
    }
    function onLiveShare() {
      callback(load());
    }
    function onLan(ev) {
      if (ev.detail && ev.detail.store === 'despacho') callback(load());
    }
    global.addEventListener('despacho-updated', onCustom);
    global.addEventListener('despacho-live-share', onLiveShare);
    global.addEventListener('despacho-live-lista', onLiveShare);
    global.addEventListener('storage', onStorage);
    global.addEventListener('lan-sync', onLan);
    return function () {
      global.removeEventListener('despacho-updated', onCustom);
      global.removeEventListener('despacho-live-share', onLiveShare);
      global.removeEventListener('despacho-live-lista', onLiveShare);
      global.removeEventListener('storage', onStorage);
      global.removeEventListener('lan-sync', onLan);
    };
  }

  function wipeAll() {
    var empty = emptyPayload();
    save(empty);
    if (broadcast) {
      try { broadcast.postMessage({ type: 'despacho-wipe', at: Date.now() }); } catch (e) { /* noop */ }
    }
    if (broadcastLista) {
      try { broadcastLista.postMessage({ type: 'despacho-wipe', at: Date.now() }); } catch (e) { /* noop */ }
    }
    try {
      global.dispatchEvent(new CustomEvent('despacho-web-wiped'));
    } catch (e) { /* noop */ }
    return empty;
  }

  /** Inicio del ciclo actual en seguimiento validador (último ingreso a pendiente). */
  function inicioCicloValidador(pedido) {
    if (!pedido) return null;
    var hist = pedido.historial || [];
    var i;
    for (i = 0; i < hist.length; i++) {
      if (hist[i].at && hist[i].hacia === 'pendiente_carga') return hist[i].at;
    }
    return pedido.createdAt || null;
  }

  /** Fecha/hora en que el pedido entró al estado actual (momento exacto de la acción). */
  function fechaCambioEstado(pedido) {
    if (!pedido) return null;
    var estado = pedido.estado;
    var etapas = fechasEtapasValidador(pedido);
    if (estado === 'pendiente_carga') return etapas.pendiente_carga;
    if (estado === 'en_validacion') return etapas.en_validacion;
    if (estado === 'listo_despacho') return etapas.listo_despacho;
    var hist = pedido.historial || [];
    var i;
    for (i = 0; i < hist.length; i++) {
      if (hist[i].hacia === estado && hist[i].at) return hist[i].at;
    }
    return null;
  }

  /** Fechas de registro, validado y cargado — timestamp del historial al momento de cada acción. */
  function fechasEtapasValidador(pedido) {
    var out = {
      pendiente_carga: null,
      en_validacion: null,
      listo_despacho: null
    };
    if (!pedido) return out;
    var hist = pedido.historial || [];
    var cicloDesde = inicioCicloValidador(pedido);
    out.pendiente_carga = cicloDesde;
    if (!cicloDesde) return out;

    var i;
    var h;
    for (i = 0; i < hist.length; i++) {
      h = hist[i];
      if (!h || !h.at || h.at < cicloDesde) continue;
      if (h.hacia === 'en_validacion' && esTransicionContableValidador(h) && !out.en_validacion) {
        out.en_validacion = h.at;
      }
      if (h.hacia === 'listo_despacho' && esTransicionContableValidador(h) && !out.listo_despacho) {
        out.listo_despacho = h.at;
      }
    }

    if (pedido.estado === 'pendiente_carga') {
      out.en_validacion = null;
      out.listo_despacho = null;
    } else if (pedido.estado === 'en_validacion') {
      out.listo_despacho = null;
    }

    if (pedido.estado === 'en_validacion' && !out.en_validacion) {
      for (i = hist.length - 1; i >= 0; i--) {
        h = hist[i];
        if (h && h.at && h.at >= cicloDesde && h.hacia === 'en_validacion') {
          out.en_validacion = h.at;
          break;
        }
      }
      if (!out.en_validacion) out.en_validacion = pedido.updatedAt || null;
    }
    if (pedido.estado === 'listo_despacho') {
      if (!out.en_validacion) {
        for (i = hist.length - 1; i >= 0; i--) {
          h = hist[i];
          if (h && h.at && h.at >= cicloDesde && h.hacia === 'en_validacion') {
            out.en_validacion = h.at;
            break;
          }
        }
      }
      if (!out.listo_despacho) {
        for (i = hist.length - 1; i >= 0; i--) {
          h = hist[i];
          if (h && h.at && h.at >= cicloDesde && h.hacia === 'listo_despacho') {
            out.listo_despacho = h.at;
            break;
          }
        }
        if (!out.listo_despacho) out.listo_despacho = pedido.updatedAt || null;
      }
      if (!out.en_validacion && out.listo_despacho) {
        out.en_validacion = out.listo_despacho;
      }
    }
    return out;
  }

  global.PlatformDespachoStore = {
    STORAGE_KEY: STORAGE_KEY,
    ESTADOS: ESTADOS,
    PREPARADOR_ESTADOS: PREPARADOR_ESTADOS,
    VALIDADOR_ESTADOS: VALIDADOR_ESTADOS,
    VALIDADORES_ASIGNABLES: VALIDADORES_ASIGNABLES,
    VALIDADOR_SIN_ASIGNAR: VALIDADOR_SIN_ASIGNAR,
    FLUJO: FLUJO,
    load: load,
    save: save,
    registrarPedido: registrarPedido,
    enviarASeguimientoValidador: enviarASeguimientoValidador,
    cambiarEstado: cambiarEstado,
    asignarValidador: asignarValidador,
    actualizarCantidadCamiones: actualizarCantidadCamiones,
    actualizarCamionesValidador: actualizarCamionesValidador,
    agregarValidadorTrabajo: agregarValidadorTrabajo,
    quitarValidadorTrabajo: quitarValidadorTrabajo,
    formatValidadoresTrabajo: formatValidadoresTrabajo,
    formatCargasEquipoResumen: formatCargasEquipoResumen,
    normalizeCargasEquipo: normalizeCargasEquipo,
    totalCamionesEquipo: totalCamionesEquipo,
    normalizeCantidadCamiones: normalizeCantidadCamiones,
    resolverValidadorUsuario: resolverValidadorUsuario,
    archivarDeVistaValidador: archivarDeVistaValidador,
    getPedidosSeguimientoPreparador: getPedidosSeguimientoPreparador,
    getPedidosVisiblesValidador: getPedidosVisiblesValidador,
    getPedidosArchivadosValidador: getPedidosArchivadosValidador,
    getRegistroEnviadosValidador: getRegistroEnviadosValidador,
    countKpiOperador: countKpiOperador,
    countResumenValidador: countResumenValidador,
    resumenPorValidador: resumenPorValidador,
    filterPedidos: filterPedidos,
    countByEstado: countByEstado,
    formatEstado: formatEstado,
    renderEstadoIconSvg: renderEstadoIconSvg,
    formatHistorialEntry: formatHistorialEntry,
    formatIdc: formatIdc,
    getLiveShare: getLiveShare,
    isLiveShareActive: isLiveShareActive,
    startLiveShare: startLiveShare,
    stopLiveShare: stopLiveShare,
    syncLiveShare: syncLiveShare,
    publishLiveShare: publishLiveShare,
    toggleLiveShare: toggleLiveShare,
    getLiveShareLista: getLiveShareLista,
    isLiveShareListaActive: isLiveShareListaActive,
    startLiveShareLista: startLiveShareLista,
    stopLiveShareLista: stopLiveShareLista,
    toggleLiveShareLista: toggleLiveShareLista,
    isListaShareByUser: isListaShareByUser,
    listaSharePermisos: listaSharePermisos,
    getPedidosActivos: getPedidosActivos,
    bindSync: bindSync,
    wipeAll: wipeAll,
    JORNADA_INICIO_HORA: JORNADA_INICIO_HORA,
    TZ_DESPACHO: TZ_DESPACHO,
    formatFechaDespacho: formatFechaDespacho,
    claveJornadaLaboral: claveJornadaLaboral,
    jornadaLaboralActualClave: jornadaLaboralActualClave,
    inicioCicloValidador: inicioCicloValidador,
    fechaCambioEstado: fechaCambioEstado,
    fechasEtapasValidador: fechasEtapasValidador
  };
})(typeof window !== 'undefined' ? window : this);
