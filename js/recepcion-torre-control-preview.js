(function () {
  var rows = [
    { reg: 'REC-0008', cont: 'COR-45864564', tipo: 'local', desc: 'GILLETTE', pal: 18, muelle: 'J77', val: 'ok', ent: 'pend' },
    { reg: 'REC-0007', cont: 'COR-77123456', tipo: 'local', desc: 'PAMPERS', pal: 24, muelle: 'J12', val: 'ok', ent: 'pend' },
    { reg: 'REC-0006', cont: 'COR-88210391', tipo: 'imp', desc: 'COCA COLA', pal: 32, muelle: '', val: 'pend', ent: 'pend' },
    { reg: 'REC-0005', cont: 'COR-55443322', tipo: 'local', desc: 'COLGATE', pal: 15, muelle: 'J9', val: 'ok', ent: 'ok' },
    { reg: 'REC-0004', cont: 'COR-66554433', tipo: 'imp', desc: 'HUGGIES', pal: 40, muelle: 'J15', val: 'ok', ent: 'pend' }
  ];

  var history = [
    { dt: '20/06/2026 10:18', reg: 'REC-0008', cont: 'COR-45864564', user: 'Kelvin P.', acc: 'val', detail: 'Validación completada', muelle: 'J77' },
    { dt: '20/06/2026 09:42', reg: 'REC-0007', cont: 'COR-77123456', user: 'María R.', acc: 'mue', detail: 'Muelle J12 asignado', muelle: 'J12' },
    { dt: '20/06/2026 09:15', reg: 'REC-0007', cont: 'COR-77123456', user: 'María R.', acc: 'reg', detail: 'Contenedor registrado · 24 pal', muelle: '—' },
    { dt: '20/06/2026 08:55', reg: 'REC-0005', cont: 'COR-55443322', user: 'Carlos M.', acc: 'ent', detail: 'Entrada confirmada en patio', muelle: 'J9' },
    { dt: '20/06/2026 08:30', reg: 'REC-0005', cont: 'COR-55443322', user: 'Carlos M.', acc: 'val', detail: 'Validación completada', muelle: 'J9' },
    { dt: '20/06/2026 08:12', reg: 'REC-0006', cont: 'COR-88210391', user: 'Ana L.', acc: 'reg', detail: 'Importado · COCA COLA · 32 pal', muelle: '—' },
    { dt: '20/06/2026 07:48', reg: 'REC-0004', cont: 'COR-66554433', user: 'Kelvin P.', acc: 'mue', detail: 'Muelle J15 asignado', muelle: 'J15' },
    { dt: '20/06/2026 07:20', reg: 'REC-0003', cont: 'COR-99112233', user: 'María R.', acc: 'ent', detail: 'Entrada confirmada', muelle: 'J3' }
  ];

  var accLabels = { reg: 'Registro', val: 'Validación', ent: 'Entrada', mue: 'Muelle' };

  function tipoPill(t) {
    return t === 'local'
      ? '<span class="rbl-pill rbl-pill--tipo-local">LOCAL</span>'
      : '<span class="rbl-pill rbl-pill--tipo-imp">IMPORT</span>';
  }

  function statusPill(ok) {
    return ok === 'ok'
      ? '<span class="rbl-pill rbl-pill--ok">OK</span>'
      : '<span class="rbl-pill rbl-pill--pend">PEND.</span>';
  }

  function muelleCell(m) {
    if (!m) return '<span class="rbl-muelle rbl-muelle--empty">—</span>';
    return '<span class="rbl-muelle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h11v8H3z"/><path d="M14 12h3l3 2v3h-6v-5z"/></svg>' + m + '</span>';
  }

  function actions(r) {
    var a = '';
    if (r.val !== 'ok') a += '<button type="button" class="rbl-act rbl-act--pri">Validar</button>';
    else if (r.ent !== 'ok') a += '<button type="button" class="rbl-act rbl-act--ok">Entrada</button>';
    a += '<button type="button" class="rbl-act rbl-act--sec">···</button>';
    return '<span class="rbl-actions">' + a + '</span>';
  }

  function renderTable(el) {
    if (!el) return;
    el.innerHTML = '<thead><tr><th>Registro</th><th>Contenedor</th><th>Tipo</th><th>Descripción</th><th>Pal.</th><th>Muelle</th><th>Validado</th><th>Entrada</th><th>Acciones</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><span class="rbl-reg">' + r.reg + '</span></td><td><span class="rbl-cont">' + r.cont + '</span></td><td>' + tipoPill(r.tipo) + '</td><td>' + r.desc + '</td><td><strong>' + r.pal + '</strong></td><td>' + muelleCell(r.muelle) + '</td><td>' + statusPill(r.val) + '</td><td>' + statusPill(r.ent) + '</td><td>' + actions(r) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function renderHistory() {
    var el = document.getElementById('tblHist');
    if (!el) return;
    el.innerHTML = '<thead><tr><th>Fecha / hora</th><th>Registro</th><th>Contenedor</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Muelle</th></tr></thead><tbody>' +
      history.map(function (h) {
        return '<tr><td><span class="rbl-timeline-time">' + h.dt + '</span></td><td><span class="rbl-reg">' + h.reg + '</span></td><td><span class="rbl-cont">' + h.cont + '</span></td><td>' + h.user + '</td><td><span class="rbl-log-acc rbl-log-acc--' + h.acc + '">' + accLabels[h.acc] + '</span></td><td>' + h.detail + '</td><td>' + muelleCell(h.muelle === '—' ? '' : h.muelle) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function setFScreen(id) {
    document.querySelectorAll('.rbl-f-screen').forEach(function (s) {
      s.classList.toggle('is-on', s.getAttribute('data-f-screen') === id);
    });
    document.querySelectorAll('.rbl-f-nav-btn, .rbl-drawer-link').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-f-screen') === id);
    });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function tvBadge(val) {
    return val === 'ok'
      ? '<span class="rec-present-badge rec-present-badge--ok">OK</span>'
      : '<span class="rec-present-badge rec-present-badge--pend">PENDIENTE</span>';
  }

  function tvTipo(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    return '<span class="rec-present-tipo rec-present-tipo--' + cls + '">' +
      (tipo === 'local' ? 'LOCAL' : 'IMPORTADO') + '</span>';
  }

  function renderTvFrame() {
    var frame = document.getElementById('rblTvFrame');
    if (!frame) return;
    var pend = rows.filter(function (r) { return r.val !== 'ok'; }).length;
    var ent = rows.filter(function (r) { return r.ent === 'ok'; }).length;
    var tbody = rows.map(function (r) {
      return '<tr>' +
        '<td>20/06/2026</td>' +
        '<td>' + esc(r.reg) + '</td>' +
        '<td class="rec-present-contenedor">' + esc(r.cont) + '</td>' +
        '<td>' + tvTipo(r.tipo) + '</td>' +
        '<td>COASIS</td>' +
        '<td class="rec-present-desc">' + esc(r.desc) + '</td>' +
        '<td>' + esc(String(r.pal)) + '</td>' +
        '<td>' + esc(r.muelle || '—') + '</td>' +
        '<td class="rec-present-status">' + tvBadge(r.val) + '</td>' +
        '<td class="rec-present-status">' + tvBadge(r.ent) + '</td>' +
        '</tr>';
    }).join('');
    frame.innerHTML =
      '<div class="rec-present-shell">' +
      '<header class="rec-present-header">' +
      '<img class="jc-logo-img jc-logo-img--present" src="assets/img/ac001-logo.svg?v=1" alt="AC" width="44" height="44">' +
      '<div><p class="rec-present-eyebrow">Almacén Central 001 · EN VIVO</p>' +
      '<h1 class="rec-present-title">Gestión de Recepción y Ubicación</h1></div>' +
      '<div class="rec-present-kpis">' +
      '<span><strong>' + rows.length + '</strong> seguimiento</span>' +
      '<span><strong>' + pend + '</strong> pend. validar</span>' +
      '<span><strong>' + ent + '</strong> con entrada</span>' +
      '</div></header>' +
      '<div class="rec-present-table-wrap">' +
      '<table class="rec-present-table"><thead><tr>' +
      '<th>Fecha</th><th>Registro</th><th>Contenedor</th><th>Tipo</th><th>División</th><th>Descripción</th>' +
      '<th>Paletas</th><th>Muelle</th><th>Validado</th><th>Entrada</th>' +
      '</tr></thead><tbody>' + tbody + '</tbody></table></div></div>';
  }

  var shareLive = false;

  function setShareLive(on) {
    shareLive = on;
    var btn = document.getElementById('rblBtnShare');
    var overlay = document.getElementById('rblTvOverlay');
    var lbl = document.getElementById('rblShareLbl');
    var sub = document.getElementById('rblShareSub');
    if (btn) btn.classList.toggle('is-live', on);
    if (lbl) lbl.textContent = on ? '● Pantalla en vivo' : 'Compartir pantalla';
    if (sub) sub.textContent = on ? 'Clic para cerrar TV' : 'TV recepción · en vivo';
    if (overlay) {
      overlay.hidden = !on;
      overlay.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (on) renderTvFrame();
  }

  function closeDrawer() {
    var btn = document.getElementById('rblHubBtn');
    var bd = document.getElementById('rblDrawerBd');
    var dr = document.getElementById('rblDrawer');
    if (btn) { btn.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    if (bd) { bd.classList.remove('is-open'); bd.hidden = true; }
    if (dr) dr.classList.remove('is-open');
  }

  function openDrawer() {
    var btn = document.getElementById('rblHubBtn');
    var bd = document.getElementById('rblDrawerBd');
    var dr = document.getElementById('rblDrawer');
    if (btn) { btn.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    if (bd) { bd.hidden = false; bd.classList.add('is-open'); }
    if (dr) dr.classList.add('is-open');
  }

  renderTable(document.getElementById('tblF'));
  renderHistory();

  var hubBtn = document.getElementById('rblHubBtn');
  var drawerBd = document.getElementById('rblDrawerBd');
  if (hubBtn) hubBtn.addEventListener('click', function () {
    var dr = document.getElementById('rblDrawer');
    if (dr && dr.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  if (drawerBd) drawerBd.addEventListener('click', closeDrawer);

  document.querySelectorAll('[data-f-screen]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-f-screen');
      if (id) { setFScreen(id); closeDrawer(); }
    });
  });

  var shareBtn = document.getElementById('rblBtnShare');
  var tvClose = document.getElementById('rblTvClose');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      setShareLive(!shareLive);
    });
  }
  if (tvClose) {
    tvClose.addEventListener('click', function () {
      setShareLive(false);
    });
  }
})();
