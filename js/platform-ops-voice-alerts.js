/**
 * Alertas activas por voz — trabajos en proceso > 24 h (Web Speech API)
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'opsVoiceAlertMuted';
  var INTERVAL_MS = 900000; /* 15 minutos */

  var activeAlerts = [];
  var mutedMap = {};
  var intervalId = null;
  var speaking = false;
  var speechQueue = [];
  var alertSignature = '';
  var boundRoot = null;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function loadMuted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      mutedMap = raw ? JSON.parse(raw) : {};
      if (!mutedMap || typeof mutedMap !== 'object') mutedMap = {};
    } catch (e) {
      mutedMap = {};
    }
    return mutedMap;
  }

  function saveMuted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mutedMap));
    } catch (e) { /* ignore */ }
  }

  function isMuted(usuario) {
    return !!(mutedMap[usuario] && mutedMap[usuario].muted);
  }

  function setMuted(usuario, muted) {
    if (!usuario) return;
    if (muted) {
      mutedMap[usuario] = { muted: true, at: Date.now() };
    } else {
      delete mutedMap[usuario];
    }
    saveMuted();
    refreshMuteButtons(usuario);
  }

  function pruneMutedForResolved(alerts) {
    var active = {};
    (alerts || []).forEach(function (a) { active[a.usuario] = true; });
    Object.keys(mutedMap).forEach(function (u) {
      if (!active[u]) delete mutedMap[u];
    });
    saveMuted();
  }

  function buildSignature(alerts) {
    return (alerts || []).map(function (a) {
      return a.usuario + ':' + a.count;
    }).sort().join('|');
  }

  function buildSpeechText(alert) {
    var PS = global.PlatformSpeech;
    var user = PS && PS.formatUsernameForSpeech
      ? PS.formatUsernameForSpeech(alert.usuario)
      : (alert.usuario || 'sin identificar');
    var count = alert.count || 0;
    var countWord = PS && PS.formatCountForSpeech
      ? PS.formatCountForSpeech(count)
      : String(count);
    var tareas = count === 1 ? 'tarea' : 'tareas';
    return 'Alerta. El usuario ' + user + ' tiene ' + countWord + ' ' + tareas +
      ' en proceso por más de veinticuatro horas. Favor contactar al responsable.';
  }

  function playAlarmBeep(done) {
    done = done || function () {};
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) { done(); return; }
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(function () {
        osc.stop();
        ctx.close();
        done();
      }, 280);
    } catch (e) {
      done();
    }
  }

  function speechSupported() {
    return global.PlatformSpeech
      ? global.PlatformSpeech.supported()
      : typeof global.speechSynthesis !== 'undefined' &&
        typeof SpeechSynthesisUtterance !== 'undefined';
  }

  function speakAlertText(text, onDone) {
    onDone = onDone || function () {};
    if (global.PlatformSpeech && global.PlatformSpeech.speak) {
      global.PlatformSpeech.speak(text, {
        cancel: false,
        onEnd: function () { onDone(); },
        onError: function () { onDone(); }
      });
      return;
    }
    if (!speechSupported()) {
      onDone();
      return;
    }
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-DO';
    utter.rate = 0.95;
    utter.onend = onDone;
    utter.onerror = onDone;
    global.speechSynthesis.speak(utter);
  }

  function drainSpeechQueue() {
    if (speaking || !speechQueue.length) return;
    if (!speechSupported()) {
      speechQueue = [];
      return;
    }
    if (global.speechSynthesis.speaking) return;

    var alert = speechQueue.shift();
    if (!alert || isMuted(alert.usuario)) {
      drainSpeechQueue();
      return;
    }

    speaking = true;
    playAlarmBeep(function () {
      speakAlertText(buildSpeechText(alert), function () {
        speaking = false;
        setTimeout(drainSpeechQueue, 400);
      });
    });
  }

  function enqueueAlerts(alerts) {
    if (speaking || (global.speechSynthesis && global.speechSynthesis.speaking)) return;
    speechQueue = [];
    (alerts || []).forEach(function (a) {
      if (!isMuted(a.usuario)) speechQueue.push(a);
    });
    drainSpeechQueue();
  }

  function runAlertCycle() {
    if (!activeAlerts.length) return;
    if (speaking || (global.speechSynthesis && global.speechSynthesis.speaking)) return;
    enqueueAlerts(activeAlerts);
  }

  function startInterval() {
    if (intervalId) return;
    intervalId = global.setInterval(runAlertCycle, INTERVAL_MS);
  }

  function stopInterval() {
    if (intervalId) {
      global.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function cancelSpeech() {
    speechQueue = [];
    speaking = false;
    if (global.speechSynthesis) {
      try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
  }

  function stopAll() {
    stopInterval();
    cancelSpeech();
    activeAlerts = [];
    alertSignature = '';
  }

  function sync(userAlerts) {
    loadMuted();
    userAlerts = (userAlerts || []).slice().sort(function (a, b) {
      return (b.totalAgeHours || 0) - (a.totalAgeHours || 0);
    });

    pruneMutedForResolved(userAlerts);

    var sig = buildSignature(userAlerts);
    var hadAlerts = activeAlerts.length > 0;
    var isNewOrChanged = sig !== alertSignature;

    activeAlerts = userAlerts;
    alertSignature = sig;

    if (!activeAlerts.length) {
      stopAll();
      return;
    }

    startInterval();

    if (!hadAlerts || isNewOrChanged) {
      runAlertCycle();
    }
  }

  function muteButtonHtml(usuario) {
    var muted = isMuted(usuario);
    return '<button type="button" class="ops-voice-mute-btn' + (muted ? ' is-muted' : ' is-active') + '" ' +
      'data-voice-mute="' + esc(usuario) + '" aria-pressed="' + (muted ? 'true' : 'false') + '">' +
      (muted ? '🔇 Silenciado' : '🔊 Alertando') +
      '</button>';
  }

  function renderPanelHtml(groups) {
    groups = groups || [];
    if (!groups.length) {
      return '<div class="ops-voice-alerts ops-voice-alerts-ok">' +
        '<div class="ops-voice-alerts-head">' +
        '<strong>Sin alertas activas 24H</strong>' +
        '<span>No hay usuarios con tareas en proceso por más de 24 horas.</span>' +
        '</div></div>';
    }

    var cards = groups.map(function (g) {
      var user = g.usuario || 'Sin nombre';
      return '<article class="ops-voice-alert-card" data-voice-user="' + esc(user) + '">' +
        '<div class="ops-voice-alert-main">' +
        '<span class="ops-voice-alert-icon" aria-hidden="true">⚠</span>' +
        '<div class="ops-voice-alert-body">' +
        '<strong>Usuario: ' + esc(user) + '</strong>' +
        '<span>' + esc(g.count) + ' tarea(s) en proceso +24h</span>' +
        '<em>Mayor tiempo: ' + esc(g.maxAgeLabel || '—') + ' · Acumulado: ' + esc(formatAgeHours(g.totalAgeHours || 0)) + '</em>' +
        '</div></div>' +
        '<div class="ops-voice-alert-actions">' + muteButtonHtml(user) + '</div>' +
        '</article>';
    }).join('');

    return '<div class="ops-voice-alerts ops-voice-alerts-active" role="alert">' +
      '<div class="ops-voice-alerts-head">' +
      '<strong>Alerta activa · voz cada 15 min</strong>' +
      '<span>' + esc(groups.length) + ' usuario(s) con tareas vencidas en proceso</span>' +
      '</div>' +
      '<div class="ops-voice-alert-cards">' + cards + '</div>' +
      '</div>';
  }

  function formatAgeHours(hours) {
    var h = Math.max(0, Math.floor(Number(hours) || 0));
    var days = Math.floor(h / 24);
    var rest = h % 24;
    return days > 0 ? days + 'd ' + rest + 'h' : h + 'h';
  }

  function refreshMuteButtons(usuario) {
    var cards = document.querySelectorAll('.ops-voice-alert-card[data-voice-user]');
    cards.forEach(function (card) {
      var u = card.getAttribute('data-voice-user');
      if (usuario && u !== usuario) return;
      var btn = card.querySelector('[data-voice-mute]');
      if (!btn) return;
      var muted = isMuted(u);
      btn.classList.toggle('is-muted', muted);
      btn.classList.toggle('is-active', !muted);
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.textContent = muted ? '🔇 Silenciado' : '🔊 Alertando';
    });
  }

  function bindControls(host) {
    if (!host) return;
    if (host.dataset.voiceBound === '1') return;
    host.dataset.voiceBound = '1';
    boundRoot = host;

    host.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-voice-mute]');
      if (!btn) return;
      var usuario = btn.getAttribute('data-voice-mute');
      if (!usuario) return;
      var nowMuted = !isMuted(usuario);
      setMuted(usuario, nowMuted);
      if (nowMuted && global.speechSynthesis) {
        try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        speaking = false;
        speechQueue = speechQueue.filter(function (a) { return a.usuario !== usuario; });
      }
      if (!nowMuted) {
        var alert = null;
        for (var i = 0; i < activeAlerts.length; i++) {
          if (activeAlerts[i].usuario === usuario) {
            alert = activeAlerts[i];
            break;
          }
        }
        if (alert) enqueueAlerts([alert]);
      }
    });
  }

  loadMuted();

  global.PlatformOpsVoiceAlerts = {
    INTERVAL_MS: INTERVAL_MS,
    sync: sync,
    stop: stopAll,
    isMuted: isMuted,
    setMuted: setMuted,
    getMutedMap: function () { return Object.assign({}, mutedMap); },
    renderPanelHtml: renderPanelHtml,
    bindControls: bindControls,
    runAlertCycle: runAlertCycle,
    speechSupported: speechSupported
  };
})(typeof window !== 'undefined' ? window : this);
