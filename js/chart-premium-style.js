/**
 * Chart.js — estilo elite (gradientes, etiquetas, dona central, crosshair, tooltips)
 */
(function (global) {
  'use strict';

  var PLUGIN_BG = 'premiumCanvas';
  var PLUGIN_CROSS = 'premiumCrosshair';
  var PLUGIN_CENTER = 'donutCenter';
  var PLUGIN_GLOW = 'activeGlow';
  var registered = false;
  var datalabelsRegistered = false;

  var FONT = '"Plus Jakarta Sans", "DM Sans", system-ui, sans-serif';
  var ACCENT = '#d4af37';

  function parseRgb(color) {
    if (!color) return { r: 59, g: 130, b: 246, a: 1 };
    var s = String(color);
    var m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
    if (s[0] === '#') {
      var h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    return { r: 59, g: 130, b: 246, a: 1 };
  }

  function toRgba(c, a) {
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + (a != null ? a : c.a) + ')';
  }

  function lighten(c, amt) {
    return {
      r: Math.min(255, Math.round(c.r + (255 - c.r) * amt)),
      g: Math.min(255, Math.round(c.g + (255 - c.g) * amt)),
      b: Math.min(255, Math.round(c.b + (255 - c.b) * amt)),
      a: c.a
    };
  }

  function resolveColor(value, index) {
    if (typeof value === 'function') return value;
    if (Array.isArray(value)) return value[index % value.length];
    return value;
  }

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function formatValue(v, ctx, extra) {
    var n = Number(v);
    if (!isFinite(n)) return '';
    if (extra && extra.valueFormat === 'percent') return Math.round(n) + '%';
    if (extra && extra.valueFormat === 'money') {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
      return Math.round(n).toLocaleString('es-DO');
    }
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toLocaleString('es-DO');
  }

  function barGradientFn(baseColor, horizontal) {
    return function (ctx) {
      var chart = ctx.chart;
      var area = chart.chartArea;
      if (!area) return resolveColor(baseColor, ctx.dataIndex);
      var c = chart.ctx;
      var raw = resolveColor(baseColor, ctx.dataIndex);
      var rgb = parseRgb(raw);
      var g;
      if (horizontal) {
        g = c.createLinearGradient(area.left, 0, area.right, 0);
        g.addColorStop(0, toRgba(lighten(rgb, 0.06), 0.78));
        g.addColorStop(0.5, toRgba(rgb, 0.96));
        g.addColorStop(1, toRgba(lighten(rgb, 0.2), 1));
      } else {
        g = c.createLinearGradient(0, area.bottom, 0, area.top);
        g.addColorStop(0, toRgba(rgb, 0.7));
        g.addColorStop(0.4, toRgba(lighten(rgb, 0.1), 0.94));
        g.addColorStop(1, toRgba(lighten(rgb, 0.26), 1));
      }
      return g;
    };
  }

  function areaGradientFn(borderColor) {
    return function (ctx) {
      var chart = ctx.chart;
      var area = chart.chartArea;
      if (!area) return 'rgba(59,130,246,0.15)';
      var rgb = parseRgb(borderColor || '#3b82f6');
      var g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, toRgba(lighten(rgb, 0.18), 0.48));
      g.addColorStop(0.55, toRgba(rgb, 0.14));
      g.addColorStop(1, toRgba(rgb, 0.02));
      return g;
    };
  }

  var canvasBgPlugin = {
    id: PLUGIN_BG,
    beforeDraw: function (chart, _args, opts) {
      if (!opts.enabled) return;
      var area = chart.chartArea;
      if (!area || area.bottom <= area.top) return;
      var ctx = chart.ctx;
      var light = isLight();
      ctx.save();
      var pad = 8;
      var l = area.left - pad;
      var t = area.top - pad;
      var w = area.right - area.left + pad * 2;
      var h = area.bottom - area.top + pad * 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(l, t, w, h, 16);
      else ctx.rect(l, t, w, h);
      ctx.clip();
      var g = ctx.createLinearGradient(l, t, l + w, t + h);
      if (light) {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#f8fafc');
      } else {
        g.addColorStop(0, 'rgba(16, 26, 44, 0.65)');
        g.addColorStop(0.45, 'rgba(10, 18, 32, 0.4)');
        g.addColorStop(1, 'rgba(6, 11, 20, 0.55)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(l, t, w, h);
      ctx.strokeStyle = light ? 'rgba(15,36,64,0.08)' : 'rgba(212,175,55,0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(l + 0.5, t + 0.5, w - 1, h - 1);
      ctx.restore();
    }
  };

  var crosshairPlugin = {
    id: PLUGIN_CROSS,
    afterDatasetsDraw: function (chart) {
      var active = chart.getActiveElements();
      if (!active || !active.length) return;
      var area = chart.chartArea;
      if (!area) return;
      var el = active[0].element;
      var ctx = chart.ctx;
      var x = el.x;
      var y = el.y;
      if (x == null) return;
      var light = isLight();
      ctx.save();
      ctx.strokeStyle = light ? 'rgba(21, 101, 192, 0.28)' : 'rgba(212, 175, 55, 0.32)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      var circular = chart.config.type === 'doughnut' || chart.config.type === 'pie' || chart.config.type === 'polarArea';
      if (!circular) {
        ctx.beginPath();
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
      }
      if (y != null && !circular) {
        ctx.strokeStyle = light ? 'rgba(100, 116, 139, 0.2)' : 'rgba(148, 163, 184, 0.18)';
        ctx.beginPath();
        ctx.moveTo(area.left, y);
        ctx.lineTo(area.right, y);
        ctx.stroke();
      }
      if (y != null) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = light ? 'rgba(21, 101, 192, 0.15)' : 'rgba(212, 175, 55, 0.22)';
        ctx.fill();
        ctx.strokeStyle = light ? '#1565c0' : ACCENT;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  var donutCenterPlugin = {
    id: PLUGIN_CENTER,
    afterDraw: function (chart, _args, opts) {
      if (!opts || !opts.text) return;
      if (chart.config.type !== 'doughnut' && chart.config.type !== 'pie') return;
      var area = chart.chartArea;
      if (!area) return;
      var ctx = chart.ctx;
      var cx = (area.left + area.right) / 2;
      var cy = (area.top + area.bottom) / 2;
      var light = isLight();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.color || (light ? '#0f172a' : '#f8fafc');
      ctx.font = '800 ' + (opts.sizeMain || 18) + 'px ' + FONT;
      ctx.fillText(opts.text.main || '', cx, cy - 6);
      if (opts.text.sub) {
        ctx.fillStyle = opts.subColor || (light ? '#64748b' : '#94a3b8');
        ctx.font = '600 ' + (opts.sizeSub || 11) + 'px ' + FONT;
        ctx.fillText(opts.text.sub, cx, cy + 14);
      }
      ctx.restore();
    }
  };

  var activeGlowPlugin = {
    id: PLUGIN_GLOW,
    afterDatasetsDraw: function (chart) {
      var active = chart.getActiveElements();
      if (!active || !active.length) return;
      var el = active[0].element;
      var ctx = chart.ctx;
      var x = el.x;
      var y = el.y;
      if (x == null || y == null) return;
      ctx.save();
      var g = ctx.createRadialGradient(x, y, 0, x, y, 28);
      g.addColorStop(0, isLight() ? 'rgba(21,101,192,0.18)' : 'rgba(59,130,246,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  function registerDataLabels() {
    if (datalabelsRegistered || typeof Chart === 'undefined') return;
    var dl = global.ChartDataLabels;
    if (!dl) return;
    try {
      Chart.register(dl);
      datalabelsRegistered = true;
    } catch (e) {
      if (Chart.registry && Chart.registry.plugins.get('datalabels')) datalabelsRegistered = true;
    }
  }

  function registerPlugins() {
    if (registered || typeof Chart === 'undefined') return registered;
    registerDataLabels();
    try {
      Chart.register(canvasBgPlugin, crosshairPlugin, donutCenterPlugin, activeGlowPlugin);
      registered = true;
      Chart.defaults.font.family = FONT;
      Chart.defaults.font.size = 12;
      Chart.defaults.plugins.tooltip.cornerRadius = 12;
      Chart.defaults.plugins.tooltip.padding = 16;
      Chart.defaults.plugins.tooltip.boxPadding = 8;
      Chart.defaults.plugins.tooltip.usePointStyle = true;
      Chart.defaults.animation.duration = 820;
      Chart.defaults.animation.easing = 'easeOutCubic';
    } catch (e) {
      if (Chart.registry && Chart.registry.plugins.get(PLUGIN_BG)) registered = true;
    }
    return registered;
  }

  function isCircular(type) {
    return type === 'doughnut' || type === 'pie' || type === 'polarArea';
  }

  function buildDataLabelsOptions(chartType, data, extra) {
    if (!global.ChartDataLabels || (extra && extra.noDataLabels)) {
      return { datalabels: { display: false } };
    }
    if (!data || !data.labels || !data.labels.length) {
      return { datalabels: { display: false } };
    }
    var labels = (data && data.labels) || [];
    var n = labels.length;
    var datasets = (data && data.datasets) || [];
    var hasStack = datasets.some(function (d) { return d.stack; });
    var isCombo = datasets.length > 1 && datasets.some(function (d) { return d.type === 'line'; });
    var light = isLight();
    var textColor = light ? '#0f172a' : '#f8fafc';
    var base = {
      font: { family: FONT, weight: '700' },
      color: textColor,
      textStrokeColor: light ? 'rgba(255,255,255,0.85)' : 'rgba(8,14,24,0.65)',
      textStrokeWidth: 2,
      padding: 4
    };

    if (chartType === 'doughnut' || chartType === 'pie') {
      return {
        datalabels: Object.assign({}, base, {
          color: '#ffffff',
          textStrokeColor: 'rgba(0,0,0,0.35)',
          textStrokeWidth: 1,
          anchor: 'center',
          align: 'center',
          formatter: function (value, ctx) {
            var arr = ctx.chart.data.datasets[0].data;
            var total = arr.reduce(function (a, b) { return a + (Number(b) || 0); }, 0) || 1;
            var pct = Math.round((value / total) * 100);
            return pct >= 7 ? pct + '%' : '';
          },
          font: { size: 11, weight: '800', family: FONT }
        })
      };
    }

    if (chartType === 'polarArea' && n <= 10) {
      return {
        datalabels: Object.assign({}, base, {
          anchor: 'end',
          align: 'end',
          offset: 2,
          formatter: function (v) { return formatValue(v, null, extra); },
          font: { size: 10, weight: '700', family: FONT }
        })
      };
    }

    if (hasStack && chartType === 'line') {
      return { datalabels: { display: false } };
    }

    if (chartType === 'bar' && !isCombo && n > 0 && n <= 14) {
      var horizontal = extra && extra.indexAxis === 'y';
      return {
        datalabels: Object.assign({}, base, {
          anchor: horizontal ? 'end' : 'end',
          align: horizontal ? 'right' : 'top',
          offset: horizontal ? 6 : 4,
          formatter: function (v) { return formatValue(v, null, extra); },
          font: { size: horizontal ? 10 : 11, weight: '700', family: FONT },
          display: function (ctx) {
            var v = ctx.dataset.data[ctx.dataIndex];
            return v != null && Number(v) > 0;
          }
        })
      };
    }

    if (chartType === 'line' && !hasStack && n <= 18 && datasets.length === 1) {
      return {
        datalabels: Object.assign({}, base, {
          align: 'top',
          anchor: 'end',
          offset: 6,
          formatter: function (v) { return formatValue(v, null, extra); },
          font: { size: 10, weight: '700', family: FONT },
          display: function (ctx) {
            var arr = ctx.dataset.data.map(function (x) { return Number(x) || 0; });
            var max = Math.max.apply(null, arr);
            return Number(ctx.dataset.data[ctx.dataIndex]) === max && max > 0;
          }
        })
      };
    }

    return { datalabels: { display: false } };
  }

  function enhanceDatasets(data, chartType, colors, extra) {
    if (!data || !data.datasets) return data;
    colors = colors || {};
    extra = extra || {};
    var circular = isCircular(chartType);
    var horizontal = extra.indexAxis === 'y';
    data.datasets = data.datasets.map(function (ds) {
      var copy = Object.assign({}, ds);
      var type = copy.type || chartType;

      if (type === 'line') {
        var border = copy.borderColor || '#3b82f6';
        if (copy.fill && copy.stack && typeof copy.backgroundColor !== 'function') {
          /* sólido apilado */
        } else if (copy.fill && typeof copy.backgroundColor !== 'function') {
          copy.backgroundColor = areaGradientFn(border);
        }
        copy.borderWidth = copy.borderWidth || 2.5;
        copy.pointRadius = copy.pointRadius != null ? copy.pointRadius : 0;
        copy.pointHoverRadius = copy.pointHoverRadius || 7;
        copy.pointBackgroundColor = copy.pointBackgroundColor || (isLight() ? '#fff' : '#0f172a');
        copy.pointBorderColor = copy.pointBorderColor || border;
        copy.pointBorderWidth = copy.pointBorderWidth || 2;
        copy.tension = copy.tension != null ? copy.tension : 0.4;
        if (copy.pointRadius === 0 && copy.data && copy.data.length <= 24) {
          copy.pointRadius = 4;
          copy.pointHoverRadius = 8;
        }
      } else if (type === 'bar' || (!type && chartType === 'bar')) {
        if (typeof copy.backgroundColor !== 'function') {
          copy.backgroundColor = barGradientFn(copy.backgroundColor || 'rgba(37,99,235,0.92)', horizontal);
        }
        copy.borderRadius = copy.borderRadius || 10;
        copy.borderSkipped = false;
        copy.maxBarThickness = copy.maxBarThickness || 52;
      } else if (circular) {
        copy.borderWidth = copy.borderWidth != null ? copy.borderWidth : 3;
        copy.borderColor = copy.borderColor || (isLight() ? '#ffffff' : (colors.chartBg || 'rgba(8, 14, 24, 0.7)'));
        copy.hoverBorderWidth = 4;
        copy.hoverOffset = copy.hoverOffset != null ? copy.hoverOffset : 12;
        copy.spacing = copy.spacing != null ? copy.spacing : 3;
      }
      return copy;
    });
    return data;
  }

  function mergeOptions(chartOpts, colors, extra) {
    registerPlugins();
    colors = colors || {};
    extra = extra || {};
    var light = isLight();
    var fs = (extra && extra.fontSize) || 12;
    if (extra && extra.tvMode) fs = 15;

    chartOpts.layout = chartOpts.layout || {};
    chartOpts.layout.padding = chartOpts.layout.padding || { top: 12, right: 20, bottom: 8, left: 12 };

    chartOpts.plugins = chartOpts.plugins || {};
    if (extra && extra.biChart) {
      chartOpts.plugins[PLUGIN_BG] = { enabled: false };
      chartOpts.plugins[PLUGIN_CROSS] = { enabled: false };
      chartOpts.plugins[PLUGIN_GLOW] = { enabled: false };
    } else {
      chartOpts.plugins[PLUGIN_BG] = { enabled: true };
      chartOpts.plugins[PLUGIN_CROSS] = { enabled: true };
      chartOpts.plugins[PLUGIN_GLOW] = { enabled: true };
    }

    if (extra.donutCenter) {
      chartOpts.plugins[PLUGIN_CENTER] = extra.donutCenter;
    }

    if (extra && extra.facVisual) {
      chartOpts.plugins.legend = Object.assign({ display: false }, chartOpts.plugins.legend || {});
      chartOpts.plugins.datalabels = { display: false };
    }

    var dlOpts = buildDataLabelsOptions(extra.chartType || chartOpts.type, extra.chartData, extra);
    chartOpts.plugins.datalabels = Object.assign({}, dlOpts.datalabels, (chartOpts.plugins.datalabels || {}));

    var valueFormat = extra.valueFormat;
    chartOpts.plugins.tooltip = Object.assign({
      backgroundColor: light ? 'rgba(255, 255, 255, 0.98)' : 'rgba(6, 11, 20, 0.97)',
      titleColor: light ? '#0f172a' : '#f8fafc',
      bodyColor: light ? '#334155' : '#e2e8f0',
      footerColor: light ? '#64748b' : '#94a3b8',
      borderColor: light ? 'rgba(21, 101, 192, 0.3)' : 'rgba(212, 175, 55, 0.4)',
      borderWidth: 1,
      titleFont: { size: fs + 1, weight: '800', family: FONT },
      bodyFont: { size: fs, weight: '600', family: FONT },
      footerFont: { size: fs - 1, weight: '600', family: FONT },
      displayColors: true,
      boxWidth: 10,
      boxHeight: 10,
      caretSize: 8,
      padding: 16,
      callbacks: {
        label: function (ctx) {
          var label = ctx.dataset.label || '';
          var v = ctx.parsed.y != null ? ctx.parsed.y : (ctx.parsed.x != null ? ctx.parsed.x : ctx.parsed);
          if (ctx.parsed.r != null) v = ctx.parsed.r;
          if (typeof v === 'object' && v !== null) v = v.y != null ? v.y : v;
          var line = label ? label + ': ' : '';
          line += formatValue(v, ctx, { valueFormat: valueFormat });
          return line;
        },
        footer: function (items) {
          if (extra.isCombo || !items || items.length < 2) return '';
          var sum = 0;
          items.forEach(function (it) {
            var v = it.parsed.y != null ? it.parsed.y : (it.parsed.x != null ? it.parsed.x : it.parsed);
            if (typeof v === 'number' && isFinite(v)) sum += v;
          });
          if (sum <= 0) return '';
          return 'Σ ' + formatValue(sum, null, { valueFormat: valueFormat });
        }
      }
    }, chartOpts.plugins.tooltip || {});

    chartOpts.plugins.legend = Object.assign({
      labels: {
        color: colors.text || (light ? '#0f172a' : '#e2e8f0'),
        font: { size: fs, weight: '700', family: FONT },
        padding: 18,
        usePointStyle: true,
        pointStyleWidth: 12,
        boxWidth: 8
      }
    }, chartOpts.plugins.legend || {});

    chartOpts.animation = Object.assign({
      duration: extra && extra.tvMode ? 520 : 880,
      easing: 'easeOutCubic',
      delay: function (ctx) {
        if (ctx.type === 'data' && ctx.mode === 'default') return Math.min(ctx.dataIndex * 22, 400);
      }
    }, chartOpts.animation || {});

    chartOpts.scales = chartOpts.scales || {};
    ['x', 'y'].forEach(function (axis) {
      if (!chartOpts.scales[axis]) return;
      chartOpts.scales[axis] = Object.assign({
        border: { display: false },
        grid: {
          color: colors.grid || (light ? 'rgba(15,36,64,0.07)' : 'rgba(255,255,255,0.07)'),
          lineWidth: 1,
          drawTicks: false
        },
        ticks: {
          color: colors.muted || colors.text,
          font: { size: fs, weight: '600', family: FONT },
          padding: 10
        }
      }, chartOpts.scales[axis]);
    });

    if (chartOpts.scales.r) {
      chartOpts.scales.r = Object.assign({
        grid: { color: colors.grid || 'rgba(255,255,255,0.08)' },
        angleLines: { color: colors.grid || 'rgba(255,255,255,0.06)', lineWidth: 1 },
        ticks: { display: false, backdropColor: 'transparent' },
        pointLabels: {
          color: colors.text,
          font: { size: fs, weight: '700', family: FONT }
        }
      }, chartOpts.scales.r);
    }

    chartOpts.interaction = Object.assign({
      mode: 'index',
      intersect: false
    }, chartOpts.interaction || {});

    chartOpts.elements = Object.assign({
      line: { borderCapStyle: 'round', borderJoinStyle: 'round' },
      point: { hoverBorderWidth: 2.5 },
      bar: { borderRadius: 10 }
    }, chartOpts.elements || {});

    return chartOpts;
  }

  function applyHorizontalBarGradients(chart) {
    if (!chart || chart.options.indexAxis !== 'y') return;
    var data = chart.data;
    if (!data || !data.datasets) return;
    data.datasets.forEach(function (ds) {
      if (ds.type === 'line') return;
      if (typeof ds.backgroundColor === 'function') return;
      ds.backgroundColor = barGradientFn(ds.backgroundColor, true);
    });
    chart.update('none');
  }

  registerPlugins();
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', registerPlugins);
  }

  global.ChartPremiumStyle = {
    register: registerPlugins,
    mergeOptions: mergeOptions,
    enhanceDatasets: enhanceDatasets,
    applyHorizontalBarGradients: applyHorizontalBarGradients,
    formatValue: formatValue,
    areaGradientFn: areaGradientFn,
    barGradientFn: barGradientFn
  };
})(typeof window !== 'undefined' ? window : this);
