/**
 * UI — Dashboard ejecutivo Facturas (todo en RD$)
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var FX = global.PlatformExcelFacturas;

  function fmtMoney(n) {
    return FX ? FX.formatMoney(n, 'DOP') : String(n);
  }

  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '—';
    return n.toFixed(1) + '%';
  }

  function fmtDiff(n) {
    if (n == null || !isFinite(n)) return '—';
    var sign = n > 0 ? '+' : '';
    return sign + fmtMoney(n);
  }

  function semaforoClass(s) {
    return s === 'ok' ? 'sem-ok' : s === 'warn' ? 'sem-warn' : s === 'danger' ? 'sem-danger' : 'sem-neutral';
  }

  function kpiCard(label, value, sub, variant) {
    return '<article class="fac-kpi fac-kpi-' + (variant || 'default') + '">' +
      '<span class="fac-kpi-value">' + esc(value) + '</span>' +
      '<span class="fac-kpi-label">' + esc(label) + '</span>' +
      (sub ? '<span class="fac-kpi-sub">' + esc(sub) + '</span>' : '') +
      '</article>';
  }

  function emptyHtml(canImport) {
    return '<div class="fac-empty">' +
      '<h3>Diario de facturas</h3>' +
      '<p>Importa el Excel con columnas: Almacén, Orden de venta, Monto de la factura, Divisa.</p>' +
      '<p class="fac-meta">Las facturas en USD se convierten automáticamente a pesos con la tasa configurada.</p>' +
      (canImport ? '<button type="button" class="btn btn-primary" data-open-admin="facturas">Importar facturas</button>' : '') +
      '</div>';
  }

  function renderTasaRow(tipoCambio, canEdit) {
    var tc = FX ? FX.resolveTipoCambio(tipoCambio) : tipoCambio;
    if (canEdit) {
      return '<div class="fac-tc-row fac-tc-prominent">' +
        '<label><strong>Tasa USD → RD$</strong> (actual)</label>' +
        '<input type="number" id="facTipoCambio" step="0.01" min="0.01" required placeholder="Ej. 58.5" value="' +
        esc(tipoCambio || tc) + '">' +
        '<span class="fac-meta">Todas las ventas en dólares se multiplican por esta tasa.</span></div>';
    }
    return '<p class="fac-tc-badge">Tasa aplicada: <strong>1 USD = RD$' + esc(String(tc)) + '</strong></p>';
  }

  function renderMetasEditor(almacenes, metas, tipoCambio, canEdit) {
    if (!canEdit) return '';
    var html = '<section class="fac-panel fac-metas-editor" data-perm="config.save">' +
      '<div class="fac-panel-head"><h3>Metas y tasa de cambio</h3>' +
      '<span class="fac-meta">Metas en millones de pesos (RD$) · órdenes</span></div>' +
      renderTasaRow(tipoCambio, true) +
      '<div class="fac-metas-table-wrap"><table class="fac-metas-table"><thead><tr>' +
      '<th>Almacén</th><th>Meta ventas (M RD$)</th><th>Meta órdenes</th>' +
      '</tr></thead><tbody>';
    (almacenes || []).forEach(function (alm) {
      var m = (metas && metas[alm]) || {};
      var metaM = m.ventasMillones != null ? m.ventasMillones : m.ventasDopMillones;
      html += '<tr data-almacen="' + esc(alm) + '">' +
        '<td><strong>' + esc(alm) + '</strong></td>' +
        '<td><input type="number" class="fac-meta-ventas" step="0.01" min="0" value="' + esc(metaM || '') + '"></td>' +
        '<td><input type="number" class="fac-meta-ord" step="1" min="0" value="' + esc(m.ordenes || '') + '"></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>' +
      '<button type="button" class="btn btn-primary" id="btnSaveFacturasMetas">Guardar</button></section>';
    return html;
  }

  function renderComplianceTable(compliance) {
    var html = '<div class="fac-metas-table-wrap"><table class="fac-compliance-table"><thead><tr>' +
      '<th>Almacén</th><th>Ventas RD$</th><th>% meta ventas</th><th>Δ ventas</th>' +
      '<th>Órdenes</th><th>% meta órdenes</th><th>Δ órdenes</th><th>Estado</th></tr></thead><tbody>';
    (compliance || []).forEach(function (c) {
      html += '<tr class="' + semaforoClass(c.semaforoGeneral) + '">' +
        '<td><strong>' + esc(c.almacen) + '</strong></td>' +
        '<td>' + esc(fmtMoney(c.ventasPesos)) + '</td>' +
        '<td class="num">' + fmtPct(c.pctVentas) + '</td>' +
        '<td class="num fac-diff">' + esc(fmtDiff(c.diffVentas)) + '</td>' +
        '<td class="num">' + esc(c.ordenes) + '</td>' +
        '<td class="num">' + fmtPct(c.pctOrdenes) + '</td>' +
        '<td class="num fac-diff">' + esc(c.diffOrdenes != null ? (c.diffOrdenes > 0 ? '+' : '') + c.diffOrdenes : '—') + '</td>' +
        '<td><span class="fac-sem ' + semaforoClass(c.semaforoGeneral) + '">' +
        (c.semaforoGeneral === 'ok' ? 'Cumple' : c.semaforoGeneral === 'warn' ? 'En riesgo' : c.semaforoGeneral === 'danger' ? 'Bajo meta' : '—') +
        '</span></td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderDetailTable(porAlmacen, tipoCambio) {
    var html = '<table class="fac-detail-table"><thead><tr>' +
      '<th>Almacén</th><th>Órdenes</th><th>Facturas</th><th>Ventas RD$</th><th>% ventas</th><th>% órdenes</th></tr></thead><tbody>';
    (porAlmacen || []).forEach(function (a) {
      var usdNote = a.ventasUsdOriginal > 0
        ? ' (incl. USD→RD$ ' + fmtMoney(a.usdEnPesos) + ')'
        : '';
      html += '<tr><td><strong>' + esc(a.almacen) + '</strong></td>' +
        '<td class="num">' + esc(a.ordenes) + '</td>' +
        '<td class="num">' + esc(a.facturas) + '</td>' +
        '<td class="num" title="Tasa ' + esc(String(tipoCambio)) + '">' + esc(fmtMoney(a.ventasPesos)) +
        (usdNote ? '<span class="fac-usd-hint">' + esc(usdNote) + '</span>' : '') + '</td>' +
        '<td class="num">' + fmtPct(a.participacionVentas) + '</td>' +
        '<td class="num">' + fmtPct(a.participacionOrdenes) + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function render(host, data, callbacks) {
    if (!host) return;
    callbacks = callbacks || {};

    if (!data || !FX || !FX.isFacturasData(data) || !data.registros.length) {
      host.innerHTML = emptyHtml(callbacks.canImport);
      return;
    }

    var tc = FX.resolveTipoCambio(callbacks.tipoCambio);
    var kpis = FX.buildKpis(data, tc);
    var view = FX.enrichAggregatesForDisplay(data.aggregates, tc);
    var metas = callbacks.facturasMetas || {};
    var compliance = FX.buildMetasCompliance(data.aggregates.porAlmacen, metas, tc);
    var canEdit = callbacks.canEditMetas;
    var usdNote = kpis.tieneUsd
      ? ' · USD convertido: ' + fmtMoney(kpis.usdEnPesos) + ' (tasa ' + tc + ')'
      : '';

    host.innerHTML =
      '<div class="fac-dashboard" id="facDashboard">' +
      '<header class="fac-header">' +
      '<div><span class="fac-eyebrow">Dashboard ejecutivo</span>' +
      '<h2>Diario de facturas del cliente</h2>' +
      '<p class="fac-sub">' + esc(data.fileName || '') + ' · ' + data.registros.length + ' facturas · ' +
      kpis.ordenes + ' órdenes · ' + kpis.almacenes + ' almacenes · ' +
      'Tasa 1 USD = RD$' + esc(String(tc)) + usdNote +
      (kpis.skippedDuplicates ? ' · ' + kpis.skippedDuplicates + ' duplicados omitidos' : '') +
      '</p></div>' +
      '<div class="fac-filter-row" data-perm="filter.apply">' +
      '<label><span>Desde</span><input type="date" id="facFilterDesde" value="' + esc((callbacks.filters && callbacks.filters.fechaDesde) || '') + '"></label>' +
      '<label><span>Hasta</span><input type="date" id="facFilterHasta" value="' + esc((callbacks.filters && callbacks.filters.fechaHasta) || '') + '"></label>' +
      '<label><span>Almacén</span><select id="facFilterAlmacen"><option value="">Todos</option>' +
      (view.porAlmacen || []).map(function (a) {
        var sel = callbacks.filters && callbacks.filters.almacen === a.almacen ? ' selected' : '';
        return '<option value="' + esc(a.almacen) + '"' + sel + '>' + esc(a.almacen) + '</option>';
      }).join('') +
      '</select></label>' +
      '<button type="button" class="btn btn-primary btn-compact" id="facApplyFilters">Aplicar</button>' +
      '</div></header>' +

      (!canEdit ? renderTasaRow(tc, false) : '') +

      '<div class="fac-kpi-row">' +
      kpiCard('Ventas totales', fmtMoney(kpis.ventasPesos), 'Todo en pesos (RD$)', 'dop') +
      kpiCard('Órdenes de venta', String(kpis.ordenes), 'Sin duplicar OV', 'orders') +
      kpiCard('Facturas', String(kpis.facturas), kpis.tieneUsd ? 'Con conversión USD' : 'Solo RD$', 'inv') +
      kpiCard('Almacenes', String(kpis.almacenes), 'Tasa USD→RD$ ' + tc, 'wh') +
      '</div>' +

      renderMetasEditor(view.porAlmacen.map(function (a) { return a.almacen; }), metas, callbacks.tipoCambio, canEdit) +

      '<section class="fac-panel fac-charts-single fac-charts-premium exec-chart-view">' +
      (global.PlatformExecutiveCharts && global.PlatformExecutiveCharts.facturasTabsHtml
        ? global.PlatformExecutiveCharts.facturasTabsHtml()
        : '') +
      (global.PlatformExecutiveCharts && global.PlatformExecutiveCharts.facturasVisualShell && global.PlatformExecutiveCharts.getFacturasMeta
        ? global.PlatformExecutiveCharts.facturasVisualShell(
          global.PlatformExecutiveCharts.getFacturasMeta('ventas', view.porAlmacen, compliance),
          view.porAlmacen,
          compliance
        )
        : (global.PlatformExecutiveCharts && global.PlatformExecutiveCharts.executiveShell && global.PlatformExecutiveCharts.getFacturasMeta
          ? global.PlatformExecutiveCharts.executiveShell(
            global.PlatformExecutiveCharts.getFacturasMeta('ventas', view.porAlmacen, compliance)
          )
          : '<div class="fac-chart-box"><canvas id="chartFacExecutive"></canvas></div>')) +
      '</section>' +

      '<section class="fac-panel"><div class="fac-panel-head"><h3>Real vs metas</h3>' +
      '<span class="fac-meta">Ventas comparadas en RD$ (USD ya convertidos)</span></div>' +
      renderComplianceTable(compliance) + '</section>' +

      '<section class="fac-panel fac-panel-detail"><div class="fac-panel-head"><h3>Detalle por almacén</h3></div>' +
      '<div class="fac-table-wrap">' + renderDetailTable(view.porAlmacen, tc) + '</div></section>' +
      '</div>';

    bindEvents(host, callbacks);
    if (callbacks.onRendered) {
      callbacks.onRendered(data, compliance, view);
    }
  }

  function bindEvents(host, callbacks) {
    var apply = host.querySelector('#facApplyFilters');
    if (apply) {
      apply.addEventListener('click', function () {
        if (callbacks.onFilterChange) {
          callbacks.onFilterChange({
            fechaDesde: (host.querySelector('#facFilterDesde') || {}).value || '',
            fechaHasta: (host.querySelector('#facFilterHasta') || {}).value || '',
            almacen: (host.querySelector('#facFilterAlmacen') || {}).value || ''
          });
        }
      });
    }
    var saveMetas = host.querySelector('#btnSaveFacturasMetas');
    if (saveMetas) {
      saveMetas.addEventListener('click', function () {
        if (!callbacks.onSaveMetas) return;
        var metas = {};
        host.querySelectorAll('.fac-metas-table tbody tr[data-almacen]').forEach(function (tr) {
          var alm = tr.getAttribute('data-almacen');
          metas[alm] = {
            ventasMillones: (tr.querySelector('.fac-meta-ventas') || {}).value,
            ordenes: (tr.querySelector('.fac-meta-ord') || {}).value
          };
        });
        var tc = (host.querySelector('#facTipoCambio') || {}).value;
        callbacks.onSaveMetas(metas, tc);
      });
    }
  }

  function collectMetasFromDom(host) {
    var metas = {};
    host.querySelectorAll('.fac-metas-table tbody tr[data-almacen]').forEach(function (tr) {
      var alm = tr.getAttribute('data-almacen');
      metas[alm] = {
        ventasMillones: (tr.querySelector('.fac-meta-ventas') || {}).value,
        ordenes: (tr.querySelector('.fac-meta-ord') || {}).value
      };
    });
    return {
      metas: metas,
      tipoCambio: (host.querySelector('#facTipoCambio') || {}).value
    };
  }

  global.PlatformFacturasUI = {
    render: render,
    collectMetasFromDom: collectMetasFromDom
  };
})(typeof window !== 'undefined' ? window : this);
