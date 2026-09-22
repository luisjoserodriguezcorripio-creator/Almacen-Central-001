/**
 * Módulo Operaciones — Control de almacén (filas transaccionales)
 * Columnas detectadas: fecha/hora, tarea, usuario, tipo, estado, ubicación, cantidad, etc.
 */
(function (global) {
  'use strict';

  var COLUMN_ALIASES = {
    /** Solo "Fecha y hora de creación" — nunca modificación */
    fechaCreacion: [
      'fecha y hora de creacion',
      'fecha y hora de creación',
      'fecha creacion',
      'fecha de creacion',
      'fecha creación',
      'fecha de creación',
      'created at',
      'created'
    ],
    fechaHora: ['fecha y hora de creacion', 'fecha y hora de creación', 'fecha y hora', 'fecha hora', 'fecha/hora', 'datetime', 'timestamp', 'fecha creacion', 'fecha de creacion', 'fecha creación', 'created at', 'created'],
    fechaModificacion: ['fecha y hora de modificacion', 'fecha y hora de modificación', 'fecha y hora modificacion', 'fecha y hora modificación', 'fecha modificacion', 'fecha modificación', 'fecha/hora modificacion', 'fecha/hora modificación', 'fecha de modificacion', 'fecha de modificación', 'hora de modificacion', 'hora de modificación', 'ultima fecha modificacion', 'última fecha modificación', 'modified', 'modified at', 'last modified', 'ultima modificacion', 'última modificación'],
    tareaId: ['numero de tarea', 'número de tarea', 'id tarea', 'id. de trabajo', 'id de trabajo', 'id trabajo', 'tarea', 'no tarea', 'nro tarea'],
    usuario: ['usuario', 'id. de usuario', 'id de usuario', 'user', 'operador', 'nombre usuario'],
    tipoTrabajo: ['tipo de trabajo', 'tipo trabajo', 'tipo', 'tipo de orden', 'tipo orden', 'tipo de orden de trabajo', 'tipo orden trabajo', 'tipo de orden trabajo', 'clase de orden', 'clase orden', 'orden de trabajo', 'tipo ot', 'actividad', 'operacion'],
    estado: ['estado', 'estado de trabajo', 'status', 'situacion'],
    ubicacion: ['ubicacion', 'ubicación', 'location', 'bin', 'localizacion', 'localización', 'sitio', 'almacen', 'almacén'],
    cantidad: ['cantidad', 'qty', 'quantity', 'unidades', 'piezas'],
    codigo: ['codigo', 'código', 'code', 'sku', 'articulo', 'artículo', 'producto'],
    nivel: ['nivel', 'pasillo', 'rack', 'estante', 'zona', 'nivel / pasillo', 'nivel/pasillo']
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var n = Number(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** YYYY-MM-DD en hora local — sin toISOString (evita corrimiento por timezone). */
  function localDateIso(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** Convierte serial Excel (ej. 46175.8688773148) a Date JS. */
  function excelDateToJSDate(excelDate) {
    var n = typeof excelDate === 'number' ? excelDate : parseFloat(String(excelDate || '').trim());
    if (!isFinite(n) || n <= 0) return null;
    return new Date((n - 25569) * 86400 * 1000);
  }

  /** Extrae YYYY-MM-DD desde serial Excel (UTC, como en Excel → JS estándar). */
  function excelSerialToDateKey(val) {
    if (val === null || val === undefined || val === '') return '';
    var n;
    if (typeof val === 'number' && isFinite(val)) {
      n = val;
    } else {
      var s = String(val).trim();
      if (!/^\d{4,6}(\.\d+)?$/.test(s)) return '';
      n = parseFloat(s);
    }
    if (!isFinite(n) || n < 25569 || n > 600000) return '';
    var d = excelDateToJSDate(n);
    if (!d || isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  }

  function parseExcelSerialDateTime(v) {
    var key = excelSerialToDateKey(v);
    if (!key) return null;
    var d = excelDateToJSDate(typeof v === 'number' ? v : parseFloat(String(v).trim()));
    if (!d || isNaN(d.getTime())) return { fecha: key, fechaHora: key };
    return {
      fecha: key,
      fechaHora: key + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    };
  }

  function normalizeDayIso(raw) {
    if (!raw && raw !== 0) return '';
    var serialKey = excelSerialToDateKey(raw);
    if (serialKey) return serialKey;
    var s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return m[1] + '-' + pad2(parseInt(m[2], 10)) + '-' + pad2(parseInt(m[3], 10));
    }
    var parsed = parseDateTime(s).fecha;
    return parsed || '';
  }

  function isValidBusinessDayIso(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var y = parseInt(iso.slice(0, 4), 10);
    return y >= 2020 && y <= 2035;
  }

  function parseDateTime(v, orderHint) {
    if (!v && v !== 0) return { fecha: null, fechaHora: '' };
    if (v instanceof Date && !isNaN(v)) {
      var fLocal = localDateIso(v);
      return { fecha: fLocal, fechaHora: fLocal + ' ' + pad2(v.getHours()) + ':' + pad2(v.getMinutes()) };
    }
    var fromSerial = parseExcelSerialDateTime(v);
    if (fromSerial) return fromSerial;
    if (typeof v === 'number' && isFinite(v)) {
      var serialRetry = parseExcelSerialDateTime(v);
      if (serialRetry) return serialRetry;
    }
    var s = String(v).trim();
    var fecha = null;
    var ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
    if (ymd) {
      var y0 = parseInt(ymd[1], 10);
      var a = parseInt(ymd[2], 10);
      var b = parseInt(ymd[3], 10);
      var mo0 = a;
      var day0 = b;
      var secondRaw = ymd[2];
      var thirdRaw = ymd[3];
      var looksLikeIso = secondRaw.length === 2 && thirdRaw.length === 2 && a <= 12;
      if (orderHint === 'ymd') {
        mo0 = a;
        day0 = b;
      } else if (orderHint === 'ydm') {
        day0 = a;
        mo0 = b;
      } else if ((a > 12 && b <= 12) || (!looksLikeIso && b <= 12)) {
        day0 = a;
        mo0 = b;
      }
      if (mo0 >= 1 && mo0 <= 12 && day0 >= 1 && day0 <= 31) {
        fecha = y0 + '-' + pad2(mo0) + '-' + pad2(day0);
        return { fecha: fecha, fechaHora: ymd[4] ? fecha + ' ' + ymd[4] : fecha };
      }
    }
    var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
    if (m) {
      var day = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      var y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
        fecha = y + '-' + pad2(mo) + '-' + pad2(day);
        return { fecha: fecha, fechaHora: m[4] ? fecha + ' ' + m[4] : fecha };
      }
    }
    return { fecha: null, fechaHora: s };
  }

  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
  }

  function resolveSheet(wb) {
    if (wb.Sheets['BD']) return 'BD';
    if (wb.Sheets['Datos']) return 'Datos';
    if (wb.Sheets['Sheet1']) return 'Sheet1';
    return wb.SheetNames[0];
  }

  function isModificationHeaderNorm(n) {
    return n.indexOf('modificacion') >= 0 || n.indexOf('modific') >= 0 || n.indexOf('modified') >= 0;
  }

  function findCreationColumnIndex(idx) {
    var preferred = COLUMN_ALIASES.fechaCreacion;
    var k;
    for (k = 0; k < preferred.length; k++) {
      if (idx[preferred[k]] !== undefined) return idx[preferred[k]];
    }
    var cols = Object.keys(idx);
    for (k = 0; k < cols.length; k++) {
      var cn = cols[k];
      if (isModificationHeaderNorm(cn)) continue;
      if (cn.indexOf('creacion') >= 0 || cn.indexOf('created') >= 0) return idx[cn];
    }
    return -1;
  }

  function mapHeaders(headers) {
    var idx = {};
    var labels = {};
    headers.forEach(function (h, i) {
      var n = norm(h);
      if (n) idx[n] = i;
    });

    function findCol(keys, opts) {
      opts = opts || {};
      var k;
      for (k = 0; k < keys.length; k++) {
        if (idx[keys[k]] !== undefined) return idx[keys[k]];
      }
      var cols = Object.keys(idx);
      for (k = 0; k < keys.length; k++) {
        for (var c = 0; c < cols.length; c++) {
          if (opts.excludeModification && isModificationHeaderNorm(cols[c])) continue;
          if (cols[c].indexOf(keys[k]) >= 0 || keys[k].indexOf(cols[c]) >= 0) return idx[cols[c]];
        }
      }
      return -1;
    }

    var map = {};
    var creationCol = findCreationColumnIndex(idx);
    if (creationCol >= 0) {
      map.fechaCreacion = creationCol;
      labels.fechaCreacion = headers[creationCol];
      map.fechaHora = creationCol;
      labels.fechaHora = headers[creationCol];
    }

    Object.keys(COLUMN_ALIASES).forEach(function (field) {
      if (field === 'fechaCreacion') return;
      if (field === 'fechaHora' && map.fechaHora >= 0) return;
      var col = findCol(COLUMN_ALIASES[field], {
        excludeModification: field === 'fechaHora' || field === 'fechaCreacion'
      });
      if (col >= 0) {
        map[field] = col;
        labels[field] = headers[col];
      }
    });

    var mappedCols = {};
    Object.keys(map).forEach(function (f) { mappedCols[map[f]] = true; });

    var extra = [];
    headers.forEach(function (h, i) {
      if (!mappedCols[i] && String(h || '').trim()) {
        extra.push({ key: 'extra_' + i, label: String(h).trim(), index: i });
      }
    });

    return { map: map, labels: labels, extra: extra, headers: headers };
  }

  function detectControlFormat(rows) {
    if (!rows || rows.length < 2) return false;
    var headerRow = -1;
    var r;
    for (r = 0; r < Math.min(rows.length, 20); r++) {
      var mapped = mapHeaders((rows[r] || []).map(function (h) { return String(h || '').trim(); }));
      var score = 0;
      if (mapped.map.fechaHora >= 0 || mapped.map.tareaId >= 0) score++;
      if (mapped.map.usuario >= 0) score++;
      if (mapped.map.estado >= 0) score++;
      if (mapped.map.ubicacion >= 0 || mapped.map.cantidad >= 0) score++;
      if (mapped.map.tipoTrabajo >= 0) score++;
      if (score >= 3) {
        headerRow = r;
        break;
      }
    }
    return headerRow >= 0;
  }

  function detectControlWorkbook(wb) {
    var sheet = resolveSheet(wb);
    return detectControlFormat(sheetRows(wb, sheet));
  }

  function colVal(row, colIdx) {
    if (colIdx === undefined || colIdx < 0) return '';
    return row[colIdx];
  }

  function inferYearFirstDateOrder(rows, colIdx, startRow) {
    if (colIdx === undefined || colIdx < 0) return '';
    var ydm = 0;
    var ymd = 0;
    var ambiguous = 0;
    for (var i = startRow || 0; i < Math.min(rows.length, (startRow || 0) + 80); i++) {
      var raw = String(colVal(rows[i] || [], colIdx) || '').trim();
      var m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (!m) continue;
      var a = parseInt(m[2], 10);
      var b = parseInt(m[3], 10);
      if (a > 12 && b <= 12) ydm++;
      else if (b > 12 && a <= 12) ymd++;
      else ambiguous++;
    }
    if (ydm > ymd) return 'ydm';
    if (ymd > ydm) return 'ymd';
    return '';
  }

  function dateRangeSummary(registros) {
    var dates = uniqueSorted((registros || []).map(recordOperationalDateIso).filter(Boolean));
    if (!dates.length) return '';
    var first = dates[0];
    var last = dates[dates.length - 1];
    return first === last ? first : first + ' → ' + last;
  }

  function buildAggregates(registros) {
    var porFecha = {};
    var porUsuario = {};
    var porEstado = {};
    var porUbicacion = {};

    registros.forEach(function (rec) {
      /* Para el histograma por fecha usamos la fecha de CREACIÓN (fechaHora/fecha),
         no la de modificación, para ver el avance real por día */
      var f = recordDateIso(rec) || 'Sin fecha';
      if (!porFecha[f]) porFecha[f] = { fecha: f, count: 0, cantidad: 0 };
      porFecha[f].count++;
      porFecha[f].cantidad += rec.cantidad || 0;

      var u = rec.usuario || 'Sin usuario';
      if (!porUsuario[u]) porUsuario[u] = { usuario: u, count: 0, cantidad: 0 };
      porUsuario[u].count++;
      porUsuario[u].cantidad += rec.cantidad || 0;

      var e = rec.estado || 'Sin estado';
      porEstado[e] = (porEstado[e] || 0) + 1;

      var ub = rec.ubicacion || 'Sin ubicación';
      if (!porUbicacion[ub]) porUbicacion[ub] = { ubicacion: ub, cantidad: 0, count: 0 };
      porUbicacion[ub].cantidad += rec.cantidad || 0;
      porUbicacion[ub].count++;
    });

    var fechaKeys = global.PlatformUtils
      ? global.PlatformUtils.sortDateKeysAsc(Object.keys(porFecha))
      : Object.keys(porFecha).sort();
    return {
      porFecha: fechaKeys.map(function (k) { return porFecha[k]; }),
      porUsuario: Object.keys(porUsuario).map(function (k) { return porUsuario[k]; })
        .sort(function (a, b) { return b.count - a.count; }),
      porEstado: Object.keys(porEstado).map(function (estado) {
        return { estado: estado, count: porEstado[estado] };
      }).sort(function (a, b) { return b.count - a.count; }),
      porUbicacion: Object.keys(porUbicacion).map(function (k) { return porUbicacion[k]; })
        .sort(function (a, b) { return b.cantidad - a.cantidad; })
    };
  }

  function uniqueSorted(arr) {
    var o = {};
    arr.forEach(function (v) { if (v) o[v] = true; });
    return Object.keys(o).sort();
  }

  function isEstadoAbierto(estado) {
    var e = norm(estado);
    if (!e) return false;
    return e === 'abrir' || e === 'abierto' || e.indexOf('open') >= 0 || e.indexOf('pendiente') >= 0;
  }

  function getDiaAnteriorISO(refDate) {
    var ref = refDate instanceof Date ? refDate : new Date();
    var d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function getDiaAnteriorDesdeDatos(registros) {
    var latest = findLatestDateIso(registros);
    if (!latest) return getDiaAnteriorISO();
    var parts = latest.split('-');
    if (parts.length !== 3) return getDiaAnteriorISO();
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(d)) return getDiaAnteriorISO();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function recordDateIso(rec) {
    return recordCreationDateIso(rec);
  }

  function classifyEstadoOps(estado) {
    var e = norm(estado);
    if (!e) return 'other';
    if (e === 'abrir' || e === 'abierto' || e.indexOf('open') >= 0 || e.indexOf('pendiente') >= 0) return 'abierto';
    if (e.indexOf('proceso') >= 0 || e.indexOf('process') >= 0 || e.indexOf('curso') >= 0) return 'proceso';
    if (e.indexOf('cerrad') >= 0 || e.indexOf('closed') >= 0 || e.indexOf('complet') >= 0 ||
        e.indexOf('finaliz') >= 0 || e.indexOf('termin') >= 0) return 'cerrado';
    return 'other';
  }

  /** Fecha de creación — EXCLUSIVAMENTE columna "Fecha y hora de creación" (fechaCreacionRaw). */
  function recordCreationDateIso(rec) {
    if (!rec) return '';
    var raw = rec.fechaCreacionRaw;
    if (raw !== undefined && raw !== null && raw !== '') {
      var fromSerial = excelSerialToDateKey(raw);
      if (fromSerial) return fromSerial;
      var fromParsed = parseDateTime(raw).fecha;
      if (fromParsed) return normalizeDayIso(fromParsed);
    }
    if (rec.fechaCreacionIso && /^\d{4}-\d{2}-\d{2}$/.test(rec.fechaCreacionIso)) {
      return rec.fechaCreacionIso;
    }
    return '';
  }

  /** Calcula delta día a día (altos/bajos) sobre la serie completa. */
  function applyAltosBajosToSeries(rows) {
    (rows || []).forEach(function (row, idx) {
      var prev = idx > 0 ? rows[idx - 1] : null;
      var cur = row.abiertos || 0;
      var prevVal = prev ? (prev.abiertos || 0) : null;
      row._deltaOpen = prevVal == null ? 0 : cur - prevVal;
      row._alto = row._deltaOpen > 0;
      row._bajo = row._deltaOpen < 0;
    });
    return rows;
  }

  /**
   * Serie para gráfico: rango completo min→max con un punto por día (ceros si no hay datos).
   * maxDays: límite opcional; 0 o null = sin recorte.
   */
  function chartSeriesFromPorFecha(porFecha, maxDays) {
    var rows = fillDailyRangeFromPorFecha(porFecha, maxDays);
    return applyAltosBajosToSeries(rows);
  }

  /**
   * Transforma registros Excel → serie diaria para el gráfico (NO acumulada).
   * Agrupa por dateKey (YYYY-MM-DD) usando fecha de creación convertida desde serial Excel.
   */
  function transformOpsDailyChartData(registros, opts) {
    opts = opts || {};
    var maxDays = opts.maxDays || 0;
    var classify = opts.classifyEstado || classifyEstadoOps;
    registros = registros || [];

    console.group('[Ops Chart] transformOpsDailyChartData');
    console.log('Total registros leídos:', registros.length);

    var sampleConversions = registros.slice(0, 8).map(function (r) {
      return {
        columna: r.fechaCreacionColumn || 'Fecha y hora de creación',
        raw: r.fechaCreacionRaw,
        dateKey: recordCreationDateIso(r),
        estado: r.estado
      };
    });
    console.log('Primeras fechas convertidas (raw → dateKey):', sampleConversions);

    var porFecha = buildPorFechaCreacion(registros, { classifyEstado: classify });
    var groupedPreview = {};
    porFecha.forEach(function (row) {
      groupedPreview[row.fecha] = { abiertos: row.abiertos, enProceso: row.enProceso };
    });
    console.log('Resultado agrupado (porFecha):', groupedPreview);
    if (porFecha._skippedSinFecha) {
      console.warn('Registros omitidos por fecha inválida:', porFecha._skippedSinFecha);
    }

    var series = chartSeriesFromPorFecha(porFecha, maxDays);
    var altosBajos = series.map(function (r) {
      return {
        fecha: r.fecha,
        abiertos: r.abiertos,
        delta: r._deltaOpen,
        tipo: r._alto ? 'alto' : r._bajo ? 'bajo' : 'plano'
      };
    });
    console.log('Altos y bajos (delta abiertos vs día anterior):', altosBajos);
    var daysWithData = series.filter(function (r) {
      return (r.abiertos || 0) + (r.enProceso || 0) > 0;
    });
    var zeroDays = series.length - daysWithData.length;
    var zeroPct = series.length ? zeroDays / series.length : 1;

    console.log('Serie final para chart (' + series.length + ' días en rango, ' + daysWithData.length + ' con actividad):',
      'desde ' + (series[0] && series[0].fecha) + ' hasta ' + (series[series.length - 1] && series[series.length - 1].fecha));
    console.log('Muestra (días con actividad):',
      series.filter(function (r) { return (r.abiertos || 0) + (r.enProceso || 0) > 0; }).slice(0, 15));
    console.groupEnd();

    if (registros.length > 0 && daysWithData.length <= 1) {
      console.warn('ERROR: Datos mal procesados (fechas incorrectas o agrupación fallida)');
      console.warn('Detalle: ' + registros.length + ' registros, ' + daysWithData.length + ' días con datos');
    }
    var sinColumnaCreacion = registros.filter(function (r) {
      return r.fechaCreacionRaw === undefined || r.fechaCreacionRaw === null || r.fechaCreacionRaw === '';
    }).length;
    if (sinColumnaCreacion > 0) {
      console.warn('[Ops Chart] ' + sinColumnaCreacion + ' registro(s) sin «Fecha y hora de creación». Vuelva a importar el Excel.');
    }

    return {
      series: series,
      porFecha: porFecha,
      altosBajos: altosBajos,
      stats: {
        totalRegistros: registros.length,
        diasSerie: series.length,
        diasConDatos: daysWithData.length,
        omitidosSinFecha: porFecha._skippedSinFecha || 0,
        zeroPct: zeroPct
      }
    };
  }
  function buildPorFechaCreacion(registros, opts) {
    opts = opts || {};
    var classify = opts.classifyEstado || classifyEstadoOps;
    var byDate = {};
    var skipped = 0;

    (registros || []).forEach(function (rec) {
      var fecha = recordCreationDateIso(rec);
      if (!fecha || !isValidBusinessDayIso(fecha)) {
        skipped += 1;
        return;
      }
      var cls = classify(rec.estado);
      var qty = rec.cantidad > 0 ? rec.cantidad : 1;
      if (!byDate[fecha]) {
        byDate[fecha] = { fecha: fecha, abiertos: 0, enProceso: 0, cerrados: 0, totalTrabajar: 0, total: 0 };
      }
      if (cls === 'abierto') byDate[fecha].abiertos += qty;
      else if (cls === 'proceso') byDate[fecha].enProceso += qty;
      else if (cls === 'cerrado') byDate[fecha].cerrados += qty;
      byDate[fecha].total += qty;
      byDate[fecha].totalTrabajar = byDate[fecha].abiertos + byDate[fecha].enProceso;
    });

    var fechaKeys = global.PlatformUtils
      ? global.PlatformUtils.sortDateKeysAsc(Object.keys(byDate))
      : Object.keys(byDate).sort();
    var rows = fechaKeys.map(function (k) { return byDate[k]; });
    rows._skippedSinFecha = skipped;
    return rows;
  }

  /** Rellena TODOS los días calendario entre la fecha mínima y máxima del dataset. */
  function fillDailyRangeFromPorFecha(porFechaRows, maxDays) {
    if (!porFechaRows || !porFechaRows.length) return [];

    var byIso = {};
    porFechaRows.forEach(function (x) {
      var iso = normalizeDayIso(x.fecha);
      if (!iso || !isValidBusinessDayIso(iso)) return;
      if (!byIso[iso]) {
        byIso[iso] = { fecha: iso, abiertos: 0, enProceso: 0, cerrados: 0, totalTrabajar: 0, total: 0 };
      }
      byIso[iso].abiertos += x.abiertos || 0;
      byIso[iso].enProceso += x.enProceso || 0;
      byIso[iso].cerrados += x.cerrados || 0;
      byIso[iso].total += x.total || 0;
      byIso[iso].totalTrabajar = byIso[iso].abiertos + byIso[iso].enProceso;
    });

    var keys = Object.keys(byIso).sort();
    if (!keys.length) return [];

    function isoToLocalDate(iso) {
      var p = iso.split('-');
      return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    }

    var start = isoToLocalDate(keys[0]);
    var end = isoToLocalDate(keys[keys.length - 1]);
    var out = [];
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    var endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (d <= endD) {
      var iso = localDateIso(d);
      out.push(byIso[iso] || { fecha: iso, abiertos: 0, enProceso: 0, cerrados: 0, totalTrabajar: 0, total: 0 });
      d.setDate(d.getDate() + 1);
    }

    if (maxDays && maxDays > 0 && out.length > maxDays) {
      out = out.slice(out.length - maxDays);
    }
    return out;
  }

  function debugOpsChartAggregation(registros, porFecha, series) {
    try {
      console.group('[Ops Chart] Validación agrupación diaria');
      console.log('Total registros leídos:', (registros || []).length);
      console.log('Primeras 10 fechas de creación procesadas:', (registros || []).slice(0, 10).map(function (r) {
        return {
          fechaCreacion: recordCreationDateIso(r),
          estado: r.estado,
          tareaId: r.tareaId
        };
      }));
      console.log('Agrupación porFecha (' + (porFecha || []).length + ' días):', (porFecha || []).slice(0, 15));
      var withData = (series || []).filter(function (r) {
        return (r.abiertos || 0) + (r.enProceso || 0) > 0;
      });
      console.log('Serie gráfico:', (series || []).length, 'días |', withData.length, 'con abiertos/proceso > 0');
      console.log('Primeros días con datos en serie:', withData.slice(0, 10));
      if ((registros || []).length > 0 && withData.length <= Math.max(1, Math.floor((series || []).length * 0.2))) {
        console.warn('ERROR: Datos mal procesados (fechas incorrectas o agrupación fallida)');
      }
      console.groupEnd();
    } catch (e) {
      console.warn('[Ops Chart] debug error', e);
    }
  }

  function recordOperationalDateIso(rec) {
    if (!rec) return '';
    if (rec.fechaModificacion) {
      var fm = parseDateTime(rec.fechaModificacion).fecha;
      if (fm) return fm;
    }
    if (rec.extra) {
      var keys = Object.keys(rec.extra);
      for (var i = 0; i < keys.length; i++) {
        var k = norm(keys[i]);
        var isModDate = k.indexOf('modificacion') >= 0 ||
          k.indexOf('modified') >= 0 ||
          k.indexOf('ultima modificacion') >= 0 ||
          k.indexOf('last modified') >= 0;
        if (isModDate && rec.extra[keys[i]]) {
          var exDate = parseDateTime(rec.extra[keys[i]]).fecha;
          if (exDate) return exDate;
        }
      }
    }
    return recordDateIso(rec);
  }

  function formatFechaHoraDisplay(fechaHora) {
    if (!fechaHora) return '—';
    var s = String(fechaHora).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      var p = s.slice(0, 10).split('-');
      var hora = s.length > 10 ? s.slice(11, 16) : '';
      return p[2] + '/' + p[1] + '/' + p[0] + (hora ? ' ' + hora : '');
    }
    return s;
  }

  function filterRegistrosPorFecha(registros, diaIso) {
    if (!diaIso) return registros || [];
    return (registros || []).filter(function (r) {
      return recordOperationalDateIso(r) === diaIso;
    });
  }

  function filterRegistrosDesdeFecha(registros, diaIso) {
    if (!diaIso) return registros || [];
    return (registros || []).filter(function (r) {
      var d = recordOperationalDateIso(r);
      return d && d >= diaIso;
    });
  }

  function listAbiertos(registros) {
    return (registros || []).filter(function (r) {
      return isEstadoAbierto(r.estado);
    }).sort(function (a, b) {
      var u = (a.usuario || '').localeCompare(b.usuario || '');
      if (u !== 0) return u;
      return (a.fechaHora || '').localeCompare(b.fechaHora || '');
    });
  }

  function shouldMedirDiaAnterior(filters) {
    return false;
  }

  function findLatestDateIso(registros) {
    var best = '';
    (registros || []).forEach(function (r) {
      var d = recordOperationalDateIso(r);
      if (d && d > best) best = d;
    });
    return best || null;
  }

  function prepareResumenPorDiaAnterior(data, filters) {
    if (!data || !isControlData(data)) {
      return {
        data: data,
        useDiaAnterior: false,
        diaIso: null,
        diaLabel: '',
        abiertosRows: [],
        usedFallbackDay: false
      };
    }
    var regs = data.registros || [];
    var useDia = false;
    var diaIso = useDia ? getDiaAnteriorDesdeDatos(regs) : null;
    var abiertosRows = [];
    var scopedRows = regs;
    var usedFallbackDay = false;

    if (useDia && diaIso) {
      scopedRows = filterRegistrosDesdeFecha(regs, diaIso);
      abiertosRows = listAbiertos(scopedRows);
    } else if (filters && (filters.fechaDesde || filters.fechaHasta)) {
      scopedRows = regs.filter(function (r) {
        var d = recordOperationalDateIso(r);
        if (filters.fechaDesde && d < filters.fechaDesde) return false;
        if (filters.fechaHasta && d > filters.fechaHasta) return false;
        return true;
      });
      abiertosRows = listAbiertos(scopedRows);
    } else {
      abiertosRows = listAbiertos(regs);
    }

    var diaLabel = '';
    if (diaIso) {
      var parts = diaIso.split('-');
      diaLabel = parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    var scopedData = useDia || (filters && (filters.fechaDesde || filters.fechaHasta))
      ? Object.assign({}, data, {
        registros: scopedRows,
        aggregates: buildAggregates(scopedRows),
        meta: Object.assign({}, data.meta || {}, {
          totalRegistros: scopedRows.length,
          totalCantidad: scopedRows.reduce(function (s, x) { return s + (x.cantidad || 0); }, 0)
        })
      })
      : data;
    return {
      data: scopedData,
      useDiaAnterior: useDia,
      diaIso: diaIso,
      diaLabel: diaLabel,
      abiertosRows: abiertosRows,
      filters: filters || {},
      usedFallbackDay: usedFallbackDay
    };
  }

  function importWorkbook(wb, fileName) {
    var sheet = resolveSheet(wb);
    var rows = sheetRows(wb, sheet);
    if (!detectControlFormat(rows)) {
      throw new Error('Formato de control no reconocido. Verifique cabeceras: fecha, usuario, estado, ubicación, etc.');
    }

    var headerIdx = 0;
    var r;
    for (r = 0; r < Math.min(rows.length, 20); r++) {
      var trial = mapHeaders((rows[r] || []).map(function (h) { return String(h || '').trim(); }));
      var score = 0;
      if (trial.map.usuario >= 0) score++;
      if (trial.map.estado >= 0) score++;
      if (trial.map.fechaCreacion >= 0 || trial.map.fechaHora >= 0 || trial.map.tareaId >= 0) score++;
      if (trial.map.ubicacion >= 0 || trial.map.cantidad >= 0) score++;
      if (score >= 3) {
        headerIdx = r;
        break;
      }
    }

    var headers = (rows[headerIdx] || []).map(function (h) { return String(h || '').trim(); });
    var mapped = mapHeaders(headers);
    var m = mapped.map;
    var creationColIdx = m.fechaCreacion >= 0 ? m.fechaCreacion : m.fechaHora;
    var creationColLabel = mapped.labels.fechaCreacion || mapped.labels.fechaHora || 'Fecha y hora de creación';
    var fechaOrder = inferYearFirstDateOrder(rows, creationColIdx, headerIdx + 1);
    var fechaModOrder = inferYearFirstDateOrder(rows, m.fechaModificacion, headerIdx + 1);
    var registros = [];

    for (r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (!row.some(function (c) { return c !== '' && c !== null; })) continue;

      var rawFechaCreacion = colVal(row, creationColIdx);
      var dt = parseDateTime(rawFechaCreacion, fechaOrder);
      var dtMod = parseDateTime(colVal(row, m.fechaModificacion), fechaModOrder);
      var fechaCreacionKey = excelSerialToDateKey(rawFechaCreacion) ||
        (dt.fecha ? normalizeDayIso(dt.fecha) : '');
      var rec = {
        fechaCreacionRaw: rawFechaCreacion,
        fechaCreacionColumn: creationColLabel,
        fechaCreacionIso: fechaCreacionKey,
        fecha: fechaCreacionKey || dt.fecha,
        fechaHora: dt.fechaHora || fechaCreacionKey || '',
        fechaModificacion: dtMod.fechaHora || dtMod.fecha || '',
        tareaId: String(colVal(row, m.tareaId) || '').trim(),
        usuario: String(colVal(row, m.usuario) || '').trim(),
        tipoTrabajo: String(colVal(row, m.tipoTrabajo) || '').trim(),
        estado: String(colVal(row, m.estado) || '').trim(),
        ubicacion: String(colVal(row, m.ubicacion) || '').trim(),
        cantidad: toNumber(colVal(row, m.cantidad)),
        codigo: String(colVal(row, m.codigo) || '').trim(),
        nivel: String(colVal(row, m.nivel) || '').trim(),
        extra: {}
      };

      mapped.extra.forEach(function (ex) {
        rec.extra[ex.label] = colVal(row, ex.index);
      });

      if (!rec.fechaCreacionIso) rec.fechaCreacionIso = recordCreationDateIso(rec);

      if (!rec.tareaId && !rec.usuario && !rec.estado && rec.cantidad === 0) continue;
      registros.push(rec);
    }

    registros.sort(function (a, b) {
      var c = (a.fecha || '').localeCompare(b.fecha || '');
      if (c !== 0) return c;
      return (a.fechaHora || '').localeCompare(b.fechaHora || '');
    });

    var aggregates = buildAggregates(registros);
    var stdCols = [
      { key: 'fechaHora', label: 'Fecha y hora' },
      { key: 'fechaModificacion', label: 'Fecha y hora de modificación' },
      { key: 'tareaId', label: 'ID tarea' },
      { key: 'usuario', label: 'Usuario' },
      { key: 'tipoTrabajo', label: 'Tipo trabajo' },
      { key: 'estado', label: 'Estado' },
      { key: 'ubicacion', label: 'Ubicación' },
      { key: 'cantidad', label: 'Cantidad' },
      { key: 'codigo', label: 'Código' },
      { key: 'nivel', label: 'Nivel / pasillo' }
    ];
    var tableColumns = stdCols.filter(function (c) { return m[c.key] !== undefined; }).map(function (c) {
      return { key: c.key, label: mapped.labels[c.key] || c.label };
    });

    mapped.extra.forEach(function (ex) {
      tableColumns.push({ key: 'extra:' + ex.label, label: ex.label, isExtra: true });
    });

    return {
      module: 'operaciones',
      format: 'control',
      fileName: fileName || 'Excel operaciones',
      importedAt: new Date().toISOString(),
      sourceSheet: sheet,
      columnMap: mapped.map,
      columnLabels: mapped.labels,
      tableColumns: tableColumns,
      registros: registros,
      aggregates: aggregates,
      meta: {
        totalRegistros: registros.length,
        usuarios: uniqueSorted(registros.map(function (x) { return x.usuario; })),
        estados: uniqueSorted(registros.map(function (x) { return x.estado; })),
        ubicaciones: uniqueSorted(registros.map(function (x) { return x.ubicacion; })),
        tiposTrabajo: uniqueSorted(registros.map(function (x) { return x.tipoTrabajo; })),
        totalCantidad: registros.reduce(function (s, x) { return s + (x.cantidad || 0); }, 0)
      }
    };
  }

  function filterData(data, filters) {
    if (!data || !data.registros) return data;
    filters = filters || {};
    var registros = data.registros.filter(function (rec) {
      if (filters.usuario && rec.usuario !== filters.usuario) return false;
      if (filters.estado && rec.estado !== filters.estado) return false;
      if (filters.ubicacion && rec.ubicacion !== filters.ubicacion) return false;
      if (filters.tipoTrabajo && rec.tipoTrabajo !== filters.tipoTrabajo) return false;
      var d = recordOperationalDateIso(rec);
      if (filters.fechaDesde && d && d < filters.fechaDesde) return false;
      if (filters.fechaHasta && d && d > filters.fechaHasta) return false;
      return true;
    });

    var filtered = Object.assign({}, data, {
      registros: registros,
      aggregates: buildAggregates(registros),
      meta: Object.assign({}, data.meta, {
        totalRegistros: registros.length,
        totalCantidad: registros.reduce(function (s, x) { return s + (x.cantidad || 0); }, 0)
      })
    });
    return filtered;
  }

  function buildKpis(data) {
    if (!data) {
      return { totalRegistros: 0, totalCantidad: 0, usuariosActivos: 0, estadosDistintos: 0 };
    }
    var regs = data.registros || [];
    var meta = data.meta || {};
    return {
      totalRegistros: regs.length,
      totalCantidad: meta.totalCantidad != null ? meta.totalCantidad : regs.reduce(function (s, r) { return s + (r.cantidad || 0); }, 0),
      usuariosActivos: uniqueSorted(regs.map(function (r) { return r.usuario; })).length,
      estadosDistintos: uniqueSorted(regs.map(function (r) { return r.estado; })).length,
      topUsuario: (data.aggregates && data.aggregates.porUsuario[0]) ? data.aggregates.porUsuario[0].usuario : '—'
    };
  }

  function isControlData(data) {
    return data && data.format === 'control' && Array.isArray(data.registros);
  }

  global.PlatformExcelOperaciones = {
    COLUMN_ALIASES: COLUMN_ALIASES,
    isEstadoAbierto: isEstadoAbierto,
    getDiaAnteriorISO: getDiaAnteriorISO,
    getDiaAnteriorDesdeDatos: getDiaAnteriorDesdeDatos,
    recordDateIso: recordDateIso,
    excelDateToJSDate: excelDateToJSDate,
    excelSerialToDateKey: excelSerialToDateKey,
    transformOpsDailyChartData: transformOpsDailyChartData,
    chartSeriesFromPorFecha: chartSeriesFromPorFecha,
    applyAltosBajosToSeries: applyAltosBajosToSeries,
    recordCreationDateIso: recordCreationDateIso,
    buildPorFechaCreacion: buildPorFechaCreacion,
    fillDailyRangeFromPorFecha: fillDailyRangeFromPorFecha,
    debugOpsChartAggregation: debugOpsChartAggregation,
    classifyEstadoOps: classifyEstadoOps,
    normalizeDayIso: normalizeDayIso,
    recordOperationalDateIso: recordOperationalDateIso,
    formatFechaHoraDisplay: formatFechaHoraDisplay,
    shouldMedirDiaAnterior: shouldMedirDiaAnterior,
    prepareResumenPorDiaAnterior: prepareResumenPorDiaAnterior,
    listAbiertos: listAbiertos,
    norm: norm,
    detectControlFormat: detectControlFormat,
    detectControlWorkbook: detectControlWorkbook,
    importWorkbook: importWorkbook,
    filterData: filterData,
    buildKpis: buildKpis,
    buildAggregates: buildAggregates,
    isControlData: isControlData
  };
})(typeof window !== 'undefined' ? window : this);
