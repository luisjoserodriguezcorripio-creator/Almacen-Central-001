/**
 * Presentación TV — Gestión de Recepción (torre de control en vivo)
 */
(function (global) {
  'use strict';

  var FILTER_KEY = 'rec_present_date_filter';
  var TZ = 'America/Santo_Domingo';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var filterBound = false;
  var mountEl = null;
  var lastSig = '';
  var dateFilter = null; // '' = todas, 'YYYY-MM-DD' = día

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

  function getDateFilter() {
    if (dateFilter !== null) return dateFilter;
    try {
      var saved = sessionStorage.getItem(FILTER_KEY);
      if (saved === 'all' || saved === '') dateFilter = '';
      else if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) dateFilter = saved;
      else dateFilter = todayYmd();
    } catch (e) {
      dateFilter = todayYmd();
    }
    return dateFilter;
  }

  function setDateFilter(value) {
    if (value === 'all' || value === '' || value == null) dateFilter = '';
    else dateFilter = String(value).slice(0, 10);
    try {
      sessionStorage.setItem(FILTER_KEY, dateFilter === '' ? 'all' : dateFilter);
    } catch (e) { /* noop */ }
  }

  function containerDateYmd(c) {
    return isoToYmd(c.atDescargado || c.fecha || c.createdAt || '');
  }

  function filterByFecha(list, ymd) {
    if (!ymd) return (list || []).slice();
    return (list || []).filter(function (c) {
      return containerDateYmd(c) === ymd;
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

  function renderDateFilter(ymd) {
    var today = todayYmd();
    var isAll = !ymd;
    var isToday = ymd === today;
    return '<div class="rec-present-date-filter" role="search">' +
      '<label class="rec-present-date-label" for="recPresentDateFilter">Fecha</label>' +
      '<input type="date" id="recPresentDateFilter" class="rec-present-date-input" ' +
      'value="' + esc(ymd || '') + '" aria-label="Filtrar por fecha de registro">' +
      '<button type="button" class="rec-present-date-btn' + (isToday ? ' is-active' : '') +
      '" data-rec-date="today">Hoy</button>' +
      '<button type="button" class="rec-present-date-btn' + (isAll ? ' is-active' : '') +
      '" data-rec-date="all">Todas</button>' +
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

  function signature(share, contenedores, counts, ymd) {
    if (!share || !share.active) return '';
    var rows = (contenedores || []).map(function (c) {
      return [
        c.contenedor, c.tipo, c.validado, c.entrada, c.ubicado,
        c.operadorDescarga, c.validadorPor, c.entradaPor, c.ubicadorPor,
        c.atDescargado, c.atValidado, c.atEntrada, c.atUbicado
      ].join(':');
    }).join('|');
    var c = counts || {};
    return share.updatedAt + '::' + String(ymd || 'all') + '::' + [
      c.total, c.validado, c.conEntrada, c.conUbicado
    ].join(',') + '::' + rows;
  }

  function renderRows(contenedores, ymd) {
    if (!contenedores.length) {
      var msg = ymd
        ? 'Sin contenedores registrados en la fecha seleccionada.'
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
    var ymd = getDateFilter();
    var filtrados = filterByFecha(activos, ymd);
    return {
      ymd: ymd,
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
      '<img class="jc-logo-img jc-logo-img--present" src="assets/img/ac001-logo.svg?v=1" alt="AC" width="44" height="44">' +
      '<div class="rec-present-header-copy"><p class="rec-present-eyebrow">Almacén Central 001 · EN VIVO</p>' +
      '<h1 class="rec-present-title">Gestión de Recepción y Ubicación</h1>' +
      '<p class="rec-present-sub">Recepción de contenedores</p></div>' +
      renderDateFilter(view.ymd) +
      '</header>' +
      renderToolbar(view.counts, view.chart) +
      '<div class="rec-present-table-wrap">' +
      '<table class="rec-present-table rec-present-table--tv" aria-label="Manifiesto recepción en vivo">' +
      '<thead><tr>' +
      '<th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>' +
      '<th>Op. sentado</th><th>Validador</th><th>Entrada</th><th>Ubicador</th>' +
      '<th>Descargado</th><th>Validado</th><th>Entrada</th><th>Ubicado</th>' +
      '<th>Val.</th><th>Ent.</th><th>Ubi.</th>' +
      '</tr></thead><tbody>' + renderRows(view.contenedores, view.ymd) + '</tbody></table></div></div>';

    lastSig = signature(share, view.contenedores, view.counts, view.ymd);
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
    var sig = signature(share, view.contenedores, view.counts, view.ymd);
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
      if (!t || t.id !== 'recPresentDateFilter') return;
      setDateFilter(t.value || '');
      refreshFromStore(true);
    });
    document.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-rec-date]') : null;
      if (!btn || !mountEl || !mountEl.contains(btn)) return;
      var mode = btn.getAttribute('data-rec-date');
      if (mode === 'today') setDateFilter(todayYmd());
      else if (mode === 'all') setDateFilter('');
      else return;
      refreshFromStore(true);
    });
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    opts = opts || {};
    ensureMount();
    bindFilterEvents();
    getDateFilter();

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
