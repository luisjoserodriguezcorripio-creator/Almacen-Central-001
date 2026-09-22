/**
 * Importación Excel — Procedimientos De Almacén y Trabajo_Almacen (Sheet1/BD)
 */
(function (global) {
  'use strict';

  var TIPO_AREA_DEFAULT = {
    'ordenes de compra': 'Recepción',
    'recibo de transferencia': 'Recepción',
    'ordenes de venta': 'Despacho',
    'reabastecimiento': 'Despacho',
    'movimiento de inventario': 'Control',
    'emision de transferencia': 'Transferencia',
    'recuento ciclico': 'Control',
    'ordenes de devolucion': 'Notas De Crédito'
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

  function parseDateCell(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      var d = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      var y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      function pad2(n) { return n < 10 ? '0' + n : String(n); }
      return y + '-' + pad2(mo) + '-' + pad2(d);
    }
    return null;
  }

  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  }

  function resolveDataSheet(wb) {
    if (wb.Sheets['BD']) return 'BD';
    if (wb.Sheets['Sheet1']) return 'Sheet1';
    return wb.SheetNames[0];
  }

  function parseTD(rows) {
    var map = {};
    rows.forEach(function (row, idx) {
      if (idx === 0) return;
      var tipo = String(row[0] || '').trim();
      var area = String(row[1] || '').trim();
      if (tipo && area) map[norm(tipo)] = area;
    });
    return map;
  }

  function parseBDTD(rows) {
    var out = {
      abiertosPorTipo: [],
      enProcesoPorTipo: [],
      totales: { abiertos: 0, enProceso: 0, totalTrabajar: 0 },
      porFecha: []
    };
    if (!rows.length) return out;

    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i] || [];
      var c0 = norm(r[0]);
      if (c0 === 'tipo de orden de trabajo' && norm(r[1]) === 'area') {
        for (var j = i + 1; j < rows.length; j++) {
          var row = rows[j] || [];
          var tipo = String(row[0] || '').trim();
          var area = String(row[1] || '').trim();
          var total = toNumber(row[2]);
          if (!tipo || norm(tipo) === 'total general') {
            if (norm(tipo) === 'total general') out.totales.abiertos = total || out.totales.abiertos;
            break;
          }
          if (total > 0) out.abiertosPorTipo.push({ tipo: tipo, area: area, total: total });
        }
      }
      if (norm(r[4]) === 'tipo de orden de trabajo' && norm(r[5]) === 'area') {
        for (var k = i + 1; k < rows.length; k++) {
          var row2 = rows[k] || [];
          var tipo2 = String(row2[4] || '').trim();
          var area2 = String(row2[5] || '').trim();
          var total2 = toNumber(row2[6]);
          if (!tipo2 || norm(tipo2) === 'total general') {
            if (norm(tipo2) === 'total general') out.totales.enProceso = total2 || out.totales.enProceso;
            break;
          }
          if (total2 > 0) out.enProcesoPorTipo.push({ tipo: tipo2, area: area2, total: total2 });
        }
      }
      if (c0 === 'fecha' && norm(r[1]) === 'abierto') {
        for (var f = i + 1; f < rows.length; f++) {
          var rf = rows[f] || [];
          var fecha = parseDateCell(rf[0]);
          if (!fecha) continue;
          var abierto = toNumber(rf[1]);
          var enProc = toNumber(rf[2]);
          var totalT = toNumber(rf[3]);
          if (abierto + enProc + totalT === 0) continue;
          out.porFecha.push({
            fecha: fecha,
            abiertos: abierto,
            enProceso: enProc,
            totalTrabajar: totalT || abierto + enProc
          });
        }
        break;
      }
    }

    if (!out.totales.abiertos) {
      out.totales.abiertos = out.abiertosPorTipo.reduce(function (s, x) { return s + x.total; }, 0);
    }
    if (!out.totales.enProceso) {
      out.totales.enProceso = out.enProcesoPorTipo.reduce(function (s, x) { return s + x.total; }, 0);
    }
    out.totales.totalTrabajar = out.totales.abiertos + out.totales.enProceso;
    return out;
  }

  function buildPorFechaFromRegistros(registros) {
    var byDate = {};
    registros.forEach(function (rec) {
      if (!rec.fecha) return;
      if (!byDate[rec.fecha]) {
        byDate[rec.fecha] = { fecha: rec.fecha, abiertos: 0, enProceso: 0, totalTrabajar: 0 };
      }
      var est = norm(rec.estado);
      if (est === 'abrir' || est === 'abierto') byDate[rec.fecha].abiertos++;
      else if (est.indexOf('proceso') >= 0) byDate[rec.fecha].enProceso++;
      byDate[rec.fecha].totalTrabajar++;
    });
    return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  }

  function buildBDTDFromBD(bd) {
    var abiertosMap = {};
    var procesoMap = {};
    var porAreaAbiertos = {};
    var porAreaProceso = {};

    bd.registros.forEach(function (rec) {
      var tipo = rec.tipo || 'Sin tipo';
      var area = rec.area || 'Sin área';
      var est = norm(rec.estado);

      if (est === 'abrir' || est === 'abierto') {
        if (!abiertosMap[tipo]) abiertosMap[tipo] = { tipo: tipo, area: area, total: 0 };
        abiertosMap[tipo].total++;
        porAreaAbiertos[area] = (porAreaAbiertos[area] || 0) + 1;
      }
      if (est.indexOf('proceso') >= 0) {
        if (!procesoMap[tipo]) procesoMap[tipo] = { tipo: tipo, area: area, total: 0 };
        procesoMap[tipo].total++;
        porAreaProceso[area] = (porAreaProceso[area] || 0) + 1;
      }
    });

    var abiertos = Object.keys(abiertosMap).map(function (k) { return abiertosMap[k]; });
    var enProceso = Object.keys(procesoMap).map(function (k) { return procesoMap[k]; });
    var totalAb = bd.resumen.porEstado['Abrir'] || bd.resumen.porEstado['Abierto'] ||
      abiertos.reduce(function (s, x) { return s + x.total; }, 0);
    var totalProc = bd.resumen.porEstado['En proceso'] || bd.resumen.porEstado['En Proceso'] ||
      enProceso.reduce(function (s, x) { return s + x.total; }, 0);

    return {
      abiertosPorTipo: abiertos.sort(function (a, b) { return b.total - a.total; }),
      enProcesoPorTipo: enProceso.sort(function (a, b) { return b.total - a.total; }),
      totales: {
        abiertos: totalAb,
        enProceso: totalProc,
        totalTrabajar: totalAb + totalProc
      },
      porFecha: buildPorFechaFromRegistros(bd.registros),
      porAreaAbiertos: porAreaAbiertos,
      porAreaProceso: porAreaProceso
    };
  }

  function parseBD(rows, areaMap) {
    if (!rows.length) return { registros: [], resumen: {} };
    var headers = (rows[0] || []).map(function (h) { return String(h || '').trim(); });
    var idx = {};
    headers.forEach(function (h, i) { idx[norm(h)] = i; });

    function col(row, keys) {
      var n;
      for (n = 0; n < keys.length; n++) {
        if (idx[keys[n]] !== undefined) return row[idx[keys[n]]];
      }
      return '';
    }

    var registros = [];
    var porEstado = {};
    var porTipo = {};
    var porArea = {};
    var porFecha = {};

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (!row.some(function (c) { return c !== '' && c !== null; })) continue;

      var tipo = String(col(row, ['tipo de orden de trabajo']) || '').trim();
      var estado = String(col(row, ['estado de trabajo']) || '').trim();
      var fecha = parseDateCell(col(row, ['fecha y hora de creacion', 'fecha', 'fecha de creacion']));
      var area = areaMap[norm(tipo)] || TIPO_AREA_DEFAULT[norm(tipo)] || 'General';
      var almacen = String(col(row, ['almacen', 'almacén']) || '').trim();

      var item = {
        fecha: fecha,
        estado: estado,
        tipo: tipo,
        area: area,
        almacen: almacen,
        sitio: String(col(row, ['sitio']) || '').trim(),
        trabajo: String(col(row, ['id. de trabajo', 'id de trabajo']) || '').trim(),
        usuario: String(col(row, ['id. de usuario', 'id de usuario']) || '').trim(),
        modificadoPor: String(col(row, ['modificado por']) || '').trim()
      };
      registros.push(item);

      if (estado) porEstado[estado] = (porEstado[estado] || 0) + 1;
      if (tipo) porTipo[tipo] = (porTipo[tipo] || 0) + 1;
      if (area) porArea[area] = (porArea[area] || 0) + 1;
      if (fecha) porFecha[fecha] = (porFecha[fecha] || 0) + 1;
    }

    return {
      registros: registros,
      resumen: { porEstado: porEstado, porTipo: porTipo, porArea: porArea, porFecha: porFecha }
    };
  }

  function importWorkbook(wb, fileName) {
    var sheet = resolveDataSheet(wb);
    var td = parseTD(sheetRows(wb, 'TD'));
    var areaMap = {};
    Object.keys(TIPO_AREA_DEFAULT).forEach(function (k) { areaMap[k] = TIPO_AREA_DEFAULT[k]; });
    Object.keys(td).forEach(function (k) { areaMap[k] = td[k]; });

    var bd = parseBD(sheetRows(wb, sheet), areaMap);
    var bDTD = parseBDTD(sheetRows(wb, 'BDTD'));
    if (!bDTD.totales.totalTrabajar && bd.registros.length) {
      bDTD = buildBDTDFromBD(bd);
    }

    var areas = {};
    var tipos = {};
    bd.registros.forEach(function (rec) {
      if (rec.area) areas[rec.area] = true;
      if (rec.tipo) tipos[rec.tipo] = true;
    });

    return {
      module: 'operaciones',
      fileName: fileName || 'Excel almacén',
      importedAt: new Date().toISOString(),
      sourceSheet: sheet,
      td: td,
      bDTD: bDTD,
      bd: bd,
      meta: {
        areas: Object.keys(areas).sort(),
        tipos: Object.keys(tipos).sort(),
        estados: Object.keys(bd.resumen.porEstado).sort(),
        totalRegistros: bd.registros.length
      }
    };
  }

  function filterData(data, filters) {
    if (!data || !data.bd) return data;
    filters = filters || {};
    var registros = data.bd.registros.filter(function (rec) {
      if (filters.estado && rec.estado !== filters.estado) return false;
      if (filters.area && rec.area !== filters.area) return false;
      if (filters.tipoOrden && rec.tipo !== filters.tipoOrden) return false;
      if (filters.fechaDesde && rec.fecha && rec.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && rec.fecha && rec.fecha > filters.fechaHasta) return false;
      return true;
    });

    var porEstado = {};
    var porTipo = {};
    var porArea = {};
    registros.forEach(function (rec) {
      if (rec.estado) porEstado[rec.estado] = (porEstado[rec.estado] || 0) + 1;
      if (rec.tipo) porTipo[rec.tipo] = (porTipo[rec.tipo] || 0) + 1;
      if (rec.area) porArea[rec.area] = (porArea[rec.area] || 0) + 1;
    });

    var filtered = Object.assign({}, data, {
      bd: {
        registros: registros,
        resumen: { porEstado: porEstado, porTipo: porTipo, porArea: porArea, porFecha: {} }
      }
    });
    filtered.bDTD = buildBDTDFromBD(filtered.bd);
    return filtered;
  }

  function buildKpis(data) {
    var b = data.bDTD.totales;
    var bd = data.bd.resumen;
    var abiertosBd = bd.porEstado['Abrir'] || bd.porEstado['Abierto'] || 0;
    var enProcesoBd = bd.porEstado['En proceso'] || bd.porEstado['En Proceso'] || 0;
    return {
      abiertos: b.abiertos || abiertosBd,
      enProceso: b.enProceso || enProcesoBd,
      totalTrabajar: b.totalTrabajar || abiertosBd + enProcesoBd,
      registrosFiltrados: data.bd.registros.length,
      tiposActivos: Object.keys(bd.porTipo).length
    };
  }

  function detectWorkbookType(wb) {
    if (global.PlatformExcelDetect && global.PlatformExcelDetect.detectWorkbookType) {
      return global.PlatformExcelDetect.detectWorkbookType(wb);
    }
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.detectControlWorkbook(wb)) {
      return 'operaciones';
    }
    return 'operaciones';
  }

  function importForModule(wb, fileName, moduleId) {
    if (moduleId === 'productividad') {
      if (!global.PlatformExcelProductivity) {
        throw new Error('Módulo de productividad no disponible.');
      }
      var prod = global.PlatformExcelProductivity.importWorkbook(wb, fileName);
      prod.module = 'productividad';
      return prod;
    }
    if (moduleId === 'facturas') {
      if (!global.PlatformExcelFacturas) {
        throw new Error('Módulo Facturas no disponible.');
      }
      var fac = global.PlatformExcelFacturas.importWorkbook(wb, fileName);
      fac.module = 'facturas';
      return fac;
    }
    if (moduleId === 'operaciones') {
      if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.detectControlWorkbook(wb)) {
        var control = global.PlatformExcelOperaciones.importWorkbook(wb, fileName);
        control.module = 'operaciones';
        return control;
      }
      var legacy = importWorkbook(wb, fileName);
      legacy.module = 'operaciones';
      legacy.format = legacy.format || 'legacy';
      return legacy;
    }
    return importWorkbookAuto(wb, fileName);
  }

  function importWorkbookAuto(wb, fileName) {
    var type = detectWorkbookType(wb);
    return importForModule(wb, fileName, type);
  }

  global.PlatformExcel = {
    importWorkbook: importWorkbook,
    importWorkbookAuto: importWorkbookAuto,
    importForModule: importForModule,
    detectWorkbookType: detectWorkbookType,
    filterData: filterData,
    buildKpis: buildKpis,
    buildBDTDFromBD: buildBDTDFromBD,
    norm: norm,
    TIPO_AREA_DEFAULT: TIPO_AREA_DEFAULT
  };
})(typeof window !== 'undefined' ? window : this);
