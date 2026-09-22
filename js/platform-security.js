/**
 * Seguridad de acceso — verificación humana, honeypot, anti-bots en login
 */
(function (global) {
  'use strict';

  var turnstileSiteKey = '';
  var turnstileToken = null;
  var turnstileWidgetId = null;
  var configPromise = null;
  var minFormMs = 1200;
  var DEFAULT_TURNSTILE_SITE_KEY = '0x4AAAAAADhftTLJSQ0WxVnuiLp9UNRpOMc';

  function formFromBox(box) {
    return box && box.closest ? box.closest('form') : null;
  }

  function getVerifyMode(form) {
    var mode = form && form.getAttribute('data-dc-verify-mode');
    if (mode === 'math' || mode === 'turnstile') return mode;
    return turnstileSiteKey ? 'turnstile' : 'math';
  }

  function setVerifyMode(form, mode) {
    if (form) form.setAttribute('data-dc-verify-mode', mode);
  }

  function configUrl() {
    try {
      var p = global.location.pathname || '/';
      if (p.indexOf('/Almacen-Central-001') === 0) {
        return '/Almacen-Central-001/data/site-config.json';
      }
    } catch (e) { /* noop */ }
    return 'data/site-config.json';
  }

  function applySecurityConfig(cfg) {
    cfg = cfg || {};
    var sec = cfg.security || {};
    turnstileSiteKey = String(sec.turnstileSiteKey || DEFAULT_TURNSTILE_SITE_KEY || '').trim();
    if (sec.humanVerifyMinMs != null) {
      minFormMs = Math.max(800, parseInt(sec.humanVerifyMinMs, 10) || minFormMs);
    }
    return cfg;
  }

  function isLanOrigin() {
    try {
      var h = (global.location && global.location.hostname) || '';
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
    } catch (e) {
      return false;
    }
  }

  function shouldVerifyOnServer() {
    return isLanOrigin() && !isPublicWeb();
  }

  function sha256(text) {
    if (global.PanelCore && global.PanelCore.sha256Sync) {
      return global.PanelCore.sha256Sync(text);
    }
    return String(text);
  }

  function isPublicWeb() {
    try {
      var h = (global.location && global.location.hostname) || '';
      return h.indexOf('github.io') >= 0 || h.indexOf('pages.dev') >= 0;
    } catch (e) {
      return false;
    }
  }

  function loadConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch(configUrl() + '?v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (cfg) {
        return applySecurityConfig(cfg);
      });
    return configPromise;
  }

  function ensureHoneypot(form) {
    if (!form || form.querySelector('.dc-auth-hp')) return;
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'dc_hp_field';
    hp.className = 'dc-auth-hp';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.setAttribute('data-lpignore', 'true');
    form.appendChild(hp);
  }

  function ensureVerifyBox(form) {
    if (!form) return null;
    var box = form.querySelector('.auth-human-verify');
    if (!box) {
      box = document.createElement('div');
      box.className = 'auth-human-verify';
      box.setAttribute('aria-live', 'polite');
      var submit = form.querySelector('button[type="submit"]');
      if (submit && submit.parentNode) {
        submit.parentNode.insertBefore(box, submit);
      } else {
        form.appendChild(box);
      }
    }
    return box;
  }

  function checkHoneypot(form) {
    var hp = form && form.querySelector('.dc-auth-hp');
    if (hp && String(hp.value || '').trim()) {
      return { ok: false, error: 'No se pudo verificar el acceso.' };
    }
    return { ok: true };
  }

  function markFormInteracted(form) {
    if (form) form.setAttribute('data-dc-form-interacted', '1');
  }

  function bindFormInteraction(form) {
    if (!form || form.getAttribute('data-dc-interaction-bound') === '1') return;
    form.setAttribute('data-dc-interaction-bound', '1');
    function onInteract() {
      markFormInteracted(form);
      form.setAttribute('data-dc-form-ts', String(Date.now()));
    }
    form.addEventListener('input', onInteract, { passive: true });
    form.addEventListener('focusin', onInteract, { passive: true });
  }

  function checkTiming(form) {
    if (!form) return { ok: true };
    if (form.getAttribute('data-dc-form-interacted') === '1') return { ok: true };
    var ts = parseInt(form.getAttribute('data-dc-form-ts') || '0', 10);
    if (!ts) return { ok: true };
    if (Date.now() - ts < minFormMs) {
      return { ok: false, error: 'Espera un momento antes de entrar.' };
    }
    return { ok: true };
  }

  function mathChallengeKey(portal) {
    return 'dc_human_math_' + (portal || 'default');
  }

  function setupMathChallenge(box, portal) {
    var form = formFromBox(box);
    setVerifyMode(form, 'math');
    var a = 2 + Math.floor(Math.random() * 8);
    var b = 2 + Math.floor(Math.random() * 8);
    var answer = a + b;
    try {
      if (global.sessionStorage) {
        global.sessionStorage.setItem(mathChallengeKey(portal), sha256(String(answer)));
      }
    } catch (e) { /* noop */ }
    box.innerHTML =
      '<div class="auth-human-math">' +
      '<label class="auth-human-math-label" for="authHumanAnswer_' + portal + '">' +
      'Verificación humana: ¿cuánto es <strong>' + a + ' + ' + b + '</strong>?</label>' +
      '<input type="number" class="auth-human-answer auth-field-input" id="authHumanAnswer_' + portal + '" ' +
      'inputmode="numeric" autocomplete="off" required aria-required="true" placeholder="Resultado">' +
      '</div>';
  }

  function verifyMathChallenge(form, portal) {
    if (getVerifyMode(form) === 'turnstile') return { ok: true };
    var input = form && form.querySelector('.auth-human-answer');
    if (!input) return { ok: false, error: 'Completa la verificación humana.' };
    var raw = String(input.value || '').trim();
    if (!raw) return { ok: false, error: 'Responde la verificación humana.' };
    var expected = null;
    try {
      expected = global.sessionStorage && global.sessionStorage.getItem(mathChallengeKey(portal));
    } catch (e) { /* noop */ }
    if (!expected) return { ok: false, error: 'Recarga la página e intenta de nuevo.' };
    if (sha256(raw) !== expected) {
      return { ok: false, error: 'Respuesta incorrecta en la verificación humana.' };
    }
    return { ok: true };
  }

  function loadTurnstileScript() {
    return new Promise(function (resolve, reject) {
      if (global.turnstile) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-dc-turnstile]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-dc-turnstile', '1');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Turnstile no disponible')); };
      document.head.appendChild(s);
    });
  }

  function turnstileTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function mountHasTurnstileFrame(mount) {
    return !!(mount && mount.querySelector('iframe'));
  }

  function waitForTurnstileFrame(mount, maxMs) {
    maxMs = maxMs || 5000;
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        if (mountHasTurnstileFrame(mount)) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 150);
      }
      tick();
    });
  }

  function renderTurnstileWidget(mount) {
    return new Promise(function (resolve, reject) {
      if (!mount || !global.turnstile) {
        reject(new Error('Turnstile no cargó'));
        return;
      }
      if (turnstileWidgetId != null) {
        try { global.turnstile.remove(turnstileWidgetId); } catch (e) { /* noop */ }
        turnstileWidgetId = null;
      }
      var done = false;
      function finish(err) {
        if (done) return;
        done = true;
        if (err) reject(err);
        else resolve();
      }
      try {
        global.turnstile.ready(function () {
          try {
            turnstileWidgetId = global.turnstile.render(mount, {
              sitekey: turnstileSiteKey,
              theme: turnstileTheme(),
              appearance: 'always',
              size: 'compact',
              callback: function (token) { turnstileToken = token; },
              'expired-callback': function () { turnstileToken = null; },
              'error-callback': function () { turnstileToken = null; finish(new Error('Turnstile error')); }
            });
            waitForTurnstileFrame(mount, 6000).then(function (ok) {
              if (ok) finish();
              else finish(new Error('Turnstile sin widget visible'));
            });
          } catch (e) {
            finish(e);
          }
        });
      } catch (e) {
        finish(e);
      }
    });
  }

  function setupTurnstile(box, portal) {
    var form = formFromBox(box);
    setVerifyMode(form, 'turnstile');
    turnstileToken = null;
    box.innerHTML =
      '<p class="auth-turnstile-label">Verificación humana:</p>' +
      '<div class="auth-turnstile-mount" id="dcTurnstileMount" aria-label="Verificación Cloudflare Turnstile"></div>' +
      '<p class="auth-human-hint">Protegido por Cloudflare Turnstile</p>';
    return loadTurnstileScript()
      .then(function () { return renderTurnstileWidget(box.querySelector('#dcTurnstileMount')); })
      .catch(function () {
        setupMathChallenge(box, portal || 'default');
      });
  }

  function verifyTurnstileClient(form) {
    if (getVerifyMode(form) !== 'turnstile') return { ok: true };
    if (!turnstileSiteKey) return { ok: true };
    if (turnstileToken) return { ok: true };
    return { ok: false, error: 'Completa la verificación anti-bots.' };
  }

  function verifyOnServer(token) {
    if (!token || !shouldVerifyOnServer()) return Promise.resolve({ ok: true });
    var url = '/api/verify-human';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) return { ok: true };
        return { ok: false, error: (data && data.error) || 'Verificación humana rechazada.' };
      })
      .catch(function () {
        return { ok: true };
      });
  }

  function mountLoginForm(form, portal) {
    if (!form) return loadConfig();
    ensureHoneypot(form);
    bindFormInteraction(form);
    form.setAttribute('data-dc-form-ts', String(Date.now()));
    form.setAttribute('data-dc-portal', portal || 'default');
    var box = ensureVerifyBox(form);
    return loadConfig().then(function () {
      if (!box) return;
      if (turnstileSiteKey) {
        return setupTurnstile(box, portal || 'default').catch(function () {
          setupMathChallenge(box, portal || 'default');
        });
      }
      setupMathChallenge(box, portal || 'default');
      setVerifyMode(form, 'math');
    });
  }

  function resetHumanVerify(form, options) {
    options = options || {};
    var reason = options.reason || 'retry';
    turnstileToken = null;
    var portal = (form && form.getAttribute('data-dc-portal')) || 'default';
    var box = form && form.querySelector('.auth-human-verify');
    if (!box) return;
    var mode = getVerifyMode(form);
    if (mode === 'turnstile') {
      if (global.turnstile && turnstileWidgetId != null && mountHasTurnstileFrame(box.querySelector('#dcTurnstileMount'))) {
        try { global.turnstile.reset(turnstileWidgetId); } catch (e) { /* noop */ }
        return;
      }
      if (reason !== 'auth-failed') setupTurnstile(box, portal);
      return;
    }
    if (reason === 'auth-failed') return;
    setupMathChallenge(box, portal);
  }

  function verifyBeforeLogin(opts) {
    opts = opts || {};
    var form = opts.form;
    var portal = opts.portal || 'default';

    var hp = checkHoneypot(form);
    if (!hp.ok) return Promise.resolve(hp);
    var tm = checkTiming(form);
    if (!tm.ok) return Promise.resolve(tm);

    return loadConfig().then(function () {
      var ts = verifyTurnstileClient(form);
      if (!ts.ok) {
        if (getVerifyMode(form) === 'turnstile') {
          var box = form && form.querySelector('.auth-human-verify');
          if (box) setupMathChallenge(box, portal);
          var mathRetry = verifyMathChallenge(form, portal);
          if (!mathRetry.ok) {
            return { ok: false, error: 'Completa la verificación humana (suma).' };
          }
        } else {
          return ts;
        }
      } else {
        var math = verifyMathChallenge(form, portal);
        if (!math.ok) return math;
      }
      return verifyOnServer(turnstileToken).then(function (server) {
        if (!server.ok) return server;
        return { ok: true };
      });
    });
  }

  global.PlatformSecurity = {
    mountLoginForm: mountLoginForm,
    verifyBeforeLogin: verifyBeforeLogin,
    resetHumanVerify: resetHumanVerify,
    isPublicWeb: isPublicWeb,
    loadConfig: loadConfig
  };
})(typeof window !== 'undefined' ? window : this);
