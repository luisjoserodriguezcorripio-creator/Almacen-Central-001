/**
 * Centro de mando — dashboard unificado 300-001 (CENTRAL)
 * Facturación principal + operaciones y productividad del mismo sitio.
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  function classifyEstado(estado) {
    if (global.PlatformOpsDashboard && global.PlatformOpsDashboard.classifyEstado) {
      return global.PlatformOpsDashboard.classifyEstado(estado);
    }
    var e = String(estado || '').toLowerCase();
    if (e.indexOf('proceso') >= 0) return 'proceso';
    if (e.indexOf('abier') >= 0 || e.indexOf('pend') >= 0) return 'abierto';
    if (e.indexOf('cerr') >= 0 || e.indexOf('complet') >= 0 || e.indexOf('final') >= 0) return 'cerrado';
    return 'other';
  }

  function parseDt(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date && !isNaN(v)) return v;
    var s = String(v).trim().replace(' ', 'T');
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function recordAmount(rec, tc) {
    var FX = global.PlatformExcelFacturas;
    if (!rec) return 0;
    tc = tc || 58.5;
    if (rec.divisa === 'USD') return (rec.monto || 0) * tc;
    return rec.monto || 0;
  }

  function addDays(iso, delta) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function fillDateRange(map, minIso, maxIso) {
    var labels = [];
    var values = [];
    if (!minIso || !maxIso) return { labels: labels, values: values };
    var cur = minIso;
    while (cur <= maxIso) {
      labels.push(cur);
      values.push(map[cur] || 0);
      cur = addDays(cur, 1);
    }
    return { labels: labels, values: values };
  }

  function fmtLabel(iso) {
    if (!iso || iso.length < 10) return iso || '—';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }

  function fmtMoney(n) {
    var FX = global.PlatformExcelFacturas;
    if (FX && FX.formatMillions) {
      var v = Number(n) || 0;
      if (v >= 1000000) return 'RD$ ' + FX.formatMillions(v);
      return 'RD$ ' + v.toLocaleString('es-DO', { maximumFractionDigits: 0 });
    }
    return 'RD$ ' + Math.round(Number(n) || 0).toLocaleString('es-DO');
  }

  function fmtPct(n) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    var sign = v > 0 ? '+' : '';
    return sign + v.toFixed(1) + '%';
  }

  function buildFacturacionModel(regs, tipoCambio) {
    var FX = global.PlatformExcelFacturas;
    var tc = FX ? FX.resolveTipoCambio(tipoCambio) : 58.5;
    var byDay = {};
    var total = 0;

    (regs || []).forEach(function (r) {
      var d = r.fecha;
      if (!d) return;
      var amt = recordAmount(r, tc);
      byDay[d] = (byDay[d] || 0) + amt;
      total += amt;
    });

    var keys = Object.keys(byDay).sort();
    if (!keys.length) {
      return {
        total: 0, daily: 0, acumulada: 0, variationPct: null, peakDay: '—', peakValue: 0,
        series: { labels: [], values: [], deltas: [], markers: [] },
        tipoCambio: tc
      };
    }

    var filled = fillDateRange(byDay, keys[0], keys[keys.length - 1]);
    var labels = filled.labels;
    var values = filled.values;
    var deltas = values.map(function (v, i) {
      return i === 0 ? 0 : v - values[i - 1];
    });
    var markers = deltas.map(function (d, i) {
      if (i === 0 || d === 0) return 'flat';
      return d > 0 ? 'up' : 'down';
    });

    var peakIdx = 0;
    var peakVal = values[0];
    values.forEach(function (v, i) {
      if (v > peakVal) {
        peakVal = v;
        peakIdx = i;
      }
    });

    var lastIdx = values.length - 1;
    var daily = values[lastIdx] || 0;
    var prev = lastIdx > 0 ? values[lastIdx - 1] : 0;
    var variationPct = prev > 0 ? ((daily - prev) / prev) * 100 : (daily > 0 ? 100 : 0);

    var prevPeriodTotal = 0;
    var periodGrowthPct = null;
    var half = Math.floor(values.length / 2);
    if (half > 0) {
      var firstHalf = values.slice(0, half).reduce(function (a, b) { return a + b; }, 0);
      var secondHalf = values.slice(half).reduce(function (a, b) { return a + b; }, 0);
      prevPeriodTotal = firstHalf;
      periodGrowthPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : null;
    }

    return {
      total: total,
      acumulada: total,
      daily: daily,
      variationPct: variationPct,
      peakDay: fmtLabel(labels[peakIdx]),
      peakValue: peakVal,
      peakIso: labels[peakIdx],
      series: {
        labels: labels.map(fmtLabel),
        rawLabels: labels,
        values: values,
        deltas: deltas,
        markers: markers
      },
      periodGrowthPct: periodGrowthPct,
      tipoCambio: tc
    };
  }

  function buildOpsModel(regs) {
    var OPS = global.PlatformOpsDashboard;
    var abiertos = 0;
    var enProceso = 0;
    var vencidas = 0;
    var alerts = [];

    if (OPS && OPS.buildModel) {
      var filtered = { format: 'control', registros: regs || [], fileName: '' };
      var m = OPS.buildModel(filtered);
      if (m) {
        return {
          abiertos: m.kpis.abiertos,
          enProceso: m.kpis.enProceso,
          totalTrabajar: m.kpis.totalTrabajar,
          processUserAlerts: m.processUserAlerts || [],
          vencidas: (m.processUserAlerts || []).reduce(function (s, g) { return s + g.count; }, 0)
        };
      }
    }

    (regs || []).forEach(function (r) {
      var cls = classifyEstado(r.estado);
      var qty = r.cantidad > 0 ? r.cantidad : 1;
      if (cls === 'abierto') abiertos += qty;
      else if (cls === 'proceso') enProceso += qty;
    });

    return { abiertos: abiertos, enProceso: enProceso, totalTrabajar: abiertos + enProceso, processUserAlerts: alerts, vencidas: vencidas };
  }

  function buildProductividadModel(regs) {
    var completed = 0;
    var open = 0;
    var process = 0;
    var closureHours = [];
    var byDay = {};

    (regs || []).forEach(function (r) {
      var cls = classifyEstado(r.estado);
      var qty = r.cantidad > 0 ? r.cantidad : 1;
      var day = '';
      if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.recordCreationDateIso) {
        day = global.PlatformExcelOperaciones.recordCreationDateIso(r);
      } else if (r.fechaHora) {
        day = String(r.fechaHora).slice(0, 10);
      }

      if (cls === 'cerrado') {
        completed += qty;
        if (day) byDay[day] = (byDay[day] || 0) + qty;
        var created = parseDt(r.fechaHora || r.fechaCreacionRaw);
        var closed = parseDt(r.fechaModificacion || r.fechaHora);
        if (created && closed && closed > created) {
          closureHours.push((closed - created) / 3600000);
        }
      } else if (cls === 'abierto') {
        open += qty;
      } else if (cls === 'proceso') {
        process += qty;
      }
    });

    var avgClosure = closureHours.length
      ? closureHours.reduce(function (a, b) { return a + b; }, 0) / closureHours.length
      : null;

    var totalActive = completed + open + process;
    var efficiency = totalActive > 0 ? Math.round((completed / totalActive) * 100) : 0;

    var dayKeys = Object.keys(byDay).sort();
    var series = fillDateRange(byDay, dayKeys[0], dayKeys[dayKeys.length - 1]);

    return {
      completed: completed,
      avgClosureHours: avgClosure,
      efficiencyPct: efficiency,
      series: {
        labels: series.labels.map(fmtLabel),
        values: series.values
      }
    };
  }

  function buildModel(ctx) {
    var SF = global.PlatformSiteFilter;
    if (!SF) return null;

    var filtered = SF.applySiteFilter(ctx);
    var site = filtered.site;
    var factRegs = filtered.facturas ? filtered.facturas.registros : [];
    var opsRegs = filtered.operaciones ? filtered.operaciones.registros : [];

    return {
      site: site,
      hasFacturas: filtered.hasFacturas,
      hasOperaciones: filtered.hasOperaciones,
      hasProductividad: filtered.hasProductividad,
      facturacion: buildFacturacionModel(factRegs, ctx.tipoCambio),
      operaciones: buildOpsModel(opsRegs),
      productividad: buildProductividadModel(opsRegs),
      meta: {
        facturasCount: factRegs.length,
        opsCount: opsRegs.length,
        fileNameFacturas: filtered.facturas && filtered.facturas.fileName,
        fileNameOps: filtered.operaciones && filtered.operaciones.fileName,
        siteAssumedOps: !!(filtered.operaciones && filtered.operaciones.meta && filtered.operaciones.meta.siteAssumed)
      }
    };
  }

  function kpiCard(label, value, variant, sub) {
    return '<article class="cc-kpi cc-kpi--' + esc(variant || 'default') + '">' +
      '<span class="cc-kpi-label">' + esc(label) + '</span>' +
      '<span class="cc-kpi-value">' + esc(String(value)) + '</span>' +
      (sub ? '<span class="cc-kpi-sub">' + sub + '</span>' : '') +
      '</article>';
  }

  function renderAlerts(alerts) {
    if (!alerts || !alerts.length) {
      return '<div class="cc-alert cc-alert--ok"><span>✓</span><div><strong>Sin alertas 24h</strong><p>No hay tareas en proceso mayores a 24 horas en ' + esc('300-001') + '.</p></div></div>';
    }
    return alerts.slice(0, 5).map(function (g) {
      return '<div class="cc-alert cc-alert--warn" role="alert">' +
        '<span>⚠</span><div><strong>Usuario ' + esc(g.usuario) + ' tiene ' + esc(g.count) +
        ' tarea(s) en proceso por más de 24h</strong>' +
        '<p>Mayor tiempo: ' + esc(g.maxAgeLabel || '—') + '</p></div></div>';
    }).join('');
  }

  function render(host, ctx) {
    if (!host) return null;
    ctx = ctx || {};
    var model = buildModel(ctx);
    if (!model) {
      host.innerHTML = '<div class="cc-empty">No se pudo cargar el centro de mando.</div>';
      return null;
    }

    var meta = ctx.meta || {};
    var fac = model.facturacion;
    var ops = model.operaciones;
    var prod = model.productividad;
    var varClass = fac.variationPct == null ? '' : (fac.variationPct >= 0 ? 'is-up' : 'is-down');
    var varIcon = fac.variationPct == null ? '' : (fac.variationPct >= 0 ? '🔺' : '🔻');
    var periodGrowth = fac.periodGrowthPct != null
      ? '<span class="cc-growth ' + (fac.periodGrowthPct >= 0 ? 'is-up' : 'is-down') + '">' +
        (fac.periodGrowthPct >= 0 ? '▲' : '▼') + ' ' + esc(fmtPct(fac.periodGrowthPct)) + ' vs periodo anterior</span>'
      : '';

    var html = '<div class="cc-dashboard" data-site="' + esc(model.site.code) + '">';

    html += '<header class="cc-header">' +
      '<div class="cc-header-copy">' +
      '<span class="cc-site-badge">' + esc(model.site.title) + '</span>' +
      '<h2 class="cc-title">Centro de mando · Facturación & operación</h2>' +
      '<p class="cc-subtitle">Vista exclusiva del almacén <strong>' + esc(model.site.code) + '</strong>. ' +
      'Datos de otros sitios no se muestran.</p>' +
      (meta.userName ? '<span class="cc-user">' + esc(meta.userName) + '</span>' : '') +
      '</div>' +
      '<div class="cc-header-actions">' +
      (meta.canImport ? '<button type="button" class="btn btn-primary" data-open-admin="excel">Importar datos</button>' : '') +
      '<button type="button" class="btn btn-tv" data-perm="tv.mode" id="btnTvFromGeneral">Pantalla TV</button>' +
      '<button type="button" class="btn btn-ghost" data-module-jump="facturas">Detalle facturas →</button>' +
      '<button type="button" class="btn btn-ghost" data-module-jump="operaciones">Detalle operaciones →</button>' +
      '</div></header>';

    /* —— Facturación —— */
    html += '<section class="cc-section cc-section--fact" aria-labelledby="ccFactTitle">' +
      '<div class="cc-section-head">' +
      '<div><span class="cc-eyebrow cc-eyebrow--blue">Prioridad · Facturación</span>' +
      '<h3 id="ccFactTitle">Facturación ' + esc(model.site.code) + '</h3></div>' +
      periodGrowth +
      '</div>';

    if (!model.hasFacturas) {
      html += '<div class="cc-panel-empty">Sin facturas para <strong>' + esc(model.site.code) + '</strong>. Importe el diario de facturas.</div>';
    } else {
      html += '<div class="cc-kpi-grid cc-kpi-grid--5">' +
        kpiCard('Total facturado', fmtMoney(fac.total), 'blue') +
        kpiCard('Facturación diaria', fmtMoney(fac.daily), 'blue-light', 'Último día con datos') +
        kpiCard('Acumulada período', fmtMoney(fac.acumulada), 'default') +
        kpiCard('Variación vs ayer', (varIcon ? varIcon + ' ' : '') + fmtPct(fac.variationPct), varClass || 'default') +
        kpiCard('Día pico', fac.peakDay, 'green', fmtMoney(fac.peakValue)) +
        '</div>' +
        '<div class="cc-chart-card cc-chart-card--hero">' +
        '<div class="cc-chart-head"><strong>Tendencia diaria · RD$</strong>' +
        '<span class="cc-chart-legend"><i class="leg-up"></i> Subida <i class="leg-down"></i> Bajada</span></div>' +
        '<div class="cc-chart-wrap"><canvas id="chartCcFacturacion" aria-label="Facturación diaria"></canvas></div>' +
        '</div>';
    }
    html += '</section>';

    /* —— Soporte operativo + productividad —— */
    html += '<div class="cc-support-grid">';

    html += '<section class="cc-section cc-section--ops" aria-labelledby="ccOpsTitle">' +
      '<span class="cc-eyebrow cc-eyebrow--amber">Operaciones · ' + esc(model.site.code) + '</span>' +
      '<h3 id="ccOpsTitle">Soporte operativo</h3>';

    if (!model.hasOperaciones) {
      html += '<div class="cc-panel-empty">Sin operaciones en ubicación <strong>' + esc(model.site.code) + '</strong>.</div>';
    } else {
      html += '<div class="cc-kpi-grid cc-kpi-grid--3">' +
        kpiCard('Abiertos', ops.abiertos, 'amber') +
        kpiCard('En proceso', ops.enProceso, 'amber-dark') +
        kpiCard('Vencidas &gt;24h', ops.vencidas, ops.vencidas > 0 ? 'red' : 'green') +
        '</div>' +
        '<div class="cc-alerts">' + renderAlerts(ops.processUserAlerts) + '</div>';
    }
    html += '</section>';

    html += '<section class="cc-section cc-section--prod" aria-labelledby="ccProdTitle">' +
      '<span class="cc-eyebrow cc-eyebrow--green">Productividad · ' + esc(model.site.code) + '</span>' +
      '<h3 id="ccProdTitle">Desempeño del sitio</h3>';

    if (!model.hasProductividad) {
      html += '<div class="cc-panel-empty">Sin datos operativos para calcular productividad del sitio.</div>';
    } else {
      var closureLabel = prod.avgClosureHours != null
        ? (prod.avgClosureHours >= 24
          ? Math.round(prod.avgClosureHours / 24) + ' d'
          : prod.avgClosureHours.toFixed(1) + ' h')
        : '—';
      html += '<div class="cc-kpi-grid cc-kpi-grid--3">' +
        kpiCard('Completados', prod.completed, 'green') +
        kpiCard('Tiempo cierre prom.', closureLabel, 'default') +
        kpiCard('Eficiencia', prod.efficiencyPct + '%', prod.efficiencyPct >= 70 ? 'green' : 'amber') +
        '</div>' +
        '<div class="cc-chart-card">' +
        '<div class="cc-chart-head"><strong>Trabajos completados por día</strong></div>' +
        '<div class="cc-chart-wrap cc-chart-wrap--sm"><canvas id="chartCcProductividad"></canvas></div>' +
        '</div>';
    }
    html += '</section></div>';

    html += '<footer class="cc-foot">' +
      '<span>Filtro activo: ubicación / almacén = <strong>' + esc(model.site.code) + '</strong></span>' +
      (model.meta.siteAssumedOps ? '<span>Operaciones: Excel monositio (ubicación = bin/pasillo, no código de almacén)</span>' : '') +
      (model.meta.fileNameFacturas ? '<span>Facturas: ' + esc(model.meta.fileNameFacturas) + '</span>' : '') +
      (model.meta.fileNameOps ? '<span>Operaciones: ' + esc(model.meta.fileNameOps) + '</span>' : '') +
      '</footer>';

    html += '</div>';
    host.innerHTML = html;
    return model;
  }

  function chartColors() {
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      text: dark ? '#94a3b8' : '#526880',
      grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,36,64,0.08)',
      blue: '#3b82f6',
      green: '#10b981',
      red: '#ef4444'
    };
  }

  function destroyChart(registry, id) {
    if (registry && registry[id] && registry[id].destroy) {
      registry[id].destroy();
      delete registry[id];
    }
  }

  function renderCharts(host, model, registry) {
    if (!host || !model || typeof Chart === 'undefined') return;
    registry = registry || {};

    destroyChart(registry, 'chartCcFacturacion');
    destroyChart(registry, 'chartCcProductividad');

    var c = chartColors();
    var facCanvas = host.querySelector('#chartCcFacturacion');
    if (facCanvas && model.hasFacturas && model.facturacion.series.values.length) {
      var s = model.facturacion.series;
      registry.chartCcFacturacion = new Chart(facCanvas, {
        type: 'line',
        data: {
          labels: s.labels,
          datasets: [{
            label: 'Facturación RD$',
            data: s.values,
            borderColor: c.blue,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointRadius: s.markers.map(function (m) {
              return m === 'up' || m === 'down' ? 7 : 4;
            }),
            pointBackgroundColor: s.markers.map(function (m) {
              if (m === 'up') return c.green;
              if (m === 'down') return c.red;
              return c.blue;
            }),
            pointBorderColor: '#fff',
            pointBorderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var v = s.values[ctx.dataIndex];
                  return ' RD$ ' + (v || 0).toLocaleString('es-DO', { maximumFractionDigits: 0 });
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: c.text, maxRotation: 0 }, grid: { display: false } },
            y: {
              ticks: {
                color: c.text,
                callback: function (v) {
                  return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v;
                }
              },
              grid: { color: c.grid },
              beginAtZero: true
            }
          }
        }
      });
    }

    var prodCanvas = host.querySelector('#chartCcProductividad');
    if (prodCanvas && model.hasProductividad && model.productividad.series.values.length) {
      var ps = model.productividad.series;
      registry.chartCcProductividad = new Chart(prodCanvas, {
        type: 'bar',
        data: {
          labels: ps.labels,
          datasets: [{
            label: 'Completados',
            data: ps.values,
            backgroundColor: 'rgba(16, 185, 129, 0.82)',
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: c.text }, grid: { display: false } },
            y: { ticks: { color: c.text, stepSize: 1 }, grid: { color: c.grid }, beginAtZero: true }
          }
        }
      });
    }

    return registry;
  }

  global.PlatformCommandCenter = {
    buildModel: buildModel,
    render: render,
    renderCharts: renderCharts,
    fmtMoney: fmtMoney
  };
})(typeof window !== 'undefined' ? window : this);
