/**
 * Renderizado de módulos — Productividad, General, Reportes
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var esc = PC ? PC.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var PROD_VIEWS = {
    resumen: { title: 'Resumen productividad', id: 'resumen' },
    empleados: { title: 'Rendimiento por empleado', id: 'empleados' },
    tendencias: { title: 'Tendencia diaria', id: 'tendencias' },
    matriz: { title: 'Matriz fecha × empleado', id: 'matriz' }
  };

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + esc(cls || '') + '"><div class="kpi-value">' + esc(value) +
      '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function emptyModuleHtml(moduleName, importHint, canImport) {
    var actions = '';
    if (canImport) {
      actions =
        '<div class="empty-state-actions">' +
        '<button type="button" class="btn btn-primary" data-open-admin="excel">Importar Excel</button>' +
        '<button type="button" class="btn" data-open-admin="sistema">Ver diagnóstico</button>' +
        '</div>';
    }
    return '<div class="widget span-12 empty-state empty-state-v2 module-empty">' +
      '<div class="empty-state-icon" aria-hidden="true">◇</div>' +
      '<p class="module-empty-title">Sin datos de ' + esc(moduleName) + '</p>' +
      '<p>' + importHint + '</p>' + actions + '</div>';
  }

  function metricTile(label, value, variant) {
    var cls = 'gen-metric' + (variant ? ' gen-metric--' + variant : '');
    return '<div class="' + cls + '">' +
      '<span class="gen-metric-value">' + esc(String(value)) + '</span>' +
      '<span class="gen-metric-label">' + esc(label) + '</span></div>';
  }

  function insightTile(label, value) {
    return '<div class="gen-insight"><strong>' + esc(String(value)) + '</strong><span>' + esc(label) + '</span></div>';
  }

  function cardFooter(fileName, jumpModule, jumpLabel) {
    return '<footer class="gen-card-foot">' +
      '<span class="gen-file" title="' + esc(fileName || '') + '">' + esc((fileName || 'Sin archivo').slice(0, 28)) + '</span>' +
      '<button type="button" class="gen-link" data-module-jump="' + esc(jumpModule) + '">' +
      esc(jumpLabel) + ' <span aria-hidden="true">→</span></button></footer>';
  }

  var CARD_JUMP = { ops: 'operaciones', fac: 'facturas' };

  function renderOpsCardBody(hasOps, opsModel, operaciones, meta) {
    if (hasOps && opsModel) {
      var ko = opsModel.kpis;
      var topOp = (opsModel.operaciones || [])[0];
      return '<div class="gen-metrics">' +
        metricTile('Abiertos', ko.abiertos != null ? ko.abiertos : 0, 'accent') +
        metricTile('En proceso', ko.enProceso != null ? ko.enProceso : 0, 'warn') +
        metricTile('A trabajar', ko.totalTrabajar != null ? ko.totalTrabajar : 0, 'ok') +
        '</div><div class="gen-insights">' +
        insightTile('Áreas / tipos', (opsModel.operaciones || []).length) +
        (topOp ? insightTile('Mayor carga', topOp.name) : insightTile('Estado', 'Activo')) +
        '</div>' +
        cardFooter(opsModel.fileName || operaciones.fileName, 'operaciones', 'Detalle');
    }
    return '<div class="gen-empty"><span class="gen-empty-icon">⬡</span><p>Importa el Excel de órdenes de trabajo para ver KPIs operativos.</p>' +
      (meta.canImport ? '<button type="button" class="btn btn-sm btn-primary" data-open-admin="excel" style="margin-top:0.75rem">Importar</button>' : '') +
      '</div>';
  }

  function renderFacCardBody(hasFac, facturas, tipoCambio, FX, meta) {
    if (hasFac) {
      var tc = FX.resolveTipoCambio(tipoCambio);
      var kf = FX.buildKpis(facturas, tc);
      return '<div class="gen-metrics">' +
        metricTile('Ventas RD$', FX.formatMillions(kf.ventasPesos), 'ok') +
        metricTile('Órdenes', kf.ordenes, 'accent') +
        metricTile('Almacenes', kf.almacenes, '') +
        '</div><div class="gen-insights">' +
        insightTile('Facturas', kf.facturas) +
        insightTile('Tasa USD→RD$', tc) +
        '</div>' +
        cardFooter(facturas.fileName, 'facturas', 'Detalle');
    }
    return '<div class="gen-empty"><span class="gen-empty-icon">$</span><p>Importa el diario de facturas del cliente.</p>' +
      (meta.canImport ? '<button type="button" class="btn btn-sm btn-primary" data-open-admin="facturas" style="margin-top:0.75rem">Importar</button>' : '') +
      '</div>';
  }

  function moduleCardOpen(mod, title, icon, hasData) {
    var badge = hasData
      ? '<span class="gen-badge gen-badge--live">En línea</span>'
      : '<span class="gen-badge gen-badge--empty">Sin datos</span>';
    var jump = CARD_JUMP[mod] || mod;
    var attrs = hasData
      ? ' class="gen-card gen-card--' + mod + ' has-data gen-card--interactive" data-module-jump="' + jump +
        '" tabindex="0" role="button" aria-label="Ver ' + esc(title) + '"'
      : ' class="gen-card gen-card--' + mod + '"';
    return '<article' + attrs + '>' +
      '<div class="gen-card-accent"></div><div class="gen-card-body">' +
      '<header class="gen-card-head">' +
      '<div class="gen-card-icon" aria-hidden="true">' + icon + '</div>' +
      '<div class="gen-card-titles">' + badge + '<h3>' + esc(title) + '</h3></div></header>';
  }

  function renderGeneral(host, ctx) {
    if (!host) return;
    ctx = ctx || {};

    if (global.PlatformCommandCenter && global.PlatformCommandCenter.render) {
      var model = global.PlatformCommandCenter.render(host, ctx);
      host._ccModel = model;
      return;
    }

    host.innerHTML = '<div class="cc-empty">Módulo Centro de mando no disponible.</div>';
  }

  function renderProductividad(host, data, viewId, charts, onChart, meta) {
    if (!host) return;
    viewId = viewId || 'resumen';
    meta = meta || {};

    if (!data || !data.celdas || !data.celdas.length) {
      host.innerHTML = emptyModuleHtml('Productividad',
        'Importa un Excel con formato tabla dinámica (fechas en filas, empleados en columnas) desde Administración → Datos Excel.',
        meta.canImport);
      return;
    }

    var kpis = global.PlatformExcelProductivity.buildKpis(data);

    var EC = global.PlatformExecutiveCharts;
    var shellFn = EC && EC.executiveShell ? EC.executiveShell : function (m) {
      return '<div class="exec-chart-shell"><canvas id="' + (m.canvasId || 'chartProdExecutive') + '"></canvas></div>';
    };

    var metaChart = EC && EC.getProductividadMeta
      ? EC.getProductividadMeta(viewId, data)
      : { canvasId: 'chartProdExecutive' };

    if (viewId === 'resumen') {
      host.innerHTML =
        '<div class="kpi-grid">' +
        kpiCard('Trabajo total', kpis.totalTrabajo, '') +
        kpiCard('Empleados activos', kpis.empleadosActivos, 'success') +
        kpiCard('Días con datos', kpis.diasConDatos, '') +
        kpiCard('Líder del ranking', kpis.mejorEmpleado, 'accent') +
        '</div><div class="widget span-12 exec-chart-view">' + shellFn(metaChart) +
        '<p class="meta-line">' + esc(data.fileName || '') + ' · ' + data.celdas.length + ' celdas</p></div>';
      if (onChart) onChart('productividad', data, viewId);
      return;
    }

    if (viewId === 'empleados' || viewId === 'tendencias' || viewId === 'matriz') {
      host.innerHTML = '<div class="widget span-12 exec-chart-view">' + shellFn(metaChart) +
        (viewId === 'matriz'
          ? '<p class="meta-line">Para detalle celda a celda, exporta el Excel original desde Reportes.</p>'
          : '') +
        '</div>';
      if (onChart) onChart('productividad', data, viewId);
    }
  }

  function reportBlock(title, pillClass, itemsHtml) {
    return '<div class="report-block report-block--' + pillClass + '">' +
      '<h4>' + esc(title) + '</h4><ul>' + itemsHtml + '</ul></div>';
  }

  function loadAveriasSnapshot() {
    try {
      var raw = global.localStorage && global.localStorage.getItem('averias_dc_snapshot');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function countAveriasPending(snap) {
    if (!snap) return 0;
    function pending(list) {
      return (list || []).filter(function (r) {
        return String(r && r.status || 'PENDIENTE').toUpperCase() !== 'CORREGIDO';
      }).length;
    }
    return pending(snap.incidences) + pending(snap.damages) + pending(snap.securityIncidents) +
      pending(snap.audits5s) + pending(snap.despachoAudits) + pending(snap.equipmentInspections);
  }

  function renderReportes(host, ctx) {
    if (!host) return;
    ctx = ctx || {};
    var operaciones = ctx.operaciones;
    var facturas = ctx.facturas;
    var productividad = ctx.productividad;
    var tipoCambio = ctx.tipoCambio;

    var OPS = global.PlatformOpsDashboard;
    var FX = global.PlatformExcelFacturas;

    var html = '<div class="report-executive">' +
      '<header class="report-executive-head">' +
      '<h3>Informe consolidado</h3>' +
      '<p>Resumen de todos los módulos publicados. Exportable a PDF o TXT.</p></header>' +
      '<div class="report-blocks report-blocks-grid">';

    var opsItems = '<li class="muted">Sin datos importados</li>';
    var opsModel = OPS && OPS.buildModel ? OPS.buildModel(operaciones) : null;
    if (opsModel) {
      var ko = opsModel.kpis;
      opsItems = '<li>Archivo: <strong>' + esc(opsModel.fileName || operaciones.fileName) + '</strong></li>' +
        '<li>Abiertos: <strong>' + ko.abiertos + '</strong></li>' +
        '<li>En proceso: <strong>' + ko.enProceso + '</strong></li>' +
        '<li>Total a trabajar: <strong>' + ko.totalTrabajar + '</strong></li>';
    } else if (operaciones && operaciones.bd) {
      var koL = global.PlatformExcel.buildKpis(operaciones);
      opsItems = '<li>Archivo: <strong>' + esc(operaciones.fileName) + '</strong></li>' +
        '<li>Abiertos: <strong>' + koL.abiertos + '</strong></li>' +
        '<li>En proceso: <strong>' + koL.enProceso + '</strong></li>';
    }
    html += reportBlock('Operación', 'ops', opsItems);

    var facItems = '<li class="muted">Sin datos importados</li>';
    if (FX && facturas && FX.isFacturasData(facturas) && facturas.registros.length) {
      var tc = FX.resolveTipoCambio(tipoCambio);
      var kf = FX.buildKpis(facturas, tc);
      facItems = '<li>Archivo: <strong>' + esc(facturas.fileName) + '</strong></li>' +
        '<li>Ventas RD$: <strong>' + esc(FX.formatMillions(kf.ventasPesos)) + '</strong></li>' +
        '<li>Órdenes: <strong>' + kf.ordenes + '</strong></li>' +
        '<li>Almacenes: <strong>' + kf.almacenes + '</strong> · Tasa: <strong>' + tc + '</strong></li>';
    }
    html += reportBlock('Facturas', 'fac', facItems);

    var prodItems = '<li class="muted">Sin datos importados</li>';
    if (productividad && productividad.empleados) {
      var kp = global.PlatformExcelProductivity.buildKpis(productividad);
      prodItems = '<li>Archivo: <strong>' + esc(productividad.fileName) + '</strong></li>' +
        '<li>Trabajo total: <strong>' + kp.totalTrabajo + '</strong></li>' +
        '<li>Empleados activos: <strong>' + kp.empleadosActivos + '</strong></li>';
      if (productividad.empleados[0]) {
        prodItems += '<li>Líder: <strong>' + esc(productividad.empleados[0].nombre) + '</strong></li>';
      }
    }
    html += reportBlock('Productividad', 'prod', prodItems);

    var avSnap = loadAveriasSnapshot();
    var avItems = '<li class="muted">Sin reportes de piso sincronizados</li>';
    if (avSnap) {
      var avPending = countAveriasPending(avSnap);
      var avTotal = (avSnap.incidences || []).length + (avSnap.damages || []).length +
        (avSnap.securityIncidents || []).length + (avSnap.audits5s || []).length +
        (avSnap.equipmentInspections || []).length;
      avItems = '<li>Actualizado: <strong>' + esc(avSnap.updatedAt || '—') + '</strong></li>' +
        '<li>Reportes totales: <strong>' + avTotal + '</strong></li>' +
        '<li>Pendientes de corrección: <strong>' + avPending + '</strong></li>' +
        '<li>Paletas: <strong>' + (avSnap.incidences || []).length + '</strong> · Averías: <strong>' +
        (avSnap.damages || []).length + '</strong> · Seguridad: <strong>' +
        (avSnap.securityIncidents || []).length + '</strong></li>';
    }
    html += reportBlock('Operaciones de piso', 'ops', avItems);

    html += '</div><div class="export-actions" data-perm="export.data">' +
      '<button type="button" class="btn btn-primary" id="btnReportExportPdf">Exportar reporte PDF</button>' +
      '<button type="button" class="btn" id="btnReportExportTxt">Exportar resumen TXT</button>' +
      '</div></div>';
    host.innerHTML = html;
  }

  global.PlatformModules = {
    PROD_VIEWS: PROD_VIEWS,
    renderGeneral: renderGeneral,
    renderProductividad: renderProductividad,
    renderReportes: renderReportes,
    emptyModuleHtml: emptyModuleHtml
  };
})(typeof window !== 'undefined' ? window : this);
