/**
 * Control de Turnos — vista administrativa
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var state = { module: 'dashboard', adminUser: null };

  var MODULE_VIEW_IDS = {
    despacho: 'turnosViewDespacho',
    liquidacion: 'turnosViewLiquidacion',
    nota_credito: 'turnosViewNota_credito'
  };

  var ICON_V = '?v=11';

  var TRAMITE_MODULES = {
    despacho: {
      tipo: 'despacho_facturas',
      title: 'Despacho de facturas',
      hint: 'Cola de choferes por tipo de camión y paletas. Convocar → ventana de despacho.',
      icon: 'assets/img/icon-turnos-despacho.svg' + ICON_V
    },
    liquidacion: {
      tipo: 'liquidacion_facturas',
      title: 'Liquidación de facturas',
      hint: 'Cierre por cantidad de viajes. Convocar cuando esté listo para atender.',
      icon: 'assets/img/icon-turnos-liquidacion.svg' + ICON_V
    },
    nota_credito: {
      tipo: 'nota_credito',
      title: 'Nota de crédito',
      hint: 'Flujo: Pendiente → Confirmado → Asentado.',
      icon: 'assets/img/icon-turnos-nota-credito.svg' + ICON_V
    }
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function todayEntries() {
    return C().entriesToday(S().getState().entries);
  }

  function canConvocar(entry) {
    if (!entry || entry.estado === 'CANCELADO') return false;
    if (entry.tipo === C().TIPOS.NOTA_CREDITO) {
      return entry.estado === 'PENDIENTE' || entry.estado === 'CONFIRMADO';
    }
    return entry.estado === 'PENDIENTE';
  }

  function convocarBtn(entry) {
    if (!canConvocar(entry)) return '';
    return '<button type="button" class="turnos-btn turnos-btn--call" data-convocar-id="' + esc(entry.id) + '" title="Avisar al chofer con vibración">' +
      'Convocar → ventana</button>';
  }

  function statusBadge(estado) {
    var cls = C().statusClass(estado);
    return '<span class="turnos-badge turnos-badge--' + cls + '">' + esc(estado.replace(/_/g, ' ')) + '</span>';
  }

  function statusSelect(entry) {
    if (entry.estado === 'CANCELADO') return statusBadge(entry.estado);
    var options = C().allowedStates(entry.tipo).map(function (st) {
      var sel = st === entry.estado ? ' selected' : '';
      return '<option value="' + esc(st) + '"' + sel + '>' + esc(st.replace(/_/g, ' ')) + '</option>';
    }).join('');
    return '<select class="turnos-status-select" data-turno-id="' + esc(entry.id) + '" aria-label="Cambiar estado">' + options + '</select>';
  }

  function formatUpdated(entry) {
    if (!entry.updatedAt) return '—';
    var d = new Date(entry.updatedAt);
    return C().formatFechaDisplay(C().todayKey(d)) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function closeSeguimientoModal() {
    var el = document.getElementById('turnosSeguimientoOverlay');
    if (el) el.remove();
    document.body.classList.remove('turnos-seg-open');
  }

  function showSeguimientoModal(entry) {
    if (!entry) return;
    closeSeguimientoModal();
    var steps = C().ensureSeguimiento(entry).map(function (h, i) {
      return (
        '<li class="turnos-seg-step">' +
        '<span class="turnos-seg-step-num">' + (i + 1) + '</span>' +
        '<div class="turnos-seg-step-body">' +
        '<strong>' + esc(C().pasoLabel(h.paso)) + '</strong>' +
        '<span class="turnos-seg-step-date turnos-mono">' + esc(C().formatFechaDisplay(h.fecha)) + ' · ' + esc(h.hora) + '</span>' +
        '<span class="turnos-seg-step-meta">Compañía: <strong>' + esc(h.compania || entry.choferCompania || '—') + '</strong></span>' +
        (h.por ? '<span class="turnos-seg-step-meta">Por: ' + esc(h.por) + '</span>' : '') +
        (h.nota ? '<span class="turnos-seg-step-note">' + esc(h.nota) + '</span>' : '') +
        '</div></li>'
      );
    }).join('');
    var overlay = document.createElement('div');
    overlay.id = 'turnosSeguimientoOverlay';
    overlay.className = 'turnos-seg-overlay';
    overlay.innerHTML =
      '<div class="turnos-seg-card" role="dialog" aria-labelledby="turnosSegTitle">' +
      '<h3 id="turnosSegTitle">Seguimiento ' + esc(entry.turno) + '</h3>' +
      '<p class="turnos-sub">' + esc(entry.choferNombre) + ' · ' + esc(entry.choferCompania || '—') + '</p>' +
      '<ol class="turnos-seg-timeline">' + steps + '</ol>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-seg-close>Cerrar</button></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('turnos-seg-open');
    overlay.addEventListener('click', function (ev) {
      if (ev.target === overlay || ev.target.closest('[data-seg-close]')) closeSeguimientoModal();
    });
  }

  function despachoDetalleCell(e) {
    if (e.tipo !== C().TIPOS.DESPACHO) {
      return '<td class="turnos-qr-cell" title="' + esc(e.detalle) + '">' + esc(e.detalle) + '</td>';
    }
    var cam = C().normalizeTipoCamion(e.tipoCamion) || '—';
    var pal = e.cantidadPaletas != null ? e.cantidadPaletas : '—';
    return '<td class="turnos-qr-cell" title="' + esc(e.detalle) + '">' +
      '<span class="turnos-mono">' + esc(cam) + '</span> · ' + esc(String(pal)) + ' paletas</td>';
  }

  function companiaCell(e, compact, readonly) {
    return '<td>' + esc(e.choferCompania || '—') + '</td>';
  }

  function dayBannerHtml(stats) {
    var dayLabel = C().formatFechaLongRD();
    var data = S().getState();
    var auto = data.autoResetDashboard !== false;
    if (stats.totalHoy === 0) {
      return (
        '<div class="turnos-day-banner turnos-day-banner--fresh">' +
        '<p class="turnos-day-banner__eyebrow">Vista del dashboard · Hora República Dominicana</p>' +
        '<h2 class="turnos-day-banner__title">' + esc(dayLabel) + '</h2>' +
        '<p class="turnos-day-banner__sub">' +
        (auto
          ? 'El seguimiento del dashboard inició vacío para hoy. Los turnos anteriores se conservan en cada área de trámite.'
          : 'Sin turnos registrados hoy en el dashboard. Los turnos activos siguen en las áreas de trámite.') +
        '</p></div>'
      );
    }
    return (
      '<div class="turnos-day-banner">' +
      '<p class="turnos-day-banner__eyebrow">Operaciones de hoy (dashboard)</p>' +
      '<h2 class="turnos-day-banner__title">' + esc(dayLabel) + '</h2>' +
      '<p class="turnos-day-banner__sub">Los turnos de días anteriores permanecen en Despacho, Liquidación y Nota de crédito.</p>' +
      '</div>'
    );
  }

  function adminTableHtml(entries, compact, readonly, showOrder) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay registros en esta sección.</p>';
    }
    var rows = entries.map(function (e, idx) {
      var convocado = e.convocadoAt
        ? '<span class="turnos-badge turnos-badge--process turnos-badge--mini">Convocado</span> '
        : '';
      var tail = '';
      if (!compact && readonly) {
        tail = '<td class="turnos-muted-inline">' + esc(e.updatedBy || '—') + '<br>' + esc(formatUpdated(e)) + '</td>';
      } else if (!compact) {
        tail =
          '<td class="turnos-mono turnos-muted-inline">' + esc(formatUpdated(e)) + '</td>' +
          '<td class="turnos-actions-cell">' +
          '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--sm" data-seguimiento-id="' + esc(e.id) + '">Seguimiento</button> ' +
          convocarBtn(e) + ' ' + statusSelect(e) + '</td>';
      }
      var orderCol = showOrder
        ? '<td class="turnos-order-num" title="Orden de llegada">' + (idx + 1) + '</td>'
        : '';
      var isNext = showOrder && idx === 0 && e.estado === 'PENDIENTE' && C().isTurnActive(e);
      return '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + (isNext ? ' turnos-row--next' : '') + '">' +
        orderCol +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) +
        (e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '') +
        (isNext ? '<br><span class="turnos-badge turnos-badge--next">Siguiente</span>' : '') + '</td>' +
        (compact ? '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' : '') +
        '<td class="turnos-mono turnos-fecha-cell">' + esc(C().formatFechaDisplay(e.fecha)) + '<br><span class="turnos-muted-inline">' + esc(e.hora) + '</span></td>' +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        companiaCell(e, compact, readonly) +
        despachoDetalleCell(e) +
        '<td>' + convocado + statusBadge(e.estado) + '</td>' +
        tail +
        '</tr>';
    }).join('');

    var head =
      (showOrder ? '<th>#</th>' : '') +
      '<th>Turno</th>' +
      (compact ? '<th>Trámite</th>' : '') +
      '<th>Fecha</th><th>Chofer</th><th>Compañía</th><th>Camión / detalle</th><th>Estado</th>' +
      (!compact && readonly ? '<th>Cancelado por</th>' : '') +
      (!compact && !readonly ? '<th>Actualizado</th><th>Gestionar</th>' : '');

    return '<div class="turnos-table-wrap"><table class="turnos-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function lastTurnKpi(areaLabel, entry, navKey) {
    var val = entry ? entry.turno : '—';
    return (
      '<button type="button" class="turnos-kpi turnos-kpi--gray turnos-kpi--nav" data-turnos-nav="' + esc(navKey) + '">' +
      '<span class="turnos-kpi-label">Último turno · ' + esc(areaLabel) + '</span>' +
      '<strong class="turnos-mono">' + esc(val) + '</strong>' +
      '</button>'
    );
  }

  function attendanceQueueTableHtml(entries, opts) {
    opts = opts || {};
    if (!entries.length) {
      return '<p class="turnos-empty">' + esc(opts.empty || 'No hay turnos en cola.') + '</p>';
    }
    var rows = entries.map(function (e, idx) {
      var convocado = e.convocadoAt
        ? '<span class="turnos-badge turnos-badge--process turnos-badge--mini">Convocado</span> '
        : '';
      var isNext = idx === 0 && C().isTurnActive(e) && e.estado === 'PENDIENTE';
      return (
        '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + (isNext ? ' turnos-row--next' : '') + '">' +
        '<td class="turnos-order-num">' + (idx + 1) + '</td>' +
        '<td class="turnos-mono turnos-turno">' + esc(e.turno) +
        (e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '') +
        (isNext ? '<br><span class="turnos-badge turnos-badge--next">Siguiente</span>' : '') + '</td>' +
        '<td class="turnos-mono">' + esc((e.hora || '').slice(0, 8)) + '</td>' +
        '<td>' + esc(e.choferNombre || '—') + '</td>' +
        '<td>' + esc(e.choferCompania || '—') + '</td>' +
        (opts.showTipo ? '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' : '') +
        '<td>' + convocado + statusBadge(e.estado) + '</td>' +
        '</tr>'
      );
    }).join('');
    var tipoHead = opts.showTipo ? '<th>Trámite</th>' : '';
    return (
      '<div class="turnos-table-wrap turnos-table-wrap--queue">' +
      '<table class="turnos-table turnos-table--queue">' +
      '<thead><tr><th>#</th><th>Turno</th><th>Hora llegada</th><th>Chofer</th><th>Compañía</th>' + tipoHead + '<th>Estado</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>'
    );
  }

  function tramiteStats(tipo) {
    var all = C().filterByTipo(S().getState().entries, tipo, false);
    var today = C().filterByTipo(todayEntries(), tipo, false);
    return {
      total: all.length,
      totalHoy: today.length,
      pendientes: all.filter(function (e) { return e.estado === 'PENDIENTE'; }).length,
      enCurso: all.filter(function (e) {
        return e.estado === 'EN_PROCESO' || e.estado === 'CONFIRMADO';
      }).length,
      cerrados: today.filter(function (e) {
        return e.estado === 'COMPLETADO' || e.estado === 'ASENTADO';
      }).length
    };
  }

  function updateNavBadges() {
    var pending = C().filterPendingValidation(S().getState().entries).length;
    var badge = $('turnosNavValidacionBadge');
    if (badge) {
      badge.textContent = String(pending);
      badge.hidden = pending < 1;
    }
    var liteBadge = $('turnosLitePendingBadge');
    if (liteBadge) {
      liteBadge.textContent = String(pending);
      liteBadge.hidden = pending < 1;
    }
  }

  function isSupervisorLite() {
    if (document.documentElement.getAttribute('data-turnos-portal') !== 'supervisor') return false;
    try {
      return global.matchMedia('(max-width: 960px)').matches;
    } catch (e) {
      return true;
    }
  }

  function applySupervisorLayout() {
    var lite = isSupervisorLite();
    document.body.classList.toggle('turnos-supervisor-lite', lite);
    document.body.classList.toggle('turnos-supervisor-full', !lite);
    var root = $('turnosAdminRoot');
    if (root) {
      root.classList.toggle('turnos-app--lite', lite);
      root.classList.toggle('turnos-app--full', !lite);
    }
  }

  function tramiteIconFile(tipo) {
    if (tipo === C().TIPOS.DESPACHO) return 'icon-turnos-despacho.svg';
    if (tipo === C().TIPOS.LIQUIDACION) return 'icon-turnos-liquidacion.svg';
    if (tipo === C().TIPOS.NOTA_CREDITO) return 'icon-turnos-nota-credito.svg';
    return 'icon-turnos-portal.svg';
  }

  function tramiteCardClass(tipo) {
    if (tipo === C().TIPOS.DESPACHO) return 'turnos-val-card--despacho';
    if (tipo === C().TIPOS.LIQUIDACION) return 'turnos-val-card--liquidacion';
    if (tipo === C().TIPOS.NOTA_CREDITO) return 'turnos-val-card--nota';
    return '';
  }

  function validacionEmptyHtml(lite) {
    if (lite) {
      return (
        '<div class="turnos-val-empty turnos-val-empty--lite">' +
        '<div class="turnos-val-empty__icon" aria-hidden="true">' +
        '<img src="assets/img/icon-turnos-validacion.svg' + ICON_V + '" alt="" width="72" height="72">' +
        '</div>' +
        '<h3 class="turnos-val-empty__title">Todo al día</h3>' +
        '<p class="turnos-val-empty__text">No hay choferes esperando validación. Cuando alguien envíe una solicitud desde el portal chofer, aparecerá aquí al instante.</p>' +
        '<ol class="turnos-val-empty__steps">' +
        '<li>El chofer envía solicitud desde su celular</li>' +
        '<li>Usted confirma que está en el almacén</li>' +
        '<li>Se asigna el número T-XXXX y entra a la cola</li>' +
        '</ol></div>'
      );
    }
    return '<p class="turnos-empty">No hay solicitudes pendientes de validación.</p>';
  }

  function validacionLiteHeroHtml(count, userName) {
    var label = count === 1 ? 'solicitud pendiente' : 'solicitudes pendientes';
    var guide = count > 0
      ? '<div class="turnos-lite-guide">' +
        '<p class="turnos-lite-guide__title">Cómo validar</p>' +
        '<ol class="turnos-lite-guide__steps">' +
        '<li><strong>Verifique</strong> que el chofer está en el almacén</li>' +
        '<li><strong>Prioritario</strong> solo si debe adelantar en cola</li>' +
        '<li>Toque <strong>Validar presencia</strong> para asignar T-XXXX</li>' +
        '</ol></div>'
      : '';
    return (
      '<div class="turnos-lite-shell">' +
      '<div class="turnos-lite-hero">' +
      '<div class="turnos-lite-hero__bar">' +
      '<span class="turnos-lite-hero__brand">Turnos Supervisor</span>' +
      '<div class="turnos-lite-hero__tools">' +
      '<button type="button" class="turnos-lite-tool-btn" data-admin-action="refresh-validacion" title="Actualizar">↻</button>' +
      '<button type="button" class="turnos-lite-tool-btn turnos-lite-tool-btn--logout" data-admin-action="logout">Salir</button>' +
      '</div></div>' +
      '<div class="turnos-lite-hero__body">' +
      '<div class="turnos-lite-hero__main">' +
      '<p class="turnos-lite-hero__greet">Hola, <strong>' + esc(userName || 'Supervisor') + '</strong></p>' +
      '<div class="turnos-lite-hero__stat' + (count > 0 ? ' turnos-lite-hero__stat--alert' : '') + '">' +
      '<span class="turnos-lite-hero__num">' + count + '</span>' +
      '<span class="turnos-lite-hero__label">' + label + '</span></div></div>' +
      '<div class="turnos-lite-hero__clock">' +
      '<span class="turnos-lite-hero__clock-time turnos-mono" id="turnosLiteClockTime">--:--</span>' +
      '<span class="turnos-lite-hero__clock-date" id="turnosLiteClockDate">—</span>' +
      '</div></div></div>' +
      guide +
      '</div>'
    );
  }

  function validacionCardHtml(e, idx) {
    var pos = (idx || 0) + 1;
    var tipoLabel = C().TIPO_LABELS[e.tipo] || e.tipo;
    var icon = tramiteIconFile(e.tipo);
    var tipoCls = tramiteCardClass(e.tipo);
    return (
      '<article class="turnos-val-card ' + tipoCls + '" data-val-id="' + esc(e.id) + '">' +
      '<div class="turnos-val-card__top">' +
      '<span class="turnos-val-card__queue">#' + pos + ' en espera</span>' +
      '<span class="turnos-val-card__time turnos-mono">' + esc((e.hora || '').slice(0, 8)) + '</span>' +
      '</div>' +
      '<div class="turnos-val-card__tipo">' +
      '<img src="assets/img/' + icon + ICON_V + '" alt="" width="36" height="36">' +
      '<div><span class="turnos-val-card__tipo-label">Trámite</span>' +
      '<strong>' + esc(tipoLabel) + '</strong></div></div>' +
      '<div class="turnos-val-card__grid">' +
      '<div class="turnos-val-field turnos-val-field--chofer">' +
      '<span class="turnos-val-label">Chofer</span>' +
      '<strong class="turnos-val-value">' + esc(e.choferNombre || '—') + '</strong></div>' +
      '<div class="turnos-val-field">' +
      '<span class="turnos-val-label">Compañía</span>' +
      '<strong class="turnos-val-value">' + esc(e.choferCompania || '—') + '</strong></div>' +
      (e.detalle
        ? '<div class="turnos-val-field turnos-val-field--full">' +
          '<span class="turnos-val-label">Detalle</span>' +
          '<span class="turnos-val-value turnos-val-value--detalle">' + esc(e.detalle) + '</span></div>'
        : '') +
      '</div>' +
      '<label class="turnos-val-card__priority">' +
      '<input type="checkbox" class="turnos-val-priority-check" data-prioridad-for="' + esc(e.id) + '">' +
      '<span class="turnos-val-card__priority-text">' +
      '<strong>Turno prioritario</strong>' +
      '<small>Marque solo si debe pasar primero en la cola</small></span></label>' +
      '<div class="turnos-val-card__actions">' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl turnos-btn--validate" data-validate-id="' + esc(e.id) + '">' +
      '<span class="turnos-btn__icon" aria-hidden="true">✓</span> Validar presencia</button>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-reject-id="' + esc(e.id) + '">Rechazar solicitud</button>' +
      '</div></article>'
    );
  }

  function validacionCardsHtml(entries) {
    if (!entries.length) return validacionEmptyHtml(true);
    return '<div class="turnos-val-cards">' + entries.map(validacionCardHtml).join('') + '</div>';
  }

  function validacionListHtml(entries) {
    if (isSupervisorLite()) return validacionCardsHtml(entries);
    return validacionTableHtml(entries);
  }

  function validacionTableHtml(entries) {
    if (!entries.length) {
      return '<p class="turnos-empty">No hay solicitudes pendientes de validación.</p>';
    }
    var rows = entries.map(function (e) {
      var prio = e.prioridad ? '<br>' + C().priorityBadgeHtml(e) : '';
      return (
        '<tr class="' + (e.prioridad ? 'turnos-row--priority' : '') + '">' +
        '<td class="turnos-mono turnos-fecha-cell">' + esc(C().formatFechaDisplay(e.fecha)) +
        '<br><span class="turnos-muted-inline">' + esc(e.hora) + '</span></td>' +
        '<td>' + esc(C().TIPO_LABELS[e.tipo] || e.tipo) + '</td>' +
        '<td>' + esc(e.choferNombre || '—') + prio + '</td>' +
        '<td>' + esc(e.choferCompania || '—') + '</td>' +
        despachoDetalleCell(e) +
        '<td>' + statusBadge(e.estado) + '</td>' +
        '<td class="turnos-actions-cell turnos-actions-cell--validacion">' +
        '<label class="turnos-val-inline-priority">' +
        '<input type="checkbox" class="turnos-val-priority-check" data-prioridad-for="' + esc(e.id) + '"> Prioritario</label> ' +
        '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--sm" data-validate-id="' + esc(e.id) + '">Validar presencia</button> ' +
        '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--sm" data-reject-id="' + esc(e.id) + '">Rechazar</button>' +
        '</td></tr>'
      );
    }).join('');
    return (
      '<div class="turnos-table-wrap">' +
      '<table class="turnos-table turnos-table--validacion">' +
      '<thead><tr><th>Hora solicitud</th><th>Trámite</th><th>Chofer</th><th>Compañía</th><th>Camión / detalle</th><th>Estado</th><th>Acción</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>'
    );
  }

  function renderValidacion() {
    var host = $('turnosViewValidacion');
    if (!host) return;
    var pending = C().sortByArrivalOrder(C().filterPendingValidation(S().getState().entries));
    var lite = isSupervisorLite();
    var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
    host.innerHTML =
      (lite ? validacionLiteHeroHtml(pending.length, userName) : '') +
      '<section class="turnos-panel turnos-panel--validacion' + (lite ? ' turnos-panel--validacion-lite' : '') + '">' +
      (!lite
        ? '<div class="turnos-tramite-head">' +
          '<img src="assets/img/icon-turnos-validacion.svg' + ICON_V + '" alt="" width="48" height="48">' +
          '<div><h2>Validar turnos</h2>' +
          '<p class="turnos-sub turnos-sub-long">Confirme que el chofer está en el almacén antes de asignar el número T-XXXX. Sin validación no se genera ticket ni entra a la cola.</p></div></div>' +
          '<p class="turnos-validacion-count"><strong>' + pending.length + '</strong> solicitud(es) pendiente(s)</p>' +
          (global.PlatformTurnosPwa && !global.PlatformTurnosPwa.isStandalone()
            ? '<p class="turnos-hint turnos-hint--info turnos-validacion-install-hint">Guarde el <strong>acceso supervisor</strong> en el celular para validar con un toque. En PC verá el panel completo.</p>'
            : '')
        : (pending.length
          ? '<h2 class="turnos-lite-list-title">Solicitudes por validar</h2>'
          : '')) +
      validacionListHtml(pending) +
      '</section>';
    updateNavBadges();
    updateClock();
  }

  function setModule(mod) {
    if (isSupervisorLite() && mod !== 'validacion') mod = 'validacion';
    state.module = mod;
    document.querySelectorAll('.turnos-view').forEach(function (el) {
      el.hidden = el.getAttribute('data-module') !== mod;
    });
    document.querySelectorAll('[data-turnos-nav]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-turnos-nav') === mod);
    });
    var titles = {
      dashboard: 'Resumen — ' + C().formatFechaDisplay(C().todayKey()),
      validacion: isSupervisorLite() ? 'Validar turnos' : 'Validar turnos — presencia en almacén',
      despacho: 'Despacho de facturas',
      liquidacion: 'Liquidación de facturas',
      nota_credito: 'Nota de crédito',
      cancelados: 'Turnos cancelados',
      export: 'Exportar registros',
      config: 'Configuración'
    };
    var titleEl = $('turnosTopTitle');
    if (titleEl) titleEl.textContent = titles[mod] || 'Gestión de turnos';

    if (mod === 'dashboard') renderDashboard();
    else if (mod === 'validacion') renderValidacion();
    else if (TRAMITE_MODULES[mod]) renderTramite(mod);
    else if (mod === 'cancelados') renderCancelados();
    else if (mod === 'export') renderExport();
    else if (mod === 'config') renderConfig();
  }

  function renderDashboard() {
    var host = $('turnosViewDashboard');
    if (!host) return;
    var data = S().getState();
    var today = todayEntries();
    var stats = C().statsToday(data.entries);
    var allEntries = data.entries;
    var lastCancel = C().latestEntry(allEntries, function (e) { return e.estado === 'CANCELADO'; });
    var lastByArea =
      lastTurnKpi('Despacho',
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.DESPACHO; }), 'despacho') +
      lastTurnKpi('Liquidación',
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.LIQUIDACION; }), 'liquidacion') +
      lastTurnKpi('Nota de crédito',
        C().latestEntry(allEntries, function (e) { return e.tipo === C().TIPOS.NOTA_CREDITO; }), 'nota_credito') +
      lastTurnKpi('Cancelados', lastCancel, 'cancelados');
    var cards = Object.keys(TRAMITE_MODULES).map(function (key) {
      var cfg = TRAMITE_MODULES[key];
      var ts = tramiteStats(cfg.tipo);
      return (
        '<button type="button" class="turnos-tramite-card" data-turnos-nav="' + key + '">' +
        '<img src="' + esc(cfg.icon) + '" alt="" width="40" height="40">' +
        '<span class="turnos-tramite-card-text">' +
        '<strong>' + esc(cfg.title) + '</strong>' +
        '<span>' + ts.pendientes + ' en cola · ' + ts.totalHoy + ' hoy</span>' +
        '</span></button>'
      );
    }).join('');
    var queueToday = C().sortForAttendanceQueue(today.filter(function (e) {
      return e.estado !== 'CANCELADO' && C().isTurnActive(e);
    }));
    var closedToday = C().sortByArrivalOrder(today.filter(function (e) {
      return e.estado === 'COMPLETADO' || e.estado === 'ASENTADO';
    }));

    host.innerHTML =
      (data.live ? '' : '<p class="turnos-offline-banner">Sin conexión con la nube. Los datos de turnos están en Supabase — verifique internet.</p>') +
      dayBannerHtml(stats) +
      '<section class="turnos-panel turnos-panel--queue">' +
      '<h2>Cola de atención — turnos por atender</h2>' +
      '<p class="turnos-sub">Posición <strong>1</strong> = siguiente a llamar. <strong>Primero en llegar, primero en salir</strong>, salvo turno prioritario.</p>' +
      attendanceQueueTableHtml(queueToday, { showTipo: true, empty: 'No hay turnos activos en cola hoy.' }) +
      '</section>' +
      '<div class="turnos-kpi-grid turnos-kpi-grid--last-areas">' + lastByArea + '</div>' +
      '<div class="turnos-kpi-grid turnos-kpi-grid--admin">' +
      kpi('Total hoy', stats.totalHoy, 'blue') +
      kpi('Pendientes', stats.pendientes, 'red') +
      kpi('Por validar', stats.pendientesValidacion, 'warn') +
      kpi('En proceso', stats.enProceso + stats.confirmados, 'process') +
      kpi('Completados', stats.completados + stats.asentados, 'green') +
      kpi('Cancelados', stats.cancelados, 'cancel') +
      kpi('Prioritarios', stats.prioridades, 'priority') +
      '</div>' +
      '<section class="turnos-panel"><h2>Áreas de seguimiento</h2>' +
      '<p class="turnos-sub">Seleccione un trámite para gestionar su cola por separado.</p>' +
      '<div class="turnos-tramite-grid">' + cards +
      '<button type="button" class="turnos-tramite-card turnos-tramite-card--muted" data-turnos-nav="cancelados">' +
      '<span class="turnos-tramite-card-icon"><img src="assets/img/icon-turnos-gestion.svg' + ICON_V + '" alt="" width="40" height="40"></span>' +
      '<span class="turnos-tramite-card-text"><strong>Cancelados</strong><span>' + stats.cancelados + ' hoy</span>' +
      '</span></button>' +
      '</div></section>' +
      '<section class="turnos-panel"><h2>Cerrados hoy</h2>' +
      (closedToday.length
        ? adminTableHtml(closedToday.slice(0, 12), true)
        : '<p class="turnos-empty">Aún no hay turnos cerrados hoy.</p>') +
      '</section>';
    updateNavBadges();
  }

  function kpi(label, value, tone, mono) {
    return '<article class="turnos-kpi turnos-kpi--' + tone + '"><span class="turnos-kpi-label">' + esc(label) +
      '</span><strong' + (mono ? ' class="turnos-mono"' : '') + '>' + esc(String(value)) + '</strong></article>';
  }

  function renderTramite(modKey) {
    var host = $(MODULE_VIEW_IDS[modKey]);
    if (!host) return;
    var cfg = TRAMITE_MODULES[modKey];
    var active = C().sortForAttendanceQueue(C().filterByTipo(S().getState().entries, cfg.tipo, false).filter(function (e) {
      return C().isTurnActive(e);
    }));
    var closed = C().sortByArrivalOrder(C().filterByTipo(S().getState().entries, cfg.tipo, false).filter(function (e) {
      return e.estado === 'COMPLETADO' || e.estado === 'ASENTADO';
    }));
    var ts = tramiteStats(cfg.tipo);
    host.innerHTML =
      '<section class="turnos-panel turnos-panel--tramite">' +
      '<div class="turnos-tramite-head">' +
      '<img src="' + esc(cfg.icon) + '" alt="" width="48" height="48">' +
      '<div><h2>' + esc(cfg.title) + '</h2><p class="turnos-sub">' + esc(cfg.hint) + ' · <strong>#1 = siguiente a atender</strong> (FIFO, prioritarios adelante).</p></div></div>' +
      '<div class="turnos-tramite-kpis">' +
      miniKpi('En cola', ts.pendientes) +
      miniKpi('En curso', ts.enCurso) +
      miniKpi('Cerrados hoy', ts.cerrados) +
      miniKpi('Registrados hoy', ts.totalHoy) +
      '</div>' +
      '<section class="turnos-panel turnos-panel--queue turnos-panel--nested">' +
      '<h3>Cola de atención</h3>' +
      (active.length
        ? adminTableHtml(active, false, false, true)
        : '<p class="turnos-empty">No hay turnos activos en esta cola.</p>') +
      '</section>' +
      (closed.length
        ? '<section class="turnos-panel turnos-panel--nested turnos-panel--closed">' +
          '<h3>Cerrados</h3>' + adminTableHtml(closed, false, false, false) + '</section>'
        : '') +
      '</section>';
  }

  function miniKpi(label, value) {
    return '<div class="turnos-mini-kpi"><span>' + esc(label) + '</span><strong>' + esc(String(value)) + '</strong></div>';
  }

  function renderCancelados() {
    var host = $('turnosViewCancelados');
    if (!host) return;
    var entries = C().filterCancelados(S().getState().entries);
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Turnos cancelados</h2>' +
      '<p class="turnos-sub">Historial de cancelaciones. Los turnos cancelados se conservan para auditoría.</p>' +
      adminTableHtml(entries, false, true) +
      '</section>';
  }

  function renderExport() {
    var host = $('turnosViewExport');
    if (!host) return;
    var all = S().getState().entries;
    var nToday = todayEntries().length;
    host.innerHTML =
      '<section class="turnos-panel turnos-export-cards">' +
      '<h2>Exportar</h2><p class="turnos-sub">' + all.length + ' registros en total · ' + nToday + ' de hoy (hora RD).</p>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-xlsx">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-export.svg' + ICON_V + '" alt="" width="44" height="44"></span><strong>Excel (.xlsx)</strong></button>' +
      '<button type="button" class="turnos-export-card" data-admin-action="export-csv">' +
      '<span class="turnos-export-icon"><img src="assets/img/icon-turnos-csv.svg' + ICON_V + '" alt="" width="44" height="44"></span><strong>CSV</strong></button>' +
      '</section>';
  }

  function renderConfig() {
    var host = $('turnosViewConfig');
    if (!host) return;
    var data = S().getState();
    var autoOn = data.autoResetDashboard !== false;
    host.innerHTML =
      '<section class="turnos-panel">' +
      '<h2>Configuración</h2>' +
      '<p class="turnos-sub">Usuario: <strong>' + esc(state.adminUser && (state.adminUser.name || state.adminUser.username)) + '</strong></p>' +
      '<p class="turnos-sub">Notificaciones: aviso en el teléfono aunque cambie de pantalla o cierre la pestaña (requiere permiso y acceso guardado en inicio).</p>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-admin-action="notif-perm">Activar notificaciones del navegador</button>' +
      '<div class="turnos-config-block">' +
      '<h3 class="turnos-config-title">Supervisor en el teléfono</h3>' +
      '<p class="turnos-hint">Guarde <strong>Turnos Supervisor</strong> en la pantalla de inicio. ' +
      'Enlace: <span class="turnos-mono">turnos-supervisor.html</span></p>' +
      '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-admin-action="pwa-install">Acceso directo supervisor</button>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-admin-action="pwa-copy-supervisor">Copiar enlace supervisor</button>' +
      '</div>' +
      '<div class="turnos-config-block">' +
      '<h3 class="turnos-config-title">Dashboard — seguimiento del día</h3>' +
      '<p class="turnos-hint">El dashboard muestra solo la actividad de <strong>hoy</strong>. Los turnos <strong>no se borran</strong>; siguen en Despacho, Liquidación y Nota de crédito.</p>' +
      '<label class="turnos-config-check">' +
      '<input type="checkbox" id="turnosAutoResetDashboard"' + (autoOn ? ' checked' : '') + '> ' +
      'Reiniciar vista del dashboard automáticamente cada día nuevo (hora RD)</label>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-admin-action="reset-dashboard">Reiniciar vista del dashboard ahora</button>' +
      '<p class="turnos-hint">Use el botón si desea limpiar el seguimiento del dashboard sin borrar turnos.</p>' +
      '</div>' +
      '<p class="turnos-hint">Hora oficial: <strong>República Dominicana</strong>. Prioridad la asigna el supervisor al validar. Despacho: camión T1, T2 o T4 y cantidad de paletas.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-admin-action="reset">Reiniciar numeración de turnos</button>' +
      '<p class="turnos-hint">Solo cambia el contador T-0001, T-0002… <strong>No borra</strong> el historial de turnos.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-admin-action="clear-history">Borrar TODO el historial de turnos</button>' +
      '<p class="turnos-hint turnos-hint--danger">Elimina <strong>todos</strong> los registros en la nube (Despacho, Liquidación, Nota de crédito, cancelados). Acción irreversible.</p>' +
      '<button type="button" class="turnos-btn turnos-btn--secondary" data-admin-action="logout">Cerrar sesión admin</button>' +
      '</section>';
  }

  function rowsForExport() {
    return S().getState().entries.map(function (e) {
      return {
        Turno: e.turno,
        Fecha: C().formatFechaDisplay(e.fecha),
        Hora: e.hora,
        Trámite: C().TIPO_LABELS[e.tipo] || e.tipo,
        Compañía: e.choferCompania || '',
        Chofer: e.choferNombre,
        Detalle: e.detalle,
        Camión: e.tipo === C().TIPOS.DESPACHO ? (C().normalizeTipoCamion(e.tipoCamion) || '') : '',
        Paletas: e.tipo === C().TIPOS.DESPACHO && e.cantidadPaletas != null ? e.cantidadPaletas : '',
        Estado: e.estado,
        Prioridad: e.prioridad ? 'Sí' : 'No',
        Seguimiento: C().seguimientoResumen(e),
        Convocado: e.convocadoAt ? C().formatDateTimeLocale(e.convocadoAt) : '',
        Actualizado: e.updatedAt ? C().formatDateTimeLocale(e.updatedAt) : '',
        Por: e.updatedBy || ''
      };
    });
  }

  function exportCsv() {
    var entries = S().getState().entries;
    if (!entries.length) { alert('No hay datos.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) return;
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var csv = XLSX.utils.sheet_to_csv(ws);
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'turnos_' + C().todayKey() + '.csv');
  }

  function exportXlsx() {
    var entries = S().getState().entries;
    if (!entries.length) { alert('No hay datos.'); return; }
    var XLSX = global.XLSX;
    if (!XLSX) return;
    var ws = XLSX.utils.json_to_sheet(rowsForExport());
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
    XLSX.writeFile(wb, 'turnos_' + C().todayKey() + '.xlsx');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bind() {
    var root = $('turnosAdminRoot');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('click', function (ev) {
      var nav = ev.target.closest('[data-turnos-nav]');
      if (nav) {
        ev.preventDefault();
        setModule(nav.getAttribute('data-turnos-nav'));
        return;
      }
      var segBtn = ev.target.closest('[data-seguimiento-id]');
      if (segBtn) {
        var sid = segBtn.getAttribute('data-seguimiento-id');
        var entry = S().findById(sid);
        if (entry) showSeguimientoModal(entry);
        return;
      }
      var valBtn = ev.target.closest('[data-validate-id]');
      if (valBtn) {
        var vid = valBtn.getAttribute('data-validate-id');
        var vUser = state.adminUser && (state.adminUser.name || state.adminUser.username);
        var card = valBtn.closest('.turnos-val-card, tr');
        var prioCheck = card && card.querySelector('[data-prioridad-for="' + vid + '"]');
        var prioridad = !!(prioCheck && prioCheck.checked);
        if (!confirm('¿Confirmar presencia del chofer' + (prioridad ? ' con turno PRIORITARIO' : '') + ' y asignar número de turno?')) return;
        valBtn.disabled = true;
        S().validateTurn(vid, vUser, { prioridad: prioridad }).then(function (result) {
          valBtn.disabled = false;
          if (!result.ok) {
            alert(result.msg || 'No se pudo validar.');
            refresh();
            return;
          }
          refresh();
        });
        return;
      }
      var rejBtn = ev.target.closest('[data-reject-id]');
      if (rejBtn) {
        var rid = rejBtn.getAttribute('data-reject-id');
        var rUser = state.adminUser && (state.adminUser.name || state.adminUser.username);
        if (!confirm('¿Rechazar esta solicitud? El chofer no recibirá turno.')) return;
        rejBtn.disabled = true;
        S().rejectSolicitud(rid, rUser).then(function (result) {
          rejBtn.disabled = false;
          if (!result.ok) {
            alert(result.msg || 'No se pudo rechazar.');
            refresh();
            return;
          }
          refresh();
        });
        return;
      }
      var convBtn = ev.target.closest('[data-convocar-id]');
      if (convBtn) {
        var cid = convBtn.getAttribute('data-convocar-id');
        var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
        convBtn.disabled = true;
        S().convocarChofer(cid, userName).then(function (result) {
          convBtn.disabled = false;
          if (!result.ok) {
            alert(result.msg || 'No se pudo convocar.');
            refresh();
            return;
          }
          refresh();
        });
        return;
      }
      var btn = ev.target.closest('[data-admin-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-admin-action');
      if (action === 'export-xlsx') exportXlsx();
      else if (action === 'export-csv') exportCsv();
      else if (action === 'notif-perm' && global.PlatformTurnosAlerts) {
        global.PlatformTurnosAlerts.requestPermission().then(function (ok) {
          alert(ok ? 'Notificaciones activadas.' : 'No se pudieron activar. Revise permisos del navegador.');
        });
      }
      else if (action === 'pwa-install' && global.PlatformTurnosPwa) {
        global.PlatformTurnosPwa.setRole('supervisor');
        global.PlatformTurnosPwa.openInstallModal('supervisor');
      }
      else if (action === 'pwa-copy-supervisor' && global.PlatformTurnosPwa) {
        global.PlatformTurnosPwa.setRole('supervisor');
        global.PlatformTurnosPwa.copyDirectLink(null, 'supervisor');
      }
      else if (action === 'reset-dashboard') {
        S().saveConfig({ resetDashboardView: true }).then(function (result) {
          if (!result.ok) {
            alert(result.msg || 'No se pudo reiniciar la vista.');
            return;
          }
          alert('Vista del dashboard reiniciada. Los turnos se conservaron.');
          setModule('dashboard');
        });
      }
      else if (action === 'reset') {
        if (confirm('¿Reiniciar numeración de turnos?')) {
          S().resetCounter().then(function (result) {
            if (!result.ok) alert(result.msg || 'No se pudo reiniciar.');
            refresh();
          });
        }
      }
      else if (action === 'clear-history') {
        if (!confirm('¿Borrar TODO el historial de turnos en la nube?\n\nEsta acción NO se puede deshacer.')) return;
        if (!confirm('Confirme de nuevo: se eliminarán TODOS los registros (activos, atendidos y cancelados).')) return;
        S().clearAllHistory().then(function (result) {
          if (!result.ok) {
            alert(result.msg || 'No se pudo borrar el historial.');
            return;
          }
          alert('Historial borrado. La numeración reinicia en T-0001.');
          refresh();
        });
      }
      else if (action === 'logout' && global.PlatformTurnosApp) {
        global.PlatformTurnosApp.logoutAdmin();
      }
      else if (action === 'refresh-validacion') {
        refresh();
      }
    });

    root.addEventListener('change', function (ev) {
      if (ev.target.id === 'turnosAutoResetDashboard') {
        S().saveConfig({ autoResetDashboard: !!ev.target.checked }).then(function (result) {
          if (!result.ok) alert(result.msg || 'No se pudo guardar.');
        });
        return;
      }
      var sel = ev.target.closest('[data-turno-id]');
      if (!sel) return;
      var id = sel.getAttribute('data-turno-id');
      var estado = sel.value;
      var userName = state.adminUser && (state.adminUser.name || state.adminUser.username);
      S().setEstado(id, estado, userName).then(function (result) {
        if (!result.ok) {
          alert(result.msg);
          refresh();
          return;
        }
        refresh();
      });
    });
  }

  function updateClock() {
    var timeEl = $('turnosClockTime');
    var dateEl = $('turnosClockDate');
    var liteTime = $('turnosLiteClockTime');
    var liteDate = $('turnosLiteClockDate');
    var timeStr = C().formatClockTime();
    var dateStr = C().formatClockDate();
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
    if (liteTime) liteTime.textContent = timeStr.slice(0, 5);
    if (liteDate) liteDate.textContent = dateStr;
  }

  function refresh() {
    setModule(state.module);
  }

  function start(user) {
    state.adminUser = user || null;
    bind();
    S().init().then(function () {
      refresh();
    });
    if (state._unsub) state._unsub();
    state._unsub = S().subscribe(function (shared) {
      refresh();
      if (global.PlatformTurnosAlerts) global.PlatformTurnosAlerts.onStoreUpdate(shared);
    });
    if (global.PlatformTurnosAlerts) {
      global.PlatformTurnosAlerts.start();
      global.PlatformTurnosAlerts.requestPermission();
    }
    updateClock();
    setInterval(updateClock, 1000);
    state._dashboardDay = C().todayKey();
    setInterval(function () {
      var d = C().todayKey();
      if (state._dashboardDay === d) return;
      state._dashboardDay = d;
      var data = S().getState();
      if (data.autoResetDashboard === false) {
        refresh();
        return;
      }
      var sync = global.PlatformTurnosSync;
      if (sync && sync.ensureDayCurrent) {
        sync.ensureDayCurrent().then(function () { refresh(); });
      } else {
        refresh();
      }
    }, 30000);
    var label = $('turnosAdminUserLabel');
    if (label && user) label.textContent = (user.name || user.username || 'Admin') + ' (' + (user.role || 'admin') + ')';
    if (global.PanelCore && global.PanelCore.touchAveriasSession) {
      global.PanelCore.touchAveriasSession(user);
      if (state._sessionTouch) clearInterval(state._sessionTouch);
      state._sessionTouch = setInterval(function () {
        global.PanelCore.touchAveriasSession(user);
      }, 5 * 60 * 1000);
    }
    applySupervisorLayout();
    if (!state._layoutBound) {
      state._layoutBound = true;
      try {
        global.matchMedia('(max-width: 960px)').addEventListener('change', function () {
          applySupervisorLayout();
          if (isSupervisorLite() && state.module !== 'validacion') setModule('validacion');
          else refresh();
        });
      } catch (e) { /* noop */ }
    }
    setModule(isSupervisorLite() ? 'validacion' : 'dashboard');
  }

  function show() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.remove('is-hidden');
  }

  function hide() {
    var root = $('turnosAdminRoot');
    if (root) root.classList.add('is-hidden');
    if (global.PlatformTurnosAlerts) global.PlatformTurnosAlerts.stop();
  }

  global.PlatformTurnosAdmin = { start: start, show: show, hide: hide, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
