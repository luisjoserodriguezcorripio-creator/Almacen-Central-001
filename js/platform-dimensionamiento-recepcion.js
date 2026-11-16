/**
 * Portal Meta de Productividad · Recepción
 * Plan de contenedores → desafío por rol (validadores, ubicadores MC)
 */
(function () {
  'use strict';

  var TURNOS = 2;
  var HORAS = 7;
  var STORAGE_KEY = 'ac001.dimRecepcion.plan.v1';

  function $(id) { return document.getElementById(id); }

  function round(n) {
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  function fmt(n) {
    return round(n).toLocaleString('es-DO');
  }

  function fmtH(n) {
    return n % 1 === 0
      ? fmt(n)
      : n.toLocaleString('es-DO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
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
      contenedores: Number($('contenedores').value) || 0,
      desafioMin: Number($('desafioMin').value) || 0,
      validadores: Math.max(1, Number($('validadores').value) || 1),
      ubicadores: Math.max(1, Number($('ubicadores').value) || 1),
      prodVal: Math.max(0.1, Number($('prodVal').value) || 2),
      prodUbi: Math.max(0.1, Number($('prodUbi').value) || 1),
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
      if (plan.contenedores != null) $('contenedores').value = plan.contenedores;
      if (plan.desafioMin != null) $('desafioMin').value = plan.desafioMin;
      if (plan.validadores != null) $('validadores').value = plan.validadores;
      if (plan.ubicadores != null) $('ubicadores').value = plan.ubicadores;
      if (plan.prodVal != null) $('prodVal').value = plan.prodVal;
      if (plan.prodUbi != null) $('prodUbi').value = plan.prodUbi;
    } catch (e) { /* ignore */ }
  }

  function calc() {
    var plan = readPlan();
    savePlan(plan);

    var contTurno = plan.contenedores / TURNOS;
    var contHora = contTurno / HORAS;
    var prodValTurno = HORAS * plan.prodVal;
    var prodUbiTurno = HORAS * plan.prodUbi;

    var metaVal = contTurno / plan.validadores;
    var metaValHora = metaVal / HORAS;
    var metaUbi = contTurno / plan.ubicadores;
    var metaUbiHora = metaUbi / HORAS;

    $('fechaMeta').textContent = fechaHoy();
    $('totCont').textContent = fmt(contTurno);
    $('totContHora').textContent = fmtH(contHora);
    $('totDesafio').textContent = fmt(plan.desafioMin);

    $('patioTurno').textContent = fmt(contTurno);
    $('patioHora').textContent = fmtH(contHora);
    $('valTurno').textContent = fmt(metaVal);
    $('valHora').textContent = fmtH(metaValHora);
    $('ubiTurno').textContent = fmt(metaUbi);
    $('ubiHora').textContent = fmtH(metaUbiHora);
    $('stdVal').textContent = fmt(prodValTurno);
    $('stdUbi').textContent = fmt(prodUbiTurno);
  }

  function init() {
    loadPlan();
    ['contenedores', 'desafioMin', 'validadores', 'ubicadores', 'prodVal', 'prodUbi'].forEach(function (id) {
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
