/**
 * Modo TV — Dashboard general, rotación Operación → Facturas → Despacho
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var TV_SLIDES = ['ops', 'fac'];

  function resolveTvSlides(opts) {
    if (opts && opts.slides && opts.slides.length) return opts.slides.slice();
    if (global.PlatformLayout && global.PlatformLayout.getTvSlideIds) {
      var cfg = opts && opts.config ? opts.config : null;
      if (!cfg && global.PlatformStore && global.PlatformStore.getConfig) {
        cfg = global.PlatformStore.getConfig();
      }
      return global.PlatformLayout.getTvSlideIds(cfg || {});
    }
    return TV_SLIDES.slice();
  }

  function applyTvSlides(slides) {
    TV_SLIDES = slides && slides.length ? slides.slice() : ['ops'];
    if (tvSlideIndex >= TV_SLIDES.length) tvSlideIndex = 0;
  }
  var TV_ROTATE_MIN = 5;
  var TV_ROTATE_MAX = 60;
  var SLIDE_META = {
    ops: { pill: 'ops', title: 'Operación', emptyKpi: 'Sin datos de operación', emptyFoot: 'Importar Excel de operaciones', chartTitle: 'Tendencia' },
    fac: { pill: 'fac', title: 'Facturación · CENTRAL', emptyKpi: 'Sin datos de facturas', emptyFoot: 'Importar diario de facturas', chartTitle: 'Facturación diaria (RD$)' },
    desp: { pill: 'desp', title: 'Despacho · Seguimiento', emptyKpi: 'Sin IDC en seguimiento', emptyFoot: 'Registre IDC en Despacho → Validador', chartTitle: 'IDC en seguimiento validador' }
  };

  function tvSegLabels() {
    var labels = {};
    if (global.PlatformLayout && global.PlatformLayout.TV_SLIDE_CATALOG) {
      Object.keys(global.PlatformLayout.TV_SLIDE_CATALOG).forEach(function (id) {
        var item = global.PlatformLayout.TV_SLIDE_CATALOG[id];
        labels[id] = item.segLabel || item.label || id;
      });
    }
    Object.keys(SLIDE_META).forEach(function (id) {
      if (!labels[id]) labels[id] = SLIDE_META[id].title;
    });
    return labels;
  }

  var KPI_ICONS = {
    open: '○',
    process: '◐',
    total: '◎',
    money: '◆',
    warn: '!',
    alert: '⚠',
    time: '⏱',
    default: '●'
  };

  var chartInstances = {};
  var tvTimer = null;
  var tvSlideIndex = 0;
  var tvCarouselSeconds = 8;
  var tvCarouselRunning = false;
  var carouselHost = null;

  function fmtNum(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(Math.round(v));
  }

  function fmtMontoRd(n) {
    var FX = global.PlatformExcelFacturas;
    if (FX && FX.formatMillions) return FX.formatMillions(n) + ' RD$';
    return fmtNum(n) + ' RD$';
  }

  function fmtMontoAxis(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
    return String(Math.round(v));
  }

  function resolveFacturasPorAlmacen(facData, FX) {
    if (!facData || !FX) return [];
    if (facData.aggregates && facData.aggregates.porAlmacen && facData.aggregates.porAlmacen.length) {
      return facData.aggregates.porAlmacen;
    }
    if (facData.registros && facData.registros.length) {
      return FX.buildAggregates(facData.registros).porAlmacen || [];
    }
    return [];
  }

  function pctLogradoDisplay(c) {
    var pct = c.pctVentas != null ? c.pctVentas : c.pctOrdenes;
    if (pct == null || !isFinite(pct)) return null;
    return Math.round(pct) + '%';
  }

  function facFmtPct(pct) {
    if (pct == null || !isFinite(pct)) return '—';
    return Math.round(pct) + '%';
  }

  function facSemaforoLabel(s) {
    if (s === 'ok') return 'Cumple';
    if (s === 'warn') return 'En riesgo';
    if (s === 'danger') return 'Bajo meta';
    return '—';
  }

  function facSemaforoClass(s) {
    return s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : s === 'danger' ? 'danger' : 'neutral';
  }

  function attachFacAlmacenCompliance(snapFac, facData, facturasMetas, tipoCambio) {
    var FX = global.PlatformExcelFacturas;
    if (!FX || !snapFac || !facData) return;
    var tc = FX.resolveTipoCambio(tipoCambio);
    var porRaw = [];
    if (facData.aggregates && facData.aggregates.porAlmacen && facData.aggregates.porAlmacen.length) {
      porRaw = facData.aggregates.porAlmacen;
    } else {
      var regs = Array.isArray(facData.registros) ? facData.registros : [];
      if (!regs.length) return;
      porRaw = FX.buildAggregates(regs).porAlmacen || [];
    }
    if (!porRaw.length) return;
    var compliance = [];
    try {
      compliance = FX.buildMetasCompliance(porRaw, facturasMetas || {}, tc);
    } catch (eMeta) {
      compliance = [];
    }
    var view = FX.enrichAggregatesForDisplay(
      facData.aggregates || { porAlmacen: porRaw, totales: {} },
      tc
    );
    snapFac.porAlmacen = view.porAlmacen || porRaw;
    snapFac.compliance = compliance;
  }

  function facComplianceStatusSection(block) {
    if (!block || !block.hasData) return '';
    return '<aside class="tv-fac-split-status tv-slide-status tv-slide-status--fac" aria-label="Estatus almacén">' +
      '<h3 class="tv-foot-title">Estatus almacén · real vs meta</h3>' +
      facComplianceStatusHtml(block.compliance) + '</aside>';
  }

  function facWrapChartWithStatus(chartBlock, slideId, block) {
    if (slideId !== 'fac' || !facShowsAlmacenStatus(block)) return chartBlock;
    return '<div class="tv-fac-split">' +
      '<div class="tv-fac-split-chart">' + chartBlock + '</div>' +
      facComplianceStatusSection(block) +
      '</div>';
  }

  function facShowsAlmacenStatus(block) {
    return !!(block && block.hasData);
  }

  function facComplianceStatusHtml(compliance) {
    compliance = compliance || [];
    if (!compliance.length) {
      return '<p class="tv-fac-status-empty">Sin datos por almacén. Importe el diario de facturas y configure metas en el módulo Facturas.</p>';
    }
    return '<div class="tv-fac-status-wrap"><table class="tv-fac-status-table" aria-label="Estatus almacén vs meta">' +
      '<thead><tr><th>Almacén</th><th>Ventas RD$</th><th>% meta</th><th>Estado</th></tr></thead><tbody>' +
      compliance.map(function (c) {
        var cls = facSemaforoClass(c.semaforoGeneral);
        var pct = c.pctVentas != null ? c.pctVentas : c.pctOrdenes;
        return '<tr class="tv-fac-status-row tv-fac-status-row--' + esc(cls) + '">' +
          '<td><strong>' + esc(c.almacen) + '</strong></td>' +
          '<td>' + esc(fmtMontoRd(c.ventasPesos)) + '</td>' +
          '<td class="num">' + esc(facFmtPct(pct)) + '</td>' +
          '<td><span class="tv-fac-sem tv-fac-sem--' + esc(cls) + '">' +
          esc(facSemaforoLabel(c.semaforoGeneral)) + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function facComplianceFootSection(block) {
    return facComplianceStatusSection(block);
  }

  function hasFacCompliance(block) {
    return !!(block && block.compliance && block.compliance.length);
  }

  function appendDespToSnapshot(snap) {
    if (!snap) return snap;
    snap.desp = snap.desp || {
      hasData: false, kpis: [], footer: [], rows: [],
      chart: { labels: [], values: [] }, total: 0
    };
    var DS = global.PlatformDespachoStore;
    var despData = DS ? DS.load() : (global.PlatformStore && global.PlatformStore.getPublishedData
      ? global.PlatformStore.getPublishedData('despacho')
      : null);
    if (!DS || !despData || !Array.isArray(despData.pedidos)) return snap;
    var despCounts = DS.countResumenValidador(despData.pedidos);
    var despPedidos = DS.getPedidosVisiblesValidador(despData.pedidos);
    snap.desp.hasData = true;
    snap.desp.total = despCounts.total || 0;
    snap.desp.kpis = [
      { label: 'Pend. por validar', value: despCounts.pendiente_carga || 0, variant: 'warn' },
      { label: 'Validado', value: despCounts.en_validacion || 0, variant: 'process' },
      { label: 'Cargado', value: despCounts.listo_despacho || 0, variant: 'total' }
    ];
    snap.desp.chart.labels = ['Pend. carga', 'Validado', 'Cargado'];
    snap.desp.chart.values = [
      despCounts.pendiente_carga || 0,
      despCounts.en_validacion || 0,
      despCounts.listo_despacho || 0
    ];
    snap.desp.rows = despPedidos.slice(0, 14).map(function (p) {
      var e = DS.ESTADOS[p.estado] || {};
      return {
        idc: DS.formatIdc(p.idc),
        cliente: p.cliente ? String(p.cliente).trim() : '—',
        jaula: p.jaula || '—',
        estado: e.short || p.estado || '—',
        estadoId: p.estado || '',
        color: e.color || 'neutral',
        when: p.createdAt || p.updatedAt || ''
      };
    });
    snap.desp.footer = [];
    if (despCounts.total) {
      snap.desp.footer.push({ label: 'Total en seguimiento validador', value: despCounts.total });
    }
    var cargados = despPedidos.filter(function (p) { return p.estado === 'listo_despacho'; });
    cargados.slice(0, 4).forEach(function (p) {
      snap.desp.footer.push({
        label: 'Listo despacho · ' + DS.formatIdc(p.idc),
        value: 'Jaula ' + (p.jaula || '—')
      });
    });
    return snap;
  }

  function fmtDespDt(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Santo_Domingo'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function despEstadoBadge(row) {
    var cls = 'tv-desp-estado tv-desp-estado--' + esc(row.color || 'neutral');
    return '<span class="' + cls + '">' + esc(row.estado || '—') + '</span>';
  }

  function despLiveTableHtml(block) {
    var rows = block.rows || [];
    if (!rows.length) {
      return '<p class="tv-desp-empty">Sin IDC en seguimiento validador. Registre pedidos en el módulo Despacho.</p>';
    }
    return '<table class="tv-desp-table" aria-label="Seguimiento despacho en vivo">' +
      '<thead><tr><th>IDC</th><th>Cliente</th><th>Jaula</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' +
          '<td class="tv-desp-idc">' + esc(r.idc) + '</td>' +
          '<td>' + esc(r.cliente) + '</td>' +
          '<td>' + esc(r.jaula) + '</td>' +
          '<td>' + despEstadoBadge(r) + '</td>' +
          '<td class="tv-desp-dt">' + esc(fmtDespDt(r.when)) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function despSlideChartBlock(block, meta) {
    var total = block.total != null ? block.total : (block.rows ? block.rows.length : 0);
    return '<div class="tv-desp-live">' +
      '<div class="tv-desp-live-head">' +
      '<h3 class="tv-chart-title">' + esc(meta.chartTitle) + '</h3>' +
      '<span class="tv-desp-live-count">' + esc(String(total)) + ' IDC activos</span></div>' +
      '<div class="tv-desp-table-wrap">' + despLiveTableHtml(block) + '</div></div>';
  }

  function facDataHasContent(data) {
    if (!data) return false;
    if (data.registros && data.registros.length) return true;
    return !!(data.aggregates && data.aggregates.porAlmacen && data.aggregates.porAlmacen.length);
  }

  function collectSnapshot(opsData, facData, tipoCambio, facturasMetas, config) {
    config = config || (global.PlatformStore && global.PlatformStore.getConfig && global.PlatformStore.getConfig()) || {};
    var siteTitle = (global.PlatformSite && global.PlatformSite.product) || 'Almacén Central 001';
    var facDataAll = facData;
    var SF = global.PlatformSiteFilter;
    if (SF) {
      var filtered = SF.applySiteFilter({ operaciones: opsData, facturas: facData, config: config });
      siteTitle = (filtered.site && filtered.site.title) || siteTitle;
      if (filtered.operaciones) opsData = filtered.operaciones;
      if (filtered.facturas) facData = filtered.facturas;
    }

    var snap = {
      siteTitle: siteTitle,
      ops: { hasData: false, kpis: [], footer: [], chart: { labels: [], values: [] } },
      fac: { hasData: false, kpis: [], footer: [], chart: { labels: [], values: [] }, tipoCambio: 58.5 },
      desp: { hasData: false, kpis: [], footer: [], chart: { labels: [], values: [] } }
    };

    var OPS = global.PlatformOpsDashboard;
    var FX = global.PlatformExcelFacturas;

    if (OPS && opsData) {
      var model = OPS.buildModel(opsData);
      if (model) {
        snap.ops.hasData = true;
        var k = model.kpis || {};
        snap.ops.kpis = [
          { label: 'Abiertos', value: k.abiertos != null ? k.abiertos : 0, variant: 'open' },
          { label: 'En proceso', value: k.enProceso != null ? k.enProceso : 0, variant: 'process' },
          { label: 'Total a trabajar', value: k.totalTrabajar != null ? k.totalTrabajar : 0, variant: 'total' }
        ];
        if (model.processAlerts && model.processAlerts.length) {
          snap.ops.footer.push({
            label: 'ALERTA 24H',
            value: model.processAlerts.length + ' vencido(s) · ' + (model.processAlerts[0].responsable || 'Responsable')
          });
        }
        (model.operaciones || []).slice(0, 4).forEach(function (op) {
          snap.ops.footer.push({ label: op.name, value: op.total });
        });
        var pf = (model.porFecha || []).slice(-7);
        snap.ops.chart.labels = pf.map(function (x) {
          var d = x.fecha || x.label || '';
          return d.length >= 10 ? d.slice(5).replace('-', '/') : d;
        });
        snap.ops.chart.values = pf.map(function (x) {
          return (x.abiertos || 0) + (x.enProceso || 0) + (x.total || 0);
        });
        if (!snap.ops.chart.labels.length) {
          snap.ops.chart.labels = ['Abiertos', 'En proceso', 'Total'];
          snap.ops.chart.values = [k.abiertos || 0, k.enProceso || 0, k.totalTrabajar || 0];
        }
      }
    }

    var facOk = FX && facDataAll && facDataHasContent(facDataAll) &&
      (FX.isFacturasData(facDataAll) || facDataAll.format === 'facturas' || facDataAll.module === 'facturas');

    if (facOk) {
      try {
        var tcAll = FX.resolveTipoCambio(tipoCambio);
        attachFacAlmacenCompliance(snap.fac, facDataAll, facturasMetas, tcAll);

        var CC = global.PlatformCommandCenter;
        if (CC && SF) {
          var ccModel = CC.buildModel({
            facturas: facDataAll,
            operaciones: null,
            tipoCambio: tipoCambio,
            config: config
          });
          if (ccModel && ccModel.hasFacturas && ccModel.facturacion) {
            var fm = ccModel.facturacion;
            var ser = fm.series || {};
            snap.fac.hasData = true;
            snap.fac.useAlmacenLayout = false;
            snap.fac.centralLayout = true;
            snap.fac.useExecutiveLayout = true;
            snap.fac.tipoCambio = fm.tipoCambio;
            var varPct = fm.variationPct;
            var varStr = varPct != null && isFinite(varPct)
              ? (varPct >= 0 ? '+' : '') + Math.round(varPct) + '%'
              : '—';
            snap.fac.kpis = [
              { label: 'Total facturado', value: fmtMontoRd(fm.total), variant: 'money' },
              { label: 'Día actual', value: fmtMontoRd(fm.daily), variant: 'money' },
              { label: 'Variación vs ayer', value: varStr, variant: varPct != null && varPct < 0 ? 'warn' : 'total' }
            ];
            snap.fac.chartTitle = 'Facturación diaria · ' + siteTitle;
            snap.fac.chartMode = 'daily';
            snap.fac.chart.labels = ser.labels || [];
            snap.fac.chart.values = ser.values || [];
            snap.fac.chart.markers = ser.markers || [];
            snap.fac.footer = [
              { label: 'Día pico', value: (fm.peakDay || '—') + ' · ' + fmtMontoRd(fm.peakValue) },
              { label: 'Acumulado', value: fmtMontoRd(fm.acumulada != null ? fm.acumulada : fm.total) },
              { label: 'Tipo de cambio', value: 'TC ' + fm.tipoCambio }
            ];
            attachFacAlmacenCompliance(snap.fac, facDataAll, facturasMetas, fm.tipoCambio);
            return appendDespToSnapshot(snap);
          }
        }

        snap.fac.hasData = true;
        snap.fac.useAlmacenLayout = true;
        snap.fac.useExecutiveLayout = true;
        snap.fac.centralLayout = false;
        var tc = tcAll;
        snap.fac.tipoCambio = tc;
        var facKpis = FX.buildKpis(facDataAll, tc);
        snap.fac.execKpis = [
          { label: 'Ventas totales', value: FX.formatMoney(facKpis.ventasPesos, 'DOP'), variant: 'dop' },
          { label: 'Órdenes de venta', value: String(facKpis.ordenes), variant: 'orders' },
          { label: 'Facturas', value: String(facKpis.facturas), variant: 'inv' },
          { label: 'Almacenes', value: String(facKpis.almacenes), variant: 'wh' }
        ];
        var agg = facDataAll.aggregates && facDataAll.aggregates.porAlmacen
          ? facDataAll.aggregates
          : FX.buildAggregates(facDataAll.registros || []);
        var view = FX.enrichAggregatesForDisplay(agg, tc);
        var porAlm = view.porAlmacen || [];
        snap.fac.porAlmacen = porAlm;
        attachFacAlmacenCompliance(snap.fac, facDataAll, facturasMetas, tc);
        var compliance = snap.fac.compliance || [];
        var compByAlm = {};
        compliance.forEach(function (c) {
          compByAlm[c.almacen] = c;
        });

        snap.fac.almacenes = porAlm.map(function (a) {
          var c = compByAlm[a.almacen] || {};
          var pctStr = pctLogradoDisplay(c);
          var factCount = a.facturas != null ? a.facturas : (c.facturas != null ? c.facturas : 0);
          var subParts = [a.ordenes + ' órdenes', factCount + ' fact.'];
          if (pctStr) subParts.push(pctStr + ' de meta');
          return {
            almacen: a.almacen,
            ventasPesos: a.ventasPesos,
            ordenes: a.ordenes,
            facturas: factCount,
            semaforo: c.semaforoGeneral || 'neutral',
            valueDisplay: fmtMontoRd(a.ventasPesos),
            valueSuffix: '',
            subLabel: subParts.join(' · ')
          };
        }).sort(function (a, b) {
          return (b.ventasPesos || 0) - (a.ventasPesos || 0);
        });

        snap.fac.kpis = [];
        snap.fac.chartMode = 'money';
        snap.fac.chartTitle = 'Monto por almacén (RD$)';
        snap.fac.footer = snap.fac.almacenes.slice(0, 6).map(function (a) {
          return { label: a.almacen, value: fmtMontoRd(a.ventasPesos) };
        });
        snap.fac.chart.labels = snap.fac.almacenes.slice(0, 8).map(function (a) { return a.almacen; });
        snap.fac.chart.values = snap.fac.almacenes.slice(0, 8).map(function (a) { return a.ventasPesos; });
      } catch (errFac) {
        snap.fac.hasData = false;
        snap.fac.useAlmacenLayout = true;
        snap.fac.almacenes = [];
        if (global.console && console.warn) {
          console.warn('TV Facturas snapshot:', errFac);
        }
      }
    }

    return appendDespToSnapshot(snap);
  }

  function formatKpiDisplay(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'number' && !isNaN(value)) return fmtNum(value);
    var s = String(value);
    if (/^[\d.,]+$/.test(s.replace(/\s/g, ''))) {
      var n = parseFloat(s.replace(/,/g, ''));
      if (!isNaN(n) && n >= 1000) return fmtNum(n);
    }
    return s;
  }

  function kpiHtml(items, emptyLabel) {
    if (!items.length) {
      return '<div class="tv-kpi-empty">' + esc(emptyLabel) + '</div>';
    }
    return '<div class="tv-kpi-trio">' + items.map(function (k) {
      var variant = k.variant || 'default';
      var icon = KPI_ICONS[variant] || KPI_ICONS.default;
      return '<article class="tv-kpi-card tv-kpi-' + esc(variant) + '" role="group" aria-label="' + esc(k.label) + '">' +
        '<span class="tv-kpi-icon" aria-hidden="true">' + icon + '</span>' +
        '<div class="tv-kpi-body">' +
        '<span class="tv-kpi-val" title="' + esc(String(k.value)) + '">' + esc(formatKpiDisplay(k.value)) + '</span>' +
        '<span class="tv-kpi-lbl">' + esc(k.label) + '</span>' +
        '</div></article>';
    }).join('') + '</div>';
  }

  function facAlmacenKpiHtml(almacenes, emptyLabel) {
    if (!almacenes || !almacenes.length) {
      return '<div class="tv-kpi-empty">' + esc(emptyLabel) + '</div>';
    }
    return '<div class="tv-almacen-grid">' + almacenes.map(function (a) {
      var sem = a.semaforo && a.semaforo !== 'neutral' ? a.semaforo : 'neutral';
      return '<div class="tv-kpi tv-kpi-wh tv-kpi-' + esc(sem) + '">' +
        '<span class="tv-kpi-val">' + esc(String(a.valueDisplay)) +
        (a.valueSuffix ? '<span class="tv-kpi-suffix">' + esc(a.valueSuffix) + '</span>' : '') +
        '</span>' +
        '<span class="tv-kpi-lbl">' + esc(a.almacen) + '</span>' +
        '<span class="tv-kpi-sub">' + esc(a.subLabel) + '</span></div>';
    }).join('') + '</div>';
  }

  function footerHtml(items, emptyText) {
    if (!items.length) {
      return '<p class="tv-foot-empty">' + esc(emptyText) + '</p>';
    }
    return '<ul class="tv-foot-list">' + items.map(function (x) {
      return '<li><span>' + esc(x.label) + '</span><strong>' + esc(String(x.value)) + '</strong></li>';
    }).join('') + '</ul>';
  }

  function facUsesExecutiveLayout(block) {
    return !!(block && block.hasData && (block.centralLayout || block.useExecutiveLayout));
  }

  function facExecKpiHtml(items, emptyLabel) {
    if (!items || !items.length) {
      return '<div class="tv-kpi-empty">' + esc(emptyLabel) + '</div>';
    }
    return '<div class="fac-kpi-row tv-fac-exec-kpis">' + items.map(function (k) {
      var variant = k.variant || 'default';
      var facVariant = variant === 'warn' ? 'warn' : variant === 'money' || variant === 'total' ? 'dop' : variant;
      return '<article class="fac-kpi fac-kpi-' + esc(facVariant) + '">' +
        '<span class="fac-kpi-value" title="' + esc(String(k.value)) + '">' + esc(formatKpiDisplay(k.value)) + '</span>' +
        '<span class="fac-kpi-label">' + esc(k.label) + '</span>' +
        '</article>';
    }).join('') + '</div>';
  }

  function facExecutiveChartBlock(slideId, block, chartTitle) {
    var EC = global.PlatformExecutiveCharts;
    var canvasId = chartCanvasId(slideId);
    if (!EC) {
      return '<h3 class="tv-chart-title">' + esc(chartTitle) + '</h3>' +
        '<div class="tv-chart-box"><canvas id="' + canvasId + '"></canvas></div>';
    }
    var shell = '';
    if (block.centralLayout) {
      shell = EC.executiveShell({
        eyebrow: 'Facturación · CENTRAL',
        title: chartTitle,
        subtitle: 'Serie diaria · montos en RD$',
        canvasId: canvasId,
        insights: (block.footer || []).map(function (x) {
          return esc(x.label) + ': <strong>' + esc(String(x.value)) + '</strong>';
        })
      });
    } else if (block.porAlmacen && block.porAlmacen.length) {
      var meta = EC.getFacturasMeta('ventas', block.porAlmacen, block.compliance || []);
      meta.canvasId = canvasId;
      shell = (EC.facturasTabsHtml ? EC.facturasTabsHtml() : '') +
        (EC.facturasVisualShell
          ? EC.facturasVisualShell(meta, block.porAlmacen, block.compliance || [])
          : EC.executiveShell(meta));
    } else {
      shell = EC.executiveShell({
        eyebrow: 'Facturación',
        title: chartTitle,
        canvasId: canvasId
      });
    }
    return '<section class="fac-panel fac-charts-single fac-charts-premium exec-chart-view tv-fac-exec">' + shell + '</section>';
  }

  function slideFootBody(slideId, block, meta) {
    return footerHtml(block.footer, meta.emptyFoot);
  }

  function chartCanvasId(slideId) {
    return 'tvChart' + slideId.charAt(0).toUpperCase() + slideId.slice(1);
  }

  function paintFacExecutiveChart(snapshot, slideId, viewId) {
    var block = snapshot[slideId];
    if (!block || !facUsesExecutiveLayout(block)) return;
    var EC = global.PlatformExecutiveCharts;
    if (!EC) return;
    var id = chartCanvasId(slideId);
    var meta;
    if (block.centralLayout) {
      meta = EC.facturasCentralDailyMeta
        ? EC.facturasCentralDailyMeta(
          block.chart.labels || [],
          block.chart.values || [],
          block.chart.markers || [],
          {
            title: block.chartTitle || 'Facturación diaria',
            canvasId: id,
            insights: (block.footer || []).map(function (x) {
              return esc(x.label) + ': <strong>' + esc(String(x.value)) + '</strong>';
            })
          }
        )
        : null;
    } else {
      meta = EC.getFacturasMeta(viewId || block._facChartView || 'ventas', block.porAlmacen || [], block.compliance || []);
      meta.canvasId = id;
      var slideEl = document.querySelector('.tv-slide[data-slide="' + slideId + '"]');
      var signalsEl = slideEl && slideEl.querySelector('.fac-vis-signals');
      if (signalsEl && EC.facturasVisualSignals) {
        signalsEl.outerHTML = EC.facturasVisualSignals(
          block.porAlmacen || [],
          block.compliance || [],
          viewId || block._facChartView || 'ventas'
        );
      }
    }
    if (!meta) return;
    EC.renderFromMeta(chartInstances, meta, {
      tvMode: true,
      facVisual: !block.centralLayout,
      noDataLabels: true,
      biChart: true,
      valueFormat: 'money'
    });
  }

  function bindFacExecutiveTabs(root, snapshot) {
    if (!root || !snapshot || !snapshot.fac) return;
    var block = snapshot.fac;
    if (!facUsesExecutiveLayout(block) || block.centralLayout) return;
    var chartHost = root.querySelector('.tv-slide[data-slide="fac"] .tv-fac-exec');
    if (!chartHost) return;
    chartHost.querySelectorAll('.exec-chart-tab').forEach(function (btn) {
      if (btn.dataset.tvFacTabBound === '1') return;
      btn.dataset.tvFacTabBound = '1';
      btn.addEventListener('click', function () {
        chartHost.querySelectorAll('.exec-chart-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        block._facChartView = btn.getAttribute('data-fac-chart') || 'ventas';
        paintFacExecutiveChart(snapshot, 'fac', block._facChartView);
      });
    });
  }

  function facKpiBlock(slideId, block, emptyLabel) {
    if (slideId === 'fac' && facUsesExecutiveLayout(block)) {
      var items = block.centralLayout ? (block.kpis || []) : (block.execKpis || []);
      return facExecKpiHtml(items, emptyLabel);
    }
    if (slideId === 'fac') {
      return facAlmacenKpiHtml(block.almacenes || [], emptyLabel);
    }
    return kpiHtml(block.kpis || [], emptyLabel);
  }

  function renderSlide(slideId, snapshot) {
    var meta = SLIDE_META[slideId];
    var block = snapshot[slideId];
    var facExec = slideId === 'fac' && facUsesExecutiveLayout(block);
    var facExtra = slideId === 'fac' && block.centralLayout ? ' tv-slide--central' : '';
    if (facExec) facExtra += ' tv-slide--fac-exec';
    var extra = slideId === 'fac' && block.hasData
      ? '<span class="tv-tc-tag">TC ' + esc(String(block.tipoCambio)) + '</span>'
      : '';
    var kpiBlock = facKpiBlock(slideId, block, meta.emptyKpi);
    var chartTitle = (slideId === 'fac' && block.chartTitle) ? block.chartTitle : meta.chartTitle;
    var footTitle = slideId === 'fac' && block.useAlmacenLayout && !block.centralLayout
      ? 'Montos por almacén'
      : 'Resumen';
    var chartBlock = facExec
      ? facExecutiveChartBlock(slideId, block, chartTitle)
      : (slideId === 'desp'
        ? despSlideChartBlock(block, meta)
        : '<h3 class="tv-chart-title">' + esc(chartTitle) + '</h3>' +
          '<div class="tv-chart-box"><canvas id="' + chartCanvasId(slideId) + '"></canvas></div>');
    var facSplit = slideId === 'fac' && facShowsAlmacenStatus(block);
    if (facSplit) {
      chartBlock = facWrapChartWithStatus(chartBlock, slideId, block);
    }
    var footSection = '';
    if (slideId === 'fac') {
      if (!facSplit && !facExec) {
        footSection = '<div class="tv-slide-foot">' +
          '<h3 class="tv-foot-title">' + esc(footTitle) + '</h3>' + slideFootBody(slideId, block, meta) +
          '</div>';
      }
    } else if (slideId === 'desp' && block.footer && block.footer.length) {
      footSection = '<div class="tv-slide-foot tv-slide-foot--desp">' +
        '<h3 class="tv-foot-title">Resumen despacho</h3>' + slideFootBody(slideId, block, meta) +
        '</div>';
    } else if (slideId !== 'desp') {
      footSection = '<div class="tv-slide-foot">' +
        '<h3 class="tv-foot-title">' + esc(footTitle) + '</h3>' + slideFootBody(slideId, block, meta) +
        '</div>';
    }
    var slideClass = '';
    if (slideId === 'fac') {
      slideClass = ' tv-slide--fac' + facExtra;
      if (facSplit) slideClass += ' tv-slide--fac-split tv-slide--fac-status';
    } else if (slideId === 'desp') slideClass = ' tv-slide--desp';
    return '<section class="tv-slide' + slideClass + '" data-slide="' + slideId + '">' +
      '<header class="tv-slide-head">' +
      '<span class="tv-pill ' + meta.pill + '">' + esc(meta.title) + '</span>' + extra +
      '</header>' +
      '<div class="tv-slide-grid' + (slideId === 'desp' ? ' tv-slide-grid--desp' : '') + '">' +
      '<div class="tv-slide-kpis">' + kpiBlock + '</div>' +
      '<div class="tv-slide-chart">' + chartBlock + '</div>' +
      footSection +
      '</div></section>';
  }

  function render(host, snapshot, clockText, opts) {
    if (!host) return;
    carouselHost = host;
    opts = opts || {};
    applyTvSlides(resolveTvSlides(opts));
    snapshot = snapshot || collectSnapshot(null, null, null, 58.5);

    var subLabel = global.PlatformLayout && global.PlatformLayout.getTvSlideLabels
      ? global.PlatformLayout.getTvSlideLabels(opts.config || (global.PlatformStore && global.PlatformStore.getConfig && global.PlatformStore.getConfig()) || {})
      : 'Operación → Facturas → Despacho';

    var wallTitle = (snapshot.siteTitle || 'Almacén Central 001') + ' · TV';
    var segLabels = tvSegLabels();

    var slidesHtml = TV_SLIDES.map(function (id) {
      return renderSlide(id, snapshot);
    }).join('');

    var segsHtml = TV_SLIDES.map(function (id, i) {
      return '<button type="button" class="tv-seg' + (i === 0 ? ' active' : '') + '" data-slide="' + id + '"' +
        ' aria-label="' + esc(segLabels[id] || id) + '">' +
        '<span class="tv-seg-label">' + esc(segLabels[id] || id) + '</span>' +
        '<span class="tv-seg-track"><i class="tv-seg-fill"></i></span></button>';
    }).join('');

    var preserve = opts && typeof opts.preserveSlideIndex === 'number'
      ? Math.max(0, Math.min(TV_SLIDES.length - 1, opts.preserveSlideIndex))
      : 0;

    host.innerHTML =
      '<div class="tv-wall tv-carousel" id="tvCarousel">' +
      '<header class="tv-wall-brand">' +
      '<div><h1 class="tv-wall-title">' + esc(wallTitle) + '</h1>' +
      '<p class="tv-wall-sub">' + esc(subLabel) + ' · <span class="tv-esc-hint">Esc para salir</span></p></div>' +
      '<time class="tv-wall-clock" id="tvWallClock">' + esc(clockText || '') + '</time>' +
      '</header>' +
      '<div class="tv-slides-viewport">' + slidesHtml + '</div>' +
      '<footer class="tv-carousel-foot">' +
      '<p class="tv-slide-now tv-slide-now--ops" id="tvSlideNow">Operación</p>' +
      '<div class="tv-progress" id="tvProgress" role="tablist">' + segsHtml + '</div>' +
      '<p class="tv-rotate-hint" id="tvRotateHint">' + esc(rotateHintText()) + '</p>' +
      '</footer></div>';

    tvSlideIndex = preserve;
    var carouselRoot = host.querySelector('#tvCarousel') || host;
    setSlide(preserve, false);
    bindTvProgress(carouselRoot);
    bindFacExecutiveTabs(carouselRoot, snapshot);
    return snapshot;
  }

  function rotateHintText() {
    if (TV_SLIDES.length <= 1) return 'Una sola diapositiva activa · sin rotación';
    return 'Rotación cada ' + (tvCarouselSeconds || 8) + ' s · teclas 1–' + TV_SLIDES.length + ' · ← →';
  }

  function updateRotateHint() {
    var el = document.getElementById('tvRotateHint');
    if (el) el.textContent = rotateHintText();
  }

  function slideFootInner(slideId, block, meta) {
    var footTitle = slideId === 'fac' && block.useAlmacenLayout && !block.centralLayout
      ? 'Montos por almacén'
      : 'Resumen';
    return '<h3 class="tv-foot-title">' + esc(footTitle) + '</h3>' + slideFootBody(slideId, block, meta);
  }

  function updateSnapshot(host, snapshot) {
    if (!host || !snapshot) return false;
    var root = document.getElementById('tvCarousel') ||
      (host.querySelector && host.querySelector('#tvCarousel'));
    if (!root) return false;
    var ok = false;
    TV_SLIDES.forEach(function (slideId) {
      var block = snapshot[slideId];
      if (!block) return;
      var meta = SLIDE_META[slideId];
      var slideEl = root.querySelector('.tv-slide[data-slide="' + slideId + '"]');
      if (!slideEl) return;
      if (slideId === 'fac') {
        slideEl.classList.toggle('tv-slide--central', !!block.centralLayout);
        slideEl.classList.toggle('tv-slide--fac-exec', facUsesExecutiveLayout(block));
        slideEl.classList.toggle('tv-slide--fac-status', facShowsAlmacenStatus(block));
        slideEl.classList.toggle('tv-slide--fac-split', !!slideEl.querySelector('.tv-fac-split'));
      }
      var kpiHost = slideEl.querySelector('.tv-slide-kpis');
      if (kpiHost) {
        kpiHost.innerHTML = facKpiBlock(slideId, block, meta.emptyKpi);
        ok = true;
      }
      var statusHost = slideEl.querySelector('.tv-fac-split-status, .tv-slide-status--fac');
      if (statusHost) {
        statusHost.innerHTML = '<h3 class="tv-foot-title">Estatus almacén · real vs meta</h3>' +
          facComplianceStatusHtml(block.compliance);
        ok = true;
      } else {
        var footHost = slideEl.querySelector('.tv-slide-foot');
        if (footHost) {
          footHost.innerHTML = slideFootInner(slideId, block, meta);
        }
      }
      if (slideId === 'desp') {
        var despWrap = slideEl.querySelector('.tv-desp-table-wrap');
        if (despWrap) {
          despWrap.innerHTML = despLiveTableHtml(block);
          var despCount = slideEl.querySelector('.tv-desp-live-count');
          if (despCount) despCount.textContent = String(block.total != null ? block.total : (block.rows || []).length) + ' IDC activos';
          ok = true;
        }
      }
      var chartTitleEl = slideEl.querySelector('.tv-chart-title, .exec-chart-title');
      if (chartTitleEl) {
        chartTitleEl.textContent = (slideId === 'fac' && block.chartTitle)
          ? block.chartTitle
          : meta.chartTitle;
      }
    });
    return ok;
  }

  function bindTvProgress(root) {
    if (!root) return;
    root.querySelectorAll('.tv-seg, .tv-dot').forEach(function (btn) {
      if (btn.dataset.tvDotBound === '1') return;
      btn.dataset.tvDotBound = '1';
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-slide');
        var idx = TV_SLIDES.indexOf(id);
        if (idx >= 0) {
          setSlide(idx, true);
        }
      });
    });
  }

  function updateProgressAnimation(slideId) {
    var root = document.getElementById('tvCarousel');
    if (!root) return;
    var sec = tvCarouselSeconds || 8;
    var canAnimate = TV_SLIDES.length > 1 && tvCarouselRunning;
    root.querySelectorAll('.tv-seg').forEach(function (seg) {
      var on = seg.getAttribute('data-slide') === slideId;
      seg.classList.toggle('active', on);
      var fill = seg.querySelector('.tv-seg-fill');
      if (!fill) return;
      fill.style.animation = 'none';
      fill.style.width = on && !canAnimate ? '100%' : '0%';
      if (on && canAnimate) {
        void fill.offsetWidth;
        fill.style.animation = 'tvSegProgress ' + sec + 's linear forwards';
      }
    });
    root.querySelectorAll('.tv-dot').forEach(function (dot) {
      dot.classList.toggle('active', dot.getAttribute('data-slide') === slideId);
    });
  }

  function slideNowLabel(slideId) {
    var labels = tvSegLabels();
    return labels[slideId] || slideId;
  }

  function updateSlideNowLabel(slideId) {
    var el = document.getElementById('tvSlideNow');
    if (!el) return;
    el.textContent = slideNowLabel(slideId);
    el.className = 'tv-slide-now tv-slide-now--' + (slideId || 'ops');
  }

  function syncTvBodySlideClass(slideId) {
    if (!document.body.classList.contains('tv-unified-active')) return;
    document.body.classList.remove('tv-slide-ops', 'tv-slide-fac', 'tv-slide-desp');
    if (slideId === 'ops' || slideId === 'fac' || slideId === 'desp') {
      document.body.classList.add('tv-slide-' + slideId);
    }
  }

  function setSlide(index, dispatch, silent) {
    if (dispatch === undefined) dispatch = true;
    var root = document.getElementById('tvCarousel') ||
      (carouselHost && carouselHost.querySelector('#tvCarousel'));
    if (!root || !TV_SLIDES.length) return;
    var prevId = TV_SLIDES[tvSlideIndex];
    tvSlideIndex = ((index % TV_SLIDES.length) + TV_SLIDES.length) % TV_SLIDES.length;
    var slideId = TV_SLIDES[tvSlideIndex];
    var sameSlide = slideId === prevId;
    if (silent || sameSlide) {
      root.classList.add('tv-slide-instant');
    }
    root.querySelectorAll('.tv-slide').forEach(function (el) {
      var on = el.getAttribute('data-slide') === slideId;
      el.classList.toggle('active', on);
    });
    root.querySelectorAll('.tv-seg').forEach(function (seg) {
      seg.classList.toggle('active', seg.getAttribute('data-slide') === slideId);
    });
    root.querySelectorAll('.tv-dot').forEach(function (dot) {
      dot.classList.toggle('active', dot.getAttribute('data-slide') === slideId);
    });
    if (!silent) {
      updateProgressAnimation(slideId);
    }
    var viewport = root.querySelector('.tv-slides-viewport');
    if (viewport) {
      viewport.style.transform = '';
      viewport.classList.remove('is-dragging', 'is-snap-back', 'gesture-swipe-track');
    }
    syncTvBodySlideClass(slideId);
    updateSlideNowLabel(slideId);
    if (silent || sameSlide) {
      requestAnimationFrame(function () {
        root.classList.remove('tv-slide-instant');
      });
    }
    if (dispatch) {
      global.dispatchEvent(new CustomEvent('tv-dashboard-slide', { detail: { slide: slideId, index: tvSlideIndex } }));
      if (tvCarouselRunning && TV_SLIDES.length > 1) {
        restartCarouselTimer();
      }
    }
  }

  function clearCarouselTimer() {
    if (tvTimer) {
      clearTimeout(tvTimer);
      tvTimer = null;
    }
  }

  function restartCarouselTimer() {
    clearCarouselTimer();
    if (!tvCarouselRunning || TV_SLIDES.length <= 1) return;
    tvTimer = setTimeout(function () {
      if (!tvCarouselRunning || TV_SLIDES.length <= 1) return;
      setSlide(tvSlideIndex + 1, true);
    }, tvCarouselSeconds * 1000);
  }

  function stopCarousel() {
    tvCarouselRunning = false;
    clearCarouselTimer();
  }

  function startCarousel(seconds) {
    stopCarousel();
    if (!document.body.classList.contains('tv-unified-active')) return;
    var sec = Number(seconds) || 8;
    tvCarouselSeconds = Math.max(TV_ROTATE_MIN, Math.min(TV_ROTATE_MAX, sec));
    updateRotateHint();
    if (TV_SLIDES.length <= 1) {
      updateProgressAnimation(TV_SLIDES[tvSlideIndex] || 'ops');
      return;
    }
    tvCarouselRunning = true;
    updateProgressAnimation(TV_SLIDES[tvSlideIndex]);
    restartCarouselTimer();
  }

  function getSlideIndex() {
    return tvSlideIndex;
  }

  function getSlideId() {
    return TV_SLIDES[tvSlideIndex] || 'ops';
  }

  function destroyCharts() {
    Object.keys(chartInstances).forEach(function (id) {
      if (chartInstances[id] && chartInstances[id].destroy) chartInstances[id].destroy();
    });
    chartInstances = {};
  }

  function makeChart(id, cfg) {
    if (typeof Chart === 'undefined') return;
    var el = document.getElementById(id);
    if (!el) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    cfg = cfg || {};
    var colors = { text: '#e8eef7', muted: '#94a3b8', grid: 'rgba(255,255,255,0.08)' };
    if (global.ChartPremiumStyle) {
      global.ChartPremiumStyle.register();
      try {
        if (cfg.data) {
          var chartExtra = {
            tvMode: true,
            indexAxis: cfg.options && cfg.options.indexAxis,
            chartType: cfg.type,
            valueFormat: cfg.valueFormat
          };
          cfg.data = global.ChartPremiumStyle.enhanceDatasets(
            JSON.parse(JSON.stringify(cfg.data)),
            cfg.type,
            colors,
            chartExtra
          );
        }
      } catch (e) { /* noop */ }
      cfg.options = cfg.options || {};
      global.ChartPremiumStyle.mergeOptions(cfg.options, colors, {
        tvMode: true,
        biChart: true,
        indexAxis: cfg.options.indexAxis,
        chartType: cfg.type,
        chartData: cfg.data,
        valueFormat: cfg.valueFormat
      });
    }
    chartInstances[id] = new Chart(el, cfg);
  }

  function renderChartsForSlide(snapshot, colors, slideId) {
    if (!snapshot || !slideId) return;
    colors = colors || { text: '#e8eef7', grid: 'rgba(255,255,255,0.08)' };
    var fs = 15;
    var block = snapshot[slideId];
    if (!block) return;
    if (slideId === 'fac') {
      if (facUsesExecutiveLayout(block)) {
        if (block.centralLayout) {
          if (!block.hasData || !block.chart.labels || !block.chart.labels.length) return;
        } else if (!block.porAlmacen || !block.porAlmacen.length) {
          return;
        }
      } else if (block.centralLayout) {
        if (!block.hasData || !block.chart.labels || !block.chart.labels.length) return;
      } else if (!block.almacenes || !block.almacenes.length) {
        return;
      }
    } else if (!block.hasData) {
      return;
    }

    if (slideId === 'fac' && facUsesExecutiveLayout(block)) {
      paintFacExecutiveChart(snapshot, slideId, block._facChartView || 'ventas');
      return;
    }

    if (slideId === 'fac' && !block.centralLayout && block.almacenes && block.almacenes.length) {
      block.chart.labels = block.almacenes.slice(0, 8).map(function (a) { return a.almacen; });
      block.chart.values = block.almacenes.slice(0, 8).map(function (a) { return a.ventasPesos; });
    }
    if (!block.chart.labels || !block.chart.labels.length) return;

    var id = chartCanvasId(slideId);

    var EC = global.PlatformExecutiveCharts;
    function barOpts() {
      var base = EC && EC.themeColors ? EC.themeColors() : colors;
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: slideId !== 'fac',
            position: 'top',
            labels: { color: base.text, font: { size: fs, weight: '600' }, boxWidth: 14 }
          },
          tooltip: {
            backgroundColor: 'rgba(8, 14, 24, 0.94)',
            titleFont: { size: fs + 1, weight: '700' },
            bodyFont: { size: fs },
            padding: 12
          }
        },
        scales: {
          x: { ticks: { color: base.text, font: { size: fs, weight: '600' }, maxRotation: 25 }, grid: { display: false } },
          y: { ticks: { color: base.text, font: { size: fs } }, grid: { color: base.grid || colors.grid }, beginAtZero: true }
        }
      };
    }

    if (slideId === 'ops') {
      makeChart(id, {
        type: block.chart.labels.length <= 3 ? 'bar' : 'line',
        data: {
          labels: block.chart.labels,
          datasets: [{
            label: 'Actividad',
            data: block.chart.values,
            backgroundColor: 'rgba(59, 130, 246, 0.75)',
            borderColor: '#3b82f6',
            borderWidth: 2,
            fill: block.chart.labels.length > 3,
            tension: 0.3
          }]
        },
        options: barOpts()
      });
    } else if (slideId === 'desp') {
      makeChart(id, {
        type: 'bar',
        data: {
          labels: block.chart.labels,
          datasets: [{
            label: 'IDC',
            data: block.chart.values,
            backgroundColor: [
              'rgba(255, 107, 122, 0.88)',
              'rgba(251, 191, 36, 0.9)',
              'rgba(52, 211, 153, 0.9)'
            ],
            borderRadius: 12,
            maxBarThickness: 72
          }]
        },
        options: barOpts()
      });
    } else if (slideId === 'fac') {
      var barColors = (block.almacenes || []).map(function (a) {
        if (a.semaforo === 'ok') return 'rgba(52, 211, 153, 0.9)';
        if (a.semaforo === 'warn') return 'rgba(251, 191, 36, 0.9)';
        if (a.semaforo === 'danger') return 'rgba(255, 107, 122, 0.88)';
        return 'rgba(16, 185, 129, 0.85)';
      });
      if (!barColors.length) {
        barColors = (block.chart.values || []).map(function () { return 'rgba(16, 185, 129, 0.85)'; });
      }
      var chartOpts = barOpts();
      chartOpts.indexAxis = 'y';
      chartOpts.layout = { padding: { top: 6, right: 72, bottom: 6, left: 8 } };
      chartOpts.plugins.tooltip = {
        backgroundColor: 'rgba(6, 11, 20, 0.97)',
        titleFont: { size: fs + 2, weight: '800' },
        bodyFont: { size: fs + 1, weight: '700' },
        padding: 14,
        callbacks: {
          label: function (ctx) {
            var v = ctx.raw || 0;
            return fmtMontoRd(v);
          }
        }
      };
      chartOpts.plugins.legend = { display: false };
      chartOpts.plugins.datalabels = {
        display: true,
        anchor: 'end',
        align: 'right',
        offset: 8,
        color: '#f8fafc',
        textStrokeColor: 'rgba(6, 11, 20, 0.85)',
        textStrokeWidth: 3,
        font: { size: fs, weight: '800' },
        formatter: function (v) { return fmtMontoRd(v); }
      };
      chartOpts.scales = {
        x: {
          beginAtZero: true,
          ticks: {
            color: colors.text,
            font: { size: fs, weight: '700' },
            callback: fmtMontoAxis
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
          border: { display: false }
        },
        y: {
          ticks: {
            color: colors.text,
            font: { size: fs + 1, weight: '800' },
            autoSkip: false
          },
          grid: { display: false },
          border: { display: false }
        }
      };
      makeChart(id, {
        type: 'bar',
        valueFormat: 'money',
        data: {
          labels: block.chart.labels,
          datasets: [{
            label: 'RD$',
            data: block.chart.values,
            backgroundColor: barColors,
            borderRadius: 12,
            maxBarThickness: 46
          }]
        },
        options: chartOpts
      });
    }
  }

  function renderCharts(snapshot, colors) {
    destroyCharts();
    if (!snapshot) return;
    var slideId = TV_SLIDES[tvSlideIndex];
    requestAnimationFrame(function () {
      renderChartsForSlide(snapshot, colors, slideId);
    });
  }

  function clampRotateSeconds(sec) {
    var n = Number(sec) || 8;
    return Math.max(TV_ROTATE_MIN, Math.min(TV_ROTATE_MAX, n));
  }

  global.PlatformTvDashboard = {
    get TV_SLIDES() { return TV_SLIDES.slice(); },
    set TV_SLIDES(v) { applyTvSlides(v); },
    applyTvSlides: applyTvSlides,
    resolveTvSlides: resolveTvSlides,
    TV_ROTATE_MIN: TV_ROTATE_MIN,
    TV_ROTATE_MAX: TV_ROTATE_MAX,
    clampRotateSeconds: clampRotateSeconds,
    collectSnapshot: collectSnapshot,
    updateSnapshot: updateSnapshot,
    render: render,
    renderCharts: renderCharts,
    renderChartsForSlide: renderChartsForSlide,
    destroyCharts: destroyCharts,
    startCarousel: startCarousel,
    stopCarousel: stopCarousel,
    setSlide: setSlide,
    getSlideIndex: getSlideIndex,
    getSlideId: getSlideId
  };
})(typeof window !== 'undefined' ? window : this);
