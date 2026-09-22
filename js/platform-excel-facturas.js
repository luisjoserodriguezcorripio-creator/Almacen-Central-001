/**
 * Módulo Facturas — Diario de facturas del cliente
 */
(function (global) {
  'use strict';

  var COLUMN_ALIASES = {
    almacen: ['almacen', 'almacén', 'warehouse'],
    ordenVenta: ['orden de venta', 'orden venta', 'sales order', 'ov'],
    factura: ['factura', 'invoice', 'no factura', 'n° factura'],
    monto: ['monto de la factura', 'monto factura', 'monto', 'importe', 'total'],
    divisa: ['divisa', 'moneda', 'currency', 'div'],
    fecha: ['fecha', 'date'],
    fechaCreacion: ['fecha y hora de creacion', 'fecha y hora de creación', 'fecha creacion'],
    cliente: ['nombre', 'cliente', 'cuenta de facturacion', 'cuenta de facturación'],
    zona: ['zona'],
    creadoPor: ['creado por']
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function parseAmount(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).replace(/\s/g, '').replace(/,/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function parseDivisa(v) {
    var d = norm(v).toUpperCase();
    if (d.indexOf('usd') >= 0 || d === 'us$' || d === '$') return 'USD';
    if (d.indexOf('dop') >= 0 || d === 'rd$' || d === 'peso') return 'DOP';
    return d || 'DOP';
  }

  function parseDateCell(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 30000 && v < 60000) {
      var epoch = new Date(Date.UTC(1899, 11, 30));
      var d = new Date(epoch.getTime() + v * 86400000);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      var day = parseInt(m[1], 10);
      var mo = parseInt(m[2], 10);
      var y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      function pad(n) { return n < 10 ? '0' + n : String(n); }
      return y + '-' + pad(mo) + '-' + pad(day);
    }
    return null;
  }

  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  }

  function mapHeaders(headers) {
    var idx = {};
    headers.forEach(function (h, i) {
      var n = norm(h);
      if (n) idx[n] = i;
    });
    function findCol(keys) {
      var k;
      for (k = 0; k < keys.length; k++) {
        if (idx[keys[k]] !== undefined) return idx[keys[k]];
        var key = keys[k];
        var match = Object.keys(idx).find(function (h) {
          return h === key || h.indexOf(key) >= 0;
        });
        if (match !== undefined) return idx[match];
      }
      return -1;
    }
    var map = {};
    Object.keys(COLUMN_ALIASES).forEach(function (field) {
      var col = findCol(COLUMN_ALIASES[field]);
      if (col >= 0) map[field] = col;
    });
    return { map: map, headers: headers };
  }

  function detectFacturasFormat(rows) {
    if (!rows || rows.length < 2) return false;
    var r;
    for (r = 0; r < Math.min(rows.length, 15); r++) {
      var m = mapHeaders((rows[r] || []).map(function (h) { return String(h || '').trim(); }));
      if (m.map.almacen !== undefined && m.map.ordenVenta !== undefined &&
          m.map.monto !== undefined && m.map.divisa !== undefined) {
        return true;
      }
    }
    return false;
  }

  function detectFacturasWorkbook(wb) {
    if (!wb || !wb.SheetNames) return false;
    var i;
    for (i = 0; i < wb.SheetNames.length; i++) {
      if (detectFacturasFormat(sheetRows(wb, wb.SheetNames[i]))) return true;
    }
    return false;
  }

  function findHeaderRow(rows) {
    var r;
    for (r = 0; r < Math.min(rows.length, 15); r++) {
      var headers = (rows[r] || []).map(function (h) { return String(h || '').trim(); });
      var m = mapHeaders(headers);
      if (m.map.almacen !== undefined && m.map.ordenVenta !== undefined && m.map.monto !== undefined) {
        return { index: r, mapped: m };
      }
    }
    return null;
  }

  function importWorkbook(wb, fileName) {
    var sheet = wb.SheetNames[0];
    var rows = sheetRows(wb, sheet);
    var headerInfo = findHeaderRow(rows);
    if (!headerInfo) {
      throw new Error('No se encontraron columnas de facturas (Almacén, Orden de venta, Monto, Divisa).');
    }

    var m = headerInfo.mapped.map;
    var registros = [];
    var seenFactura = {};
    var skippedDup = 0;
    var r;

    for (r = headerInfo.index + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (!row.some(function (c) { return String(c || '').trim(); })) continue;

      var factura = m.factura !== undefined ? String(row[m.factura] || '').trim() : '';
      var orden = m.ordenVenta !== undefined ? String(row[m.ordenVenta] || '').trim() : '';
      var almacen = m.almacen !== undefined ? String(row[m.almacen] || '').trim() : '';
      if (!almacen && !orden && !factura) continue;

      var facturaKey = norm(factura) || ('row_' + r);
      if (seenFactura[facturaKey]) {
        skippedDup++;
        continue;
      }
      seenFactura[facturaKey] = true;

      var monto = m.monto !== undefined ? parseAmount(row[m.monto]) : 0;
      var divisa = m.divisa !== undefined ? parseDivisa(row[m.divisa]) : 'DOP';
      var fecha = m.fecha !== undefined ? parseDateCell(row[m.fecha]) : null;
      if (!fecha && m.fechaCreacion !== undefined) {
        fecha = parseDateCell(row[m.fechaCreacion]);
      }

      registros.push({
        almacen: almacen || 'Sin almacén',
        ordenVenta: orden,
        factura: factura,
        monto: monto,
        divisa: divisa,
        fecha: fecha,
        cliente: m.cliente !== undefined ? String(row[m.cliente] || '').trim() : '',
        zona: m.zona !== undefined ? String(row[m.zona] || '').trim() : '',
        creadoPor: m.creadoPor !== undefined ? String(row[m.creadoPor] || '').trim() : ''
      });
    }

    if (!registros.length) {
      throw new Error('No hay filas válidas tras eliminar duplicados de factura.');
    }

    var aggregates = buildAggregates(registros);
    return {
      module: 'facturas',
      format: 'facturas',
      fileName: fileName || 'Diario de facturas',
      importedAt: new Date().toISOString(),
      sourceSheet: sheet,
      registros: registros,
      aggregates: aggregates,
      meta: {
        totalRegistros: registros.length,
        skippedDuplicates: skippedDup,
        almacenes: aggregates.porAlmacen.map(function (a) { return a.almacen; }),
        divisas: ['DOP', 'USD']
      }
    };
  }

  function buildAggregates(regs) {
    var porAlmacen = {};
    var ordenesGlobal = {};
    var totDop = 0;
    var totUsd = 0;

    regs.forEach(function (rec) {
      var alm = rec.almacen;
      if (!porAlmacen[alm]) {
        porAlmacen[alm] = {
          almacen: alm,
          ventasDop: 0,
          ventasUsd: 0,
          facturas: 0,
          ordenesSet: {}
        };
      }
      var bucket = porAlmacen[alm];
      bucket.facturas++;
      if (rec.divisa === 'USD') {
        bucket.ventasUsd += rec.monto;
        totUsd += rec.monto;
      } else {
        bucket.ventasDop += rec.monto;
        totDop += rec.monto;
      }
      if (rec.ordenVenta) {
        bucket.ordenesSet[rec.ordenVenta] = true;
        ordenesGlobal[rec.ordenVenta] = true;
      }
    });

    var porAlmacenList = Object.keys(porAlmacen).map(function (k) {
      var b = porAlmacen[k];
      return {
        almacen: b.almacen,
        ventasDop: b.ventasDop,
        ventasUsd: b.ventasUsd,
        facturas: b.facturas,
        ordenes: Object.keys(b.ordenesSet).length
      };
    }).sort(function (a, b) {
      return (b.ventasDop + b.ventasUsd) - (a.ventasDop + a.ventasUsd);
    });

    var totalVentas = totDop + totUsd;
    porAlmacenList.forEach(function (a) {
      a.participacionDop = totDop ? (a.ventasDop / totDop) * 100 : 0;
      a.participacionUsd = totUsd ? (a.ventasUsd / totUsd) * 100 : 0;
      a.participacionOrdenes = Object.keys(ordenesGlobal).length
        ? (a.ordenes / Object.keys(ordenesGlobal).length) * 100
        : 0;
    });

    return {
      porAlmacen: porAlmacenList,
      totales: {
        ventasDop: totDop,
        ventasUsd: totUsd,
        facturas: regs.length,
        ordenes: Object.keys(ordenesGlobal).length,
        almacenes: porAlmacenList.length
      }
    };
  }

  var DEFAULT_TIPO_CAMBIO = 58.5;

  function resolveTipoCambio(tipoCambio) {
    var n = parseFloat(tipoCambio);
    if (isFinite(n) && n > 0) return n;
    return DEFAULT_TIPO_CAMBIO;
  }

  function ventasEnPesos(row, tipoCambio) {
    if (!row) return 0;
    var tc = resolveTipoCambio(tipoCambio);
    return (row.ventasDop || 0) + (row.ventasUsd || 0) * tc;
  }

  function enrichAggregatesForDisplay(aggregates, tipoCambio) {
    if (!aggregates) {
      return { porAlmacen: [], totales: { ventasPesos: 0, ordenes: 0, facturas: 0, almacenes: 0, ventasUsdOriginal: 0, tipoCambio: resolveTipoCambio(tipoCambio) } };
    }
    var tc = resolveTipoCambio(tipoCambio);
    var por = (aggregates.porAlmacen || []).map(function (a) {
      var pesos = ventasEnPesos(a, tc);
      return {
        almacen: a.almacen,
        ventasPesos: pesos,
        ventasDopNativo: a.ventasDop || 0,
        ventasUsdOriginal: a.ventasUsd || 0,
        usdEnPesos: (a.ventasUsd || 0) * tc,
        facturas: a.facturas,
        ordenes: a.ordenes,
        participacionOrdenes: a.participacionOrdenes
      };
    }).sort(function (x, y) { return y.ventasPesos - x.ventasPesos; });

    var totPesos = 0;
    por.forEach(function (a) {
      totPesos += a.ventasPesos;
    });
    por.forEach(function (a) {
      a.participacionVentas = totPesos ? (a.ventasPesos / totPesos) * 100 : 0;
    });

    var t = aggregates.totales || {};
    return {
      porAlmacen: por,
      totales: {
        ventasPesos: totPesos,
        ventasDopNativo: t.ventasDop || 0,
        ventasUsdOriginal: t.ventasUsd || 0,
        usdEnPesos: (t.ventasUsd || 0) * tc,
        ordenes: t.ordenes || 0,
        facturas: t.facturas || 0,
        almacenes: t.almacenes || por.length,
        tipoCambio: tc
      }
    };
  }

  function buildKpis(data, tipoCambio) {
    if (!data || !data.aggregates) {
      return { ventasPesos: 0, ordenes: 0, facturas: 0, almacenes: 0, tipoCambio: resolveTipoCambio(tipoCambio), tieneUsd: false };
    }
    var view = enrichAggregatesForDisplay(data.aggregates, tipoCambio);
    var t = view.totales;
    return {
      ventasPesos: t.ventasPesos,
      ventasDopNativo: t.ventasDopNativo,
      ventasUsdOriginal: t.ventasUsdOriginal,
      usdEnPesos: t.usdEnPesos,
      ordenes: t.ordenes,
      facturas: t.facturas,
      almacenes: t.almacenes,
      tipoCambio: t.tipoCambio,
      tieneUsd: (t.ventasUsdOriginal || 0) > 0,
      skippedDuplicates: data.meta ? data.meta.skippedDuplicates : 0
    };
  }

  function filterData(data, filters) {
    if (!data || !data.registros) return data;
    filters = filters || {};
    var regs = data.registros.filter(function (rec) {
      if (filters.almacen && rec.almacen !== filters.almacen) return false;
      if (filters.divisa && rec.divisa !== filters.divisa) return false;
      if (filters.fechaDesde && rec.fecha && rec.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && rec.fecha && rec.fecha > filters.fechaHasta) return false;
      return true;
    });
    return Object.assign({}, data, {
      registros: regs,
      aggregates: buildAggregates(regs),
      meta: Object.assign({}, data.meta, { totalRegistros: regs.length })
    });
  }

  function buildMetasCompliance(porAlmacen, metas, tipoCambio) {
    metas = metas || {};
    var view = enrichAggregatesForDisplay({ porAlmacen: porAlmacen, totales: {} }, tipoCambio);
    var por = view.porAlmacen;
    return por.map(function (a) {
      var m = metas[a.almacen] || {};
      var metaVentas = (parseFloat(m.ventasMillones != null ? m.ventasMillones : m.ventasDopMillones) || 0) * 1000000;
      var metaOrdenes = parseInt(m.ordenes, 10) || 0;
      var pctVentas = metaVentas > 0 ? (a.ventasPesos / metaVentas) * 100 : null;
      var pctOrd = metaOrdenes > 0 ? (a.ordenes / metaOrdenes) * 100 : null;
      function semaforo(pct) {
        if (pct == null || !isFinite(pct)) return 'neutral';
        if (pct >= 100) return 'ok';
        if (pct >= 80) return 'warn';
        return 'danger';
      }
      var pctGeneral = pctVentas != null ? pctVentas : pctOrd;
      return {
        almacen: a.almacen,
        ventasPesos: a.ventasPesos,
        ordenes: a.ordenes,
        metaVentas: metaVentas,
        metaOrdenes: metaOrdenes,
        pctVentas: pctVentas,
        pctOrdenes: pctOrd,
        diffVentas: metaVentas > 0 ? a.ventasPesos - metaVentas : null,
        diffOrdenes: metaOrdenes > 0 ? a.ordenes - metaOrdenes : null,
        semaforoVentas: semaforo(pctVentas),
        semaforoOrdenes: semaforo(pctOrd),
        semaforoGeneral: semaforo(pctGeneral)
      };
    });
  }

  function formatMoney(n, divisa) {
    var v = Number(n) || 0;
    if (divisa === 'USD') {
      return 'US$' + v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return 'RD$' + v.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMillions(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(2) + ' M';
    if (v >= 1000) return (v / 1000).toFixed(1) + ' K';
    return v.toFixed(0);
  }

  function isFacturasData(data) {
    return data && data.format === 'facturas' && Array.isArray(data.registros);
  }

  global.PlatformExcelFacturas = {
    detectFacturasFormat: detectFacturasFormat,
    detectFacturasWorkbook: detectFacturasWorkbook,
    importWorkbook: importWorkbook,
    buildKpis: buildKpis,
    buildAggregates: buildAggregates,
    enrichAggregatesForDisplay: enrichAggregatesForDisplay,
    resolveTipoCambio: resolveTipoCambio,
    ventasEnPesos: ventasEnPesos,
    buildMetasCompliance: buildMetasCompliance,
    filterData: filterData,
    formatMoney: formatMoney,
    formatMillions: formatMillions,
    isFacturasData: isFacturasData,
    DEFAULT_TIPO_CAMBIO: DEFAULT_TIPO_CAMBIO
  };
})(typeof window !== 'undefined' ? window : this);
