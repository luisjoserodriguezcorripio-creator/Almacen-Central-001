/**
 * Preview — varias vistas pantalla TV recepción (solo mock, no producción)
 */
(function (global) {
  'use strict';

  var VIEWS = {
    v1: { id: 'v1', label: 'V1 · KPI + tabla', cls: '' },
    v2: { id: 'v2', label: 'V2 · Personas', cls: '' },
    v3: { id: 'v3', label: 'V3 · Descarga destacada', cls: '' },
    v4: { id: 'v4', label: 'V4 · Ultra compacto', cls: 'rec-vp-v4' },
    v5: { id: 'v5', label: 'V5 · Gráfico triple', cls: '' }
  };

  var ROWS = [
    {
      cont: 'COR-45864564', tipo: 'local', div: 'COASIS', desc: 'GILLETTE', pal: 18, muelle: 'J77',
      operador: 'Pedro R.', validador: 'Kelvin P.', entradaPor: '—', ubicador: '—',
      fDesc: '20 junio 2026 · 8:31 a. m.', fVal: '20 junio 2026 · 9:15 a. m.', fEnt: '—', fUbi: '—',
      val: 'ok', ent: 'pend', ubi: 'pend'
    },
    {
      cont: 'COR-77123456', tipo: 'local', div: 'COASIS', desc: 'PAMPERS', pal: 24, muelle: 'J12',
      operador: 'María S.', validador: 'Francisco Gil', entradaPor: 'Raul M.', ubicador: '—',
      fDesc: '20 junio 2026 · 7:48 a. m.', fVal: '20 junio 2026 · 8:55 a. m.', fEnt: '20 junio 2026 · 10:02 a. m.', fUbi: '—',
      val: 'ok', ent: 'ok', ubi: 'pend'
    },
    {
      cont: 'COR-88210391', tipo: 'importado', div: 'LIMENT', desc: 'COCA COLA', pal: 32, muelle: '—',
      operador: 'José P.', validador: '—', entradaPor: '—', ubicador: '—',
      fDesc: '20 junio 2026 · 7:20 a. m.', fVal: '—', fEnt: '—', fUbi: '—',
      val: 'pend', ent: 'pend', ubi: 'pend'
    },
    {
      cont: 'COR-55443322', tipo: 'local', div: 'COASIS', desc: 'COLGATE', pal: 15, muelle: 'J9',
      operador: 'Pedro R.', validador: 'Kelvin P.', entradaPor: 'Francisco Gil', ubicador: 'Ramón M.',
      fDesc: '20 junio 2026 · 6:55 a. m.', fVal: '20 junio 2026 · 7:40 a. m.', fEnt: '20 junio 2026 · 8:22 a. m.', fUbi: '20 junio 2026 · 9:05 a. m.',
      val: 'ok', ent: 'ok', ubi: 'ok'
    },
    {
      cont: 'COR-66554433', tipo: 'importado', div: 'CPH', desc: 'HUGGIES', pal: 40, muelle: 'J15',
      operador: 'Eduardo L.', validador: 'Franklin M.', entradaPor: '—', ubicador: '—',
      fDesc: '20 junio 2026 · 6:30 a. m.', fVal: '20 junio 2026 · 7:18 a. m.', fEnt: '—', fUbi: '—',
      val: 'ok', ent: 'pend', ubi: 'pend'
    },
    {
      cont: 'COR-99001122', tipo: 'importado', div: 'COA/CP', desc: 'GATORADE', pal: 28, muelle: 'J3',
      operador: 'Carlos V.', validador: 'Raul M.', entradaPor: 'Kelvin P.', ubicador: 'Ana L.',
      fDesc: '19 junio 2026 · 4:15 p. m.', fVal: '19 junio 2026 · 5:02 p. m.', fEnt: '19 junio 2026 · 5:48 p. m.', fUbi: '19 junio 2026 · 6:20 p. m.',
      val: 'ok', ent: 'ok', ubi: 'ok'
    },
    {
      cont: 'COR-11223344', tipo: 'local', div: 'COASIS', desc: 'DOVE', pal: 12, muelle: 'J18',
      operador: 'María S.', validador: '—', entradaPor: '—', ubicador: '—',
      fDesc: '20 junio 2026 · 9:05 a. m.', fVal: '—', fEnt: '—', fUbi: '—',
      val: 'pend', ent: 'pend', ubi: 'pend'
    },
    {
      cont: 'COR-55667788', tipo: 'importado', div: 'LIMENT', desc: 'RED BULL', pal: 36, muelle: 'J5',
      operador: 'José P.', validador: 'Francisco Gil', entradaPor: 'Raul M.', ubicador: '—',
      fDesc: '20 junio 2026 · 8:50 a. m.', fVal: '20 junio 2026 · 9:40 a. m.', fEnt: '20 junio 2026 · 10:15 a. m.', fUbi: '—',
      val: 'ok', ent: 'ok', ubi: 'pend'
    }
  ];

  var CHART = {
    operadores: [
      { name: 'Pedro Rodriguez', n: 0 },
      { name: 'Robert Diaz', n: 0 }
    ],
    validadores: [
      { name: 'Julio Lugo', n: 0 },
      { name: 'Handerson Ogando', n: 0 },
      { name: 'Nelson Flete', n: 0 },
      { name: 'Richard Ortiz', n: 0 }
    ],
    ubicadores: [
      { name: 'Rolando Corporan', n: 0 },
      { name: 'Obispo Abad', n: 0 },
      { name: 'Yeuri Paniagua', n: 0 },
      { name: 'Yeison Perez', n: 0 }
    ]
  };

  var currentView = 'v5';
  var mountEl = null;

  function viewFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || '').get('view');
      if (q && VIEWS[q]) return q;
      var h = String(global.location.hash || '').replace(/^#/, '');
      if (h && VIEWS[h]) return h;
    } catch (e) { /* noop */ }
    return 'v5';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function counts() {
    var local = 0;
    var imp = 0;
    var val = 0;
    var ent = 0;
    var ubi = 0;
    ROWS.forEach(function (r) {
      if (r.tipo === 'local') local += 1;
      else imp += 1;
      if (r.val === 'ok') val += 1;
      if (r.ent === 'ok') ent += 1;
      if (r.ubi === 'ok') ubi += 1;
    });
    return { total: ROWS.length, local: local, imp: imp, val: val, ent: ent, ubi: ubi };
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
    if (!name || name === '—') {
      return '<span class="rec-present-person rec-present-person--na">—</span>';
    }
    return '<span class="rec-present-person">' + esc(name) + '</span>';
  }

  function fechaCell(txt, kind) {
    var empty = !txt || txt === '—';
    return '<td class="rec-present-fecha-etapa rec-present-fecha-etapa--' +
      (empty ? 'empty' : kind) + '">' + esc(empty ? '—' : txt) + '</td>';
  }

  function renderHeader() {
    return '<header class="rec-present-header">' +
      '<img class="jc-logo-img jc-logo-img--present" src="assets/img/ac001-logo.svg?v=1" alt="AC" width="44" height="44">' +
      '<div><p class="rec-present-eyebrow">Almacén Central 001 · EN VIVO</p>' +
      '<h1 class="rec-present-title">Gestión de Recepción y Ubicación</h1>' +
      '<p class="rec-present-sub">Recepción de contenedores</p></div>' +
      '</header>';
  }

  function renderKpis(c) {
    return '<div class="rec-tv-kpis" role="group" aria-label="Resumen recepción">' +
      '<div class="rec-tv-kpi rec-tv-kpi--desc">' +
      '<span class="rec-tv-kpi-icon" aria-hidden="true">📦</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + c.total + '</span>' +
      '<span class="rec-tv-kpi-lbl">Descargados</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--tipo">' +
      '<span class="rec-tv-kpi-icon" aria-hidden="true">⚖</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + c.local + ' · ' + c.imp + '</span>' +
      '<span class="rec-tv-kpi-lbl">Local · Importado</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--val">' +
      '<span class="rec-tv-kpi-icon" aria-hidden="true">✓</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + c.val + '</span>' +
      '<span class="rec-tv-kpi-lbl">Validados</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--ent">' +
      '<span class="rec-tv-kpi-icon" aria-hidden="true">→</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + c.ent + '</span>' +
      '<span class="rec-tv-kpi-lbl">Entrada</span></div></div>' +
      '<div class="rec-tv-kpi rec-tv-kpi--ubi">' +
      '<span class="rec-tv-kpi-icon" aria-hidden="true">📍</span>' +
      '<div class="rec-tv-kpi-body"><span class="rec-tv-kpi-num">' + c.ubi + '</span>' +
      '<span class="rec-tv-kpi-lbl">Ubicados</span></div></div></div>';
  }

  function barPct(n, max) {
    max = max || 1;
    return Math.max(8, Math.round((n / max) * 100));
  }

  function renderChartRow(item, max, fillCls) {
    return '<div class="rec-tv-chart-row">' +
      '<span class="rec-tv-chart-name">' + esc(item.name) + '</span>' +
      '<div class="rec-tv-chart-bar"><div class="rec-tv-chart-fill' + (fillCls ? ' ' + fillCls : '') +
      '" style="width:' + barPct(item.n, max) + '%"></div></div>' +
      '<span class="rec-tv-chart-num">' + item.n + '</span></div>';
  }

  function maxN(list) {
    var m = 1;
    list.forEach(function (x) { if (x.n > m) m = x.n; });
    return m;
  }

  function renderChart(mode) {
    var html = '<aside class="rec-tv-chart' + (mode === 'triple' ? ' rec-tv-chart--triple' : '') + '" aria-label="Productividad operadores">';
    if (mode === 'triple') {
      html += '<p class="rec-tv-chart-title">Equipo en recepción</p>';
      html += '<div class="rec-tv-chart-section"><div class="rec-tv-chart-section-lbl">Operadores sentado</div><div class="rec-tv-chart-rows">';
      CHART.operadores.slice(0, 3).forEach(function (x) {
        html += renderChartRow(x, maxN(CHART.operadores), '');
      });
      html += '</div></div>';
      html += '<div class="rec-tv-chart-section"><div class="rec-tv-chart-section-lbl">Validadores</div><div class="rec-tv-chart-rows">';
      CHART.validadores.slice(0, 3).forEach(function (x) {
        html += renderChartRow(x, maxN(CHART.validadores), 'rec-tv-chart-fill--val');
      });
      html += '</div></div>';
      html += '<div class="rec-tv-chart-section"><div class="rec-tv-chart-section-lbl">Ubicadores</div><div class="rec-tv-chart-rows">';
      CHART.ubicadores.forEach(function (x) {
        html += renderChartRow(x, maxN(CHART.ubicadores), 'rec-tv-chart-fill--ubi');
      });
      html += '</div></div></aside>';
      return html;
    }
    html += '<p class="rec-tv-chart-title">Operadores · validadores · ubicadores</p><div class="rec-tv-chart-rows">';
    var mix = CHART.operadores.slice(0, 2).concat(CHART.validadores.slice(0, 2)).concat(CHART.ubicadores.slice(0, 2));
    var mx = maxN(mix);
    CHART.operadores.slice(0, 2).forEach(function (x) { html += renderChartRow(x, mx, ''); });
    CHART.validadores.slice(0, 2).forEach(function (x) { html += renderChartRow(x, mx, 'rec-tv-chart-fill--val'); });
    CHART.ubicadores.slice(0, 2).forEach(function (x) { html += renderChartRow(x, mx, 'rec-tv-chart-fill--ubi'); });
    html += '</div></aside>';
    return html;
  }

  function renderToolbar(chartMode) {
    return '<div class="rec-tv-toolbar">' + renderKpis(counts()) + renderChart(chartMode) + '</div>';
  }

  function rowV1(r) {
    return '<tr>' +
      '<td class="rec-present-contenedor">' + esc(r.cont) + '</td>' +
      '<td>' + tipoBadge(r.tipo) + '</td>' +
      '<td>' + esc(r.div) + '</td>' +
      '<td class="rec-present-desc">' + esc(r.desc) + '</td>' +
      '<td class="rec-present-num">' + esc(String(r.pal)) + '</td>' +
      '<td class="rec-present-muelle">' + esc(r.muelle) + '</td>' +
      '<td>' + person(r.operador) + '</td>' +
      '<td>' + person(r.validador) + '</td>' +
      '<td>' + person(r.entradaPor) + '</td>' +
      '<td>' + person(r.ubicador) + '</td>' +
      fechaCell(r.fDesc, 'desc') +
      fechaCell(r.fVal, 'val') +
      fechaCell(r.fEnt, 'ent') +
      fechaCell(r.fUbi, 'ubi') +
      '<td class="rec-present-status">' + badge(r.val) + '</td>' +
      '<td class="rec-present-status">' + badge(r.ent) + '</td>' +
      '<td class="rec-present-status">' + badge(r.ubi) + '</td>' +
      '</tr>';
  }

  function rowV2(r) {
    return '<tr>' +
      '<td class="rec-present-contenedor">' + esc(r.cont) + '</td>' +
      '<td>' + tipoBadge(r.tipo) + '</td>' +
      '<td class="rec-present-desc">' + esc(r.desc) + '</td>' +
      '<td class="rec-present-num">' + esc(String(r.pal)) + '</td>' +
      '<td class="rec-present-muelle">' + esc(r.muelle) + '</td>' +
      '<td>' + person(r.operador) + '</td>' +
      '<td>' + person(r.validador) + '</td>' +
      '<td>' + person(r.entradaPor) + '</td>' +
      '<td>' + person(r.ubicador) + '</td>' +
      fechaCell(r.fDesc, 'desc') +
      fechaCell(r.fVal, 'val') +
      fechaCell(r.fEnt, 'ent') +
      fechaCell(r.fUbi, 'ubi') +
      '</tr>';
  }

  function rowV3(r) {
    return '<tr>' +
      '<td class="rec-present-descarga-block">' +
      '<strong>' + esc(r.cont) + '</strong>' +
      '<span>' + esc(r.fDesc) + '</span>' +
      '<em>Op. sentado · ' + esc(r.operador) + '</em></td>' +
      '<td>' + tipoBadge(r.tipo) + '</td>' +
      '<td>' + esc(r.div) + '</td>' +
      '<td class="rec-present-desc">' + esc(r.desc) + '</td>' +
      '<td class="rec-present-num">' + esc(String(r.pal)) + '</td>' +
      '<td class="rec-present-muelle">' + esc(r.muelle) + '</td>' +
      '<td>' + person(r.validador) + '</td>' +
      '<td>' + person(r.entradaPor) + '</td>' +
      '<td>' + person(r.ubicador) + '</td>' +
      fechaCell(r.fVal, 'val') +
      fechaCell(r.fEnt, 'ent') +
      fechaCell(r.fUbi, 'ubi') +
      '<td class="rec-present-status">' + badge(r.val) + '</td>' +
      '<td class="rec-present-status">' + badge(r.ent) + '</td>' +
      '<td class="rec-present-status">' + badge(r.ubi) + '</td>' +
      '</tr>';
  }

  function tableWrap(cls, thead, tbody) {
    return '<div class="rec-present-table-wrap">' +
      '<table class="rec-present-table rec-present-table--tv ' + cls + '" aria-label="Manifiesto recepción en vivo">' +
      '<thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>';
  }

  function renderView(id) {
    var c = counts();
    var rowsHtml;
    var table;

    if (id === 'v1' || id === 'v4') {
      rowsHtml = ROWS.map(rowV1).join('');
      table = tableWrap('rec-present-table--block', [
        '<th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>',
        '<th>Op. sentado</th><th>Validador</th><th>Entrada</th><th>Ubicador</th>',
        '<th>Descargado</th><th>Validado</th><th>Entrada</th><th>Ubicado</th>',
        '<th>Val.</th><th>Ent.</th><th>Ubi.</th>'
      ].join(''), rowsHtml);
      return renderHeader() + renderToolbar('mix') + table;
    }

    if (id === 'v2') {
      rowsHtml = ROWS.map(rowV2).join('');
      table = tableWrap('rec-present-table--people', [
        '<th>Contenedor</th><th>Tipo</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>',
        '<th>Op. sentado</th><th>Validador</th><th>Entrada</th><th>Ubicador</th>',
        '<th>Descargado</th><th>Validado</th><th>Entrada</th><th>Ubicado</th>'
      ].join(''), rowsHtml);
      return renderHeader() + renderToolbar('mix') + table;
    }

    if (id === 'v3') {
      rowsHtml = ROWS.map(rowV3).join('');
      table = tableWrap('rec-present-table--block', [
        '<th>Descarga</th><th>Tipo</th><th>División</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>',
        '<th>Validador</th><th>Entrada</th><th>Ubicador</th>',
        '<th>Validado</th><th>Entrada</th><th>Ubicado</th>',
        '<th>Val.</th><th>Ent.</th><th>Ubi.</th>'
      ].join(''), rowsHtml);
      return renderHeader() + renderToolbar('mix') + table;
    }

    if (id === 'v5') {
      rowsHtml = ROWS.map(rowV1).join('');
      table = tableWrap('rec-present-table--block', [
        '<th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th><th>Paletas</th><th>Muelle</th>',
        '<th>Op. sentado</th><th>Validador</th><th>Entrada</th><th>Ubicador</th>',
        '<th>Descargado</th><th>Validado</th><th>Entrada</th><th>Ubicado</th>',
        '<th>Val.</th><th>Ent.</th><th>Ubi.</th>'
      ].join(''), rowsHtml);
      return renderHeader() + renderToolbar('triple') + table;
    }

    return renderHeader() + '<p class="rec-present-empty">Vista no encontrada.</p>';
  }

  function renderSwitcher() {
    var bar = document.getElementById('recVpSwitcher');
    if (!bar) return;
    bar.querySelectorAll('[data-rec-vp]').forEach(function (el) {
      var id = el.getAttribute('data-rec-vp');
      el.classList.toggle('is-on', id === currentView);
      if (el.tagName === 'A') el.setAttribute('href', '?view=' + id);
    });
  }

  function setView(id, pushUrl) {
    if (!VIEWS[id]) return;
    currentView = id;
    document.body.className = 'rec-display-mode rec-live-on rec-vistas-preview' +
      (VIEWS[id].cls ? ' ' + VIEWS[id].cls : '');
    renderSwitcher();
    if (mountEl) {
      mountEl.innerHTML = '<div class="rec-present-shell">' + renderView(id) + '</div>';
    }
    if (pushUrl !== false && global.history && global.history.replaceState) {
      try {
        global.history.replaceState(null, '', '?view=' + id);
      } catch (e) { /* noop */ }
    }
  }

  function bindSwitcher() {
    var bar = document.getElementById('recVpSwitcher');
    if (!bar) return;
    bar.querySelectorAll('[data-rec-vp]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        if (el.tagName === 'A') ev.preventDefault();
        setView(el.getAttribute('data-rec-vp'));
      });
    });
  }

  function init() {
    mountEl = document.getElementById('recGlobalLiveBoard');
    currentView = viewFromUrl();
    bindSwitcher();
    setView(currentView, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
