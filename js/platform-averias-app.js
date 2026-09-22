/**
 * Portal Operaciones de Piso — auth WMS + app APK
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
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bootError('Error al cargar el portal de operaciones. Usa http://localhost:8080/averias.html');
      });
    } else {
      bootError('Error al cargar el portal de operaciones. Usa http://localhost:8080/averias.html');
    }
    return;
  }

  var $ = PC.$;

  var state = {
    user: null,
    _sessionTouchBound: false
  };

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else if (type === 'warn') global.PlatformToast.warning(msg);
    else global.PlatformToast.info(msg);
  }

  function showAuthError(msg) {
    var el = $('avAuthError');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function ensureAuthTouch() {
    var overlay = $('avAuthOverlay');
    if (!overlay) return;
    overlay.style.pointerEvents = 'auto';
    var layout = overlay.querySelector('.auth-layout');
    var stack = overlay.querySelector('.auth-stack');
    if (layout) layout.style.pointerEvents = 'auto';
    if (stack) stack.style.pointerEvents = 'auto';
  }

  function setAuthVisible(visible) {
    var overlay = $('avAuthOverlay');
    var app = $('avApp');
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
    document.body.classList.toggle('averias-dash-view', !visible);
    if (!visible) {
      if (global.PlatformAveriasUI && global.PlatformAveriasUI.bindClickBridge) {
        global.PlatformAveriasUI.bindClickBridge();
      }
      global.requestAnimationFrame(function () {
        var menuBtn = $('btn-menu');
        if (menuBtn && typeof menuBtn.focus === 'function') menuBtn.focus({ preventScroll: true });
      });
    }
  }

  function setLoginLoading(loading) {
    var btn = $('avAuthSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  }

  function initPasswordToggle() {
    var btn = $('avBtnTogglePassword');
    var input = $('avAuthPassword');
    if (!btn || !input || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Ver';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  function enterApp(user) {
    state.user = user;
    setAuthVisible(false);
    if (global.PlatformAveriasUI && global.PlatformAveriasUI.start) {
      global.PlatformAveriasUI.start(user);
    }
    bindSessionTouch();
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('avAuthUsername') && $('avAuthUsername').value);
    var password = String(($('avAuthPassword') && $('avAuthPassword').value) || '').trim();

    showAuthError('');
    var allowed = PC.checkAveriasLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username) {
      showAuthError('Escribe el usuario.');
      $('avAuthUsername') && $('avAuthUsername').focus();
      return;
    }
    if (!password) {
      showAuthError('Escribe la contraseña.');
      $('avAuthPassword') && $('avAuthPassword').focus();
      return;
    }
    if (password.length > PC.PASSWORD_MAX) {
      showAuthError('Contraseña demasiado larga.');
      return;
    }

    setLoginLoading(true);
    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'averias', form: $('avAuthForm') })
      : Promise.resolve({ ok: true });

    verifyHuman.then(function (human) {
      if (!human.ok) {
        setLoginLoading(false);
        showAuthError(human.error || 'Completa la verificación humana.');
        if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('avAuthForm'));
        return;
      }
      try {
        var hash = PC.sha256Sync(password);
        var user = Auth.authenticate(username, hash);
        setLoginLoading(false);
        if (!user) {
          PC.recordAveriasLoginFailure();
          if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('avAuthForm'), { reason: 'auth-failed' });
          showAuthError('Usuario o contraseña incorrectos.');
          return;
        }
        PC.clearAveriasLoginAttempts();
        PC.persistRememberedLoginUsername(
          'averias',
          username,
          !!($('avAuthRememberUser') && $('avAuthRememberUser').checked)
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

  function initAuth() {
    var form = $('avAuthForm');
    if (!form) return;

    PC.bindOnce(form, 'submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });
    initPasswordToggle();
    PC.applyRememberedLoginUsername('averias', $('avAuthUsername'), $('avAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'averias');
    }
    ensureAuthTouch();
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

  function bindSessionTouch() {
    if (state._sessionTouchBound || !state.user) return;
    state._sessionTouchBound = true;
    ['click', 'keydown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        if (state.user) PC.touchAveriasSession(state.user);
      }, { passive: true });
    });
  }

  function logout() {
    PC.clearAveriasSession();
    state.user = null;
    state._sessionTouchBound = false;
    var main = $('mainApp');
    if (main) main.classList.add('hidden');
    setAuthVisible(true);
    var pwd = $('avAuthPassword');
    if (pwd) pwd.value = '';
    showAuthError('');
  }

  function initTheme() {
    try {
      var stored = localStorage.getItem('almacen_platform_config');
      if (stored) {
        var cfg = JSON.parse(stored);
        if (cfg.theme) document.documentElement.setAttribute('data-theme', cfg.theme);
      }
    } catch (e) { /* ignore */ }
  }

  function init() {
    var start = function () {
      initTheme();
      initAuth();
      if (!tryRestoreSession()) {
        setAuthVisible(true);
      }
    };

    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  }

  global.PlatformAveriasApp = {
    logout: logout
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
