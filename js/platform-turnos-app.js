/**
 * Portal Control de Turnos — arranque separado chofer / supervisor
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;

  function portalMode() {
    var mode = document.documentElement.getAttribute('data-turnos-portal');
    if (mode === 'supervisor' || mode === 'chofer') return mode;
    return 'chofer';
  }

  function isSupervisorPortal() {
    return portalMode() === 'supervisor';
  }

  function isChoferPortal() {
    return portalMode() === 'chofer';
  }

  function $(id) { return document.getElementById(id); }

  function refreshPwaUi() {
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.updateUi) {
      global.PlatformTurnosPwa.updateUi();
    }
  }

  function showChofer() {
    if (!isChoferPortal()) return;
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('chofer');
    }
    if (global.PlatformTurnosChofer) {
      global.PlatformTurnosChofer.show();
      global.PlatformTurnosChofer.start();
    }
    document.body.classList.remove('turnos-admin-mode', 'turnos-auth-open');
    refreshPwaUi();
  }

  function showAdminApp(user) {
    if (!isSupervisorPortal()) return;
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('supervisor');
    }
    hideAuth();
    if (global.PlatformTurnosAdmin) {
      global.PlatformTurnosAdmin.show();
      global.PlatformTurnosAdmin.start(user);
    }
    if (PC && PC.touchAveriasSession) PC.touchAveriasSession(user);
    document.body.classList.add('turnos-admin-mode');
    document.body.classList.remove('turnos-auth-open');
    refreshPwaUi();
  }

  function showAuth() {
    if (!isSupervisorPortal()) return;
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole('supervisor');
    }
    if (global.PlatformTurnosAdmin) global.PlatformTurnosAdmin.hide();
    var overlay = $('turnosAuthOverlay');
    if (overlay) {
      overlay.classList.remove('is-hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('turnos-auth-open');
    document.body.classList.remove('turnos-admin-mode');
    refreshPwaUi();
  }

  function hideAuth() {
    var overlay = $('turnosAuthOverlay');
    if (overlay) {
      overlay.classList.add('is-hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('turnos-auth-open');
  }

  function showAuthError(msg) {
    var el = $('turnosAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function doLogin() {
    if (!PC || !Auth) {
      showAuthError('No se pudo cargar el sistema de usuarios.');
      return;
    }
    var username = PC.sanitizeUsername($('turnosAuthUsername') && $('turnosAuthUsername').value);
    var password = String(($('turnosAuthPassword') && $('turnosAuthPassword').value) || '').trim();
    showAuthError('');

    var allowed = PC.checkAveriasLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username || !password) {
      showAuthError('Completa usuario y contraseña.');
      return;
    }

    var btn = $('turnosAuthSubmit');
    if (btn) btn.disabled = true;

    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'turnos', form: $('turnosAuthForm') })
      : Promise.resolve({ ok: true });

    verifyHuman.then(function (human) {
      if (!human.ok) {
        if (btn) btn.disabled = false;
        showAuthError(human.error || 'Completa la verificación humana.');
        return;
      }
      try {
        var hash = PC.sha256Sync(password);
        var user = Auth.authenticate(username, hash);
        if (btn) btn.disabled = false;
        if (!user) {
          PC.recordAveriasLoginFailure();
          showAuthError('Usuario o contraseña incorrectos.');
          return;
        }
        PC.clearAveriasLoginAttempts();
        PC.persistRememberedLoginUsername('turnos', username, !!($('turnosAuthRememberUser') && $('turnosAuthRememberUser').checked));
        PC.saveAveriasSession(user);
        showAdminApp(user);
      } catch (err) {
        if (btn) btn.disabled = false;
        showAuthError('No se pudo validar la sesión.');
      }
    });
  }

  function tryRestoreAdmin() {
    if (!isSupervisorPortal() || !PC || !Auth) return false;
    var session = PC.getAveriasSession();
    if (!session) return false;
    var user = Auth.findUserById(session.userId);
    if (!user) {
      PC.clearAveriasSession();
      return false;
    }
    showAdminApp(user);
    return true;
  }

  function logoutAdmin() {
    if (PC) PC.clearAveriasSession();
    if (isSupervisorPortal()) {
      showAuth();
      return;
    }
    showChofer();
  }

  function initAuth() {
    var form = $('turnosAuthForm');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });
    if (PC) PC.applyRememberedLoginUsername('turnos', $('turnosAuthUsername'), $('turnosAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'turnos');
    }
    var toggle = $('turnosBtnTogglePassword');
    var pwd = $('turnosAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
    var logoutBtn = $('turnosBackChoferLink');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        logoutAdmin();
      });
    }
  }

  function boot() {
    initAuth();
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.setRole) {
      global.PlatformTurnosPwa.setRole(isSupervisorPortal() ? 'supervisor' : 'chofer');
    }
    if (isSupervisorPortal()) {
      if (tryRestoreAdmin()) return;
      showAuth();
      return;
    }
    showChofer();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var start = boot;
    if (global.PlatformTurnosPwa && global.PlatformTurnosPwa.init) {
      global.PlatformTurnosPwa.init();
    }
    if (isSupervisorPortal() && global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  });

  global.PlatformTurnosApp = {
    portalMode: portalMode,
    showChofer: showChofer,
    showAdminApp: showAdminApp,
    showAuth: showAuth,
    logoutAdmin: logoutAdmin
  };
})(typeof window !== 'undefined' ? window : this);
