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
    { id: 'diferencias_inventario', name: 'Diferencias de Inventario', unit: 'ratio', rule: 'lte', agg: 'avg', owner: 'Inventario', desafio: '0.0001', desafioHint: 'Valor inventario vs valor diferencia', decimals: 4 },
    { id: 'acuracidad', name: 'Acuracidad', unit: '%', rule: 'gte', agg: 'avg', owner: 'Inventario', desafio: '95%' },
    { id: 'bpa', name: 'BPA', unit: '%', rule: 'gte', agg: 'avg', owner: 'Calidad', desafio: '85%' }
  ];

  var OPEN_WINDOW_DAYS = 3; /* hoy + hasta 3 días atrás */

  var state = {
    store: {},
    dateFrom: '',
    dateTo: '',
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
    var s = String(v).trim().replace(/[$\s%]/g, '').replace(/,/g, '');
    if (!s) return null;
    var n = Number(s);
    return isNaN(n) ? null : n;
  }

  function storeNumberString(v, metric) {
    var n = num(v);
    if (n == null) return '';
    if (metric && metric.decimals != null) return n.toFixed(metric.decimals);
    if (metric && (metric.unit === '%' || metric.unit === 'RD$' || metric.unit === 'contenedores')) {
      return String(Math.round(n));
    }
    return String(n);
  }

  /** Miles con coma: 22887 → 22,887. Si decimals, fija decimales (ej. 0.0001). */
  function formatThousands(v, decimals) {
    if (v === '' || v == null) return '';
    var n = num(v);
    if (n == null) return '';
    var neg = n < 0;
    var abs = Math.abs(n);
    var raw = decimals != null ? abs.toFixed(decimals) : String(abs);
    var parts = raw.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + parts.join('.');
  }

  function formatMetricInput(metric, v) {
    if (v === '' || v == null) return '';
    var n = num(v);
    if (n == null) return '';
    if (metric.decimals != null) return formatThousands(n, metric.decimals);
    if (metric.unit === '%') return Math.round(n) + '%';
    if (metric.unit === 'RD$') return '$' + formatThousands(Math.round(n));
    return formatThousands(Math.round(n));
  }

  function evalMetric(metric, plan, real) {
    if (plan == null || real == null) return 'empty';
    if (metric.rule === 'lt') return real < plan ? 'ok' : 'bad';
    if (metric.rule === 'lte') return real <= plan ? 'ok' : 'bad';
    return real >= plan ? 'ok' : 'bad';
  }

  function formatVal(metric, v) {
    if (v == null) return '—';
    if (metric.decimals != null) return formatThousands(v, metric.decimals);
    if (metric.unit === '%') return Math.round(v) + '%';
    if (metric.unit === 'RD$') return '$' + formatThousands(Math.round(v));
    return formatThousands(Math.round(v));
  }

  /** Alcance siempre en % entero. Menor-es-mejor: Plan/Real. */
  function calcAlcance(metric, plan, real) {
    if (plan == null || real == null) return null;
    if (metric.rule === 'lt' || metric.rule === 'lte') {
      if (real === 0) return null;
      return Math.round((plan / real) * 100);
    }
    if (plan === 0) return null;
    return Math.round((real / plan) * 100);
  }

  function setAlcanceEl(metric, plan, real) {
    var el = $('alcance_' + metric.id);
    if (!el) return;
    var pct = calcAlcance(metric, plan, real);
    var st = evalMetric(metric, plan, real);
    el.className = 'kpi-alcance' + (st === 'ok' ? ' is-ok' : (st === 'bad' ? ' is-bad' : ''));
    el.textContent = pct == null ? '—' : pct + '%';
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
    if (m.rule === 'lt') return 'Verde si Real < Plan';
    if (m.rule === 'lte') return 'Verde si Real ≤ Plan';
    return 'Verde si Real ≥ Plan';
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

  function normalizeRange() {
    var from = state.dateFrom || todayLocal();
    var to = state.dateTo || todayLocal();
    if (from > to) {
      var tmp = from;
      from = to;
      to = tmp;
    }
    state.dateFrom = from;
    state.dateTo = to;
  }

  function keysBetween(from, to) {
    var keys = [];
    var p = parseKey(from);
    var end = parseKey(to);
    var cur = new Date(p.y, p.m - 1, p.d);
    var last = new Date(end.y, end.m - 1, end.d);
    while (cur <= last) {
      keys.push(toKey(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()));
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }

  function daysInPeriod() {
    normalizeRange();
    return keysBetween(state.dateFrom, state.dateTo);
  }

  function applyPeriodPreset(period) {
    var today = todayLocal();
    var to = state.dateTo || today;
    if (period === 'day') {
      state.dateFrom = today;
      state.dateTo = today;
    } else if (period === 'yesterday') {
      var y = shiftDate(today, -1);
      state.dateFrom = y;
      state.dateTo = y;
    } else if (period === 'week') {
      state.dateTo = today;
      state.dateFrom = shiftDate(today, -6);
    } else if (period === 'month') {
      var pm = parseKey(to);
      state.dateFrom = toKey(pm.y, pm.m, 1);
      state.dateTo = toKey(pm.y, pm.m, new Date(pm.y, pm.m, 0).getDate());
    } else if (period === 'trimestre') {
      var pt = parseKey(to);
      var startT = new Date(pt.y, pt.m - 1, pt.d);
      startT.setMonth(startT.getMonth() - 3);
      state.dateFrom = toKey(startT.getFullYear(), startT.getMonth() + 1, startT.getDate());
      state.dateTo = to;
    }
    state.period = period;
    state.monthCursor = state.dateTo.slice(0, 7);
    syncDateInputs();
  }

  function syncDateInputs() {
    if ($('kpiDateFrom')) $('kpiDateFrom').value = state.dateFrom;
    if ($('kpiDateTo')) $('kpiDateTo').value = state.dateTo;
  }

  function aggregatePeriod() {
    var keys = daysInPeriod();
    var result = {};
    var daysCounted = {};
    METRICS.forEach(function (m) {
      var plans = [];
      var reals = [];
      var notes = [];
      keys.forEach(function (k) {
        var day = state.store[k];
        if (!day || !day[m.id]) return;
        var plan = num(day[m.id].plan);
        var real = num(day[m.id].real);
        // Acumulado (semana/mes/etc.): solo Plan+Real registrados y guardados.
        if (plan == null || real == null) return;
        plans.push(plan);
        reals.push(real);
        daysCounted[k] = true;
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
      daysWithData: Object.keys(daysCounted).length,
      metrics: result
    };
  }

  function periodTitle() {
    normalizeRange();
    if (state.dateFrom === state.dateTo) return formatDisplayDate(state.dateTo);
    return formatDisplayDate(state.dateFrom) + ' → ' + formatDisplayDate(state.dateTo);
  }

  function isSingleDayPeriod() {
    normalizeRange();
    return state.dateFrom === state.dateTo;
  }

  function captureTargetKey() {
    normalizeRange();
    return state.dateTo;
  }

  function isWithinOpenWindow(key) {
    var today = todayLocal();
    var oldest = shiftDate(today, -OPEN_WINDOW_DAYS);
    return key >= oldest && key <= today;
  }

  /** Hoy y hasta 3 días atrás. Se puede guardar parcial. */
  function isCaptureEditable() {
    if (!isSingleDayPeriod()) return false;
    return isWithinOpenWindow(captureTargetKey());
  }

  /** Día válido solo si tiene Plan y Real guardados en al menos un indicador. */
  function dayHasSavedData(day) {
    if (!day) return false;
    for (var i = 0; i < METRICS.length; i++) {
      var row = day[METRICS[i].id] || {};
      if (num(row.plan) != null && num(row.real) != null) return true;
    }
    return false;
  }

  /** Último día con registro anterior a `key` (ej. lunes ← sábado si no hubo domingo). */
  function findLastRegisteredDay(beforeKey) {
    var keys = Object.keys(state.store || {}).filter(function (k) {
      return k < beforeKey && dayHasSavedData(state.store[k]);
    }).sort();
    if (!keys.length) return null;
    return state.store[keys[keys.length - 1]];
  }

  /** Prefill desde la última data registrada (plan/real); comentarios vacíos. */
  function cloneFromLastRegistered(key) {
    var prev = findLastRegisteredDay(key);
    if (!prev) return emptyDay();
    var out = emptyDay();
    METRICS.forEach(function (m) {
      var row = prev[m.id] || {};
      out[m.id] = {
        plan: row.plan != null && row.plan !== '' ? String(row.plan) : '',
        real: row.real != null && row.real !== '' ? String(row.real) : '',
        note: ''
      };
    });
    return out;
  }

  function resolveCaptureDay(key) {
    if (dayHasSavedData(state.store[key])) return state.store[key];
    return cloneFromLastRegistered(key);
  }

  function readFormDay() {
    var day = emptyDay();
    METRICS.forEach(function (m) {
      var planEl = $('plan_' + m.id);
      var realEl = $('real_' + m.id);
      var noteEl = $('note_' + m.id);
      day[m.id] = {
        plan: planEl ? storeNumberString(planEl.value, m) : '',
        real: realEl ? storeNumberString(realEl.value, m) : '',
        note: noteEl ? noteEl.value : ''
      };
    });
    return day;
  }

  /** Solo persiste al pulsar Guardar. */
  function readFormIntoStore() {
    if (!isCaptureEditable()) return;
    var key = captureTargetKey();
    state.store[key] = readFormDay();
    saveStore();
  }

  /** Vista previa del resultado sin guardar. */
  function withFormDraft(fn) {
    if (!isCaptureEditable()) {
      fn();
      return;
    }
    var key = captureTargetKey();
    var had = Object.prototype.hasOwnProperty.call(state.store, key);
    var backup = state.store[key];
    state.store[key] = readFormDay();
    try {
      fn();
    } finally {
      if (had) state.store[key] = backup;
      else delete state.store[key];
    }
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
        planEl.value = formatMetricInput(m, row.plan);
        planEl.readOnly = !editable;
      }
      if (realEl) {
        realEl.value = formatMetricInput(m, row.real);
        realEl.readOnly = !editable;
      }
      if (noteEl) {
        noteEl.value = row.note || '';
        noteEl.readOnly = !editable;
      }
      setAlcanceEl(m, num(row.plan), num(row.real));
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
      var planShow = row.plan;
      var realShow = row.real;
      if (planShow != null && m.decimals == null) planShow = Math.round(planShow);
      if (realShow != null && m.decimals == null) realShow = Math.round(realShow);
      if (planEl) {
        planEl.value = planShow == null ? '' : formatMetricInput(m, planShow);
        planEl.readOnly = true;
      }
      if (realEl) {
        realEl.value = realShow == null ? '' : formatMetricInput(m, realShow);
        realEl.readOnly = true;
      }
      if (noteEl) {
        noteEl.value = row.note || '';
        noteEl.readOnly = true;
      }
      setAlcanceEl(m, planShow, realShow);
      var rowEl = document.querySelector('.kpi-row[data-id="' + m.id + '"]');
      if (rowEl) rowEl.classList.add('is-readonly');
    });
  }

  function refreshRowAlcance(metricId) {
    var metric = METRICS.filter(function (m) { return m.id === metricId; })[0];
    if (!metric) return;
    var planEl = $('plan_' + metricId);
    var realEl = $('real_' + metricId);
    setAlcanceEl(metric, planEl ? num(planEl.value) : null, realEl ? num(realEl.value) : null);
  }

  function bindNumInput(el) {
    el.addEventListener('input', function () {
      if (!isCaptureEditable()) return;
      var row = el.closest('.kpi-row');
      if (row) refreshRowAlcance(row.getAttribute('data-id'));
      withFormDraft(renderViews);
    });
    el.addEventListener('blur', function () {
      if (el.readOnly) return;
      var row = el.closest('.kpi-row');
      var metricId = row ? row.getAttribute('data-id') : '';
      var metric = METRICS.filter(function (m) { return m.id === metricId; })[0];
      el.value = metric ? formatMetricInput(metric, el.value) : formatThousands(el.value);
      if (metric) refreshRowAlcance(metric.id);
      if (isCaptureEditable()) withFormDraft(renderViews);
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
        '<input id="plan_' + m.id + '" class="kpi-num" type="text" inputmode="decimal" placeholder="0" aria-label="Plan ' + m.name + '" autocomplete="off">' +
        '<input id="real_' + m.id + '" class="kpi-num" type="text" inputmode="decimal" placeholder="0" aria-label="Real ' + m.name + '" autocomplete="off">' +
        '<div class="kpi-alcance" id="alcance_' + m.id + '" aria-label="Alcance ' + m.name + '">—</div>' +
        '<textarea id="note_' + m.id + '" placeholder="Causa/Acción"></textarea>' +
      '</div>';
    }).join('');
    host.querySelectorAll('input.kpi-num').forEach(bindNumInput);
    host.querySelectorAll('textarea').forEach(function (el) {
      el.addEventListener('input', function () {
        if (!isCaptureEditable()) return;
        withFormDraft(renderViews);
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
      if (!isSingleDayPeriod() && (row.daysReal || row.daysPlan)) {
        extra = ' · ' + Math.max(row.daysReal || 0, row.daysPlan || 0) + ' días';
      }
      var noteBit = (!compact && row.note) ? ' · ' + row.note : '';
      var alcance = calcAlcance(m, row.plan, row.real);
      var alcanceBit = alcance == null ? '' : ' · Alcance ' + alcance + '%';
      return '<article class="kpi-card is-' + st + '">' +
        '<h3>' + m.name + '</h3>' +
        '<span class="kpi-badge">' + badge + '</span>' +
        '<p class="kpi-meta">Desafío ' + m.desafio + ' · Plan ' + formatVal(m, row.plan) + ' · Real ' + formatVal(m, row.real) + alcanceBit + extra + noteBit + '</p></article>';
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
    var ym = state.monthCursor || (state.dateTo || todayLocal()).slice(0, 7);
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
      var inRange = key >= state.dateFrom && key <= state.dateTo;
      var selected = inRange ? ' is-selected' : '';
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
        var key = btn.getAttribute('data-date');
        state.dateFrom = key;
        state.dateTo = key;
        state.period = 'day';
        state.monthCursor = key.slice(0, 7);
        syncPeriodButtons();
        syncDateInputs();
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
      var editable = isCaptureEditable();
      var day = editable ? resolveCaptureDay(key) : (state.store[key] || emptyDay());
      writeFormFromDay(day, editable);
      if (editable && !dayHasSavedData(state.store[key])) {
        withFormDraft(renderViews);
        return;
      }
    } else {
      fillFormFromAggregate(agg);
    }
    renderViews();
  }

  function setMeeting(on) {
    document.body.classList.toggle('kpi-meeting', !!on);
  }

  function onRangeChange() {
    state.dateFrom = ($('kpiDateFrom') && $('kpiDateFrom').value) || todayLocal();
    state.dateTo = ($('kpiDateTo') && $('kpiDateTo').value) || todayLocal();
    normalizeRange();
    state.period = state.dateFrom === state.dateTo ? 'day' : 'custom';
    state.monthCursor = state.dateTo.slice(0, 7);
    syncPeriodButtons();
    syncDateInputs();
    loadPeriodIntoUI();
  }

  function init() {
    state.store = loadStore();
    var today = todayLocal();
    state.dateFrom = today;
    state.dateTo = today;
    state.period = 'day';
    state.monthCursor = today.slice(0, 7);

    syncDateInputs();
    renderRows();
    syncPeriodButtons();
    loadPeriodIntoUI();

    if ($('kpiDateFrom')) $('kpiDateFrom').addEventListener('change', onRangeChange);
    if ($('kpiDateTo')) $('kpiDateTo').addEventListener('change', onRangeChange);

    document.querySelectorAll('[data-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyPeriodPreset(btn.getAttribute('data-period') || 'day');
        syncPeriodButtons();
        loadPeriodIntoUI();
      });
    });

    if ($('kpiSave')) {
      $('kpiSave').addEventListener('click', function () {
        if (!isSingleDayPeriod() || !isWithinOpenWindow(captureTargetKey())) {
          applyPeriodPreset('day');
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
        withFormDraft(renderViews);
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
