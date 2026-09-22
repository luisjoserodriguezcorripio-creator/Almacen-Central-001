/**
 * Inventario RF — Conciliación · Exactitud (solo web, datos APK vía Supabase)
 * Compara inventario sistema (Excel CJ) vs conteos en vivo. No modifica la APK.
 */
(function (global) {
  'use strict';

  var CACHE_SISTEMA = 'inv_dc_sistema_rows_v1';
  var CACHE_META = 'inv_dc_sistema_meta_v1';

  function cellStr(v) {
    if (v == null) return '';
    return String(v).trim();
  }

  function normLoc(s) {
    return cellStr(s).toUpperCase().replace(/\s+/g, '');
  }

  function normCode(s) {
    var c = cellStr(s).replace(/\s+/g, '');
    if (/^N\d/i.test(c)) c = c.slice(1);
    return c.replace(/^0+(?=\d)/, function (m) { return m.length > 1 ? '' : m; });
  }

  function rowKey(loc, code, matricula) {
    return normLoc(loc) + '|' + normCode(code) + '|' + cellStr(matricula);
  }

  function normHeader(h) {
    return cellStr(h).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function isCjUnit(v) {
    var unit = cellStr(v).toUpperCase();
    if (!unit) return true;
    if (unit === 'CJ' || unit.indexOf('CJ') >= 0) return true;
    if (/^CAJA|^BOX|^CS|^CASE/.test(unit)) return true;
    if (unit === 'UND' || unit.indexOf('UNID') >= 0) return false;
    return true;
  }

  function isDynamicsDisponible(headerRow) {
    var parts = (headerRow || []).map(normHeader);
    var hasCode = parts.some(function (t) { return t.indexOf('codigo de articulo') >= 0; });
    var hasLoc = parts.some(function (t) { return t === 'ubicacion'; });
    var hasQty = parts.some(function (t) { return t === 'fisica disponible' || t === 'inventario fisico'; });
    return hasCode && hasLoc && hasQty;
  }

  function detectColumns(headerRow) {
    if (isDynamicsDisponible(headerRow)) {
      var dmap = {
        format: 'dynamics_disponible',
        barcode: -1, product: -1, warehouse: -1, loc: -1,
        matricula: -1, unit: -1, qty: -1, pack: -1
      };
      (headerRow || []).forEach(function (h, i) {
        var t = normHeader(h);
        if (t.indexOf('codigo de articulo') >= 0) dmap.barcode = i;
        else if (t === 'nombre del producto') dmap.product = i;
        else if (t === 'almacen') dmap.warehouse = i;
        else if (t === 'ubicacion') dmap.loc = i;
        else if (t.indexOf('matricula') >= 0 && dmap.matricula < 0) dmap.matricula = i;
        else if (t === 'unidad de inventario') dmap.unit = i;
        else if ((t === 'fisica disponible' || t === 'inventario fisico') && dmap.qty < 0) dmap.qty = i;
      });
      return dmap;
    }
    var map = { format: 'generic', loc: -1, barcode: -1, product: -1, matricula: -1, pack: -1, qty: -1, warehouse: -1, unit: -1 };
    (headerRow || []).forEach(function (h, i) {
      var t = cellStr(h).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (t && /ubic|location|ubicacion|posicion|bin|slot/.test(t)) map.loc = i;
      else if (t && /barr|codigo|cod|articulo|ean|sku|item|producto\s*id/.test(t) && map.barcode < 0) map.barcode = i;
      else if (t && /descrip|nombre|producto|desc/.test(t) && map.product < 0) map.product = i;
      else if (t && /matric|lote|batch|id\s*int/.test(t)) map.matricula = i;
      else if (t && /empaque|pack|cj|unidad|uom/.test(t)) map.pack = i;
      else if (t && /cant|qty|dispon|sistema|fisic|stock|invent|exist/.test(t) && map.qty < 0) map.qty = i;
    });
    if (map.loc < 0) map.loc = 0;
    if (map.barcode < 0) map.barcode = 1;
    if (map.product < 0) map.product = 2;
    if (map.matricula < 0) map.matricula = 3;
    if (map.pack < 0) map.pack = 4;
    if (map.qty < 0) map.qty = 5;
    return map;
  }

  function parseQty(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    var s = cellStr(v).replace(',', '.');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }

  function isWarehouseCentral(v) {
    var t = cellStr(v).toUpperCase();
    if (!t) return true;
    return t.indexOf('300') >= 0 || t.indexOf('CENTRAL') >= 0;
  }

  function rowFromArray(cols, arr, opts) {
    opts = opts || {};
    var strictWarehouse = opts.strictWarehouse !== false;
    if (!arr || !arr.length) return null;
    if (cols.format === 'dynamics_disponible') {
      var loc = cellStr(arr[cols.loc]);
      var barcode = cellStr(arr[cols.barcode]);
      if (!loc || !barcode) return null;
      if (strictWarehouse && cols.warehouse >= 0 && !isWarehouseCentral(arr[cols.warehouse])) return null;
      if (cols.unit >= 0 && !isCjUnit(arr[cols.unit])) return null;
      var qty = parseQty(cols.qty >= 0 ? arr[cols.qty] : 0);
      return {
        location: loc,
        barcode: barcode,
        product: cols.product >= 0 ? cellStr(arr[cols.product]) : '',
        matricula: cols.matricula >= 0 ? cellStr(arr[cols.matricula]) : '',
        pack: 'CJ',
        qtyCj: qty,
        warehouse: cols.warehouse >= 0 ? cellStr(arr[cols.warehouse]) : '300-001'
      };
    }
    var loc = cellStr(arr[cols.loc]);
    var barcode = cellStr(arr[cols.barcode]);
    if (!loc && !barcode) return null;
    if (!loc || !barcode) {
      if (/^P\d/i.test(barcode) && !loc) { loc = barcode; barcode = cellStr(arr[cols.barcode + 1]); }
    }
    if (!loc) return null;
    var pack = cellStr(arr[cols.pack]) || 'CJ';
    if (pack.indexOf('*') < 0 && /^\d+$/.test(pack)) pack = 'CJ * ' + pack;
    return {
      location: loc,
      barcode: barcode,
      product: cellStr(arr[cols.product]),
      matricula: cellStr(arr[cols.matricula]),
      pack: pack,
      qtyCj: parseQty(arr[cols.qty])
    };
  }

  function parseSheet(aoa, sheetName, fileName, opts) {
    opts = opts || {};
    if (!aoa.length) return { rows: [], score: 0, sheet: sheetName, format: 'generic', headerIdx: 0, headers: [] };
    var headerIdx = 0;
    for (var hi = 0; hi < Math.min(25, aoa.length); hi++) {
      if (isDynamicsDisponible(aoa[hi])) { headerIdx = hi; break; }
      var line = (aoa[hi] || []).join(' ').toLowerCase();
      if (/ubic|codigo|fisica disponible|location|articulo/.test(line)) { headerIdx = hi; break; }
    }
    var cols = detectColumns(aoa[headerIdx]);
    var rows = [];
    for (var r = headerIdx + 1; r < aoa.length; r++) {
      var row = rowFromArray(cols, aoa[r], opts);
      if (row && row.location) rows.push(row);
    }
    return {
      rows: rows,
      score: rows.length,
      sheet: sheetName,
      format: cols.format || 'generic',
      headerIdx: headerIdx,
      headers: (aoa[headerIdx] || []).map(cellStr).filter(Boolean)
    };
  }

  function parseWorkbook(wb, fileName) {
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
      return { rows: [], meta: { fileName: fileName || '', count: 0, error: 'Archivo vacío' } };
    }
    var best = { rows: [], score: 0, sheet: '', format: 'generic', headers: [] };
    wb.SheetNames.forEach(function (sn) {
      var ws = wb.Sheets[sn];
      if (!ws || !global.XLSX) return;
      var aoa = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      var parsed = parseSheet(aoa, sn, fileName, { strictWarehouse: true });
      if (parsed.score > best.score) best = parsed;
    });
    if (best.score === 0) {
      wb.SheetNames.forEach(function (sn) {
        var ws = wb.Sheets[sn];
        if (!ws || !global.XLSX) return;
        var aoa = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        var parsed = parseSheet(aoa, sn, fileName, { strictWarehouse: false });
        if (parsed.score > best.score) {
          parsed.format = (parsed.format === 'dynamics_disponible' ? 'dynamics_disponible_relajado' : parsed.format);
          best = parsed;
        }
      });
    }
    return {
      rows: best.rows,
      meta: {
        fileName: fileName || '',
        sheet: best.sheet || '',
        format: best.format || 'generic',
        formatLabel: best.format === 'dynamics_disponible'
          ? 'Inventario disponible (Dynamics · Física disponible CJ)'
          : (best.format === 'dynamics_disponible_relajado'
            ? 'Inventario disponible (Dynamics · todos almacenes CJ)'
            : 'Excel genérico'),
        importedAt: new Date().toISOString(),
        count: best.rows.length,
        headers: best.headers || []
      }
    };
  }

  function loadSistemaCache() {
    try {
      var raw = global.localStorage.getItem(CACHE_SISTEMA);
      var meta = global.localStorage.getItem(CACHE_META);
      return { rows: raw ? JSON.parse(raw) : [], meta: meta ? JSON.parse(meta) : {} };
    } catch (e) {
      return { rows: [], meta: {} };
    }
  }

  function saveSistemaCache(rows, meta) {
    try {
      global.localStorage.setItem(CACHE_SISTEMA, JSON.stringify(rows || []));
      global.localStorage.setItem(CACHE_META, JSON.stringify(meta || {}));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'No se pudo guardar' };
    }
  }

  function clearSistemaCache() {
    try {
      global.localStorage.removeItem(CACHE_SISTEMA);
      global.localStorage.removeItem(CACHE_META);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : 'No se pudo borrar' };
    }
  }

  /** Agrupa conteos APK/web — solo cajas (CJ), último registro por ubicación+código */
  function aggregateScans(entries) {
    var map = {};
    (entries || []).forEach(function (e) {
      var loc = e.zone || e.location || '';
      var code = e.barcode || '';
      if (!normLoc(loc)) return;
      var unit = String(e.unit || 'CJ').toUpperCase();
      if (unit === 'UND' || unit.indexOf('UNID') >= 0) return;
      var key = rowKey(loc, code, e.matricula || '');
      var qty = parseQty(e.quantity);
      var at = e.createdAt || e.created_at || '';
      if (!map[key] || String(at) > String(map[key].scannedAt)) {
        map[key] = {
          location: loc,
          barcode: code,
          product: e.productName || e.product_name || '',
          matricula: e.matricula || '',
          pack: unit.indexOf('CJ') >= 0 ? unit : 'CJ',
          qtyCj: qty,
          userId: e.userId || e.user_id || '',
          scannedAt: at
        };
      }
    });
    return map;
  }

  function scansToLiveRows(scanMap) {
    return Object.keys(scanMap || {}).map(function (k) { return scanMap[k]; })
      .sort(function (a, b) { return normLoc(a.location).localeCompare(normLoc(b.location)); });
  }

  function buildConciliation(sistemaRows, scanMap) {
    var rows = [];
    var seenKeys = {};
    var groupExpected = {};
    (sistemaRows || []).forEach(function (sr) {
      var key = rowKey(sr.location, sr.barcode, sr.matricula);
      seenKeys[key] = true;
      groupExpected[key] = (groupExpected[key] || 0) + parseQty(sr.qtyCj);
    });
    (sistemaRows || []).forEach(function (sr, lineIdx) {
      var key = rowKey(sr.location, sr.barcode, sr.matricula);
      var scan = scanMap[key];
      var expected = parseQty(sr.qtyCj);
      var counted = scan ? parseQty(scan.qtyCj) : null;
      var status = 'REVISAR';
      if (scan) {
        var groupOk = Math.abs(parseQty(scan.qtyCj) - parseQty(groupExpected[key])) < 0.001;
        var lineOk = Math.abs(counted - expected) < 0.001;
        if (groupOk || lineOk) status = 'Ok';
      }
      rows.push({
        lineId: lineIdx,
        location: sr.location,
        barcode: sr.barcode,
        product: sr.product || (scan && scan.product) || '',
        matricula: sr.matricula || (scan && scan.matricula) || '',
        pack: sr.pack || 'CJ',
        qtySistema: expected,
        qtyContada: counted,
        status: status,
        userId: scan ? scan.userId : '',
        scannedAt: scan ? scan.scannedAt : ''
      });
    });
    Object.keys(scanMap || {}).forEach(function (key) {
      if (seenKeys[key]) return;
      var scan = scanMap[key];
      rows.push({
        location: scan.location,
        barcode: scan.barcode,
        product: scan.product,
        matricula: scan.matricula,
        pack: scan.pack || 'CJ',
        qtySistema: null,
        qtyContada: scan.qtyCj,
        status: 'REVISAR',
        userId: scan.userId,
        scannedAt: scan.scannedAt
      });
    });
    rows.sort(function (a, b) {
      var c = normLoc(a.location).localeCompare(normLoc(b.location));
      if (c !== 0) return c;
      c = normCode(a.barcode).localeCompare(normCode(b.barcode));
      if (c !== 0) return c;
      return (a.lineId || 0) - (b.lineId || 0);
    });
    return rows;
  }

  function dashboardStats(rows) {
    rows = rows || [];
    var ok = 0;
    var revisar = 0;
    rows.forEach(function (r) {
      if (r.status === 'Ok') ok++;
      else revisar++;
    });
    var total = rows.length;
    var accuracy = total ? Math.round((ok / total) * 1000) / 10 : 0;
    return { ok: ok, revisar: revisar, total: total, accuracy: accuracy };
  }

  function filterRows(rows, filter) {
    if (filter === 'ok') return rows.filter(function (r) { return r.status === 'Ok'; });
    if (filter === 'revisar') return rows.filter(function (r) { return r.status === 'REVISAR'; });
    return rows;
  }

  function exportCuadreCsv(rows) {
    var lines = ['Ubicación;Código;Producto;Matrícula;Empaque;Sistema (CJ);Contado (CJ);Estado;Usuario;Fecha conteo'];
    (rows || []).forEach(function (r) {
      lines.push([
        r.location, r.barcode, r.product, r.matricula, r.pack,
        r.qtySistema == null ? '' : r.qtySistema,
        r.qtyContada == null ? '' : r.qtyContada,
        r.status, r.userId || '', r.scannedAt || ''
      ].map(function (v) {
        var s = String(v == null ? '' : v);
        return '="' + s.replace(/"/g, '""') + '"';
      }).join(';'));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  function exportCuadreXlsx(rows, fileName) {
    if (!global.XLSX) return false;
    var data = [['Ubicación', 'Código', 'Producto', 'Matrícula', 'Empaque', 'Sistema (CJ)', 'Contado (CJ)', 'Estado', 'Usuario', 'Fecha conteo']];
    (rows || []).forEach(function (r) {
      data.push([
        r.location, r.barcode, r.product, r.matricula, r.pack,
        r.qtySistema == null ? '' : r.qtySistema,
        r.qtyContada == null ? '' : r.qtyContada,
        r.status, r.userId || '', r.scannedAt || ''
      ]);
    });
    var ws = global.XLSX.utils.aoa_to_sheet(data);
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, 'Cuadre');
    global.XLSX.writeFile(wb, fileName || 'cuadre-inventario-dc.xlsx');
    return true;
  }

  global.PlatformInventarioConciliacion = {
    CACHE_SISTEMA: CACHE_SISTEMA,
    parseWorkbook: parseWorkbook,
    loadSistemaCache: loadSistemaCache,
    saveSistemaCache: saveSistemaCache,
    clearSistemaCache: clearSistemaCache,
    aggregateScans: aggregateScans,
    scansToLiveRows: scansToLiveRows,
    buildConciliation: buildConciliation,
    dashboardStats: dashboardStats,
    filterRows: filterRows,
    exportCuadreCsv: exportCuadreCsv,
    exportCuadreXlsx: exportCuadreXlsx
  };
})(typeof window !== 'undefined' ? window : this);
