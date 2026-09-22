/**
 * Portal web Conciliación · Exactitud / Auditoría (ventana separada de inventario RF)
 * Lee conteos del lector vía Supabase. No modifica la APK ni inventario.html.
 */
(function (global) {
  'use strict';

  var SYNC = global.PlatformInventarioSync;
  var CONC = global.PlatformInventarioConciliacion;
  var DESK = global.PlatformInventarioDesk;

  var state = { user: null, workspace: 'conciliacion' };

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (global.PlatformToast && msg) {
      if (type === 'err') global.PlatformToast.error(msg);
      else if (type === 'ok') global.PlatformToast.success(msg);
      else global.PlatformToast.info(msg);
      return;
    }
    var t = $('ixToast');
    if (!t) return;
    t.textContent = msg || '';
    t.classList.add('show');
    global.setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseWorkspace() {
    try {
      var p = new URLSearchParams(global.location.search);
      return p.get('ws') === 'auditoria' ? 'auditoria' : 'conciliacion';
    } catch (e) {
      return 'conciliacion';
    }
  }

  function applyWorkspaceLabels() {
    var ws = state.workspace;
    var title = $('ixAuthTitle');
    var sub = $('ixAuthSub');
    if (ws === 'auditoria') {
      if (title) title.textContent = 'Auditoría de conteo';
      if (sub) sub.textContent = 'Escritorio web · solo ubicaciones REVISAR vs sistema (CJ).';
      document.title = 'Auditoría de conteo — Almacén Central 001';
    } else {
      if (title) title.textContent = 'Conciliación · Exactitud';
      if (sub) sub.textContent = 'Escritorio web · cuadre CJ vs conteo en vivo. La APK no cambia.';
      document.title = 'Conciliación · Exactitud — Almacén Central 001';
    }
  }

  function setAuthVisible(visible) {
    var overlay = $('ixAuthOverlay');
    var app = $('ixApp');
    if (overlay) overlay.hidden = !visible;
    if (app) {
      app.hidden = visible;
      app.classList.toggle('is-hidden', visible);
    }
    document.body.classList.toggle('ix-auth-locked', visible);
  }

  function enterDesk() {
    setAuthVisible(false);
    updateModeButtons();
    if (DESK) DESK.showDesk(state.workspace);
  }

  function doLogin() {
    var code = ($('ixAdmUser') || {}).value || 'admin';
    var pin = ($('ixAdmPin') || {}).value || '';
    SYNC.verifyLogin('admin', code, pin).then(function (user) {
      if (!user || user.role !== 'ADMIN') {
        toast('Usuario o PIN incorrecto', 'err');
        return;
      }
      state.user = user;
      try {
        global.sessionStorage.setItem('ixUser', JSON.stringify(user));
        global.sessionStorage.setItem('ixWorkspace', state.workspace);
      } catch (e) { /* noop */ }
      enterDesk();
      toast('Bienvenido, ' + user.displayName, 'ok');
    }).catch(function () {
      toast('Error al validar acceso. Revise la conexión en vivo.', 'err');
    });
  }

  function logout() {
    state.user = null;
    try {
      global.sessionStorage.removeItem('ixUser');
      global.sessionStorage.removeItem('ixWorkspace');
    } catch (e) { /* noop */ }
    if (DESK) DESK.hideDeskLayout();
    setAuthVisible(true);
  }

  function tryRestoreSession() {
    try {
      var raw = global.sessionStorage.getItem('ixUser');
      if (!raw) return;
      state.user = JSON.parse(raw);
      var ws = global.sessionStorage.getItem('ixWorkspace');
      if (ws) state.workspace = ws;
      applyWorkspaceLabels();
      enterDesk();
    } catch (e) { /* noop */ }
  }

  function switchWorkspace(ws) {
    state.workspace = ws === 'auditoria' ? 'auditoria' : 'conciliacion';
    try {
      global.sessionStorage.setItem('ixWorkspace', state.workspace);
      var url = new URL(global.location.href);
      if (state.workspace === 'auditoria') url.searchParams.set('ws', 'auditoria');
      else url.searchParams.delete('ws');
      global.history.replaceState({}, '', url.pathname + url.search);
    } catch (e) { /* noop */ }
    applyWorkspaceLabels();
    if (state.user && DESK) DESK.showDesk(state.workspace);
    updateModeButtons();
  }

  function updateModeButtons() {
    var conc = $('ixBtnModeConc');
    var audit = $('ixBtnModeAudit');
    if (conc) conc.classList.toggle('active', state.workspace !== 'auditoria');
    if (audit) audit.classList.toggle('active', state.workspace === 'auditoria');
  }

  function bindEvents() {
    $('ixBtnEnter') && $('ixBtnEnter').addEventListener('click', doLogin);
    $('ixBtnModeConc') && $('ixBtnModeConc').addEventListener('click', function () { switchWorkspace('conciliacion'); });
    $('ixBtnModeAudit') && $('ixBtnModeAudit').addEventListener('click', function () { switchWorkspace('auditoria'); });
    ['ixAdmUser', 'ixAdmPin'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
      });
    });
    document.querySelectorAll('.ix-btn-logout').forEach(function (btn) {
      btn.addEventListener('click', logout);
    });
  }

  function boot() {
    if (document.documentElement.classList.contains('ix-mobile-block')) {
      var block = $('ixMobileBlock');
      if (block) block.hidden = false;
      return;
    }
    if (!SYNC || !CONC || !DESK) {
      document.body.innerHTML += '<p class="noscript-msg">Error al cargar el portal de exactitud.</p>';
      return;
    }
    state.workspace = parseWorkspace();
    applyWorkspaceLabels();
    DESK.init({ CONC: CONC, SYNC: SYNC, CORE: global.PlatformInventarioCore, toast: toast, esc: esc });
    bindEvents();
    SYNC.onChange(function (kind) {
      if (kind === 'sync' || kind === 'entry' || kind === 'clear') {
        if (!state.user) return;
        DESK.refreshDesk();
      }
    });
    SYNC.init().then(function () {
      tryRestoreSession();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
