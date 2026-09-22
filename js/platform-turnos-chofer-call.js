/**
 * Control de Turnos — convocatoria al chofer (voz natural, alarma, notificación móvil)
 */
(function (global) {
  'use strict';

  var C = function () { return global.PlatformTurnosCore; };
  var activeEntry = null;
  var alarmTimer = null;
  var repeatTimer = null;
  var alarmCtx = null;
  var speaking = false;
  var wakeLock = null;
  var voicesReady = false;
  var swReady = null;
  var hiddenNotifyTimer = null;
  var keepAliveAudio = null;

  function isIOS() {
    if (/iPad|iPhone|iPod/i.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    swReady = navigator.serviceWorker.register('sw-turnos.js', { scope: './' }).catch(function () {
      return null;
    });
  }

  function ventanaSpeechNatural(entry) {
    if (!entry) return 'ventana de atención';
    var tipo = entry.tipo;
    if (C() && tipo === C().TIPOS.DESPACHO) return 'ventana de despacho de facturas';
    if (C() && tipo === C().TIPOS.LIQUIDACION) return 'ventana de liquidación de facturas';
    if (C() && tipo === C().TIPOS.NOTA_CREDITO) return 'ventana de nota de crédito';
    return 'ventana de atención';
  }

  function saludoNatural() {
    var h = C() ? C().hourInTZ() : new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function primerNombre(entry) {
    var n = String(entry && entry.choferNombre || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }

  function buildSpeechText(entry) {
    if (!entry) return 'Ya es su turno. Por favor, pase a la ventana indicada.';
    var saludo = saludoNatural();
    var nombre = primerNombre(entry);
    var turno = entry.turno || 'su turno';
    var ventana = ventanaSpeechNatural(entry);
    var texto = saludo;
    if (nombre) texto += ', ' + nombre;
    texto += '. Ya le corresponde el turno ' + turno + '. ';
    texto += 'Por favor, diríjase a la ' + ventana + '. Gracias.';
    return texto;
  }

  function pickSpanishVoice() {
    if (!global.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices();
    var es = voices.filter(function (v) { return /^es/i.test(v.lang); });
    if (!es.length) return null;
    function find(re) {
      return es.find(function (v) { return re.test(v.name); });
    }
    return find(/natural|neural|premium|online/i) ||
      find(/helena|sabina|paulina|elvira|monica|laura|sofia|maria/i) ||
      find(/google.*espa|google.*spanish/i) ||
      find(/microsoft.*spanish|microsoft.*espa/i) ||
      find(/españa|español|spanish/i) ||
      es.find(function (v) { return /-ES|-MX|-DO/i.test(v.lang); }) ||
      es[0];
  }

  function preloadVoices() {
    if (!global.speechSynthesis || voicesReady) return;
    if (speechSynthesis.getVoices().length) voicesReady = true;
  }

  function stopAlarm() {
    if (alarmTimer) {
      clearInterval(alarmTimer);
      alarmTimer = null;
    }
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
    if (hiddenNotifyTimer) {
      clearInterval(hiddenNotifyTimer);
      hiddenNotifyTimer = null;
    }
    stopKeepAliveAudio();
    if (alarmCtx) {
      try { alarmCtx.close(); } catch (e) { /* noop */ }
      alarmCtx = null;
    }
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch (e) { /* noop */ }
    speaking = false;
    releaseWakeLock();
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      wakeLock.release();
    } catch (e) { /* noop */ }
    wakeLock = null;
  }

  function requestWakeLock() {
    if (!navigator.wakeLock) return;
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  function requestPermission() {
    if (!global.Notification) return Promise.resolve(false);
    if (Notification.permission === 'granted') return Promise.resolve(true);
    if (Notification.permission === 'denied') return Promise.resolve(false);
    try {
      return Notification.requestPermission().then(function (p) { return p === 'granted'; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function showNotification(entry) {
    if (!global.Notification || Notification.permission !== 'granted') return;
    var ventana = ventanaSpeechNatural(entry);
    var title = '¡Ya es su turno! ' + (entry.turno || '');
    var body = 'Diríjase a la ' + ventana + '.';
    var tag = 'turnos-chofer-call-' + entry.id;
    var icon = 'assets/img/icon-turnos-gestion.svg';
    var url = global.location ? global.location.href.split('#')[0] : './turnos.html';
    var payload = {
      title: title,
      body: body,
      tag: tag,
      icon: icon,
      url: url,
      requireInteraction: true
    };
    var Sw = global.PlatformTurnosSwWatch;
    if (Sw) {
      Sw.showViaWorker(payload);
      return;
    }
    var options = {
      body: body,
      tag: tag,
      requireInteraction: true,
      icon: icon,
      vibrate: [400, 150, 400, 150, 600],
      data: { url: url }
    };
    if (!isIOS()) options.renotify = true;

    function viaWindow() {
      try {
        var n = new Notification(title, options);
        n.onclick = function () {
          try { global.focus(); } catch (e) { /* noop */ }
          n.close();
        };
      } catch (e) { /* noop */ }
    }

    function viaWorker(reg) {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(Object.assign({ type: 'turnos-call' }, payload));
        return;
      }
      reg.showNotification(title, options).catch(viaWindow);
    }

    if ('serviceWorker' in navigator) {
      var ready = swReady || navigator.serviceWorker.ready;
      Promise.resolve(ready).then(viaWorker).catch(viaWindow);
    } else {
      viaWindow();
    }
  }

  function syncChoferBackgroundWatch(entry) {
    var Sw = global.PlatformTurnosSwWatch;
    var Store = global.PlatformTurnosStore;
    if (!Sw) return;
    var entries = (Store && Store.getState && Store.getState().entries) || [];
    Sw.startWatch({
      role: 'chofer',
      myTurnId: entry && entry.id ? entry.id : '',
      choferName: C().getRememberedChoferName(),
      bootstrap: true,
      bootstrapEntries: entries,
      convocadoSeen: {},
      openUrl: global.location ? global.location.href.split('#')[0] : './turnos.html',
      pollMs: 10000
    });
    if (entry && entry.id && entry.convocadoAt) {
      Sw.updateWatch({
        markConvocadoSeen: { id: entry.id, at: C().getConvocadoSeen(entry.id) }
      });
    }
  }

  function startHiddenNotifyBurst(entry) {
    if (hiddenNotifyTimer) clearInterval(hiddenNotifyTimer);
    showNotification(entry);
    hiddenNotifyTimer = setInterval(function () {
      if (!activeEntry || activeEntry.id !== entry.id) {
        clearInterval(hiddenNotifyTimer);
        hiddenNotifyTimer = null;
        return;
      }
      if (document.visibilityState === 'hidden') showNotification(entry);
    }, isIOS() ? 3500 : 8000);
  }

  function stopKeepAliveAudio() {
    if (!keepAliveAudio) return;
    try {
      keepAliveAudio.pause();
      keepAliveAudio.removeAttribute('src');
      keepAliveAudio.load();
    } catch (e) { /* noop */ }
    keepAliveAudio = null;
  }

  function startKeepAliveAudio() {
    if (keepAliveAudio || !activeEntry) return;
    try {
      keepAliveAudio = document.createElement('audio');
      keepAliveAudio.setAttribute('playsinline', '');
      keepAliveAudio.setAttribute('webkit-playsinline', '');
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = isIOS() ? 0.04 : 0.02;
      keepAliveAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==';
      var play = keepAliveAudio.play();
      if (play && play.catch) play.catch(function () { /* noop */ });
    } catch (e) { /* noop */ }
  }

  function vibrateAggressive() {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([400, 150, 400, 150, 600, 150, 800]);
      }
    } catch (e) { /* noop */ }
    if (C()) C().vibrateCall();
  }

  function playCallSiren(cycles) {
    cycles = cycles || 14;
    stopAlarm();
    try {
      alarmCtx = new (global.AudioContext || global.webkitAudioContext)();
      if (alarmCtx.state === 'suspended') {
        alarmCtx.resume().catch(function () { /* noop */ });
      }
      var step = 0;
      alarmTimer = setInterval(function () {
        if (!activeEntry) {
          stopAlarm();
          return;
        }
        if (step >= cycles) {
          clearInterval(alarmTimer);
          alarmTimer = null;
          return;
        }
        var t = alarmCtx.currentTime;
        var osc = alarmCtx.createOscillator();
        var g = alarmCtx.createGain();
        var freqs = [880, 1200, 1600, 1200];
        osc.type = 'sawtooth';
        osc.frequency.value = freqs[step % freqs.length];
        g.gain.value = 0.42;
        osc.connect(g);
        g.connect(alarmCtx.destination);
        osc.start(t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.stop(t + 0.56);
        step += 1;
      }, 580);
    } catch (e) { /* noop */ }
  }

  function speakThenAlarm(entry) {
    if (!global.speechSynthesis) {
      playCallSiren(14);
      return;
    }
    speaking = true;
    preloadVoices();
    var u = new SpeechSynthesisUtterance(buildSpeechText(entry));
    u.lang = 'es-DO';
    u.rate = 0.9;
    u.pitch = 1;
    u.volume = 1;
    var voice = pickSpanishVoice();
    if (voice) u.voice = voice;
    var done = function () {
      speaking = false;
      if (activeEntry && activeEntry.id === entry.id) {
        playCallSiren(14);
      }
    };
    u.onend = done;
    u.onerror = done;
    try {
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {
      speaking = false;
      playCallSiren(14);
    }
  }

  function startRepeatAlert(entry) {
    if (repeatTimer) clearInterval(repeatTimer);
    var intervalMs = isIOS() ? 5000 : 12000;
    repeatTimer = setInterval(function () {
      if (!activeEntry || activeEntry.id !== entry.id) {
        clearInterval(repeatTimer);
        repeatTimer = null;
        return;
      }
      vibrateAggressive();
      if (document.visibilityState === 'hidden') {
        showNotification(entry);
        if (!speaking && !alarmTimer) playCallSiren(isIOS() ? 4 : 6);
      } else if (!speaking && !alarmTimer) {
        playCallSiren(6);
      }
    }, intervalMs);
  }

  function runFullAlert(entry) {
    vibrateAggressive();
    if (document.visibilityState === 'hidden') {
      showNotification(entry);
      startHiddenNotifyBurst(entry);
    } else {
      startKeepAliveAudio();
    }
    speakThenAlarm(entry);
    startRepeatAlert(entry);
  }

  function activate(entry) {
    if (!entry || !entry.convocadoAt) return false;
    if (C().getConvocadoSeen(entry.id) >= entry.convocadoAt) return false;

    var isNew = !activeEntry || activeEntry.id !== entry.id ||
      activeEntry.convocadoAt !== entry.convocadoAt;
    activeEntry = entry;

    if (isNew) {
      requestWakeLock();
      runFullAlert(entry);
      syncChoferBackgroundWatch(entry);
    }
    return true;
  }

  function dismiss(entry) {
    if (entry && entry.convocadoAt) {
      C().markConvocadoSeen(entry.id, entry.convocadoAt);
      var Sw = global.PlatformTurnosSwWatch;
      if (Sw) {
        Sw.updateWatch({ markConvocadoSeen: { id: entry.id, at: entry.convocadoAt } });
      }
    } else if (activeEntry && activeEntry.convocadoAt) {
      C().markConvocadoSeen(activeEntry.id, activeEntry.convocadoAt);
      var Sw2 = global.PlatformTurnosSwWatch;
      if (Sw2) {
        Sw2.updateWatch({ markConvocadoSeen: { id: activeEntry.id, at: activeEntry.convocadoAt } });
      }
    }
    activeEntry = null;
    stopAlarm();
  }

  function isActive() {
    return !!activeEntry;
  }

  function getActiveEntry() {
    return activeEntry;
  }

  function onVisibilityChange() {
    if (!activeEntry) return;
    if (document.visibilityState === 'visible') {
      if (hiddenNotifyTimer) {
        clearInterval(hiddenNotifyTimer);
        hiddenNotifyTimer = null;
      }
      startKeepAliveAudio();
      runFullAlert(activeEntry);
    } else {
      stopKeepAliveAudio();
      showNotification(activeEntry);
      startHiddenNotifyBurst(activeEntry);
    }
  }

  function onPageHide() {
    if (activeEntry) {
      showNotification(activeEntry);
      syncChoferBackgroundWatch(activeEntry);
    }
  }

  function init() {
    registerServiceWorker();
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pagehide', onPageHide);
    if (global.speechSynthesis) {
      speechSynthesis.addEventListener('voiceschanged', preloadVoices, { once: true });
      preloadVoices();
    }
  }

  global.PlatformTurnosChoferCall = {
    init: init,
    activate: activate,
    dismiss: dismiss,
    stop: stopAlarm,
    isActive: isActive,
    getActiveEntry: getActiveEntry,
    requestPermission: requestPermission,
    buildSpeechText: buildSpeechText,
    syncChoferBackgroundWatch: syncChoferBackgroundWatch
  };
})(typeof window !== 'undefined' ? window : this);
