(function () {
  var rows = [
    { fecha: '20/06/2026', reg: 'REC-0008', cont: 'COR-45864564', tipo: 'local', div: 'COASIS', desc: 'GILLETTE', pal: 18, muelle: 'J77', val: 'ok', ent: 'pend' },
    { fecha: '20/06/2026', reg: 'REC-0007', cont: 'COR-77123456', tipo: 'local', div: 'COASIS', desc: 'PAMPERS', pal: 24, muelle: 'J12', val: 'ok', ent: 'pend' },
    { fecha: '20/06/2026', reg: 'REC-0006', cont: 'COR-88210391', tipo: 'imp', div: 'BEBIDAS', desc: 'COCA COLA', pal: 32, muelle: '—', val: 'pend', ent: 'pend' },
    { fecha: '20/06/2026', reg: 'REC-0005', cont: 'COR-55443322', tipo: 'local', div: 'COASIS', desc: 'COLGATE', pal: 15, muelle: 'J9', val: 'ok', ent: 'ok' },
    { fecha: '20/06/2026', reg: 'REC-0004', cont: 'COR-66554433', tipo: 'imp', div: 'HIGIENE', desc: 'HUGGIES', pal: 40, muelle: 'J15', val: 'ok', ent: 'pend' }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function badge(val) {
    return val === 'ok'
      ? '<span class="rec-present-badge rec-present-badge--ok">OK</span>'
      : '<span class="rec-present-badge rec-present-badge--pend">PENDIENTE</span>';
  }

  function tipoBadge(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    return '<span class="rec-present-tipo rec-present-tipo--' + cls + '">' +
      (tipo === 'local' ? 'LOCAL' : 'IMPORTADO') + '</span>';
  }

  var pend = rows.filter(function (r) { return r.val !== 'ok'; }).length;
  var ent = rows.filter(function (r) { return r.ent === 'ok'; }).length;

  var tbody = rows.map(function (r) {
    return '<tr>' +
      '<td>' + esc(r.fecha) + '</td>' +
      '<td class="rec-present-registro">' + esc(r.reg) + '</td>' +
      '<td class="rec-present-contenedor">' + esc(r.cont) + '</td>' +
      '<td>' + tipoBadge(r.tipo) + '</td>' +
      '<td>' + esc(r.div) + '</td>' +
      '<td class="rec-present-desc">' + esc(r.desc) + '</td>' +
      '<td class="rec-present-num">' + esc(String(r.pal)) + '</td>' +
      '<td class="rec-present-muelle">' + esc(r.muelle) + '</td>' +
      '<td class="rec-present-status">' + badge(r.val) + '</td>' +
      '<td class="rec-present-status">' + badge(r.ent) + '</td>' +
      '</tr>';
  }).join('');

  var el = document.getElementById('recGlobalLiveBoard');
  if (!el) return;

  el.innerHTML =
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
})();
