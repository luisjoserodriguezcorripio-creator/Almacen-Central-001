/**
 * Plataforma Almacén Central — aplicación principal
 */
(function (global) {
  'use strict';

  var PC = null;
  var EXCEL_MAX_BYTES = 15 * 1024 * 1024;
  var DETAIL_ROW_LIMIT = 80;

  var state = {
    user: null,
    config: null,
    dataOperaciones: null,
    dataProductividad: null,
    dataFacturas: null,
    dataDespacho: null,
    operacionesTableFilters: {},
    facturasFilters: { fechaDesde: '', fechaHasta: '', almacen: '' },
    charts: {},
    clockTimer: null,
    refreshTimer: null,
    aiReminderTimer: null,
    aiReminderMinutes: 0
  };

  var OPS_VIEWS = global.PlatformOperacionesUI ? global.PlatformOperacionesUI.OPS_VIEWS : {
    resumen: { title: 'Panel de control' },
    tabla: { title: 'Tabla avanzada' },
    graficos: { title: 'Gráficos' },
    exportar: { title: 'Exportar' }
  };

  var PROD_VIEWS = global.PlatformModules ? global.PlatformModules.PROD_VIEWS : {
    resumen: { title: 'Resumen productividad' },
    empleados: { title: 'Rendimiento por empleado' },
    tendencias: { title: 'Tendencia diaria' },
    matriz: { title: 'Matriz fecha × empleado' }
  };

  var DESP_VIEWS = {
    combinado: { title: 'Combinado' },
    preparador: { title: 'Preparador' },
    validador: { title: 'Validador' }
  };

  function loadDespachoData() {
    if (global.PlatformDespachoStore) {
      return global.PlatformDespachoStore.load();
    }
    return global.PlatformStore.getPublishedData('despacho');
  }

  function $(id) {
    return PC.$(id);
  }

  function logActor() {
    if (!state.user || !global.PlatformAdmin) return 'sistema';
    return global.PlatformAdmin.getLogActor
      ? global.PlatformAdmin.getLogActor(state.user)
      : (state.user.username || 'sistema');
  }

  function userCan(permission) {
    if (!state.user || !global.PlatformAdmin) return false;
    return global.PlatformAdmin.can(state.user.role, permission, state.user);
  }

  function refreshSessionUser() {
    if (!state.user || !global.PlatformAdmin) return;
    var fresh = global.PlatformAdmin.getUsers().find(function (u) { return u.id === state.user.id; });
    if (fresh) {
      state.user = fresh;
      applyPermissions();
      updateRoleBadge();
    }
  }

  function esc(s) {
    return PC.esc(s);
  }

  function bindOnce(el, event, handler) {
    PC.bindOnce(el, event, handler);
  }

  function toastNotify(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else if (type === 'warn') global.PlatformToast.warning(msg);
    else global.PlatformToast.info(msg);
  }

  function speakHuman(message) {
    if (!message) return;
    if (global.PlatformSpeech && global.PlatformSpeech.speak) {
      global.PlatformSpeech.speak(message, { cancel: true });
      return;
    }
    try {
      if (!('speechSynthesis' in global) || !global.SpeechSynthesisUtterance) return;
      var utter = new SpeechSynthesisUtterance(message);
      utter.lang = 'es-DO';
      utter.rate = 0.95;
      utter.pitch = 1;
      utter.volume = 0.82;
      var voices = global.speechSynthesis.getVoices ? global.speechSynthesis.getVoices() : [];
      var preferred = state.config && state.config.aiVoiceURI;
      var voice = preferred ? voices.find(function (v) { return v.voiceURI === preferred; }) : null;
      voice = voice || voices.find(function (v) {
        return /^es(-|_)/i.test(v.lang || '') && /female|mujer|sofia|paulina|sabina|google/i.test(v.name || '');
      }) || voices.find(function (v) {
        return /^es(-|_)/i.test(v.lang || '');
      });
      if (voice) utter.voice = voice;
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(utter);
    } catch (e) { /* voz no disponible */ }
  }

  function aiHumanNotice(message, type) {
    toastNotify(message, type || 'info');
    speakHuman(message);
  }

  function getViewMeta() {
    return {
      userName: state.user ? global.PlatformAdmin.getDisplayName(state.user) : '',
      canImport: userCan('data.import')
    };
  }

  function updateDataStatusChips() {
    var prod = $('chipProdStatus');
    var ops = $('chipOpsStatus');
    if (!prod || !ops) return;
    var hasProd = state.dataProductividad && state.dataProductividad.celdas && state.dataProductividad.celdas.length;
    var hasOps = false;
    if (state.dataOperaciones) {
      if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.isControlData(state.dataOperaciones)) {
        hasOps = state.dataOperaciones.registros && state.dataOperaciones.registros.length > 0;
      } else if (state.dataOperaciones.bd && state.dataOperaciones.bd.registros) {
        hasOps = state.dataOperaciones.bd.registros.length > 0;
      }
    }
    prod.textContent = hasProd ? 'Prod ✓' : 'Prod —';
    prod.className = 'data-chip ' + (hasProd ? 'is-live' : 'is-empty');
    ops.textContent = hasOps ? 'Ops ✓' : 'Ops —';
    ops.className = 'data-chip ' + (hasOps ? 'is-live' : 'is-empty');
    var fac = $('chipFacStatus');
    if (fac) {
      var hasFac = state.dataFacturas && state.dataFacturas.registros && state.dataFacturas.registros.length;
      fac.textContent = hasFac ? 'Fac ✓' : 'Fac —';
      fac.className = 'data-chip ' + (hasFac ? 'is-live' : 'is-empty');
    }
    var desp = $('chipDespStatus');
    if (desp) {
      var nDesp = state.dataDespacho && state.dataDespacho.pedidos ? state.dataDespacho.pedidos.length : 0;
      desp.textContent = nDesp ? 'Desp ' + nDesp : 'Desp —';
      desp.className = 'data-chip ' + (nDesp ? 'is-live' : 'is-empty');
    }
  }

  function applyFacturasFilters(data) {
    if (!data || !global.PlatformExcelFacturas) return data;
    var f = state.facturasFilters || {};
    return global.PlatformExcelFacturas.filterData(data, {
      fechaDesde: f.fechaDesde,
      fechaHasta: f.fechaHasta,
      almacen: f.almacen
    });
  }

  function refreshViewFromStore() {
    if (!state.user) return;
    state.dataOperaciones = applyOperacionesFilters(global.PlatformStore.getPublishedData('operaciones'));
    state.dataProductividad = applyProductividadFilters(global.PlatformStore.getPublishedData('productividad'));
    state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
    state.dataDespacho = loadDespachoData();
    updateDataStatusChips();
    destroyCharts();
    bindFilters();
    renderCurrentModule();
    runAiNarrative();
    toastNotify('Vista actualizada.', 'ok');
  }

  function initPasswordToggle() {
    var btn = $('btnTogglePassword');
    var input = $('authPassword');
    if (!btn || !input) return;
    bindOnce(btn, 'click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Ver';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
  }

  function bindUiEnhancements() {
    var app = $('platformApp');
    if (!app || app.dataset.enhanceBound) return;
    app.dataset.enhanceBound = '1';

    bindOnce(app, 'click', function (ev) {
      var adminBtn = ev.target.closest('[data-open-admin]');
      if (adminBtn && state.user && global.PlatformAdmin.canAccessAdminModal(state.user)) {
        ev.preventDefault();
        openAdminModal();
        var tab = adminBtn.getAttribute('data-open-admin');
        if (tab && global.PlatformAdminUI) {
          var paneMap = global.PlatformAdminUI.TAB_PANE_IDS || {};
          if (paneMap[tab]) {
            global.PlatformAdminUI.switchTab(tab);
          } else {
            global.PlatformAdminUI.switchTab(tab === 'sistema' ? 'sistema' : 'excel');
          }
          if (tab === 'facturas' || tab === 'excel') {
            var anchor = $(tab === 'facturas' ? 'adminSectionFacturas' : 'adminPaneExcel');
            if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        return;
      }
      var jump = ev.target.closest('[data-module-jump]');
      if (jump) {
        ev.preventDefault();
        switchModule(jump.getAttribute('data-module-jump'));
        document.body.classList.remove('sidebar-open');
        return;
      }
      if (ev.target.closest('#btnTvFromGeneral')) {
        ev.preventDefault();
        toggleTvMode();
      }
    });

    var backdrop = $('sidebarBackdrop');
    if (backdrop) {
      bindOnce(backdrop, 'click', function () {
        document.body.classList.remove('sidebar-open');
      });
    }

    bindOnce($('btnRefreshView'), 'click', refreshViewFromStore);
    bindOnce($('btnShortcutsHelp'), 'click', function () {
      if (global.PlatformShortcuts) global.PlatformShortcuts.openHelp();
    });

    if (global.PlatformShortcuts) {
      global.PlatformShortcuts.init({
        switchModule: switchModule,
        openAdmin: openAdminModal,
        openAi: openAiDrawer,
        toggleTheme: toggleTheme,
        refreshView: refreshViewFromStore
      });
    }
  }

  /* ——— Autenticación ——— */

  function showAuthError(msg) {
    var el = $('authError');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-visible', !!msg);
  }

  var authBgVideoState = {
    bound: false,
    index: 0,
    clips: [],
    watchdog: null,
    resumeLock: false
  };

  function authVideoShouldRun() {
    if (overlayIsHidden()) return false;
    if (global.PlatformPerf) {
      if (global.PlatformPerf.shouldUsePosterOnly && global.PlatformPerf.shouldUsePosterOnly()) {
        return false;
      }
      if (global.PlatformPerf.shouldLoadAuthVideo && !global.PlatformPerf.shouldLoadAuthVideo()) {
        return false;
      }
    }
    if (global.document && global.document.documentElement.classList.contains('perf-lite')) {
      return false;
    }
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return true;
  }

  function getAuthBgVideos() {
    var single = $('authBgVideo');
    if (single) return [single];
    var list = [];
    ['authBgVideoA', 'authBgVideoB', 'authBgVideoC'].forEach(function (id) {
      var el = $(id);
      if (el) list.push(el);
    });
    return list;
  }

  function primeAuthVideo(video) {
    if (!video || video.dataset.authPrimed === '1') return;
    video.dataset.authPrimed = '1';
    if (global.PlatformPerf && global.PlatformPerf.primeAuthVideoElement) {
      global.PlatformPerf.primeAuthVideoElement(video);
      if (!authVideoShouldRun()) return;
    }
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playsInline = true;
    if (!video.hasAttribute('loop')) video.loop = true;
    try { video.playbackRate = 1; } catch (e) { /* ignore */ }

    var stallTimer = null;

    function nudgePlay() {
      if (!authVideoShouldRun()) return;
      if (authBgVideoState.resumeLock) return;
      authBgVideoState.resumeLock = true;
      video.muted = true;
      var p = video.play();
      if (p && typeof p.then === 'function') {
        p.then(function () {
          authBgVideoState.resumeLock = false;
        }).catch(function () {
          authBgVideoState.resumeLock = false;
        });
      } else {
        authBgVideoState.resumeLock = false;
      }
    }

    function scheduleNudge(delayMs) {
      if (stallTimer) global.clearTimeout(stallTimer);
      stallTimer = global.setTimeout(function () {
        stallTimer = null;
        nudgePlay();
      }, delayMs || 180);
    }

    video.addEventListener('stalled', function () {
      scheduleNudge(160);
    });
    video.addEventListener('waiting', function () {
      var wrap = video.closest('.auth-video-wrap');
      if (wrap) wrap.classList.add('is-buffering');
      scheduleNudge(220);
    });
    video.addEventListener('playing', function () {
      var wrap = video.closest('.auth-video-wrap');
      if (wrap) wrap.classList.remove('is-buffering');
    });
    video.addEventListener('loadeddata', nudgePlay, { once: true });

    if (!authBgVideoState.boundVisibility) {
      authBgVideoState.boundVisibility = true;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          getAuthBgVideos().forEach(nudgePlay);
        }
      });
    }
  }

  function startAuthVideoWatchdog() {
    /* desactivado — el reintento constante causaba tirones en el video */
  }

  function stopAuthVideoWatchdog() {
    if (authBgVideoState.watchdog) {
      global.clearInterval(authBgVideoState.watchdog);
      authBgVideoState.watchdog = null;
    }
  }

  function playAuthVideo(video) {
    if (!video) return;
    primeAuthVideo(video);
    video.classList.add('is-active');
    video.muted = true;
    try { video.playbackRate = 1; } catch (e) { /* ignore */ }
    if (video.loop) {
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked */ });
      return;
    }
    try { video.currentTime = 0; } catch (e) { /* ignore */ }
    var playPromise = video.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(function () { /* autoplay blocked */ });
    }
  }

  function setActiveAuthClip(index) {
    var clips = authBgVideoState.clips;
    if (!clips.length) return;
    if (clips.length === 1) {
      playAuthVideo(clips[0]);
      return;
    }
    authBgVideoState.index = ((index % clips.length) + clips.length) % clips.length;
    clips.forEach(function (v, i) {
      v.classList.toggle('is-active', i === authBgVideoState.index);
      if (i !== authBgVideoState.index) {
        try { v.pause(); } catch (e) { /* ignore */ }
      }
    });
    var current = clips[authBgVideoState.index];
    if (!current) return;
    playAuthVideo(current);
  }

  function bindAuthBgVideoCycle() {
    if (authBgVideoState.bound) return;
    authBgVideoState.clips = getAuthBgVideos();
    if (!authBgVideoState.clips.length) return;
    authBgVideoState.bound = true;
    authBgVideoState.clips.forEach(function (video) {
      primeAuthVideo(video);
    });
    if (authBgVideoState.clips.length === 1) return;
    authBgVideoState.clips.forEach(function (video, i) {
      video.addEventListener('ended', function () {
        if (!overlayIsHidden()) setActiveAuthClip(i + 1);
      });
    });
  }

  function syncAuthBgVideo(visible) {
    var clips = getAuthBgVideos();
    if (!clips.length) return;
    authBgVideoState.clips = clips;
    if (!authVideoShouldRun()) {
      stopAuthVideoWatchdog();
      clips.forEach(function (v) {
        try { v.pause(); } catch (e) { /* ignore */ }
      });
      return;
    }
    var reduceMotion = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!visible || reduceMotion) {
      stopAuthVideoWatchdog();
      clips.forEach(function (v) {
        try { v.pause(); } catch (e) { /* ignore */ }
      });
      return;
    }
    bindAuthBgVideoCycle();
    startAuthVideoWatchdog();
    setActiveAuthClip(authBgVideoState.index);
  }

  function clearModuleViewClasses() {
    document.body.classList.remove(
      'ops-dash-view', 'facturas-dash-view', 'despacho-dash-view', 'general-panel-view',
      'ops-tv-active', 'facturas-tv-active', 'tv-unified-active'
    );
  }

  function resetAuthLayout() {
    if (!document.body.classList.contains('auth-locked')) return;
    var overlay = $('authOverlay');
    if (overlay) overlay.scrollTop = 0;
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    setAuthHubLoginOpen(false);
  }

  function setHubDrawerOpen(open) {
    var drawer = $('hubDrawer');
    var overlay = $('hubDrawerOverlay');
    var btn = $('hubMenuBtn');
    var chrome = $('hubChrome');
    if (!drawer) return;
    var isOpen = !!open;
    drawer.classList.toggle('open', isOpen);
    if (chrome) chrome.classList.toggle('is-drawer-open', isOpen);
    if (overlay) {
      overlay.classList.toggle('show', isOpen);
      overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function initHubDrawer() {
    var btn = $('hubMenuBtn');
    var overlay = $('hubDrawerOverlay');
    if (!btn) return;
    bindOnce(btn, 'click', function () {
      var drawer = $('hubDrawer');
      setHubDrawerOpen(!(drawer && drawer.classList.contains('open')));
    });
    if (overlay) {
      bindOnce(overlay, 'click', function () { setHubDrawerOpen(false); });
    }
  }

  function syncHubNewsWakeLock() {
    if (!global.PlatformWakeLock) return;
    var layout = $('authHubLayout') || document.querySelector('.auth-layout--hub');
    var hold = document.body.classList.contains('auth-locked') &&
      layout &&
      layout.classList.contains('auth-layout--hub-news') &&
      !layout.classList.contains('auth-layout--login-open');
    global.PlatformWakeLock.setHeld('hub-news-board', hold);
  }

  function setAuthHubLoginOpen(open) {
    var layout = $('authHubLayout') || document.querySelector('.auth-layout--hub');
    var panel = $('authLoginPanel');
    var portalCard = $('authPortalMando');
    if (!layout || !panel) return;

    if (open) setHubDrawerOpen(false);

    layout.classList.toggle('auth-layout--portals-only', !open);
    layout.classList.toggle('auth-layout--login-open', open);
    layout.classList.toggle('auth-layout--hub-news', !open);
    panel.hidden = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (portalCard) {
      portalCard.classList.toggle('is-active', open);
      if (open) portalCard.setAttribute('aria-current', 'page');
      else portalCard.removeAttribute('aria-current');
    }

    if (open) {
      var form = $('authForm');
      if (form && global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
        if (!form.querySelector('.auth-human-verify')) {
          global.PlatformSecurity.mountLoginForm(form, 'wms');
        }
      }
      var userField = $('authUsername');
      if (userField) {
        setTimeout(function () { userField.focus(); }, 120);
      }
    } else {
      showAuthError('');
      var pwd = $('authPassword');
      if (pwd) pwd.value = '';
    }
    syncHubNewsWakeLock();
  }

  function initAuthHub() {
    initHubDrawer();
    var layout = $('authHubLayout') || document.querySelector('.auth-layout--hub');
    if (!layout) return;

    var portalBtn = $('authPortalMando');
    var backBtn = $('authPortalBack');

    if (portalBtn) {
      bindOnce(portalBtn, 'click', function (ev) {
        ev.preventDefault();
        setHubDrawerOpen(false);
        setAuthHubLoginOpen(true);
      });
    }
    if (backBtn) {
      bindOnce(backBtn, 'click', function () {
        setAuthHubLoginOpen(false);
      });
    }
    syncHubNewsWakeLock();
    if (!initAuthHub._wakeRetryBound) {
      initAuthHub._wakeRetryBound = true;
      var authOverlay = $('authOverlay');
      if (authOverlay) {
        var retryHubWake = function () { syncHubNewsWakeLock(); };
        authOverlay.addEventListener('pointerdown', retryHubWake, { passive: true });
      }
    }
  }

  function setAuthVisible(visible) {
    var overlay = $('authOverlay');
    var app = $('platformApp');
    var portal = $('authExternalPortals');
    if (visible) {
      clearModuleViewClasses();
      resetAuthLayout();
    }
    if (portal) {
      portal.hidden = !visible;
      portal.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    syncAuthBgVideo(visible);
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) {
        app.setAttribute('aria-hidden', 'true');
        app.setAttribute('inert', '');
      } else {
        app.removeAttribute('aria-hidden');
        app.removeAttribute('inert');
      }
    }
    document.body.classList.toggle('auth-locked', visible);
    syncHubNewsWakeLock();
  }

  function showAuthRoleFeedback(card) {
    var picker = card && card.closest('.auth-role-picker');
    if (picker) {
      picker.classList.remove('role-area-pulse');
      void picker.offsetWidth;
      picker.classList.add('role-area-pulse');
    }
  }

  function applyRolePicker(card) {
    document.querySelectorAll('.auth-role-card').forEach(function (btn) {
      var active = btn === card;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('role-select-in', active);
      if (!active) btn.classList.remove('role-select-in');
    });
    if (card) {
      var form = $('authForm');
      if (form) form.setAttribute('data-selected-area', card.getAttribute('data-role') || '');
      showAuthRoleFeedback(card);
    }
  }

  function setLoginLoading(loading) {
    var btn = $('authSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  }

  function setWebPublishStatus(text, kind) {
    var el = $('webUsersPublishStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-live', 'is-busy', 'is-warn');
    if (kind) el.classList.add(kind);
  }

  function setWebPublishButtonLoading(loading, ok) {
    var btn = $('btnPublishWebUsers');
    if (!btn) return;
    btn.classList.toggle('is-loading', !!loading);
    btn.classList.toggle('is-ok', !!ok && !loading);
    var label = btn.querySelector('.btn-web-publish-label');
    if (label) {
      label.textContent = loading ? 'Publicando…' : (ok ? 'Publicado ✓' : 'Publicar ahora');
    }
    btn.disabled = !!loading;
  }

  function formatWebPublishResult(body) {
    if (!body || !body.ok) return { text: 'No se pudo publicar.', kind: 'is-warn', toast: 'err' };
    var count = body.count || 0;
    if (body.live && body.pushed) {
      return {
        text: count + ' usuario(s) en la web · hace un momento',
        kind: 'is-live',
        toast: 'ok',
        toastMsg: count + ' usuario(s) publicados. Ya pueden entrar en la web.'
      };
    }
    if (body.gitError) {
      return {
        text: 'Guardado en disco · revisa conexión git',
        kind: 'is-warn',
        toast: 'warn',
        toastMsg: 'Exportado localmente. Ejecuta publicar-usuarios-web.ps1 si falló el push.'
      };
    }
    return {
      text: count + ' usuario(s) exportados localmente',
      kind: 'is-live',
      toast: 'ok',
      toastMsg: count + ' usuario(s) exportados.'
    };
  }

  function publishWebUsersNow(showToast) {
    if (!global.PlatformWebUsers) {
      return Promise.resolve({ ok: false });
    }
    setWebPublishButtonLoading(true);
    setWebPublishStatus('Publicando en GitHub Pages…', 'is-busy');
    var run = global.PlatformWebUsers.publishLive || global.PlatformWebUsers.publishToDisk;
    return run().then(function (body) {
      if (!body || body.ok === false) {
        throw new Error((body && body.message) || 'publish-failed');
      }
      var result = formatWebPublishResult(body);
      setWebPublishStatus(result.text, result.kind);
      setWebPublishButtonLoading(false, body && body.live && body.pushed);
      if (showToast !== false && result.toastMsg) {
        toastNotify(result.toastMsg, result.toast);
      }
      if (body && body.live && body.pushed) {
        setTimeout(function () { setWebPublishButtonLoading(false, false); }, 2800);
      }
      return body;
    }).catch(function () {
      if (global.PlatformWebUsers.downloadWebUsersExport) {
        global.PlatformWebUsers.downloadWebUsersExport();
      }
      setWebPublishStatus('Servidor local apagado · descargado JSON', 'is-warn');
      setWebPublishButtonLoading(false);
      if (showToast !== false) {
        toastNotify('Enciende serve-dashboard.ps1 para publicar al instante.', 'warn');
      }
      return { ok: false };
    });
  }

  function triggerWebUsersPublish() {
    publishWebUsersNow(false);
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('authUsername') && $('authUsername').value);
    var password = String(($('authPassword') && $('authPassword').value) || '').trim();

    showAuthError('');
    var allowed = PC.checkLoginAllowed();
    if (!allowed.ok) {
      showAuthError(allowed.message);
      return;
    }
    if (!username) {
      showAuthError('Escribe el usuario.');
      $('authUsername') && $('authUsername').focus();
      return;
    }
    if (!password) {
      showAuthError('Escribe la contraseña.');
      $('authPassword') && $('authPassword').focus();
      return;
    }
    if (password.length > PC.PASSWORD_MAX) {
      showAuthError('Contraseña demasiado larga.');
      return;
    }

    setLoginLoading(true);
    var Sec = global.PlatformSecurity;
    var verifyHuman = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'wms', form: $('authForm') })
      : Promise.resolve({ ok: true });

    verifyHuman.then(function (human) {
      if (!human.ok) {
        setLoginLoading(false);
        showAuthError(human.error || 'Completa la verificación humana.');
        if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('authForm'));
        return;
      }

      function attemptLogin() {
        try {
          var hash = PC.sha256Sync(password);
          var user = global.PlatformAdmin.authenticate(username, hash);
          setLoginLoading(false);
          if (!user) {
            PC.recordLoginFailure();
            if (Sec && Sec.resetHumanVerify) Sec.resetHumanVerify($('authForm'), { reason: 'auth-failed' });
            var msg = 'Usuario o contraseña incorrectos.';
            if (global.PlatformWebUsers && global.PlatformWebUsers.isPublicWeb &&
                global.PlatformWebUsers.isPublicWeb() && !global.PlatformAdmin.isPrimaryLoginName(username)) {
              msg = 'Usuario o contraseña incorrectos. Verifica los datos que te dio el administrador.';
            }
            showAuthError(msg);
            return;
          }
          PC.clearLoginAttempts();
          PC.persistRememberedLoginUsername(
            'wms',
            username,
            !!($('authRememberUser') && $('authRememberUser').checked)
          );
          var sessionPayload = user;
          if (global.PlatformAdmin.isPrimaryAdminUser(user)) {
            sessionPayload = Object.assign({}, user, {
              username: '',
              name: 'Administrador general'
            });
          }
          PC.saveSession(sessionPayload);
          enterApp(user);
          var siteLabel = (global.PlatformSite && global.PlatformSite.product) || 'Almacén Central 001';
          toastNotify('Bienvenido a ' + siteLabel + ', ' + global.PlatformAdmin.getDisplayName(user) + '.', 'ok');
        } catch (err) {
          setLoginLoading(false);
          showAuthError('No se pudo validar la sesión. Intenta de nuevo.');
        }
      }
      if (global.PlatformWebUsers && global.PlatformWebUsers.refresh) {
        global.PlatformWebUsers.refresh().then(attemptLogin).catch(attemptLogin);
      } else {
        attemptLogin();
      }
    });
  }

  function initAuth() {
    var form = $('authForm');
    if (!form) return;

    var overlay = $('authOverlay');
    if (PC.initAuthRoleGestures && overlay) {
      PC.initAuthRoleGestures(overlay, function (card) {
        applyRolePicker(card);
      });
    } else {
      bindOnce(form, 'click', function (ev) {
        var card = ev.target.closest('.auth-role-card');
        if (!card) return;
        ev.preventDefault();
        applyRolePicker(card);
      });
    }

    bindOnce(form, 'submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });

    var activeCard = document.querySelector('.auth-role-card.active');
    if (activeCard) applyRolePicker(activeCard);
    initPasswordToggle();
    PC.applyRememberedLoginUsername('wms', $('authUsername'), $('authRememberUser'));
    initAuthHub();
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      var hubLayout = $('authHubLayout') || document.querySelector('.auth-layout--hub.auth-layout--portals-only');
      if (!hubLayout) {
        global.PlatformSecurity.mountLoginForm(form, 'wms');
      }
    }

    if (!overlayIsHidden()) {
      syncAuthBgVideo(true);
    }

    if (!initAuth._pageshowBound) {
      initAuth._pageshowBound = true;
      window.addEventListener('pageshow', function () {
        if (document.body.classList.contains('auth-locked')) {
          clearModuleViewClasses();
          resetAuthLayout();
          syncHubNewsWakeLock();
        }
      });
    }
  }

  function overlayIsHidden() {
    var overlay = $('authOverlay');
    return !overlay || overlay.classList.contains('is-hidden');
  }

  function tryRestoreSession() {
    var session = PC.getSession();
    if (!session) return false;
    var user = global.PlatformAdmin.getUsers().find(function (u) {
      return u.id === session.userId && u.active;
    });
    if (!user && session.username && global.PlatformAdmin.isPrimaryLoginName &&
        global.PlatformAdmin.isPrimaryLoginName(session.username)) {
      user = global.PlatformAdmin.getUsers().find(function (u) {
        return u.active && global.PlatformAdmin.isPrimaryAdminUser(u);
      });
    }
    if (!user) {
      PC.clearSession();
      return false;
    }
    enterApp(user);
    return true;
  }

  function logout() {
    PC.clearSession();
    stopTimers();
    destroyCharts();
    state.user = null;
    state._sessionTouchBound = false;
    setAuthVisible(true);
    setAuthHubLoginOpen(false);
    var pwd = $('authPassword');
    if (pwd) pwd.value = '';
    showAuthError('');
  }

  /* ——— App shell ——— */

  function applyPermissions() {
    var role = state.user ? state.user.role : '';
    var user = state.user;
    document.querySelectorAll('[data-perm]').forEach(function (el) {
      var perm = el.getAttribute('data-perm');
      el.classList.toggle('perm-denied', !global.PlatformAdmin.can(role, perm, user));
    });
    document.querySelectorAll('.nav-module-btn[data-module="administracion"]').forEach(function (el) {
      el.classList.toggle('perm-denied', !(userCan('admin.panel') || userCan('data.import')));
    });
    updateRequestsBadge();
    if (global.PlatformUtils) global.PlatformUtils.applyRoleUi(state.user);
    if (global.PlatformNetworkRelay) global.PlatformNetworkRelay.syncAdminToggleUi();
    if (global.PlatformHubNewsApp && global.PlatformHubNewsApp.initAdmin) {
      global.PlatformHubNewsApp.initAdmin(state.user);
    }
  }

  function updateRequestsBadge() {
    var badge = $('adminRequestsBadge');
    if (!badge || !global.PlatformAdmin) return;
    if (!userCan('requests.manage')) {
      badge.hidden = true;
      return;
    }
    var n = global.PlatformAdmin.getPendingRequestsCount();
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
    }
  }

  function updateRoleBadge() {
    if (!state.user) return;
    var labelEl = $('sessionUserLabel');
    var isPrimary = global.PlatformAdmin.isPrimaryAdminUser(state.user);
    if (labelEl) {
      if (isPrimary) {
        labelEl.hidden = true;
        labelEl.textContent = '';
        labelEl.removeAttribute('title');
      } else {
        labelEl.hidden = false;
        labelEl.textContent = global.PlatformAdmin.getDisplayName(state.user);
        labelEl.title = 'Usuario: ' + state.user.username;
      }
    }
    var badge = $('roleBadge');
    if (!badge) return;
    badge.textContent = global.PlatformAdmin.getRoleLabel
      ? global.PlatformAdmin.getRoleLabel(state.user)
      : (global.PlatformAdmin.ROLE_LABELS[state.user.role] || state.user.role);
    badge.className = 'role-badge ' + state.user.role + (global.PlatformAdmin.isPrimaryAdminUser(state.user) ? ' primary-admin' : '');
  }

  function setPublishedSyncSubtitle() {
    var el = $('dashboardSubtitle');
    if (!el) return;
    var syncOps = state.dataOperaciones && state.dataOperaciones.updatedAt;
    var syncProd = state.dataProductividad && state.dataProductividad.updatedAt;
    var syncFac = state.dataFacturas && state.dataFacturas.updatedAt;
    var sync = syncOps || syncProd || syncFac;
    var syncText = sync ? PC.formatDateTime(new Date(sync)) : '—';
    el.innerHTML = 'Datos publicados · <span id="lastSync">' + esc(syncText) + '</span>';
  }

  function bindSessionKeepAlive() {
    if (state._sessionTouchBound) return;
    state._sessionTouchBound = true;
    var lastTouch = 0;
    function touch() {
      if (!state.user || !PC.touchSession) return;
      var now = Date.now();
      if (now - lastTouch < 60000) return;
      lastTouch = now;
      PC.touchSession(state.user);
    }
    document.addEventListener('click', touch, { passive: true });
    document.addEventListener('keydown', touch, { passive: true });
  }

  function initAppErrorBoundary() {
    if (state._errorBoundaryBound) return;
    state._errorBoundaryBound = true;
    window.addEventListener('error', function (ev) {
      if (!state.user || !global.PlatformToast) return;
      if (ev && ev.message && /script error/i.test(ev.message)) return;
      global.PlatformToast.warning(
        'Se detectó un problema en la vista. Si persiste, recarga la página (F5).',
        5500
      );
    });
    window.addEventListener('unhandledrejection', function () {
      if (!state.user || !global.PlatformToast) return;
      global.PlatformToast.warning('No se completó una operación. Intenta de nuevo.', 4500);
    });
  }

  function enterApp(user) {
    var fresh = global.PlatformAdmin.getUsers().find(function (u) { return u.id === user.id; });
    state.user = fresh || user;
    state.config = global.PlatformStore.getConfig();
    state.dataOperaciones = applyOperacionesFilters(global.PlatformStore.getPublishedData('operaciones'));
    state.dataProductividad = applyProductividadFilters(global.PlatformStore.getPublishedData('productividad'));
    state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
    state.dataDespacho = loadDespachoData();
    document.documentElement.setAttribute('data-theme', state.config.theme || 'dark');
    setAuthVisible(false);
    showAuthError('');
    updateRoleBadge();
    applyPermissions();
    initAppErrorBoundary();
    bindSessionKeepAlive();
    initShell();
    updateDataStatusChips();
    global.PlatformAdmin.addLog('inicio_sesion', 'sesión', global.PlatformAdmin.getLogActor(user));
  }

  function applyOperacionesFilters(data) {
    if (!data || !state.config) return data;
    var f = state.config.filters;
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.isControlData(data)) {
      if (!f || (!f.fechaDesde && !f.fechaHasta && !f.usuario && !f.estado && !f.ubicacion && !f.tipoTrabajo)) {
        return data;
      }
      return global.PlatformExcelOperaciones.filterData(data, {
        fechaDesde: f.fechaDesde,
        fechaHasta: f.fechaHasta,
        usuario: f.usuario,
        estado: f.estado,
        ubicacion: f.ubicacion,
        tipoTrabajo: f.tipoTrabajo
      });
    }
    if (!f || (!f.fechaDesde && !f.fechaHasta && !f.area && !f.tipoOrden && !f.estado)) {
      return data;
    }
    return global.PlatformExcel.filterData(data, f);
  }

  function applyProductividadFilters(data) {
    if (!data || !state.config) return data;
    var f = state.config.filters;
    if (!f || (!f.fechaDesde && !f.fechaHasta && !f.empleado)) {
      return data;
    }
    return global.PlatformExcelProductivity.filterData(data, {
      fechaDesde: f.fechaDesde,
      fechaHasta: f.fechaHasta,
      empleado: f.empleado
    });
  }

  function getActiveModule() {
    var mod = (state.config && state.config.activeModule) || 'general';
    if (mod === 'linea_trabajo') {
      mod = 'general';
      if (state.config) {
        state.config.activeModule = mod;
        global.PlatformStore.saveConfig(state.config);
      }
    }
    return mod;
  }

  function updateFiltersBarForModule() {
    var mod = getActiveModule();
    var isControl = state.dataOperaciones && global.PlatformExcelOperaciones &&
      global.PlatformExcelOperaciones.isControlData(state.dataOperaciones);
    document.querySelectorAll('.filter-ops-only').forEach(function (el) {
      el.classList.toggle('is-hidden', mod !== 'operaciones' || !isControl);
    });
    document.querySelectorAll('.filter-legacy-only').forEach(function (el) {
      el.classList.toggle('is-hidden', mod !== 'operaciones' || isControl);
    });
    document.querySelectorAll('.filter-group').forEach(function (el) {
      if (el.classList.contains('filter-prod-only') || el.classList.contains('filter-ops-only') ||
          el.classList.contains('filter-legacy-only')) return;
      if (el.querySelector('#filterFechaDesde') || el.querySelector('#filterFechaHasta')) return;
      el.classList.toggle('is-hidden', mod === 'productividad');
    });
    document.querySelectorAll('.filter-prod-only').forEach(function (el) {
      el.classList.toggle('is-hidden', mod !== 'productividad');
    });
    var filtersBar = $('filtersBar');
    if (filtersBar) {
      var opsResumen = mod === 'operaciones' && (state.config.operacionesView || 'resumen') === 'resumen';
      var facturasMod = mod === 'facturas';
      filtersBar.classList.toggle('is-hidden',
        mod === 'general' || mod === 'reportes' || mod === 'administracion' || mod === 'despacho' ||
        opsResumen || facturasMod);
    }
  }

  function syncOpsTvPresentation() {
    if (!global.PlatformOpsDashboard) return;
    if (document.body.classList.contains('tv-unified-active')) {
      global.PlatformOpsDashboard.syncTvMode(false);
      document.body.classList.remove('ops-tv-active');
      return;
    }
    var onOps = getActiveModule() === 'operaciones' &&
      (state.config.operacionesView || 'resumen') === 'resumen';
    var tv = document.body.classList.contains('tv-mode') && onOps;
    global.PlatformOpsDashboard.syncTvMode(tv, (state.config && state.config.tvRotateSeconds) || 8);
  }

  function syncFacturasTvPresentation() {
    if (document.body.classList.contains('tv-unified-active')) {
      document.body.classList.remove('facturas-tv-active');
      return;
    }
    var onFac = getActiveModule() === 'facturas';
    var tv = document.body.classList.contains('tv-mode') && onFac;
    document.body.classList.toggle('facturas-tv-active', !!tv);
  }

  function destroyTvCharts() {
    if (global.PlatformTvDashboard) global.PlatformTvDashboard.destroyCharts();
  }

  function renderTvUnifiedDashboard(preserveSlide) {
    var host = $('module-general');
    if (!host || !global.PlatformTvDashboard) return;
    state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
    var snap = global.PlatformTvDashboard.collectSnapshot(
      state.dataOperaciones,
      state.dataFacturas,
      state.config.facturasTipoCambio,
      state.config.facturasMetas || {},
      state.config
    );
    state._tvSnapshot = snap;
    var clockEl = $('liveClock');
    var clockText = clockEl ? clockEl.textContent : '';
    var slideIds = global.PlatformLayout && global.PlatformLayout.getTvSlideIds
      ? global.PlatformLayout.getTvSlideIds(state.config)
      : null;
    var renderOpts = {
      config: state.config,
      slides: slideIds
    };
    if (typeof preserveSlide === 'number') {
      renderOpts.preserveSlideIndex = preserveSlide;
    }
    global.PlatformTvDashboard.render(host, snap, clockText, renderOpts);
    var tcEl = host.querySelector('#tvWallClock');
    if (tcEl && clockEl) tcEl.textContent = clockEl.textContent;
    if ($('dashboardTitle')) $('dashboardTitle').textContent = 'Centro de mando — Modo TV';
    if ($('dashboardSubtitle')) {
      var tvSub = global.PlatformLayout && global.PlatformLayout.getTvSlideLabels
        ? global.PlatformLayout.getTvSlideLabels(state.config)
        : 'Operación → Facturas';
      $('dashboardSubtitle').innerHTML = esc(tvSub) + ' · <span class="tv-esc-hint">Esc para salir</span>';
    }
    requestAnimationFrame(function () {
      if (global.PlatformGestures) global.PlatformGestures.initTvCarousel(host);
      var slideId = global.PlatformTvDashboard.getSlideId
        ? global.PlatformTvDashboard.getSlideId()
        : 'ops';
      global.PlatformTvDashboard.renderChartsForSlide(snap, chartColors(), slideId);
    });
  }

  function refreshTvUnifiedInPlace() {
    if (!state.config || !state.config.tvMode) return;
    state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
    var snap = global.PlatformTvDashboard.collectSnapshot(
      state.dataOperaciones,
      state.dataFacturas,
      state.config.facturasTipoCambio,
      state.config.facturasMetas || {},
      state.config
    );
    state._tvSnapshot = snap;
    var host = $('module-general');
    var slideId = global.PlatformTvDashboard.getSlideId
      ? global.PlatformTvDashboard.getSlideId()
      : 'ops';
    if (host && global.PlatformTvDashboard.updateSnapshot &&
      global.PlatformTvDashboard.updateSnapshot(host, snap)) {
      global.PlatformTvDashboard.renderChartsForSlide(snap, chartColors(), slideId);
      return;
    }
    var idx = global.PlatformTvDashboard.getSlideIndex
      ? global.PlatformTvDashboard.getSlideIndex()
      : 0;
    renderTvUnifiedDashboard(idx);
    if (global.PlatformTvDashboard) {
      global.PlatformTvDashboard.startCarousel((state.config && state.config.tvRotateSeconds) || 8);
    }
  }

  function syncTvUnifiedPresentation() {
    var tv = !!(state.config && state.config.tvMode);
    document.body.classList.toggle('tv-unified-active', tv);
    if (global.PlatformWakeLock) global.PlatformWakeLock.setHeld('wms-tv', tv);

    if (global.PlatformOpsDashboard) global.PlatformOpsDashboard.syncTvMode(false);
    document.body.classList.remove('ops-tv-active', 'facturas-tv-active');

    if (!tv) {
      if (global.PlatformTvDashboard) global.PlatformTvDashboard.stopCarousel();
      destroyTvCharts();
      state._tvSnapshot = null;
    }
  }

  function stopTimers() {
    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.aiReminderTimer) {
      clearInterval(state.aiReminderTimer);
      state.aiReminderTimer = null;
    }
    state.aiReminderMinutes = 0;
    if (global.PlatformOpsDashboard) global.PlatformOpsDashboard.stopTvCarousel();
    if (global.PlatformTvDashboard) global.PlatformTvDashboard.stopCarousel();
  }

  function destroyCharts() {
    Object.keys(state.charts).forEach(function (key) {
      if (state.charts[key] && state.charts[key].destroy) {
        state.charts[key].destroy();
      }
    });
    state.charts = {};
    destroyTvCharts();
  }

  function initShell() {
    var cfg = state.config;
    document.documentElement.setAttribute('data-theme', cfg.theme || 'dark');
    document.body.classList.add('executive-ui');
    document.body.classList.toggle('tv-mode', !!cfg.tvMode);

    bindOnce($('btnLogout'), 'click', logout);
    bindOnce($('btnTheme'), 'click', toggleTheme);
    bindOnce($('btnTvMode'), 'click', toggleTvMode);
    bindOnce($('btnMenuMobile'), 'click', function () {
      document.body.classList.toggle('sidebar-open');
    });

    bindUiEnhancements();
    bindModuleNav();
    renderSubnav();
    renderCurrentModule();
    bindFilters();
    updateFiltersBarForModule();
    bindAdminModal();
    bindAiDrawer();
    startClock();
    startAutoRefresh();
    bindLanSync();
    startAiHumanReminders();
    runAiNarrative();
    PC.initGestures($('platformApp') || document);
    if (global.PlatformGestures && global.PlatformGestures.initApp) {
      global.PlatformGestures.initApp();
    }
    switchModule(getActiveModule());
    syncTvUnifiedPresentation();
    syncOpsTvPresentation();
    syncFacturasTvPresentation();
    document.addEventListener('ops-tv-slide', function () {
      if (state._opsDashboardModel && !document.body.classList.contains('tv-unified-active')) {
        renderOpsDashboardCharts(state._opsDashboardModel);
      }
    });
    document.addEventListener('despacho-updated', function () {
      state.dataDespacho = loadDespachoData();
      updateDataStatusChips();
      if (getActiveModule() === 'despacho') {
        renderDespachoModule();
      }
      if (state.config && state.config.tvMode) {
        refreshTvUnifiedInPlace();
      }
    });
    document.addEventListener('despacho-web-wiped', function () {
      state.dataDespacho = loadDespachoData();
      updateDataStatusChips();
      if (getActiveModule() === 'despacho') {
        renderDespachoModule();
      }
    });
    document.addEventListener('averias-updated', function () {
      updateDataStatusChips();
      if (getActiveModule() === 'reportes') {
        var host = $('module-reportes');
        if (host && global.PlatformModules && global.PlatformModules.renderReportes) {
          global.PlatformModules.renderReportes(host, {
            operaciones: state.dataOperaciones,
            facturas: state.dataFacturas,
            productividad: state.dataProductividad,
            tipoCambio: state.config && state.config.tipoCambio
          });
        }
      }
    });
    document.addEventListener('tv-dashboard-slide', function (ev) {
      if (!state._tvSnapshot || !global.PlatformTvDashboard || !ev.detail) return;
      global.PlatformTvDashboard.renderChartsForSlide(state._tvSnapshot, chartColors(), ev.detail.slide);
    });
    document.addEventListener('keydown', function (ev) {
      var inTv = state.config && state.config.tvMode &&
        document.body.classList.contains('tv-unified-active');
      if (inTv && global.PlatformTvDashboard) {
        var active = document.querySelector('.tv-slide.active');
        var sid = active ? active.getAttribute('data-slide') : 'ops';
        var slides = global.PlatformTvDashboard.TV_SLIDES;
        var idx = slides.indexOf(sid);
        if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
          ev.preventDefault();
          global.PlatformTvDashboard.setSlide(idx + 1, true);
          return;
        }
        if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
          ev.preventDefault();
          global.PlatformTvDashboard.setSlide(idx - 1, true);
          return;
        }
        var keyNum = parseInt(ev.key, 10);
        if (keyNum >= 1 && keyNum <= slides.length) {
          ev.preventDefault();
          global.PlatformTvDashboard.setSlide(keyNum - 1, true);
          return;
        }
      }
      if (ev.key === 'Escape') {
        var aiOpen = $('aiDrawer');
        if (aiOpen && aiOpen.classList.contains('open')) {
          ev.preventDefault();
          closeAiDrawer();
          return;
        }
      }
      if (ev.key !== 'Escape') return;
      if (!state.config.tvMode && !document.body.classList.contains('tv-mode')) return;
      var helpOpen = document.getElementById('shortcutsModal');
      if (helpOpen && helpOpen.classList.contains('open')) {
        helpOpen.classList.remove('open');
        helpOpen.setAttribute('aria-hidden', 'true');
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      exitTvMode();
      toastNotify('Modo TV desactivado (Esc).', 'info');
    });
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    state.config.theme = next;
    global.PlatformStore.saveConfig(state.config);
    destroyCharts();
    renderCurrentModule();
    toastNotify('Tema ' + (next === 'light' ? 'claro' : 'oscuro') + ' activado.', 'info');
  }

  function pauseTvMode() {
    if (!state.config || !state.config.tvMode) return false;
    state.config.tvMode = false;
    document.body.classList.remove(
      'tv-mode', 'tv-unified-active', 'ops-tv-active', 'facturas-tv-active',
      'tv-slide-ops', 'tv-slide-fac', 'tv-slide-desp'
    );
    global.PlatformStore.saveConfig(state.config);
    syncTvUnifiedPresentation();
    syncOpsTvPresentation();
    syncFacturasTvPresentation();
    destroyTvCharts();
    state._tvSnapshot = null;
    var tvCb = $('configTvDefault');
    if (tvCb) tvCb.checked = false;
    return true;
  }

  function toggleTvMode() {
    state.config.tvMode = !state.config.tvMode;
    document.body.classList.toggle('tv-mode', state.config.tvMode);
    if (state.config.tvMode) state.config.activeModule = 'general';
    global.PlatformStore.saveConfig(state.config);
    syncTvUnifiedPresentation();
    syncOpsTvPresentation();
    syncFacturasTvPresentation();
    if (state.config.tvMode) {
      if (getActiveModule() !== 'general') switchModule('general');
      else renderCurrentModule();
    } else {
      renderCurrentModule();
    }
  }

  function exitTvMode() {
    var wasTv = state.config.tvMode || document.body.classList.contains('tv-mode');
    if (!wasTv) return;
    pauseTvMode();
    var mod = getActiveModule();
    var titles = global.PlatformStore.MODULE_LABELS || {};
    if ($('dashboardTitle')) $('dashboardTitle').textContent = titles[mod] || mod;
    if ($('dashboardSubtitle')) setPublishedSyncSubtitle();
    renderCurrentModule();
  }

  /* ——— Navegación por módulos ——— */

  function bindModuleNav() {
    document.querySelectorAll('.nav-module-btn').forEach(function (btn) {
      if (btn.dataset.moduleBound) return;
      btn.dataset.moduleBound = '1';
      btn.addEventListener('click', function () {
        var mod = btn.getAttribute('data-module');
        if (mod === 'administracion') {
          openAdminModal();
          return;
        }
        switchModule(mod);
      });
    });
    var active = getActiveModule();
    document.querySelectorAll('.nav-module-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-module') === active);
    });
  }

  function pickDefaultAdminTab() {
    var order = ['excel', 'requests', 'accessRequest', 'sistema', 'herramientas', 'users', 'areas', 'config', 'logs', 'ai'];
    for (var i = 0; i < order.length; i++) {
      var tab = order[i];
      var btn = document.querySelector('.admin-tab-btn[data-tab="' + tab + '"]');
      if (btn && !btn.classList.contains('perm-denied')) {
        global.PlatformAdminUI.switchTab(tab);
        return tab;
      }
    }
    return 'excel';
  }

  function refreshAccessRequestPanels() {
    var reqHost = $('accessRequestHost');
    if (reqHost && userCan('access.request') && global.PlatformAdminUI.renderAccessRequestForm) {
      global.PlatformAdminUI.renderAccessRequestForm(reqHost, state.user, submitAccessRequestFromUi);
    }
    var queueHost = $('requestsQueueHost');
    if (queueHost && userCan('requests.manage') && global.PlatformAdminUI.renderRequestsQueue) {
      global.PlatformAdminUI.renderRequestsQueue(queueHost, reviewAccessRequestFromUi);
    }
    updateRequestsBadge();
  }

  function submitAccessRequestFromUi(reason) {
    var res = global.PlatformAdmin.submitAccessRequest(state.user, 'config.save', reason);
    if (!res.ok) {
      toastNotify(res.message || 'No se pudo enviar la solicitud.', 'warn');
      return;
    }
    toastNotify('Solicitud enviada. El administrador la revisará.', 'ok');
    refreshAccessRequestPanels();
  }

  function reviewAccessRequestFromUi(id, approved) {
    var note = '';
    if (!approved) {
      note = prompt('Motivo del rechazo (opcional):', '') || '';
    }
    var res = global.PlatformAdmin.reviewAccessRequest(id, approved, logActor(), note);
    if (!res.ok) {
      toastNotify(res.message || 'No se pudo procesar.', 'warn');
      return;
    }
    toastNotify(approved ? 'Solicitud aprobada. El usuario ya puede configurar.' : 'Solicitud rechazada.', 'ok');
    refreshSessionUser();
    refreshAccessRequestPanels();
    refreshAdminTables();
  }

  function openAdminModal() {
    var modal = $('adminModal');
    if (!modal || !state.user || !global.PlatformAdmin.canAccessAdminModal(state.user)) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    pickDefaultAdminTab();
    refreshAdminPanels();
  }

  function refreshAdminPanels() {
    refreshAdminTables();
    var sysHost = $('adminSystemHost');
    if (sysHost && userCan('admin.panel') && global.PlatformAdminUI.renderSystemPanel) {
      global.PlatformAdminUI.renderSystemPanel(sysHost);
    }
    var toolsHost = $('adminToolsHost');
    if (toolsHost && userCan('admin.panel') && global.PlatformAdminUI.renderToolsPanel) {
      global.PlatformAdminUI.renderToolsPanel(toolsHost, {
        onBackup: adminDownloadBackup,
        onRestore: adminRestoreBackup,
        onClear: adminClearModuleData,
        onResetConfig: adminResetConfig,
        onPurgeLogs: adminPurgeLogs,
        onWipeWeb: adminWipeAllWebData
      });
    }
    loadConfigForm();
    refreshAccessRequestPanels();
    if (global.PlatformHubNewsApp && global.PlatformHubNewsApp.refreshAdmin) {
      global.PlatformHubNewsApp.refreshAdmin(state.user);
    }
  }

  function setAdminToolsStatus(msg, isErr) {
    var el = $('adminToolsStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg show ' + (isErr ? 'err' : 'ok');
  }

  function adminDownloadBackup() {
    if (!global.PlatformAdminTools) return;
    var res = global.PlatformAdminTools.downloadBackup();
    setAdminToolsStatus('Backup descargado (' + global.PlatformAdminTools.formatBytes(res.size) + ').', false);
    global.PlatformAdmin.addLog('backup_export', 'JSON', logActor());
  }

  function adminRestoreBackup(file) {
    if (!file || !global.PlatformAdminTools) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var backup = JSON.parse(ev.target.result);
        var res = global.PlatformAdminTools.restoreBackup(backup);
        setAdminToolsStatus(res.message, !res.ok);
        if (res.ok) {
          state.config = global.PlatformStore.getConfig();
      state.dataOperaciones = global.PlatformStore.getPublishedData('operaciones');
      state.dataProductividad = global.PlatformStore.getPublishedData('productividad');
      document.documentElement.setAttribute('data-theme', state.config.theme || 'dark');
          destroyCharts();
          updateFiltersBarForModule();
          bindFilters();
          renderCurrentModule();
          refreshAdminPanels();
          global.PlatformAdmin.addLog('backup_restore', file.name, logActor());
        }
      } catch (e) {
        setAdminToolsStatus('Archivo JSON inválido.', true);
      }
    };
    reader.readAsText(file);
  }

  function adminClearModuleData(module) {
    if (!userCan('admin.panel')) {
      toastNotify('No tienes permiso para esta acción.', 'warn');
      return;
    }
    var labels = {
      productividad: 'productividad',
      operaciones: 'operaciones',
      facturas: 'facturas',
      all: 'TODOS los módulos'
    };
    if (!confirm('¿Eliminar datos de ' + (labels[module] || module) + '? Esta acción no se puede deshacer.')) return;
    var res = global.PlatformAdminTools.clearModuleData(module);
    setAdminToolsStatus(res.message, !res.ok);
    if (res.ok) {
      state.dataOperaciones = global.PlatformStore.getPublishedData('operaciones');
      state.dataProductividad = global.PlatformStore.getPublishedData('productividad');
      destroyCharts();
      renderCurrentModule();
      refreshAdminPanels();
      global.PlatformAdmin.addLog('clear_data_' + module, '', logActor());
    }
  }

  function adminResetConfig() {
    if (!userCan('config.save')) {
      toastNotify('No tienes permiso. Envía una solicitud de acceso.', 'warn');
      return;
    }
    if (!confirm('¿Restablecer configuración a valores por defecto?')) return;
    var res = global.PlatformAdminTools.resetConfig();
    state.config = global.PlatformStore.getConfig();
    setAdminToolsStatus(res.message, !res.ok);
    loadConfigForm();
  }

  function adminPurgeLogs() {
    if (!confirm('¿Vaciar todo el historial de eventos?')) return;
    global.PlatformAdmin.clearLogs();
    setAdminToolsStatus('Historial vaciado.', false);
    var logsHost = $('logsHost');
    if (logsHost) global.PlatformAdminUI.renderLogs(logsHost);
  }

  function adminWipeAllWebData() {
    if (!userCan('admin.panel')) {
      toastNotify('No tienes permiso para esta acción.', 'warn');
      return;
    }
    if (!global.PlatformAdminTools || !global.PlatformAdminTools.wipeAllWebRegisteredData) {
      toastNotify('Herramienta de limpieza no disponible.', 'warn');
      return;
    }
    if (!confirm(
      '⚠️ PELIGRO — NO TOCAR\n\n' +
      'Esto borrará TODOS los reportes de averías en la nube (celulares + PC) ' +
      'y todos los datos importados del WMS (productividad, operaciones, facturas, despacho).\n\n' +
      'NO se borran usuarios ni configuración.\n\n¿Desea continuar?'
    )) return;
    var typed = prompt('Escriba LIMPIAR (en mayúsculas) para confirmar el borrado total:');
    if (typed !== 'LIMPIAR') {
      setAdminToolsStatus('Cancelado — no escribió LIMPIAR.', true);
      return;
    }
    var btn = document.getElementById('btnNoTocar');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Limpiando…';
    }
    setAdminToolsStatus('Limpiando datos en la web… espere.', false);
    global.PlatformAdminTools.wipeAllWebRegisteredData().then(function (res) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'NO TOCAR';
      }
      setAdminToolsStatus(res.message || 'Listo.', !res.ok || !res.cloudOk);
      if (res.ok) {
        state.dataOperaciones = global.PlatformStore.getPublishedData('operaciones');
        state.dataProductividad = global.PlatformStore.getPublishedData('productividad');
        state.dataDespacho = loadDespachoData();
        destroyCharts();
        renderCurrentModule();
        refreshAdminPanels();
        global.PlatformAdmin.addLog('web_wipe_all', res.cloudOk ? 'nube ok' : 'solo local', logActor());
        if (res.cloudOk) {
          toastNotify('Limpieza completada. La web quedó vacía para nuevos reportes.', 'ok');
        } else {
          toastNotify(res.message || 'Datos locales borrados; revise la conexión a la nube.', 'warn');
        }
      } else {
        toastNotify(res.message || 'No se pudo completar la limpieza.', 'warn');
      }
    }).catch(function (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'NO TOCAR';
      }
      setAdminToolsStatus('Error: ' + (err.message || String(err)), true);
      toastNotify('Error al limpiar la web.', 'warn');
    });
  }

  function validateExcelBeforeImport(inputId, previewId, moduleId) {
    var fileInput = $(inputId);
    if (!fileInput || !fileInput.files[0]) {
      setAdminStatus('Selecciona un archivo primero.', true);
      return;
    }
    var file = fileInput.files[0];
    var check = validateExcelFile(file);
    if (!check.ok) {
      setAdminStatus(check.message, true);
      return;
    }
    if (typeof XLSX === 'undefined') {
      setAdminStatus('SheetJS no cargó. Revisa tu conexión.', true);
      return;
    }
    setAdminStatus('Validando «' + file.name + '»…', false);
    var reader = new FileReader();
    reader.onload = function (ev) {
      var result = global.PlatformAdminTools.validateExcelBuffer(ev.target.result, moduleId, true);
      global.PlatformAdminUI.renderExcelPreview($(previewId), result);
      if (result.ok) {
        setAdminStatus('Archivo válido para «' + moduleId + '». Puede importar y publicar.', false);
      } else {
        setAdminStatus((result.errors && result.errors[0]) || 'Validación fallida.', true);
      }
    };
    reader.onerror = function () { setAdminStatus('No se pudo leer el archivo.', true); };
    reader.readAsArrayBuffer(file);
  }

  function renderChartToggles() {
    /* Gráficos unificados por vista — sin toggles múltiples */
  }

  function applyLayoutFromData(data) {
    if (!data || !state.config) return;
    state.config.generalLayout = data.generalLayout;
    state.config.tvLayout = data.tvLayout;
    if (global.PlatformLayout && global.PlatformLayout.mergeConfigLayout) {
      global.PlatformLayout.mergeConfigLayout(state.config);
    }
    global.PlatformStore.saveConfig(state.config);
    if (state.config.tvMode && global.PlatformTvDashboard) {
      global.PlatformTvDashboard.applyTvSlides(data.tvSlideIds || global.PlatformLayout.getTvSlideIds(state.config));
    }
    renderCurrentModule();
    if (state.config.tvMode && global.PlatformTvDashboard) {
      global.PlatformTvDashboard.startCarousel((state.config.tvRotateSeconds) || 8);
    }
  }

  function renderAdminLayoutPickers() {
    var PL = global.PlatformLayout;
    if (!PL || !state.config) return;
    var genHost = $('adminGeneralLayout');
    var tvHost = $('adminTvLayout');
    if (genHost) {
      genHost.innerHTML = PL.layoutPickerRows(
        state.config.generalLayout,
        PL.CARD_CATALOG,
        PL.DEFAULT_GENERAL_LAYOUT,
        'gen-card'
      );
    }
    if (tvHost) {
      tvHost.innerHTML = PL.layoutPickerRows(
        state.config.tvLayout,
        PL.TV_SLIDE_CATALOG,
        PL.DEFAULT_TV_LAYOUT,
        'tv-slide'
      );
    }
  }

  function readAdminLayoutFromUi() {
    var PL = global.PlatformLayout;
    if (!PL) return null;
    var genList = $('adminGeneralLayout');
    var tvList = $('adminTvLayout');
    var generalLayout = PL.readLayoutFromPicker(genList, 'gen-card', PL.CARD_CATALOG, PL.DEFAULT_GENERAL_LAYOUT);
    var tvLayout = PL.readLayoutFromPicker(tvList, 'tv-slide', PL.TV_SLIDE_CATALOG, PL.DEFAULT_TV_LAYOUT);
    return {
      generalLayout: generalLayout,
      tvLayout: tvLayout,
      tvSlideIds: PL.getTvSlideIds({ tvLayout: tvLayout })
    };
  }

  function bindGeneralLayoutUi(host) {
    if (!host || !global.PlatformLayout || !global.PlatformLayout.bindGeneralCustomize) return;
    global.PlatformLayout.bindGeneralCustomize(host, {
      onSave: function (data) {
        if (!data.tvSlideIds || !data.tvSlideIds.length) {
          toastNotify('Activa al menos una diapositiva de TV.', 'warn');
          return;
        }
        applyLayoutFromData(data);
        toastNotify('Vista personalizada guardada.', 'ok');
      }
    });
  }

  function renderFileHistory() {
    var host = $('adminFileHistory');
    if (!host || !state.config) return;
    var hist = state.config.fileHistory || [];
    if (!hist.length) {
      host.innerHTML = '<p class="admin-hint">Sin importaciones registradas.</p>';
      return;
    }
    host.innerHTML = hist.slice(0, 15).map(function (h) {
      return '<div class="hist-item"><strong>' + esc(h.module) + '</strong> — ' + esc(h.fileName) +
        ' <span>(' + esc(h.rows) + ' filas · ' + esc(PC.formatDateTime(new Date(h.at))) + ')</span></div>';
    }).join('');
  }

  function updateRelayStatusUi(msg, kind) {
    var el = $('configNetworkRelayStatus');
    if (!el) return;
    el.textContent = msg || 'Estado: sin configurar';
    el.className = 'admin-hint small' + (kind === 'ok' ? ' admin-relay-ok' : kind === 'err' ? ' admin-relay-err' : '');
  }

  function readRelayFromUi() {
    return {
      enabled: !!($('configNetworkRelayEnabled') && $('configNetworkRelayEnabled').checked),
      autoRedirect: !($('configNetworkRelayAutoRedirect') && !$('configNetworkRelayAutoRedirect').checked),
      baseUrl: String(($('configNetworkRelayUrl') && $('configNetworkRelayUrl').value) || '').trim()
    };
  }

  function applyNetworkRelayConfig(notify) {
    if (!global.PlatformNetworkRelay) return;
    var relay = readRelayFromUi();
    if (relay.enabled && !relay.baseUrl) {
      if (notify) toastNotify('Escribe la URL del servidor LAN para activar la red privada.', 'warn');
      return false;
    }
    state.config.networkRelay = Object.assign({}, state.config.networkRelay || {}, relay);
    global.PlatformStore.saveConfig(state.config);
    global.PlatformNetworkRelay.saveRelayConfig(state.config.networkRelay);
    global.PlatformNetworkRelay.applyRelayFromConfig();
    global.PlatformNetworkRelay.syncAdminToggleUi();
    if (relay.enabled) {
      updateRelayStatusUi('Estado: red privada activa (invisible para usuarios)', 'ok');
    } else {
      updateRelayStatusUi('Estado: red privada desactivada', '');
    }
    if (notify) {
      toastNotify(relay.enabled ? 'Red privada activada en toda la web.' : 'Red privada desactivada.', 'ok');
    }
    return true;
  }

  function toggleNetworkRelayQuick() {
    if (!userCan('config.save')) {
      toastNotify('Solo el administrador puede controlar la red privada.', 'warn');
      return;
    }
    if (!global.PlatformNetworkRelay) return;
    var relay = state.config.networkRelay || {};
    if (!relay.enabled && !relay.baseUrl) {
      openAdminModal();
      global.PlatformAdminUI && global.PlatformAdminUI.switchTab('config');
      toastNotify('Configura la URL del servidor LAN en Configuración.', 'info');
      return;
    }
    var on = global.PlatformNetworkRelay.toggleRelayEnabled();
    state.config = global.PlatformStore.getConfig();
    global.PlatformNetworkRelay.syncAdminToggleUi();
    toastNotify(on ? 'Red privada activada.' : 'Red privada desactivada.', 'ok');
    updateRelayStatusUi(on ? 'Estado: red privada activa (invisible para usuarios)' : 'Estado: red privada desactivada', on ? 'ok' : '');
  }

  function detectRelayUrl() {
    fetch('/api/relay/discover').then(function (res) { return res.json(); }).then(function (body) {
      if (!body.ok || !body.suggested || !body.suggested.length) throw new Error('Sin servidor LAN');
      if ($('configNetworkRelayUrl')) $('configNetworkRelayUrl').value = body.suggested[0];
      updateRelayStatusUi('Detectado: ' + body.suggested[0], 'ok');
      toastNotify('Servidor LAN detectado.', 'ok');
    }).catch(function () {
      updateRelayStatusUi('No se detectó servidor. Enciende serve-dashboard.ps1', 'err');
      toastNotify('Enciende serve-dashboard.ps1 en este equipo.', 'warn');
    });
  }

  function testRelayUrl() {
    var url = String(($('configNetworkRelayUrl') && $('configNetworkRelayUrl').value) || '').trim();
    if (!url) {
      toastNotify('Escribe la URL del servidor LAN.', 'warn');
      return;
    }
    if (!global.PlatformNetworkRelay) return;
    updateRelayStatusUi('Probando conexión…', '');
    global.PlatformNetworkRelay.probeRelayUrl(url).then(function () {
      updateRelayStatusUi('Conexión OK · ' + url, 'ok');
      toastNotify('Servidor LAN responde correctamente.', 'ok');
    }).catch(function () {
      updateRelayStatusUi('No responde · revisa URL y firewall', 'err');
      toastNotify('No se pudo conectar al servidor LAN.', 'err');
    });
  }

  function loadConfigForm() {
    if (!state.config || !userCan('config.save')) return;
    var refreshInput = $('refreshSeconds');
    if (refreshInput) refreshInput.value = state.config.refreshSeconds || 20;
    var themeSel = $('configTheme');
    if (themeSel) themeSel.value = state.config.theme || 'dark';
    var tvCb = $('configTvDefault');
    if (tvCb) tvCb.checked = !!state.config.tvMode;
    var tvRot = $('tvRotateSeconds');
    if (tvRot) tvRot.value = state.config.tvRotateSeconds || 8;
    var oa = state.config.openai || {};
    if ($('openaiEnabled')) $('openaiEnabled').checked = !!oa.enabled;
    if ($('openaiApiKey')) $('openaiApiKey').value = oa.apiKey || '';
    if ($('openaiModel')) $('openaiModel').value = oa.model || 'gpt-4o-mini';
    populateAiVoiceSelect();
    renderChartToggles();
    renderFileHistory();
    renderAdminLayoutPickers();
    syncAiModeBadge();
    var relay = state.config.networkRelay || {};
    if ($('configNetworkRelayEnabled')) $('configNetworkRelayEnabled').checked = !!relay.enabled;
    if ($('configNetworkRelayAutoRedirect')) $('configNetworkRelayAutoRedirect').checked = relay.autoRedirect !== false;
    if ($('configNetworkRelayUrl')) $('configNetworkRelayUrl').value = relay.baseUrl || '';
    if (relay.enabled && relay.baseUrl) {
      updateRelayStatusUi('Estado: red privada activa (invisible para usuarios)', 'ok');
    } else if (relay.baseUrl) {
      updateRelayStatusUi('Estado: configurada · inactiva', '');
    } else {
      updateRelayStatusUi('Estado: sin configurar', '');
    }
    if (global.PlatformNetworkRelay) global.PlatformNetworkRelay.syncAdminToggleUi();
  }

  function populateAiVoiceSelect() {
    var sel = $('aiVoiceSelect');
    if (!sel) return;
    var selected = state.config && state.config.aiVoiceURI ? state.config.aiVoiceURI : '';
    var voices = [];
    try {
      voices = global.speechSynthesis && global.speechSynthesis.getVoices
        ? global.speechSynthesis.getVoices()
        : [];
    } catch (e) {
      voices = [];
    }
    var spanish = voices.filter(function (v) { return /^es(-|_)?/i.test(v.lang || ''); });
    var list = spanish.length ? spanish : voices;
    sel.innerHTML = '<option value="">Automática (español)</option>' + list.map(function (v) {
      return '<option value="' + esc(v.voiceURI) + '">' + esc(v.name + ' · ' + (v.lang || '')) + '</option>';
    }).join('');
    sel.value = selected;
  }

  function renderSubnav() {
    var sub = $('navSubmodules');
    var label = $('subnavLabel');
    if (!sub || !state.config) return;
    var mod = getActiveModule();
    var html = '';

    if (mod === 'productividad') {
      Object.keys(PROD_VIEWS).forEach(function (id) {
        var v = PROD_VIEWS[id];
        html += '<li><button type="button" data-prod-view="' + esc(id) + '"' +
          (state.config.productividadView === id ? ' class="active"' : '') + '>' + esc(v.title) + '</button></li>';
      });
    } else if (mod === 'operaciones') {
      Object.keys(OPS_VIEWS).forEach(function (id) {
        var v = OPS_VIEWS[id];
        html += '<li><button type="button" data-ops-view="' + esc(id) + '"' +
          ((state.config.operacionesView || 'resumen') === id ? ' class="active"' : '') + '>' + esc(v.title) + '</button></li>';
      });
    } else if (mod === 'despacho') {
      var canVal = state.user && global.PlatformAdmin && global.PlatformAdmin.can(state.user.role, 'despacho.validate', state.user);
      Object.keys(DESP_VIEWS).forEach(function (id) {
        if (id === 'validador' && !canVal) return;
        var v = DESP_VIEWS[id];
        var activeDesp = state.config.despachoView || (canVal ? 'combinado' : 'preparador');
        html += '<li><button type="button" data-desp-view="' + esc(id) + '"' +
          (activeDesp === id ? ' class="active"' : '') + '>' + esc(v.title) + '</button></li>';
      });
    }

    sub.innerHTML = html;
    var show = html.length > 0;
    sub.hidden = !show;
    if (label) label.hidden = !show;

    sub.querySelectorAll('[data-prod-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.config.productividadView = btn.getAttribute('data-prod-view');
        global.PlatformStore.saveConfig(state.config);
        renderSubnav();
        destroyCharts();
        renderCurrentModule();
      });
    });
    sub.querySelectorAll('[data-ops-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.config.operacionesView = btn.getAttribute('data-ops-view');
        global.PlatformStore.saveConfig(state.config);
        renderSubnav();
        destroyCharts();
        renderCurrentModule();
      });
    });
    sub.querySelectorAll('[data-desp-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.config.despachoView = btn.getAttribute('data-desp-view');
        global.PlatformStore.saveConfig(state.config);
        renderSubnav();
        renderDespachoModule();
      });
    });

    if (global.PlatformGestures && global.PlatformGestures.initNavTouch) {
      global.PlatformGestures.initNavTouch(sub);
    }
  }

  function switchModule(mod) {
    var detailModules = { operaciones: 1, facturas: 1, productividad: 1, reportes: 1, despacho: 1 };
    if (state.config && state.config.tvMode && mod !== 'general') {
      if (detailModules[mod]) {
        pauseTvMode();
        var labels = global.PlatformStore.MODULE_LABELS || {};
        toastNotify('Modo TV pausado — abriendo ' + (labels[mod] || mod), 'info');
      } else {
        toastNotify('En Modo TV permanece el dashboard general. Pulsa Esc para salir.', 'info');
        mod = 'general';
      }
    }
    if (mod === 'operaciones') {
      state.dataOperaciones = applyOperacionesFilters(global.PlatformStore.getPublishedData('operaciones'));
    } else if (mod === 'facturas') {
      state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
    } else if (mod === 'despacho') {
      state.dataDespacho = loadDespachoData();
    }
    state.config.activeModule = mod;
    global.PlatformStore.saveConfig(state.config);
    document.querySelectorAll('.nav-module-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-module') === mod);
    });
    document.querySelectorAll('.module-view').forEach(function (v) {
      v.classList.toggle('active', v.getAttribute('data-module') === mod);
    });
    document.body.classList.toggle('ops-dash-view',
      mod === 'operaciones' && (state.config.operacionesView || 'resumen') === 'resumen');
    document.body.classList.toggle('facturas-dash-view', mod === 'facturas');
    document.body.classList.toggle('despacho-dash-view', mod === 'despacho');
    document.body.classList.toggle('general-panel-view', mod === 'general' && !(state.config && state.config.tvMode));
    var titles = global.PlatformStore.MODULE_LABELS || {};
    if ($('dashboardTitle')) {
      $('dashboardTitle').textContent = titles[mod] || mod;
    }
    if ($('dashboardSubtitle') && !(state.config && state.config.tvMode)) {
      setPublishedSyncSubtitle();
    }
    updateFiltersBarForModule();
    updateDataStatusChips();
    renderSubnav();
    destroyCharts();
    renderCurrentModule();
    syncTvUnifiedPresentation();
    syncOpsTvPresentation();
    syncFacturasTvPresentation();
    if (mod !== 'operaciones' && global.PlatformOpsVoiceAlerts) {
      global.PlatformOpsVoiceAlerts.stop();
    }
  }

  function renderCurrentModule() {
    var mod = getActiveModule();
    var meta = getViewMeta();
    if (state.config && state.config.tvMode) {
      if (mod !== 'general') {
        pauseTvMode();
        mod = getActiveModule();
      }
      if (state.config && state.config.tvMode) {
        renderTvUnifiedDashboard();
        if (global.PlatformTvDashboard) {
          global.PlatformTvDashboard.stopCarousel();
          global.PlatformTvDashboard.startCarousel((state.config && state.config.tvRotateSeconds) || 8);
        }
        updateSyncLabel(state.dataOperaciones || state.dataFacturas);
        return;
      }
    }
    if (mod === 'general') {
      var genHost = $('module-general');
      global.PlatformModules.renderGeneral(genHost, {
        operaciones: state.dataOperaciones,
        productividad: state.dataProductividad,
        facturas: state.dataFacturas,
        tipoCambio: state.config.facturasTipoCambio,
        config: state.config,
        meta: meta
      });
      if (global.PlatformCommandCenter && genHost && genHost._ccModel) {
        global.PlatformCommandCenter.renderCharts(genHost, genHost._ccModel, state.charts);
      }
      if (global.PlatformGestures && genHost) {
        global.PlatformGestures.initGeneralDashboard(genHost, {
          onNavigateModule: function (m) {
            switchModule(m);
            document.body.classList.remove('sidebar-open');
          }
        });
      }
      if (PC && PC.initGestures) PC.initGestures(genHost);
      updateSyncLabel(state.dataOperaciones || state.dataFacturas);
      return;
    }
    if (mod === 'productividad') {
      var view = state.config.productividadView || 'resumen';
      global.PlatformModules.renderProductividad(
        $('module-productividad'),
        state.dataProductividad,
        view,
        state.charts,
        function (_canvas, data, viewId) {
          renderProductividadExecutive(data, viewId);
        },
        meta
      );
      updateSyncLabel(state.dataProductividad);
      return;
    }
    if (mod === 'operaciones') {
      renderOperacionesModule();
      updateSyncLabel(state.dataOperaciones);
      return;
    }
    if (mod === 'facturas') {
      renderFacturasModule();
      updateSyncLabel(state.dataFacturas);
      return;
    }
    if (mod === 'despacho') {
      renderDespachoModule();
      updateSyncLabel(state.dataDespacho);
      return;
    }
    if (mod === 'reportes') {
      var renderReportesView = function () {
        global.PlatformModules.renderReportes($('module-reportes'), {
          operaciones: state.dataOperaciones,
          facturas: state.dataFacturas,
          productividad: state.dataProductividad,
          tipoCambio: state.config.facturasTipoCambio
        });
        bindReportExportButtons();
      };
      if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.ready) {
        global.PlatformAveriasCloudSync.ready().then(function () {
          if (global.PlatformAveriasCloudSync.pull) {
            return global.PlatformAveriasCloudSync.pull();
          }
        }).then(renderReportesView).catch(renderReportesView);
      } else {
        renderReportesView();
      }
      return;
    }
  }

  function bindReportExportButtons() {
    bindOnce($('btnReportExportPdf'), 'click', function () {
      var data = state.dataOperaciones || state.dataProductividad;
      global.PlatformExport.exportReportPdf(data, 'reporte_wms.pdf', 'Almacén Central 001');
    });
    bindOnce($('btnReportExportTxt'), 'click', function () {
      var data = state.dataOperaciones || state.dataProductividad;
      global.PlatformExport.exportReportTxt(data, 'reporte_wms.txt', 'Almacén Central 001');
    });
  }

  function emptyDataHtml() {
    return '<div class="widget span-12 empty-state"><p>Sin datos publicados. Un administrador debe importar el Excel desde <strong>Panel administración → Datos Excel</strong>.</p></div>';
  }

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + esc(cls) + '"><div class="kpi-value">' + esc(value) +
      '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function renderDespachoModule() {
    var host = $('module-despacho');
    if (!host || !global.PlatformDespachoUI) return;
    document.body.classList.add('desp-controller-mode');
    state.dataDespacho = loadDespachoData();
    var role = state.user ? state.user.role : '';
    var canValidate = global.PlatformAdmin && global.PlatformAdmin.can(role, 'despacho.validate', state.user);
    var view = state.config.despachoView || (canValidate ? 'combinado' : 'preparador');
    var despachoArea = view === 'validador' ? 'validador' : 'preparador';
    if (despachoArea === 'validador' && !canValidate) {
      despachoArea = 'preparador';
      view = 'preparador';
      state.config.despachoView = 'preparador';
    }
    var savedScreen = state.config.despachoScreen || 'registro';
    if (savedScreen === 'lista') savedScreen = 'validador';
    if (despachoArea === 'preparador' && savedScreen === 'validador') savedScreen = 'registro';
    if (despachoArea === 'validador') savedScreen = 'validador';
    state.config.despachoScreen = savedScreen;
    global.PlatformStore.saveConfig(state.config);

    global.PlatformDespachoUI.render(host, state.dataDespacho, {
      user: state.user,
      canValidate: despachoArea === 'validador',
      despachoArea: despachoArea,
      screen: savedScreen,
      onScreenChange: function (s) {
        state.config.despachoScreen = s;
        global.PlatformStore.saveConfig(state.config);
      }
    });

    if ($('dashboardTitle')) $('dashboardTitle').textContent = 'Despacho — Preparador y Validador';
    if ($('dashboardSubtitle')) {
      $('dashboardSubtitle').innerHTML = 'Flujo: preparación → facturación → validación → despacho · <span id="lastSync">' +
        esc(state.dataDespacho && state.dataDespacho.updatedAt
          ? PC.formatDateTime(new Date(state.dataDespacho.updatedAt))
          : '—') + '</span>';
    }
  }

  function renderFacturasModule() {
    var host = $('module-facturas');
    if (!host || !global.PlatformFacturasUI) return;
    var role = state.user ? state.user.role : '';
    var canImport = global.PlatformAdmin && global.PlatformAdmin.can(role, 'data.import', state.user);
    var canEditMetas = global.PlatformAdmin && global.PlatformAdmin.can(role, 'config.save', state.user);

    global.PlatformFacturasUI.render(host, state.dataFacturas, {
      canImport: canImport,
      canEditMetas: canEditMetas,
      facturasMetas: state.config.facturasMetas || {},
      tipoCambio: state.config.facturasTipoCambio,
      filters: state.facturasFilters,
      onFilterChange: function (f) {
        state.facturasFilters = f;
        state.dataFacturas = applyFacturasFilters(global.PlatformStore.getPublishedData('facturas'));
        renderFacturasModule();
      },
      onSaveMetas: function (metas, tc) {
        state.config.facturasMetas = metas;
        state.config.facturasTipoCambio = tc;
        global.PlatformStore.saveConfig(state.config);
        renderFacturasModule();
        if (state.config && state.config.tvMode) {
          renderTvUnifiedDashboard();
          if (global.PlatformTvDashboard) {
            global.PlatformTvDashboard.stopCarousel();
            global.PlatformTvDashboard.startCarousel((state.config.tvRotateSeconds) || 8);
          }
        }
        toastNotify('Metas de facturas guardadas.', 'ok');
      },
      onRendered: function (data) {
        var chartHost = document.querySelector('#facDashboard .fac-charts-premium');
        if (chartHost) bindFacturasExecutiveChart(chartHost);
        syncFacturasTvPresentation();
      }
    });

    if ($('dashboardTitle')) $('dashboardTitle').textContent = 'Facturas — Diario del cliente';
  }

  function paintFacturasExecutiveChart(host, kind) {
    if (!host || !state.dataFacturas || !global.PlatformExecutiveCharts) return;
    var FX = global.PlatformExcelFacturas;
    var tc = FX.resolveTipoCambio(state.config.facturasTipoCambio);
    var view = FX.enrichAggregatesForDisplay(state.dataFacturas.aggregates, tc);
    var compliance = FX.buildMetasCompliance(state.dataFacturas.aggregates.porAlmacen, state.config.facturasMetas || {}, tc);
    var EC = global.PlatformExecutiveCharts;
    var meta = EC.getFacturasMeta ? EC.getFacturasMeta(kind || 'ventas', view.porAlmacen, compliance) : EC.facturasGerencialMeta(view.porAlmacen, compliance);
    var signalsEl = host.querySelector('.fac-vis-signals');
    if (signalsEl && EC.facturasVisualSignals) {
      signalsEl.outerHTML = EC.facturasVisualSignals(view.porAlmacen, compliance, kind || 'ventas');
    }
    EC.renderFromMeta(state.charts, meta, {
      tvMode: document.body.classList.contains('tv-mode'),
      noDataLabels: true,
      facVisual: true
    });
  }

  function bindFacturasExecutiveChart(host) {
    if (!host) return;
    paintFacturasExecutiveChart(host, 'ventas');
    host.querySelectorAll('.exec-chart-tab').forEach(function (btn) {
      if (btn.dataset.facChartBound === '1') return;
      btn.dataset.facChartBound = '1';
      btn.addEventListener('click', function () {
        host.querySelectorAll('.exec-chart-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        paintFacturasExecutiveChart(host, btn.getAttribute('data-fac-chart'));
      });
    });
  }

  function renderFacturasCharts(data) {
    var host = document.querySelector('#facDashboard .fac-charts-premium');
    if (host) paintFacturasExecutiveChart(host, 'ventas');
  }

  function renderOperacionesModule() {
    var host = $('module-operaciones');
    if (!host || !global.PlatformOperacionesUI) return;
    var view = state.config.operacionesView || 'resumen';
    var data = state.dataOperaciones;
    var f = state.config.filters || {};

    global.PlatformOperacionesUI.render(host, data, view, {
      filters: f,
      tableFilters: state.operacionesTableFilters,
      onDateFilter: function (patch) {
        state.config.filters = Object.assign({}, state.config.filters, patch);
        global.PlatformStore.saveConfig(state.config);
        applyFilters();
      },
      onTableFilterChange: function (tblF) {
        state.operacionesTableFilters = tblF;
        renderOperacionesModule();
      },
      onDashboardRendered: function (model, measurement) {
        state._opsDashboardModel = model;
        state._opsMeasurement = measurement || null;
        renderOpsDashboardCharts(model, measurement);
        syncOpsTvPresentation();
        if (global.PlatformOpsVoiceAlerts) {
          global.PlatformOpsVoiceAlerts.sync(model.processUserAlerts || []);
        }
      },
      getExportData: function (d) {
        var tf = state.operacionesTableFilters || {};
        if (!tf.usuario && !tf.estado && !tf.ubicacion && !tf.tipoTrabajo && !tf.search) return d;
        if (!d.registros) return d;
        var regs = global.PlatformOperacionesUI.filterTableRows(d.registros, tf);
        return Object.assign({}, d, {
          registros: regs,
          aggregates: global.PlatformExcelOperaciones.buildAggregates(regs)
        });
      },
      bindExecutiveOpsChart: bindExecutiveOpsChart
    });

    var v = OPS_VIEWS[view];
    if ($('dashboardTitle') && v) {
      $('dashboardTitle').textContent = view === 'resumen' ? 'Operaciones' : v.title;
    }
  }

  function renderOpsDashboardCharts(model, measurement) {
    if (!model || !global.PlatformExecutiveCharts) return;
    var EC = global.PlatformExecutiveCharts;
    var tv = document.body.classList.contains('tv-mode');
    measurement = measurement || state._opsMeasurement;
    var meta = EC.operacionesEvolucionMeta(model);
    if (global.PlatformOperationalInsights) {
      global.PlatformOperationalInsights.attachToMeta(meta, 'operaciones', 'resumen', {
        model: model,
        measurement: measurement
      });
    }
    EC.renderFromMeta(state.charts, meta, { tvMode: tv, biChart: true });
    var metaDesk = EC.operacionesEvolucionMeta(model);
    metaDesk.canvasId = 'chartOpsExecutiveDesktop';
    if ($('chartOpsExecutiveDesktop')) {
      EC.renderFromMeta(state.charts, metaDesk, { tvMode: tv, biChart: true });
    }
  }

  function paintExecutiveOpsChart(host, data, kind) {
    if (!host || !data || !data.aggregates || !global.PlatformExecutiveCharts) return;
    var EC = global.PlatformExecutiveCharts;
    var meta = EC.getOperacionesGraficosMeta
      ? EC.getOperacionesGraficosMeta(kind || 'fecha', data.aggregates, state._opsDashboardModel)
      : EC.operacionesAggMeta(data.aggregates, kind || 'fecha');
    meta.eyebrow = 'Operaciones';
    var header = host.querySelector('.exec-chart-header');
    if (header) {
      var titleEl = header.querySelector('.exec-chart-title');
      var subEl = header.querySelector('.exec-chart-subtitle');
      var listEl = header.querySelector('.exec-chart-insights');
      var improvePanel = host.querySelector('.exec-improve-panel');
      if (titleEl) titleEl.textContent = meta.title || '';
      if (subEl) subEl.textContent = meta.subtitle || '';
      if (listEl && meta.insights) {
        listEl.innerHTML = meta.insights.map(function (line) { return '<li>' + line + '</li>'; }).join('');
      }
      if (global.PlatformOperationalInsights && meta.improvements) {
        if (improvePanel) {
          improvePanel.outerHTML = global.PlatformOperationalInsights.ideasHtml(meta.improvements);
        } else {
          host.insertAdjacentHTML('beforeend', global.PlatformOperationalInsights.ideasHtml(meta.improvements));
        }
      }
    }
    EC.renderFromMeta(state.charts, meta);
  }

  function bindExecutiveOpsChart(host, data) {
    if (!host) return;
    paintExecutiveOpsChart(host, data, 'fecha');
    host.querySelectorAll('.exec-chart-tab').forEach(function (btn) {
      if (btn.dataset.opsChartBound === '1') return;
      btn.dataset.opsChartBound = '1';
      btn.addEventListener('click', function () {
        host.querySelectorAll('.exec-chart-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        paintExecutiveOpsChart(host, data, btn.getAttribute('data-ops-chart'));
      });
    });
  }

  function chartOpts(c) {
    return {
      scales: {
        x: { ticks: { color: c.text, maxRotation: 45 } },
        y: { ticks: { color: c.text }, grid: { color: c.grid } }
      },
      plugins: { legend: { labels: { color: c.text } } }
    };
  }

  function renderProductividadExecutive(data, viewId) {
    if (!data || !global.PlatformExecutiveCharts) return;
    var EC = global.PlatformExecutiveCharts;
    var meta = EC.getProductividadMeta
      ? EC.getProductividadMeta(viewId, data)
      : EC.productividadFechaMeta(data);
    EC.renderFromMeta(state.charts, meta);
  }

  function chartColors() {
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
      text: dark ? '#93a8bc' : '#526880',
      grid: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,36,64,0.1)',
      tick: dark ? '#a8bdd0' : '#6b8299'
    };
  }

  function applyChart3d(cfg, extra) {
    if (!cfg) return cfg;
    extra = extra || {};
    cfg.options = cfg.options || {};
    var c = chartColors();
    c.muted = c.tick;
    c.text = c.tick;
    if (global.ChartPremiumStyle) {
      global.ChartPremiumStyle.register();
      try {
        if (cfg.data) {
          cfg.data = global.ChartPremiumStyle.enhanceDatasets(
            JSON.parse(JSON.stringify(cfg.data)),
            cfg.type,
            c,
            extra
          );
        }
      } catch (e) { /* keep original data */ }
      global.ChartPremiumStyle.mergeOptions(cfg.options, c, extra);
    }
    return cfg;
  }

  function renderChartsResumen(data) {
    if (typeof Chart === 'undefined') return;
    var c = chartColors();
    var est = data.bd.resumen.porEstado || {};
    var labels = Object.keys(est);
    var canvas = $('chartEstado');
    if (canvas && labels.length) {
      state.charts.estado = new Chart(canvas, applyChart3d({
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{ data: labels.map(function (k) { return est[k]; }), backgroundColor: ['#5eb3ff', '#3dd39a', '#ffd166', '#ff6b7a'] }]
        },
        options: { plugins: { legend: { labels: { color: c.text } } } }
      }));
    }
    var areas = data.bDTD.porAreaAbiertos || {};
    var aLabels = Object.keys(areas);
    var canvas2 = $('chartArea');
    if (canvas2 && aLabels.length) {
      state.charts.area = new Chart(canvas2, applyChart3d({
        type: 'bar',
        data: { labels: aLabels, datasets: [{ label: 'Abiertos', data: aLabels.map(function (k) { return areas[k]; }), backgroundColor: '#5eb3ff' }] },
        options: { scales: { x: { ticks: { color: c.text } }, y: { ticks: { color: c.text }, grid: { color: c.grid } } }, plugins: { legend: { display: false } } }
      }));
    }
  }

  function renderChartBar(canvasId, items, labelKey, valueKey) {
    if (typeof Chart === 'undefined' || !items || !items.length) return;
    var canvas = $(canvasId);
    if (!canvas) return;
    var c = chartColors();
    var labels = items.map(function (x) { return x[labelKey]; });
    var values = items.map(function (x) { return x[valueKey]; });
    state.charts[canvasId] = new Chart(canvas, applyChart3d({
      type: 'bar',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: '#5eb3ff' }] },
      options: { indexAxis: 'y', scales: { x: { ticks: { color: c.text }, grid: { color: c.grid } }, y: { ticks: { color: c.text } } }, plugins: { legend: { display: false } } }
    }));
  }

  function renderChartLineFecha(porFecha) {
    if (typeof Chart === 'undefined' || !porFecha || !porFecha.length) return;
    var canvas = $('chartFecha');
    if (!canvas) return;
    var c = chartColors();
    var labels = porFecha.map(function (x) { return x.fecha; });
    state.charts.chartFecha = new Chart(canvas, applyChart3d({
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Abiertos', data: porFecha.map(function (x) { return x.abiertos; }), borderColor: '#5eb3ff', tension: 0.3 },
          { label: 'En proceso', data: porFecha.map(function (x) { return x.enProceso; }), borderColor: '#3dd39a', tension: 0.3 }
        ]
      },
      options: { scales: { x: { ticks: { color: c.text } }, y: { ticks: { color: c.text }, grid: { color: c.grid } } }, plugins: { legend: { labels: { color: c.text } } } }
    }));
  }

  function updateSyncLabel(iso) {
    var el = $('lastSync');
    if (el) el.textContent = iso ? PC.formatDateTime(new Date(iso)) : '—';
  }

  /* ——— Filtros ——— */

  function bindFilters() {
    var ops = state.dataOperaciones;
    if (ops && ops.meta && global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.isControlData(ops)) {
      fillSelect('filterUsuario', ops.meta.usuarios);
      fillSelect('filterUbicacion', ops.meta.ubicaciones);
      fillSelect('filterTipoTrabajo', ops.meta.tiposTrabajo);
      fillSelect('filterEstado', ops.meta.estados);
    } else if (ops && ops.meta) {
      fillSelect('filterArea', ops.meta.areas);
      fillSelect('filterTipo', ops.meta.tipos);
      fillSelect('filterEstado', ops.meta.estados);
    }
    var prod = state.dataProductividad;
    if (prod && prod.meta) {
      fillSelect('filterEmpleado', prod.meta.empleados);
    }
    var f = state.config.filters || {};
    if ($('filterFechaDesde')) $('filterFechaDesde').value = f.fechaDesde || '';
    if ($('filterFechaHasta')) $('filterFechaHasta').value = f.fechaHasta || '';
    if ($('filterUsuario')) $('filterUsuario').value = f.usuario || '';
    if ($('filterUbicacion')) $('filterUbicacion').value = f.ubicacion || '';
    if ($('filterTipoTrabajo')) $('filterTipoTrabajo').value = f.tipoTrabajo || '';
    if ($('filterArea')) $('filterArea').value = f.area || '';
    if ($('filterTipo')) $('filterTipo').value = f.tipoOrden || '';
    if ($('filterEstado')) $('filterEstado').value = f.estado || '';
    if ($('filterEmpleado')) $('filterEmpleado').value = f.empleado || '';
    bindOnce($('btnApplyFilters'), 'click', applyFilters);
    bindOnce($('btnClearFilters'), 'click', clearFilters);
  }

  function fillSelect(id, options) {
    var sel = $(id);
    if (!sel || !options) return;
    var placeholder = sel.options[0] ? sel.options[0].cloneNode(true) : null;
    sel.innerHTML = '';
    if (placeholder) sel.appendChild(placeholder);
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      sel.appendChild(o);
    });
  }

  function getFiltersFromUi() {
    return {
      fechaDesde: $('filterFechaDesde') ? $('filterFechaDesde').value : '',
      fechaHasta: $('filterFechaHasta') ? $('filterFechaHasta').value : '',
      usuario: $('filterUsuario') ? $('filterUsuario').value : '',
      ubicacion: $('filterUbicacion') ? $('filterUbicacion').value : '',
      tipoTrabajo: $('filterTipoTrabajo') ? $('filterTipoTrabajo').value : '',
      area: $('filterArea') ? $('filterArea').value : '',
      tipoOrden: $('filterTipo') ? $('filterTipo').value : '',
      estado: $('filterEstado') ? $('filterEstado').value : '',
      empleado: $('filterEmpleado') ? $('filterEmpleado').value : ''
    };
  }

  function applyFilters() {
    if (!state.config) return;
    state.config.filters = getFiltersFromUi();
    global.PlatformStore.saveConfig(state.config);
    state.dataOperaciones = applyOperacionesFilters(global.PlatformStore.getPublishedData('operaciones'));
    state.dataProductividad = applyProductividadFilters(global.PlatformStore.getPublishedData('productividad'));
    destroyCharts();
    updateFiltersBarForModule();
    renderCurrentModule();
    toastNotify('Filtros aplicados.', 'ok');
  }

  function clearFilters() {
    ['filterFechaDesde', 'filterFechaHasta', 'filterUsuario', 'filterUbicacion', 'filterTipoTrabajo',
      'filterArea', 'filterTipo', 'filterEstado', 'filterEmpleado'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    state.config.filters = {
      fechaDesde: '', fechaHasta: '', usuario: '', ubicacion: '', tipoTrabajo: '',
      area: '', tipoOrden: '', estado: '', empleado: ''
    };
    state.operacionesTableFilters = {};
    global.PlatformStore.saveConfig(state.config);
    state.dataOperaciones = global.PlatformStore.getPublishedData('operaciones');
    state.dataProductividad = global.PlatformStore.getPublishedData('productividad');
    destroyCharts();
    renderCurrentModule();
    toastNotify('Filtros restablecidos.', 'info');
  }

  /* ——— Administración ——— */

  function setAdminStatus(msg, isErr, alsoToast) {
    var el = $('adminStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg show ' + (isErr ? 'err' : 'ok');
    if (alsoToast && msg) toastNotify(msg, isErr ? 'err' : 'ok');
  }

  function setOpenaiStatus(msg, isErr) {
    var el = $('openaiStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-msg show ' + (isErr ? 'err' : 'ok');
  }

  function validateExcelFile(file) {
    if (!file) return { ok: false, message: 'No se seleccionó archivo.' };
    var name = (file.name || '').toLowerCase();
    if (!/\.(xlsx|xls)$/.test(name)) return { ok: false, message: 'Solo archivos .xlsx o .xls.' };
    if (file.size > EXCEL_MAX_BYTES) return { ok: false, message: 'El archivo supera 15 MB.' };
    return { ok: true };
  }

  function importExcelFile(file, forcedModule) {
    var check = validateExcelFile(file);
    if (!check.ok) {
      setAdminStatus(check.message, true, true);
      return;
    }
    if (typeof XLSX === 'undefined') {
      setAdminStatus('SheetJS no cargó. Revisa tu conexión.', true, true);
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var wb = XLSX.read(ev.target.result, { type: 'array' });
        var detected = global.PlatformExcel.detectWorkbookType(wb);
        if (forcedModule && detected !== forcedModule) {
          setAdminStatus('Advertencia: el archivo parece tipo «' + detected + '». Se importará como «' + forcedModule + '» porque eligió ese botón.', false);
        }
        var payload = forcedModule
          ? global.PlatformExcel.importForModule(wb, file.name, forcedModule)
          : global.PlatformExcel.importWorkbookAuto(wb, file.name);
        global.PlatformStore.publishData(payload, payload.module);
        var rowCount = payload.registros ? payload.registros.length
          : (payload.celdas ? payload.celdas.length : (payload.bd && payload.bd.registros ? payload.bd.registros.length : 0));
        global.PlatformStore.pushFileHistory({
          module: payload.module,
          fileName: file.name,
          rows: rowCount
        });
        if (payload.module === 'productividad') {
          state.dataProductividad = applyProductividadFilters(payload);
          setAdminStatus('Productividad importada: ' + (payload.meta.empleados || []).length + ' empleados · ' + rowCount + ' celdas.', false, true);
        } else if (payload.module === 'facturas') {
          state.dataFacturas = applyFacturasFilters(payload);
          var tcImp = global.PlatformExcelFacturas.resolveTipoCambio(state.config.facturasTipoCambio);
          var kf = global.PlatformExcelFacturas.buildKpis(payload, tcImp);
          setAdminStatus('Facturas importadas: ' + rowCount + ' facturas · ' + kf.ordenes + ' órdenes · RD$ ' +
            global.PlatformExcelFacturas.formatMillions(kf.ventasPesos) +
            (kf.tieneUsd ? ' (incl. USD→RD$ tasa ' + tcImp + ')' : '') +
            (kf.skippedDuplicates ? ' · ' + kf.skippedDuplicates + ' dup. omitidos' : '') + '.', false, true);
        } else {
          state.dataOperaciones = applyOperacionesFilters(payload);
          setAdminStatus('Operaciones importadas: ' + rowCount + ' registros.', false, true);
        }
        global.PlatformAdmin.addLog('import_excel_' + payload.module, file.name, logActor());
        destroyCharts();
        updateFiltersBarForModule();
        updateDataStatusChips();
        bindFilters();
        renderCurrentModule();
        runAiNarrative();
      } catch (err) {
        setAdminStatus('Error al leer el Excel: ' + (err.message || err), true, true);
      }
    };
    reader.onerror = function () {
      setAdminStatus('No se pudo leer el archivo.', true);
    };
    reader.readAsArrayBuffer(file);
  }

  function bindExcelDropZone(zoneId, inputId, nameId, moduleId, btnId) {
    var dropZone = $(zoneId);
    var fileInput = $(inputId);
    if (!dropZone || !fileInput) return;
    bindOnce(dropZone, 'click', function () { fileInput.click(); });
    bindOnce(dropZone, 'dragover', function (ev) {
      ev.preventDefault();
      dropZone.classList.add('dragover');
    });
    bindOnce(dropZone, 'dragleave', function () { dropZone.classList.remove('dragover'); });
    bindOnce(dropZone, 'drop', function (ev) {
      ev.preventDefault();
      dropZone.classList.remove('dragover');
      if (ev.dataTransfer.files[0]) importExcelFile(ev.dataTransfer.files[0], moduleId);
    });
    bindOnce(fileInput, 'change', function () {
      var nameEl = $(nameId);
      if (nameEl && fileInput.files[0]) nameEl.textContent = fileInput.files[0].name;
    });
    if (btnId) {
      bindOnce($(btnId), 'click', function () {
        if (!fileInput.files[0]) {
          setAdminStatus('Selecciona un archivo .xlsx para ' + moduleId + '.', true);
          return;
        }
        importExcelFile(fileInput.files[0], moduleId);
      });
    }
  }

  function refreshAdminTables() {
    populateAgendaPuestoSelect();
    var staffHost = $('staffUsersHost');
    if (userCan('users.manage') && global.PlatformAdminUI.renderUsersPanel) {
      global.PlatformAdminUI.renderUsersPanel(
        null,
        staffHost,
        loadUserForEdit,
        deleteUserConfirm
      );
    }
    var areasHost = $('areasTableHost');
    if (areasHost && userCan('areas.manage')) {
      global.PlatformAdminUI.renderAreasTable(areasHost, loadAreaForEdit, deleteAreaConfirm);
    }
    var logsHost = $('logsHost');
    if (logsHost) global.PlatformAdminUI.renderLogs(logsHost);
  }

  function resetStaffUserForm() {
    var form = $('userForm');
    if (form) form.reset();
    if ($('userEditId')) $('userEditId').value = '';
    if ($('userRole')) $('userRole').value = 'colaborador';
    if ($('userAgendaPuesto')) $('userAgendaPuesto').value = '';
    if ($('userUsername')) $('userUsername').disabled = false;
    if ($('userRole')) $('userRole').disabled = false;
    var cancelBtn = $('btnCancelUserEdit');
    if (cancelBtn) cancelBtn.hidden = true;
    var saveBtn = $('btnSaveUser');
    if (saveBtn) saveBtn.textContent = 'Guardar usuario';
  }

  function populateAgendaPuestoSelect() {
    var sel = $('userAgendaPuesto');
    if (!sel || !global.PlatformAdmin || !global.PlatformAdmin.AGENDA_PUESTO_IDS) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">Sin puesto de agenda</option>';
    Object.keys(global.PlatformAdmin.AGENDA_PUESTO_IDS).forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = global.PlatformAdmin.AGENDA_PUESTO_IDS[id];
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  }

  function loadUserForEdit(id) {
    var users = global.PlatformAdmin.getVisibleUsers
      ? global.PlatformAdmin.getVisibleUsers()
      : global.PlatformAdmin.getStaffUsers();
    var user = users.find(function (u) { return u.id === id; });
    if (!user) return;
    $('userEditId').value = user.id;
    $('userUsername').value = user.username;
    $('userUsername').disabled = false;
    $('userName').value = user.name;
    $('userRole').value = user.role;
    if ($('userAgendaPuesto')) $('userAgendaPuesto').value = user.agendaPuesto || '';
    $('userRole').disabled = false;
    $('userPassword').value = '';
    $('userPassword').placeholder = 'Contraseña (nueva)';
    var cancelBtn = $('btnCancelUserEdit');
    if (cancelBtn) cancelBtn.hidden = false;
    var saveBtn = $('btnSaveUser');
    if (saveBtn) saveBtn.textContent = 'Actualizar usuario';
    global.PlatformAdminUI.switchTab('users');
  }

  function deleteUserConfirm(id) {
    if (!userCan('users.manage')) {
      toastNotify('No tienes permiso para gestionar usuarios.', 'warn');
      return;
    }
    if (!confirm('¿Eliminar este usuario?')) return;
    var res = global.PlatformAdmin.deleteUser(id);
    if (!res.ok) {
      alert(res.message || 'No se pudo eliminar.');
      return;
    }
    refreshAdminTables();
    toastNotify('Usuario eliminado. Actualizando la web…', 'info');
    triggerWebUsersPublish();
  }

  function loadAreaForEdit(id) {
    var area = global.PlatformAdmin.getAreas().find(function (a) { return a.id === id; });
    if (!area) return;
    $('areaEditId').value = area.id;
    $('areaName').value = area.name;
    $('areaDesc').value = area.description || '';
    global.PlatformAdminUI.switchTab('areas');
  }

  function deleteAreaConfirm(id) {
    if (!confirm('¿Eliminar esta área?')) return;
    global.PlatformAdmin.deleteArea(id);
    refreshAdminTables();
  }

  function bindAdminModal() {
    var modal = $('adminModal');
    var openBtn = $('btnAdmin');
    if (!modal || !openBtn) return;

    bindOnce(openBtn, 'click', openAdminModal);

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    bindOnce($('btnCloseAdmin'), 'click', closeModal);
    bindOnce($('adminBackdrop'), 'click', closeModal);

    document.querySelectorAll('.admin-tab-btn').forEach(function (btn) {
      if (btn.dataset.tabBound) return;
      btn.dataset.tabBound = '1';
      btn.addEventListener('click', function () {
        var tab = global.PlatformAdminUI.switchTab(btn.getAttribute('data-tab'));
        if (tab === 'sistema') {
          var sysHost = $('adminSystemHost');
          if (sysHost) global.PlatformAdminUI.renderSystemPanel(sysHost);
        }
        if (tab === 'logs') {
          var logsHost = $('logsHost');
          if (logsHost) global.PlatformAdminUI.renderLogs(logsHost);
        }
        if (tab === 'accessRequest') refreshAccessRequestPanels();
        if (tab === 'requests') refreshAccessRequestPanels();
        if (tab === 'news' && global.PlatformHubNewsApp) {
          global.PlatformHubNewsApp.refreshAdmin(state.user);
        }
      });
    });

    bindExcelDropZone('adminDropZoneProd', 'adminFileProd', 'adminFileNameProd', 'productividad', 'btnImportExcelProd');
    bindExcelDropZone('adminDropZoneOps', 'adminFileOps', 'adminFileNameOps', 'operaciones', 'btnImportExcelOps');
    bindExcelDropZone('adminDropZoneFacturas', 'adminFileFacturas', 'adminFileNameFacturas', 'facturas', 'btnImportExcelFacturas');
    bindOnce($('btnValidateExcelProd'), 'click', function () {
      validateExcelBeforeImport('adminFileProd', 'adminPreviewProd', 'productividad');
    });
    bindOnce($('btnValidateExcelOps'), 'click', function () {
      validateExcelBeforeImport('adminFileOps', 'adminPreviewOps', 'operaciones');
    });
    bindOnce($('btnValidateExcelFacturas'), 'click', function () {
      validateExcelBeforeImport('adminFileFacturas', 'adminPreviewFacturas', 'facturas');
    });

    var userForm = $('userForm');
    if (userForm) {
      bindOnce(userForm, 'submit', function (ev) {
        ev.preventDefault();
        saveUserFromForm();
      });
    }

    var areaForm = $('areaForm');
    if (areaForm) {
      bindOnce(areaForm, 'submit', function (ev) {
        ev.preventDefault();
        saveAreaFromForm();
      });
    }

    bindOnce($('btnCancelUserEdit'), 'click', resetStaffUserForm);
    bindOnce($('btnPublishWebUsers'), 'click', publishWebUsersFromAdmin);
    bindOnce($('btnDownloadWebUsers'), 'click', function () {
      if (global.PlatformWebUsers) global.PlatformWebUsers.downloadWebUsersExport();
    });

    bindOnce($('btnSaveConfig'), 'click', saveConfigFromUi);
    bindOnce($('btnNetworkRelay'), 'click', toggleNetworkRelayQuick);
    bindOnce($('btnDetectRelayUrl'), 'click', detectRelayUrl);
    bindOnce($('btnTestRelayUrl'), 'click', testRelayUrl);
    bindOnce($('btnSaveOpenai'), 'click', saveOpenaiFromUi);
    bindOnce($('btnTestAiVoice'), 'click', function () {
      if ($('aiVoiceSelect')) {
        state.config.aiVoiceURI = $('aiVoiceSelect').value || '';
      }
      speakHuman('Prueba de voz. Son las ' + (new Date()).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' }) + '.');
    });
    if (global.speechSynthesis && global.speechSynthesis.addEventListener && !document.body.dataset.voiceListBound) {
      document.body.dataset.voiceListBound = '1';
      global.speechSynthesis.addEventListener('voiceschanged', populateAiVoiceSelect);
    }
    bindOnce($('btnRunAiAdmin'), 'click', function () {
      runAiAdminAnalysis();
    });
  }

  function hashPassword(password) {
    return PC.sha256Sync(String(password || '').trim());
  }

  function saveUserFromForm() {
    if (!userCan('users.manage')) {
      toastNotify('No tienes permiso para gestionar usuarios.', 'warn');
      return;
    }
    var editId = $('userEditId').value;
    var username = PC.sanitizeUsername($('userUsername').value);
    var password = String(($('userPassword') && $('userPassword').value) || '').trim();
    var displayName = ($('userName').value || '').trim();
    if (!username && !editId) {
      alert('El usuario es obligatorio.');
      return;
    }
    if (!displayName && !editId) {
      alert('El nombre completo es obligatorio. Aparecerá tal cual en la plataforma.');
      return;
    }
    var payload = {
      username: username,
      name: displayName || username,
      role: $('userRole').value,
      areas: [],
      agendaPuesto: ($('userAgendaPuesto') && $('userAgendaPuesto').value) || ''
    };

    if (editId) {
      var existing = global.PlatformAdmin.findUserById(editId);
      if (existing && global.PlatformAdmin.isPrimaryAdminUser(existing)) {
        toastNotify('La cuenta del administrador general no se edita desde la plataforma.', 'warn');
        return;
      }
      var patch = { name: payload.name, areas: [], agendaPuesto: payload.agendaPuesto };
      patch.username = payload.username;
      patch.role = payload.role;
      if (password) {
        patch.passwordHash = hashPassword(password);
        finishUserSave(editId, patch);
        return;
      }
      finishUserSave(editId, patch);
      return;
    }

    if (!username) {
      alert('El usuario es obligatorio.');
      return;
    }
    if (!password) {
      alert('La contraseña es obligatoria para usuarios nuevos.');
      return;
    }
    var hash = hashPassword(password);
    var res = global.PlatformAdmin.createUser({
      username: payload.username,
      name: payload.name,
      role: payload.role,
      areas: [],
      agendaPuesto: payload.agendaPuesto,
      passwordHash: hash
    });
    if (!res.ok) {
      alert(res.message || 'Error al crear usuario.');
      return;
    }
    resetStaffUserForm();
    refreshAdminTables();
    toastNotify('Usuario registrado. Publicando en la web…', 'info');
    triggerWebUsersPublish();
  }

  function finishUserSave(editId, patch) {
    var res = global.PlatformAdmin.updateUser(editId, patch);
    if (!res.ok) {
      alert(res.message || 'Error al actualizar.');
      return;
    }
    if (state.user && state.user.id === editId) {
      state.user = res.user;
      applyPermissions();
      updateRoleBadge();
    }
    resetStaffUserForm();
    refreshAdminTables();
    toastNotify('Usuario actualizado. Publicando en la web…', 'info');
    triggerWebUsersPublish();
  }

  function publishWebUsersFromAdmin() {
    if (!userCan('users.manage')) {
      toastNotify('No tienes permiso para publicar usuarios.', 'warn');
      return;
    }
    if (!global.PlatformWebUsers) {
      toastNotify('Módulo web-users no cargado.', 'warn');
      return;
    }
    var staffCount = global.PlatformAdmin.getStaffUsers().length;
    if (!staffCount) {
      toastNotify('No hay personal registrado para publicar.', 'warn');
      return;
    }
    publishWebUsersNow(true);
  }

  function saveAreaFromForm() {
    if (!userCan('areas.manage')) {
      toastNotify('No tienes permiso para gestionar áreas.', 'warn');
      return;
    }
    var editId = $('areaEditId').value;
    var name = ($('areaName').value || '').trim();
    if (!name) {
      alert('El nombre del área es obligatorio.');
      return;
    }
    var desc = ($('areaDesc').value || '').trim();
    if (editId) {
      global.PlatformAdmin.updateArea(editId, { name: name, description: desc });
    } else {
      var res = global.PlatformAdmin.createArea({ name: name, description: desc });
      if (!res.ok) {
        alert(res.message || 'Error al crear área.');
        return;
      }
    }
    $('areaForm').reset();
    $('areaEditId').value = '';
    refreshAdminTables();
  }

  function saveConfigFromUi() {
    if (!userCan('config.save')) {
      toastNotify('No tienes permiso para cambiar la configuración. Envía una solicitud en «Mi solicitud».', 'warn');
      return;
    }
    var sec = parseInt($('refreshSeconds').value, 10);
    if (isFinite(sec)) {
      state.config.refreshSeconds = Math.min(300, Math.max(10, sec));
    }
    if ($('configTheme')) {
      state.config.theme = $('configTheme').value || 'dark';
      document.documentElement.setAttribute('data-theme', state.config.theme);
    }
    if ($('configTvDefault')) {
      state.config.tvMode = !!$('configTvDefault').checked;
      document.body.classList.toggle('tv-mode', state.config.tvMode);
      syncTvUnifiedPresentation();
    }
    var tvSec = parseInt($('tvRotateSeconds') && $('tvRotateSeconds').value, 10);
    if (isFinite(tvSec)) {
      state.config.tvRotateSeconds = global.PlatformTvDashboard && global.PlatformTvDashboard.clampRotateSeconds
        ? global.PlatformTvDashboard.clampRotateSeconds(tvSec)
        : Math.min(60, Math.max(5, tvSec));
    }
    state.config.charts = state.config.charts || { productividad: {}, operaciones: {} };
    document.querySelectorAll('[data-chart-prod]').forEach(function (cb) {
      state.config.charts.productividad[cb.getAttribute('data-chart-prod')] = cb.checked;
    });
    document.querySelectorAll('[data-chart-ops]').forEach(function (cb) {
      state.config.charts.operaciones[cb.getAttribute('data-chart-ops')] = cb.checked;
    });
    var layoutData = readAdminLayoutFromUi();
    if (layoutData) {
      if (!layoutData.tvSlideIds.length) {
        setAdminStatus('Debe quedar al menos una diapositiva de TV activa.', true);
        return;
      }
      state.config.generalLayout = layoutData.generalLayout;
      state.config.tvLayout = layoutData.tvLayout;
      if (global.PlatformLayout && global.PlatformLayout.mergeConfigLayout) {
        global.PlatformLayout.mergeConfigLayout(state.config);
      }
    }
    global.PlatformStore.saveConfig(state.config);
    applyNetworkRelayConfig(false);
    startAutoRefresh();
    renderSubnav();
    syncOpsTvPresentation();
    setAdminStatus('Configuración guardada.', false);
    if (state.user) global.PlatformAdmin.addLog('config_save', '', logActor());
  }

  function saveOpenaiFromUi() {
    state.config.openai = {
      enabled: !!$('openaiEnabled').checked,
      apiKey: ($('openaiApiKey').value || '').trim(),
      model: $('openaiModel').value || 'gpt-4o-mini'
    };
    if ($('aiVoiceSelect')) {
      state.config.aiVoiceURI = $('aiVoiceSelect').value || '';
    }
    global.PlatformStore.saveConfig(state.config);
    setOpenaiStatus('Preferencias de IA y voz guardadas.', false);
    syncAiModeBadge();
    if ($('aiDrawer') && $('aiDrawer').classList.contains('open')) {
      renderAiSuggestions();
    }
  }

  /* ——— IA ——— */

  function getAiDataPayload() {
    return {
      operaciones: state.dataOperaciones,
      productividad: state.dataProductividad,
      facturas: state.dataFacturas
    };
  }

  function syncAiModeBadge() {
    if (!global.PlatformAI || !global.PlatformAI.getStatusLabel) return;
    var st = global.PlatformAI.getStatusLabel();
    var badge = $('aiModeBadge');
    var hint = $('aiModeHint');
    if (badge) {
      badge.textContent = st.label;
      badge.className = 'ai-mode-badge' + (st.mode === 'openai' ? ' is-openai' : '');
      badge.title = st.hint;
    }
    if (hint) hint.textContent = st.hint;
  }

  function renderAiSuggestions() {
    var host = $('aiSuggestions');
    if (!host || !global.PlatformAI || !global.PlatformAI.getSuggestedQuestions) return;
    var prompts = global.PlatformAI.getSuggestedQuestions(getActiveModule());
    host.innerHTML = '';
    prompts.forEach(function (q) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-suggestion-chip';
      btn.textContent = q;
      btn.setAttribute('data-ai-prompt', q);
      host.appendChild(btn);
    });
  }

  function setAiTyping(on) {
    var el = $('aiTyping');
    if (!el) return;
    el.classList.toggle('is-hidden', !on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function appendAiMsg(text, role, meta) {
    var box = $('aiMessages');
    if (!box) return;
    var div = document.createElement('div');
    div.className = 'ai-msg ' + (role || 'bot');
    if (meta && meta.source) {
      var srcLabel = meta.source === 'openai' ? 'OpenAI' : meta.source === 'local-fallback' ? 'Local (respaldo)' : 'Local';
      div.innerHTML = esc(text) + '<span class="ai-msg-meta">' + esc(srcLabel) + '</span>';
    } else {
      div.textContent = text;
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function restoreAiChatFromHistory() {
    var box = $('aiMessages');
    if (!box || !global.PlatformAI || !global.PlatformAI.getChatHistory) return;
    var hist = global.PlatformAI.getChatHistory();
    if (!hist.length) {
      appendAiMsg(
        'Soy su asistente de Almacén Central 001. Pregunte sobre operaciones, facturas o productividad. ' +
          'Puede usar las sugerencias o escribir libremente.',
        'bot',
        { source: 'welcome' }
      );
      return;
    }
    box.innerHTML = '';
    hist.forEach(function (m) {
      appendAiMsg(m.content, m.role === 'user' ? 'user' : 'bot', { source: m.source });
    });
  }

  function sendAiMessage(question, opts) {
    opts = opts || {};
    var q = String(question || '').trim();
    if (!q || !global.PlatformAI) return;
    var input = $('aiQuestion');
    if (!opts.skipUserEcho) {
      appendAiMsg(q, 'user');
      if (input && !opts.keepInput) input.value = '';
    }
    setAiTyping(true);
    global.PlatformAI.chat(q, {
      data: getAiDataPayload(),
      activeModule: getActiveModule(),
      preferLocal: !!opts.preferLocal
    }).then(function (res) {
      setAiTyping(false);
      appendAiMsg(res.text || 'Sin respuesta.', 'bot', { source: res.source });
      syncAiModeBadge();
    }).catch(function (err) {
      setAiTyping(false);
      appendAiMsg('Error: ' + (err.message || 'no se pudo completar la solicitud.'), 'bot', { source: 'local' });
    });
  }

  function openAiDrawer() {
    var drawer = $('aiDrawer');
    if (!drawer) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    syncAiModeBadge();
    renderAiSuggestions();
    restoreAiChatFromHistory();
    runAiNarrative();
    var input = $('aiQuestion');
    if (input) input.focus();
  }

  function closeAiDrawer() {
    var drawer = $('aiDrawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function bindAiDrawer() {
    var drawer = $('aiDrawer');
    var openBtn = $('btnAi');
    if (!drawer || !openBtn) return;

    bindOnce(openBtn, 'click', openAiDrawer);
    bindOnce($('btnCloseAi'), 'click', closeAiDrawer);

    bindOnce($('btnAskAi'), 'click', function () {
      var q = ($('aiQuestion') && $('aiQuestion').value || '').trim();
      if (!q) return;
      sendAiMessage(q);
    });

    bindOnce($('btnAnalyzeAi'), 'click', function () {
      sendAiMessage('Dame un resumen ejecutivo completo de todos los módulos con recomendaciones para jefatura.', { skipUserEcho: false });
    });

    bindOnce($('btnClearAiChat'), 'click', function () {
      if (global.PlatformAI && global.PlatformAI.clearChatHistory) {
        global.PlatformAI.clearChatHistory();
      }
      var box = $('aiMessages');
      if (box) box.innerHTML = '';
      restoreAiChatFromHistory();
      toastNotify('Conversación reiniciada.', 'info');
    });

    bindOnce($('btnAiConfig'), 'click', function () {
      if (state.user && global.PlatformAdmin.can(state.user.role, 'admin.panel')) {
        closeAiDrawer();
        openAdminModal();
        if (global.PlatformAdminUI) global.PlatformAdminUI.switchTab('ai');
      } else {
        toastNotify('Solicite a un administrador configurar OpenAI en Administración → IA.', 'info');
      }
    });

    var input = $('aiQuestion');
    if (input && input.dataset.aiKeyBound !== '1') {
      input.dataset.aiKeyBound = '1';
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          var q = (input.value || '').trim();
          if (q) sendAiMessage(q);
        }
      });
    }

    if (drawer.dataset.aiSuggestBound !== '1') {
      drawer.dataset.aiSuggestBound = '1';
      drawer.addEventListener('click', function (ev) {
        var chip = ev.target.closest('.ai-suggestion-chip');
        if (chip) {
          var prompt = chip.getAttribute('data-ai-prompt') || chip.textContent;
          sendAiMessage(prompt);
          return;
        }
      });
    }

    var insightsBar = $('aiInsightsBar');
    if (insightsBar && insightsBar.dataset.aiBarBound !== '1') {
      insightsBar.dataset.aiBarBound = '1';
      insightsBar.classList.add('is-clickable');
      insightsBar.addEventListener('click', function (ev) {
        if (ev.target.closest('.ai-open-chat-btn')) return;
        if (state.user && global.PlatformAdmin.can(state.user.role, 'ai.use')) {
          openAiDrawer();
        }
      });
      var head = insightsBar.querySelector('.ai-insights-head');
      if (head && !head.querySelector('.ai-open-chat-btn')) {
        var chatBtn = document.createElement('button');
        chatBtn.type = 'button';
        chatBtn.className = 'btn btn-sm ai-open-chat-btn';
        chatBtn.textContent = 'Abrir chat';
        chatBtn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          openAiDrawer();
        });
        head.appendChild(chatBtn);
      }
    }

    if (drawer.dataset.aiChipBound !== '1') {
      drawer.dataset.aiChipBound = '1';
      document.addEventListener('click', function (ev) {
        var alertChip = ev.target.closest('.ai-alert-chip.is-clickable');
        if (!alertChip) return;
        var q = alertChip.getAttribute('data-ai-question') || alertChip.title || alertChip.textContent;
        if (state.user && global.PlatformAdmin.can(state.user.role, 'ai.use')) {
          openAiDrawer();
          sendAiMessage('Explícame esto con más detalle: ' + q);
        }
      });
    }
  }

  function runAiAdminAnalysis() {
    var box = $('aiAdminResult');
    if (!box || !global.PlatformAI) return;
    box.textContent = 'Generando análisis…';
    var q = 'Elabora un informe gerencial estructurado: situación actual, riesgos, oportunidades y 3 acciones recomendadas para hoy.';
    global.PlatformAI.chat(q, {
      data: getAiDataPayload(),
      activeModule: 'reportes'
    }).then(function (res) {
      box.textContent = res.text;
      setOpenaiStatus('Análisis generado (' + (res.source || 'local') + ').', false);
    }).catch(function (err) {
      box.textContent = 'Error: ' + err.message;
      setOpenaiStatus(err.message, true);
    });
  }

  function runAiNarrative() {
    var el = $('aiNarrative');
    var row = $('aiAlertsRow');
    var grid = $('aiCriticalGrid');
    if (!el || !global.PlatformAI) return;
    var all = getAiDataPayload();
    global.PlatformAI.summarize(all).then(function (res) {
      var text = res.text || '';
      el.textContent = text.length > 220 ? text.slice(0, 217) + '…' : text;
      el.title = text;
      if (row && global.PlatformAI.getInsightChips) {
        global.PlatformAI.getInsightChips(all).then(function (chips) {
          row.innerHTML = '';
          chips.forEach(function (chip) {
            var span = document.createElement('button');
            span.type = 'button';
            span.className = 'ai-alert-chip is-clickable ' + (chip.type || 'info');
            span.textContent = chip.text.length > 72 ? chip.text.slice(0, 69) + '…' : chip.text;
            span.title = chip.text;
            span.setAttribute('data-ai-question', chip.text);
            row.appendChild(span);
          });
        });
      }
      if (grid && global.PlatformAI.getCriticalAlerts) {
        var alerts = global.PlatformAI.getCriticalAlerts(all);
        grid.innerHTML = '';
        alerts.forEach(function (a) {
          var card = document.createElement('article');
          card.className = 'ai-critical-card ' + (a.level === 'critical' ? 'risk-alto' : '');
          card.innerHTML = '<b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span>';
          grid.appendChild(card);
        });
        var bar = $('aiInsightsBar');
        if (bar) {
          bar.classList.remove('risk-alto', 'risk-medio', 'risk-bajo');
          if (alerts.some(function (x) { return x.level === 'critical'; })) bar.classList.add('risk-alto');
          else if (alerts.length) bar.classList.add('risk-medio');
          else bar.classList.add('risk-bajo');
        }
      }
    });
    syncAiModeBadge();
  }

  /* ——— Reloj y auto-refresh ——— */

  function startClock() {
    var clock = $('liveClock');
    if (!clock) return;
    var rdDateFormatter = null;
    var rdTimeFormatter = null;
    try {
      rdDateFormatter = new Intl.DateTimeFormat('es-DO', {
        timeZone: 'America/Santo_Domingo',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      rdTimeFormatter = new Intl.DateTimeFormat('es-DO', {
        timeZone: 'America/Santo_Domingo',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) { /* fallback abajo */ }
    function formatRdDate(date) {
      if (!rdDateFormatter || !rdDateFormatter.formatToParts) return '';
      var parts = rdDateFormatter.formatToParts(date).reduce(function (acc, p) {
        acc[p.type] = p.value;
        return acc;
      }, {});
      var month = String(parts.month || '').replace('.', '').toLowerCase();
      return (parts.day || '') + '/' + month + '/' + (parts.year || '');
    }
    function tick() {
      var now = new Date();
      var t = rdDateFormatter && rdTimeFormatter
        ? 'Hora RD · ' + formatRdDate(now) + ' · ' + rdTimeFormatter.format(now)
        : 'Hora RD · ' + PC.formatDateTime(now);
      clock.textContent = t;
      var tvClock = document.getElementById('tvWallClock');
      if (tvClock) tvClock.textContent = t;
    }
    tick();
    if (state.clockTimer) clearInterval(state.clockTimer);
    state.clockTimer = setInterval(tick, 1000);
  }

  function getRefreshIntervalSec() {
    var sec = (state.config && state.config.refreshSeconds) || 8;
    if (state.config && state.config.tvMode) {
      var rot = (state.config.tvRotateSeconds) || 8;
      sec = Math.max(sec, rot * 3 + 4);
    }
    return sec;
  }

  function refreshPublishedDataFromStore() {
    if (!state.user) return;
    var freshOps = global.PlatformStore.getPublishedData('operaciones');
    var freshProd = global.PlatformStore.getPublishedData('productividad');
    var freshFac = global.PlatformStore.getPublishedData('facturas');
    var changed = false;
    if (freshOps) {
      state.dataOperaciones = applyOperacionesFilters(freshOps);
      changed = true;
    }
    if (freshProd) {
      state.dataProductividad = applyProductividadFilters(freshProd);
      changed = true;
    }
    if (freshFac) {
      state.dataFacturas = applyFacturasFilters(freshFac);
      changed = true;
    }
    state.dataDespacho = loadDespachoData();
    if (getActiveModule() === 'despacho') {
      renderDespachoModule();
    }
    updateDataStatusChips();
    if (changed) {
      if (state.config && state.config.tvMode) {
        refreshTvUnifiedInPlace();
      } else {
        renderCurrentModule();
      }
      if (!state.config.tvMode) runAiNarrative();
    }
  }

  function startAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(function () {
      refreshPublishedDataFromStore();
    }, getRefreshIntervalSec() * 1000);
  }

  function bindLanSync() {
    if (state._lanSyncBound) return;
    state._lanSyncBound = true;
    document.addEventListener('lan-sync', function (ev) {
      refreshPublishedDataFromStore();
      var store = ev && ev.detail && ev.detail.store;
      if (store === 'averias' && getActiveModule() === 'reportes') {
        var host = $('module-reportes');
        if (host && global.PlatformModules && global.PlatformModules.renderReportes) {
          global.PlatformModules.renderReportes(host, {
            operaciones: state.dataOperaciones,
            facturas: state.dataFacturas,
            productividad: state.dataProductividad,
            tipoCambio: state.config && state.config.tipoCambio
          });
        }
      }
      if (store === 'users' || store === 'accessRequests') {
        refreshSessionUser();
        refreshAccessRequestPanels();
      }
    });
    document.addEventListener('web-cloud-sync', function () {
      refreshPublishedDataFromStore();
    });
  }

  function startAiHumanReminders() {
    if (state.aiReminderTimer) clearInterval(state.aiReminderTimer);
    state.aiReminderMinutes = 0;
    state.aiReminderTimer = setInterval(function () {
      if (!state.user) return;
      state.aiReminderMinutes += 30;
      if (state.aiReminderMinutes % 60 === 0) {
        var timeText;
        try {
          timeText = new Intl.DateTimeFormat('es-DO', {
            timeZone: 'America/Santo_Domingo',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }).format(new Date());
        } catch (e) {
          timeText = new Date().toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
        }
        aiHumanNotice('Son las ' + timeText + '.', 'info');
      } else {
        aiHumanNotice('Por favor actualizar los datos.', 'warn');
      }
    }, 30 * 60 * 1000);
  }

  /* ——— Boot ——— */

  function boot() {
    if (!global.PanelCore || !global.PlatformAdmin || !global.PlatformStore || !global.PlatformExcel ||
        !global.PlatformExcelProductivity || !global.PlatformExcelOperaciones ||
        !global.PlatformOperacionesUI || !global.PlatformExport || !global.PlatformModules ||
        !global.PlatformAdminTools || !global.PlatformExcelDetect || !global.PlatformUtils) {
      console.error('Faltan módulos de la plataforma.');
      setAuthVisible(true);
      return;
    }
    PC = global.PanelCore;
    initAuth();
    if (!tryRestoreSession()) {
      setAuthVisible(true);
    }
  }

  function scheduleBoot() {
    function run() {
      var start = function () {
        try {
          boot();
        } catch (err) {
          console.error('Error al iniciar:', err);
          if (global.PanelCore) {
            PC = global.PanelCore;
            setAuthVisible(true);
          }
        }
      };
      if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
        global.PlatformWebUsers.ready().then(start).catch(start);
      } else {
        start();
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  global.PlatformApp = {
    boot: boot,
    login: doLogin,
    logout: logout
  };

  scheduleBoot();
})(typeof window !== 'undefined' ? window : this);
