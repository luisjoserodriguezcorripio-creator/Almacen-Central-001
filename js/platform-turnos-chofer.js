/**
 * Control de Turnos — vista del chofer (sin login)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var S = function () { return global.PlatformTurnosStore; };
  var screen = 'menu';
  var selectedTipo = null;
  var lastEntry = null;
  var unsub = null;
  var vibrateTimer = null;
  var userPrefersMenu = false;
  var wasPendingValidation = false;
  var Call = function () { return global.PlatformTurnosChoferCall; };
  var Perms = function () { return global.PlatformTurnosChoferPerms; };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var ICON_V = '?v=11';

  var ICONS = {
    despacho_facturas: 'assets/img/icon-turnos-despacho.svg' + ICON_V,
    liquidacion_facturas: 'assets/img/icon-turnos-liquidacion.svg' + ICON_V,
    nota_credito: 'assets/img/icon-turnos-nota-credito.svg' + ICON_V
  };

  function isIOSDevice() {
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function iosAlertHint() {
    if (!isIOSDevice()) return '';
    return (
      '<div class="turnos-ios-hint">' +
      '<p class="turnos-hint turnos-hint--warn"><strong>iPhone:</strong> para escuchar cuando cambie de pantalla o apague la pantalla, ' +
      'toque <strong>Compartir → Agregar a pantalla de inicio</strong> y abra el portal desde ese icono. ' +
      'Active notificaciones y el volumen del timbre.</p></div>'
    );
  }

  function estadoLabel(entry) {
    if (!entry) return '';
    if (entry.convocadoAt && C().isTurnActive(entry)) {
      return 'Convocado — pase a ' + C().ventanaLabel(entry.tipo);
    }
    return 'Estado: ' + entry.estado.replace(/_/g, ' ');
  }

  function render() {
    var host = $('turnosChoferMain');
    if (!host) return;
    if (screen === 'menu') host.innerHTML = renderMenu();
    else if (screen === 'form') host.innerHTML = renderForm(selectedTipo);
    else if (screen === 'waiting') host.innerHTML = renderWaitingValidation(lastEntry);
    else if (screen === 'success') host.innerHTML = renderSuccess(lastEntry);
    ensureCallOverlay();
  }

  function renderMenu() {
    var offline = !S().getState().live
      ? '<p class="turnos-offline-banner">Sin conexión con la nube. Los turnos requieren internet.</p>'
      : '';
    var ref = C().getMyTurnRef();
    var active = ref && ref.id ? S().findById(ref.id) : null;
    if (!active || !C().isChoferSessionActive(active)) {
      active = S().findActiveByChofer(C().getRememberedChoferName());
    }
    var resume = '';
    if (active && C().isPendingValidation(active)) {
      resume =
        '<div class="turnos-my-turn-banner turnos-my-turn-banner--waiting">' +
        '<p class="turnos-my-turn-label">Solicitud en validación</p>' +
        '<p class="turnos-my-turn-hint">El supervisor debe confirmar su presencia en el almacén.</p>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-chofer-resume>Ver estado</button>' +
        '</div>';
    } else if (active && active.turno && C().isTurnActive(active)) {
      resume =
        '<div class="turnos-my-turn-banner">' +
        '<p class="turnos-my-turn-label">Su turno activo</p>' +
        '<p class="turnos-my-turn-number turnos-mono">' + esc(active.turno) + '</p>' +
        '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-chofer-resume>Ver mi turno</button>' +
        '</div>';
    }
    return (
      offline +
      resume +
      '<section class="turnos-chofer-section">' +
      '<p class="turnos-chofer-lead">Seleccione el trámite que necesita hoy:</p>' +
      '<div class="turnos-service-grid">' +
      serviceCard(C().TIPOS.DESPACHO, ICONS.despacho_facturas, 'Despacho de facturas', 'Indique tipo de camión y paletas') +
      serviceCard(C().TIPOS.LIQUIDACION, ICONS.liquidacion_facturas, 'Liquidación de facturas', 'Cierre por cantidad de viajes') +
      serviceCard(C().TIPOS.NOTA_CREDITO, ICONS.nota_credito, 'Nota de crédito', 'Solicitud para autorización') +
      '</div></section>'
    );
  }

  function serviceCard(tipo, iconSrc, title, desc) {
    return (
      '<button type="button" class="turnos-service-card" data-chofer-tipo="' + esc(tipo) + '">' +
      '<span class="turnos-service-icon"><img src="' + esc(iconSrc) + '" alt="" width="52" height="52" loading="lazy"></span>' +
      '<span class="turnos-service-text">' +
      '<span class="turnos-service-title">' + esc(title) + '</span>' +
      '<span class="turnos-service-desc">' + esc(desc) + '</span></span></button>'
    );
  }

  function renderForm(tipo) {
    var label = C().TIPO_LABELS[tipo] || 'Trámite';
    var remembered = esc(C().getRememberedChoferName());
    var rememberedCompania = esc(C().getRememberedChoferCompania());
    var extra = '';

    if (tipo === C().TIPOS.DESPACHO) {
      var camOpts = C().TIPOS_CAMION.map(function (t) {
        return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
      }).join('');
      extra =
        '<label class="turnos-field"><span>Tipo de camión</span>' +
        '<select class="turnos-input turnos-input--lg" id="turnosFieldCamion" required>' +
        '<option value="">Seleccione…</option>' + camOpts + '</select></label>' +
        '<label class="turnos-field"><span>Cantidad de paletas de su camión</span>' +
        '<input class="turnos-input turnos-input--lg" id="turnosFieldPaletas" type="number" min="1" max="99" required inputmode="numeric" placeholder="Ej: 18"></label>';
    } else if (tipo === C().TIPOS.LIQUIDACION) {
      extra =
        '<label class="turnos-field"><span>Cantidad de viajes</span>' +
        '<input class="turnos-input turnos-input--lg" id="turnosFieldViajes" type="number" min="1" max="99" required inputmode="numeric" placeholder="Ej: 3"></label>';
    } else if (tipo === C().TIPOS.NOTA_CREDITO) {
      extra = '<p class="turnos-hint turnos-hint--info">El turno quedará pendiente hasta que personal autorizado lo confirme y asiente.</p>';
    }

    return (
      '<section class="turnos-chofer-section turnos-form-panel">' +
      '<button type="button" class="turnos-back-btn" data-chofer-back>Volver</button>' +
      '<h2 class="turnos-form-title">' + esc(label) + '</h2>' +
      '<form id="turnosChoferForm" class="turnos-chofer-form" novalidate>' +
      '<label class="turnos-field"><span>Compañía de transporte</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldCompania" type="text" required maxlength="80" autocomplete="organization" value="' + rememberedCompania + '" placeholder="Escriba el nombre de su compañía"></label>' +
      '<label class="turnos-field"><span>Nombre del chofer</span>' +
      '<input class="turnos-input turnos-input--lg" id="turnosFieldChofer" type="text" required maxlength="80" autocomplete="name" value="' + remembered + '" placeholder="Su nombre completo"></label>' +
      extra +
      '<p id="turnosChoferFormError" class="turnos-form-error" hidden role="alert"></p>' +
      '<button type="submit" class="turnos-btn turnos-btn--primary turnos-btn--xl turnos-btn--hero">Enviar solicitud de turno</button>' +
      '</form></section>'
    );
  }

  function renderWaitingValidation(entry) {
    if (!entry) return renderMenu();
    var cancelBtn = C().canCancelByChofer(entry)
      ? '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-chofer-cancel>Cancelar solicitud</button>'
      : '';
    return (
      '<section class="turnos-chofer-section turnos-waiting-screen">' +
      '<div class="turnos-waiting-icon" aria-hidden="true">' +
      '<img src="assets/img/icon-turnos-validacion.svg' + ICON_V + '" alt="" width="72" height="72">' +
      '</div>' +
      '<p class="turnos-waiting-title">Esperando validación del supervisor</p>' +
      '<p class="turnos-waiting-sub">Un supervisor debe confirmar que usted está en el almacén antes de asignar su número de turno (T-XXXX).</p>' +
      '<p class="turnos-success-meta"><strong>' + esc(entry.choferCompania || '—') + '</strong> · ' + esc(C().TIPO_LABELS[entry.tipo]) + '</p>' +
      '<p class="turnos-success-detail">' + esc(entry.detalle) + '</p>' +
      '<p class="turnos-success-time">Solicitud enviada: ' + esc(C().formatFechaHora(entry)) + '</p>' +
      '<p class="turnos-hint turnos-hint--info">Mantenga esta pantalla abierta. Cuando lo validen verá su turno aquí.</p>' +
      iosAlertHint() +
      cancelBtn +
      '</section>'
    );
  }

  function renderSuccess(entry) {
    if (!entry) return renderMenu();
    if (!entry.turno) return renderWaitingValidation(entry);
    var convocado = entry.convocadoAt
      ? '<div class="turnos-call-inline"><strong>¡Es su turno!</strong> Pase a <span>' + esc(C().ventanaLabel(entry.tipo)) + '</span></div>'
      : '';
    var notaHint = entry.tipo === C().TIPOS.NOTA_CREDITO
      ? '<p class="turnos-hint turnos-hint--info">Flujo: Pendiente → Confirmado → Asentado.</p>'
      : '<p class="turnos-hint">Cuando lo convoquen escuchará voz y alarma. Mantenga el volumen alto.</p>';
    var permStatus = Perms() ? Perms().getStatus() : { ready: false };
    var notifBlock = permStatus.ready
      ? '<div class="turnos-chofer-notif-prompt turnos-chofer-notif-prompt--ok" id="turnosChoferNotifPrompt">' +
        '<p class="turnos-hint turnos-hint--info">Alertas activas' +
        (isIOSDevice() ? '. En iPhone use el acceso desde pantalla de inicio.' : '. Sonará aunque cambie de aplicación.') +
        '</p></div>'
      : '<div class="turnos-chofer-notif-prompt turnos-chofer-notif-prompt--warn" id="turnosChoferNotifPrompt">' +
        '<p class="turnos-hint turnos-hint--warn"><strong>Obligatorio:</strong> active notificaciones y sonido para escuchar cuando lo convoquen.</p>' +
        '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" id="turnosChoferNotifBtn">Autorizar alertas ahora</button></div>';
    var prio = entry.prioridad
      ? '<div class="turnos-call-inline turnos-call-inline--priority"><strong>Turno prioritario</strong></div>'
      : '';
    var cancelBtn = C().canCancelByChofer(entry)
      ? '<button type="button" class="turnos-btn turnos-btn--danger turnos-btn--xl" data-chofer-cancel>Cancelar mi turno</button>'
      : '';
    var actionsBlock =
      '<div class="turnos-success-actions">' +
      cancelBtn +
      '<button type="button" class="turnos-btn turnos-btn--secondary turnos-btn--xl" data-chofer-new-turn>Solicitar otro turno</button>' +
      '<p class="turnos-hint turnos-success-actions-hint">Vuelve al menú de trámites. Si aún tiene un turno activo, cancele el anterior antes de generar uno nuevo.</p>' +
      '</div>';

    return (
      '<section class="turnos-chofer-section turnos-success-screen">' +
      '<div class="turnos-success-icon">✓</div>' +
      '<p class="turnos-success-title">Su turno está registrado</p>' +
      '<p class="turnos-success-turno turnos-mono">' + esc(entry.turno) + '</p>' +
      '<p class="turnos-success-meta"><strong>' + esc(entry.choferCompania || '—') + '</strong> · ' + esc(C().TIPO_LABELS[entry.tipo]) + '</p>' +
      '<p class="turnos-success-detail">' + esc(entry.detalle) + '</p>' +
      '<p class="turnos-success-time">' + esc(C().formatFechaHora(entry)) + '</p>' +
      '<p class="turnos-success-status">' + esc(estadoLabel(entry)) + '</p>' +
      convocado +
      prio +
      notaHint +
      iosAlertHint() +
      notifBlock +
      '<p class="turnos-hint">Puede cerrar esta página; al volver verá el mismo turno.</p>' +
      actionsBlock +
      '</section>'
    );
  }

  function requestAnotherTurn() {
    userPrefersMenu = true;
    screen = 'menu';
    render();
  }

  function cancelMyTurn() {
    var ref = C().getMyTurnRef();
    if (!ref || !ref.id) return;
    var entry = S().findById(ref.id);
    if (!entry || !C().canCancelByChofer(entry)) return;
    if (!confirm('¿Cancelar ' + (entry.turno ? 'el turno ' + entry.turno : 'su solicitud de turno') + '? Podrá generar uno nuevo después.')) return;
    var choferName = entry.choferNombre || C().getRememberedChoferName() || 'chofer';
    S().cancelTurn(ref.id, choferName).then(function (result) {
      if (!result.ok) {
        alert(result.msg || 'No se pudo cancelar.');
        return;
      }
      hideCallOverlay();
      C().clearMyTurn();
      lastEntry = null;
      userPrefersMenu = false;
      screen = 'menu';
      render();
    });
  }

  function ensureCallOverlay() {
    var root = $('turnosChoferRoot');
    if (!root) return;
    var overlay = $('turnosCallOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'turnosCallOverlay';
      overlay.className = 'turnos-call-overlay is-hidden';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-live', 'assertive');
      overlay.innerHTML =
        '<div class="turnos-call-card">' +
        '<p class="turnos-call-eyebrow">¡Ya es su turno!</p>' +
        '<p class="turnos-call-turno turnos-mono" id="turnosCallTurno">T-0000</p>' +
        '<p class="turnos-call-ventana" id="turnosCallVentana">Pase a la ventana</p>' +
        '<p class="turnos-call-detail" id="turnosCallDetail"></p>' +
        '<p class="turnos-call-voice-hint">Escuche el mensaje y la alarma. Pase de inmediato.</p>' +
        '<button type="button" class="turnos-btn turnos-btn--primary turnos-btn--xl" data-call-dismiss>Entendido — voy a la ventana</button>' +
        '</div>';
      root.appendChild(overlay);
    }
  }

  function showCallOverlay(entry) {
    if (!entry || !entry.convocadoAt) return;
    if (C().getConvocadoSeen(entry.id) >= entry.convocadoAt) return;
    ensureCallOverlay();
    var overlay = $('turnosCallOverlay');
    var turnoEl = $('turnosCallTurno');
    var ventanaEl = $('turnosCallVentana');
    var detailEl = $('turnosCallDetail');
    if (turnoEl) turnoEl.textContent = entry.turno;
    if (ventanaEl) ventanaEl.textContent = 'Pase a la ' + C().ventanaLabel(entry.tipo);
    if (detailEl) detailEl.textContent = entry.detalle || '';
    if (overlay) {
      overlay.classList.remove('is-hidden');
      overlay.classList.add('turnos-call-overlay--ringing');
    }
    if (Call() && Call().activate(entry)) {
      if (vibrateTimer) clearInterval(vibrateTimer);
      vibrateTimer = setInterval(function () {
        if (!overlay || overlay.classList.contains('is-hidden')) {
          clearInterval(vibrateTimer);
          vibrateTimer = null;
          return;
        }
        try {
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        } catch (e) { /* noop */ }
      }, 5000);
    }
  }

  function hideCallOverlay() {
    var overlay = $('turnosCallOverlay');
    if (overlay) {
      overlay.classList.add('is-hidden');
      overlay.classList.remove('turnos-call-overlay--ringing');
    }
    if (vibrateTimer) {
      clearInterval(vibrateTimer);
      vibrateTimer = null;
    }
    if (Call()) Call().dismiss((Call().getActiveEntry && Call().getActiveEntry()) || lastEntry);
  }

  function syncMyTurnFromStore() {
    var ref = C().getMyTurnRef();
    var entry = ref && ref.id ? S().findById(ref.id) : null;
    if (!entry || !C().isChoferSessionActive(entry)) {
      entry = S().findActiveByChofer(C().getRememberedChoferName());
    }
    if (!entry) {
      if (ref && ref.id) C().clearMyTurn();
      if (screen === 'success' || screen === 'waiting') {
        screen = 'menu';
        lastEntry = null;
      }
      wasPendingValidation = false;
      return;
    }
    if (!C().isChoferSessionActive(entry)) {
      C().clearMyTurn();
      if ((screen === 'success' || screen === 'waiting') && lastEntry && lastEntry.id === entry.id) {
        screen = 'menu';
        lastEntry = null;
      }
      wasPendingValidation = false;
      return;
    }
    var justValidated = wasPendingValidation && !C().isPendingValidation(entry) && !!entry.turno;
    wasPendingValidation = C().isPendingValidation(entry);
    C().saveMyTurn(entry);
    lastEntry = entry;
    if (Call() && Call().syncChoferBackgroundWatch) {
      Call().syncChoferBackgroundWatch(entry);
    } else if (global.PlatformTurnosSwWatch && (entry.turno || C().isPendingValidation(entry))) {
      global.PlatformTurnosSwWatch.startWatch({
        role: 'chofer',
        myTurnId: entry.id,
        choferName: C().getRememberedChoferName(),
        bootstrap: true,
        bootstrapEntries: S().getState().entries || [],
        openUrl: global.location ? global.location.href.split('#')[0] : './turnos.html',
        pollMs: 10000
      });
    }
    if (!userPrefersMenu) {
      screen = C().isPendingValidation(entry) ? 'waiting' : 'success';
    }
    if (justValidated) C().playBeep();
    showCallOverlay(entry);
    render();
  }

  function showError(msg) {
    var el = $('turnosChoferFormError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function submitForm(ev) {
    ev.preventDefault();
    showError('');
    if (Perms() && !Perms().requireBeforeAction()) {
      showError('Debe autorizar notificaciones y sonido (paso obligatorio) antes de solicitar turno.');
      return;
    }
    if (!S().getState().live) {
      showError('Sin conexión con la nube. Verifique internet e intente de nuevo.');
      return;
    }
    var ref = C().getMyTurnRef();
    if (ref && ref.id) {
      var active = S().findById(ref.id);
      if (active && C().isChoferSessionActive(active)) {
        if (C().isPendingValidation(active)) {
          showError('Ya tiene una solicitud en validación. Espere al supervisor o cancélela.');
        } else {
          showError('Ya tiene un turno activo (' + active.turno + '). Use "Ver mi turno".');
        }
        return;
      }
    }
    var chofer = ($('turnosFieldChofer') && $('turnosFieldChofer').value || '').trim();
    if (!chofer) {
      showError('Escriba su nombre.');
      return;
    }
    var compania = ($('turnosFieldCompania') && $('turnosFieldCompania').value || '').trim();
    if (!compania) {
      showError('Escriba el nombre de su compañía de transporte.');
      return;
    }

    var payload = { tipo: selectedTipo, choferNombre: chofer, choferCompania: compania };

    if (selectedTipo === C().TIPOS.DESPACHO) {
      var camion = ($('turnosFieldCamion') && $('turnosFieldCamion').value || '').trim();
      if (!C().normalizeTipoCamion(camion)) {
        showError('Seleccione el tipo de camión (T1, T2 o T4).');
        return;
      }
      var paletas = parseInt(($('turnosFieldPaletas') && $('turnosFieldPaletas').value) || '', 10);
      if (!paletas || paletas < 1) {
        showError('Indique cuántas paletas coge su camión.');
        return;
      }
      payload.tipoCamion = camion;
      payload.cantidadPaletas = paletas;
    } else if (selectedTipo === C().TIPOS.LIQUIDACION) {
      var viajes = parseInt(($('turnosFieldViajes') && $('turnosFieldViajes').value) || '', 10);
      if (!viajes || viajes < 1) {
        showError('Indique la cantidad de viajes.');
        return;
      }
      payload.cantidadViajes = viajes;
    }

    var btn = ev.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    S().addTurn(payload).then(function (result) {
      if (btn) btn.disabled = false;
      if (!result.ok) {
        showError(result.msg);
        return;
      }
      lastEntry = result.entry;
      userPrefersMenu = false;
      wasPendingValidation = C().isPendingValidation(result.entry);
      screen = wasPendingValidation ? 'waiting' : 'success';
      render();
    });
  }

  function guardPerms() {
    if (!Perms()) return true;
    if (Perms().isReady()) return true;
    Perms().refreshGate(true);
    return false;
  }

  function bind() {
    var root = $('turnosChoferRoot');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('click', function (ev) {
      if (ev.target.closest('.turnos-back-link')) return;
      if (ev.target.closest('#turnosPermGate') || ev.target.closest('#turnosPermBtn') ||
          ev.target.closest('#turnosPermIosBtn')) return;
      if (!guardPerms()) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (ev.target.closest('#turnosChoferNotifBtn')) {
        if (Perms()) {
          Perms().requestAll().then(function () { Perms().refreshGate(); render(); });
        } else if (Call()) {
          Call().requestPermission();
        }
        return;
      }
      if (ev.target.closest('[data-call-dismiss]')) {
        hideCallOverlay();
        return;
      }
      var resumeBtn = ev.target.closest('[data-chofer-resume]');
      if (resumeBtn) {
        userPrefersMenu = false;
        syncMyTurnFromStore();
        return;
      }
      if (ev.target.closest('[data-chofer-new-turn]')) {
        requestAnotherTurn();
        return;
      }
      var tipoBtn = ev.target.closest('[data-chofer-tipo]');
      if (tipoBtn) {
        if (!guardPerms()) return;
        var ref = C().getMyTurnRef();
        if (ref && ref.id) {
          var active = S().findById(ref.id);
          if (active && C().isChoferSessionActive(active)) {
            userPrefersMenu = false;
            lastEntry = active;
            screen = C().isPendingValidation(active) ? 'waiting' : 'success';
            render();
            return;
          }
        }
        selectedTipo = tipoBtn.getAttribute('data-chofer-tipo');
        screen = 'form';
        render();
        return;
      }
      if (ev.target.closest('[data-chofer-back]')) {
        screen = 'menu';
        selectedTipo = null;
        render();
        return;
      }
      if (ev.target.closest('[data-chofer-cancel]')) {
        cancelMyTurn();
      }
    });

    root.addEventListener('submit', function (ev) {
      if (ev.target.id === 'turnosChoferForm') {
        if (!guardPerms()) {
          ev.preventDefault();
          return;
        }
        submitForm(ev);
      }
    });
  }

  function start() {
    bind();
    if (Call()) Call().init();
    if (Perms()) Perms().init();
    render();
    S().init().then(function () {
      syncMyTurnFromStore();
      if (screen === 'menu') render();
    });
    if (unsub) unsub();
    unsub = S().subscribe(function () {
      syncMyTurnFromStore();
    });
    setInterval(function () {
      var el = $('turnosChoferClockTime');
      if (!el) return;
      el.textContent = C().formatClockTime().slice(0, 5);
    }, 1000);
    var choferDay = C().todayKey();
    setInterval(function () {
      var d = C().todayKey();
      if (choferDay === d) return;
      choferDay = d;
      render();
    }, 30000);
  }

  function show() {
    var root = $('turnosChoferRoot');
    if (root) root.classList.remove('is-hidden');
  }

  function hide() {
    var root = $('turnosChoferRoot');
    if (root) root.classList.add('is-hidden');
  }

  global.PlatformTurnosChofer = { start: start, show: show, hide: hide };
})(typeof window !== 'undefined' ? window : this);
