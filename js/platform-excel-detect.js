/**
 * Detección estricta de tipo Excel — OPERACIONES tiene prioridad sobre PRODUCTIVIDAD
 */
(function (global) {
  'use strict';

  var OPS_MARKERS = [
    'usuario', 'estado', 'ubicacion', 'cantidad', 'codigo', 'tipo de trabajo', 'tipo trabajo',
    'fecha y hora', 'id de trabajo', 'id. de trabajo', 'numero de tarea', 'número de tarea',
    'almacen', 'sitio', 'modificado por', 'estado de trabajo', 'tipo de orden',
    'nivel', 'pasillo', 'localizacion', 'warehouse', 'location', 'status'
  ];

  var PIVOT_ROW_LABELS = ['fecha', 'date', 'dia', 'día', 'etiquetas de fila', 'label'];

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  }

  function headerScoreOperations(headers) {
    var score = 0;
    var normalized = (headers || []).map(function (h) { return norm(h); });
    OPS_MARKERS.forEach(function (marker) {
      if (normalized.some(function (h) { return h === marker || h.indexOf(marker) >= 0; })) score++;
    });
    return score;
  }

  function isOperationsTransactional(rows) {
    if (!rows || rows.length < 2) return false;
    var r;
    for (r = 0; r < Math.min(rows.length, 25); r++) {
      var headers = (rows[r] || []).map(function (h) { return String(h || '').trim(); });
      if (headerScoreOperations(headers) >= 3) return true;
    }
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.detectControlFormat) {
      return global.PlatformExcelOperaciones.detectControlFormat(rows);
    }
    return false;
  }

  function isBlockedEmployeeName(name) {
    var n = norm(name);
    if (!n || n.length < 2) return true;
    if (OPS_MARKERS.some(function (m) { return n === m || n.indexOf(m) >= 0; })) return true;
    if (PIVOT_ROW_LABELS.indexOf(n) >= 0) return true;
    if (n === 'total' || n === 'total general' || n.indexOf('suma de') === 0) return true;
    return false;
  }

  function parseDateCell(v) {
    if (global.PlatformExcelProductivity && global.PlatformExcelProductivity.parseDateCell) {
      return global.PlatformExcelProductivity.parseDateCell(v);
    }
    return null;
  }

  function isProductivityPivot(rows) {
    if (!rows || rows.length < 4) return false;
    if (isOperationsTransactional(rows)) return false;

    var headerIdx = -1;
    var r;
    for (r = 0; r < Math.min(rows.length, 20); r++) {
      var row = rows[r] || [];
      var col0 = norm(row[0]);
      var employees = 0;
      var c;
      for (c = 1; c < row.length; c++) {
        if (!isBlockedEmployeeName(row[c])) employees++;
      }
      if (employees < 3) continue;
      if (PIVOT_ROW_LABELS.indexOf(col0) >= 0 || col0 === '' || col0 === 'fecha') {
        headerIdx = r;
        break;
      }
      var next = rows[r + 1];
      if (next && parseDateCell(next[0])) {
        headerIdx = r;
        break;
      }
    }
    if (headerIdx < 0) return false;

    var header = rows[headerIdx] || [];
    var dateRows = 0;
    var numericCells = 0;
    var totalCells = 0;

    for (r = headerIdx + 1; r < Math.min(rows.length, headerIdx + 50); r++) {
      var dataRow = rows[r] || [];
      if (!parseDateCell(dataRow[0])) continue;
      dateRows++;
      for (c = 1; c < header.length; c++) {
        if (isBlockedEmployeeName(header[c])) continue;
        totalCells++;
        var v = dataRow[c];
        var n = Number(String(v).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
        if (v === '' || v === null || (isFinite(n) && n >= 0)) numericCells++;
      }
    }

    return dateRows >= 2 && totalCells > 0 && numericCells / totalCells >= 0.5;
  }

  function isFacturasSheet(rows) {
    return global.PlatformExcelFacturas &&
      global.PlatformExcelFacturas.detectFacturasFormat(rows);
  }

  function detectSheetType(rows) {
    if (isFacturasSheet(rows)) return 'facturas';
    if (isOperationsTransactional(rows)) return 'operaciones';
    if (isProductivityPivot(rows)) return 'productividad';
    return null;
  }

  function detectWorkbookType(wb) {
    if (!wb || !wb.SheetNames) return 'operaciones';

    var i;
    var foundFacturas = false;
    var foundOps = false;
    var foundProd = false;

    for (i = 0; i < wb.SheetNames.length; i++) {
      var rows = sheetRows(wb, wb.SheetNames[i]);
      var t = detectSheetType(rows);
      if (t === 'facturas') foundFacturas = true;
      if (t === 'operaciones') foundOps = true;
      if (t === 'productividad') foundProd = true;
    }

    if (foundFacturas) return 'facturas';
    if (foundOps) return 'operaciones';
    if (foundProd) return 'productividad';

    if (wb.Sheets['BD'] || wb.Sheets['Sheet1']) return 'operaciones';
    return 'operaciones';
  }

  global.PlatformExcelDetect = {
    detectWorkbookType: detectWorkbookType,
    detectSheetType: detectSheetType,
    isOperationsTransactional: isOperationsTransactional,
    isProductivityPivot: isProductivityPivot,
    norm: norm
  };
})(typeof window !== 'undefined' ? window : this);
