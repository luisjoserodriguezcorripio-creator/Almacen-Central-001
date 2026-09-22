/**
 * Módulo Productividad — Excel tipo tabla dinámica
 * Filas = fechas · Columnas = empleados · Valores = cantidad de trabajo
 */
(function (global) {
  'use strict';

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
      function pad2(n) { return n < 10 ? '0' + n : String(n); }
      return y + '-' + pad2(mo) + '-' + pad2(day);
    }
    return null;
  }

  function sheetRows(wb, name) {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  }

  function resolvePivotSheet(wb) {
    var i;
    for (i = 0; i < wb.SheetNames.length; i++) {
      var name = wb.SheetNames[i];
      var rows = sheetRows(wb, name);
      if (detectPivotRows(rows)) return name;
    }
    return wb.SheetNames[0];
  }

  function looksLikeEmployeeHeader(cell) {
    var s = String(cell || '').trim();
    if (!s || s.length < 2) return false;
    var n = norm(s);
    var blocked = [
      'usuario', 'estado', 'ubicacion', 'cantidad', 'codigo', 'tipo de trabajo', 'tipo trabajo',
      'fecha y hora', 'id de trabajo', 'almacen', 'sitio', 'estado de trabajo', 'tipo de orden',
      'numero de tarea', 'nivel', 'pasillo', 'modificado por', 'fecha', 'date'
    ];
    if (blocked.some(function (b) { return n === b || n.indexOf(b) >= 0; })) return false;
    if (n === 'total general' || n === 'total' || n === 'grand total') return false;
    if (/^\d+$/.test(s)) return false;
    return true;
  }

  function detectPivotRows(rows) {
    if (global.PlatformExcelDetect && global.PlatformExcelDetect.isProductivityPivot) {
      return global.PlatformExcelDetect.isProductivityPivot(rows);
    }
    return false;
  }

  function findHeaderRow(rows) {
    var r;
    for (r = 0; r < Math.min(rows.length, 15); r++) {
      var row = rows[r] || [];
      var employees = 0;
      var c;
      for (c = 1; c < row.length; c++) {
        if (looksLikeEmployeeHeader(row[c])) employees++;
      }
      if (employees >= 3) {
        var first = norm(row[0]);
        if (!first || first === 'fecha' || first === 'date' || first === 'etiquetas de fila') return r;
        if (parseDateCell(row[1])) continue;
        var next = rows[r + 1];
        if (next && parseDateCell(next[0])) return r;
      }
    }
    return -1;
  }

  function detectWorkbook(wb) {
    if (global.PlatformExcelDetect) return global.PlatformExcelDetect.detectWorkbookType(wb);
    return 'productividad';
  }

  function importWorkbook(wb, fileName) {
    var sheetName = resolvePivotSheet(wb);
    var rows = sheetRows(wb, sheetName);
    var headerIdx = findHeaderRow(rows);
    if (headerIdx < 0) {
      throw new Error('No se detectó formato de tabla dinámica (fechas en filas, empleados en columnas).');
    }

    var header = rows[headerIdx] || [];
    var employees = [];
    var colIndex = [];
    var c;
    for (c = 1; c < header.length; c++) {
      var name = String(header[c] || '').trim();
      if (!looksLikeEmployeeHeader(name)) continue;
      employees.push(name);
      colIndex.push(c);
    }
    if (!employees.length) {
      throw new Error('No se encontraron columnas de empleados en la cabecera.');
    }

    var celdas = [];
    var porFecha = {};
    var r;
    for (r = headerIdx + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var fechaRaw = row[0];
      var fechaLabel = String(fechaRaw || '').trim();
      if (!fechaLabel) continue;
      if (norm(fechaLabel) === 'total general' || norm(fechaLabel) === 'total') break;

      var fecha = parseDateCell(fechaRaw);
      if (!fecha) continue;

      if (!porFecha[fecha]) {
        porFecha[fecha] = { fecha: fecha, total: 0, empleadosActivos: 0 };
      }

      colIndex.forEach(function (col, idx) {
        var empleado = employees[idx];
        var cantidad = toNumber(row[col]);
        if (cantidad <= 0) return;
        celdas.push({ fecha: fecha, empleado: empleado, cantidad: cantidad });
        porFecha[fecha].total += cantidad;
        porFecha[fecha].empleadosActivos++;
      });
    }

    var empleados = buildEmpleadoMetrics(celdas, employees);
    var fechas = global.PlatformUtils
      ? global.PlatformUtils.sortDateKeysAsc(Object.keys(porFecha))
      : Object.keys(porFecha).sort();

    celdas.sort(function (a, b) {
      var c = (a.fecha || '').localeCompare(b.fecha || '');
      return c !== 0 ? c : (a.empleado || '').localeCompare(b.empleado || '');
    });

    return {
      module: 'productividad',
      fileName: fileName || 'Excel productividad',
      importedAt: new Date().toISOString(),
      sourceSheet: sheetName,
      meta: {
        empleados: employees,
        fechas: fechas,
        totalCeldas: celdas.length,
        diasConDatos: fechas.length
      },
      celdas: celdas,
      porFecha: fechas.map(function (f) { return porFecha[f]; }),
      empleados: empleados
    };
  }

  function buildEmpleadoMetrics(celdas, employeeOrder) {
    var byEmp = {};
    employeeOrder.forEach(function (name) {
      byEmp[name] = { nombre: name, total: 0, diasActivos: {}, maxDia: 0, registros: 0 };
    });

    celdas.forEach(function (c) {
      if (!byEmp[c.empleado]) {
        byEmp[c.empleado] = { nombre: c.empleado, total: 0, diasActivos: {}, maxDia: 0, registros: 0 };
      }
      var e = byEmp[c.empleado];
      e.total += c.cantidad;
      e.registros++;
      e.diasActivos[c.fecha] = true;
      if (c.cantidad > e.maxDia) e.maxDia = c.cantidad;
    });

    var list = employeeOrder.map(function (name) {
      return finalizeEmpleado(byEmp[name] || { nombre: name, total: 0, diasActivos: {}, maxDia: 0, registros: 0 });
    });

    var activos = list.filter(function (e) { return e.total > 0; });
    var avgDailyTeam = activos.length
      ? activos.reduce(function (s, e) { return s + e.promedioDiario; }, 0) / activos.length
      : 0;

    list.forEach(function (e) {
      if (avgDailyTeam > 0 && e.promedioDiario > 0) {
        e.rendimientoPct = Math.round((e.promedioDiario / avgDailyTeam) * 100);
      } else {
        e.rendimientoPct = e.total > 0 ? 100 : 0;
      }
      e.rendimientoLabel = rendimientoLabel(e.rendimientoPct);
    });

    list.sort(function (a, b) { return b.total - a.total; });
    return list;
  }

  function finalizeEmpleado(e) {
    var dias = Object.keys(e.diasActivos || {}).length;
    e.diasActivos = dias;
    e.promedioDiario = dias ? Math.round((e.total / dias) * 10) / 10 : 0;
    e.rendimientoPct = 0;
    e.rendimientoLabel = '—';
    return e;
  }

  function rendimientoLabel(pct) {
    if (pct >= 110) return 'Alto';
    if (pct >= 90) return 'Normal';
    if (pct >= 70) return 'Bajo';
    if (pct > 0) return 'Crítico';
    return 'Sin datos';
  }

  function filterData(data, filters) {
    if (!data || !data.celdas) return data;
    filters = filters || {};
    var celdas = data.celdas.filter(function (c) {
      if (filters.empleado && c.empleado !== filters.empleado) return false;
      if (filters.fechaDesde && c.fecha < filters.fechaDesde) return false;
      if (filters.fechaHasta && c.fecha > filters.fechaHasta) return false;
      return true;
    });

    var employees = data.meta.empleados || [];
    var porFechaMap = {};
    celdas.forEach(function (c) {
      if (!porFechaMap[c.fecha]) {
        porFechaMap[c.fecha] = { fecha: c.fecha, total: 0, empleadosActivos: 0 };
      }
      porFechaMap[c.fecha].total += c.cantidad;
      porFechaMap[c.fecha].empleadosActivos++;
    });

    return Object.assign({}, data, {
      celdas: celdas,
      porFecha: Object.keys(porFechaMap).sort().map(function (k) { return porFechaMap[k]; }),
      empleados: buildEmpleadoMetrics(celdas, employees)
    });
  }

  function buildKpis(data) {
    if (!data || !data.empleados) {
      return { totalTrabajo: 0, empleadosActivos: 0, promedioEquipo: 0, mejorEmpleado: '—' };
    }
    var total = data.empleados.reduce(function (s, e) { return s + e.total; }, 0);
    var activos = data.empleados.filter(function (e) { return e.total > 0; });
    var promedio = activos.length ? Math.round(total / activos.length) : 0;
    var top = data.empleados[0];
    return {
      totalTrabajo: total,
      empleadosActivos: activos.length,
      promedioEquipo: promedio,
      mejorEmpleado: top ? top.nombre : '—',
      diasConDatos: (data.meta && data.meta.diasConDatos) || (data.porFecha && data.porFecha.length) || 0
    };
  }

  global.PlatformExcelProductivity = {
    detectWorkbook: detectWorkbook,
    detectPivotRows: detectPivotRows,
    importWorkbook: importWorkbook,
    filterData: filterData,
    buildKpis: buildKpis,
    parseDateCell: parseDateCell,
    norm: norm
  };
})(typeof window !== 'undefined' ? window : this);
