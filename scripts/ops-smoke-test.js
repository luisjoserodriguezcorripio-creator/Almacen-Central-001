/**
 * Prueba rápida — flujo operaciones (Node)
 * Ejecutar: node scripts/ops-smoke-test.js
 */
'use strict';

var vm = require('vm');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', 'js');
var window = {};

function load(file) {
  var code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(code, { window: window, document: { documentElement: { getAttribute: function () { return 'dark'; } } }, console: console }, { filename: file });
  Object.assign(global, window);
}

load('platform-excel-operaciones.js');
load('platform-ops-dashboard.js');

var yesterday = window.PlatformExcelOperaciones.getDiaAnteriorISO();
var sample = {
  format: 'control',
  fileName: 'test.xlsx',
  registros: [
    { fecha: yesterday, fechaHora: yesterday + ' 10:00', usuario: 'Juan', estado: 'Abierto', cantidad: 2, tipoTrabajo: 'Picking', ubicacion: 'A1' },
    { fecha: '2026-05-28', fechaHora: '2026-05-28 09:00', usuario: 'Maria', estado: 'En proceso', cantidad: 1, tipoTrabajo: 'Recepcion', ubicacion: 'B2' },
    { fecha: '2026-05-28', fechaHora: '2026-05-28 11:00', usuario: 'Pedro', estado: 'Cerrado', cantidad: 5, tipoTrabajo: 'Despacho', ubicacion: 'C1' }
  ]
};

var prep = window.PlatformExcelOperaciones.prepareResumenPorDiaAnterior(sample, {});
var model = window.PlatformOpsDashboard.buildModel(sample);

var ok = true;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    ok = false;
  }
}

assert(model !== null, 'buildModel debe devolver modelo con datos');
assert(model.kpis.totalTrabajar >= 0, 'kpis presentes');
assert(sample.registros.length === 3, 'datos de prueba intactos');
assert(prep.abiertosRows.length >= 1, 'abiertos del día anterior o fallback');
assert(prep.data.registros.length === 3, 'prepare no debe vaciar datos completos');

if (ok) {
  console.log('OK — operaciones smoke test passed');
  console.log('  registros:', sample.registros.length, '| abiertos tabla:', prep.abiertosRows.length, '| KPI trabajar:', model.kpis.totalTrabajar);
  process.exit(0);
}
process.exit(1);
