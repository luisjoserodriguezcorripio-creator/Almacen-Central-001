/**
 * UI — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  function S() { return global.PlatformRecepcionStore; }
  function A() { return global.PlatformRecepcionAuth; }

  function badgeValidado(val) {
    if (val === 'ok') {
      return '<span class="rec-badge rec-badge--ok">OK</span>';
    }
    return '<span class="rec-badge rec-badge--pendiente">PENDIENTE</span>';
  }

  function badgeEntrada(val) {
    return badgeValidado(val);
  }

  function badgeUbicado(val) {
    return badgeValidado(val);
  }

  function badgeTipo(tipo) {
    var cls = tipo === 'local' ? 'local' : 'importado';
    var lbl = tipo === 'local' ? 'LOCAL' : 'IMPORTADO';
    return '<span class="rec-tipo rec-tipo--' + cls + '">' + lbl + '</span>';
  }

  function todayInputValue() {
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      return parts;
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  var FILTER_KEY = 'rec_planilla_fecha_filter';
  var DEFAULT_HEADERS = (global.PlatformRecepcionPlanilla && global.PlatformRecepcionPlanilla.EXPECTED_HEADERS) || [
    'NO.', 'FECHA LLEGADA', 'FECHA DESCARGA', 'Bahias', '# CONT. / FACTURA', '# OC/OT', '#IDC', 'Turno',
    'ARTICULO', 'Fecha de vencimiento', 'VIDA UTIL (DIAS)', 'DESCARGADO', 'VALIDADO', 'UBICADO', 'REMISION',
    'NO.REMISION', 'MUELLE', 'OPERADOR', 'VALIDADOR', 'UBICADOR', 'DIGITADOR', 'TIPO', 'PALETA',
    'HORA RAMPA', 'COMENTARIOS'
  ];

  function loadFechaFilter() {
    try {
      var raw = sessionStorage.getItem(FILTER_KEY);
      if (!raw) return { desde: '', hasta: '', preset: 'todas', estado: '' };
      var parsed = JSON.parse(raw);
      var estado = parsed.estado || '';
      if (estado === 'descargar') estado = '';
      return {
        desde: parsed.desde || '',
        hasta: parsed.hasta || '',
        preset: parsed.preset || 'todas',
        estado: estado
      };
    } catch (e) {
      return { desde: '', hasta: '', preset: 'todas', estado: '' };
    }
  }

  function saveFechaFilter(filter) {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter || {}));
    } catch (e) { /* noop */ }
  }

  function addDaysIso(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function startOfWeekIso(iso) {
    var d = new Date(iso + 'T12:00:00');
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  function startOfMonthIso(iso) {
    return iso.slice(0, 8) + '01';
  }

  function monthsShort() {
    return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  }

  function labelFechaIso(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    if (p.length < 3) return iso;
    return Number(p[2]) + ' ' + monthsShort()[Number(p[1]) - 1] + ' ' + p[0];
  }

  function estadoLabel(estado) {
    var map = {
      validar: 'Pend. Validar',
      remision: 'Pend. Remision',
      ubicar: 'Pend. Ubicar'
    };
    return map[estado] || '';
  }

  function filterHintText(filter) {
    filter = filter || {};
    var parts = [];
    if (!filter.desde && !filter.hasta) {
      parts.push('todas las fechas');
    } else if (filter.desde && filter.hasta && filter.desde === filter.hasta) {
      parts.push(labelFechaIso(filter.desde));
    } else if (filter.desde && filter.hasta) {
      parts.push(labelFechaIso(filter.desde) + ' al ' + labelFechaIso(filter.hasta));
    } else if (filter.desde) {
      parts.push('desde ' + labelFechaIso(filter.desde));
    } else {
      parts.push('hasta ' + labelFechaIso(filter.hasta));
    }
    if (filter.estado) parts.push(estadoLabel(filter.estado));
    return 'Filtro: ' + parts.join(' · ');
  }

  function resolvePresetRange(preset, today, estado) {
    today = today || todayInputValue();
    var base = { estado: estado || '' };
    if (preset === 'hoy') return Object.assign({ desde: today, hasta: today, preset: 'hoy' }, base);
    if (preset === 'semana') {
      return Object.assign({ desde: startOfWeekIso(today), hasta: today, preset: 'semana' }, base);
    }
    if (preset === '7d') {
      return Object.assign({ desde: addDaysIso(today, -6), hasta: today, preset: '7d' }, base);
    }
    if (preset === 'mes') {
      return Object.assign({ desde: startOfMonthIso(today), hasta: today, preset: 'mes' }, base);
    }
    return Object.assign({ desde: '', hasta: '', preset: 'todas' }, base);
  }

  function renderFechaFilter(filter, liveActive) {
    filter = filter || loadFechaFilter();
    var presets = [
      { id: 'hoy', label: 'Hoy' },
      { id: 'semana', label: 'Semana' },
      { id: '7d', label: '7 días' },
      { id: 'mes', label: 'Mes' },
      { id: 'todas', label: 'Todas' }
    ];
    var estados = [
      { id: '', label: 'Todos' },
      { id: 'validar', label: 'Pend. Validar' },
      { id: 'remision', label: 'Pend. Remision' },
      { id: 'ubicar', label: 'Pend. Ubicar' }
    ];
    return '<section class="rec-fecha-filter" aria-label="Filtros de recepción">' +
      '<div class="rec-fecha-filter__top">' +
      '<div class="rec-fecha-filter__main">' +
      '<p class="rec-fecha-filter__label">Filtros</p>' +
      '<div class="rec-fecha-filter__row">' +
      '<label class="rec-fecha-filter__field"><span>Desde</span>' +
      '<input type="date" id="recFechaDesde" value="' + esc(filter.desde || '') + '"></label>' +
      '<span class="rec-fecha-filter__dash" aria-hidden="true"></span>' +
      '<label class="rec-fecha-filter__field"><span>Hasta</span>' +
      '<input type="date" id="recFechaHasta" value="' + esc(filter.hasta || '') + '"></label>' +
      '<div class="rec-fecha-filter__presets" id="recFechaPresets">' +
      presets.map(function (p) {
        return '<button type="button" class="rec-fecha-preset' +
          (filter.preset === p.id ? ' is-active' : '') +
          '" data-rec-fecha-preset="' + esc(p.id) + '">' + esc(p.label) + '</button>';
      }).join('') +
      '</div></div>' +
      '<div class="rec-fecha-filter__estados" id="recEstadoPresets">' +
      estados.map(function (e) {
        var active = (filter.estado || '') === e.id;
        return '<button type="button" class="rec-estado-preset' + (active ? ' is-active' : '') +
          '" data-rec-estado="' + esc(e.id) + '">' + esc(e.label) + '</button>';
      }).join('') +
      '</div>' +
      '<p class="rec-fecha-filter__hint" id="recFechaHint">' + esc(filterHintText(filter)) + '</p>' +
      '</div>' +
      '<button type="button" class="rec-proy-btn' + (liveActive ? ' is-live' : '') + '" id="recBtnShare"' +
      (liveActive ? ' aria-pressed="true"' : '') + ' title="Proyectar productividad en pantalla TV">' +
      '<img src="assets/img/kpi-pantalla.svg?v=2" alt="" width="28" height="28">' +
      '<span>' + (liveActive ? '● En proyección' : 'Proyectar') + '</span>' +
      '</button></div></section>';
  }

  function formatQty(n) {
    var num = Number(n) || 0;
    try {
      return new Intl.NumberFormat('en-US').format(num);
    } catch (e) {
      return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }

  function renderPlanillaUploadCard(user, planilla) {
    if (!A().canRegister(user)) return '';
    var hist = S().getPlanillaHistorico ? S().getPlanillaHistorico() : {};
    var months = Object.keys(hist).sort().reverse();
    var rowsN = planilla && planilla.rows ? planilla.rows.length : 0;
    var meta = planilla
      ? ('Última carga: ' + (planilla.fileName || '—') + ' · ' +
        formatQty(rowsN) + ' filas · ' +
        S().formatFecha(planilla.uploadedAt))
      : 'Sin archivo cargado.';
    var histHtml = months.length
      ? '<ul class="rec-planilla-hist">' + months.slice(0, 6).map(function (m) {
        var snap = hist[m] || {};
        return '<li><strong>' + esc(m) + '</strong> · ' +
          esc(snap.fileName || '—') + ' · ' +
          esc(formatQty((snap.rows && snap.rows.length) || 0)) + ' filas</li>';
      }).join('') + '</ul>'
      : '<p class="rec-planilla-empty">Sin histórico mensual.</p>';

    return '<div class="rec-planilla-bar">' +
      '<div class="rec-planilla-card">' +
      '<div class="rec-planilla-card__head">' +
      '<h3>Cargar CSV</h3>' +
      '<span>Reemplaza la carga actual</span>' +
      '</div>' +
      '<label class="rec-planilla-drop" for="recPlanillaFile">' +
      '<input type="file" id="recPlanillaFile" accept=".csv,text/csv" hidden>' +
      '<span class="rec-planilla-drop__title">Seleccionar archivo CSV</span>' +
      '<span class="rec-planilla-drop__sub">Cada carga sustituye la anterior</span>' +
      '</label>' +
      '<p class="rec-planilla-meta" id="recPlanillaMeta">' + esc(meta) + '</p>' +
      '<div class="rec-planilla-hist-wrap">' +
      '<h4>Histórico por mes</h4>' + histHtml +
      '</div></div></div>';
  }

  function countMuellesOcupados(contenedores) {
    var set = Object.create(null);
    (contenedores || []).forEach(function (c) {
      var m = String(c.muelle || '').trim();
      if (m) set[m] = true;
    });
    return Object.keys(set).length;
  }

  function sumPaletas(contenedores) {
    var n = 0;
    (contenedores || []).forEach(function (c) {
      n += Number(c.paletas) || 0;
    });
    return n;
  }

  function renderHubBtn() {
    return '<button type="button" class="rbl-hub-btn" id="recHubBtn" aria-label="Abrir menú" aria-expanded="false">' +
      '<span></span><span></span><span></span></button>';
  }

  function renderEquipoSelect(id, label, names) {
    var opts = '<option value="">Seleccione…</option>' + (names || []).map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + '</option>';
    }).join('');
    return '<label class="rec-field" for="' + esc(id) + '"><span>' + esc(label) + '</span>' +
      '<select id="' + esc(id) + '" class="rec-input" required>' + opts + '</select></label>';
  }

  function renderTorreHero() {
    return '<header class="rbl-f-hero rbl-f-hero--h4">' +
      '<span class="rbl-f-hero-glow" aria-hidden="true"></span>' +
      '<div class="rbl-f-hero-inner">' +
      renderHubBtn() +
      '<div class="rbl-f-logo">' +
      '<img class="jc-logo-img jc-logo-img--hero rbl-f-logo-img" src="assets/img/ac001-logo.svg?v=1" alt="Almacén Central AC" width="52" height="52">' +
      '<div class="rbl-f-logo-text">' +
      '<h1>Gestión de Recepción y Ubicación</h1>' +
      '<p>Almacén Central 001 · Recepción de contenedores</p>' +
      '</div></div>' +
      '<a class="rec-tablon-back" href="./index.html">← Tablón informativo</a>' +
      '</div></header>';
  }

  function renderTorreDrawer(user) {
    var name = A().getDisplayName(user);
    return '<div class="rbl-drawer-backdrop" id="recDrawerBd" hidden></div>' +
      '<aside class="rbl-drawer" id="recDrawer" aria-label="Navegación">' +
      '<div class="rbl-drawer-brand">' +
      '<img class="jc-logo-img rbl-drawer-logo" src="assets/img/ac001-logo.svg?v=1" alt="AC" width="40" height="40">' +
      '<p>Recepción · Almacén Central</p></div>' +
      '<nav class="rbl-drawer-nav">' +
      '<button type="button" class="rbl-drawer-link is-on" data-rec-screen="ops">Operaciones</button>' +
      '<button type="button" class="rbl-drawer-link" data-rec-screen="hist">Historia</button>' +
      '<button type="button" class="rbl-drawer-link" data-rec-screen="cfg">Configuraciones</button>' +
      '<a class="rbl-drawer-link rbl-drawer-link--back" href="./index.html">← Volver al tablón informativo</a>' +
      '</nav>' +
      '<div class="rbl-drawer-foot">' + esc(name) + '</div></aside>';
  }

  function renderTorreKpis(counts, estadoActivo) {
    counts = counts || {};
    estadoActivo = String(estadoActivo || '');
    function kpiCls(key) {
      return 'rbl-kpi' + (estadoActivo && estadoActivo === key ? ' is-filter-on' : '');
    }
    return '<div class="rbl-kpi-grid rbl-kpi-grid--rec5" role="group" aria-label="Resumen recepción">' +
      '<div class="rbl-kpi">' +
      '<div class="rbl-kpi-icon rbl-kpi-icon--blue">' +
      '<img class="rbl-kpi-icon-img rbl-kpi-icon-img--photo" src="assets/img/kpi-contenedor-rastra.webp?v=2" alt="" width="48" height="48"></div>' +
      '<div class="rbl-kpi-text"><span class="rbl-kpi-num">' + esc(formatQty(counts.total || 0)) + '</span>' +
      '<span class="rbl-kpi-lbl">Contenedores</span></div></div>' +
      '<div class="rbl-kpi">' +
      '<div class="rbl-kpi-icon rbl-kpi-icon--teal">' +
      '<img class="rbl-kpi-icon-img rbl-kpi-icon-img--photo" src="assets/img/kpi-paletas.png?v=20261119b" alt="" width="48" height="48"></div>' +
      '<div class="rbl-kpi-text"><span class="rbl-kpi-num">' + esc(formatQty(counts.paletas || 0)) + '</span>' +
      '<span class="rbl-kpi-lbl">Paletas</span></div></div>' +
      '<div class="' + kpiCls('validar') + '" data-rec-kpi-estado="validar">' +
      '<div class="rbl-kpi-icon rbl-kpi-icon--navy">' +
      '<img class="rbl-kpi-icon-img rbl-kpi-icon-img--photo" src="assets/img/kpi-handheld-zebra.png?v=1" alt="" width="48" height="48"></div>' +
      '<div class="rbl-kpi-text"><span class="rbl-kpi-num">' + esc(formatQty(counts.pendienteValidar || 0)) + '</span>' +
      '<span class="rbl-kpi-lbl">Pend. Validar</span></div></div>' +
      '<div class="' + kpiCls('remision') + '" data-rec-kpi-estado="remision">' +
      '<div class="rbl-kpi-icon rbl-kpi-icon--cast">' +
      '<img class="rbl-kpi-icon-img" src="assets/img/kpi-pantalla.svg?v=2" alt="" width="48" height="48"></div>' +
      '<div class="rbl-kpi-text"><span class="rbl-kpi-num">' + esc(formatQty(counts.pendienteRemision || 0)) + '</span>' +
      '<span class="rbl-kpi-lbl">Pend. Remision</span></div></div>' +
      '<div class="' + kpiCls('ubicar') + '" data-rec-kpi-estado="ubicar">' +
      '<div class="rbl-kpi-icon rbl-kpi-icon--amber">' +
      '<img class="rbl-kpi-icon-img" src="assets/img/kpi-jaula.svg?v=2" alt="" width="48" height="48"></div>' +
      '<div class="rbl-kpi-text"><span class="rbl-kpi-num">' + esc(formatQty(counts.pendienteUbicar || 0)) + '</span>' +
      '<span class="rbl-kpi-lbl">Pend. Ubicar</span></div></div>' +
      '</div>';
  }

  function renderRegistroFormCard(user, planilla) {
    return renderPlanillaUploadCard(user, planilla);
  }

  function renderTorreCfg(user, liveActive) {
    return '<div class="rbl-f-screen" data-rec-screen="cfg">' +
      '<div class="rbl-cfg-grid">' +
      '<div class="rbl-card"><div class="rbl-card-head"><h3>Sesión</h3><span>Usuario activo</span></div>' +
      '<div class="rbl-card-body rbl-cfg-section">' +
      '<p class="rec-tc-cfg-user">' + esc(A().getDisplayName(user)) + '</p>' +
      '<p class="rec-tc-cfg-role">' + esc(A().getRoleLabel(user)) + '</p></div></div>' +
      '<div class="rbl-card"><div class="rbl-card-head"><h3>Pantalla TV</h3><span>Productividad en vivo</span></div>' +
      '<div class="rbl-card-body rbl-cfg-section rec-tc-cfg-actions">' +
      '<button type="button" class="rec-btn rec-btn--cfg-primary" id="recBtnShareCfg"' +
      (liveActive ? ' aria-pressed="true"' : '') + '>' +
      (liveActive ? '● Dejar de compartir pantalla' : 'Compartir productividad en TV') + '</button>' +
      '<a class="rec-btn" id="recBtnOpenDisplay" href="recepcion-pantalla.html" target="_blank" rel="noopener">Abrir pantalla TV</a>' +
      '<button type="button" class="rec-btn" id="recBtnLogout">Cerrar sesión</button>' +
      '</div></div></div></div>';
  }

  function renderKpis(counts) {
    counts = counts || {};
    return '<div class="rec-kpis" role="group" aria-label="Resumen recepción">' +
      '<div class="rec-kpi rec-kpi--total"><span class="rec-kpi-num">' + esc(String(counts.total || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">En seguimiento</span></div>' +
      '<div class="rec-kpi rec-kpi--pend"><span class="rec-kpi-num">' + esc(String(counts.pendienteValidar || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Pend. validar</span></div>' +
      '<div class="rec-kpi rec-kpi--val"><span class="rec-kpi-num">' + esc(String(counts.validado || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Validados</span></div>' +
      '<div class="rec-kpi rec-kpi--ent"><span class="rec-kpi-num">' + esc(String(counts.conEntrada || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Con entrada</span></div>' +
      '<div class="rec-kpi rec-kpi--imp"><span class="rec-kpi-num">' + esc(String(counts.importado || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Importados</span></div>' +
      '<div class="rec-kpi rec-kpi--loc"><span class="rec-kpi-num">' + esc(String(counts.local || 0)) + '</span>' +
      '<span class="rec-kpi-lbl">Locales</span></div>' +
      '</div>';
  }

  function accionLabel(accion) {
    var map = {
      registro: 'Registro',
      validado: 'Validación',
      entrada: 'Entrada',
      ubicado: 'Ubicación',
      muelle: 'Muelle',
      retirado: 'Retirado'
    };
    return map[accion] || String(accion || '—');
  }

  function renderRegistroForm(user) {
    if (!A().canRegister(user)) return '';
    var store = S();
    var nextReg = store.peekNextRegistro ? store.peekNextRegistro() : '';
    var divOpts = (store.DIVISIONES || []).map(function (d) {
      return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
    }).join('');
    var operadorField = renderEquipoSelect('recOperadorSentado', 'Operador sentado', store.OPERADORES_SENTADO);
    return '<section class="rec-panel rec-panel--form" aria-labelledby="recFormTitle">' +
      '<h2 id="recFormTitle" class="rec-panel-title">Registrar contenedor</h2>' +
      (nextReg ? '<p class="rec-next-registro">Próximo registro: <strong>' + esc(nextReg) + '</strong></p>' : '') +
      '<form id="recRegistroForm" class="rec-form" novalidate>' +
      '<div class="rec-form-grid">' +
      '<label class="rec-field"><span>Fecha</span><input type="date" id="recFecha" class="rec-input" value="' + esc(todayInputValue()) + '" required></label>' +
      '<label class="rec-field"><span>Contenedor</span><input type="text" id="recContenedor" class="rec-input" placeholder="COR-20003645" maxlength="32" required autocapitalize="characters"></label>' +
      '<label class="rec-field"><span>Tipo</span><select id="recTipo" class="rec-input" required>' +
      '<option value="importado">Importado</option><option value="local">Local</option></select></label>' +
      '<label class="rec-field"><span>División</span><select id="recDivision" class="rec-input" required>' +
      '<option value="">Seleccione…</option>' + divOpts + '</select></label>' +
      '<label class="rec-field rec-field--wide"><span>Descripción</span><input type="text" id="recDescripcion" class="rec-input" placeholder="PAMPERS / GATORADE…" maxlength="120" required></label>' +
      operadorField +
      '<div class="rec-form-row-pair">' +
      '<label class="rec-field"><span>Paletas</span><input type="number" id="recPaletas" class="rec-input" min="0" max="999" value="0"></label>' +
      '<label class="rec-field"><span>Muelle (opcional)</span><input type="text" id="recMuelle" class="rec-input" placeholder="J9" maxlength="12" autocapitalize="characters"></label>' +
      '</div>' +
      '</div>' +
      '<button type="submit" class="rec-btn rec-btn--primary">Registrar contenedor</button>' +
      '</form></section>';
  }

  function renderToolbar(user, liveActive) {
    return '<div class="rec-toolbar">' +
      '<div class="rec-toolbar__left">' +
      '<p class="rec-toolbar-user">' + esc(A().getDisplayName(user)) + ' · ' + esc(A().getRoleLabel(user)) + '</p>' +
      '</div>' +
      '<div class="rec-toolbar__right">' +
      '<button type="button" class="rec-btn rec-btn--ghost" id="recBtnShare"' +
      (liveActive ? ' aria-pressed="true"' : '') + '>' +
      (liveActive ? '● Productividad en vivo' : 'Compartir productividad en TV') + '</button>' +
      '<a class="rec-btn rec-btn--ghost" id="recBtnOpenDisplay" href="recepcion-pantalla.html" target="_blank" rel="noopener">Abrir pantalla TV</a>' +
      '<button type="button" class="rec-btn rec-btn--ghost" id="recBtnLogout">Salir</button>' +
      '</div></div>';
  }

  function canEditMuelle(user, item) {
    if (!item || item.entrada === 'ok') return false;
    return A().canRegister(user) || A().canValidate(user);
  }

  function renderMuelleCell(item, user) {
    if (!canEditMuelle(user, item)) {
      return esc(item.muelle || '—');
    }
    return '<div class="rec-muelle-edit">' +
      '<input type="text" class="rec-input rec-muelle-input" data-rec-muelle-input="' + esc(item.id) + '" ' +
      'value="' + esc(item.muelle || '') + '" placeholder="J9" maxlength="12" autocapitalize="characters" ' +
      'aria-label="Muelle para ' + esc(item.contenedor) + '">' +
      '<button type="button" class="rec-btn rec-btn--sm rec-btn--muelle" data-rec-action="guardar-muelle" ' +
      'data-rec-id="' + esc(item.id) + '">Guardar</button></div>';
  }

  function renderMuelleModal(store) {
    store = store || S();
    var entradaField = renderEquipoSelect('recMuelleModalEntradaPor', 'Entrada por', store.ENTRADA_RECEPCION);
    return '<div class="rec-muelle-modal is-hidden" id="recMuelleModal" role="dialog" aria-modal="true" aria-labelledby="recMuelleModalTitle">' +
      '<div class="rec-muelle-modal__backdrop" data-rec-action="cerrar-muelle-modal"></div>' +
      '<div class="rec-muelle-modal__panel">' +
      '<h3 id="recMuelleModalTitle" class="rec-muelle-modal__title">Muelle de entrada</h3>' +
      '<p class="rec-muelle-modal__sub" id="recMuelleModalSub">Indique el muelle antes de confirmar la entrada.</p>' +
      '<label class="rec-field" for="recMuelleModalInput"><span>Muelle</span>' +
      '<input type="text" id="recMuelleModalInput" class="rec-input" placeholder="J9" maxlength="12" autocapitalize="characters"></label>' +
      entradaField +
      '<div class="rec-muelle-modal__actions">' +
      '<button type="button" class="rec-btn rec-btn--ghost" data-rec-action="cerrar-muelle-modal">Cancelar</button>' +
      '<button type="button" class="rec-btn rec-btn--primary" id="recMuelleModalConfirm">Confirmar entrada</button>' +
      '</div></div></div>';
  }

  function renderPersonaModal() {
    return '<div class="rec-muelle-modal is-hidden" id="recPersonaModal" role="dialog" aria-modal="true" aria-labelledby="recPersonaModalTitle">' +
      '<div class="rec-muelle-modal__backdrop" data-rec-action="cerrar-persona-modal"></div>' +
      '<div class="rec-muelle-modal__panel">' +
      '<h3 id="recPersonaModalTitle" class="rec-muelle-modal__title">Seleccionar persona</h3>' +
      '<p class="rec-muelle-modal__sub" id="recPersonaModalSub">Elija quién realizó esta acción para la productividad en pantalla TV.</p>' +
      '<label class="rec-field" for="recPersonaModalSelect"><span id="recPersonaModalLabel">Persona</span>' +
      '<select id="recPersonaModalSelect" class="rec-input" required></select></label>' +
      '<div class="rec-muelle-modal__actions">' +
      '<button type="button" class="rec-btn rec-btn--ghost" data-rec-action="cerrar-persona-modal">Cancelar</button>' +
      '<button type="button" class="rec-btn rec-btn--primary" id="recPersonaModalConfirm">Confirmar</button>' +
      '</div></div></div>';
  }

  function renderRegistroLog(data) {
    var store = S();
    var rows = store.getRegistroActividad ? store.getRegistroActividad(data, 40) : [];
    var body = rows.length ? rows.map(function (r) {
      return '<tr>' +
        '<td class="rec-log-fecha">' + esc(store.formatFecha(r.at)) + '</td>' +
        '<td class="rec-log-reg"><strong>' + esc(r.registro || '—') + '</strong></td>' +
        '<td class="rec-log-cont">' + esc(r.contenedor || '—') + '</td>' +
        '<td>' + esc(r.usuario || '—') + '</td>' +
        '<td><span class="rec-log-acc rec-log-acc--' + esc(String(r.accion || 'otro')) + '">' +
        esc(accionLabel(r.accion)) + '</span></td>' +
        '<td class="rec-log-nota">' + esc(r.nota || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="rec-empty">Sin movimientos registrados.</td></tr>';

    return '<section class="rec-panel rec-panel--log" aria-labelledby="recLogTitle">' +
      '<h2 id="recLogTitle" class="rec-panel-title">Registro de actividad</h2>' +
      '<p class="rec-log-sub">Historial de registros, validaciones, muelles y entradas.</p>' +
      '<div class="rec-table-wrap">' +
      '<table class="rec-table rec-table--log" aria-label="Registro de actividad">' +
      '<thead><tr><th>Fecha</th><th>Registro</th><th>Contenedor</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></section>';
  }

  function renderStatusCell(val) {
    var s = String(val || '').trim();
    if (!s) return '—';
    if (/^ok$/i.test(s)) return '<span class="rec-badge rec-badge--ok">OK</span>';
    return esc(s);
  }

  function renderPlanillaRows(rows, headers) {
    var colCount = (headers && headers.length) || DEFAULT_HEADERS.length;
    if (!rows.length) {
      return '<tr><td colspan="' + colCount + '" class="rec-empty">Sin filas para el rango seleccionado. Cargue la planilla o ajuste el filtro de fechas.</td></tr>';
    }
    return rows.map(function (r, idx) {
      var values = r.values || [];
      return '<tr data-rec-planilla-row="' + idx + '">' + values.map(function (val, ci) {
        var h = (headers && headers[ci]) || '';
        var cls = 'rec-col-planilla';
        if (/cont\.|factura|articulo/i.test(h)) cls += ' rec-col-planilla--strong';
        if (/validado|descargado|ubicado|remision/i.test(h)) {
          return '<td class="' + cls + '">' + renderStatusCell(val) + '</td>';
        }
        if (/^paleta/i.test(h) && String(val || '').trim() !== '') {
          var qty = parseInt(val, 10);
          if (!isNaN(qty)) {
            return '<td class="' + cls + '">' + esc(formatQty(qty)) + '</td>';
          }
        }
        var text = String(val || '').trim() || '—';
        if (/cont\.|factura|#idc|no\./i.test(h) && text !== '—') {
          return '<td class="' + cls + '"><strong>' + esc(text) + '</strong></td>';
        }
        return '<td class="' + cls + '">' + esc(text) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function renderTableRows(contenedores, user) {
    var store = S();
    if (!contenedores.length) {
      return '<tr><td colspan="12" class="rec-empty">Sin contenedores registrados.</td></tr>';
    }
    return contenedores.map(function (c) {
      var actions = '';
      if (A().canValidate(user) && c.validado !== 'ok') {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--ok" data-rec-action="validar" data-rec-id="' + esc(c.id) + '">Validar</button>';
      }
      if (A().canValidate(user) && c.validado === 'ok' && c.entrada !== 'ok') {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--ent" data-rec-action="entrada" data-rec-id="' + esc(c.id) + '">Dar entrada</button>';
      }
      if (A().canValidate(user) && c.entrada === 'ok' && c.ubicado !== 'ok') {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--ubi" data-rec-action="ubicar" data-rec-id="' + esc(c.id) + '">Ubicar</button>';
      }
      if (A().canRegister(user) || A().canValidate(user)) {
        actions += '<button type="button" class="rec-btn rec-btn--sm rec-btn--danger" data-rec-action="eliminar" data-rec-id="' + esc(c.id) + '">Quitar</button>';
      }
      return '<tr data-rec-row="' + esc(c.id) + '">' +
        '<td class="rec-col-fecha">' + esc(store.formatFechaSolo(c.fecha)) + '</td>' +
        '<td class="rec-col-registro"><strong>' + esc(c.registro || '—') + '</strong></td>' +
        '<td class="rec-col-contenedor"><strong>' + esc(c.contenedor) + '</strong></td>' +
        '<td class="rec-col-tipo">' + badgeTipo(c.tipo) + '</td>' +
        '<td class="rec-col-division">' + esc(c.division || '—') + '</td>' +
        '<td class="rec-col-desc">' + esc(c.descripcion || '—') + '</td>' +
        '<td class="rec-col-num">' + esc(String(c.paletas || 0)) + '</td>' +
        '<td class="rec-col-muelle">' + renderMuelleCell(c, user) + '</td>' +
        '<td class="rec-col-status">' + badgeValidado(c.validado) + '</td>' +
        '<td class="rec-col-status">' + badgeEntrada(c.entrada) + '</td>' +
        '<td class="rec-col-status">' + badgeUbicado(c.ubicado) + '</td>' +
        '<td class="rec-col-actions">' + actions + '</td></tr>';
    }).join('');
  }

  function renderRegistroLogCard(data) {
    var store = S();
    var rows = store.getRegistroActividad ? store.getRegistroActividad(data, 40) : [];
    var body = rows.length ? rows.map(function (r) {
      return '<tr>' +
        '<td class="rec-log-fecha">' + esc(store.formatFecha(r.at)) + '</td>' +
        '<td class="rec-log-reg"><strong>' + esc(r.registro || '—') + '</strong></td>' +
        '<td class="rec-log-cont">' + esc(r.contenedor || '—') + '</td>' +
        '<td>' + esc(r.usuario || '—') + '</td>' +
        '<td><span class="rec-log-acc rec-log-acc--' + esc(String(r.accion || 'otro')) + '">' +
        esc(accionLabel(r.accion)) + '</span></td>' +
        '<td class="rec-log-nota">' + esc(r.nota || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="rec-empty">Sin movimientos registrados.</td></tr>';

    return '<div class="rbl-card rec-panel rec-panel--log">' +
      '<div class="rbl-card-head"><h3>Historia de operaciones</h3><span>Registro de actividad</span></div>' +
      '<div class="rbl-card-body">' +
      '<div class="rec-table-wrap">' +
      '<table class="rec-table rec-table--log" aria-label="Registro de actividad">' +
      '<thead><tr><th>Fecha</th><th>Registro</th><th>Contenedor</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div></div></div>';
  }

  function renderApp(user, data) {
    var store = S();
    data = data || store.load();
    var planilla = store.getPlanilla ? store.getPlanilla(data) : data.planilla;
    var filter = loadFechaFilter();
    var filteredRows = store.filterPlanillaRows
      ? store.filterPlanillaRows(planilla, filter)
      : ((planilla && planilla.rows) || []);
    var headers = (planilla && planilla.headers && planilla.headers.length)
      ? planilla.headers
      : DEFAULT_HEADERS;
    var counts = store.countPlanillaKpis
      ? store.countPlanillaKpis(filteredRows)
      : store.countResumen(data.contenedores);
    var liveActive = store.isLiveShareBoardActive(data);

    return '<div class="rec-tc-app rbl-f">' +
      renderTorreDrawer(user) +
      '<div class="rbl-stage"><div class="rbl-f-wrap">' +
      renderTorreHero() +
      '<div class="rbl-f-screen is-on" data-rec-screen="ops">' +
      renderFechaFilter(filter, liveActive) +
      renderTorreKpis(counts, filter.estado || '') +
      '<div class="rbl-card rbl-card--manifest">' +
      '<div class="rbl-card-head"><h3>Manifiesto de recepción</h3>' +
      '<span>' + esc(formatQty(filteredRows.length)) + ' en seguimiento</span></div>' +
      '<div class="rbl-card-body rbl-card-body--flush">' +
      '<div class="rec-table-wrap rec-table-wrap--manifest rec-table-wrap--rows20">' +
      '<table class="rec-table rec-table--manifest rec-table--planilla" aria-label="Manifiesto de recepción">' +
      '<thead><tr>' +
      headers.map(function (h) {
        return '<th title="' + esc(h) + '">' + esc(h) + '</th>';
      }).join('') +
      '</tr></thead>' +
      '<tbody id="recTableBody">' + renderPlanillaRows(filteredRows, headers) + '</tbody>' +
      '</table></div></div></div>' +
      renderRegistroFormCard(user, planilla) +
      '</div>' +
      '<div class="rbl-f-screen" data-rec-screen="hist">' + renderRegistroLogCard(data) + '</div>' +
      renderTorreCfg(user, liveActive) +
      '</div></div>' +
      renderMuelleModal(store) +
      renderPersonaModal() +
      '</div>';
  }

  function setRecScreen(root, id) {
    if (!root) return;
    root.querySelectorAll('.rbl-f-screen').forEach(function (s) {
      s.classList.toggle('is-on', s.getAttribute('data-rec-screen') === id);
    });
    root.querySelectorAll('.rbl-drawer-link').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-rec-screen') === id);
    });
  }

  function closeRecDrawer(root) {
    if (!root) return;
    var btn = root.querySelector('#recHubBtn');
    var bd = root.querySelector('#recDrawerBd');
    var dr = root.querySelector('#recDrawer');
    if (btn) { btn.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
    if (bd) { bd.classList.remove('is-open'); bd.hidden = true; }
    if (dr) dr.classList.remove('is-open');
  }

  function openRecDrawer(root) {
    if (!root) return;
    var btn = root.querySelector('#recHubBtn');
    var bd = root.querySelector('#recDrawerBd');
    var dr = root.querySelector('#recDrawer');
    if (btn) { btn.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    if (bd) { bd.hidden = false; bd.classList.add('is-open'); }
    if (dr) dr.classList.add('is-open');
  }

  function bindTorreNav(root) {
    /* Delegado en bindAppEventsOnce — evita listeners duplicados al re-renderizar. */
  }

  function readMuelleInput(root, id) {
    if (!root || !id) return '';
    var input = root.querySelector('[data-rec-muelle-input="' + id + '"]');
    return input ? String(input.value || '').trim() : '';
  }

  function bindAppEventsOnce(root) {
    if (!root || root.__recAppEventsBound) return;
    root.__recAppEventsBound = true;

    root.addEventListener('click', function (ev) {
      var callbacks = root.__recAppCallbacks || {};

      if (ev.target.closest('#recHubBtn')) {
        var dr = root.querySelector('#recDrawer');
        if (dr && dr.classList.contains('is-open')) closeRecDrawer(root);
        else openRecDrawer(root);
        return;
      }
      if (ev.target.closest('#recDrawerBd')) {
        closeRecDrawer(root);
        return;
      }
      var screenBtn = ev.target.closest('.rbl-drawer-link[data-rec-screen]');
      if (screenBtn) {
        var screenId = screenBtn.getAttribute('data-rec-screen');
        if (screenId) {
          setRecScreen(root, screenId);
          try {
            if (global.history && global.history.replaceState) {
              global.history.replaceState(null, '', '#' + screenId);
            } else if (global.location) {
              global.location.hash = screenId;
            }
          } catch (e) { /* noop */ }
          closeRecDrawer(root);
        }
        return;
      }
      if (ev.target.closest('#recBtnShare') || ev.target.closest('#recBtnShareCfg')) {
        if (callbacks.onToggleShare) callbacks.onToggleShare();
        return;
      }
      if (ev.target.closest('#recBtnOpenDisplay')) {
        ev.preventDefault();
        if (callbacks.onOpenDisplay) callbacks.onOpenDisplay();
        return;
      }
      if (ev.target.closest('#recBtnLogout')) {
        if (callbacks.onLogout) callbacks.onLogout();
        return;
      }

      var btn = ev.target.closest('[data-rec-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-rec-action');
      var recId = btn.getAttribute('data-rec-id');
      if (action === 'validar' && callbacks.onValidar) callbacks.onValidar(recId);
      if (action === 'guardar-muelle' && callbacks.onGuardarMuelle) {
        callbacks.onGuardarMuelle(recId, readMuelleInput(root, recId));
      }
      if (action === 'entrada' && callbacks.onEntrada) {
        callbacks.onEntrada(recId, readMuelleInput(root, recId));
      }
      if (action === 'ubicar' && callbacks.onUbicar) callbacks.onUbicar(recId);
      if (action === 'cerrar-muelle-modal' && callbacks.onCloseMuelleModal) {
        callbacks.onCloseMuelleModal();
      }
      if (action === 'cerrar-persona-modal' && callbacks.onClosePersonaModal) {
        callbacks.onClosePersonaModal();
      }
      if (action === 'eliminar' && callbacks.onEliminar) callbacks.onEliminar(recId);
    });

    root.addEventListener('keydown', function (ev) {
      var callbacks = root.__recAppCallbacks || {};
      if (ev.key !== 'Enter') return;
      var input = ev.target.closest('[data-rec-muelle-input]');
      if (!input || !callbacks.onGuardarMuelle) return;
      ev.preventDefault();
      callbacks.onGuardarMuelle(input.getAttribute('data-rec-muelle-input'), input.value);
    });
  }

  function bindApp(root, user, callbacks) {
    callbacks = callbacks || {};
    if (!root) return;

    root.__recAppCallbacks = callbacks;
    root.__recAppUser = user;
    bindAppEventsOnce(root);

    var hash = String((global.location && global.location.hash) || '').replace(/^#/, '');
    if (hash === 'ops' || hash === 'hist' || hash === 'cfg') {
      setRecScreen(root, hash);
    }

    var form = root.querySelector('#recRegistroForm');
    if (form && !form.__recFormBound) {
      form.__recFormBound = true;
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var cbs = root.__recAppCallbacks || {};
        var fechaEl = root.querySelector('#recFecha');
        var fecha = fechaEl && fechaEl.value ? new Date(fechaEl.value + 'T12:00:00').toISOString() : new Date().toISOString();
        var payload = {
          fecha: fecha,
          contenedor: root.querySelector('#recContenedor') && root.querySelector('#recContenedor').value,
          tipo: root.querySelector('#recTipo') && root.querySelector('#recTipo').value,
          division: root.querySelector('#recDivision') && root.querySelector('#recDivision').value,
          descripcion: root.querySelector('#recDescripcion') && root.querySelector('#recDescripcion').value,
          paletas: root.querySelector('#recPaletas') && root.querySelector('#recPaletas').value,
          muelle: root.querySelector('#recMuelle') && root.querySelector('#recMuelle').value,
          operadorDescarga: root.querySelector('#recOperadorSentado') && root.querySelector('#recOperadorSentado').value
        };
        if (cbs.onRegister) cbs.onRegister(payload, form);
      });
    }

    bindFechaFilter(root);
    bindPlanillaUpload(root);
  }

  function bindFechaFilter(root) {
    if (!root || root.__recFechaBound) return;
    root.__recFechaBound = true;

    function currentEstado() {
      var cur = loadFechaFilter();
      return cur.estado || '';
    }

    function applyFilter(next, rerender) {
      if (!next.estado && next.estado !== '') next.estado = currentEstado();
      saveFechaFilter(next);
      var hint = root.querySelector('#recFechaHint');
      if (hint) hint.textContent = filterHintText(next);
      root.querySelectorAll('[data-rec-fecha-preset]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-rec-fecha-preset') === next.preset);
      });
      root.querySelectorAll('[data-rec-estado]').forEach(function (btn) {
        btn.classList.toggle('is-active', (btn.getAttribute('data-rec-estado') || '') === (next.estado || ''));
      });
      var cbs = root.__recAppCallbacks || {};
      if (rerender && cbs.onFechaFilterChange) cbs.onFechaFilterChange(next);
    }

    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || (t.id !== 'recFechaDesde' && t.id !== 'recFechaHasta')) return;
      var desdeEl = root.querySelector('#recFechaDesde');
      var hastaEl = root.querySelector('#recFechaHasta');
      applyFilter({
        desde: desdeEl ? desdeEl.value : '',
        hasta: hastaEl ? hastaEl.value : '',
        preset: 'custom',
        estado: currentEstado()
      }, true);
    });

    root.addEventListener('click', function (ev) {
      var estadoBtn = ev.target.closest('[data-rec-estado]');
      if (estadoBtn) {
        var cur = loadFechaFilter();
        applyFilter({
          desde: cur.desde || '',
          hasta: cur.hasta || '',
          preset: cur.preset || 'todas',
          estado: estadoBtn.getAttribute('data-rec-estado') || ''
        }, true);
        return;
      }
      var btn = ev.target.closest('[data-rec-fecha-preset]');
      if (!btn) return;
      var preset = btn.getAttribute('data-rec-fecha-preset') || 'todas';
      var next = resolvePresetRange(preset, todayInputValue(), currentEstado());
      var desdeEl = root.querySelector('#recFechaDesde');
      var hastaEl = root.querySelector('#recFechaHasta');
      if (desdeEl) desdeEl.value = next.desde || '';
      if (hastaEl) hastaEl.value = next.hasta || '';
      applyFilter(next, true);
    });
  }

  function bindPlanillaUpload(root) {
    if (!root || root.__recPlanillaBound) return;
    root.__recPlanillaBound = true;
    root.addEventListener('change', function (ev) {
      var input = ev.target && ev.target.id === 'recPlanillaFile' ? ev.target : null;
      if (!input || !input.files || !input.files[0]) return;
      var cbs = root.__recAppCallbacks || {};
      if (cbs.onImportPlanilla) cbs.onImportPlanilla(input.files[0], input);
    });
  }

  global.PlatformRecepcionUI = {
    renderApp: renderApp,
    bindApp: bindApp,
    renderTableRows: renderTableRows,
    renderKpis: renderKpis,
    loadFechaFilter: loadFechaFilter,
    saveFechaFilter: saveFechaFilter
  };
})(typeof window !== 'undefined' ? window : this);
