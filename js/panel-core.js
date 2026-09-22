/**
 * Utilidades compartidas: DOM, escape, hash, sesión, gestos, seguridad login
 */
(function (global) {
  'use strict';

  var SESSION_KEY = 'panel_almacen_session';
  var DESPACHO_SESSION_KEY = 'panel_despacho_session';
  var AVERIAS_SESSION_KEY = 'panel_averias_session';
  var SESSION_MS = 12 * 60 * 60 * 1000;
  var LOGIN_ATTEMPTS_KEY = 'almacen_login_attempts';
  var DESPACHO_LOGIN_ATTEMPTS_KEY = 'almacen_despacho_login_attempts';
  var AVERIAS_LOGIN_ATTEMPTS_KEY = 'almacen_averias_login_attempts';
  var MAX_LOGIN_ATTEMPTS = 5;
  var LOCKOUT_MS = 15 * 60 * 1000;
  var USERNAME_MAX = 64;
  var PASSWORD_MAX = 128;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUsername(value) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^\w.\-@]/gi, '')
      .slice(0, USERNAME_MAX);
  }

  function bindOnce(el, event, handler) {
    if (!el || el.dataset['bound' + event]) return;
    el.dataset['bound' + event] = '1';
    el.addEventListener(event, handler);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDateTime(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function sha256Sync(text) {
    /* eslint-disable no-bitwise */
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var s = unescape(encodeURIComponent(String(text)));
    var l = s.length;
    var bl = ((l + 8) >> 6) + 1;
    var b = new Array(bl * 16);
    var i;
    for (i = 0; i < bl * 16; i++) b[i] = 0;
    for (i = 0; i < l; i++) b[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
    b[i >> 2] |= 0x80 << (24 - (i % 4) * 8);
    b[bl * 16 - 1] = l * 8;
    var w = new Array(64);
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var bi;
    for (bi = 0; bi < bl; bi++) {
      var j;
      for (i = 0; i < 16; i++) w[i] = b[bi * 16 + i];
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h0, b2 = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + s1 + ch + K[i] + w[i]) | 0;
        s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b2) ^ (a & c) ^ (b2 & c);
        var t2 = (s0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b2) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    function hex() {
      var out = '';
      for (i = 0; i < 8; i++) {
        var v = (arguments[i] >>> 0).toString(16);
        while (v.length < 8) v = '0' + v;
        out += v;
      }
      return out;
    }
    return hex(h0, h1, h2, h3, h4, h5, h6, h7);
    /* eslint-enable no-bitwise */
  }

  function sha256(text) {
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      var enc = new global.TextEncoder().encode(String(text));
      return global.crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }).catch(function () {
        return sha256Sync(text);
      });
    }
    return Promise.resolve(sha256Sync(text));
  }

  function readAttempts(key) {
    var base = { count: 0, lockedUntil: 0 };
    var ls = base;
    var ss = base;
    try {
      if (global.localStorage) ls = JSON.parse(localStorage.getItem(key)) || base;
    } catch (e) { ls = base; }
    try {
      if (global.sessionStorage) ss = JSON.parse(sessionStorage.getItem(key)) || base;
    } catch (e2) { ss = base; }
    return {
      count: Math.max(ls.count || 0, ss.count || 0),
      lockedUntil: Math.max(ls.lockedUntil || 0, ss.lockedUntil || 0)
    };
  }

  function writeAttempts(key, data) {
    var raw = JSON.stringify(data || { count: 0, lockedUntil: 0 });
    if (global.localStorage) localStorage.setItem(key, raw);
    if (global.sessionStorage) sessionStorage.setItem(key, raw);
  }

  function deviceFingerprint() {
    try {
      var ua = (global.navigator && navigator.userAgent) || '';
      var lang = (global.navigator && navigator.language) || '';
      return sha256Sync(String(ua).slice(0, 160) + '|' + lang).slice(0, 20);
    } catch (e) {
      return '';
    }
  }

  function sessionFingerprintOk(s) {
    if (!s || !s.fp) return true;
    return s.fp === deviceFingerprint();
  }

  function getLoginAttempts() {
    if (!global.localStorage && !global.sessionStorage) return { count: 0, lockedUntil: 0 };
    return readAttempts(LOGIN_ATTEMPTS_KEY);
  }

  function saveLoginAttempts(data) {
    writeAttempts(LOGIN_ATTEMPTS_KEY, data);
  }

  function checkLoginAllowed() {
    var att = getLoginAttempts();
    if (att.lockedUntil && Date.now() < att.lockedUntil) {
      var mins = Math.ceil((att.lockedUntil - Date.now()) / 60000);
      return { ok: false, message: 'Demasiados intentos. Espera ' + mins + ' min.' };
    }
    if (att.lockedUntil && Date.now() >= att.lockedUntil) {
      saveLoginAttempts({ count: 0, lockedUntil: 0 });
    }
    return { ok: true };
  }

  function recordLoginFailure() {
    var att = getLoginAttempts();
    att.count = (att.count || 0) + 1;
    if (att.count >= MAX_LOGIN_ATTEMPTS) {
      att.lockedUntil = Date.now() + LOCKOUT_MS;
      att.count = 0;
    }
    saveLoginAttempts(att);
  }

  function clearLoginAttempts() {
    saveLoginAttempts({ count: 0, lockedUntil: 0 });
  }

  function getSession() {
    if (!global.localStorage) return null;
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.expiresAt || Date.now() > s.expiresAt || !sessionFingerprintOk(s)) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function saveSession(user) {
    if (!global.localStorage || !user) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      fp: deviceFingerprint(),
      expiresAt: Date.now() + SESSION_MS
    }));
  }

  function clearSession() {
    if (global.localStorage) localStorage.removeItem(SESSION_KEY);
  }

  /** Renueva expiración de sesión (actividad del usuario). */
  function touchSession(user) {
    if (!user || !user.id) return;
    var s = getSession();
    if (!s || s.userId !== user.id) return;
    saveSession(user);
  }

  function getDespachoLoginAttempts() {
    if (!global.localStorage && !global.sessionStorage) return { count: 0, lockedUntil: 0 };
    return readAttempts(DESPACHO_LOGIN_ATTEMPTS_KEY);
  }

  function saveDespachoLoginAttempts(data) {
    writeAttempts(DESPACHO_LOGIN_ATTEMPTS_KEY, data);
  }

  function checkDespachoLoginAllowed() {
    var att = getDespachoLoginAttempts();
    if (att.lockedUntil && Date.now() < att.lockedUntil) {
      var mins = Math.ceil((att.lockedUntil - Date.now()) / 60000);
      return { ok: false, message: 'Demasiados intentos. Espera ' + mins + ' min.' };
    }
    if (att.lockedUntil && Date.now() >= att.lockedUntil) {
      saveDespachoLoginAttempts({ count: 0, lockedUntil: 0 });
    }
    return { ok: true };
  }

  function recordDespachoLoginFailure() {
    var att = getDespachoLoginAttempts();
    att.count = (att.count || 0) + 1;
    if (att.count >= MAX_LOGIN_ATTEMPTS) {
      att.lockedUntil = Date.now() + LOCKOUT_MS;
      att.count = 0;
    }
    saveDespachoLoginAttempts(att);
  }

  function clearDespachoLoginAttempts() {
    saveDespachoLoginAttempts({ count: 0, lockedUntil: 0 });
  }

  function getDespachoSession() {
    if (!global.localStorage) return null;
    try {
      var raw = localStorage.getItem(DESPACHO_SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.expiresAt || Date.now() > s.expiresAt || !sessionFingerprintOk(s)) {
        localStorage.removeItem(DESPACHO_SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function saveDespachoSession(user) {
    if (!global.localStorage || !user) return;
    var area = user.despachoArea;
    if (area !== 'preparador' && area !== 'validador') {
      area = user.role === 'validador' ? 'validador' : 'preparador';
    }
    localStorage.setItem(DESPACHO_SESSION_KEY, JSON.stringify({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      registeredRole: user.registeredRole || user.role || '',
      isPrimaryAdmin: user.isPrimaryAdmin === true,
      despachoArea: area,
      fp: deviceFingerprint(),
      expiresAt: Date.now() + SESSION_MS
    }));
  }

  function clearDespachoSession() {
    if (global.localStorage) localStorage.removeItem(DESPACHO_SESSION_KEY);
  }

  function touchDespachoSession(user) {
    if (!user || !user.id) return;
    var s = getDespachoSession();
    if (!s || s.userId !== user.id) return;
    saveDespachoSession(user);
  }

  function getAveriasLoginAttempts() {
    if (!global.localStorage && !global.sessionStorage) return { count: 0, lockedUntil: 0 };
    return readAttempts(AVERIAS_LOGIN_ATTEMPTS_KEY);
  }

  function saveAveriasLoginAttempts(data) {
    writeAttempts(AVERIAS_LOGIN_ATTEMPTS_KEY, data);
  }

  function checkAveriasLoginAllowed() {
    var att = getAveriasLoginAttempts();
    if (att.lockedUntil && Date.now() < att.lockedUntil) {
      var mins = Math.ceil((att.lockedUntil - Date.now()) / 60000);
      return { ok: false, message: 'Demasiados intentos. Espera ' + mins + ' min.' };
    }
    if (att.lockedUntil && Date.now() >= att.lockedUntil) {
      saveAveriasLoginAttempts({ count: 0, lockedUntil: 0 });
    }
    return { ok: true };
  }

  function recordAveriasLoginFailure() {
    var att = getAveriasLoginAttempts();
    att.count = (att.count || 0) + 1;
    if (att.count >= MAX_LOGIN_ATTEMPTS) {
      att.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    saveAveriasLoginAttempts(att);
  }

  function clearAveriasLoginAttempts() {
    saveAveriasLoginAttempts({ count: 0, lockedUntil: 0 });
  }

  function getAveriasSession() {
    if (!global.localStorage) return null;
    try {
      var raw = localStorage.getItem(AVERIAS_SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.expiresAt || Date.now() > s.expiresAt || !sessionFingerprintOk(s)) {
        localStorage.removeItem(AVERIAS_SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      return null;
    }
  }

  function saveAveriasSession(user) {
    if (!global.localStorage || !user) return;
    localStorage.setItem(AVERIAS_SESSION_KEY, JSON.stringify({
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      fp: deviceFingerprint(),
      expiresAt: Date.now() + SESSION_MS
    }));
  }

  function clearAveriasSession() {
    if (global.localStorage) localStorage.removeItem(AVERIAS_SESSION_KEY);
  }

  function touchAveriasSession(user) {
    if (!user || !user.id) return;
    var s = getAveriasSession();
    if (!s || s.userId !== user.id) return;
    saveAveriasSession(user);
  }

  function spawnRipple(el, ev) {
    var rect = el.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 1.15;
    var cx = ev && ev.clientX != null ? ev.clientX : rect.left + rect.width / 2;
    var cy = ev && ev.clientY != null ? ev.clientY : rect.top + rect.height / 2;
    var left = (cx - rect.left - size / 2) + 'px';
    var top = (cy - rect.top - size / 2) + 'px';

    var primary = document.createElement('span');
    primary.className = 'gesture-ripple gesture-ripple-primary btn-ripple role-ripple';
    primary.style.width = primary.style.height = size + 'px';
    primary.style.left = left;
    primary.style.top = top;

    var ring = document.createElement('span');
    ring.className = 'gesture-ripple gesture-ripple-ring';
    ring.style.width = ring.style.height = (size * 0.85) + 'px';
    ring.style.left = (cx - rect.left - size * 0.425) + 'px';
    ring.style.top = (cy - rect.top - size * 0.425) + 'px';

    el.appendChild(primary);
    el.appendChild(ring);
    function cleanup(node) {
      node.addEventListener('animationend', function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      });
    }
    cleanup(primary);
    cleanup(ring);
  }

  function spawnRoleRipple(el, ev) {
    var role = el.getAttribute('data-role') || '';
    spawnRipple(el, ev);
    var ripples = el.querySelectorAll('.btn-ripple');
    if (ripples.length) {
      ripples[ripples.length - 1].classList.add('role-ripple--' + role);
    }
    var rings = el.querySelectorAll('.gesture-ripple-ring');
    if (rings.length) {
      rings[rings.length - 1].classList.add('role-ripple-ring--' + role);
    }
  }

  function initAuthRoleGestures(root, onSelect) {
    if (!root) return;
    var cards = root.querySelectorAll('.auth-role-card, .desp-auth-role-card');
    cards.forEach(function (card) {
      if (card.dataset.authRoleGesture === '1') return;
      card.dataset.authRoleGesture = '1';
      card.setAttribute('type', 'button');

      var pressed = false;
      var downX = 0;
      var downY = 0;
      var pointerId = null;

      card.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0 || card.disabled) return;
        pressed = true;
        pointerId = ev.pointerId;
        downX = ev.clientX;
        downY = ev.clientY;
        if (card.setPointerCapture) {
          try { card.setPointerCapture(pointerId); } catch (e) { /* noop */ }
        }
        card.classList.add('is-pressed');
        spawnRoleRipple(card, ev);
      });

      function finish(ev) {
        if (!pressed) return;
        if (ev.pointerId != null && pointerId != null && ev.pointerId !== pointerId) return;
        pressed = false;
        pointerId = null;
        card.classList.remove('is-pressed');
        card.classList.add('is-released', 'role-pop');
        setTimeout(function () {
          card.classList.remove('is-released', 'role-pop');
        }, 480);

        if (onSelect) onSelect(card);
      }

      card.addEventListener('pointerup', finish);
      card.addEventListener('pointercancel', function () {
        pressed = false;
        pointerId = null;
        card.classList.remove('is-pressed', 'is-released', 'role-pop');
      });
    });
  }

  function initGestures(root) {
    root = root || document;
    var selector = [
      'button:not(.auth-role-card)',
      '.btn:not(.auth-role-card)',
      '.admin-tab-btn',
      '.nav-dashboards button',
      '.sidebar-footer button',
      '.tv-exit-btn',
      '.drop-zone-admin',
      '.gen-link',
      '.gen-card--interactive',
      '.gen-status-item.is-live',
      '.gen-hero-actions .btn'
    ].join(', ');
    root.querySelectorAll(selector).forEach(function (el) {
      if (el.dataset.gestureBound === '1') return;
      el.dataset.gestureBound = '1';
      el.addEventListener('pointerdown', function (ev) {
        if (el.disabled) return;
        el.classList.add('is-pressed');
        spawnRipple(el, ev);
      });
      function release() {
        el.classList.remove('is-pressed');
        if (!el.disabled) {
          el.classList.add('is-released');
          setTimeout(function () { el.classList.remove('is-released'); }, 400);
        }
      }
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', function () { el.classList.remove('is-pressed'); });
    });
  }

  var REMEMBER_LOGIN_KEYS = {
    wms: { user: 'almacen_saved_login_wms', enabled: 'almacen_saved_login_wms_on' },
    despacho: { user: 'almacen_saved_login_desp', enabled: 'almacen_saved_login_desp_on' },
    averias: { user: 'almacen_saved_login_averias', enabled: 'almacen_saved_login_averias_on' }
  };

  function getRememberLoginKeys(portal) {
    return REMEMBER_LOGIN_KEYS[portal] || REMEMBER_LOGIN_KEYS.wms;
  }

  function isRememberLoginEnabled(portal) {
    try {
      if (!global.localStorage) return true;
      var keys = getRememberLoginKeys(portal);
      var stored = localStorage.getItem(keys.enabled);
      if (stored === null) return true;
      return stored === '1';
    } catch (e) {
      return true;
    }
  }

  function getRememberedLoginUsername(portal) {
    try {
      if (!global.localStorage || !isRememberLoginEnabled(portal)) return '';
      var keys = getRememberLoginKeys(portal);
      return sanitizeUsername(localStorage.getItem(keys.user) || '');
    } catch (e) {
      return '';
    }
  }

  function applyRememberedLoginUsername(portal, input, checkbox) {
    if (!input) return;
    var enabled = isRememberLoginEnabled(portal);
    if (checkbox) checkbox.checked = enabled;
    var saved = enabled ? getRememberedLoginUsername(portal) : '';
    if (saved) input.value = saved;
  }

  function persistRememberedLoginUsername(portal, username, rememberEnabled) {
    try {
      if (!global.localStorage) return;
      var keys = getRememberLoginKeys(portal);
      localStorage.setItem(keys.enabled, rememberEnabled ? '1' : '0');
      if (rememberEnabled && username) {
        localStorage.setItem(keys.user, sanitizeUsername(username));
      } else {
        localStorage.removeItem(keys.user);
      }
    } catch (e) { /* noop */ }
  }

  global.PanelCore = {
    SESSION_KEY: SESSION_KEY,
    DESPACHO_SESSION_KEY: DESPACHO_SESSION_KEY,
    SESSION_MS: SESSION_MS,
    USERNAME_MAX: USERNAME_MAX,
    PASSWORD_MAX: PASSWORD_MAX,
    $: $,
    esc: esc,
    sanitizeUsername: sanitizeUsername,
    bindOnce: bindOnce,
    formatDateTime: formatDateTime,
    sha256: sha256,
    sha256Sync: sha256Sync,
    checkLoginAllowed: checkLoginAllowed,
    recordLoginFailure: recordLoginFailure,
    clearLoginAttempts: clearLoginAttempts,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    touchSession: touchSession,
    checkDespachoLoginAllowed: checkDespachoLoginAllowed,
    recordDespachoLoginFailure: recordDespachoLoginFailure,
    clearDespachoLoginAttempts: clearDespachoLoginAttempts,
    getDespachoSession: getDespachoSession,
    saveDespachoSession: saveDespachoSession,
    clearDespachoSession: clearDespachoSession,
    touchDespachoSession: touchDespachoSession,
    getAveriasSession: getAveriasSession,
    saveAveriasSession: saveAveriasSession,
    clearAveriasSession: clearAveriasSession,
    touchAveriasSession: touchAveriasSession,
    checkAveriasLoginAllowed: checkAveriasLoginAllowed,
    recordAveriasLoginFailure: recordAveriasLoginFailure,
    clearAveriasLoginAttempts: clearAveriasLoginAttempts,
    initGestures: initGestures,
    initAuthRoleGestures: initAuthRoleGestures,
    spawnRipple: spawnRipple,
    spawnRoleRipple: spawnRoleRipple,
    isRememberLoginEnabled: isRememberLoginEnabled,
    getRememberedLoginUsername: getRememberedLoginUsername,
    applyRememberedLoginUsername: applyRememberedLoginUsername,
    persistRememberedLoginUsername: persistRememberedLoginUsername
  };
})(typeof window !== 'undefined' ? window : this);
