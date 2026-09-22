/**
 * Gráficos gerenciales — un gráfico por vista, legible y con contexto
 */
(function (global) {
  'use strict';

  var PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#0d9488'];
  var PALETTE_SOFT = [
    'rgba(37, 99, 235, 0.9)',
    'rgba(5, 150, 105, 0.9)',
    'rgba(217, 119, 6, 0.9)',
    'rgba(124, 58, 237, 0.9)',
    'rgba(219, 39, 119, 0.9)',
    'rgba(8, 145, 178, 0.9)'
  ];

  var FLUJO_ABIERTO = { line: '#3b82f6', bar: 'rgba(59, 130, 246, 0.88)', area: 'rgba(59, 130, 246, 0.18)' };
  var FLUJO_PROCESO = { line: '#f59e0b', bar: 'rgba(245, 158, 11, 0.92)', area: 'rgba(245, 158, 11, 0.22)' };
  var FLUJO_COLA = '#10b981';

  function themeColors() {
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      text: light ? '#0f172a' : '#e2e8f0',
      muted: light ? '#475569' : '#94a3b8',
      grid: light ? 'rgba(15, 23, 42, 0.1)' : 'rgba(255, 255, 255, 0.09)',
      title: light ? '#0f172a' : '#f1f5f9',
      chartBg: light ? '#ffffff' : 'rgba(8, 14, 24, 0.7)'
    };
  }

  function chartLegendBottom() {
    return {
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          align: 'center',
          labels: { padding: 18, boxWidth: 12 }
        }
      }
    };
  }

  function stackedFlujoScales() {
    var c = themeColors();
    return {
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: 'Unidades', color: c.muted, font: { size: 11, weight: '600' } }
        }
      }
    };
  }

  function fmtNum(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + ' M';
    if (v >= 1000) return (v / 1000).toFixed(1) + ' K';
    return String(Math.round(v));
  }

  function fmtMoneyRd(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return 'RD$ ' + (v / 1000000).toFixed(2) + ' M';
    if (v >= 1000) return 'RD$ ' + (v / 1000).toFixed(1) + ' K';
    return 'RD$ ' + Math.round(v).toLocaleString('es-DO');
  }

  function resolveOpsDate(raw) {
    var s = String(raw || '').trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      var y = parseInt(m[1], 10);
      var a = parseInt(m[2], 10);
      var b = parseInt(m[3], 10);
      /* ISO estándar YYYY-MM-DD — no reinterpretar como Y-DD-MM */
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
        var isoDate = new Date(y, a - 1, b);
        if (!isNaN(isoDate)) return isoDate;
      }
      var now = new Date();
      var currentMonth = now.getMonth() + 1;
      var prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      var looksLikeYearDayMonth = (a > 12 && b <= 12) ||
        (a <= 31 && b <= 12 && (b === currentMonth || b === prevMonth));
      var month = looksLikeYearDayMonth ? b : a;
      var day = looksLikeYearDayMonth ? a : b;
      var d = new Date(y, month - 1, day);
      return isNaN(d) ? null : d;
    }
    var fallback = new Date(s);
    return isNaN(fallback) ? null : fallback;
  }

  function normalizeOpsIso(raw) {
    var s = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = resolveOpsDate(s);
    return d ? toIsoDate(d) : '';
  }

  function htmlEsc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function minItemPositive(items, key) {
    var filtered = (items || []).filter(function (x) { return (x[key] || 0) > 0; });
    if (!filtered.length) return null;
    return filtered.slice().sort(function (a, b) { return (a[key] || 0) - (b[key] || 0); })[0];
  }

  /** Serie diaria por fecha de creación (sin acumulados). */
  function buildOpsDailySeries(model, maxDays) {
    var XO = global.PlatformExcelOperaciones;
    var regs = (model && model.registros) || [];
    if (XO && XO.transformOpsDailyChartData && regs.length) {
      return XO.transformOpsDailyChartData(regs, {
        maxDays: maxDays || 0,
        classifyEstado: XO.classifyEstadoOps
      }).series;
    }
    var porFechaRaw = (XO && XO.buildPorFechaCreacion && regs.length)
      ? XO.buildPorFechaCreacion(regs, { classifyEstado: XO.classifyEstadoOps })
      : (model.porFecha || []).slice();
    return (XO && XO.chartSeriesFromPorFecha)
      ? XO.chartSeriesFromPorFecha(porFechaRaw, maxDays)
      : porFechaRaw;
  }

  function operacionesBiShell(meta) {
    meta = meta || {};
    var h = meta.biHeader || {};
    function kpi(label, value, mod, hint) {
      return '<article class="ops-bi-kpi' + (mod ? ' ops-bi-kpi--' + mod : '') + '">' +
        '<span class="ops-bi-kpi-label">' + htmlEsc(label) + '</span>' +
        '<strong class="ops-bi-kpi-value">' + htmlEsc(value) + '</strong>' +
        (hint ? '<em class="ops-bi-kpi-hint">' + htmlEsc(hint) + '</em>' : '') +
        '</article>';
    }
    var deltaClass = h.deltaPct > 0 ? 'up' : h.deltaPct < 0 ? 'down' : 'flat';
    return '<div class="ops-bi-card exec-chart-shell exec-chart-shell--bi">' +
      '<header class="ops-bi-top">' +
      '<div class="ops-bi-title-block">' +
      '<span class="ops-bi-eyebrow">' + htmlEsc(meta.eyebrow || 'Operaciones') + '</span>' +
      '<h3 class="ops-bi-title">' + htmlEsc(meta.title || 'Flujo diario') + '</h3>' +
      (meta.subtitle ? '<p class="ops-bi-subtitle">' + htmlEsc(meta.subtitle) + '</p>' : '') +
      '</div>' +
      '<div class="ops-bi-kpi-row">' +
      kpi('Total abiertos', h.totalAbiertos, 'open') +
      kpi('Total en proceso', h.totalProceso, 'process') +
      kpi('Variación vs ayer', h.deltaLabel, deltaClass, h.deltaHint) +
      kpi('Día pico', h.peakLabel, 'peak', h.peakHint) +
      kpi('Día mínimo', h.minLabel, 'min', h.minHint) +
      '</div></header>' +
      '<div class="ops-bi-chart-wrap exec-chart-canvas-wrap exec-chart-canvas-wrap--bi">' +
      '<canvas id="' + htmlEsc(meta.canvasId || 'chartOpsExecutive') + '" role="img" aria-label="' + htmlEsc(meta.title || 'Gráfico operaciones') + '"></canvas>' +
      '</div></div>';
  }

  function opsDateSortKey(raw) {
    var d = resolveOpsDate(raw);
    return d ? d.getTime() : 0;
  }

  function formatOpsDateShort(raw) {
    var d = resolveOpsDate(raw);
    if (!d) return raw || '—';
    var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return d.getDate() + '/' + months[d.getMonth()];
  }

  function formatOpsDateFull(raw) {
    var d = resolveOpsDate(raw);
    if (!d) return raw || '—';
    var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return d.getDate() + '/' + months[d.getMonth()] + '/' + d.getFullYear();
  }

  function toIsoDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function sum(arr) {
    return (arr || []).reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
  }

  function maxItem(items, key) {
    if (!items || !items.length) return null;
    return items.slice().sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); })[0];
  }

  function executiveShell(meta) {
    meta = meta || {};
    var insights = (meta.insights || []).map(function (line) {
      return '<li>' + line + '</li>';
    }).join('');
    return '<div class="exec-chart-shell exec-chart-shell--pro exec-chart-shell--elite">' +
      '<header class="exec-chart-header">' +
      '<span class="exec-chart-eyebrow">' + (meta.eyebrow || 'Vista gerencial') + '</span>' +
      '<h3 class="exec-chart-title">' + (meta.title || 'Indicador') + '</h3>' +
      (meta.subtitle ? '<p class="exec-chart-subtitle">' + meta.subtitle + '</p>' : '') +
      (insights ? '<ul class="exec-chart-insights">' + insights + '</ul>' : '') +
      '</header>' +
      '<div class="exec-chart-canvas-wrap exec-chart-canvas-wrap--premium">' +
      '<canvas id="' + (meta.canvasId || 'chartExecutive') + '" role="img" aria-label="' + (meta.title || 'Gráfico') + '"></canvas>' +
      '</div>' +
      (global.PlatformOperationalInsights && meta.improvements && meta.improvements.length
        ? global.PlatformOperationalInsights.ideasHtml(meta.improvements)
        : '') +
      '</div>';
  }

  function paretoLineDataset(totals) {
    var acc = 0;
    var sumT = sum(totals) || 1;
    return totals.map(function (v) {
      acc += v;
      return Math.round((acc / sumT) * 100);
    });
  }

  function baseOptions(colors, extra) {
    colors = colors || themeColors();
    var fs = (extra && extra.fontSize) || 12;
    var tv = extra && extra.tvMode;
    if (tv) fs = 15;
    var opts = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: extra && extra.legend !== false,
          position: 'top',
          align: 'end',
          labels: {
            color: colors.text,
            font: { size: fs, weight: '600' },
            boxWidth: 10,
            padding: 18,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(6, 11, 20, 0.96)',
          titleFont: { size: fs + 1, weight: '700' },
          bodyFont: { size: fs, weight: '500' },
          padding: 14,
          cornerRadius: 10,
          borderColor: 'rgba(212, 175, 55, 0.4)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: colors.muted, font: { size: fs, weight: '500' }, maxRotation: tv ? 18 : 32 },
          grid: { color: colors.grid, drawBorder: false },
          border: { display: false }
        },
        y: {
          ticks: { color: colors.muted, font: { size: fs, weight: '500' } },
          grid: { color: colors.grid, drawBorder: false },
          beginAtZero: true,
          border: { display: false }
        }
      }
    };
    if (global.ChartPremiumStyle) {
      global.ChartPremiumStyle.mergeOptions(opts, colors, extra);
    }
    return opts;
  }

  function destroyChart(registry, id) {
    if (!registry || !id) return;
    if (registry[id] && registry[id].destroy) registry[id].destroy();
    delete registry[id];
  }

  function renderChart(registry, canvasId, config, extraOpts) {
    if (typeof Chart === 'undefined') return null;
    var el = document.getElementById(canvasId);
    if (!el) return null;
    destroyChart(registry, canvasId);
    var colors = themeColors();
    colors.chartBg = themeColors().chartBg;
    var opts = baseOptions(colors, extraOpts);
    if (extraOpts && extraOpts.indexAxis === 'y') {
      opts.indexAxis = 'y';
      if (opts.scales && opts.scales.x) opts.scales.x.beginAtZero = true;
    }
    if (config.options) {
      opts.plugins = Object.assign({}, opts.plugins, config.options.plugins || {});
      if (config.options.scales) {
        opts.scales = Object.assign({}, opts.scales, config.options.scales);
        Object.keys(config.options.scales).forEach(function (key) {
          opts.scales[key] = Object.assign({}, opts.scales[key] || {}, config.options.scales[key]);
        });
      }
      if (config.options.indexAxis) opts.indexAxis = config.options.indexAxis;
      if (config.options.cutout != null) opts.cutout = config.options.cutout;
      if (config.options.legend === false) opts.plugins.legend.display = false;
    }
    var mergeExtra = Object.assign({}, extraOpts || {}, {
      indexAxis: opts.indexAxis || (config.options && config.options.indexAxis),
      chartType: config.type,
      valueFormat: config.valueFormat
    });
    var chartData = config.data;
    if (config.preserveDatasetFunctions) {
      chartData = config.data;
    } else {
      try {
        chartData = JSON.parse(JSON.stringify(config.data));
      } catch (e) {
        chartData = config.data;
      }
    }
    if (global.ChartPremiumStyle) {
      chartData = global.ChartPremiumStyle.enhanceDatasets(chartData, config.type, colors, mergeExtra);
      mergeExtra.chartData = chartData;
      mergeExtra.isCombo = chartData.datasets && chartData.datasets.length > 1 &&
        chartData.datasets.some(function (d) { return d.type === 'line'; });
      if (config.options && config.options.plugins && config.options.plugins.donutCenter) {
        mergeExtra.donutCenter = config.options.plugins.donutCenter;
      }
      global.ChartPremiumStyle.mergeOptions(opts, colors, Object.assign({}, extraOpts, mergeExtra));
    }
    try {
      registry[canvasId] = new Chart(el, {
        type: config.type,
        data: chartData,
        options: opts
      });
      if (opts.indexAxis === 'y' && global.ChartPremiumStyle) {
        global.ChartPremiumStyle.applyHorizontalBarGradients(registry[canvasId]);
      }
      return registry[canvasId];
    } catch (chartErr) {
      console.error('Error al renderizar gráfico:', canvasId, chartErr);
      return null;
    }
  }

  /* ——— Productividad ——— */

  function productividadFechaMeta(data) {
    var porFecha = global.PlatformUtils
      ? global.PlatformUtils.sortByDateAsc(data.porFecha || [], 'fecha')
      : (data.porFecha || []).slice();
    var totals = porFecha.map(function (x) { return x.total; });
    var total = sum(totals);
    var peak = maxItem(porFecha, 'total');
    var avg = porFecha.length ? Math.round(total / porFecha.length) : 0;
    return {
      eyebrow: 'Productividad',
      title: 'Ritmo diario del equipo',
      subtitle: 'Área de tendencia · estándar moderno para detectar subidas y caídas de productividad',
      insights: [
        'Acumulado del período: <strong>' + fmtNum(total) + '</strong> unidades',
        peak ? 'Día pico: <strong>' + peak.fecha + '</strong> (' + fmtNum(peak.total) + ')' : 'Sin picos destacados',
        'Promedio diario: <strong>' + fmtNum(avg) + '</strong>'
      ],
      canvasId: 'chartProdExecutive',
      chart: {
        type: 'line',
        data: {
          labels: porFecha.map(function (x) { return x.fecha; }),
          datasets: [{
            label: 'Trabajo total del día',
            data: totals,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.25)',
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 8,
            pointBackgroundColor: '#ecfdf5',
            pointBorderColor: '#10b981',
            pointBorderWidth: 2,
            fill: true,
            tension: 0.45
          }]
        }
      }
    };
  }

  function productividadTendenciasMeta(data) {
    var meta = productividadFechaMeta(data);
    meta.title = 'Tendencia y momentum del período';
    meta.subtitle = 'Vista enfocada en la dirección del trabajo (sube / baja / estable)';
    if (meta.chart && meta.chart.data && meta.chart.data.datasets[0]) {
      meta.chart.data.datasets[0].label = 'Momentum diario';
    }
    return meta;
  }

  function productividadRankingMeta(data) {
    var top = (data.empleados || []).slice().sort(function (a, b) { return b.total - a.total; });
    var show = top.slice(0, 12);
    var totals = show.map(function (e) { return e.total; });
    var cum = paretoLineDataset(totals);
    var leader = show[0];
    var tail = show[show.length - 1];
    return {
      eyebrow: 'Productividad',
      title: 'Ranking + Pareto de aporte',
      subtitle: 'Barras = volumen · línea dorada = % acumulado (enfoque gerencial actual)',
      insights: [
        leader ? 'Líder: <strong>' + leader.nombre + '</strong> (' + fmtNum(leader.total) + ' · ' + leader.rendimientoLabel + ')' : '—',
        'Colaboradores en gráfico: <strong>' + show.length + '</strong>',
        tail && leader ? 'Brecha líder vs último mostrado: <strong>' + fmtNum(leader.total - tail.total) + '</strong>' : ''
      ].filter(Boolean),
      canvasId: 'chartProdExecutive',
      chart: {
        type: 'bar',
        data: {
          labels: show.map(function (e) { return e.nombre; }),
          datasets: [
            {
              label: 'Trabajo',
              data: totals,
              xAxisID: 'x',
              backgroundColor: show.map(function (e, i) {
                if (e.rendimientoLabel === 'Alto') return 'rgba(16, 185, 129, 0.92)';
                if (e.rendimientoLabel === 'Crítico') return 'rgba(255, 107, 122, 0.9)';
                if (e.rendimientoLabel === 'Bajo') return 'rgba(245, 158, 11, 0.9)';
                return PALETTE_SOFT[i % PALETTE_SOFT.length];
              }),
              borderRadius: 8,
              borderSkipped: false
            },
            {
              label: '% acumulado',
              type: 'line',
              data: cum,
              xAxisID: 'x1',
              borderColor: '#fbbf24',
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              borderWidth: 2.5,
              pointRadius: 4,
              tension: 0.3,
              fill: false
            }
          ]
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: { position: 'bottom', beginAtZero: true },
            x1: {
              position: 'top',
              min: 0,
              max: 100,
              grid: { drawOnChartArea: false },
              ticks: { callback: function (v) { return v + '%'; } }
            }
          }
        }
      }
    };
  }

  function productividadMatrizMeta(data) {
    var empleados = (data.empleados || []).slice().sort(function (a, b) { return b.total - a.total; });
    var show = empleados.slice(0, 8);
    var total = sum(show.map(function (e) { return e.total; }));
    return {
      eyebrow: 'Productividad',
      title: 'Radar de contribución por persona',
      subtitle: 'Gráfico polar moderno — ideal para ver concentración del esfuerzo del equipo',
      insights: [
        'Trabajo mostrado: <strong>' + fmtNum(total) + '</strong> unidades',
        'Personas: <strong>' + show.length + '</strong>',
        show[0] ? 'Mayor contribución: <strong>' + show[0].nombre + '</strong>' : ''
      ],
      canvasId: 'chartProdExecutive',
      chart: {
        type: 'polarArea',
        data: {
          labels: show.map(function (e) { return e.nombre; }),
          datasets: [{
            data: show.map(function (e) { return e.total; }),
            backgroundColor: PALETTE_SOFT.slice(0, show.length).concat(PALETTE).slice(0, show.length)
          }]
        },
        options: Object.assign({}, chartLegendBottom(), {
          scales: { r: { beginAtZero: true, ticks: { display: false } } }
        })
      }
    };
  }

  /* ——— Operaciones ——— */

  function operacionesEvolucionMeta(model) {
    var rows = buildOpsDailySeries(model, 0);
    var daysWithActivity = rows.filter(function (r) {
      return (r.abiertos || 0) + (r.enProceso || 0) > 0;
    }).length;
    var labels = rows.map(function (x) { return formatOpsDateShort(x.fecha); });
    var fullLabels = rows.map(function (x) { return formatOpsDateFull(x.fecha); });
    var openValues = rows.map(function (x) { return x.abiertos || 0; });
    var processValues = rows.map(function (x) { return x.enProceso || 0; });
    var totalAb = sum(openValues);
    var totalPr = sum(processValues);

    rows.forEach(function (x, idx) {
      var prev = idx > 0 ? (rows[idx - 1].abiertos || 0) : null;
      x._deltaOpen = prev == null ? 0 : (x.abiertos || 0) - prev;
    });

    var peakRow = maxItem(rows, 'abiertos');
    var minRow = minItemPositive(rows, 'abiertos');
    var last = rows[rows.length - 1];
    var prevRow = rows.length > 1 ? rows[rows.length - 2] : null;
    var lastOpen = last ? (last.abiertos || 0) : 0;
    var prevOpen = prevRow ? (prevRow.abiertos || 0) : 0;
    var deltaAbs = lastOpen - prevOpen;
    var deltaPct = prevOpen > 0 ? Math.round((deltaAbs / prevOpen) * 100) : (lastOpen > 0 ? 100 : 0);
    var deltaLabel = deltaPct > 0 ? '+' + deltaPct + '%' : deltaPct < 0 ? String(deltaPct) + '%' : '0%';
    var deltaHint = deltaAbs > 0 ? '+' + fmtNum(deltaAbs) + ' abiertos' : deltaAbs < 0 ? fmtNum(deltaAbs) + ' abiertos' : 'Sin cambio';

    var rangoTxt = rows.length > 1
      ? fullLabels[0] + ' → ' + fullLabels[fullLabels.length - 1]
      : (fullLabels[0] || '');

    function deltaLabelRow(row) {
      var d = row ? (row._deltaOpen || 0) : 0;
      if (d > 0) return '+' + fmtNum(d) + ' vs ayer';
      if (d < 0) return fmtNum(d) + ' vs ayer';
      return 'Sin cambio vs ayer';
    }

    var c = themeColors();
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var biGrid = isLight ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.14)';
    var biText = isLight ? '#64748b' : '#94a3b8';
    var tickRotation = rows.length > 14 ? 45 : 0;
    var yOpenMax = openValues.length ? Math.max.apply(null, openValues) : 0;
    var yProcMax = processValues.length ? Math.max.apply(null, processValues) : 0;
    var yOpenPad = Math.max(1, Math.ceil(Math.max(yOpenMax, 1) * 0.14));
    var yProcPad = Math.max(1, Math.ceil(Math.max(yProcMax, 1) * 0.18));

    return {
      eyebrow: 'Operaciones',
      title: 'Altos y bajos de trabajos abiertos',
      subtitle: (rangoTxt ? rangoTxt + ' · ' : '') + rows.length + ' días en rango (' + daysWithActivity + ' con actividad) · «Fecha y hora de creación»',
      canvasId: 'chartOpsExecutive',
      useBiShell: true,
      biHeader: {
        totalAbiertos: fmtNum(totalAb),
        totalProceso: fmtNum(totalPr),
        deltaLabel: deltaLabel,
        deltaHint: deltaHint,
        deltaPct: deltaPct,
        peakLabel: peakRow ? formatOpsDateShort(peakRow.fecha) : '—',
        peakHint: peakRow ? fmtNum(peakRow.abiertos) + ' abiertos' : '',
        minLabel: minRow ? formatOpsDateShort(minRow.fecha) : '—',
        minHint: minRow ? fmtNum(minRow.abiertos) + ' abiertos' : ''
      },
      chart: {
        type: 'bar',
        preserveDatasetFunctions: true,
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Abiertos por día',
              type: 'line',
              yAxisID: 'yOpen',
              data: openValues,
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59, 130, 246, 0.06)',
              borderWidth: 3,
              fill: true,
              tension: 0.42,
              pointRadius: rows.length <= 35 ? 5 : 3.5,
              pointHoverRadius: 8,
              pointBackgroundColor: function (ctx) {
                var row = rows[ctx.dataIndex] || {};
                if (row._alto) return '#10B981';
                if (row._bajo) return '#EF4444';
                return '#3B82F6';
              },
              pointBorderColor: isLight ? '#ffffff' : '#0f172a',
              pointBorderWidth: 2,
              segment: {
                borderColor: function (ctx) {
                  var from = ctx.p0.parsed.y || 0;
                  var to = ctx.p1.parsed.y || 0;
                  if (to > from) return '#10B981';
                  if (to < from) return '#EF4444';
                  return '#3B82F6';
                }
              },
              order: 1
            },
            {
              label: 'En proceso',
              type: 'bar',
              yAxisID: 'yProcess',
              data: processValues,
              backgroundColor: 'rgba(245, 158, 11, 0.52)',
              borderColor: '#F59E0B',
              borderWidth: 1,
              borderRadius: 5,
              borderSkipped: false,
              categoryPercentage: 0.74,
              barPercentage: 0.82,
              maxBarThickness: 26,
              hoverBackgroundColor: 'rgba(245, 158, 11, 0.72)',
              order: 2
            }
          ]
        },
        options: {
          scales: {
            x: {
              stacked: false,
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: biText,
                font: { size: rows.length > 24 ? 9 : 10, weight: '600' },
                autoSkip: rows.length > 16,
                maxRotation: tickRotation,
                minRotation: tickRotation
              }
            },
            yOpen: {
              position: 'left',
              min: 0,
              max: yOpenMax + yOpenPad,
              grid: { color: biGrid },
              border: { display: false },
              title: {
                display: true,
                text: 'Abiertos',
                color: '#3B82F6',
                font: { weight: '700', size: 11 }
              },
              ticks: { color: biText, precision: 0, padding: 6 }
            },
            yProcess: {
              position: 'right',
              min: 0,
              max: yProcMax + yProcPad,
              grid: { drawOnChartArea: false },
              border: { display: false },
              title: {
                display: true,
                text: 'En proceso',
                color: '#F59E0B',
                font: { weight: '700', size: 11 }
              },
              ticks: { color: biText, precision: 0, padding: 6 }
            }
          },
          layout: { padding: { top: 12, right: 8, bottom: 4, left: 4 } },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              align: 'center',
              labels: {
                color: c.text,
                usePointStyle: true,
                padding: 18,
                font: { size: 11, weight: '700' }
              }
            },
            datalabels: { display: false },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.94)',
              titleColor: isLight ? '#0f172a' : '#f8fafc',
              bodyColor: isLight ? '#334155' : '#cbd5e1',
              borderColor: isLight ? 'rgba(148,163,184,0.45)' : 'rgba(148,163,184,0.25)',
              borderWidth: 1,
              callbacks: {
                title: function (items) {
                  var idx = items && items[0] ? items[0].dataIndex : 0;
                  return fullLabels[idx] || labels[idx] || '';
                },
                label: function (ctx) {
                  var idx = ctx.dataIndex || 0;
                  var row = rows[idx] || {};
                  if (ctx.dataset.label === 'Abiertos por día') {
                    return 'Abiertos: ' + fmtNum(row.abiertos || 0) + ' (' + deltaLabelRow(row) + ')';
                  }
                  if (ctx.dataset.label === 'En proceso') {
                    return 'En proceso: ' + fmtNum(row.enProceso || 0);
                  }
                  return ctx.dataset.label + ': ' + fmtNum(ctx.parsed.y || 0);
                }
              }
            }
          },
          interaction: { mode: 'index', intersect: false },
          animation: { duration: 700, easing: 'easeOutQuart' }
        }
      }
    };
  }

  function operacionesResumenMeta(model) {
    return operacionesEvolucionMeta(model);
  }

  function operacionesCargaAreaMeta(model) {
    var ops = (model.operaciones || []).slice(0, 10);
    return {
      eyebrow: 'Operaciones',
      title: 'Carga por área y tipo de operación',
      subtitle: 'Comparación de abiertos y en proceso en un solo vistazo',
      insights: [
        'Áreas mostradas: <strong>' + ops.length + '</strong>',
        ops[0] ? 'Mayor carga: <strong>' + ops[0].name + '</strong> (' + fmtNum(ops[0].total) + ')' : '—',
        'Total a trabajar global: <strong>' + fmtNum(model.kpis.totalTrabajar) + '</strong>'
      ],
      canvasId: 'chartOpsAreaExecutive',
      chart: {
        type: 'bar',
        data: {
          labels: ops.map(function (o) { return o.name; }),
          datasets: [
            {
              label: 'Abierto',
              data: ops.map(function (o) { return o.abiertos; }),
              backgroundColor: FLUJO_ABIERTO.line,
              borderRadius: 6
            },
            {
              label: 'En proceso',
              data: ops.map(function (o) { return o.enProceso; }),
              backgroundColor: FLUJO_PROCESO.line,
              borderRadius: 6
            }
          ]
        },
        options: Object.assign({}, chartLegendBottom(), {
          scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
        })
      }
    };
  }

  function operacionesAggMeta(agg, kind) {
    var meta = { canvasId: 'chartOpsExecutive', chart: { type: 'bar', data: { labels: [], datasets: [] } } };
    if (!agg) return meta;

    if (kind === 'fecha') {
      var porFecha = agg.porFecha || [];
      meta.eyebrow = 'Operaciones';
      meta.title = 'Volumen de órdenes en el tiempo';
      meta.subtitle = 'Actividad diaria registrada en el WMS';
      var peakF = maxItem(porFecha, 'count');
      meta.insights = [
        'Días con datos: <strong>' + porFecha.length + '</strong>',
        peakF ? 'Pico: <strong>' + fmtNum(peakF.count) + '</strong> órdenes · ' + peakF.fecha : 'Sin picos'
      ];
      meta.chart = {
        type: 'line',
        data: {
          labels: porFecha.map(function (x) { return x.fecha; }),
          datasets: [{
            label: 'Órdenes',
            data: porFecha.map(function (x) { return x.count; }),
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(59, 130, 246, 0.32)',
            fill: true,
            tension: 0.42,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6
          }]
        }
      };
      return meta;
    }
    if (kind === 'usuario') {
      var users = (agg.porUsuario || []).slice(0, 12);
      meta.title = 'Actividad por responsable';
      meta.subtitle = 'Top usuarios con más tareas · enfoque de supervisión';
      meta.insights = [users[0] ? 'Mayor actividad: <strong>' + users[0].usuario + '</strong>' : '—'];
      meta.chart = {
        type: 'bar',
        options: { indexAxis: 'y', legend: false },
        data: {
          labels: users.map(function (x) { return x.usuario; }),
          datasets: [{ label: 'Tareas', data: users.map(function (x) { return x.count; }), backgroundColor: PALETTE_SOFT[0], borderRadius: 6 }]
        }
      };
      return meta;
    }
    if (kind === 'estado') {
      var est = agg.porEstado || [];
      meta.title = 'Distribución por estado';
      meta.subtitle = 'Dónde se concentra el flujo (abierto, proceso, cerrado…)';
      meta.chart = {
        type: 'polarArea',
        data: {
          labels: est.map(function (x) { return x.estado; }),
          datasets: [{
            data: est.map(function (x) { return x.count; }),
            backgroundColor: PALETTE_SOFT.slice(0, est.length)
          }]
        },
        options: Object.assign({}, chartLegendBottom(), {
          scales: { r: { beginAtZero: true } }
        })
      };
      meta.insights = [est[0] ? 'Estado dominante: <strong>' + est[0].estado + '</strong>' : '—'];
      return meta;
    }
    if (kind === 'ubicacion') {
      var ub = (agg.porUbicacion || []).slice(0, 12);
      meta.title = 'Carga por ubicación física';
      meta.subtitle = 'Prioriza zonas con mayor cantidad movida';
      meta.chart = {
        type: 'bar',
        options: { indexAxis: 'y', legend: false },
        data: {
          labels: ub.map(function (x) {
            var u = x.ubicacion || '';
            return u.length > 22 ? u.slice(0, 21) + '…' : u;
          }),
          datasets: [{ label: 'Cantidad', data: ub.map(function (x) { return x.cantidad; }), backgroundColor: 'rgba(16, 185, 129, 0.88)', borderRadius: 6 }]
        }
      };
      meta.insights = [ub[0] ? 'Ubicación crítica: <strong>' + ub[0].ubicacion + '</strong>' : '—'];
      return meta;
    }
    return meta;
  }

  function operacionesGraficosTabsHtml() {
    return '<div class="exec-chart-tabs" role="tablist">' +
      '<button type="button" class="exec-chart-tab active" data-ops-chart="fecha">Tendencia</button>' +
      '<button type="button" class="exec-chart-tab" data-ops-chart="usuario">Responsables</button>' +
      '<button type="button" class="exec-chart-tab" data-ops-chart="estado">Mix estados</button>' +
      '<button type="button" class="exec-chart-tab" data-ops-chart="ubicacion">Ubicaciones</button>' +
      '</div>';
  }

  /* ——— Facturas ——— */

  function facSemaforoColor(complianceRow, fallback, i) {
    var c = complianceRow;
    if (c && c.semaforoGeneral === 'ok') return 'rgba(16, 185, 129, 0.92)';
    if (c && c.semaforoGeneral === 'danger') return 'rgba(255, 107, 122, 0.9)';
    if (c && c.semaforoGeneral === 'warn') return 'rgba(245, 158, 11, 0.9)';
    return fallback || PALETTE_SOFT[i % PALETTE_SOFT.length];
  }

  function facSilentScales(scalePatch) {
    var c = themeColors();
    scalePatch = scalePatch || {};
    var silent = {
      ticks: { display: false, drawTicks: false },
      title: { display: false },
      border: { display: false },
      grid: { color: c.grid, drawBorder: false, drawTicks: false }
    };
    var out = {};
    ['x', 'y', 'y1'].forEach(function (axis) {
      if (!scalePatch[axis]) return;
      out[axis] = Object.assign({}, silent, scalePatch[axis]);
      out[axis].ticks = Object.assign({}, silent.ticks, (scalePatch[axis].ticks || {}));
      out[axis].grid = Object.assign({}, silent.grid, (scalePatch[axis].grid || {}));
    });
    return out;
  }

  function facVisualChartBase() {
    return {
      plugins: {
        legend: { display: false },
        datalabels: { display: false }
      }
    };
  }

  function facturasVisualSignals(por, compliance, viewId) {
    por = por || [];
    compliance = compliance || [];
    var totalVentas = sum(por.map(function (a) { return a.ventasPesos; })) || 1;
    var ok = 0;
    var warn = 0;
    var danger = 0;
    compliance.forEach(function (c) {
      if (c.semaforoGeneral === 'ok') ok++;
      else if (c.semaforoGeneral === 'warn') warn++;
      else if (c.semaforoGeneral === 'danger') danger++;
    });
    var avgPct = compliance.length
      ? Math.round(sum(compliance.map(function (c) { return c.pctVentas != null ? c.pctVentas : 0; })) / compliance.length)
      : 0;
    var ringPct = Math.min(100, Math.max(0, avgPct));
    var segments = por.map(function (a, i) {
      var share = Math.max(3, Math.round((a.ventasPesos / totalVentas) * 100));
      var comp = compliance.find(function (x) { return x.almacen === a.almacen; });
      var color = facSemaforoColor(comp, PALETTE[i % PALETTE.length], i);
      return '<span class="fac-vis-seg" style="flex:' + share + ';background:' + color + '" title="' + htmlEsc(a.almacen) + '"></span>';
    }).join('');
    var viewGlyph = viewId === 'cumplimiento' ? '◐' : viewId === 'participacion' ? '◎' : viewId === 'ordenes' ? '▥' : '▮';
    return '<div class="fac-vis-signals" data-fac-view="' + htmlEsc(viewId || 'ventas') + '">' +
      '<div class="fac-vis-ring" style="--fac-pct:' + ringPct + '" aria-hidden="true">' +
      '<span class="fac-vis-ring-num">' + ringPct + '</span></div>' +
      '<div class="fac-vis-mix-wrap">' +
      '<div class="fac-vis-mix" aria-hidden="true">' + segments + '</div>' +
      '<div class="fac-vis-sem" aria-hidden="true">' +
      '<span class="fac-vis-dot ok"></span><em>' + ok + '</em>' +
      '<span class="fac-vis-dot warn"></span><em>' + warn + '</em>' +
      '<span class="fac-vis-dot danger"></span><em>' + danger + '</em>' +
      '</div></div>' +
      '<span class="fac-vis-view-glyph" aria-hidden="true">' + viewGlyph + '</span></div>';
  }

  function facturasVisualShell(meta, por, compliance) {
    meta = meta || {};
    var viewId = meta.viewId || 'ventas';
    return '<div class="exec-chart-shell exec-chart-shell--fac-visual">' +
      facturasVisualSignals(por, compliance, viewId) +
      '<div class="fac-vis-legend" aria-hidden="true">' +
      '<span class="fac-vis-swatch ok"></span>' +
      '<span class="fac-vis-swatch warn"></span>' +
      '<span class="fac-vis-swatch danger"></span>' +
      '<span class="fac-vis-swatch meta-line"></span>' +
      '</div>' +
      '<div class="exec-chart-canvas-wrap exec-chart-canvas-wrap--fac-visual">' +
      '<canvas id="' + (meta.canvasId || 'chartFacExecutive') + '" role="img" aria-label="' + htmlEsc(meta.title || 'Gráfico facturación') + '"></canvas>' +
      '</div></div>';
  }

  function facturasTabsHtml() {
    return '<div class="exec-chart-tabs exec-chart-tabs--visual" role="tablist">' +
      '<button type="button" class="exec-chart-tab active" data-fac-chart="ventas" title="Ventas vs meta" aria-label="Ventas vs meta">' +
      '<span class="fac-tab-glyph" aria-hidden="true">▮▮</span></button>' +
      '<button type="button" class="exec-chart-tab" data-fac-chart="cumplimiento" title="Cumplimiento" aria-label="Cumplimiento">' +
      '<span class="fac-tab-glyph" aria-hidden="true">◐</span></button>' +
      '<button type="button" class="exec-chart-tab" data-fac-chart="participacion" title="Participación" aria-label="Participación">' +
      '<span class="fac-tab-glyph" aria-hidden="true">◎</span></button>' +
      '<button type="button" class="exec-chart-tab" data-fac-chart="ordenes" title="Órdenes" aria-label="Órdenes">' +
      '<span class="fac-tab-glyph" aria-hidden="true">▥</span></button>' +
      '</div>';
  }

  function facturasMetaByView(viewId, por, compliance) {
    if (viewId === 'cumplimiento') return facturasCumplimientoMeta(por, compliance);
    if (viewId === 'participacion') return facturasParticipacionMeta(por);
    if (viewId === 'ordenes') return facturasOrdenesMeta(por);
    return facturasGerencialMeta(por, compliance);
  }

  function facturasCumplimientoMeta(por, compliance) {
    por = por || [];
    compliance = compliance || [];
    var labels = compliance.map(function (c) { return c.almacen; });
    var pct = compliance.map(function (c) {
      return c.pctVentas != null ? c.pctVentas : (c.pctOrdenes != null ? c.pctOrdenes : 0);
    });
    var xMax = Math.max(120, Math.ceil(Math.max.apply(null, pct.concat([100])) / 10) * 10);
    return {
      viewId: 'cumplimiento',
      eyebrow: 'Facturación',
      title: 'Cumplimiento de metas',
      canvasId: 'chartFacExecutive',
      chart: {
        type: 'bar',
        valueFormat: 'percent',
        preserveDatasetFunctions: true,
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Cumplimiento',
              data: pct,
              backgroundColor: pct.map(function (p, i) {
                return facSemaforoColor(compliance[i], PALETTE_SOFT[i % PALETTE_SOFT.length], i);
              }),
              borderRadius: 10,
              maxBarThickness: 44,
              barPercentage: 0.78,
              categoryPercentage: 0.86
            },
            {
              type: 'line',
              label: 'Meta',
              data: labels.map(function () { return 100; }),
              borderColor: 'rgba(251, 191, 36, 0.9)',
              borderWidth: 2,
              borderDash: [7, 5],
              pointRadius: 0,
              fill: false,
              tension: 0
            }
          ]
        },
        options: Object.assign({}, facVisualChartBase(), {
          indexAxis: 'y',
          layout: { padding: { top: 8, right: 16, bottom: 8, left: 8 } },
          scales: facSilentScales({
            x: {
              min: 0,
              max: xMax,
              grid: { display: true, drawOnChartArea: true, color: 'rgba(255,255,255,0.06)' }
            },
            y: { grid: { display: false } }
          })
        })
      }
    };
  }

  function facturasParticipacionMeta(por) {
    por = por || [];
    var totalVentas = sum(por.map(function (a) { return a.ventasPesos; }));
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    var mainLabel = totalVentas >= 1000000
      ? (totalVentas / 1000000).toFixed(1) + 'M'
      : totalVentas >= 1000
        ? (totalVentas / 1000).toFixed(0) + 'K'
        : String(Math.round(totalVentas));
    return {
      viewId: 'participacion',
      eyebrow: 'Facturación',
      title: 'Participación en ventas',
      canvasId: 'chartFacExecutive',
      chart: {
        type: 'doughnut',
        valueFormat: 'money',
        data: {
          labels: por.map(function (a) { return a.almacen; }),
          datasets: [{
            data: por.map(function (a) { return a.ventasPesos; }),
            backgroundColor: por.map(function (a, i) { return PALETTE[i % PALETTE.length]; }),
            borderWidth: 4,
            borderColor: light ? '#ffffff' : 'rgba(8, 14, 24, 0.82)',
            hoverOffset: 14
          }]
        },
        options: Object.assign({}, facVisualChartBase(), {
          cutout: '68%',
          layout: { padding: 12 },
          plugins: Object.assign({}, facVisualChartBase().plugins, {
            donutCenter: {
              text: { main: mainLabel, sub: String(por.length) },
              color: light ? '#0f172a' : '#f8fafc',
              subColor: light ? '#64748b' : '#94a3b8',
              sizeMain: 22,
              sizeSub: 13
            }
          })
        })
      }
    };
  }

  function facturasOrdenesMeta(por) {
    por = (por || []).slice().sort(function (a, b) { return (b.ordenes || 0) - (a.ordenes || 0); });
    var maxOrd = Math.max.apply(null, por.map(function (a) { return a.ordenes || 0; }).concat([1]));
    return {
      viewId: 'ordenes',
      eyebrow: 'Facturación',
      title: 'Órdenes por almacén',
      canvasId: 'chartFacExecutive',
      chart: {
        type: 'bar',
        preserveDatasetFunctions: true,
        data: {
          labels: por.map(function (a) { return a.almacen; }),
          datasets: [{
            label: 'Órdenes',
            data: por.map(function (a) { return a.ordenes; }),
            backgroundColor: por.map(function (a, i) {
              var intensity = 0.45 + ((a.ordenes || 0) / maxOrd) * 0.55;
              return 'rgba(124, 58, 237, ' + intensity.toFixed(2) + ')';
            }),
            borderRadius: 12,
            maxBarThickness: 52,
            barPercentage: 0.72,
            categoryPercentage: 0.82
          }]
        },
        options: Object.assign({}, facVisualChartBase(), {
          indexAxis: 'y',
          layout: { padding: { top: 8, right: 12, bottom: 8, left: 8 } },
          scales: facSilentScales({
            x: { grid: { display: true, color: 'rgba(255,255,255,0.06)' } },
            y: { grid: { display: false } }
          })
        })
      }
    };
  }

  function facturasGerencialMeta(por, compliance) {
    por = (por || []).slice().sort(function (a, b) {
      return (b.ventasPesos || 0) - (a.ventasPesos || 0);
    });
    compliance = compliance || [];
    var isTv = document.body && document.body.classList.contains('tv-mode');
    var chartRows = isTv ? por.slice(0, 10) : por;
    var labels = chartRows.map(function (a) { return a.almacen; });
    var ventas = chartRows.map(function (a) { return a.ventasPesos; });
    var pct = chartRows.map(function (a) {
      var c = compliance.find(function (x) { return x.almacen === a.almacen; });
      if (!c) return 0;
      return c.pctVentas != null ? c.pctVentas : (c.pctOrdenes != null ? c.pctOrdenes : 0);
    });
    var y1Max = Math.max(120, Math.ceil(Math.max.apply(null, pct.concat([100])) / 10) * 10);
    var barColors = chartRows.map(function (a, i) {
      var c = compliance.find(function (x) { return x.almacen === a.almacen; });
      return facSemaforoColor(c, PALETTE_SOFT[i % PALETTE_SOFT.length], i);
    });
    var comboChart = {
      type: 'bar',
      valueFormat: 'money',
      preserveDatasetFunctions: true,
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ventas',
            data: ventas,
            backgroundColor: barColors,
            borderRadius: isTv ? 12 : 10,
            maxBarThickness: isTv ? 48 : 44,
            barPercentage: 0.76,
            categoryPercentage: 0.85,
            xAxisID: 'x'
          },
          {
            label: 'Meta',
            type: 'line',
            order: 0,
            data: pct,
            borderColor: 'rgba(251, 191, 36, 0.95)',
            backgroundColor: 'rgba(251, 191, 36, 0.08)',
            borderWidth: 3,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: '#fffbeb',
            pointBorderColor: '#fbbf24',
            pointBorderWidth: 2,
            fill: true,
            tension: 0.35,
            xAxisID: 'x1',
            yAxisID: 'y'
          }
        ]
      },
      options: Object.assign({}, facVisualChartBase(), {
        indexAxis: 'y',
        layout: { padding: { top: 6, right: isTv ? 84 : 20, bottom: 6, left: 8 } },
        scales: facSilentScales({
          x: {
            beginAtZero: true,
            grid: { display: true, color: 'rgba(255,255,255,0.06)' }
          },
          x1: {
            position: 'top',
            min: 0,
            max: y1Max,
            grid: { display: false, drawOnChartArea: false },
            ticks: { display: false }
          },
          y: { grid: { display: false } }
        })
      })
    };
    if (isTv) {
      return {
        viewId: 'ventas',
        eyebrow: 'Facturación',
        title: 'Ventas por almacén',
        canvasId: 'chartFacExecutive',
        chart: {
          type: 'bar',
          valueFormat: 'money',
          preserveDatasetFunctions: true,
          data: {
            labels: labels,
            datasets: [{
              label: 'Ventas',
              data: ventas,
              backgroundColor: barColors,
              borderRadius: 12,
              maxBarThickness: 48
            }]
          },
          options: Object.assign({}, facVisualChartBase(), {
            indexAxis: 'y',
            layout: { padding: { top: 6, right: 84, bottom: 6, left: 8 } },
            scales: facSilentScales({
              x: { beginAtZero: true, grid: { display: true, color: 'rgba(255,255,255,0.06)' } },
              y: { grid: { display: false } }
            }),
            plugins: Object.assign({}, facVisualChartBase().plugins, {
              datalabels: { display: false }
            })
          })
        }
      };
    }
    return {
      viewId: 'ventas',
      eyebrow: 'Facturación',
      title: 'Desempeño comercial',
      canvasId: 'chartFacExecutive',
      chart: comboChart
    };
  }

  function getProductividadMeta(viewId, data) {
    var meta;
    if (viewId === 'empleados') meta = productividadRankingMeta(data);
    else if (viewId === 'matriz') meta = productividadMatrizMeta(data);
    else if (viewId === 'tendencias') meta = productividadTendenciasMeta(data);
    else meta = productividadFechaMeta(data);
    if (global.PlatformOperationalInsights) {
      global.PlatformOperationalInsights.attachToMeta(meta, 'productividad', viewId, { data: data });
    }
    return meta;
  }

  function getOperacionesGraficosMeta(kind, agg, model) {
    var meta = operacionesAggMeta(agg, kind);
    if (global.PlatformOperationalInsights) {
      global.PlatformOperationalInsights.attachToMeta(meta, 'operaciones', 'graficos', { agg: agg, model: model });
    }
    return meta;
  }

  function getFacturasMeta(viewId, por, compliance) {
    var meta = facturasMetaByView(viewId, por, compliance);
    meta.viewId = viewId || meta.viewId || 'ventas';
    if (global.PlatformOperationalInsights) {
      global.PlatformOperationalInsights.attachToMeta(meta, 'facturas', viewId, { por: por, compliance: compliance });
    }
    return meta;
  }

  function facturasCentralDailyMeta(labels, values, markers, opts) {
    labels = labels || [];
    values = values || [];
    markers = markers || [];
    opts = opts || {};
    var useBar = labels.length <= 4;
    var datasets;
    if (useBar) {
      datasets = [{
        label: 'Facturación RD$',
        data: values,
        backgroundColor: 'rgba(16, 185, 129, 0.88)',
        hoverBackgroundColor: 'rgba(52, 211, 153, 0.95)',
        borderColor: 'rgba(167, 243, 208, 0.55)',
        borderWidth: 1.5,
        borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 4, bottomRight: 4 },
        maxBarThickness: labels.length === 1 ? 128 : 84,
        barPercentage: labels.length === 1 ? 0.38 : 0.65
      }];
    } else {
      datasets = [{
        label: 'Facturación RD$',
        data: values,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: markers.map(function (m) {
          return m === 'up' || m === 'down' ? 8 : 5;
        }),
        pointBackgroundColor: markers.map(function (m) {
          if (m === 'up') return 'rgba(52, 211, 153, 1)';
          if (m === 'down') return 'rgba(255, 107, 122, 1)';
          return '#3b82f6';
        }),
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }];
    }
    return {
      eyebrow: 'Facturación · CENTRAL',
      title: opts.title || 'Facturación diaria',
      subtitle: opts.subtitle || 'Montos en pesos dominicanos (RD$)',
      canvasId: opts.canvasId || 'tvChartFac',
      insights: opts.insights || [],
      chart: {
        type: useBar ? 'bar' : 'line',
        valueFormat: 'money',
        preserveDatasetFunctions: !useBar,
        data: { labels: labels, datasets: datasets },
        options: Object.assign({}, facVisualChartBase(), {
          layout: { padding: { top: useBar ? 28 : 8, right: 12, bottom: 4, left: 8 } },
          plugins: Object.assign({}, facVisualChartBase().plugins, useBar ? {
            datalabels: {
              display: true,
              anchor: 'end',
              align: 'top',
              offset: 6,
              color: '#ecfdf5',
              textStrokeColor: 'rgba(6, 11, 20, 0.9)',
              textStrokeWidth: 3,
              font: { size: 15, weight: '800' },
              formatter: function (v) { return fmtMoneyRd(v); }
            }
          } : { datalabels: { display: false } })
        })
      }
    };
  }

  function renderFromMeta(registry, meta, extraOpts) {
    if (!meta || !meta.chart) return;
    renderChart(registry, meta.canvasId, meta.chart, extraOpts);
  }

  global.PlatformExecutiveCharts = {
    themeColors: themeColors,
    executiveShell: executiveShell,
    destroyChart: destroyChart,
    renderChart: renderChart,
    renderFromMeta: renderFromMeta,
    getProductividadMeta: getProductividadMeta,
    getOperacionesGraficosMeta: getOperacionesGraficosMeta,
    getFacturasMeta: getFacturasMeta,
    productividadFechaMeta: productividadFechaMeta,
    productividadTendenciasMeta: productividadTendenciasMeta,
    productividadRankingMeta: productividadRankingMeta,
    productividadMatrizMeta: productividadMatrizMeta,
    operacionesEvolucionMeta: operacionesEvolucionMeta,
    operacionesBiShell: operacionesBiShell,
    buildOpsDailySeries: buildOpsDailySeries,
    operacionesResumenMeta: operacionesResumenMeta,
    operacionesCargaAreaMeta: operacionesCargaAreaMeta,
    operacionesAggMeta: operacionesAggMeta,
    operacionesGraficosTabsHtml: operacionesGraficosTabsHtml,
    facturasGerencialMeta: facturasGerencialMeta,
    facturasMetaByView: facturasMetaByView,
    facturasTabsHtml: facturasTabsHtml,
    facturasVisualShell: facturasVisualShell,
    facturasVisualSignals: facturasVisualSignals,
    facturasCentralDailyMeta: facturasCentralDailyMeta,
    fmtNum: fmtNum,
    fmtMoneyRd: fmtMoneyRd
  };
})(typeof window !== 'undefined' ? window : this);
