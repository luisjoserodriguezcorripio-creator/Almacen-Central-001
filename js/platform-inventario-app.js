/**
 * Portal Inventario RF — app web (misma lógica que app Zebra + Supabase)
 */
(function (global) {
  'use strict';

  var CORE = global.PlatformInventarioCore;
  var SYNC = global.PlatformInventarioSync;
  var SB = global.PlatformSupabase;

  var state = {
    user: null,
    role: null,
    mode: 'pickup',
    view: 'login',
    step: 1,
    flowIndex: 0,
    flowSteps: [1, 2, 4, 5],
    countRound: 1,
    pickupUnit: 'box',
    catalogMat: '',
    fields: { loc: '', prod: '', mat: '', exp: '', qty: '1' },
    entries: [],
    pendingSync: 0,
    camTarget: null,
    camStream: null,
    camDetector: null,
    camTimer: null,
    camBusy: false,
    continuous: false,
    html5Qr: null
  };

  var CAM_HINTS = {
    loc: 'Apunte al código de la ubicación',
    prod: 'Apunte al código de barras del artículo',
    mat: 'Apunte al código de la matrícula'
  };
  var CAM_TITLES = {
    loc: 'Escanear ubicación',
    prod: 'Escanear artículo',
    mat: 'Escanear matrícula'
  };

  function isHardwareScannerUa() {
    return /Zebra|Honeywell|Intermec|Symbol|DataWedge|TC[0-9]{2}|CK[0-9]{2}|EDA[0-9]{2}|Dolphin|Nautiz|Memor/i.test(navigator.userAgent || '');
  }

  function isPhoneViewport() {
    return document.documentElement.classList.contains('inv-rf-viewport') && !isHardwareScannerUa();
  }

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    if (global.PlatformToast && msg) {
      if (type === 'err') global.PlatformToast.error(msg);
      else if (type === 'ok') global.PlatformToast.success(msg);
      else global.PlatformToast.info(msg);
      return;
    }
    var t = $('invToast');
    if (!t) return;
    t.textContent = msg || '';
    t.classList.add('show');
    global.setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function setView(view) {
    state.view = view;
    ['login', 'mode', 'count', 'admin', 'records'].forEach(function (v) {
      var el = $('invView' + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.hidden = v !== view;
    });
    if (view === 'records') renderRecords();
    if (view === 'admin') renderAdminStats();
    if (view === 'count') applyCountStep();
    updateCloudBadge();
  }

  function updateCloudBadge() {
    var el = $('invCloudBadge');
    if (!el) return;
    var online = SYNC && SYNC.isOnline && SYNC.isOnline();
    el.textContent = online ? '● EN VIVO' : '○ Sin conexión';
    el.className = 'inv-cloud-badge' + (online ? ' inv-cloud-badge--live' : '');
  }

  function refreshUserHeader() {
    var u = state.user;
    document.querySelectorAll('.inv-header-name').forEach(function (nameEl) {
      if (!u) {
        nameEl.textContent = '—';
        return;
      }
      nameEl.textContent = u.displayName || u.employeeId;
    });
    var codeEl = $('invHeaderCode');
    if (codeEl) {
      if (!u || u.role === 'ADMIN') {
        codeEl.style.display = 'none';
      } else {
        codeEl.style.display = 'block';
        codeEl.textContent = 'Código ' + u.employeeId;
      }
    }
    applyRoleNav();
  }

  function applyRoleNav() {
    var isAdmin = !!(state.user && state.user.role === 'ADMIN');
    document.querySelectorAll('[data-inv-nav="admin"]').forEach(function (btn) {
      btn.hidden = !isAdmin;
    });
  }

  function initRfViewport() {
    var root = document.documentElement;
    var ua = navigator.userAgent || '';
    var w = global.innerWidth || 480;
    var m = global.matchMedia;
    var scanner = /Zebra|Honeywell|Intermec|Symbol|DataWedge|TC[0-9]{2}|CK[0-9]{2}|EDA[0-9]{2}|Dolphin|Nautiz|Memor/i.test(ua);
    var touch = m && (m('(pointer: coarse)').matches || m('(hover: none)').matches);
    if (scanner || w <= 720 || touch || root.classList.contains('inv-rf-viewport')) {
      root.classList.add('inv-rf-viewport');
      document.body.classList.add('inv-rf-device');
    }
    function setVh() {
      root.style.setProperty('--inv-vh', (global.innerHeight * 0.01) + 'px');
    }
    setVh();
    global.addEventListener('resize', setVh);
    global.addEventListener('orientationchange', function () {
      global.setTimeout(setVh, 120);
    });
  }

  /* ── Login ── */
  function pickRole(role) {
    state.role = role;
    $('invRoleAdmin').classList.toggle('sel', role === 'admin');
    $('invRoleCount').classList.toggle('sel', role === 'count');
    $('invBtnContinue').disabled = false;
  }

  function goLoginStep2() {
    if (!state.role) { toast('Seleccione un perfil', 'err'); return; }
    $('invLoginStep1').hidden = true;
    $('invLoginStep2').hidden = false;
    $('invPanelCount').hidden = state.role !== 'count';
    $('invPanelAdmin').hidden = state.role !== 'admin';
    $('invLoginStepNum').textContent = '2/2';
    $('invLoginStepTitle').textContent = 'Confirme su acceso';
  }

  function goLoginStep1() {
    $('invLoginStep1').hidden = false;
    $('invLoginStep2').hidden = true;
    $('invLoginStepNum').textContent = '1/2';
    $('invLoginStepTitle').textContent = 'Seleccione su perfil';
  }

  function doLogin() {
    var code, pin;
    if (state.role === 'admin') {
      code = ($('invAdmUser') || {}).value || 'admin';
      pin = ($('invAdmPin') || {}).value || '';
    } else {
      code = ($('invCode') || {}).value || '';
      pin = '';
      if (!code.trim()) { toast('Ingrese código', 'err'); return; }
    }
    SYNC.verifyLogin(state.role, code, pin).then(function (user) {
      if (!user) {
        var offline = SYNC && SYNC.isOnline && !SYNC.isOnline();
        toast(
          state.role === 'admin'
            ? 'Usuario o PIN incorrecto'
            : (offline
              ? 'Código no autorizado (modo local). Pruebe 51192, 51963 o 12345'
              : 'Código no autorizado'),
          'err'
        );
        return;
      }
      state.user = user;
      try {
        global.sessionStorage.setItem('invUser', JSON.stringify(user));
      } catch (e) { /* noop */ }
      refreshUserHeader();
      setAuthVisible(false);
      if (user.role === 'ADMIN') setView('admin');
      else setView('mode');
      toast('Bienvenido, ' + user.displayName, 'ok');
    }).catch(function () {
      toast('Error al validar acceso. Revise la conexión en vivo.', 'err');
    });
  }

  /* ── Modo conteo ── */
  function pickMode(mode) {
    state.mode = mode;
    try { global.sessionStorage.setItem('invCountMode', mode); } catch (e) { /* noop */ }
    state.flowSteps = CORE.flowStepsForMode(mode);
    state.flowIndex = 0;
    state.step = state.flowSteps[0];
    resetCountFields(true);
    global.setTimeout(function () { setView('count'); }, 120);
  }

  function resetCountFields(keepLoc) {
    if (!keepLoc) state.fields.loc = '';
    state.fields.prod = '';
    state.fields.mat = '';
    state.fields.exp = '';
    state.fields.qty = '1';
    state.catalogMat = '';
    state.countRound = 1;
    state.flowIndex = state.flowSteps.indexOf(keepLoc ? state.step : state.flowSteps[0]);
    if (state.flowIndex < 0) state.flowIndex = 0;
    state.step = state.flowSteps[state.flowIndex];
  }

  function setPickupUnit(u) {
    state.pickupUnit = u;
    applyCountStep();
  }

  function applyCountStep() {
    var step = state.step;
    var mode = state.mode;
    var f = state.fields;
    var total = state.flowSteps.length;
    var titles = ['Ubicación', 'Artículo', 'Matrícula', 'Vencimiento', 'Cantidad'];
    var phone = isPhoneViewport();
    var instr = phone
      ? ['Escanee o escriba la ubicación', 'Escanee o escriba el artículo', 'Matrícula u omitir', 'Vencimiento u omitir', 'Ingrese cantidad y guarde']
      : ['Escanee la ubicación', 'Escanee el artículo', 'Matrícula u omitir', 'Vencimiento u omitir', 'Ingrese cantidad y guarde'];

    $('invStepCounter').textContent = (state.flowIndex + 1) + '/' + total;
    $('invStepTitle').textContent = titles[step - 1];
    $('invInstr').textContent = instr[step - 1];
    $('invModeBadge').textContent = CORE.MODE_LABELS[mode] || 'PICKUP';
    $('invProgBar').style.width = Math.round(((state.flowIndex + 1) / total) * 100) + '%';

    for (var i = 1; i <= 5; i++) {
      var card = $('invCard' + i);
      if (card) {
        card.classList.toggle('active', i === step);
        card.hidden = mode === 'pickup' && i === 3;
      }
    }

    $('invLoc').value = f.loc;
    $('invProd').value = f.prod;
    $('invMat').value = f.mat;
    $('invExp').value = f.exp;
    $('invQty').value = f.qty;
    $('invPname').textContent = f.prodName || '—';

    var showPickupQty = mode === 'pickup' && step === 5;
    if ($('invPickupQtyType')) $('invPickupQtyType').hidden = !showPickupQty;
    if ($('invQtyAmountLabel')) $('invQtyAmountLabel').hidden = !showPickupQty;

    $('invPickupHint').hidden = mode !== 'pickup';
    $('invExcelBox').classList.toggle('show', step === 5);

    var rackBanner = $('invRackBanner');
    if (rackBanner) {
      if (f.loc && mode === 'pallet') {
        var rb = CORE.rackPassBanner(f.loc, state.countRound);
        rackBanner.hidden = false;
        rackBanner.textContent = rb.text;
        rackBanner.className = 'inv-rack-banner' + (rb.passes >= 2 ? ' inv-rack-banner--double' : '');
      } else if (f.loc && mode !== 'pickup') {
        rackBanner.hidden = false;
        rackBanner.textContent = 'Ubicación ' + f.loc + ' · Conteo #' + state.countRound;
        rackBanner.className = 'inv-rack-banner';
      } else {
        rackBanner.hidden = true;
      }
    }
    var contWrap = $('invContinuousWrap');
    if (contWrap) contWrap.hidden = false;
    if ($('invContinuousMode')) $('invContinuousMode').checked = !!state.continuous;

    document.querySelectorAll('.inv-scan-actions').forEach(function (el) {
      var card = el.closest('.inv-card');
      var show = !!card && card.classList.contains('active') && !isHardwareScannerUa();
      el.hidden = !show;
    });

    var hint = $('invSwipeHint');
    var labelR = $('invSwipeLabelR');
    if (step === 5) {
      hint.textContent = state.continuous
        ? 'Modo continuo: escanee para GUARDAR y seguir · o deslice ▶'
        : 'Arrastre hacia la derecha ▶▶ para GUARDAR';
      labelR.textContent = 'GUARDAR ▶';
    } else if (step === 3 || step === 4) {
      hint.textContent = 'Arrastre hacia la derecha ▶▶ para OMITIR';
      labelR.textContent = 'OMITIR ▶';
    } else {
      hint.textContent = phone
        ? 'Use la cámara o escriba el código · Deslice ◀ para corregir'
        : 'Escanee con el lector · Deslice ◀ para corregir';
      labelR.textContent = 'SIGUIENTE ▶';
    }

    setPreviewField('invPvLoc', 'Ubicación: ' + (f.loc || '—'), step === 1);
    setPreviewField('invPvCode', 'Artículo: ' + (f.prod || '—'), step === 2);
    setPreviewField('invPvMat', 'Matrícula: ' + (f.mat || '—'), step === 3);
    setPreviewField('invPvExp', 'Vencimiento: ' + (f.exp || '—'), step === 4);
    setPreviewField('invPvQty', (state.pickupUnit === 'unit' ? 'Unidades' : 'Cajas') + ': ' + (step === 5 ? f.qty : '—'), step === 5);
    setPreviewField('invPvRound', 'Nº conteo: ' + (step >= 2 ? state.countRound : '—'), step >= 2);

    if (step === 3 && $('invMatHint')) {
      $('invMatHint').textContent = state.catalogMat
        ? ('En sistema: ' + state.catalogMat)
        : 'Sin matrícula en catálogo — deslice ▶ para omitir';
    }
  }

  function setPreviewField(id, text, hi) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = hi ? 'hi' : 'dim';
  }

  function goBackStep() {
    if (state.flowIndex <= 0) return;
    state.flowIndex--;
    state.step = state.flowSteps[state.flowIndex];
    applyCountStep();
    toast('Paso anterior');
  }

  function advanceStep() {
    if (state.flowIndex >= state.flowSteps.length - 1) return;
    state.flowIndex++;
    state.step = state.flowSteps[state.flowIndex];
    applyCountStep();
  }

  function swipeConfirm() {
    if (state.step === 5) saveEntry();
    else if (state.step === 3) { state.fields.mat = ''; advanceStep(); toast('Matrícula omitida'); }
    else if (state.step === 4) { state.fields.exp = ''; advanceStep(); toast('Vencimiento omitido'); }
    else if (isPhoneViewport()) {
      if (state.step === 1) applyTypedCode('loc');
      else if (state.step === 2) applyTypedCode('prod');
      else toast('Use la cámara o escriba el código');
    } else {
      toast('Escanee con el lector RF');
    }
  }

  function applyTypedCode(target) {
    var map = { loc: 'invLoc', prod: 'invProd', mat: 'invMat' };
    var el = $(map[target]);
    var code = el ? String(el.value || '').trim() : '';
    if (!code) {
      toast(target === 'loc' ? 'Escanee o escriba la ubicación' : 'Escanee o escriba el código', 'err');
      return;
    }
    processScan(code);
  }

  function stopCamera() {
    if (state.camTimer) {
      global.clearInterval(state.camTimer);
      state.camTimer = null;
    }
    state.camDetector = null;
    state.camBusy = false;
    if (state.html5Qr) {
      try {
        var stopper = state.html5Qr.stop ? state.html5Qr.stop() : null;
        if (stopper && stopper.then) stopper.catch(function () { /* noop */ });
      } catch (e0) { /* noop */ }
      try {
        if (state.html5Qr.clear) state.html5Qr.clear();
      } catch (e1) { /* noop */ }
      state.html5Qr = null;
    }
    if (state.camStream) {
      try {
        state.camStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) { /* noop */ }
      state.camStream = null;
    }
    var video = $('invCamVideo');
    if (video) {
      try { video.pause(); } catch (e2) { /* noop */ }
      video.srcObject = null;
      video.hidden = false;
    }
    var fallbackBox = $('invCamHtml5');
    if (fallbackBox) {
      fallbackBox.hidden = true;
      fallbackBox.innerHTML = '';
    }
    var overlay = $('invCamOverlay');
    if (overlay) overlay.hidden = true;
    state.camTarget = null;
  }

  function loadHtml5Qrcode() {
    return new Promise(function (resolve, reject) {
      if (global.Html5Qrcode) {
        resolve(global.Html5Qrcode);
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = function () {
        if (global.Html5Qrcode) resolve(global.Html5Qrcode);
        else reject(new Error('Html5Qrcode unavailable'));
      };
      s.onerror = function () { reject(new Error('cdn')); };
      document.head.appendChild(s);
    });
  }

  function startHtml5Fallback() {
    var box = $('invCamHtml5');
    var video = $('invCamVideo');
    if (!box) return Promise.reject(new Error('no box'));
    if (video) video.hidden = true;
    box.hidden = false;
    box.innerHTML = '';
    return loadHtml5Qrcode().then(function (Html5Qrcode) {
      var scanner = new Html5Qrcode('invCamHtml5');
      state.html5Qr = scanner;
      return scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 260, height: 140 }, aspectRatio: 1.7 },
        function (decoded) { onCameraCode(decoded); },
        function () { /* ignore frame misses */ }
      );
    });
  }

  function onCameraCode(raw) {
    if (state.camBusy) return;
    var code = String(raw || '').trim();
    if (!code) return;
    state.camBusy = true;
    stopCamera();
    processScan(code);
  }

  function startDetectLoop(video) {
    if (!state.camDetector || !video) return;
    state.camTimer = global.setInterval(function () {
      if (!state.camDetector || state.camBusy) return;
      state.camDetector.detect(video).then(function (codes) {
        if (!codes || !codes.length) return;
        var raw = codes[0].rawValue || codes[0].rawData || '';
        onCameraCode(raw);
      }).catch(function () { /* noop */ });
    }, 650);
  }

  function openCamera(target) {
    if (state.view !== 'count') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Este celular no permite cámara. Escriba el código y pulse Usar código.', 'err');
      return;
    }
    stopCamera();
    state.camTarget = target || 'loc';
    var overlay = $('invCamOverlay');
    var title = $('invCamTitle');
    var hint = $('invCamHint');
    if (title) title.textContent = CAM_TITLES[state.camTarget] || 'Escanear código';
    if (hint) hint.textContent = CAM_HINTS[state.camTarget] || 'Apunte al código de barras';
    if (overlay) overlay.hidden = false;

    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    }).then(function (media) {
      state.camStream = media;
      var video = $('invCamVideo');
      if (!video) return;
      video.srcObject = media;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.play().catch(function () { /* noop */ });
      if (global.BarcodeDetector) {
        try {
          state.camDetector = new global.BarcodeDetector({
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'itf', 'codabar']
          });
          startDetectLoop(video);
          return;
        } catch (e) {
          state.camDetector = null;
        }
      }
      // Safari / navegadores sin BarcodeDetector
      try { media.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) { /* noop */ }
      state.camStream = null;
      if (video) video.srcObject = null;
      startHtml5Fallback().then(function () {
        toast('Cámara lista (modo compatibilidad)', 'ok');
      }).catch(function () {
        stopCamera();
        toast('No se pudo iniciar el lector de cámara. Escriba el código.', 'err');
      });
    }).catch(function () {
      startHtml5Fallback().then(function () {
        toast('Cámara lista (modo compatibilidad)', 'ok');
      }).catch(function () {
        stopCamera();
        toast('No se pudo abrir la cámara. Revise permisos o escriba el código.', 'err');
      });
    });
  }

  function processScan(code) {
    code = String(code || '').trim();
    if (!code) return;
    var f = state.fields;

    if (state.step === 1) {
      var locCheck = CORE.validateLocationForMode(state.mode, code);
      if (!locCheck.ok) {
        toast(locCheck.message || 'Ubicación no válida', 'err');
        return;
      }
      f.loc = code;
      if (code === '0') {
        f.qty = '0';
        state.countRound = 1;
        state.flowIndex = state.flowSteps.indexOf(5);
        state.step = 5;
        applyCountStep();
        toast('Ubicación vacía (0) — confirme y guarde');
        return;
      }
      SYNC.countRoundForLocation(code, f.prod || '_').then(function (n) {
        state.countRound = n;
        state.flowIndex = state.flowSteps.indexOf(2);
        state.step = 2;
        applyCountStep();
        var banner = CORE.rackPassBanner(code, state.countRound);
        var extra = state.mode === 'pallet' ? (' · ' + banner.tipo) : '';
        toast('Ubicación OK · Conteo #' + state.countRound + extra, 'ok');
      });
    } else if (state.step === 2) {
      SYNC.lookupPairCode(code).then(function (pair) {
        if (pair) {
          f.mat = code;
          f.prod = pair.articleCode;
          f.prodName = pair.productName;
          state.flowIndex = state.flowSteps.indexOf(4);
          state.step = state.mode === 'pickup' ? 4 : 4;
          applyCountStep();
          toast('Matrícula detectada → vencimiento', 'ok');
          return;
        }
        return SYNC.lookupCatalog(code, f.loc).then(function (cat) {
          f.prod = code;
          f.prodName = cat ? cat.name : 'Producto';
          state.catalogMat = cat ? cat.matricula : '';
          if (cat && cat.expectedQty) f.expectedQty = cat.expectedQty;
          state.flowIndex = state.flowSteps.indexOf(state.mode === 'pickup' ? 4 : 3);
          state.step = state.mode === 'pickup' ? 4 : 3;
          applyCountStep();
          toast('Artículo OK', 'ok');
        });
      });
    } else if (state.step === 3) {
      f.mat = code;
      advanceStep();
      toast('Matrícula OK', 'ok');
    } else if (state.step === 4) {
      f.exp = code.length >= 6 ? code : '31/12/2026';
      advanceStep();
      toast('Vencimiento OK', 'ok');
    } else if (state.step === 5) {
      if (state.continuous) {
        // Modo continuo APK: un escaneo en cantidad guarda y sigue en el mismo rack
        if (!f.prod) {
          toast('Primero escanee el artículo', 'err');
          return;
        }
        saveEntry({ keepGoing: true });
        return;
      }
      f.qty = String((parseInt(f.qty, 10) || 0) + 1);
      applyCountStep();
      toast('Cantidad: ' + f.qty);
    }
  }

  function saveEntry(opts) {
    opts = opts || {};
    var f = state.fields;
    var u = state.user;
    if (!u) { toast('Sesión expirada', 'err'); return; }
    if (!f.loc) { toast('Falta ubicación', 'err'); return; }
    if (!f.prod && String(f.qty) !== '0') { toast('Falta artículo', 'err'); return; }
    var unit = state.mode === 'pickup' && state.pickupUnit === 'unit' ? 'UND' : 'CJ';
    var dbl = CORE.isDoubleRackLocation(f.loc);
    var passes = dbl === true ? 2 : 1;
    var banner = CORE.rackPassBanner(f.loc, state.countRound);

    SYNC.insertEntry({
      barcode: f.prod,
      productName: f.prodName || '',
      quantity: parseInt(f.qty, 10) || 0,
      zone: f.loc,
      warehouse: CORE.WAREHOUSE,
      unit: unit,
      expectedQty: f.expectedQty || 0,
      matricula: f.mat,
      expirationDate: f.exp,
      userId: u.employeeId,
      countMode: CORE.MODE_DB[state.mode] || 'PICKUP',
      rackPassIndex: passes >= 2 ? banner.lectura : 1,
      rackPassesTotal: passes,
      countNumber: state.countRound
    }).then(function (res) {
      if (!res.ok) { toast('Error al guardar', 'err'); return; }
      var msg = res.offline ? 'Guardado local (sin conexión)' : 'Guardado en la nube';
      var passTxt = passes >= 2 ? (' · Lectura ' + banner.lectura + '/2') : '';
      toast(msg + ' · ' + f.qty + ' ' + unit + passTxt, 'ok');
      f.prod = '';
      f.mat = '';
      f.exp = '';
      f.qty = '1';
      f.prodName = '';
      f.expectedQty = 0;
      state.catalogMat = '';
      // Mantener countRound de la ubicación; se recalcula al reescanear ubicación
      state.flowIndex = state.flowSteps.indexOf(2);
      state.step = 2;
      applyCountStep();
      renderAdminStats();
      if (opts.keepGoing && isPhoneViewport() && state.continuous) {
        global.setTimeout(function () { openCamera('prod'); }, 350);
      }
    }).catch(function () {
      toast('Error al guardar en la nube', 'err');
    });
  }

  /* ── Admin / Records ── */
  function renderAdminStats() {
    SYNC.fetchEntries().then(function (list) {
      state.entries = list;
      var pending = list.filter(function (e) { return e.synced === false; }).length;
      state.pendingSync = pending;
      if ($('invStatTotal')) $('invStatTotal').textContent = String(list.length);
      if ($('invStatPending')) $('invStatPending').textContent = String(pending);
      if ($('invStatUsers')) {
        SYNC.fetchUsers().then(function (users) {
          $('invStatUsers').textContent = String((users || []).filter(function (u) { return u.role === 'COUNT'; }).length);
        });
      }
      var st = $('invSyncStatus');
      if (st) {
        st.textContent = SYNC.isOnline() ? 'Conectado en vivo' : 'Modo local — configure sincronización';
        st.className = 'inv-sync-status' + (SYNC.isOnline() ? ' ok' : ' warn');
      }
    });
  }

  function renderRecords() {
    SYNC.fetchEntries().then(function (list) {
      state.entries = list;
      var html = list.length ? list.map(function (e) {
        var m = CORE.entryMeta({ zone: e.zone, count_number: e.countNumber, rack_passes_total: e.rackPassesTotal });
        return '<article class="inv-record-item">' +
          '<div class="inv-record-loc">' + esc(e.zone) + '</div>' +
          '<div class="inv-record-prod">' + esc(e.productName || e.barcode) + '</div>' +
          '<div class="inv-record-cycle' + (m.re ? ' re' : '') + '">' + esc(m.label) + '</div>' +
          '<div class="inv-record-meta">' + esc(e.quantity + ' ' + (e.unit || 'CJ')) + ' · ' +
          esc(e.userId) + ' · ' + esc(CORE.formatDateTime(e.createdAt)) +
          (e.synced === false ? ' · <span class="pending">Pendiente</span>' : '') +
          '</div></article>';
      }).join('') : '<p class="inv-empty">Sin registros aún.</p>';
      if ($('invRecordsList')) $('invRecordsList').innerHTML = html;
    });
  }

  function exportCsv() {
    SYNC.fetchEntries().then(function (list) {
      var csv = CORE.entriesToCsv(list.map(function (e) {
        return {
          created_at: e.createdAt,
          user_id: e.userId,
          zone: e.zone,
          warehouse: e.warehouse,
          barcode: e.barcode,
          matricula: e.matricula,
          expiration_date: e.expirationDate,
          product_name: e.productName,
          unit: e.unit,
          quantity: e.quantity,
          expected_qty: e.expectedQty,
          count_mode: e.countMode,
          count_number: e.countNumber
        };
      }));
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inventario-dc-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      toast('CSV descargado', 'ok');
    });
  }

  function confirmDeleteAll() {
    if (!global.confirm('¿Eliminar TODOS los registros de la nube?')) return;
    SYNC.deleteAllEntries().then(function () {
      toast('Registros eliminados', 'ok');
      renderRecords();
      renderAdminStats();
    }).catch(function () { toast('Error al eliminar', 'err'); });
  }

  function testSupabase() {
    if (!SB) return;
    SB.testConnection().then(function (ok) {
      toast(ok ? 'Conexión en vivo activa' : 'No se pudo conectar al servidor', ok ? 'ok' : 'err');
      updateCloudBadge();
    });
  }

  function showSupabaseSetup() {
    var cfg = SB && SB.getConfig && SB.getConfig();
    var sb = cfg && cfg.supabase;
    var url = global.prompt('URL del servidor (https://xxx...)', (sb && sb.url) || '');
    if (url == null) return;
    var key = global.prompt('Clave pública de acceso', (sb && sb.anonKey) || '');
    if (key == null) return;
    SB.saveOverride(url, key);
    toast('Recargue la página (Ctrl+F5)', 'ok');
  }

  /* ── Auth overlay ── */
  function setAuthVisible(visible) {
    var overlay = $('invAuthOverlay');
    var app = $('invApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      app.hidden = visible;
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('inv-dash-view', !visible);
  }

  function setupSwipe() {
    var thumb = $('invSwipeThumb');
    var track = $('invSwipeTrack');
    if (!thumb || !track || thumb.dataset.bound) return;
    thumb.dataset.bound = '1';
    var startX = 0, startTx = 0, max = 100;
    function onStart(x) {
      startX = x;
      startTx = thumb._tx || 0;
      max = (track.offsetWidth - thumb.offsetWidth) / 2 - 8;
    }
    function onMove(x) {
      var delta = Math.max(-max, Math.min(max, startTx + x - startX));
      thumb._tx = delta;
      thumb.style.transform = 'translateX(' + delta + 'px)';
    }
    function onEnd() {
      var tx = thumb._tx || 0;
      if (tx <= -max * 0.55) goBackStep();
      else if (tx >= max * 0.55) swipeConfirm();
      thumb._tx = 0;
      thumb.style.transform = '';
    }
    thumb.addEventListener('mousedown', function (e) { onStart(e.clientX); e.preventDefault(); });
    global.addEventListener('mousemove', function (e) { if (startX) onMove(e.clientX); });
    global.addEventListener('mouseup', function () { if (startX) { startX = 0; onEnd(); } });
    thumb.addEventListener('touchstart', function (e) { onStart(e.touches[0].clientX); }, { passive: true });
    thumb.addEventListener('touchmove', function (e) { onMove(e.touches[0].clientX); }, { passive: true });
    thumb.addEventListener('touchend', onEnd);
  }

  function bindEvents() {
    $('invRoleAdmin') && $('invRoleAdmin').addEventListener('click', function () { pickRole('admin'); });
    $('invRoleCount') && $('invRoleCount').addEventListener('click', function () { pickRole('count'); });
    $('invBtnContinue') && $('invBtnContinue').addEventListener('click', goLoginStep2);
    $('invBtnBackProfile') && $('invBtnBackProfile').addEventListener('click', goLoginStep1);
    $('invBtnEnter') && $('invBtnEnter').addEventListener('click', doLogin);
    function bindLoginEnter(id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doLogin();
        }
      });
    }
    bindLoginEnter('invCode');
    bindLoginEnter('invAdmUser');
    bindLoginEnter('invAdmPin');
    function bindAll(sel, fn) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.addEventListener('click', fn);
      });
    }

    bindAll('.inv-btn-logout', function () {
      stopCamera();
      state.user = null;
      try { global.sessionStorage.removeItem('invUser'); } catch (e) { /* noop */ }
      setAuthVisible(true);
      goLoginStep1();
    });

    ['invModePickup', 'invModePallet', 'invModeCuadre'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('click', function () {
        pickMode(el.getAttribute('data-mode'));
      });
    });

    $('invBtnQtyBox') && $('invBtnQtyBox').addEventListener('click', function () { setPickupUnit('box'); });
    $('invBtnQtyUnit') && $('invBtnQtyUnit').addEventListener('click', function () { setPickupUnit('unit'); });

    bindAll('[data-inv-nav="admin"]', function () { stopCamera(); setView('admin'); });
    bindAll('[data-inv-nav="records"]', function () { stopCamera(); setView('records'); });
    bindAll('[data-inv-nav="count"]', function () { stopCamera(); setView('count'); });
    bindAll('[data-inv-nav="mode"]', function () { stopCamera(); setView('mode'); });

    bindAll('[data-inv-action="export"]', exportCsv);
    bindAll('[data-inv-action="delete-all"]', confirmDeleteAll);
    $('invBtnTestSb') && $('invBtnTestSb').addEventListener('click', testSupabase);
    $('invBtnSetupSb') && $('invBtnSetupSb').addEventListener('click', showSupabaseSetup);

    document.querySelectorAll('[data-inv-camera]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCamera(btn.getAttribute('data-inv-camera') || 'loc');
      });
    });
    document.querySelectorAll('[data-inv-apply]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTypedCode(btn.getAttribute('data-inv-apply') || 'loc');
      });
    });
    $('invCamClose') && $('invCamClose').addEventListener('click', stopCamera);
    $('invCamStop') && $('invCamStop').addEventListener('click', stopCamera);
    $('invContinuousMode') && $('invContinuousMode').addEventListener('change', function () {
      state.continuous = !!$('invContinuousMode').checked;
      try { global.sessionStorage.setItem('invContinuous', state.continuous ? '1' : '0'); } catch (e) { /* noop */ }
      toast(state.continuous ? 'Modo continuo activado' : 'Modo continuo desactivado', 'ok');
      applyCountStep();
    });
    try {
      state.continuous = global.sessionStorage.getItem('invContinuous') === '1';
    } catch (eCont) { /* noop */ }

    function bindScanEnter(id, target) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        applyTypedCode(target);
      });
    }
    bindScanEnter('invLoc', 'loc');
    bindScanEnter('invProd', 'prod');
    bindScanEnter('invMat', 'mat');

    document.addEventListener('keydown', function (e) {
      if (state.view !== 'count') return;
      if (e.key === 'Escape' && state.camStream) { stopCamera(); e.preventDefault(); return; }
      if (e.key === 'F8') { processScan('P020-012-1'); e.preventDefault(); }
      if (e.key === 'F7') { processScan('0'); e.preventDefault(); }
      if (e.key === 'F9') { processScan('7501234567890'); e.preventDefault(); }
      if (e.key === 'F10') { processScan('0000009539167'); e.preventDefault(); }
    });

    var scanBuf = '';
    var scanTimer = null;
    document.addEventListener('keypress', function (e) {
      if (state.view !== 'count' || state.view === undefined) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter' && scanBuf.length > 2) {
        processScan(scanBuf);
        scanBuf = '';
        e.preventDefault();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBuf += e.key;
        if (scanTimer) global.clearTimeout(scanTimer);
        scanTimer = global.setTimeout(function () { scanBuf = ''; }, 120);
      }
    });

    setupSwipe();
    global.addEventListener('pagehide', stopCamera);
  }

  function tryRestoreSession() {
    try {
      var raw = global.sessionStorage.getItem('invUser');
      if (!raw) return;
      state.user = JSON.parse(raw);
      refreshUserHeader();
      setAuthVisible(false);
      setView(state.user.role === 'ADMIN' ? 'admin' : 'mode');
    } catch (e) { /* noop */ }
  }

  function boot() {
    if (!CORE || !SYNC) {
      document.body.innerHTML += '<p class="noscript-msg">Error al cargar Inventario RF.</p>';
      return;
    }
    initRfViewport();
    bindEvents();
    SYNC.onChange(function (kind) {
      if (kind === 'sync' || kind === 'entry' || kind === 'clear') {
        if (state.view === 'records') renderRecords();
        if (state.view === 'admin') renderAdminStats();
        updateCloudBadge();
      }
    });
    SYNC.init().then(function () {
      updateCloudBadge();
      tryRestoreSession();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PlatformInventarioApp = {
    setView: setView,
    processScan: processScan,
    pickMode: pickMode,
    openCamera: openCamera,
    stopCamera: stopCamera
  };
})(typeof window !== 'undefined' ? window : this);
