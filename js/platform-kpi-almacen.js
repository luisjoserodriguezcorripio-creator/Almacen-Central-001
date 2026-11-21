/**
 * Portal KPIs de Almacén — captura, acumulados y proyección
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ac001_kpi_almacen_portal_v2';
  var LEGACY_KEY = 'ac001_kpi_almacen_portal_v1';
  var DEMO_PURGE_FLAG = 'ac001_kpi_demo_purged_v1';
  var MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  var METRICS = [
    { id: 'facturacion', name: 'Facturación', unit: 'RD$', rule: 'gte', agg: 'sum', owner: 'Despacho', desafio: '90%' },
    { id: 'fill_rate', name: 'Fill Rate', unit: '%', rule: 'gte', agg: 'avg', owner: 'Despacho', desafio: '95%' },
    { id: 'descarga_contenedores', name: 'Descarga de contenedores', unit: 'contenedores', rule: 'gte', agg: 'sum', owner: 'Recepción', desafio: '95%' },
    { id: 'diferencias_inventario', name: 'Diferencias de Inventario', unit: 'unidades', rule: 'lt', agg: 'sum', owner: 'Inventario', desafio: '0.0001', desafioHint: 'Valor inventario vs valor diferencia' },
    { id: 'acuracidad', name: 'Acuracidad', unit: '%', rule: 'gte', agg: 'avg', owner: 'Inventario', desafio: '95%' },
    { id: 'bpa', name: 'BPA', unit: '%', rule: 'gte', agg: 'avg', owner: 'Calidad', desafio: '85%' }
  ];

  var state = {
    store: {},
    dateKey: '',
    period: 'day',
    monthCursor: ''
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

  function formatDisplayDate(key) {
    var p = parseKey(key);
    if (!p.y || !p.m || !p.d) return '—';
    return p.d + '-' + MONTHS_SHORT[p.m - 1] + '-' + p.y;
  }

  function monthLabel(ym) {
    var p = String(ym).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, 1);
    return d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
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

  function looksLikeDemoDay(day) {
    if (!day || typeof day !== 'object') return false;
    var f = day.facturacion || {};
    var fr = day.fill_rate || {};
    var ac = day.acuracidad || {};
    var di = day.diferencias_inventario || {};
    var planFact = String(f.plan == null ? '' : f.plan);
    var planFill = String(fr.plan == null ? '' : fr.plan);
    var planAcu = String(ac.plan == null ? '' : ac.plan);
    var planDif = String(di.plan == null ? '' : di.plan);
    var hasLegacyDescarga = !!(day.descarga_local || day.descarga_importados);
    return planFact === '1850000' && planFill === '96' && planAcu === '98.5' && planDif === '40' &&
      (hasLegacyDescarga || !!(day.descarga_contenedores));
  }

  function ruleLabel(m) {
    return m.rule === 'lt' ? 'Verde si Real < Plan' : 'Verde si Real ≥ Plan';
  }

  function migrateDay(raw) {
    var day = emptyDay();
    if (!raw || typeof raw !== 'object') return day;
    METRICS.forEach(function (m) {
      if (raw[m.id]) {
        day[m.id] = {
          plan: raw[m.id].plan != null ? raw[m.id].plan : '',
          real: raw[m.id].real != null ? raw[m.id].real : '',
          note: raw[m.id].note != null ? raw[m.id].note : ''
        };
      }
    });
    if (!raw.descarga_contenedores && (raw.descarga_local || raw.descarga_importados)) {
      var a = raw.descarga_local || {};
      var b = raw.descarga_importados || {};
      var planSum = (num(a.plan) || 0) + (num(b.plan) || 0);
      var realSum = (num(a.real) || 0) + (num(b.real) || 0);
      var noteJoin = [a.note, b.note].filter(Boolean).join(' · ');
      var has = a.plan !== '' || a.real !== '' || b.plan !== '' || b.real !== '' ||
        a.plan != null || a.real != null || b.plan != null || b.real != null;
      if (has) {
        day.descarga_contenedores = {
          plan: String(planSum),
          real: String(realSum),
          note: noteJoin
        };
      }
    }
    return day;
  }

  function purgeDemoHistory(store) {
    try {
      if (localStorage.getItem(DEMO_PURGE_FLAG) === '1') return store;
      var out = {};
      var removed = 0;
      Object.keys(store || {}).forEach(function (k) {
        if (looksLikeDemoDay(store[k])) {
          removed += 1;
          return;
        }
        out[k] = store[k];
      });
      localStorage.setItem(DEMO_PURGE_FLAG, '1');
      if (removed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
        try { localStorage.removeItem(LEGACY_KEY); } catch (e1) { /* ignore */ }
      }
      return out;
    } catch (e) {
      return store || {};
    }
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(LEGACY_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      var out = {};
      Object.keys(parsed || {}).forEach(function (k) {
        out[k] = migrateDay(parsed[k]);
      });
      return purgeDemoHistory(out);
    } catch (e) {
      return {};
    }
  }

  function saveStore() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
  }

  function daysInPeriod() {
    var base = state.dateKey || todayLocal();
    if (state.period === 'day') return [base];
    if (state.period === 'yesterday') return [shiftDate(base, -1)];
    if (state.period === 'week') {
      var week = [];
      for (var i = 6; i >= 0; i--) week.push(shiftDate(base, -i));
      return week;
    }
    if (state.period === 'trimestre') {
      var p = parseKey(base);
      var end = new Date(p.y, p.m - 1, p.d);
      var start = new Date(p.y, p.m - 1, p.d);
      start.setMonth(start.getMonth() - 3);
      var keys = [];
      var cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cur <= end) {
        keys.push(toKey(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()));
        cur.setDate(cur.getDate() + 1);
      }
      return keys;
    }
    // month
    var pm = parseKey(base);
    var last = new Date(pm.y, pm.m, 0).getDate();
    var monthKeys = [];
    for (var d = 1; d <= last; d++) monthKeys.push(toKey(pm.y, pm.m, d));
    return monthKeys;
  }

  function aggregatePeriod() {
    var keys = daysInPeriod();
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
    if (state.period === 'day') return formatDisplayDate(base);
    if (state.period === 'yesterday') return formatDisplayDate(shiftDate(base, -1));
    if (state.period === 'week') {
      return formatDisplayDate(shiftDate(base, -6)) + ' → ' + formatDisplayDate(base);
    }
    if (state.period === 'trimestre') {
      var pt = parseKey(base);
      var startT = new Date(pt.y, pt.m - 1, pt.d);
      startT.setMonth(startT.getMonth() - 3);
      return formatDisplayDate(toKey(startT.getFullYear(), startT.getMonth() + 1, startT.getDate())) +
        ' → ' + formatDisplayDate(base);
    }
    var p = parseKey(base);
    return monthLabel(p.y + '-' + String(p.m).padStart(2, '0'));
  }

  function isSingleDayPeriod() {
    return state.period === 'day' || state.period === 'yesterday';
  }

  function captureTargetKey() {
    var base = state.dateKey || todayLocal();
    if (state.period === 'yesterday') return shiftDate(base, -1);
    return base;
  }

  function isWithinOpenWindow(key) {
    var today = todayLocal();
    return key === today || key === shiftDate(today, -1);
  }

  /** Solo hoy y ayer se editan. Se puede guardar parcial. */
  function isCaptureEditable() {
    if (!isSingleDayPeriod()) return false;
    return isWithinOpenWindow(captureTargetKey());
  }

  function readFormIntoStore() {
    if (!isCaptureEditable()) return;
    var key = captureTargetKey();
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
    state.store[key] = day;
    saveStore();
  }

  function writeFormFromDay(day, editable) {
    day = day || emptyDay();
    if (editable == null) editable = isCaptureEditable();
    METRICS.forEach(function (m) {
      var row = day[m.id] || {};
      var planEl = $('plan_' + m.id);
      var realEl = $('real_' + m.id);
      var noteEl = $('note_' + m.id);
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
      var desafioTitle = m.desafioHint ? ' title="' + m.desafioHint + '"' : '';
      var desafioHint = m.desafioHint ? '<small class="kpi-desafio-hint">' + m.desafioHint + '</small>' : '';
      return '<div class="kpi-row" data-id="' + m.id + '">' +
        '<div><strong>' + m.name + '</strong><small>' + m.owner + ' · ' + ruleLabel(m) + '</small></div>' +
        '<div class="kpi-desafio"' + desafioTitle + '><strong>' + m.desafio + '</strong>' + desafioHint + '</div>' +
        '<input id="plan_' + m.id + '" type="number" step="any" inputmode="decimal" placeholder="0" aria-label="Plan ' + m.name + '">' +
        '<input id="real_' + m.id + '" type="number" step="any" inputmode="decimal" placeholder="0" aria-label="Real ' + m.name + '">' +
        '<textarea id="note_' + m.id + '" placeholder="Comentario / acción (causa · dueño · compromiso)"></textarea>' +
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
      var noteBit = (!compact && row.note) ? ' · ' + row.note : '';
      return '<article class="kpi-card is-' + st + '">' +
        '<h3>' + m.name + '</h3>' +
        '<span class="kpi-badge">' + badge + '</span>' +
        '<p class="kpi-meta">Desafío ' + m.desafio + ' · Plan ' + formatVal(m, row.plan) + ' · Real ' + formatVal(m, row.real) + extra + noteBit + '</p></article>';
    }).join('');
  }

  function renderExec(agg) {
    var c = countFromAgg(agg);
    var scored = c.ok + c.bad;
    if ($('execOk')) $('execOk').textContent = String(c.ok);
    if ($('execBad')) $('execBad').textContent = String(c.bad);
    if ($('execPct')) $('execPct').textContent = scored ? Math.round((c.ok / scored) * 100) + '%' : '—';
    if ($('projOk')) $('projOk').textContent = String(c.ok);
    if ($('projBad')) $('projBad').textContent = String(c.bad);
    if ($('projPct')) $('projPct').textContent = scored ? Math.round((c.ok / scored) * 100) + '%' : '—';
  }

  function renderExcept(agg) {
    var list = $('kpiExceptList');
    var box = $('kpiExcept');
    var title = $('exceptTitle');
    if (!list || !box) return;
    var bads = [];
    METRICS.forEach(function (m) {
      var row = agg.metrics[m.id] || {};
      if (row.status !== 'bad') return;
      bads.push('<div class="kpi-except-item"><strong>' + m.name + '</strong><span>' +
        m.owner + ' · Plan ' + formatVal(m, row.plan) + ' · Real ' + formatVal(m, row.real) +
        (row.note ? ' · ' + row.note : '') +
        '</span></div>');
    });
    if (bads.length) {
      box.classList.remove('is-empty');
      if (title) title.textContent = 'Excepciones (' + bads.length + ')';
      list.innerHTML = bads.join('');
    } else {
      box.classList.add('is-empty');
      if (title) title.textContent = 'Sin excepciones';
      list.innerHTML = '<div class="kpi-except-item"><strong>Todos lograron la meta</strong></div>';
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
    var startPad = (first.getDay() + 6) % 7;
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
        if (isCaptureEditable()) readFormIntoStore();
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
    var title = periodTitle();
    if ($('kpiResultSub')) $('kpiResultSub').textContent = title;
    if ($('kpiProjSub')) $('kpiProjSub').textContent = title;
    renderExec(agg);
    renderBoard('kpiBoard', agg, false);
    renderBoard('kpiProjBoard', agg, true);
    renderExcept(agg);
    renderMonth();
  }

  function loadPeriodIntoUI() {
    var agg = aggregatePeriod();
    if (isSingleDayPeriod()) {
      var key = captureTargetKey();
      writeFormFromDay(state.store[key] || emptyDay(), isCaptureEditable());
    } else {
      fillFormFromAggregate(agg);
    }
    renderViews();
  }

  function setMeeting(on) {
    document.body.classList.toggle('kpi-meeting', !!on);
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
        if (!isSingleDayPeriod()) {
          state.period = 'day';
          state.dateKey = todayLocal();
          if ($('kpiDate')) $('kpiDate').value = state.dateKey;
          syncPeriodButtons();
          loadPeriodIntoUI();
        } else if (!isWithinOpenWindow(captureTargetKey())) {
          state.period = 'day';
          state.dateKey = todayLocal();
          if ($('kpiDate')) $('kpiDate').value = state.dateKey;
          syncPeriodButtons();
          loadPeriodIntoUI();
        }
        readFormIntoStore();
        loadPeriodIntoUI();
        var btn = $('kpiSave');
        var prev = btn.textContent;
        btn.textContent = 'Guardado';
        setTimeout(function () { btn.textContent = prev; }, 900);
      });
    }

    if ($('kpiMeet')) {
      $('kpiMeet').addEventListener('click', function () {
        if (isCaptureEditable()) readFormIntoStore();
        renderViews();
        setMeeting(true);
      });
    }

    var proj = document.querySelector('.kpi-projection');
    if (proj) {
      proj.addEventListener('dblclick', function () { setMeeting(false); });
    }

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

  global.PlatformKpiAlmacen = { METRICS: METRICS, reload: loadPeriodIntoUI };
})(typeof window !== 'undefined' ? window : this);
