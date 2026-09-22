/**
 * Exportación — datos filtrados, reportes y gráficos
 */
(function (global) {
  'use strict';

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function escapeCsv(val) {
    var s = String(val == null ? '' : val);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function registrosToRows(data, columns) {
    return (data.registros || []).map(function (rec) {
      return columns.map(function (col) {
        if (col.isExtra) {
          var label = col.key.replace('extra:', '');
          return (rec.extra && rec.extra[label]) || '';
        }
        return rec[col.key] != null ? rec[col.key] : '';
      });
    });
  }

  function exportRegistrosCsv(data, filename) {
    if (!data || !data.registros) return false;
    var cols = data.tableColumns || [];
    var headers = cols.map(function (c) { return c.label; });
    var lines = [headers.map(escapeCsv).join(',')];
    registrosToRows(data, cols).forEach(function (row) {
      lines.push(row.map(escapeCsv).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename || 'operaciones_filtrado.csv');
    return true;
  }

  function exportRegistrosXlsx(data, filename) {
    if (typeof XLSX === 'undefined' || !data || !data.registros) return false;
    var cols = data.tableColumns || [];
    var aoa = [cols.map(function (c) { return c.label; })];
    registrosToRows(data, cols).forEach(function (row) { aoa.push(row); });
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, filename || 'operaciones_filtrado.xlsx');
    return true;
  }

  function buildReportText(data, moduleLabel) {
    if (!data) return 'Sin datos.';
    var lines = [];
    lines.push('REPORTE — ' + (moduleLabel || 'Operaciones'));
    lines.push('Generado: ' + new Date().toLocaleString('es'));
    lines.push('Archivo origen: ' + (data.fileName || '—'));
    lines.push('');

    if (data.module === 'productividad' && data.celdas && global.PlatformExcelProductivity) {
      var kpp = global.PlatformExcelProductivity.buildKpis(data);
      lines.push('=== Productividad ===');
      lines.push('Trabajo total: ' + kpp.totalTrabajo);
      lines.push('Empleados: ' + kpp.empleadosActivos);
      lines.push('Mejor: ' + kpp.mejorEmpleado);
    } else if (data.format === 'control' && global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.buildKpis) {
      var kp = global.PlatformExcelOperaciones.buildKpis(data);
      lines.push('=== KPIs ===');
      lines.push('Total registros: ' + kp.totalRegistros);
      lines.push('Cantidad procesada: ' + kp.totalCantidad);
      lines.push('Usuarios activos: ' + kp.usuariosActivos);
      lines.push('Estados distintos: ' + kp.estadosDistintos);
      lines.push('');
      lines.push('=== Top usuarios ===');
      (data.aggregates.porUsuario || []).slice(0, 10).forEach(function (u, i) {
        lines.push((i + 1) + '. ' + u.usuario + ' — ' + u.count + ' tareas, cant. ' + u.cantidad);
      });
      lines.push('');
      lines.push('=== Por estado ===');
      (data.aggregates.porEstado || []).forEach(function (e) {
        lines.push(e.estado + ': ' + e.count);
      });
    }
    return lines.join('\n');
  }

  function exportReportTxt(data, filename, moduleLabel) {
    var text = buildReportText(data, moduleLabel);
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, filename || 'reporte_operaciones.txt');
    return true;
  }

  function downloadChart(canvasId, filename) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return false;
    try {
      var url = canvas.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || canvasId + '.png';
      a.click();
      return true;
    } catch (e) {
      return false;
    }
  }

  function exportReportPdf(data, filename, moduleLabel) {
    var text = buildReportText(data, moduleLabel);
    var JsPDF = global.jspdf && global.jspdf.jsPDF;
    if (JsPDF) {
      try {
        var doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        doc.setFontSize(11);
        doc.text(moduleLabel || 'Reporte WMS', 14, 16);
        var lines = doc.splitTextToSize(text, 180);
        doc.text(lines, 14, 26);
        doc.save(filename || 'reporte.pdf');
        return true;
      } catch (e) {
        console.warn('PDF:', e);
      }
    }
    var w = global.open('', '_blank');
    if (!w) return false;
    w.document.write('<html><head><title>' + (moduleLabel || 'Reporte') + '</title></head><body><pre style="font-family:sans-serif;white-space:pre-wrap;padding:2rem;">' + text.replace(/</g, '&lt;') + '</pre></body></html>');
    w.document.close();
    w.focus();
    w.print();
    return true;
  }

  function exportProductividadCsv(data, filename) {
    if (!data || !data.celdas) return false;
    var lines = ['fecha,empleado,cantidad'];
    data.celdas.forEach(function (c) {
      lines.push([c.fecha, c.empleado, c.cantidad].map(escapeCsv).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename || 'productividad_filtrado.csv');
    return true;
  }

  function downloadAllCharts(ids, prefix) {
    var ok = 0;
    (ids || []).forEach(function (id) {
      if (downloadChart(id, (prefix || 'grafico') + '_' + id + '.png')) ok++;
    });
    return ok;
  }

  global.PlatformExport = {
    exportRegistrosCsv: exportRegistrosCsv,
    exportRegistrosXlsx: exportRegistrosXlsx,
    exportProductividadCsv: exportProductividadCsv,
    exportReportTxt: exportReportTxt,
    exportReportPdf: exportReportPdf,
    buildReportText: buildReportText,
    downloadChart: downloadChart,
    downloadAllCharts: downloadAllCharts
  };
})(typeof window !== 'undefined' ? window : this);
