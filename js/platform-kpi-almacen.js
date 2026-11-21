/**
 * Portal KPIs de Almacén — captura diaria, acumulados y proyección gerencial
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ac001_kpi_almacen_portal_v1';
  var METRICS = [
    { id: 'descarga_local', name: 'Descarga Contenedores Local', unit: 'contenedores', rule: 'gte', agg: 'sum', owner: 'Recepción' },
    { id: 'descarga_importados', name: 'Descarga Contenedores importados', unit: 'contenedores', rule: 'gte', agg: 'sum', owner: 'Recepción' },
    { id: 'facturacion', name: 'Facturación', unit: 'RD$', rule: 'gte', agg: 'sum', owner: 'Despacho' },
    { id: 'fill_rate', name: 'Fill Rate', unit: '%', rule: 'gte', agg: 'avg', owner: 'Despacho' },
    { id: 'diferencias_inventario', name: 'Diferencias de Inventario', unit: 'unidades', rule: 'lt', agg: 'sum', owner: 'Inventario' },
    { id: 'acuracidad', name: 'Acuracidad', unit: '%', rule: 'gte', agg: 'avg', owner: 'Inventario' }
  ];

  var state = {
    store: {},
    dateKey: '',
    period: 'day', // day | yesterday | week | month
    monthCursor: '' // YYYY-MM for calendar
  };

  function $(id) { return document.getElementById(id); }

  function todayLocal() {
    var d = new Date();
    return toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function toKey(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  function parseKey(key) {
    var p = String(key || '').split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  }

  function shiftDate(key, days) {
    var p = parseKey(key);
    var d = new Date(p.y, p.m - 1, p.d);
    d.setDate(d.getDate() + days);
    return toKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function monthLabel(ym) {
    var p = String(ym).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, 1);
    return d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  }

  function num(v) {
    if (v === '' || v == null) return null;
    var n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  function evalMetric(metric, plan, real) {
    if (plan == null || real == null) return 'empty';
    if (metric.rule === 'lt') return real < plan ? 'ok' : 'bad';
    return real >= plan ? 'ok' : 'bad';
  }

  function formatVal(metric, v) {
    if (v == null) return '—';
    if (metric.unit === '%') return v.toLocaleString('es-DO', { maximumFractionDigits: 1 }) + '%';
    if (metric.unit === 'RD$') return 'RD$ ' + v.toLocaleString('es-DO', { maximumFractionDigits: 0 });
    return v.toLocaleString('es-DO', { maximumFractionDigits: 1 });
  }

  function emptyDay() {
    var o = {};
    METRICS.forEach(function (m) {
      o[m.id] = { plan: '', real: '', note: '' };
    });
    return o;
  }

  function ruleLabel(m) {
    return m.rule === 'lt' ? 'Verde si Real < Plan' : 'Verde si Real ≥ Plan';
  }

  function daysInPeriod() {
    var base = state.dateKey || todayLocal();
    if (state.period === 'day') return [base];
    if (state.period === 'yesterday') return [shiftDate(base, -1)];
    if (state.period === 'week') {
      var out = [];
      for (var i = 6; i >= 0; i--) out.push(shiftDate(base, -i));
      return out;
    }
    // month of selected date
    var p = parseKey(base);
    var last = new Date(p.y, p.m, 0).getDate();
    var keys = [];
    for (var d = 1; d <= last; d++) keys.push(toKey(p.y, p.m, d));
    return keys;
  }

  function aggregatePeriod() {
    var keys = daysInPeriod();
    var used = 0;
    var result = {};
    METRICS.forEach(function (m) {
      var plans = [];
      var reals = [];
      var notes = [];
      keys.forEach(function (k) {
        var day = state.store[k];
        if (!day || !day[m.id]) return;
        var plan = num(day[m.id].plan);
        var real = num(day[m.id].real);
        if (plan == null && real == null) return;
        if (plan != null) plans.push(plan);
        if (real != null) reals.push(real);
        if (day[m.id].note) notes.push(day[m.id].note);
      });
      if (plans.length || reals.length) used += 1;
      var planAgg = null;
      var realAgg = null;
      if (m.agg === 'avg') {
        if (plans.length) planAgg = plans.reduce(function (a, b) { return a + b; }, 0) / plans.length;
        if (reals.length) realAgg = reals.reduce(function (a, b) { return a + b; }, 0) / reals.length;
      } else {
        if (plans.length) planAgg = plans.reduce(function (a, b) { return a + b; }, 0);
        if (reals.length) realAgg = reals.reduce(function (a, b) { return a + b; }, 0);
      }
      result[m.id] = {
        plan: planAgg,
        real: realAgg,
        note: notes[0] || '',
        daysPlan: plans.length,
        daysReal: reals.length,
        status: evalMetric(m, planAgg, realAgg)
      };
    });
    return {
      keys: keys,
      daysWithData: keys.filter(function (k) { return !!state.store[k]; }).length,
      metrics: result
    };
  }

  function periodTitle() {
    var base = state.dateKey || todayLocal();
    if (state.period === 'day') return 'Día ' + base;
    if (state.period === 'yesterday') return 'Ayer ' + shiftDate(base, -1);
    if (state.period === 'week') return 'Semana ' + shiftDate(base, -6) + ' → ' + base;
    var p = parseKey(base);
    return 'Mes ' + monthLabel(p.y + '-' + String(p.m).padStart(2, '0'));
  }

  function isCaptureEditable() {
    return state.period === 'day';
  }

  function readFormIntoStore() {
    if (!isCaptureEditable()) return;
    var day = emptyDay();
    METRICS.forEach(function (m) {
      var planEl = $('plan_' + m.id);
      var realEl = $('real_' + m.id);
      var noteEl = $('note_' + m.id);
      day[m.id] = {
        plan: planEl ? planEl.value : '',
        real: realEl ? realEl.value : '',
        note: noteEl ? noteEl.value : ''
      };
    });
    state.store[state.dateKey] = day;
    saveStore();
  }

  function writeFormFromDay(day) {
    day = day || emptyDay();
    METRICS.forEach(function (m) {
      var row = day[m.id] || {};
      var planEl = $('plan_' + m.id);
      var realEl = $('real_' + m.id);
      var noteEl = $('note_' + m.id);
      var editable = isCaptureEditable();
      if (planEl) {
        planEl.value = row.plan == null ? '' : row.plan;
        planEl.readOnly = !editable;
      }
      if (realEl) {
        realEl.value = row.real == null ? '' : row.real;
        realEl.readOnly = !editable;
      }
      if (noteEl) {
        noteEl.value = row.note || '';
        noteEl.readOnly = !editable;
      }
      var rowEl = document.querySelector('.kpi-row[data-id="' + m.id + '"]');
      if (rowEl) rowEl.classList.toggle('is-readonly', !editable);
    });
  }

  function fillFormFromAggregate(agg) {
    METRICS.forEach(function (m) {
      var row = agg.metrics[m.id] || {};
      var planEl = $('plan_' + m.id);
      var realEl = $('real_' + m.id);
      var noteEl = $('note_' + m.id);
      if (planEl) {
        planEl.value = row.plan == null ? '' : String(Math.round(row.plan * 100) / 100);
        planEl.readOnly = true;
      }
      if (realEl) {
        realEl.value = row.real == null ? '' : String(Math.round(row.real * 100) / 100);
        realEl.readOnly = true;
      }
      if (noteEl) {
        noteEl.value = row.note || '';
        noteEl.readOnly = true;
      }
      var rowEl = document.querySelector('.kpi-row[data-id="' + m.id + '"]');
      if (rowEl) rowEl.classList.add('is-readonly');
    });
  }

  function renderRows() {
    var host = $('kpiRows');
    if (!host) return;
    host.innerHTML = METRICS.map(function (m) {
      return '<div class="kpi-row" data-id="' + m.id + '">' +
        '<div><strong>' + m.name + '</strong><small>' + m.owner + ' · ' + ruleLabel(m) + '</small></div>' +
        '<input id="plan_' + m.id + '" type="number" step="any" inputmode="decimal" placeholder="0" aria-label="Plan ' + m.name + '">' +
        '<input id="real_' + m.id + '" type="number" step="any" inputmode="decimal" placeholder="0" aria-label="Real ' + m.name + '">' +
        '<textarea id="note_' + m.id + '" placeholder="Nota reunión (causa / acción)"></textarea>' +
      '</div>';
    }).join('');
    host.querySelectorAll('input, textarea').forEach(function (el) {
      el.addEventListener('input', function () {
        if (!isCaptureEditable()) return;
        readFormIntoStore();
        renderViews();
      });
    });
  }

  function countFromAgg(agg) {
    var ok = 0, bad = 0, empty = 0;
    METRICS.forEach(function (m) {
      var st = (agg.metrics[m.id] && agg.metrics[m.id].status) || 'empty';
      if (st === 'ok') ok++;
      else if (st === 'bad') bad++;
      else empty++;
    });
    return { ok: ok, bad: bad, empty: empty };
  }

  function renderBoard(hostId, agg, compact) {
    var host = $(hostId);
    if (!host) return;
    host.innerHTML = METRICS.map(function (m) {
      var row = agg.metrics[m.id] || {};
      var st = row.status || 'empty';
      var badge = st === 'ok' ? 'Logró' : (st === 'bad' ? 'No logró' : 'Sin dato');
      var extra = '';
      if (state.period !== 'day' && state.period !== 'yesterday' && (row.daysReal || row.daysPlan)) {
        extra = ' · ' + Math.max(row.daysReal || 0, row.daysPlan || 0) + ' días';
      }
      return '<article class="kpi-card is-' + st + '">' +
        '<h3>' + m.name + '</h3>' +
        '<span class="kpi-badge">' + badge + '</span>' +
        '<p class="kpi-meta">Plan ' + formatVal(m, row.plan) + ' · Real ' + formatVal(m, row.real) + extra +
          (!compact && row.note ? ' · ' + row.note : '') + '</p></article>';
    }).join('');
  }

  function renderExec(agg) {
    var c = countFromAgg(agg);
    var scored = c.ok + c.bad;
    if ($('execOk')) $('execOk').textContent = String(c.ok);
    if ($('execBad')) $('execBad').textContent = String(c.bad);
    if ($('execPct')) $('execPct').textContent = scored ? Math.round((c.ok / scored) * 100) + '%' : '—';
    if ($('execDays')) $('execDays').textContent = String(agg.daysWithData);
    if ($('projOk')) $('projOk').textContent = String(c.ok);
    if ($('projBad')) $('projBad').textContent = String(c.bad);
    if ($('projPct')) $('projPct').textContent = scored ? Math.round((c.ok / scored) * 100) + '%' : '—';
    if ($('projDays')) $('projDays').textContent = String(agg.daysWithData);

    // vs previous equivalent period
    var vsEl = $('execVs');
    var projVs = $('projVs');
    var prevOk = null;
    if (state.period === 'day' || state.period === 'yesterday') {
      var yKey = shiftDate(state.period === 'day' ? state.dateKey : shiftDate(state.dateKey, -1), -1);
      var yDay = state.store[yKey];
      if (yDay) {
        var yAgg = { metrics: {} };
        METRICS.forEach(function (m) {
          var row = yDay[m.id] || {};
          var plan = num(row.plan);
          var real = num(row.real);
          yAgg.metrics[m.id] = { status: evalMetric(m, plan, real) };
        });
        prevOk = countFromAgg(yAgg).ok;
      }
    }
    var label = '—';
    if (prevOk != null) {
      var delta = c.ok - prevOk;
      label = (delta > 0 ? '+' : '') + delta + ' ok';
    } else if (state.period === 'week' || state.period === 'month') {
      label = agg.daysWithData + ' días';
    }
    if (vsEl) vsEl.textContent = label;
    if (projVs) projVs.textContent = label;
  }

  function renderExcept(agg) {
    var list = $('kpiExceptList');
    var box = $('kpiExcept');
    var title = $('exceptTitle');
    var proj = $('kpiProjExcept');
    var projList = $('kpiProjExceptList');
    if (!list || !box) return;
    var bads = [];
    METRICS.forEach(function (m) {
      var row = agg.metrics[m.id] || {};
      if (row.status !== 'bad') return;
      bads.push({
        html: '<div class="kpi-except-item"><strong>' + m.name + '</strong><span>' +
          m.owner + ' · Plan ' + formatVal(m, row.plan) + ' · Real ' + formatVal(m, row.real) +
          (row.note ? ' · ' + row.note : '') + '</span></div>',
        chip: m.name
      });
    });
    if (bads.length) {
      box.classList.remove('is-empty');
      if (title) title.textContent = 'Excepciones (' + bads.length + ') — priorizar en reunión';
      list.innerHTML = bads.map(function (b) { return b.html; }).join('');
      if (proj) {
        proj.classList.remove('is-ok');
        proj.classList.add('is-bad');
        proj.querySelector('strong').textContent = bads.length + ' fuera de meta';
      }
      if (projList) projList.innerHTML = bads.map(function (b) { return '<span>' + b.chip + '</span>'; }).join('');
    } else {
      box.classList.add('is-empty');
      if (title) title.textContent = 'Sin excepciones — período en meta';
      list.innerHTML = '<div class="kpi-except-item"><strong>Todos lograron la meta</strong><span>Reconocer al equipo y cerrar.</span></div>';
      if (proj) {
        proj.classList.remove('is-bad');
        proj.classList.add('is-ok');
        proj.querySelector('strong').textContent = 'Sin excepciones';
      }
      if (projList) projList.innerHTML = '<span>Todos en meta</span>';
    }
  }

  function renderMonth() {
    var host = $('kpiMonthGrid');
    var label = $('kpiMonthLabel');
    if (!host) return;
    var ym = state.monthCursor || state.dateKey.slice(0, 7);
    if (label) label.textContent = monthLabel(ym);
    var parts = ym.split('-').map(Number);
    var y = parts[0];
    var m = parts[1];
    var first = new Date(y, m - 1, 1);
    var startPad = (first.getDay() + 6) % 7; // Monday first
    var lastDay = new Date(y, m, 0).getDate();
    var html = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(function (d) {
      return '<div class="kpi-month-dow">' + d + '</div>';
    }).join('');
    for (var i = 0; i < startPad; i++) {
      html += '<div class="kpi-day is-muted" aria-hidden="true"></div>';
    }
    for (var d = 1; d <= lastDay; d++) {
      var key = toKey(y, m, d);
      var day = state.store[key];
      var marks = METRICS.map(function (metric) {
        if (!day || !day[metric.id]) return 'empty';
        return evalMetric(metric, num(day[metric.id].plan), num(day[metric.id].real));
      });
      var selected = key === state.dateKey ? ' is-selected' : '';
      html += '<button type="button" class="kpi-day' + selected + '" data-date="' + key + '">' +
        '<strong>' + d + '</strong>' +
        '<span>' + (day ? 'OK' : '—') + '</span>' +
        '<div class="kpi-day-bar">' + marks.map(function (s) {
          return '<i class="' + (s === 'ok' ? 'ok' : (s === 'bad' ? 'bad' : '')) + '"></i>';
        }).join('') + '</div></button>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-date]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.dateKey = btn.getAttribute('data-date');
        state.period = 'day';
        syncPeriodButtons();
        if ($('kpiDate')) $('kpiDate').value = state.dateKey;
        loadPeriodIntoUI();
      });
    });
  }

  function syncPeriodButtons() {
    document.querySelectorAll('[data-period]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-period') === state.period);
    });
  }

  function renderViews() {
    var agg = aggregatePeriod();
    if ($('kpiResultSub')) {
      $('kpiResultSub').textContent = periodTitle() + ' · ' + agg.daysWithData + ' día(s) con dato';
    }
    if ($('kpiProjSub')) {
      $('kpiProjSub').textContent = periodTitle() + ' · ' + agg.daysWithData + ' día(s) con dato';
    }
    if ($('kpiCaptureHint')) {
      $('kpiCaptureHint').textContent = isCaptureEditable()
        ? 'Editando el día seleccionado (plan / real / nota).'
        : 'Vista acumulada (' + state.period + '): solo lectura. Elige “Día” para editar.';
    }
    renderExec(agg);
    renderBoard('kpiBoard', agg, false);
    renderBoard('kpiProjBoard', agg, true);
    renderExcept(agg);
    renderMonth();
  }

  function loadPeriodIntoUI() {
    var agg = aggregatePeriod();
    if (isCaptureEditable()) {
      writeFormFromDay(state.store[state.dateKey] || emptyDay());
    } else {
      fillFormFromAggregate(agg);
    }
    renderViews();
  }

  function setMeeting(on) {
    document.body.classList.toggle('kpi-meeting', !!on);
  }

  function fillDemo() {
    var base = state.dateKey || todayLocal();
    var demoToday = {
      descarga_local: { plan: '28', real: '31', note: '' },
      descarga_importados: { plan: '12', real: '10', note: 'Patio saturado AM' },
      facturacion: { plan: '1850000', real: '1925000', note: '' },
      fill_rate: { plan: '96', real: '97.2', note: '' },
      diferencias_inventario: { plan: '40', real: '22', note: '' },
      acuracidad: { plan: '98.5', real: '97.9', note: 'Recontar zona 12' }
    };
    state.store[base] = demoToday;
    // seed a few month days
    for (var i = 1; i <= 10; i++) {
      var k = shiftDate(base, -i);
      if (state.store[k]) continue;
      var okish = i % 3 !== 0;
      state.store[k] = {
        descarga_local: { plan: '28', real: okish ? '29' : '24', note: '' },
        descarga_importados: { plan: '12', real: okish ? '13' : '9', note: '' },
        facturacion: { plan: '1850000', real: okish ? '1900000' : '1700000', note: '' },
        fill_rate: { plan: '96', real: okish ? '96.5' : '94', note: '' },
        diferencias_inventario: { plan: '40', real: okish ? '18' : '45', note: '' },
        acuracidad: { plan: '98.5', real: okish ? '98.8' : '97.5', note: '' }
      };
    }
    saveStore();
    loadPeriodIntoUI();
  }

  function init() {
    state.store = loadStore();
    state.dateKey = todayLocal();
    state.period = 'day';
    state.monthCursor = state.dateKey.slice(0, 7);

    if ($('kpiDate')) $('kpiDate').value = state.dateKey;
    renderRows();
    syncPeriodButtons();
    loadPeriodIntoUI();

    if ($('kpiDate')) {
      $('kpiDate').addEventListener('change', function () {
        state.dateKey = $('kpiDate').value || todayLocal();
        state.monthCursor = state.dateKey.slice(0, 7);
        loadPeriodIntoUI();
      });
    }

    document.querySelectorAll('[data-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isCaptureEditable()) readFormIntoStore();
        state.period = btn.getAttribute('data-period') || 'day';
        syncPeriodButtons();
        loadPeriodIntoUI();
      });
    });

    if ($('kpiSave')) {
      $('kpiSave').addEventListener('click', function () {
        if (!isCaptureEditable()) {
          state.period = 'day';
          syncPeriodButtons();
          loadPeriodIntoUI();
        }
        readFormIntoStore();
        renderViews();
        var btn = $('kpiSave');
        var prev = btn.textContent;
        btn.textContent = 'Guardado';
        setTimeout(function () { btn.textContent = prev; }, 900);
      });
    }
    if ($('kpiFillDemo')) $('kpiFillDemo').addEventListener('click', fillDemo);
    if ($('kpiMeet')) {
      $('kpiMeet').addEventListener('click', function () {
        if (isCaptureEditable()) readFormIntoStore();
        renderViews();
        setMeeting(true);
      });
    }
    if ($('kpiExitMeet')) $('kpiExitMeet').addEventListener('click', function () { setMeeting(false); });
    if ($('kpiMonthPrev')) {
      $('kpiMonthPrev').addEventListener('click', function () {
        var p = state.monthCursor.split('-').map(Number);
        var d = new Date(p[0], p[1] - 2, 1);
        state.monthCursor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        renderMonth();
      });
    }
    if ($('kpiMonthNext')) {
      $('kpiMonthNext').addEventListener('click', function () {
        var p = state.monthCursor.split('-').map(Number);
        var d = new Date(p[0], p[1], 1);
        state.monthCursor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        renderMonth();
      });
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setMeeting(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.PlatformKpiAlmacen = {
    METRICS: METRICS,
    reload: loadPeriodIntoUI
  };
})(typeof window !== 'undefined' ? window : this);
