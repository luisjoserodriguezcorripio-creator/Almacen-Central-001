/**
 * Verificación estática post-eliminación de Línea de Trabajo.
 * Ejecutar: node scripts/verify-platform.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FAIL = [];

function fail(msg) {
  FAIL.push(msg);
  console.error('FAIL:', msg);
}

function ok(msg) {
  console.log('OK:', msg);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function loadScript(rel, globalObj) {
  const code = read(rel);
  vm.runInNewContext(code, globalObj, { filename: rel });
}

// 1. Scripts referenciados en index.html + portal despacho
const html = read('index.html');
const despHtml = read('despacho.html');
if (!fs.existsSync(path.join(ROOT, 'despacho.html'))) fail('despacho.html missing');
else ok('despacho.html portal exists');

if (!fs.existsSync(path.join(ROOT, 'server', 'lan-server.js'))) fail('server/lan-server.js missing');
else ok('LAN server script exists');

if (!html.includes('platform-lan-sync.js')) fail('index.html missing platform-lan-sync.js');
else ok('index.html includes LAN sync client');
const scriptSrcs = [...html.matchAll(/src="(js\/[^"]+\.js)"/g)].map((m) => m[1]);
scriptSrcs.forEach((src) => {
  const full = path.join(ROOT, src);
  if (!fs.existsSync(full)) fail('Script missing: ' + src);
});
if (!FAIL.length) ok('All ' + scriptSrcs.length + ' local scripts from index.html exist');

const despScriptSrcs = [...despHtml.matchAll(/src="(js\/[^"]+\.js)"/g)].map((m) => m[1]);
despScriptSrcs.forEach((src) => {
  const full = path.join(ROOT, src);
  if (!fs.existsSync(full)) fail('Despacho script missing: ' + src);
});
if (!FAIL.some((f) => f.includes('Despacho script'))) ok('All ' + despScriptSrcs.length + ' scripts from despacho.html exist');

if (!despHtml.includes('desp-auth-role-picker') || !despHtml.includes('data-role="validador"')) {
  fail('despacho.html missing preparador/validador role picker');
} else {
  ok('despacho.html has despacho role picker (preparador/validador)');
}

if (!html.includes('auth-external-portal') || !html.includes('despacho.html')) {
  fail('index.html missing external despacho portal entry');
} else {
  ok('index.html has despacho portal entry card');
}

if (/auth-role-picker[\s\S]*?data-role="validador"/.test(html)) {
  fail('index.html main login must not include Validador role card');
} else {
  ok('index.html main login excludes Validador role card');
}

// 2. No referencias rotas a módulos eliminados (excepto migración/legacy)
const forbidden = [
  /PlatformExcelLineaTrabajo/,
  /PlatformLineaTrabajoUI/,
  /module-linea-trabajo/,
  /chipLtStatus/,
  /adminDropZoneLinea/,
  /getLineaTrabajoMeta/,
  /renderLineaTrabajo/
];
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
jsFiles.forEach((file) => {
  const content = read('js/' + file);
  forbidden.forEach((re) => {
    if (re.test(content)) fail('Forbidden ref ' + re + ' in js/' + file);
  });
});
if (!FAIL.some((f) => f.includes('Forbidden'))) ok('No broken Linea module references in js/');

// 3. Cargar módulos core en sandbox
const g = {
  window: {},
  document: {
    documentElement: { getAttribute: () => 'dark', setAttribute: () => {} },
    body: { classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {}
  },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] || null; },
    setItem(k, v) { this._d[k] = v; },
    removeItem(k) { delete this._d[k]; }
  },
  console,
  Chart: undefined,
  XLSX: undefined,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Intl: global.Intl,
  Blob: global.Blob,
  URL: global.URL,
  SpeechSynthesisUtterance: undefined,
  speechSynthesis: { getVoices: () => [], cancel: () => {}, speak: () => {} }
};
g.window = g;
g.self = g;

const loadOrder = [
  'js/panel-core.js',
  'js/platform-utils.js',
  'js/platform-store.js',
  'js/platform-layout.js',
  'js/platform-operational-insights.js',
  'js/platform-executive-charts.js',
  'js/platform-excel-detect.js',
  'js/platform-excel-productivity.js',
  'js/platform-excel-operaciones.js',
  'js/platform-excel-facturas.js',
  'js/platform-despacho-store.js',
  'js/platform-despacho-ui.js',
  'js/platform-despacho-auth.js',
  'js/platform-admin.js',
  'js/platform-excel.js',
  'js/platform-site-filter.js',
  'js/platform-ops-dashboard.js',
  'js/platform-command-center.js',
  'js/platform-tv-dashboard.js',
  'js/platform-admin-tools.js',
  'js/platform-ai.js'
];

try {
  loadOrder.forEach((rel) => loadScript(rel, g));
  ok('Core modules load without throw');
} catch (e) {
  fail('Module load error: ' + e.message);
}

// 4. Config migration
const cfg = g.PlatformStore.getConfig();
if (cfg.activeModule === 'linea_trabajo') fail('DEFAULT_CONFIG still has linea_trabajo active');
else ok('Default activeModule is not linea_trabajo');

g.localStorage.setItem('almacen_platform_config', JSON.stringify({ activeModule: 'linea_trabajo', theme: 'dark' }));
const migrated = g.PlatformStore.getConfig();
if (migrated.activeModule !== 'general') fail('Migration linea_trabajo -> general failed');
else ok('Config migration linea_trabajo -> general works');

// 5. TV snapshot (ops + fac only)
const snap = g.PlatformTvDashboard.collectSnapshot(null, null, 58.5, {});
if (snap.lt) fail('TV snapshot still has lt block');
if (!snap.ops || !snap.fac) fail('TV snapshot missing ops/fac');
if (g.PlatformTvDashboard.TV_SLIDES.indexOf('lt') >= 0) fail('TV_SLIDES still contains lt');
else ok('TV dashboard: slides=' + g.PlatformTvDashboard.TV_SLIDES.join(','));

// 5b. Filtro operaciones — monositio cuando ubicación es bin/pasillo
(function () {
  var SF = g.PlatformSiteFilter;
  var XO = g.PlatformExcelOperaciones;
  if (!SF || !XO) {
    fail('PlatformSiteFilter or PlatformExcelOperaciones missing for ops filter test');
    return;
  }
  var opsData = {
    format: 'control',
    module: 'operaciones',
    registros: [
      { estado: 'Abierto', cantidad: 2, ubicacion: 'R01-A-01', usuario: 'Juan', fechaHora: '2026-06-01T10:00:00' },
      { estado: 'En proceso', cantidad: 1, ubicacion: 'R02-B-03', usuario: 'Ana', fechaHora: '2026-06-02T11:00:00' }
    ]
  };
  var filtered = SF.applySiteFilter({ operaciones: opsData, config: {} });
  if (!filtered.hasOperaciones || filtered.operaciones.registros.length !== 2) {
    fail('Ops site filter should assume monositio when ubicacion has no warehouse code');
  } else if (!filtered.operaciones.meta || !filtered.operaciones.meta.siteAssumed) {
    fail('Ops monositio fallback should set siteAssumed meta');
  } else {
    ok('Ops site filter: monositio fallback (' + filtered.operaciones.registros.length + ' registros)');
  }

  var ccModel = g.PlatformCommandCenter.buildModel({ operaciones: opsData, config: {} });
  if (!ccModel || !ccModel.hasOperaciones || ccModel.operaciones.totalTrabajar !== 3) {
    fail('Command center ops model empty after monositio fallback');
  } else {
    ok('Command center ops: totalTrabajar=' + ccModel.operaciones.totalTrabajar);
  }

  var snapOps = g.PlatformTvDashboard.collectSnapshot(opsData, null, 58.5, {}, {});
  if (!snapOps.ops.hasData || snapOps.ops.kpis.length !== 3) {
    fail('TV ops snapshot empty after site filter fix');
  } else {
    ok('TV ops snapshot has KPIs after site filter fix');
  }
})();

// 5c. Despacho — registro y validador
(function () {
  var DS = g.PlatformDespachoStore;
  if (!DS) {
    fail('PlatformDespachoStore missing');
    return;
  }
  var reg = DS.registrarPedido('TEST-1001', 'J-99', 'facturado', 'verify');
  if (!reg.ok || !reg.pedido) fail('Despacho registrarPedido failed');
  var val = DS.cambiarEstado(reg.pedido.id, 'pendiente_carga', 'validador');
  if (!val.ok || val.pedido.estado !== 'pendiente_carga') fail('Despacho cambiarEstado failed');
  if (!val.pedido.historial || val.pedido.historial.length < 2) fail('Despacho historial missing');
  else ok('Despacho flow: preparador → validador con historial');
  try { localStorage.removeItem(DS.STORAGE_KEY); } catch (e) { /* noop */ }
})();

// 5d. Despacho auth — sesión independiente del WMS
(function () {
  var DA = g.PlatformDespachoAuth;
  var PC = g.PanelCore;
  if (!DA || !PC) {
    fail('PlatformDespachoAuth or PanelCore missing for despacho auth test');
    return;
  }
  var prepHash = 'bc94e593460eb3d9601b27509c484088def83c9572f57d7bd3a703c32853b33a';
  var valHash = '436fd78d0e9c9b19dcbd24b853b01f06032da2239b9d590424b87549a91c68da';
  var prep = DA.authenticate('preparador', prepHash);
  var val = DA.authenticate('validador', valHash);
  if (!prep || prep.role !== 'preparador') fail('Despacho auth preparador failed');
  if (!val || val.role !== 'validador') fail('Despacho auth validador failed');
  var opAlias = DA.authenticate('operador', prepHash);
  var supAlias = DA.authenticate('supervisor', valHash);
  if (!opAlias || opAlias.role !== 'preparador') fail('Despacho auth operador alias failed');
  if (!supAlias || supAlias.role !== 'validador') fail('Despacho auth supervisor alias failed');
  if (!DA.canValidate('validador') || DA.canValidate('preparador')) {
    fail('Despacho canValidate role check failed');
  }
  PC.saveDespachoSession(prep);
  var sess = PC.getDespachoSession();
  if (!sess || sess.userId !== prep.id) fail('Despacho session save/load failed');
  if (PC.getSession && PC.getSession()) fail('Despacho session must not use WMS session key');
  PC.clearDespachoSession();
  if (PC.getDespachoSession()) fail('Despacho clearSession failed');
  else ok('Despacho auth: login + sesión panel_despacho_session separada');
})();

// 5e. Usuarios registrados — crear y autenticar personal
(function () {
  var PA = g.PlatformAdmin;
  var PC = g.PanelCore;
  if (!PA || !PC) {
    fail('PlatformAdmin or PanelCore missing for staff auth test');
    return;
  }
  var testUser = 'staff_test_' + Date.now().toString(36);
  var pass = 'ClaveStaff01';
  var hash = PC.sha256Sync(pass);
  var created = PA.createUser({
    username: testUser,
    name: 'Personal Prueba',
    role: 'supervisor',
    passwordHash: hash
  });
  if (!created.ok || !created.user) fail('createUser staff failed: ' + (created.message || ''));
  var authed = PA.authenticate(testUser, hash);
  if (!authed || authed.username !== testUser) fail('authenticate staff user failed after createUser');
  var merged = PA.mergeUserRegistries(
    PA.getUsers(),
    [{ id: 'u_remote_only', username: 'remoto1', name: 'Remoto', role: 'operador', passwordHash: hash, active: true, areas: [], extraPermissions: [] }]
  );
  if (!merged.some(function (u) { return u.username === testUser; })) fail('mergeUserRegistries dropped local staff user');
  if (!merged.some(function (u) { return u.username === 'remoto1'; })) fail('mergeUserRegistries dropped remote staff user');
  PA.deleteUser(created.user.id);
  PA.deleteUser(merged.find(function (u) { return u.username === 'remoto1'; }).id);
  var webImport = PA.importWebUsers({
    updatedAt: new Date().toISOString(),
    users: [{ id: 'u_web_only', username: 'webuser1', name: 'Web User', role: 'operador', passwordHash: hash, active: true, areas: [], extraPermissions: [] }]
  });
  if (!webImport.count) fail('importWebUsers failed');
  if (!PA.authenticate('webuser1', hash)) fail('authenticate after importWebUsers failed');
  ok('Staff users: createUser + authenticate + LAN merge + web import');
})();

// 6. Admin diagnostics — no missing required globals for Linea
const diag = g.PlatformAdminTools.runDiagnostics();
const lineaMissing = diag.modules.filter((m) => /Linea/i.test(m.label) && !m.ok);
if (lineaMissing.length) fail('Diagnostics expects removed Linea modules: ' + lineaMissing.map((m) => m.name).join(', '));
else ok('Admin diagnostics does not require Linea modules');

// 7. AI context without linea
const aiCtx = g.PlatformAI.summarize({});
aiCtx.then((r) => {
  if (String(r.text).toLowerCase().includes('línea de trabajo')) {
    fail('AI summarize still mentions linea de trabajo prominently');
  } else {
    ok('AI summarize runs without linea data');
  }

  console.log('\n--- Summary ---');
  if (FAIL.length) {
    console.error(FAIL.length + ' failure(s)');
    process.exit(1);
  }
  console.log('All checks passed (' + (10) + ' groups).');
  process.exit(0);
}).catch((e) => {
  fail('AI summarize threw: ' + e.message);
  process.exit(1);
});
