/**
 * Portal Meta de Productividad · Despacho
 * Plan del día → desafío por rol (bancada, pickers, MC, despachadores)
 */
(function () {
  'use strict';

  var TURNOS = 2;
  var HORAS = 7;
  var CAJAS_PALETA = 50;
  var STORAGE_KEY = 'ac001.dimDespacho.plan.v1';

  function $(id) { return document.getElementById(id); }

  function round(n) {
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  function fmt(n) {
    return round(n).toLocaleString('es-DO');
  }

  function fechaHoy() {
    var parts = new Intl.DateTimeFormat('es-DO', {
      timeZone: 'America/Santo_Domingo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(new Date());
    function get(t) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === t) return parts[i].value;
      }
      return '';
    }
    return get('day') + '-' + get('month') + '-' + get('year');
  }

  function readPlan() {
    return {
      cajas: Number($('cajas').value) || 0,
      idCargas: Number($('camiones').value) || 0,
      pickers: Math.max(1, Number($('pickers').value) || 1),
      mc: Math.max(1, Number($('mc').value) || 1),
      bancada: Math.max(1, Number($('bancada').value) || 1),
      desp: Math.max(1, Number($('desp').value) || 1),
    };
  }

  function savePlan(plan) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch (e) { /* ignore */ }
  }

  function loadPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var plan = JSON.parse(raw);
      if (plan.cajas != null) $('cajas').value = plan.cajas;
      if (plan.idCargas != null) $('camiones').value = plan.idCargas;
      if (plan.pickers != null) $('pickers').value = plan.pickers;
      if (plan.mc != null) $('mc').value = plan.mc;
      if (plan.bancada != null) $('bancada').value = plan.bancada;
      if (plan.desp != null) $('desp').value = plan.desp;
    } catch (e) { /* ignore */ }
  }

  function calc() {
    var plan = readPlan();
    savePlan(plan);

    var cajasTurno = plan.cajas / TURNOS;
    var paletasTurno = cajasTurno / CAJAS_PALETA;
    var idcTurno = plan.idCargas / TURNOS;

    var metaCajas = cajasTurno / plan.pickers;
    var metaCajasHora = metaCajas / HORAS;
    var metaPaletas = paletasTurno / plan.mc;
    var metaCamiones = idcTurno / plan.desp;
    var metaCargasHora = metaCamiones / HORAS;
    var metaIdc = idcTurno / plan.bancada;
    var metaIdcHora = metaIdc / HORAS;

    $('fechaMeta').textContent = fechaHoy();
    $('totCajas').textContent = fmt(cajasTurno);
    $('totPaletas').textContent = fmt(paletasTurno);
    $('totIdc').textContent = fmt(idcTurno);

    $('bancadaTurno').textContent = fmt(metaIdc);
    $('bancadaHora').textContent = fmt(metaIdcHora);
    $('pickTurno').textContent = fmt(metaCajas);
    $('pickHora').textContent = fmt(metaCajasHora);
    $('mcTurno').textContent = fmt(metaPaletas);
    $('despTurno').textContent = fmt(metaCamiones);
    $('despHora').textContent = fmt(metaCargasHora);
  }

  function init() {
    loadPlan();
    ['cajas', 'camiones', 'pickers', 'mc', 'bancada', 'desp'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', calc);
    });
    calc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
