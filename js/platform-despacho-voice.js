/**
 * Alertas de voz — nuevo IDC en seguimiento validador
 * No lee el código IDC; anuncia cliente y jaula.
 */
(function (global) {
  'use strict';

  function stripLeadingLabel(value, labels) {
    var s = String(value || '').trim();
    if (!s) return '';
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      var re = new RegExp('^\\s*' + label.replace(/\s+/g, '\\s+') + '\\s*[:\\-\\.]?\\s*', 'i');
      if (re.test(s)) {
        s = s.replace(re, '').trim();
        break;
      }
    }
    return s;
  }

  function isEmptyCliente(val) {
    if (!val) return true;
    val = String(val).trim();
    return !val || val === '—' || val === '-' || /^sin\s+(cliente|nombre)/i.test(val);
  }

  function formatJaulaForSpeech(jaula) {
    jaula = String(jaula || '').trim();
    if (!jaula) return '';
    return jaula.replace(/\s+/g, ' ').trim();
  }

  function buildNuevoIdcMessage(pedido) {
    if (!pedido) return '';

    var jaula = stripLeadingLabel(pedido.jaula, [
      'jaula', 'pasillo', 'referencia', 'ref', 'rack', 'ubicación', 'ubicacion'
    ]);
    var cliente = stripLeadingLabel(pedido.cliente, [
      'cliente', 'clienta', 'nombre del cliente', 'nombre cliente', 'nombre'
    ]);

    jaula = formatJaulaForSpeech(jaula);

    var parts = ['Nuevo IDC activo'];
    if (!isEmptyCliente(cliente)) parts.push('cliente ' + cliente);
    if (jaula) parts.push('jaula ' + jaula);

    return parts.join(', ') + '.';
  }

  function speak(message, opts) {
    if (!message) return false;
    opts = opts || {};
    if (global.PlatformSpeech && global.PlatformSpeech.speak) {
      return global.PlatformSpeech.speak(message, {
        cancel: opts.cancel !== false,
        onEnd: opts.onEnd,
        onError: opts.onError
      });
    }
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return false;
    try {
      if (opts.cancel !== false) global.speechSynthesis.cancel();
      var utter = new global.SpeechSynthesisUtterance(message);
      utter.lang = 'es-DO';
      utter.rate = 0.92;
      utter.pitch = 1;
      utter.volume = 0.88;
      var voices = global.speechSynthesis.getVoices ? global.speechSynthesis.getVoices() : [];
      var voice = voices.filter(function (v) {
        return /^es(-|_)/i.test(v.lang || '') &&
          /female|mujer|sofia|paulina|sabina|google/i.test(v.name || '');
      })[0] || voices.filter(function (v) { return /^es(-|_)/i.test(v.lang || ''); })[0];
      if (voice) utter.voice = voice;
      if (opts.onEnd) utter.onend = opts.onEnd;
      if (opts.onError) utter.onerror = opts.onError;
      global.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  function announceNuevoIdc(pedido, opts) {
    var msg = buildNuevoIdcMessage(pedido);
    if (!msg) return false;
    return speak(msg, opts);
  }

  global.PlatformDespachoVoice = {
    buildNuevoIdcMessage: buildNuevoIdcMessage,
    announceNuevoIdc: announceNuevoIdc,
    speak: speak
  };
})(typeof window !== 'undefined' ? window : this);
