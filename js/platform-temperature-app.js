/**
 * Portal Monitoreo de Temperatura — auth WMS
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;

  function bootError(msg) {
    var box = document.createElement('p');
    box.className = 'noscript-msg';
    box.textContent = msg;
    document.body.appendChild(box);
  }

  if (!PC || !Auth) {
    document.addEventListener('DOMContentLoaded', function () {
      bootError('Error al cargar el portal de temperatura. Usa http://localhost:8080/temperatura.html');
    });
    return;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function showAuthError(msg) {
    var el = $('tempAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function ensureAuthTouch() {
    var overlay = $('tempAuthOverlay');
    if (!overlay) return;
    overlay.style.pointerEvents = 'auto';
    var layout = overlay.querySelector('.auth-layout');
    var stack = overlay.querySelector('.auth-stack');
    if (layout) layout.style.pointerEvents = 'auto';
    if (stack) stack.style.pointerEvents = 'auto';
  }

  function setAuthVisible(visible) {
    var overlay = $('tempAuthOverlay');
    var app = $('tempApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (visible) {
        overlay.style.removeProperty('pointer-events');
        ensureAuthTouch();
      } else {
        overlay.style.pointerEvents = 'none';
      }
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) {
        app.style.pointerEvents = 'none';
        app.setAttribute('aria-hidden', 'true');
        app.setAttribute('inert', '');
      } else {
        app.style.pointerEvents = 'auto';
        app.removeAttribute('aria-hidden');
        app.removeAttribute('inert');
      }
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('temp-dash-view', !visible);
  }

  function setLoginLoading(loading) {
    var btn = $('tempAuthSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  }

  function enterApp(user) {
    setAuthVisible(false);
    if (global.PlatformTemperatureUI && global.PlatformTemperatureUI.start) {
      global.PlatformTemperatureUI.start(user);
    }
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('tempAuthUsername') && $('tempAuthUsername').value);
    var password = String(($('tempAuthPassword') && $('tempAuthPassword').value) || '').trim();

    showAuthError('');
    var allowed = PC.checkAveriasLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username) {
      showAuthError('Escribe el usuario.');
      $('tempAuthUsername') && $('tempAuthUsername').focus();
      return;
    }
    if (!password) {
      showAuthError('Escribe la contraseña.');
      $('tempAuthPassword') && $('tempAuthPassword').focus();
      return;
    }

    setLoginLoading(true);
    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'temperatura', form: $('tempAuthForm') })
      : Promise.resolve({ ok: true });

    verifyHuman.then(function (human) {
      if (!human.ok) {
        setLoginLoading(false);
        showAuthError(human.error || 'Completa la verificación humana.');
        if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('tempAuthForm'));
        return;
      }
      try {
        var hash = PC.sha256Sync(password);
        var user = Auth.authenticate(username, hash);
        setLoginLoading(false);
        if (!user) {
          PC.recordAveriasLoginFailure();
          if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('tempAuthForm'), { reason: 'auth-failed' });
          showAuthError('Usuario o contraseña incorrectos.');
          return;
        }
        PC.clearAveriasLoginAttempts();
        PC.persistRememberedLoginUsername(
          'temperatura',
          username,
          !!($('tempAuthRememberUser') && $('tempAuthRememberUser').checked)
        );
        PC.saveAveriasSession(user);
        enterApp(user);
        toast('Bienvenido, ' + (Auth.getDisplayName ? Auth.getDisplayName(user) : user.name) + '.', 'ok');
      } catch (err) {
        setLoginLoading(false);
        showAuthError('No se pudo validar la sesión. Intenta de nuevo.');
      }
    });
  }

  function tryRestoreSession() {
    var session = PC.getAveriasSession();
    if (!session) return false;
    var user = Auth.findUserById(session.userId);
    if (!user) {
      PC.clearAveriasSession();
      return false;
    }
    enterApp(user);
    return true;
  }

  function initAuth() {
    var form = $('tempAuthForm');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });
    PC.applyRememberedLoginUsername('temperatura', $('tempAuthUsername'), $('tempAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'temperatura');
    }
    ensureAuthTouch();
    var toggle = $('tempBtnTogglePassword');
    var pwd = $('tempAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
  }

  function initDrawer() {
    global.toggleDrawer = function () {
      var drawer = $('tempDrawer');
      var overlay = $('tempDrawerOverlay');
      if (!drawer || !overlay) return;
      var open = !drawer.classList.contains('open');
      drawer.classList.toggle('open', open);
      overlay.classList.toggle('show', open);
      document.body.classList.toggle('temp-drawer-open', open);
    };
    global.closeDrawer = function () {
      var drawer = $('tempDrawer');
      var overlay = $('tempDrawerOverlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
      document.body.classList.remove('temp-drawer-open');
    };

    var shell = $('tempMainApp');
    if (shell && !shell.dataset.tempUiBound) {
      shell.dataset.tempUiBound = '1';
      shell.addEventListener('click', function (ev) {
        if (ev.target.closest('#tempBtnMenu')) {
          ev.preventDefault();
          global.toggleDrawer();
          return;
        }
        if (ev.target.closest('#tempDrawerOverlay')) {
          ev.preventDefault();
          global.closeDrawer();
          return;
        }
        var modBtn = ev.target.closest('.drawer-item[data-module]');
        if (modBtn && modBtn.dataset.module && global.navigateTempModule) {
          ev.preventDefault();
          global.navigateTempModule(modBtn.dataset.module);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var start = function () {
      initDrawer();
      initAuth();
      if (!tryRestoreSession()) setAuthVisible(true);
    };
    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  });
})(typeof window !== 'undefined' ? window : this);
