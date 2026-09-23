/**
 * Presentación TV — Gestión de Recepción (torre de control en vivo)
 */
(function (global) {
  'use strict';

  var FILTER_KEY = 'rec_present_date_range';
  var TZ = 'America/Santo_Domingo';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var filterBound = false;
  var mountEl = null;
  var lastSig = '';
  /** @type {{desde:string,hasta:string}|null} vacío = todas */
  var dateRange = null;

  function S() { return global.PlatformRecepcionStore; }

  function todayYmd() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function isoToYmd(iso) {
    if (!iso) return '';
    var raw = String(iso);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    var d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function addDaysYmd(ymd, days) {
    var d = new Date(ymd + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return isoToYmd(d.toISOString());
  }

  function startOfWeekYmd(ymd) {
    var d = new Date(ymd + 'T12:00:00');
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return isoToYmd(d.toISOString());
  }

  function startOfMonthYmd(ymd) {
    return String(ymd).slice(0, 8) + '01';
  }

  function normalizeRange(desde, hasta) {
    desde = (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) ? desde : '';
    hasta = (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) ? hasta : '';
    if (desde && hasta && desde > hasta) {
      var tmp = desde;
      desde = hasta;
      hasta = tmp;
    }
    return { desde: desde, hasta: hasta };
  }

  function rangeKey(r) {
    if (!r || (!r.desde && !r.hasta)) return 'all';
    return (r.desde || '') + '|' + (r.hasta || '');
  }

  function getDateRange() {
    if (dateRange !== null) return dateRange;
    var today = todayYmd();
    try {
      var saved = sessionStorage.getItem(FILTER_KEY);
      if (!saved || saved === 'all') {
        dateRange = { desde: '', hasta: '' };
      } else if (/^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(saved) ||
                 /^\d{4}-\d{2}-\d{2}\|$/.test(saved) ||
                 /^\|\d{4}-\d{2}-\d{2}$/.test(saved)) {
        var parts = saved.split('|');
        dateRange = normalizeRange(parts[0], parts[1]);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) {
        dateRange = { desde: saved, hasta: saved };
      } else {
        dateRange = { desde: today, hasta: today };
      }
    } catch (e) {
      dateRange = { desde: today, hasta: today };
    }
    return dateRange;
  }

  function setDateRange(desde, hasta) {
    dateRange = normalizeRange(desde, hasta);
    try {
      sessionStorage.setItem(FILTER_KEY, rangeKey(dateRange));
    } catch (e) { /* noop */ }
  }

  function applyPreset(mode) {
    var today = todayYmd();
    if (mode === 'today') setDateRange(today, today);
    else if (mode === 'week') setDateRange(startOfWeekYmd(today), today);
    else if (mode === '7d') setDateRange(addDaysYmd(today, -6), today);
    else if (mode === 'month') setDateRange(startOfMonthYmd(today), today);
    else if (mode === 'all') setDateRange('', '');
  }

  function activePreset(r) {
    var today = todayYmd();
    if (!r.desde && !r.hasta) return 'all';
    if (r.desde === today && r.hasta === today) return 'today';
    if (r.desde === startOfWeekYmd(today) && r.hasta === today) return 'week';
    if (r.desde === addDaysYmd(today, -6) && r.hasta === today) return '7d';
    if (r.desde === startOfMonthYmd(today) && r.hasta === today) return 'month';
    return '';
  }

  function fmtHintYmd(ymd) {
    if (!ymd) return '—';
    var p = ymd.split('-');
    var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return Number(p[2]) + ' ' + months[Number(p[1]) - 1] + ' ' + p[0];
  }

  function rangeHint(r) {
    if (!r.desde && !r.hasta) return 'Se muestran todos los registros';
    if (r.desde && r.hasta && r.desde === r.hasta) {
      return 'Se muestran registros del ' + fmtHintYmd(r.desde);
    }
    if (r.desde && r.hasta) {
      return 'Se muestran registros del ' + fmtHintYmd(r.desde) + ' al ' + fmtHintYmd(r.hasta);
    }
    if (r.desde) return 'Se muestran registros desde ' + fmtHintYmd(r.desde);
    return 'Se muestran registros hasta ' + fmtHintYmd(r.hasta);
  }

  function containerDateYmd(c) {
    return isoToYmd(c.atDescargado || c.fecha || c.createdAt || '');
  }

  function filterByRango(list, range) {
    var r = range || { desde: '', hasta: '' };
    if (!r.desde && !r.hasta) return (list || []).slice();
    return (list || []).filter(function (c) {
      var d = containerDateYmd(c);
      if (!d) return false;
      if (r.desde && d < r.desde) return false;
      if (r.hasta && d > r.hasta) return false;
      return true;
    });
  }

  function badge(val) {
    if (val === 'ok') return '<span class="rec-present-badge rec-present-badge--ok">OK</span>';
    return '<span class="rec-present-badge rec-present-badge--pend">PEND.</span>';
  }

  function tipoBadge(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    return '<span class="rec-present-tipo rec-present-tipo--' + cls + '">' +
      (tipo === 'local' ? 'LOCAL' : 'IMP.') + '</span>';
  }

  function person(name) {
    name = String(name || '').trim();
    if (!name || name === '—') {
      return '<span class="rec-present-person rec-present-person--na">—</span>';
    }
    return '<span class="rec-present-person">' + esc(name) + '</span>';
  }

  function fechaCell(iso, kind) {
    var store = S();
    var empty = !iso;
    var txt = empty ? '—' : store.formatFechaEtapa(iso);
    return '<td class="rec-present-fecha-etapa rec-present-fecha-etapa--' +
      (empty ? 'empty' : kind) + '">' + esc(txt) + '</td>';
  }

  function tallyByField(list, field, filterFn) {
    var map = Object.create(null);
    (list || []).forEach(function (c) {
      if (filterFn && !filterFn(c)) return;
      var name = String(c[field] || '').trim();
      if (!name || name === '—') return;
      map[name] = (map[name] || 0) + 1;
    });
    return Object.keys(map).map(function (k) {
      return { name: k, n: map[k] };
    }).sort(function (a, b) { return b.n - a.n; });
  }

  function buildChartStats(contenedores) {
    var store = S();
    if (store && store.resumenEquipoTv) {
      return store.resumenEquipoTv(contenedores);
    }
    return {
      operadores: tallyByField(contenedores, 'operadorDescarga'),
      validadores: tallyByField(contenedores, 'validadorPor', function (c) {
        return c.validado === 'ok';
      }),
      ubicadores: tallyByField(contenedores, 'ubicadorPor', function (c) {
        return c.ubicado === 'ok';
      })
    };
  }

  function maxN(list) {
    var m = 1;
    (list || []).forEach(function (x) { if (x.n > m) m = x.n; });
    return m;
  }

  function barPct(n, max) {
    return Math.max(8, Math.round((n / (max || 1)) * 100));
  }

  function renderChartRow(item, max, fillCls) {
    return '<div class="rec-tv-chart-row">' +
      '<span class="rec-tv-chart-name">' + esc(item.name) + '</span>' +
      '<div class="rec-tv-chart-bar"><div class="rec-tv-chart-fill' + (fillCls ? ' ' + fillCls : '') +
      '" style="width:' + barPct(item.n, max) + '%"></div></div>' +
      '<span class="rec-tv-chart-num">' + item.n + '</span></div>';
  }

  function renderChartSection(label, rows, fillCls, limit) {
    rows = (rows || []).slice();
    if (limit > 0) rows = rows.slice(0, limit);
    if (!rows.length) {
      return '<div class="rec-tv-chart-section"><div class="rec-tv-chart-section-lbl">' + esc(label) +
        '</div><div class="rec-tv-chart-rows"><div class="rec-tv-chart-empty">Sin datos</div></div></div>';
    }
    var mx = maxN(rows);
    return '<div class="rec-tv-chart-section"><div class="rec-tv-chart-section-lbl">' + esc(label) +
      '</div><div class="rec-tv-chart-rows">' +
      rows.map(function (x) { return renderChartRow(x, mx, fillCls); }).join('') +
      '</div></div>';
  }

  function renderDateFilter(range) {
    var r = range || { desde: '', hasta: '' };
    var preset = activePreset(r);
    function btn(mode, label) {
      return '<button type="button" class="rec-present-date-btn' +
        (preset === mode ? ' is-active' : '') +
        '" data-rec-date="' + mode + '">' + label + '</button>';
    }
    return '<div class="rec-present-date-filter" role="search">' +
      '<p class="rec-present-date-label">Rango de fecha</p>' +
      '<div class="rec-present-date-range-row">' +
      '<label class="rec-present-date-field" for="recPresentDateDesde">' +
      '<span>Desde</span>' +
      '<input type="date" id="recPresentDateDesde" class="rec-present-date-input" ' +
      'value="' + esc(r.desde || '') + '" aria-label="Fecha desde"></label>' +
      '<label class="rec-present-date-field" for="recPresentDateHasta">' +
      '<span>Hasta</span>' +
      '<input type="date" id="recPresentDateHasta" class="rec-present-date-input" ' +
      'value="' + esc(r.hasta || '') + '" aria-label="Fecha hasta"></label>' +
      '</div>' +
      '<div class="rec-present-date-presets">' +
      btn('today', 'Hoy') +
      btn('week', 'Esta semana') +
      btn('7d', 'Últimos 7 días') +
      btn('month', 'Este mes') +
      btn('all', 'Todas') +
      '</div>' +
      '<p class="rec-present-date-hint">' + esc(rangeHint(r)) + '</p>' +
      '</div>';
  }

  function renderToolbar(counts, chart) {
    return '<div class="rec-tv-toolbar">' +
      '<div class="rec-tv-kpis" role="group" aria-label="Resumen recepción">' +
      '<div class="rec-tv-kpi rec-tv-kpi--desc"><span class="rec-tv-kpi-icon" aria-hidden="true">📦</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + esc(String(counts.total || 0)) +
      '</span><span class="rec-tv-kpi-lbl">Descargados</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--tipo"><span class="rec-tv-kpi-icon" aria-hidden="true">⚖</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + esc(String(counts.local || 0)) +
      ' · ' + esc(String(counts.importado || 0)) + '</span>' +
      '<span class="rec-tv-kpi-lbl">Local · Importado</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--val"><span class="rec-tv-kpi-icon" aria-hidden="true">✓</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + esc(String(counts.validado || 0)) +
      '</span><span class="rec-tv-kpi-lbl">Validados</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--ent"><span class="rec-tv-kpi-icon" aria-hidden="true">→</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + esc(String(counts.conEntrada || 0)) +
      '</span><span class="rec-tv-kpi-lbl">Entrada</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--ubi"><span class="rec-tv-kpi-icon" aria-hidden="true">📍</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + esc(String(counts.conUbicado || 0)) +
      '</span><span class="rec-tv-kpi-lbl">Ubicados</span></div></div></div>' +
      '<aside class="rec-tv-chart rec-tv-chart--triple" aria-label="Productividad equipo">' +
      '<p class="rec-tv-chart-title">Equipo en recepción</p>' +
      renderChartSection('Operadores sentado', chart.operadores, '', 0) +
      renderChartSection('Validadores', chart.validadores, 'rec-tv-chart-fill--val', 0) +
      renderChartSection('Ubicadores', chart.ubicadores, 'rec-tv-chart-fill--ubi', 0) +
      '</aside></div>';
  }

  function signature(share, contenedores, counts, range) {
    if (!share || !share.active) return '';
    var rows = (contenedores || []).map(function (c) {
      return [
        c.contenedor, c.tipo, c.validado, c.entrada, c.ubicado,
        c.operadorDescarga, c.validadorPor, c.entradaPor, c.ubicadorPor,
        c.atDescargado, c.atValidado, c.atEntrada, c.atUbicado
      ].join(':');
    }).join('|');
    var c = counts || {};
    return share.updatedAt + '::' + rangeKey(range) + '::' + [
      c.total, c.validado, c.conEntrada, c.conUbicado
    ].join(',') + '::' + rows;
  }

  function renderRows(contenedores, range) {
    if (!contenedores.length) {
      var hasRange = range && (range.desde || range.hasta);
      var msg = hasRange
        ? 'Sin contenedores registrados en el rango seleccionado.'
        : 'Sin contenedores en seguimiento.';
      return '<tr><td colspan="17" class="rec-present-empty">' + esc(msg) + '</td></tr>';
    }
    return contenedores.map(function (c) {
      return '<tr>' +
        '<td class="rec-present-contenedor">' + esc(c.contenedor) + '</td>' +
        '<td>' + tipoBadge(c.tipo) + '</td>' +
        '<td class="rec-present-division">' + esc(c.division || '—') + '</td>' +
        '<td class="rec-present-desc">' + esc(c.descripcion || '—') + '</td>' +
        '<td class="rec-present-num">' + esc(String(c.paletas || 0)) + '</td>' +
        '<td class="rec-present-muelle">' + esc(c.muelle || '—') + '</td>' +
        '<td>' + person(c.operadorDescarga) + '</td>' +
        '<td>' + person(c.validadorPor) + '</td>' +
        '<td>' + person(c.entradaPor) + '</td>' +
        '<td>' + person(c.ubicadorPor) + '</td>' +
        fechaCell(c.atDescargado, 'desc') +
        fechaCell(c.atValidado, 'val') +
        fechaCell(c.atEntrada, 'ent') +
        fechaCell(c.atUbicado, 'ubi') +
        '<td class="rec-present-status">' + badge(c.validado) + '</td>' +
        '<td class="rec-present-status">' + badge(c.entrada) + '</td>' +
        '<td class="rec-present-status">' + badge(c.ubicado) + '</td>' +
        '</tr>';
    }).join('');
  }

  function getFilteredView(data) {
    var store = S();
    var activos = store.getContenedoresActivos(data.contenedores);
    var range = getDateRange();
    var filtrados = filterByRango(activos, range);
    return {
      range: range,
      contenedores: filtrados,
      counts: store.countResumen(filtrados),
      chart: buildChartStats(filtrados)
    };
  }

  function renderMount(share, data) {
    if (!mountEl) return;
    var store = S();
    if (!store) return;

    if (!share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      mountEl.innerHTML = '';
      document.body.classList.remove('rec-live-on');
      lastSig = '';
      return;
    }

    data = data || store.load();
    var view = getFilteredView(data);

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('rec-live-on');

    mountEl.innerHTML =
      '<div class="rec-present-shell rec-present-shell--tv">' +
      '<header class="rec-present-header">' +
      '<div class="rec-present-header-brand">' +
      '<img class="jc-logo-img jc-logo-img--present" src="assets/img/ac001-logo.svg?v=4" alt="AC" width="56" height="56">' +
      '<div class="rec-present-header-copy"><p class="rec-present-eyebrow">Almacén Central AC · EN VIVO</p>' +
      '<h1 class="rec-present-title">Gestión de Recepción y Ubicación</h1>' +
      '<p class="rec-present-sub">Recepción de contenedores</p></div></div>' +
      renderDateFilter(view.range) +
      '</header>' +
      renderToolbar(view.counts, view.chart) +
      '<div class="rec-present-table-wrap">' +
      '<table class="rec-present-table rec-present-table--tv" aria-label="Manifiesto recepción en vivo">' +
      '<thead><tr>' +
      '<th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>' +
      '<th>Op. sentado</th><th>Validador</th><th>Entrada</th><th>Ubicador</th>' +
      '<th>Descargado</th><th>Validado</th><th>Entrada</th><th>Ubicado</th>' +
      '<th>Val.</th><th>Ent.</th><th>Ubi.</th>' +
      '</tr></thead><tbody>' + renderRows(view.contenedores, view.range) + '</tbody></table></div></div>';

    lastSig = signature(share, view.contenedores, view.counts, view.range);
  }

  function refreshFromStore(force) {
    var store = S();
    if (!store) return;
    var data = store.load();
    var share = store.getLiveShareBoard(data);
    if (!share || !share.active) {
      renderMount(null);
      return;
    }
    var view = getFilteredView(data);
    var sig = signature(share, view.contenedores, view.counts, view.range);
    if (!force && sig === lastSig) return;
    renderMount(share, data);
  }

  function ensureMount() {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.getElementById('recGlobalLiveBoard');
    if (!mountEl) {
      mountEl = document.createElement('div');
      mountEl.id = 'recGlobalLiveBoard';
      mountEl.className = 'rec-live-present';
      mountEl.hidden = true;
      mountEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(mountEl);
    }
    return mountEl;
  }

  function bindFilterEvents() {
    if (filterBound) return;
    filterBound = true;
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || (t.id !== 'recPresentDateDesde' && t.id !== 'recPresentDateHasta')) return;
      var desdeEl = document.getElementById('recPresentDateDesde');
      var hastaEl = document.getElementById('recPresentDateHasta');
      setDateRange(
        desdeEl ? desdeEl.value : '',
        hastaEl ? hastaEl.value : ''
      );
      refreshFromStore(true);
    });
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-rec-date]') : null;
      if (!btn || !mountEl || !mountEl.contains(btn)) return;
      var mode = btn.getAttribute('data-rec-date');
      if (!mode) return;
      applyPreset(mode);
      refreshFromStore(true);
    });
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    opts = opts || {};
    ensureMount();
    bindFilterEvents();
    getDateRange();

    function onUpdate() { refreshFromStore(false); }

    global.addEventListener('recepcion-updated', onUpdate);
    global.addEventListener('recepcion-live-board', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (S() && S().STORAGE_KEY)) onUpdate();
    });
    if (typeof global.BroadcastChannel !== 'undefined') {
      var bc = new global.BroadcastChannel('recepcion-live-board');
      bc.onmessage = function () { onUpdate(); };
    }

    if (opts.displayMode) refreshFromStore(true);
  }

  global.PlatformRecepcionPresent = {
    bind: bind,
    refresh: function () { refreshFromStore(true); },
    render: renderMount
  };
})(typeof window !== 'undefined' ? window : this);
