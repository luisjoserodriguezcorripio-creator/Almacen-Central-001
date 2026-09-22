(function () {
  'use strict';

  var docks = [
    { id: 'J3', state: 'busy', cont: 'COR-11223344', desc: 'NESTLE' },
    { id: 'J9', state: 'done', cont: 'COR-55443322', desc: 'COLGATE' },
    { id: 'J12', state: 'busy', cont: 'COR-77123456', desc: 'PAMPERS' },
    { id: 'J15', state: 'busy', cont: 'COR-66554433', desc: 'HUGGIES' },
    { id: 'J21', state: 'free' },
    { id: 'J45', state: 'free' },
    { id: 'J77', state: 'busy', cont: 'COR-45864564', desc: 'GILLETTE' },
    { id: 'J88', state: 'free' }
  ];

  var activeDock = '';
  var activeFilter = 'all';

  function stateLabel(state) {
    if (state === 'busy') return 'Ocupado';
    if (state === 'done') return 'Entrada OK';
    return 'Libre';
  }

  function renderDockGrid() {
    var grid = document.getElementById('rblDockGrid');
    if (!grid) return;
    grid.innerHTML = docks.map(function (d) {
      var cls = 'rbl-dock-slot rbl-dock-slot--' + d.state;
      if (activeDock === d.id) cls += ' is-active';
      var meta = d.state === 'free'
        ? '<span class="rbl-dock-meta"><em>Disponible</em></span>'
        : '<span class="rbl-dock-meta">' + d.desc + '<br><em>' + d.cont + '</em></span>';
      return '<button type="button" class="' + cls + '" data-dock="' + d.id + '" title="Filtrar ' + d.id + '">' +
        '<span class="rbl-dock-id">' + d.id + '</span>' +
        '<span class="rbl-dock-state">' + stateLabel(d.state) + '</span>' +
        meta + '</button>';
    }).join('');

    grid.querySelectorAll('[data-dock]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-dock');
        activeDock = activeDock === id ? '' : id;
        renderDockGrid();
        applyTableFilters();
      });
    });
  }

  function rowMatchesFilter(row) {
    var muelle = row.getAttribute('data-muelle') || '';
    var val = row.getAttribute('data-val') || '';
    var ent = row.getAttribute('data-ent') || '';

    if (activeDock && muelle !== activeDock) return false;

    if (activeFilter === 'no-muelle') return !muelle;
    if (activeFilter === 'pend-val') return val !== 'ok';
    if (activeFilter === 'pend-ent') return val === 'ok' && ent !== 'ok';
    if (activeFilter === 'done') return ent === 'ok';
    return true;
  }

  function applyTableFilters() {
    var table = document.getElementById('tblF');
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    var visible = 0;
    rows.forEach(function (row) {
      var show = rowMatchesFilter(row);
      row.classList.toggle('is-hidden-row', !show);
      if (show) visible++;
    });
    var countEl = document.getElementById('rblMfCount');
    if (countEl) {
      var suffix = activeDock ? ' en ' + activeDock : '';
      countEl.textContent = visible + ' visible' + (visible !== 1 ? 's' : '') + suffix;
    }
  }

  function bindFilterChips() {
    var wrap = document.getElementById('rblManifestFilters');
    if (!wrap) return;
    wrap.querySelectorAll('.rbl-mf-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        activeFilter = chip.getAttribute('data-filter') || 'all';
        wrap.querySelectorAll('.rbl-mf-chip').forEach(function (c) {
          c.classList.toggle('is-on', c === chip);
        });
        applyTableFilters();
      });
    });
  }

  function enrichTableRows() {
    var table = document.getElementById('tblF');
    if (!table) return;
    var data = [
      { muelle: 'J77', val: 'ok', ent: 'pend' },
      { muelle: 'J12', val: 'ok', ent: 'pend' },
      { muelle: '', val: 'pend', ent: 'pend' },
      { muelle: 'J9', val: 'ok', ent: 'ok' },
      { muelle: 'J15', val: 'ok', ent: 'pend' }
    ];
    var rows = table.querySelectorAll('tbody tr');
    rows.forEach(function (row, i) {
      var d = data[i];
      if (!d) return;
      row.setAttribute('data-muelle', d.muelle);
      row.setAttribute('data-val', d.val);
      row.setAttribute('data-ent', d.ent);
    });
  }

  function init() {
    renderDockGrid();
    bindFilterChips();
    setTimeout(function () {
      enrichTableRows();
      applyTableFilters();
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
