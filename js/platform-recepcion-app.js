/**
 * Aplicación — Control Patio · Recepción de contenedores
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformRecepcionAuth;
  var SESSION_KEY = 'panel_recepcion_session';

  var state = {
    user: null,
    unbindSync: null
  };

  var displayWindow = null;
  var lastRenderSig = '';
  var syncRenderTimer = null;

  function dataRenderSig(data) {
    if (!data) return '';
    var ids = (data.contenedores || []).map(function (c) { return c.id; }).join(',');
    return String(data.updatedAt || '') + '::' + ids;
  }

  function getDisplayUrl() {
    var path = global.location.pathname.replace(/[^/]*$/, 'recepcion-pantalla.html');
    return global.location.origin + path;
  }

  function openDisplayWindow() {
    if (displayWindow && !displayWindow.closed) {
      try { displayWindow.focus(); } catch (e) { /* noop */ }
      return displayWindow;
    }
    displayWindow = global.open(getDisplayUrl(), 'recepcion_pantalla', 'noopener,noreferrer');
    if (!displayWindow) {
      toast('Permita ventanas emergentes para abrir la pantalla TV, o use Configuraciones → Abrir pantalla TV.', 'err');
    }
    return displayWindow;
  }

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function saveSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ user: user, at: Date.now() }));
    } catch (e) { /* noop */ }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
  }

  function getSessionRaw() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setAuthVisible(visible) {
    var overlay = $('recAuthOverlay');
    var app = $('recApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) app.setAttribute('aria-hidden', 'true');
      else app.removeAttribute('aria-hidden');
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('rec-dash-view', !visible);
    document.body.classList.toggle('rbl-theme-f', !visible);
  }

  function renderApp(force) {
    var root = $('recApp');
    var store = global.PlatformRecepcionStore;
    var ui = global.PlatformRecepcionUI;
    if (!root || !store || !ui || !state.user) return;
    var data = store.load();
    var sig = dataRenderSig(data);
    if (!force && sig === lastRenderSig) return;
    lastRenderSig = sig;
    root.innerHTML = ui.renderApp(state.user, data);
    ui.bindApp(root, state.user, {
      onRegister: handleRegister,
      onValidar: handleValidar,
      onGuardarMuelle: handleGuardarMuelle,
      onEntrada: handleEntrada,
      onUbicar: handleUbicar,
      onCloseMuelleModal: closeMuelleModal,
      onClosePersonaModal: closePersonaModal,
      onEliminar: handleEliminar,
      onToggleShare: handleToggleShare,
      onOpenDisplay: openDisplayWindow,
      onLogout: logout
    });

    var modalConfirm = $('recMuelleModalConfirm');
    if (modalConfirm) {
      modalConfirm.onclick = confirmMuelleModalEntrada;
    }
    var personaConfirm = $('recPersonaModalConfirm');
    if (personaConfirm) {
      personaConfirm.onclick = confirmPersonaModal;
    }
    var modalInput = $('recMuelleModalInput');
    if (modalInput) {
      modalInput.onkeydown = function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          confirmMuelleModalEntrada();
        } else if (ev.key === 'Escape') {
          closeMuelleModal();
        }
      };
    }
  }

  function handleRegister(payload, form) {
    var store = global.PlatformRecepcionStore;
    var res = store.registrarContenedor(payload, Auth.getDisplayName(state.user));
    if (!res.ok) {
      toast(res.error, 'err');
      return;
    }
    toast('Registro ' + res.item.registro + ' · contenedor ' + res.item.contenedor + '.', 'ok');
    if (form) form.reset();
    var fecha = $('recFecha');
    if (fecha && global.PlatformRecepcionStore) {
      try {
        fecha.value = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santo_Domingo',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
      } catch (e) { /* noop */ }
    }
    renderApp(true);
  }

  function handleValidar(id) {
    openPersonaModal('validar', id);
  }

  var pendingEntradaId = null;
  var pendingPersonaAction = null;

  function closePersonaModal() {
    pendingPersonaAction = null;
    var modal = $('recPersonaModal');
    if (modal) modal.classList.add('is-hidden');
  }

  function openPersonaModal(kind, id) {
    var store = global.PlatformRecepcionStore;
    var data = store.load();
    var item = (data.contenedores || []).find(function (c) { return c.id === id; });
    var list = kind === 'ubicar' ? store.UBICADORES_RECEPCION : store.VALIDADORES_RECEPCION;
    var title = kind === 'ubicar' ? 'Ubicador' : 'Validador';
    var label = kind === 'ubicar' ? 'Ubicador' : 'Validador';
    pendingPersonaAction = { kind: kind, id: id };
    var modal = $('recPersonaModal');
    var titleEl = $('recPersonaModalTitle');
    var subEl = $('recPersonaModalSub');
    var labelEl = $('recPersonaModalLabel');
    var select = $('recPersonaModalSelect');
    if (titleEl) titleEl.textContent = 'Seleccionar ' + title.toLowerCase();
    if (subEl) {
      subEl.textContent = item && item.contenedor
        ? 'Contenedor ' + item.contenedor + ' — elija ' + title.toLowerCase() + ' para el resumen en TV.'
        : 'Elija ' + title.toLowerCase() + ' para el resumen en pantalla TV.';
    }
    if (labelEl) labelEl.textContent = label;
    if (select) {
      select.innerHTML = '<option value="">Seleccione…</option>' +
        (list || []).map(function (n) {
          return '<option value="' + String(n).replace(/"/g, '&quot;') + '">' + n + '</option>';
        }).join('');
      select.value = '';
      select.focus();
    }
    if (modal) modal.classList.remove('is-hidden');
  }

  function confirmPersonaModal() {
    if (!pendingPersonaAction) return;
    var select = $('recPersonaModalSelect');
    var nombre = select ? String(select.value || '').trim() : '';
    if (!nombre) {
      toast('Seleccione una persona de la lista.', 'err');
      if (select) select.focus();
      return;
    }
    var action = pendingPersonaAction;
    closePersonaModal();
    if (action.kind === 'validar') {
      completeValidar(action.id, nombre);
    } else if (action.kind === 'ubicar') {
      completeUbicar(action.id, nombre);
    }
  }

  function completeValidar(id, validadorNombre) {
    var res = global.PlatformRecepcionStore.marcarValidado(
      id, Auth.getDisplayName(state.user), validadorNombre
    );
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Contenedor validado.', 'ok');
    renderApp(true);
  }

  function closeMuelleModal() {
    pendingEntradaId = null;
    var modal = $('recMuelleModal');
    if (modal) modal.classList.add('is-hidden');
  }

  function openMuelleModal(id, currentMuelle, contenedor) {
    pendingEntradaId = id;
    var modal = $('recMuelleModal');
    var input = $('recMuelleModalInput');
    var sub = $('recMuelleModalSub');
    if (sub) {
      sub.textContent = contenedor
        ? 'Contenedor ' + contenedor + ' — indique el muelle antes de confirmar la entrada.'
        : 'Indique el muelle antes de confirmar la entrada.';
    }
    if (input) {
      input.value = currentMuelle || '';
      input.focus();
      input.select();
    }
    var entradaSel = $('recMuelleModalEntradaPor');
    if (entradaSel) entradaSel.value = '';
    if (modal) modal.classList.remove('is-hidden');
  }

  function confirmMuelleModalEntrada() {
    if (!pendingEntradaId) return;
    var input = $('recMuelleModalInput');
    var entradaSel = $('recMuelleModalEntradaPor');
    var muelle = input ? String(input.value || '').trim() : '';
    var entradaPor = entradaSel ? String(entradaSel.value || '').trim() : '';
    if (!muelle) {
      toast('Indique el muelle.', 'err');
      if (input) input.focus();
      return;
    }
    if (!entradaPor) {
      toast('Seleccione quién da la entrada.', 'err');
      if (entradaSel) entradaSel.focus();
      return;
    }
    var id = pendingEntradaId;
    closeMuelleModal();
    completeEntrada(id, muelle, entradaPor);
  }

  function completeEntrada(id, muelle, entradaPor) {
    var store = global.PlatformRecepcionStore;
    var res = store.marcarEntrada(id, muelle, Auth.getDisplayName(state.user), entradaPor);
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Entrada registrada en muelle ' + res.item.muelle + '.', 'ok');
    renderApp(true);
  }

  function handleGuardarMuelle(id, muelle) {
    var res = global.PlatformRecepcionStore.actualizarMuelle(id, muelle, Auth.getDisplayName(state.user));
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Muelle ' + res.item.muelle + ' guardado.', 'ok');
    renderApp(true);
  }

  function handleEntrada(id, muelleHint) {
    var data = global.PlatformRecepcionStore.load();
    var item = (data.contenedores || []).find(function (c) { return c.id === id; });
    var muelle = String(muelleHint || (item && item.muelle) || '').trim();
    openMuelleModal(id, muelle, item && item.contenedor);
  }

  function scheduleSyncRender() {
    if (syncRenderTimer) global.clearTimeout(syncRenderTimer);
    syncRenderTimer = global.setTimeout(function () {
      syncRenderTimer = null;
      renderApp(false);
    }, 100);
  }

  function handleEliminar(id) {
    if (!window.confirm('¿Quitar este contenedor del seguimiento?')) return;
    var res = global.PlatformRecepcionStore.eliminarContenedor(id, Auth.getDisplayName(state.user));
    if (!res.ok) { toast(res.error, 'err'); return; }
    lastRenderSig = '';
    toast('Contenedor retirado del seguimiento.', 'ok');
    renderApp(true);
  }

  function handleUbicar(id) {
    openPersonaModal('ubicar', id);
  }

  function completeUbicar(id, ubicadorNombre) {
    var res = global.PlatformRecepcionStore.marcarUbicado(
      id, Auth.getDisplayName(state.user), ubicadorNombre
    );
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (!res.unchanged) toast('Contenedor ubicado.', 'ok');
    renderApp(true);
  }

  function handleToggleShare() {
    var store = global.PlatformRecepcionStore;
    var active = store.isLiveShareBoardActive(store.load());
    if (active) {
      store.toggleLiveShareBoard(Auth.getDisplayName(state.user));
      toast('Pantalla TV detenida.', 'info');
      renderApp(true);
      return;
    }
    var win = openDisplayWindow();
    store.toggleLiveShareBoard(Auth.getDisplayName(state.user));
    toast(
      win
        ? 'Compartiendo seguimiento en pantalla TV.'
        : 'Transmisión activada. Si no se abrió sola, use Configuraciones → Abrir pantalla TV.',
      win ? 'ok' : 'info'
    );
    renderApp(true);
  }

  function enterApp(user) {
    state.user = user;
    setAuthVisible(false);
    if (state.unbindSync) state.unbindSync();
    state.unbindSync = global.PlatformRecepcionStore.bindSync(function () {
      scheduleSyncRender();
    });
    renderApp(true);
  }

  function logout() {
    clearSession();
    state.user = null;
    if (state.unbindSync) {
      state.unbindSync();
      state.unbindSync = null;
    }
    setAuthVisible(true);
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('recAuthUsername') && $('recAuthUsername').value);
    var password = String(($('recAuthPassword') && $('recAuthPassword').value) || '').trim();
    var errEl = $('recAuthError');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (!username || !password) {
      if (errEl) { errEl.textContent = 'Usuario y contraseña requeridos.'; errEl.hidden = false; }
      return;
    }
    var Sec = global.PlatformSecurity;
    var verify = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'recepcion', form: $('recAuthForm') })
      : Promise.resolve({ ok: true });
    verify.then(function (human) {
      if (!human.ok) {
        if (errEl) { errEl.textContent = human.error || 'Verificación requerida.'; errEl.hidden = false; }
        return;
      }
      var refresh = global.PlatformWebUsers && global.PlatformWebUsers.refresh
        ? global.PlatformWebUsers.refresh()
        : Promise.resolve();
      return refresh.then(function () {
        var user = Auth.authenticate(username, PC.sha256Sync(password));
        if (!user) {
          if (errEl) {
            var wmsUser = global.PlatformAdmin && global.PlatformAdmin.authenticate
              ? global.PlatformAdmin.authenticate(username, PC.sha256Sync(password))
              : null;
            errEl.textContent = wmsUser
              ? 'Su usuario no tiene permiso para Gestión de Recepción y Ubicación. Contacte al administrador.'
              : 'Usuario o contraseña incorrectos.';
            errEl.hidden = false;
          }
          return;
        }
        PC.persistRememberedLoginUsername('recepcion', username, !!($('recAuthRememberUser') && $('recAuthRememberUser').checked));
        saveSession(user);
        enterApp(user);
        toast('Bienvenido, ' + Auth.getDisplayName(user), 'ok');
      });
    }).catch(function (err) {
      if (errEl) {
        errEl.textContent = (err && err.message) || 'No se pudo iniciar sesión. Recargue la página.';
        errEl.hidden = false;
      }
    });
  }

  function tryRestoreSession() {
    var raw = getSessionRaw();
    if (!raw || !raw.user) return;
    if (Date.now() - (raw.at || 0) > 12 * 60 * 60 * 1000) {
      clearSession();
      return;
    }
    var user = Auth.getUserById(raw.user.id) ||
      Auth.normalizeStoredUser(raw.user);
    if (!user) {
      clearSession();
      return;
    }
    enterApp(user);
  }

  function bindAuthUi() {
    var form = $('recAuthForm');
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); doLogin(); });
    var toggle = $('recBtnTogglePassword');
    var pwd = $('recAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
    if (PC && PC.restoreRememberedLoginUsername) {
      PC.restoreRememberedLoginUsername('recepcion', $('recAuthUsername'));
    }
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'recepcion');
    }
  }

  function init() {
    if (!PC || !Auth) return;
    bindAuthUi();
    var ready = global.PlatformWebUsers && global.PlatformWebUsers.ready
      ? global.PlatformWebUsers.ready()
      : Promise.resolve();
    ready.then(function () {
      tryRestoreSession();
      if (!state.user) setAuthVisible(true);
    }).catch(function () {
      setAuthVisible(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
