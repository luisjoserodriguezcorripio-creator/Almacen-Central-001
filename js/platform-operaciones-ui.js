/**
 * UI — Módulo Control de Operaciones
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var OPS_VIEWS = {
    resumen: { title: 'Panel de control', id: 'resumen' },
    tabla: { title: 'Tabla avanzada', id: 'tabla' },
    graficos: { title: 'Gráficos', id: 'graficos' },
    exportar: { title: 'Exportar', id: 'exportar' }
  };

  var CHART_IDS = ['chartOpsFecha', 'chartOpsUsuario', 'chartOpsEstado', 'chartOpsUbicacion'];

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + esc(cls || '') + '"><div class="kpi-value">' + esc(value) +
      '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function emptyHtml() {
    return '<div class="widget span-12 empty-state module-empty">' +
      '<p class="module-empty-title">Sin datos de operaciones</p>' +
      '<p>Importa el Excel de <strong>control de operaciones</strong> (fecha, usuario, estado, ubicación, cantidad…) desde <strong>Administración</strong>.</p></div>';
  }

  function getCellValue(rec, col) {
    if (col.isExtra) return (rec.extra && rec.extra[col.key.replace('extra:', '')]) || '';
    return rec[col.key] != null ? rec[col.key] : '';
  }

  function render(host, data, viewId, callbacks) {
    if (!host) return;
    callbacks = callbacks || {};
    viewId = viewId || 'resumen';

    var hasLegacy = data && data.bd && data.bd.registros && data.bd.registros.length;
    var hasControl = data && global.PlatformExcelOperaciones &&
      global.PlatformExcelOperaciones.isControlData(data) && data.registros.length;

    if (!hasLegacy && !hasControl) {
      host.innerHTML = emptyHtml();
      return;
    }

    var filters = callbacks.filters || {};
    var prep = global.PlatformOpsDashboard && global.PlatformOpsDashboard.prepareResumenData
      ? global.PlatformOpsDashboard.prepareResumenData(data, filters)
      : { data: data, useDiaAnterior: false, abiertosRows: [] };
    var viewData = prep.data || data;

    var kpis = hasControl
      ? global.PlatformExcelOperaciones.buildKpis(viewData)
      : (global.PlatformExcel ? global.PlatformExcel.buildKpis(viewData) : {});

    if (viewId === 'resumen') {
      if (global.PlatformOpsDashboard) {
        var model = global.PlatformOpsDashboard.buildModel(viewData);
        if (!model) {
          host.innerHTML = emptyHtml();
          return;
        }
        global.PlatformOpsDashboard.renderDashboard(host, model, filters, {
          filters: filters,
          measurement: prep,
          onDateFilter: callbacks.onDateFilter,
          onRendered: callbacks.onDashboardRendered
        });
        return;
      }
      host.innerHTML =
        '<div class="kpi-grid">' +
        kpiCard('Total registros', kpis.totalRegistros, '') +
        kpiCard('Cantidad procesada', kpis.totalCantidad, 'success') +
        '</div>';
      if (callbacks.renderCharts) callbacks.renderCharts(data, CHART_IDS);
      return;
    }

    if (viewId === 'tabla') {
      renderTable(host, viewData, callbacks);
      return;
    }

    if (viewId === 'graficos') {
      var EC = global.PlatformExecutiveCharts;
      var tabs = EC && EC.operacionesGraficosTabsHtml ? EC.operacionesGraficosTabsHtml() : '';
      var opsMeta = EC && EC.getOperacionesGraficosMeta
        ? EC.getOperacionesGraficosMeta('fecha', viewData.aggregates, null)
        : { eyebrow: 'Operaciones', title: 'Volumen de órdenes en el tiempo', canvasId: 'chartOpsExecutive' };
      var shell = EC && EC.executiveShell
        ? EC.executiveShell(opsMeta)
        : '<canvas id="chartOpsExecutive"></canvas>';
      host.innerHTML =
        '<div class="widget span-12 ops-charts-single exec-chart-view">' + tabs + shell +
        '<div class="ops-export-row">' +
        '<button type="button" class="btn btn-sm btn-dl-chart" data-chart="chartOpsExecutive">Descargar PNG</button>' +
        '</div></div>';
      if (callbacks.bindExecutiveOpsChart) {
        callbacks.bindExecutiveOpsChart(host, viewData);
      } else if (callbacks.renderChartsFull) {
        callbacks.renderChartsFull(viewData, 'fecha');
      }
      bindChartDownloads(host);
      return;
    }

    if (viewId === 'exportar') {
      host.innerHTML =
        '<div class="widget span-12 export-panel">' +
        '<h3>Exportar datos y reportes</h3>' +
        '<p class="meta-line">Se exportan los registros <strong>actualmente filtrados</strong> (' + viewData.registros.length + ' filas).</p>' +
        '<div class="export-actions" data-perm="export.data">' +
        '<button type="button" class="btn btn-primary" id="btnExportCsv">Datos filtrados (CSV)</button>' +
        '<button type="button" class="btn btn-primary" id="btnExportXlsx">Datos filtrados (Excel)</button>' +
        '<button type="button" class="btn" id="btnExportPdf">Reporte PDF</button>' +
        '<button type="button" class="btn" id="btnExportReport">Reporte ejecutivo (TXT)</button>' +
        '<button type="button" class="btn" id="btnExportCharts">Gráficos (PNG)</button>' +
        '</div></div>';
      function exportPayload() {
        if (callbacks.getExportData) return callbacks.getExportData(viewData);
        var tf = callbacks.tableFilters || {};
        if (tf.usuario || tf.estado || tf.ubicacion || tf.tipoTrabajo || tf.search) {
          var regs = filterTableRows(viewData.registros, tf);
          return Object.assign({}, viewData, {
            registros: regs,
            aggregates: global.PlatformExcelOperaciones.buildAggregates(regs)
          });
        }
        return viewData;
      }
      bindOnce(host.querySelector('#btnExportCsv'), 'click', function () {
        global.PlatformExport.exportRegistrosCsv(exportPayload(), 'operaciones_filtrado.csv');
      });
      bindOnce(host.querySelector('#btnExportXlsx'), 'click', function () {
        if (!global.PlatformExport.exportRegistrosXlsx(exportPayload(), 'operaciones_filtrado.xlsx')) {
          alert('SheetJS no está disponible para exportar Excel.');
        }
      });
      bindOnce(host.querySelector('#btnExportReport'), 'click', function () {
        global.PlatformExport.exportReportTxt(exportPayload(), 'reporte_operaciones.txt', 'Control de Operaciones');
      });
      bindOnce(host.querySelector('#btnExportPdf'), 'click', function () {
        global.PlatformExport.exportReportPdf(exportPayload(), 'reporte_operaciones.pdf', 'Control de Operaciones');
      });
      bindOnce(host.querySelector('#btnExportCharts'), 'click', function () {
        var n = global.PlatformExport.downloadAllCharts(CHART_IDS, 'operaciones');
        if (!n) alert('Abra primero el panel de control para generar los gráficos, o use la vista Gráficos.');
      });
    }
  }

  function bindOnce(el, ev, fn) {
    if (!el || el.dataset.bound === ev) return;
    el.dataset.bound = ev;
    el.addEventListener(ev, fn);
  }

  function bindChartDownloads(host) {
    host.querySelectorAll('.btn-dl-chart').forEach(function (btn) {
      bindOnce(btn, 'click', function () {
        global.PlatformExport.downloadChart(btn.getAttribute('data-chart'));
      });
    });
  }

  function renderTable(host, data, callbacks) {
    var cols = data.tableColumns || [];
    var tableFilters = callbacks.tableFilters || {};
    var dynamicKeys = ['usuario', 'estado', 'ubicacion', 'tipoTrabajo'];
    var meta = data.meta || {};

    var filterHtml = '<div class="ops-table-filters" id="opsTableFilters">';
    var filterMeta = {
      usuario: meta.usuarios || [],
      estado: meta.estados || [],
      ubicacion: meta.ubicaciones || [],
      tipoTrabajo: meta.tiposTrabajo || []
    };
    dynamicKeys.forEach(function (key) {
      var options = filterMeta[key] || [];
      var label = key === 'tipoTrabajo' ? 'Tipo trabajo' : key.charAt(0).toUpperCase() + key.slice(1);
      filterHtml += '<div class="filter-group"><label>' + esc(label) + '</label><select data-tbl-filter="' + key + '">' +
        '<option value="">Todos</option>';
      options.forEach(function (opt) {
        var sel = tableFilters[key] === opt ? ' selected' : '';
        filterHtml += '<option value="' + esc(opt) + '"' + sel + '>' + esc(opt) + '</option>';
      });
      filterHtml += '</select></div>';
    });
    filterHtml += '<div class="filter-group"><label>Buscar</label><input type="search" id="opsTableSearch" placeholder="ID, código, texto…" value="' +
      esc(tableFilters.search || '') + '"></div></div>';

    var filtered = filterTableRows(data.registros, tableFilters);

    var thead = '<tr>' + cols.map(function (c) { return '<th>' + esc(c.label) + '</th>'; }).join('') + '</tr>';
    var tbody = '';
    var limit = 500;
    filtered.slice(0, limit).forEach(function (rec) {
      tbody += '<tr>' + cols.map(function (c) {
        return '<td>' + esc(getCellValue(rec, c)) + '</td>';
      }).join('') + '</tr>';
    });

    host.innerHTML =
      '<div class="widget span-12">' +
      '<div class="widget-head"><h3>Tabla de operaciones</h3>' +
      '<span class="meta-line">' + filtered.length + ' filas' + (filtered.length > limit ? ' (mostrando ' + limit + ')' : '') + '</span></div>' +
      filterHtml +
      '<div class="data-table-wrap ops-table-wrap"><table class="data-table ops-data-table" id="opsDataTable">' +
      '<thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div></div>';

    host.querySelectorAll('[data-tbl-filter]').forEach(function (sel) {
      bindOnce(sel, 'change', function () {
        if (callbacks.onTableFilterChange) {
          callbacks.onTableFilterChange(collectTableFilters(host));
        }
      });
    });
    var search = host.querySelector('#opsTableSearch');
    if (search) {
      bindOnce(search, 'input', function () {
        if (callbacks.onTableFilterChange) {
          callbacks.onTableFilterChange(collectTableFilters(host));
        }
      });
    }
  }

  function collectTableFilters(host) {
    var f = { search: '' };
    host.querySelectorAll('[data-tbl-filter]').forEach(function (sel) {
      f[sel.getAttribute('data-tbl-filter')] = sel.value;
    });
    var s = host.querySelector('#opsTableSearch');
    if (s) f.search = s.value.trim();
    return f;
  }

  function filterTableRows(registros, f) {
    f = f || {};
    return registros.filter(function (rec) {
      if (f.usuario && rec.usuario !== f.usuario) return false;
      if (f.estado && rec.estado !== f.estado) return false;
      if (f.ubicacion && rec.ubicacion !== f.ubicacion) return false;
      if (f.tipoTrabajo && rec.tipoTrabajo !== f.tipoTrabajo) return false;
      if (f.search) {
        var q = f.search.toLowerCase();
        var blob = [rec.tareaId, rec.usuario, rec.codigo, rec.ubicacion, rec.tipoTrabajo, rec.estado, rec.fechaHora]
          .join(' ').toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  global.PlatformOperacionesUI = {
    OPS_VIEWS: OPS_VIEWS,
    CHART_IDS: CHART_IDS,
    render: render,
    filterTableRows: filterTableRows
  };
})(typeof window !== 'undefined' ? window : this);
