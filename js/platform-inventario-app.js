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
    html5Qr: null,
    directedRows: [],
    directedMeta: {},
    directedDraft: [],
    directedActiveId: null,
    dirCamTarget: null,
    pendingNextLoc: '',
    pendingCurrentLoc: '',
    keepGoingAfterChoice: false,
    awaitingNextChoice: false
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
    var map = {
      login: 'invViewLogin',
      mode: 'invViewMode',
      count: 'invViewCount',
      admin: 'invViewAdmin',
      records: 'invViewRecords',
      directed: 'invViewDirected',
      directedCount: 'invViewDirectedCount'
    };
    Object.keys(map).forEach(function (v) {
      var el = $(map[v]);
      if (el) el.hidden = v !== view;
    });
    if (view === 'records') renderRecords();
    if (view === 'admin') {
      renderAdminStats();
      renderDirectedAdmin();
    }
    if (view === 'count') applyCountStep();
    if (view === 'directed') loadDirectedPlan(false);
    if (view === 'directedCount') fillDirectedActive();
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
    state.awaitingNextChoice = false;
    state.pendingNextLoc = '';
    state.pendingCurrentLoc = '';
    hideNextLocationChoice();
    if (mode === 'dirigido') {
      global.setTimeout(function () { setView('directed'); }, 120);
      return;
    }
    state.flowSteps = CORE.flowStepsForMode(mode);
    state.flowIndex = 0;
    state.step = state.flowSteps[0];
    resetCountFields(true);
    global.setTimeout(function () { setView('count'); }, 120);
  }

  function dirStatusLabel(status) {
    if (status === 'ok') return '<span class="inv-dir-status inv-dir-status--ok">OK</span>';
    if (status === 'bad') return '<span class="inv-dir-status inv-dir-status--bad">DIFERENCIA</span>';
    if (status === 'open') return '<span class="inv-dir-status inv-dir-status--open">EN CURSO</span>';
    return '<span class="inv-dir-status inv-dir-status--pending">PENDIENTE</span>';
  }

  function applyDirectedPlan(plan) {
    state.directedRows = (plan && plan.rows) || [];
    state.directedMeta = (plan && plan.meta) || {};
    if (!state.directedActiveId && state.directedRows.length) {
      var first = state.directedRows.find(function (r) { return r.status !== 'ok'; });
      state.directedActiveId = (first || state.directedRows[0]).id;
    }
    renderDirectedQueue();
    renderDirectedAdmin();
    fillDirectedActive();
  }

  function loadDirectedPlan(preferCloud) {
    var loader = preferCloud && SYNC.pullDirectedPlanFromCloud
      ? SYNC.pullDirectedPlanFromCloud()
      : SYNC.getDirectedPlan();
    return loader.then(function (plan) {
      applyDirectedPlan(plan);
      return plan;
    }).catch(function () {
      applyDirectedPlan({ rows: [], meta: {} });
    });
  }

  function renderDirectedQueue() {
    var rows = state.directedRows || [];
    var pend = rows.filter(function (r) { return r.status !== 'ok'; }).length;
    var ok = rows.filter(function (r) { return r.status === 'ok'; }).length;
    var hint = $('invDirectedHint');
    var meta = $('invDirectedMeta');
    if (hint) {
      hint.textContent = rows.length
        ? (pend + ' pendientes de ' + rows.length + ' líneas')
        : 'Sin plan publicado. Admin carga Excel en PC o importe JSON.';
    }
    if (meta) {
      meta.hidden = !rows.length;
      if ($('invDirLines')) $('invDirLines').textContent = String(rows.length);
      if ($('invDirPend')) $('invDirPend').textContent = String(pend);
      if ($('invDirOk')) $('invDirOk').textContent = String(ok);
    }
    var list = $('invDirectedQueue');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<p class="inv-empty">Sin líneas en la cola.</p>';
      return;
    }
    list.innerHTML = rows.map(function (r) {
      var cls = 'inv-dir-queue-item';
      if (r.id === state.directedActiveId) cls += ' is-active';
      if (r.status === 'ok') cls += ' is-ok';
      if (r.status === 'bad') cls += ' is-bad';
      return '<div class="' + cls + '" data-dir-id="' + esc(r.id) + '">' +
        '<strong>' + esc(r.location) + '</strong>' +
        '<span>' + esc(r.barcode) + ' · esp. ' + esc(r.expectedQty) + ' CJ · ' + esc(r.product || '') +
        ' · ' + dirStatusLabel(r.status) + '</span></div>';
    }).join('');
    list.querySelectorAll('[data-dir-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.directedActiveId = el.getAttribute('data-dir-id');
        setView('directedCount');
      });
    });
  }

  function activeDirectedRow() {
    return (state.directedRows || []).find(function (r) { return r.id === state.directedActiveId; }) || null;
  }

  function fillDirectedActive() {
    var r = activeDirectedRow();
    if ($('invDirActiveLoc')) $('invDirActiveLoc').textContent = r ? r.location : '—';
    if ($('invDirActiveMeta')) {
      $('invDirActiveMeta').textContent = r
        ? (r.barcode + ' · ' + (r.product || 'Producto') + ' · esperado ' + r.expectedQty + ' CJ')
        : 'Seleccione una línea en la cola';
    }
    if ($('invDirLoc')) $('invDirLoc').value = '';
    if ($('invDirCode')) $('invDirCode').value = '';
    if ($('invDirQty')) $('invDirQty').value = '';
    ['invDirLoc', 'invDirCode', 'invDirQty'].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.remove('inv-field--ok', 'inv-field--bad');
    });
    if ($('invDirMsg')) {
      $('invDirMsg').textContent = r
        ? 'Valide los 3 datos contra el Excel publicado.'
        : 'Abra la cola y elija una línea.';
      $('invDirMsg').style.color = '#607080';
    }
    updateDirectedChips();
  }

  function updateDirectedChips() {
    var r = activeDirectedRow();
    var locEl = $('invDirLoc');
    var codeEl = $('invDirCode');
    var qtyEl = $('invDirQty');
    var chips = $('invDirChips');
    if (!chips) return;
    if (!r) {
      chips.innerHTML =
        '<span class="inv-dir-chip wait">Ubicación</span>' +
        '<span class="inv-dir-chip wait">Código</span>' +
        '<span class="inv-dir-chip wait">Cantidad</span>';
      return;
    }
    var locOk = locEl && locEl.value && CORE.normLoc(locEl.value) === CORE.normLoc(r.location);
    var codeOk = codeEl && codeEl.value && CORE.normBarcode(codeEl.value) === CORE.normBarcode(r.barcode);
    var qtyRaw = qtyEl ? qtyEl.value : '';
    var qtyOk = qtyRaw !== '' && Number(qtyRaw) === Number(r.expectedQty);
    var qtyDiff = qtyRaw !== '' && Number(qtyRaw) !== Number(r.expectedQty);
    chips.innerHTML =
      '<span class="inv-dir-chip ' + (locOk ? 'ok' : 'wait') + '">' + (locOk ? '✓ Ubicación' : 'Ubicación') + '</span>' +
      '<span class="inv-dir-chip ' + (codeOk ? 'ok' : 'wait') + '">' + (codeOk ? '✓ Código' : 'Código') + '</span>' +
      '<span class="inv-dir-chip ' + (qtyOk ? 'ok' : (qtyDiff ? 'bad' : 'wait')) + '">' +
      (qtyOk ? '✓ Cantidad' : (qtyDiff ? '≠ Cantidad' : 'Cantidad')) + '</span>';
    if (locEl) {
      locEl.classList.toggle('inv-field--ok', !!locEl.value && locOk);
      locEl.classList.toggle('inv-field--bad', !!locEl.value && !locOk);
    }
    if (codeEl) {
      codeEl.classList.toggle('inv-field--ok', !!codeEl.value && codeOk);
      codeEl.classList.toggle('inv-field--bad', !!codeEl.value && !codeOk);
    }
    if (qtyEl) {
      qtyEl.classList.toggle('inv-field--ok', qtyRaw !== '' && qtyOk);
      qtyEl.classList.toggle('inv-field--bad', qtyRaw !== '' && !qtyOk);
    }
  }

  function validateDirectedSave() {
    var r = activeDirectedRow();
    var u = state.user;
    if (!r) { toast('Seleccione una línea', 'err'); return; }
    if (!u) { toast('Sesión expirada', 'err'); return; }
    updateDirectedChips();
    var locVal = ($('invDirLoc') && $('invDirLoc').value) || '';
    var codeVal = ($('invDirCode') && $('invDirCode').value) || '';
    var qtyRaw = ($('invDirQty') && $('invDirQty').value) || '';
    var locOk = CORE.normLoc(locVal) === CORE.normLoc(r.location);
    var codeOk = CORE.normBarcode(codeVal) === CORE.normBarcode(r.barcode);
    if (!locOk || !codeOk || qtyRaw === '') {
      if ($('invDirMsg')) {
        $('invDirMsg').textContent = 'Complete ubicación, código y cantidad válidos.';
        $('invDirMsg').style.color = '#c62828';
      }
      toast('Validación incompleta', 'err');
      return;
    }
    var qty = Number(qtyRaw);
    var status = qty === Number(r.expectedQty) ? 'ok' : 'bad';
    var patch = {
      status: status,
      countedQty: qty,
      countedAt: new Date().toISOString(),
      countedBy: u.employeeId || u.displayName || ''
    };
    SYNC.patchDirectedLine(r.id, patch).then(function (res) {
      state.directedRows = (res && res.rows) || state.directedRows;
      if ($('invDirMsg')) {
        if (status === 'ok') {
          $('invDirMsg').textContent = 'OK · coincide con el Excel. Pasa a la siguiente.';
          $('invDirMsg').style.color = '#2e7d32';
        } else {
          $('invDirMsg').textContent = 'Diferencia · esperado ' + r.expectedQty + ' · contado ' + qty + '.';
          $('invDirMsg').style.color = '#c62828';
        }
      }
      toast(status === 'ok' ? 'Línea OK' : 'Diferencia registrada', status === 'ok' ? 'ok' : 'err');
      // También guarda en registros de conteo
      SYNC.insertEntry({
        barcode: r.barcode,
        productName: r.product || '',
        quantity: qty,
        zone: r.location,
        warehouse: CORE.WAREHOUSE,
        unit: 'CJ',
        expectedQty: r.expectedQty || 0,
        matricula: r.matricula || '',
        expirationDate: '',
        userId: u.employeeId,
        countMode: 'DIRIGIDO',
        rackPassIndex: 1,
        rackPassesTotal: 1,
        countNumber: 1
      }).catch(function () { /* noop */ });
      renderDirectedQueue();
      renderDirectedAdmin();
      if (status === 'ok') {
        global.setTimeout(function () { nextDirectedLine(); }, 450);
      }
    });
  }

  function nextDirectedLine() {
    var rows = state.directedRows || [];
    if (!rows.length) return;
    var idx = rows.findIndex(function (r) { return r.id === state.directedActiveId; });
    var i = idx + 1;
    while (i < rows.length && rows[i].status === 'ok') i++;
    if (i >= rows.length) i = rows.findIndex(function (r) { return r.status !== 'ok'; });
    if (i < 0) i = 0;
    state.directedActiveId = rows[i].id;
    fillDirectedActive();
    renderDirectedQueue();
  }

  function renderDirectedAdmin() {
    var draft = state.directedDraft.length ? state.directedDraft : state.directedRows;
    var body = $('invDirAdminBody');
    var status = $('invDirAdminStatus');
    var canPublish = !!(state.directedDraft.length || state.directedRows.length);
    if ($('invDirPublish')) $('invDirPublish').disabled = !state.directedDraft.length;
    if ($('invDirExportJson')) $('invDirExportJson').disabled = !canPublish;
    if ($('invDirClearPlan')) $('invDirClearPlan').disabled = !canPublish && !state.directedDraft.length;
    if (!body) return;
    if (!draft.length) {
      body.innerHTML = '<tr><td colspan="5">Sin filas</td></tr>';
      if (status) status.textContent = 'Sin plan cargado. Columnas: ubicación · código · producto · cantidad.';
      return;
    }
    var meta = state.directedDraft.length
      ? ('Borrador: ' + draft.length + ' líneas listas para publicar.')
      : ('Plan activo: ' + draft.length + ' líneas' + (state.directedMeta.publishedAt ? (' · ' + CORE.formatDateTime(state.directedMeta.publishedAt)) : ''));
    if (status) status.textContent = meta;
    body.innerHTML = draft.slice(0, 200).map(function (r) {
      return '<tr><td>' + esc(r.location) + '</td><td>' + esc(r.barcode) + '</td><td>' +
        esc(r.product || '—') + '</td><td>' + esc(r.expectedQty) + '</td><td>' +
        dirStatusLabel(r.status || 'pending') + '</td></tr>';
    }).join('');
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-inv-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') { resolve(); return; }
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('No se pudo cargar ' + src)); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.invSrc = src;
      s.onload = function () { s.dataset.loaded = '1'; resolve(); };
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureXlsx() {
    if (global.XLSX) return Promise.resolve(global.XLSX);
    return loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js').then(function () {
      if (!global.XLSX) throw new Error('SheetJS no disponible');
      return global.XLSX;
    });
  }

  function ensureConciliacion() {
    if (global.PlatformInventarioConciliacion && global.PlatformInventarioConciliacion.parseWorkbook) {
      return Promise.resolve(global.PlatformInventarioConciliacion);
    }
    return loadScriptOnce('js/platform-inventario-conciliacion.js?v=2').then(function () {
      if (!global.PlatformInventarioConciliacion) throw new Error('Parser Excel no cargado');
      return global.PlatformInventarioConciliacion;
    });
  }

  function parseDirectedExcel(file) {
    return Promise.all([ensureXlsx(), ensureConciliacion()]).then(function (pair) {
      var XLSX = pair[0];
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
            var CONC = pair[1];
            if (!CONC || !CONC.parseWorkbook) {
              reject(new Error('Parser Excel no cargado'));
              return;
            }
            var parsed = CONC.parseWorkbook(wb, file.name);
            var rows = (parsed.rows || []).map(function (r, i) {
              return {
                id: 'd' + i + '-' + Date.now(),
                location: r.location,
                barcode: r.barcode,
                product: r.product || '',
                expectedQty: r.qtyCj != null ? r.qtyCj : (r.expectedQty || 0),
                matricula: r.matricula || '',
                status: 'pending',
                countedQty: null,
                countedAt: null,
                countedBy: ''
              };
            }).filter(function (r) { return r.location && r.barcode; });
            resolve({ rows: rows, meta: parsed.meta || { fileName: file.name } });
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () { reject(new Error('No se pudo leer el archivo')); };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function onDirectedExcelPicked(file) {
    if (!file) return;
    if ($('invDirAdminStatus')) $('invDirAdminStatus').textContent = 'Leyendo Excel…';
    parseDirectedExcel(file).then(function (parsed) {
      state.directedDraft = parsed.rows || [];
      state.directedMeta = Object.assign({}, parsed.meta || {}, { fileName: file.name });
      renderDirectedAdmin();
      toast(state.directedDraft.length + ' líneas cargadas del Excel', 'ok');
    }).catch(function (err) {
      toast((err && err.message) || 'Error al leer Excel', 'err');
      if ($('invDirAdminStatus')) $('invDirAdminStatus').textContent = 'Error al leer el archivo.';
    });
  }

  function publishDirectedDraft() {
    if (!state.directedDraft.length) {
      toast('Primero adjunte un Excel', 'err');
      return;
    }
    var meta = {
      fileName: (state.directedMeta && state.directedMeta.fileName) || '',
      publishedBy: state.user ? state.user.employeeId : 'admin'
    };
    SYNC.publishDirectedPlan(state.directedDraft, meta).then(function (res) {
      state.directedRows = (res && res.rows) || state.directedDraft;
      state.directedMeta = (res && res.meta) || meta;
      state.directedDraft = [];
      state.directedActiveId = state.directedRows.length ? state.directedRows[0].id : null;
      renderDirectedAdmin();
      renderDirectedQueue();
      var note = res && res.cloudError
        ? ('Publicado en este equipo. Nube: ' + res.cloudError + ' — use Exportar JSON para celulares.')
        : (res && res.offline
          ? 'Publicado en este equipo. Exporte JSON e impórtelo en el celular si no comparte la misma nube.'
          : 'Plan publicado (nube + local).');
      if ($('invDirAdminStatus')) $('invDirAdminStatus').textContent = note;
      toast('Plan dirigido publicado', 'ok');
    });
  }

  function exportDirectedJson() {
    var rows = state.directedDraft.length ? state.directedDraft : state.directedRows;
    if (!rows.length) { toast('No hay plan para exportar', 'err'); return; }
    var payload = {
      type: 'ac001-inv-directed-plan',
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: state.directedMeta || {},
      rows: rows
    };
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plan-conteo-dirigido-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    global.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    toast('JSON exportado', 'ok');
  }

  function importDirectedJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var rows = (data && data.rows) || (Array.isArray(data) ? data : []);
        if (!rows.length) throw new Error('JSON sin líneas');
        SYNC.publishDirectedPlan(rows, data.meta || { source: 'import-json' }).then(function (res) {
          applyDirectedPlan({ rows: res.rows || rows, meta: res.meta || {} });
          toast('Plan importado: ' + (res.rows || rows).length + ' líneas', 'ok');
          setView('directed');
        });
      } catch (err) {
        toast((err && err.message) || 'JSON inválido', 'err');
      }
    };
    reader.readAsText(file);
  }

  function clearDirectedPlan() {
    if (!global.confirm('¿Limpiar el plan dirigido en este equipo?')) return;
    state.directedDraft = [];
    SYNC.publishDirectedPlan([], { clearedAt: new Date().toISOString() }).then(function () {
      state.directedRows = [];
      state.directedMeta = {};
      state.directedActiveId = null;
      renderDirectedAdmin();
      renderDirectedQueue();
      fillDirectedActive();
      toast('Plan limpiado', 'ok');
    });
  }

  function applyDirectedTyped(target) {
    var id = target === 'prod' ? 'invDirCode' : 'invDirLoc';
    var el = $(id);
    if (!el || !el.value) {
      toast('Escriba o escanee un código', 'err');
      return;
    }
    updateDirectedChips();
    toast('Código aplicado', 'ok');
  }

  function processDirectedScan(code) {
    code = String(code || '').trim();
    if (!code) return;
    var target = state.dirCamTarget || 'loc';
    if (target === 'prod') {
      if ($('invDirCode')) $('invDirCode').value = code;
    } else {
      if ($('invDirLoc')) $('invDirLoc').value = code;
    }
    updateDirectedChips();
    toast('Escaneo OK', 'ok');
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

  function syncCountFieldsFromDom() {
    var active = document.activeElement;
    var loc = $('invLoc');
    var prod = $('invProd');
    var mat = $('invMat');
    var qty = $('invQty');
    if (loc && active === loc) state.fields.loc = String(loc.value || '').trim();
    if (prod && active === prod) {
      state.fields.prod = String(prod.value || '').trim();
    }
    if (mat && active === mat) state.fields.mat = String(mat.value || '').trim();
    if (qty && (active === qty || state.step === 5)) syncQtyFromInput();
    if (state.step === 4) syncExpFromInput();
  }

  function applyCountStep() {
    syncCountFieldsFromDom();
    var step = state.step;
    var mode = state.mode;
    var f = state.fields;
    var total = state.flowSteps.length;
    var titles = ['Ubicación', 'Artículo', 'Matrícula', 'Vencimiento', 'Cantidad'];
    var phone = isPhoneViewport();
    var instr = phone
      ? ['Escanee o escriba la ubicación', 'Escanee o escriba el artículo', 'Matrícula u omitir', 'Vencimiento u omitir', 'Ingrese cantidad y guarde']
      : ['Escanee la ubicación', 'Escanee el artículo', 'Matrícula u omitir', 'Vencimiento u omitir', 'Ingrese cantidad y guarde'];
    var active = document.activeElement;

    var nextCard = $('invCardNext');
    var choosing = !!state.awaitingNextChoice && mode === 'pallet';
    if ($('invStepCounter')) {
      $('invStepCounter').textContent = choosing ? 'OK' : ((state.flowIndex + 1) + '/' + total);
    }
    if ($('invStepTitle')) {
      $('invStepTitle').textContent = choosing ? 'Siguiente ubicación' : titles[step - 1];
    }
    if ($('invInstr')) {
      $('invInstr').textContent = choosing
        ? (state.pendingNextLoc
          ? ('Secuencia: ' + (state.pendingCurrentLoc || f.loc || '—') + ' → ' + state.pendingNextLoc)
          : ('Actual: ' + (state.pendingCurrentLoc || f.loc || '—') + ' · máximo nivel 5'))
        : instr[step - 1];
    }
    if ($('invModeBadge')) $('invModeBadge').textContent = CORE.MODE_LABELS[mode] || 'PICKUP';
    if ($('invProgBar')) {
      $('invProgBar').style.width = choosing
        ? '100%'
        : (Math.round(((state.flowIndex + 1) / total) * 100) + '%');
    }

    for (var i = 1; i <= 5; i++) {
      var card = $('invCard' + i);
      if (card) {
        if (choosing) {
          card.classList.remove('active');
          card.hidden = true;
        } else {
          card.classList.toggle('active', i === step);
          card.hidden = mode === 'pickup' && i === 3;
        }
      }
    }
    if (nextCard) {
      nextCard.hidden = !choosing;
      nextCard.classList.toggle('active', choosing);
      if (choosing) {
        fillNextLocationCopy(
          $('invCardNextSub'),
          $('invCardNextUp'),
          $('invCardNextSeq'),
          state.pendingCurrentLoc || f.loc || '',
          state.pendingNextLoc || ''
        );
      }
    }
    var swipeZone = document.querySelector('#invViewCount .inv-swipe-zone');
    if (swipeZone) swipeZone.hidden = choosing;

    if (!($('invLoc') && active === $('invLoc'))) $('invLoc').value = f.loc;
    if (!($('invProd') && active === $('invProd'))) $('invProd').value = f.prod;
    if (!($('invMat') && active === $('invMat'))) $('invMat').value = f.mat;
    if ($('invExp') && active !== $('invExp')) $('invExp').value = displayToIso(f.exp);
    if (!($('invQty') && active === $('invQty'))) $('invQty').value = f.qty;
    $('invPname').textContent = f.prodName || '—';

    var brand = $('invCountBrand');
    if (brand) {
      if (f.loc) {
        brand.textContent = f.loc;
        brand.classList.add('is-loc');
        brand.title = f.loc;
      } else {
        brand.textContent = 'Almacén Central';
        brand.classList.remove('is-loc');
        brand.title = '';
      }
    }

    var ctx = $('invCountContext');
    var hasCtx = !!(f.loc || f.prod || f.prodName);
    if (ctx) ctx.hidden = !hasCtx;
    if ($('invCtxLoc')) $('invCtxLoc').textContent = f.loc || '—';
    if ($('invCtxCode')) $('invCtxCode').textContent = f.prod || '—';
    if ($('invCtxName')) {
      $('invCtxName').textContent = f.prodName || (f.prod ? 'Sin descripción' : '—');
      $('invCtxName').title = f.prodName || '';
    }

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
      } else if (f.loc && mode === 'pickup') {
        rackBanner.hidden = false;
        rackBanner.textContent = 'PICKUP · Conteo #' + state.countRound;
        rackBanner.className = 'inv-rack-banner';
      } else if (f.loc) {
        rackBanner.hidden = false;
        rackBanner.textContent = 'Conteo #' + state.countRound;
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
      hint.textContent = 'Deslice ▶ para CONTINUAR · use el botón Omitir si no aplica';
      labelR.textContent = 'CONTINUAR ▶';
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
        ? ('En sistema: ' + state.catalogMat + ' — o pulse Omitir')
        : 'Opcional — escanee, escriba o pulse Omitir';
    }
  }

  function isoToDisplay(iso) {
    var s = String(iso || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      var p = s.slice(0, 10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }

  function displayToIso(d) {
    var s = String(d || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }

  function setPreviewField(id, text, hi) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = hi ? 'hi' : 'dim';
  }

  function goBackStep() {
    if (state.awaitingNextChoice) {
      toast('Elija: próximo nivel o nueva ubicación', 'err');
      return;
    }
    if (state.flowIndex <= 0) return;
    state.flowIndex--;
    state.step = state.flowSteps[state.flowIndex];
    applyCountStep();
    toast('Paso anterior');
  }

  function levelTokenFromLoc(loc) {
    var m = /^(.*-)(\d{1,2})$/.exec(String(loc || '').trim().toUpperCase().replace(/\s+/g, ''));
    return m ? parseInt(m[2], 10) : NaN;
  }

  function renderLevelSequence(seqEl, currentLoc, nextLoc) {
    if (!seqEl) return;
    var cur = levelTokenFromLoc(currentLoc);
    var nxt = levelTokenFromLoc(nextLoc);
    var html = '';
    for (var lvl = 2; lvl <= 5; lvl++) {
      var cls = '';
      if (!isNaN(cur) && lvl === cur) cls = ' is-current';
      else if (!isNaN(nxt) && lvl === nxt) cls = ' is-next';
      html += '<span class="' + cls.trim() + '">' + lvl + '</span>';
    }
    seqEl.innerHTML = html;
  }

  function fillNextLocationCopy(subEl, upEl, seqEl, currentLoc, nextLoc) {
    if (subEl) {
      subEl.textContent = nextLoc
        ? ('Actual: ' + currentLoc + ' · Próximo arriba: ' + nextLoc)
        : ('Actual: ' + currentLoc + ' · Máximo nivel 5 · digite una nueva ubicación');
    }
    if (upEl) {
      upEl.hidden = !nextLoc;
      upEl.disabled = !nextLoc;
      upEl.textContent = nextLoc
        ? ('Continuar al próximo nivel (arriba) · ' + nextLoc)
        : 'Continuar al próximo nivel (arriba)';
    }
    renderLevelSequence(seqEl, currentLoc, nextLoc);
  }

  function advanceStep() {
    if (state.flowIndex >= state.flowSteps.length - 1) return;
    state.flowIndex++;
    state.step = state.flowSteps[state.flowIndex];
    applyCountStep();
  }

  function omitMatricula() {
    if (state.step !== 3) return;
    state.fields.mat = '';
    if ($('invMat')) $('invMat').value = '';
    advanceStep();
    toast('Matrícula omitida');
  }

  function omitVencimiento() {
    if (state.step !== 4) return;
    state.fields.exp = '';
    if ($('invExp')) $('invExp').value = '';
    advanceStep();
    toast('Vencimiento omitido');
  }

  function syncExpFromInput() {
    var el = $('invExp');
    if (!el) return;
    state.fields.exp = isoToDisplay(el.value);
  }

  function swipeConfirm() {
    if (state.awaitingNextChoice) {
      toast('Elija: próximo nivel o nueva ubicación', 'err');
      return;
    }
    if (state.camStream || state.html5Qr || state.camBusy) {
      toast('Cierre la cámara para continuar', 'err');
      return;
    }
    syncCountFieldsFromDom();
    if (state.step === 5) {
      saveEntry();
      return;
    }
    if (state.step === 1) {
      applyTypedCode('loc');
      return;
    }
    if (state.step === 2) {
      applyTypedCode('prod');
      return;
    }
    if (state.step === 3) {
      state.fields.mat = ($('invMat') && String($('invMat').value || '').trim()) || state.fields.mat || '';
      if (!state.fields.mat) {
        toast('Escanee matrícula o pulse Omitir', 'err');
        return;
      }
      advanceStep();
      toast('Matrícula OK', 'ok');
      return;
    }
    if (state.step === 4) {
      syncExpFromInput();
      if (!state.fields.exp) {
        toast('Elija fecha o pulse Omitir', 'err');
        return;
      }
      advanceStep();
      toast('Vence ' + state.fields.exp, 'ok');
      return;
    }
    toast('Complete este paso para continuar', 'err');
  }

  function applyTypedCode(target) {
    var map = { loc: 'invLoc', prod: 'invProd', mat: 'invMat' };
    var el = $(map[target]);
    var code = el ? String(el.value || '').trim() : '';
    if (!code) {
      if (target === 'loc') toast('Escanee o escriba la ubicación', 'err');
      else if (target === 'prod') toast('Escanee o escriba el artículo', 'err');
      else toast('Escanee o escriba el código', 'err');
      return;
    }
    if (target === 'loc') state.fields.loc = code;
    if (target === 'prod') state.fields.prod = code;
    if (target === 'mat') state.fields.mat = code;
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
    if (state.view === 'directedCount') processDirectedScan(code);
    else processScan(code);
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
    if (state.view !== 'count' && state.view !== 'directedCount') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Este celular no permite cámara. Escriba el código y pulse Usar código.', 'err');
      return;
    }
    stopCamera();
    state.camTarget = target || 'loc';
    if (state.view === 'directedCount') state.dirCamTarget = target || 'loc';
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
      var artCheck = CORE.validateArticleInput(code);
      if (!artCheck.ok) {
        toast(artCheck.message || 'Artículo no válido', 'err');
        return;
      }
      if (artCheck.vacia) {
        f.prod = 'Vacia';
        f.prodName = 'UBICACIÓN VACÍA';
        f.expectedQty = 0;
        state.catalogMat = '';
        if ($('invPname')) $('invPname').textContent = f.prodName;
        state.flowIndex = state.flowSteps.indexOf(state.mode === 'pickup' ? 4 : 3);
        state.step = state.mode === 'pickup' ? 4 : 3;
        applyCountStep();
        toast('Artículo: Vacia', 'ok');
        return;
      }
      SYNC.lookupPairCode(code).then(function (pair) {
        if (pair) {
          f.mat = code;
          f.prod = pair.articleCode;
          f.prodName = pair.productName;
          if ($('invPname')) $('invPname').textContent = f.prodName || '—';
          state.flowIndex = state.flowSteps.indexOf(4);
          state.step = 4;
          applyCountStep();
          toast('Matrícula detectada → vencimiento', 'ok');
          return;
        }
        return SYNC.lookupCatalog(code, f.loc).then(function (cat) {
          if (!cat || !cat.name) {
            toast('Código no encontrado en CODIGOS', 'err');
            f.prodName = '';
            if ($('invPname')) $('invPname').textContent = 'Sin descripción';
            return;
          }
          f.prod = code;
          f.prodName = cat.name;
          state.catalogMat = cat.matricula || '';
          if (cat.expectedQty) f.expectedQty = cat.expectedQty;
          if ($('invPname')) $('invPname').textContent = f.prodName;
          state.flowIndex = state.flowSteps.indexOf(state.mode === 'pickup' ? 4 : 3);
          state.step = state.mode === 'pickup' ? 4 : 3;
          applyCountStep();
          toast('Artículo OK · ' + cat.name, 'ok');
        });
      });
    } else if (state.step === 3) {
      f.mat = code;
      advanceStep();
      toast('Matrícula OK', 'ok');
    } else if (state.step === 4) {
      f.exp = isoToDisplay(code.length >= 6 ? code : '');
      if (!f.exp && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(code)) f.exp = code;
      if ($('invExp') && displayToIso(f.exp)) $('invExp').value = displayToIso(f.exp);
      advanceStep();
      toast(f.exp ? ('Vencimiento OK · ' + f.exp) : 'Vencimiento vacío', 'ok');
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

  function syncQtyFromInput() {
    var el = $('invQty');
    if (!el) return state.fields.qty;
    var raw = String(el.value == null ? '' : el.value).trim();
    if (raw === '') {
      state.fields.qty = '0';
      return state.fields.qty;
    }
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) n = 0;
    state.fields.qty = String(n);
    return state.fields.qty;
  }

  function saveEntry(opts) {
    opts = opts || {};
    var f = state.fields;
    var u = state.user;
    syncQtyFromInput();
    if (!u) { toast('Sesión expirada', 'err'); return; }
    if (!f.loc) { toast('Falta ubicación', 'err'); return; }
    if (!f.prod && String(f.qty) !== '0') { toast('Falta artículo', 'err'); return; }
    var unit = state.mode === 'pickup' && state.pickupUnit === 'unit' ? 'UND' : 'CJ';
    var dbl = CORE.isDoubleRackLocation(f.loc);
    var passes = dbl === true ? 2 : 1;
    var banner = CORE.rackPassBanner(f.loc, state.countRound);
    var qtyNum = parseInt(f.qty, 10);
    if (isNaN(qtyNum) || qtyNum < 0) qtyNum = 0;

    SYNC.insertEntry({
      barcode: f.prod,
      productName: f.prodName || '',
      quantity: qtyNum,
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
      var savedLoc = String(f.loc || '').trim();
      toast(msg + ' · ' + qtyNum + ' ' + unit + passTxt, 'ok');
      f.prod = '';
      f.mat = '';
      f.exp = '';
      f.qty = '1';
      f.prodName = '';
      f.expectedQty = 0;
      state.catalogMat = '';
      renderAdminStats();

      function goArticleStep(keepGoing) {
        state.awaitingNextChoice = false;
        state.flowIndex = state.flowSteps.indexOf(2);
        state.step = 2;
        applyCountStep();
        if (keepGoing && isPhoneViewport() && state.continuous) {
          global.setTimeout(function () { openCamera('prod'); }, 350);
        }
      }

      // Conteo de ubicaciones: siempre preguntar (arriba o nueva)
      if (state.mode === 'pallet') {
        var advanced = CORE.nextLocationLevel ? CORE.nextLocationLevel(savedLoc, 5) : null;
        state.keepGoingAfterChoice = !!(opts.keepGoing && state.continuous);
        state.pendingCurrentLoc = savedLoc;
        state.pendingNextLoc = advanced || '';
        state.awaitingNextChoice = true;
        // Mantener ubicación visible en encabezado mientras elige
        f.loc = savedLoc;
        state.flowIndex = Math.max(0, state.flowSteps.indexOf(5));
        state.step = 5;
        showNextLocationChoice(savedLoc, advanced || '');
        return;
      }

      // Pickup / otros: mantener ubicación y pedir siguiente artículo
      goArticleStep(opts.keepGoing);
    }).catch(function (err) {
      toast((err && err.message) ? ('Error al guardar: ' + err.message) : 'Error al guardar en la nube', 'err');
    });
  }

  function showNextLocationChoice(currentLoc, nextLoc) {
    fillNextLocationCopy(
      $('invNextLocSub'),
      $('invNextLocUp'),
      $('invNextLocSeq'),
      currentLoc,
      nextLoc
    );
    var overlay = $('invNextLocOverlay');
    if (overlay) {
      overlay.hidden = false;
      overlay.classList.add('is-open');
    }
    // Asegura tarjeta inline visible aunque el overlay falle en algún WebView
    state.awaitingNextChoice = true;
    applyCountStep();
  }

  function hideNextLocationChoice() {
    var overlay = $('invNextLocOverlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('is-open');
    }
    state.awaitingNextChoice = false;
    var nextCard = $('invCardNext');
    if (nextCard) {
      nextCard.hidden = true;
      nextCard.classList.remove('active');
    }
    var swipeZone = document.querySelector('#invViewCount .inv-swipe-zone');
    if (swipeZone) swipeZone.hidden = false;
  }

  function chooseNextLevelUp() {
    var nextLoc = state.pendingNextLoc;
    if (!nextLoc) {
      toast('No hay nivel superior. Digite una nueva ubicación.', 'err');
      return;
    }
    hideNextLocationChoice();
    state.fields.loc = nextLoc;
    var keepGoing = state.keepGoingAfterChoice;
    state.keepGoingAfterChoice = false;
    state.pendingNextLoc = '';
    state.pendingCurrentLoc = '';
    SYNC.countRoundForLocation(nextLoc, '_').then(function (n) {
      state.countRound = n;
      state.flowIndex = state.flowSteps.indexOf(2);
      state.step = 2;
      applyCountStep();
      toast('Siguiente nivel · ' + nextLoc, 'ok');
      if (keepGoing && isPhoneViewport() && state.continuous) {
        global.setTimeout(function () { openCamera('prod'); }, 350);
      }
    }).catch(function () {
      state.countRound = 1;
      state.flowIndex = state.flowSteps.indexOf(2);
      state.step = 2;
      applyCountStep();
      toast('Siguiente nivel · ' + nextLoc, 'ok');
    });
  }

  function chooseNewLocation() {
    hideNextLocationChoice();
    state.pendingNextLoc = '';
    state.pendingCurrentLoc = '';
    state.keepGoingAfterChoice = false;
    state.fields.loc = '';
    state.countRound = 1;
    state.flowIndex = state.flowSteps.indexOf(1);
    state.step = 1;
    applyCountStep();
    toast('Digite o escanee la nueva ubicación', 'ok');
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
        var id = esc(e.id || '');
        return '<article class="inv-record-item" data-entry-id="' + id + '">' +
          '<div class="inv-record-top">' +
            '<div class="inv-record-loc">' + esc(e.zone) + '</div>' +
            '<button type="button" class="inv-record-del" data-inv-del="' + id + '" aria-label="Borrar registro">Borrar</button>' +
          '</div>' +
          '<div class="inv-record-prod">' + esc(e.productName || e.barcode) + '</div>' +
          '<div class="inv-record-code">' + esc(e.barcode || '—') + '</div>' +
          '<div class="inv-record-cycle' + (m.re ? ' re' : '') + '">' + esc(m.label) + '</div>' +
          '<div class="inv-record-meta">' + esc(e.quantity + ' ' + (e.unit || 'CJ')) + ' · ' +
          esc(e.userId) + ' · ' + esc(CORE.formatDateTime(e.createdAt)) +
          (e.synced === false ? ' · <span class="pending">Pendiente</span>' : '') +
          '</div></article>';
      }).join('') : '<p class="inv-empty">Sin registros aún.</p>';
      if ($('invRecordsList')) $('invRecordsList').innerHTML = html;
    });
  }

  function confirmDeleteOne(id) {
    id = String(id || '').trim();
    if (!id) {
      toast('Registro sin id', 'err');
      return;
    }
    var entry = (state.entries || []).filter(function (e) { return String(e.id) === id; })[0];
    var label = entry
      ? ((entry.zone || '') + ' · ' + (entry.barcode || '') + ' · ' + (entry.productName || ''))
      : id;
    if (!global.confirm('¿Desea borrar este registro con error?\n\n' + label + '\n\nAceptar = Sí · Cancelar = No')) return;
    SYNC.deleteEntryById(id).then(function () {
      toast('Registro eliminado', 'ok');
      renderRecords();
      renderAdminStats();
    }).catch(function () {
      toast('Error al eliminar el registro', 'err');
    });
  }

  function exportCsv() {
    SYNC.fetchEntries().then(function (list) {
      return SYNC.ensureCodigosCatalog().then(function () {
        return Promise.all((list || []).map(function (e) {
          var base = {
            created_at: e.createdAt,
            user_id: e.userId,
            zone: e.zone,
            warehouse: e.warehouse,
            barcode: e.barcode,
            matricula: e.matricula,
            expiration_date: e.expirationDate,
            product_name: e.productName || '',
            unit: e.unit,
            quantity: e.quantity,
            expected_qty: e.expectedQty,
            count_mode: e.countMode,
            count_number: e.countNumber
          };
          if (base.product_name) return base;
          return SYNC.lookupCatalog(e.barcode || '', e.zone || '').then(function (cat) {
            if (cat && cat.name) base.product_name = cat.name;
            return base;
          });
        }));
      }).then(function (rows) {
        var csv = CORE.entriesToCsv(rows);
        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'inventario-dc-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        toast('CSV descargado (SKU + Descripción)', 'ok');
      });
    }).catch(function () {
      toast('No se pudo exportar', 'err');
    });
  }

  function confirmDeleteAll() {
    if (!global.confirm('¿Desea borrar los registros?\n\nAceptar = Sí · Cancelar = No')) return;
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
    var btnBack = $('invSwipeLabelL');
    var btnNext = $('invSwipeLabelR');
    if (!thumb || !track || thumb.dataset.bound) return;
    thumb.dataset.bound = '1';
    var dragging = false;
    var startX = 0;
    var startTx = 0;
    var max = 100;
    var moved = 0;

    function resetThumb() {
      thumb._tx = 0;
      thumb.style.transform = 'translateX(-50%)';
      dragging = false;
      startX = 0;
      moved = 0;
    }

    function onStart(x, e) {
      if (state.view !== 'count') return;
      if (state.camStream || state.html5Qr) return;
      dragging = true;
      startX = x;
      startTx = 0;
      moved = 0;
      max = Math.max(48, (track.offsetWidth - thumb.offsetWidth) / 2 - 10);
      thumb.style.transition = 'none';
      if (e && e.cancelable) e.preventDefault();
    }

    function onMove(x) {
      if (!dragging) return;
      var delta = Math.max(-max, Math.min(max, startTx + x - startX));
      moved = Math.abs(delta);
      thumb._tx = delta;
      thumb.style.transform = 'translateX(calc(-50% + ' + delta + 'px))';
    }

    function onEnd() {
      if (!dragging) return;
      var tx = thumb._tx || 0;
      var threshold = max * 0.72;
      thumb.style.transition = 'transform 0.18s ease';
      dragging = false;
      if (moved >= 18 && tx <= -threshold) {
        resetThumb();
        goBackStep();
        return;
      }
      if (moved >= 18 && tx >= threshold) {
        resetThumb();
        swipeConfirm();
        return;
      }
      resetThumb();
    }

    thumb.addEventListener('mousedown', function (e) {
      onStart(e.clientX, e);
    });
    global.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      onMove(e.clientX);
    });
    global.addEventListener('mouseup', function () {
      if (!dragging) return;
      onEnd();
    });
    thumb.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      onStart(e.touches[0].clientX, e);
    }, { passive: false });
    thumb.addEventListener('touchmove', function (e) {
      if (!dragging || !e.touches || !e.touches.length) return;
      onMove(e.touches[0].clientX);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    thumb.addEventListener('touchend', onEnd);
    thumb.addEventListener('touchcancel', resetThumb);

    if (btnBack && !btnBack.dataset.bound) {
      btnBack.dataset.bound = '1';
      btnBack.addEventListener('click', function (e) {
        e.preventDefault();
        if (state.view !== 'count') return;
        goBackStep();
      });
    }
    if (btnNext && !btnNext.dataset.bound) {
      btnNext.dataset.bound = '1';
      btnNext.addEventListener('click', function (e) {
        e.preventDefault();
        if (state.view !== 'count') return;
        swipeConfirm();
      });
    }
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

    ['invModePickup', 'invModePallet', 'invModeDirigido'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('click', function () {
        pickMode(el.getAttribute('data-mode'));
      });
    });

    $('invBtnQtyBox') && $('invBtnQtyBox').addEventListener('click', function () { setPickupUnit('box'); });
    $('invBtnQtyUnit') && $('invBtnQtyUnit').addEventListener('click', function () { setPickupUnit('unit'); });
    $('invBtnOmitMat') && $('invBtnOmitMat').addEventListener('click', omitMatricula);
    $('invBtnOmitExp') && $('invBtnOmitExp').addEventListener('click', omitVencimiento);
    $('invNextLocUp') && $('invNextLocUp').addEventListener('click', chooseNextLevelUp);
    $('invNextLocNew') && $('invNextLocNew').addEventListener('click', chooseNewLocation);
    $('invCardNextUp') && $('invCardNextUp').addEventListener('click', chooseNextLevelUp);
    $('invCardNextNew') && $('invCardNextNew').addEventListener('click', chooseNewLocation);
    if ($('invExp')) {
      $('invExp').addEventListener('change', function () {
        syncExpFromInput();
        applyCountStep();
      });
      $('invExp').addEventListener('focus', function () {
        if (typeof this.showPicker === 'function') {
          try { this.showPicker(); } catch (ePick) { /* noop */ }
        }
      });
    }
    if ($('invQty')) {
      $('invQty').addEventListener('input', syncQtyFromInput);
      $('invQty').addEventListener('change', syncQtyFromInput);
    }
    if ($('invProd')) {
      var prodPreviewTimer = null;
      $('invProd').addEventListener('input', function () {
        var raw = String($('invProd').value || '').trim();
        state.fields.prod = raw;
        if (prodPreviewTimer) global.clearTimeout(prodPreviewTimer);
        if (!raw) {
          state.fields.prodName = '';
          if ($('invPname')) {
            $('invPname').textContent = '—';
            $('invPname').className = 'inv-prod-name';
          }
          return;
        }
        if (CORE.isVaciaArticle(raw)) {
          state.fields.prodName = 'UBICACIÓN VACÍA';
          if ($('invPname')) {
            $('invPname').textContent = state.fields.prodName;
            $('invPname').className = 'inv-prod-name inv-prod-name--ok';
          }
          return;
        }
        var chk = CORE.validateArticleInput(raw);
        if (!chk.ok) {
          if ($('invPname')) {
            $('invPname').textContent = chk.message;
            $('invPname').className = 'inv-prod-name inv-prod-name--bad';
          }
          return;
        }
        prodPreviewTimer = global.setTimeout(function () {
          SYNC.lookupCatalog(raw, state.fields.loc).then(function (cat) {
            if (String($('invProd').value || '').trim() !== raw) return;
            if (cat && cat.name) {
              state.fields.prodName = cat.name;
              if ($('invPname')) {
                $('invPname').textContent = cat.name;
                $('invPname').className = 'inv-prod-name inv-prod-name--ok';
              }
            } else if ($('invPname')) {
              $('invPname').textContent = 'Código no encontrado en CODIGOS';
              $('invPname').className = 'inv-prod-name inv-prod-name--bad';
            }
          });
        }, 220);
      });
    }

    bindAll('[data-inv-nav="admin"]', function () { stopCamera(); setView('admin'); });
    bindAll('[data-inv-nav="records"]', function () { stopCamera(); setView('records'); });
    bindAll('[data-inv-nav="count"]', function () { stopCamera(); setView('count'); });
    bindAll('[data-inv-nav="mode"]', function () { stopCamera(); setView('mode'); });
    bindAll('[data-inv-nav="directed"]', function () { stopCamera(); setView('directed'); });
    bindAll('[data-inv-nav="directed-count"]', function () { stopCamera(); setView('directedCount'); });

    bindAll('[data-inv-action="export"]', exportCsv);
    bindAll('[data-inv-action="delete-all"]', confirmDeleteAll);
    if ($('invRecordsList') && !$('invRecordsList').dataset.delBound) {
      $('invRecordsList').dataset.delBound = '1';
      $('invRecordsList').addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-inv-del]') : null;
        if (!btn) return;
        ev.preventDefault();
        confirmDeleteOne(btn.getAttribute('data-inv-del'));
      });
    }
    $('invBtnTestSb') && $('invBtnTestSb').addEventListener('click', testSupabase);
    $('invBtnSetupSb') && $('invBtnSetupSb').addEventListener('click', showSupabaseSetup);

    $('invDirPickExcel') && $('invDirPickExcel').addEventListener('click', function () {
      var f = $('invDirExcelFile');
      if (f) f.click();
    });
    $('invDirExcelFile') && $('invDirExcelFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      onDirectedExcelPicked(file);
      this.value = '';
    });
    $('invDirPublish') && $('invDirPublish').addEventListener('click', publishDirectedDraft);
    $('invDirExportJson') && $('invDirExportJson').addEventListener('click', exportDirectedJson);
    $('invDirClearPlan') && $('invDirClearPlan').addEventListener('click', clearDirectedPlan);
    $('invDirRefresh') && $('invDirRefresh').addEventListener('click', function () {
      loadDirectedPlan(true).then(function () { toast('Plan actualizado', 'ok'); });
    });
    $('invDirImportBtn') && $('invDirImportBtn').addEventListener('click', function () {
      var f = $('invDirImportFile');
      if (f) f.click();
    });
    $('invDirImportFile') && $('invDirImportFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      importDirectedJson(file);
      this.value = '';
    });
    $('invDirValidate') && $('invDirValidate').addEventListener('click', validateDirectedSave);
    $('invDirNext') && $('invDirNext').addEventListener('click', nextDirectedLine);
    ['invDirLoc', 'invDirCode', 'invDirQty'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', updateDirectedChips);
    });
    document.querySelectorAll('[data-inv-dir-camera]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCamera(btn.getAttribute('data-inv-dir-camera') || 'loc');
      });
    });
    document.querySelectorAll('[data-inv-dir-apply]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyDirectedTyped(btn.getAttribute('data-inv-dir-apply') || 'loc');
      });
    });

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
    function bindDirEnter(id, target) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        applyDirectedTyped(target);
      });
    }
    bindDirEnter('invDirLoc', 'loc');
    bindDirEnter('invDirCode', 'prod');

    document.addEventListener('keydown', function (e) {
      if (state.view === 'directedCount') {
        if (e.key === 'Escape' && (state.camStream || state.html5Qr)) { stopCamera(); e.preventDefault(); }
        return;
      }
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
      if (state.view !== 'count' && state.view !== 'directedCount') return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter' && scanBuf.length > 2) {
        if (state.view === 'directedCount') processDirectedScan(scanBuf);
        else processScan(scanBuf);
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
    SYNC.onChange(function (kind, payload) {
      if (kind === 'sync' || kind === 'entry' || kind === 'clear') {
        if (state.view === 'records') renderRecords();
        if (state.view === 'admin') renderAdminStats();
        updateCloudBadge();
      }
      if (kind === 'directed') {
        applyDirectedPlan(payload || { rows: [], meta: {} });
      }
    });
    // Arranque rápido: sesión y badge primero; catálogo/plan en segundo plano
    SYNC.init().then(function () {
      updateCloudBadge();
      tryRestoreSession();
    }).catch(function () {
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
