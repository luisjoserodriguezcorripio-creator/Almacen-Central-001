/**
 * Voz del navegador — misma configuración que AI / alertas humanas (aiVoiceURI)
 */
(function (global) {
  'use strict';

  function getVoices() {
    try {
      return global.speechSynthesis && global.speechSynthesis.getVoices
        ? global.speechSynthesis.getVoices()
        : [];
    } catch (e) {
      return [];
    }
  }

  function getPreferredVoiceURI() {
    if (!global.PlatformStore || !global.PlatformStore.loadConfig) return '';
    var cfg = global.PlatformStore.loadConfig() || {};
    return cfg.aiVoiceURI || '';
  }

  function resolveVoice(preferredURI) {
    var voices = getVoices();
    if (!voices.length) return null;
    var preferred = preferredURI != null ? preferredURI : getPreferredVoiceURI();
    var voice = preferred
      ? voices.filter(function (v) { return v.voiceURI === preferred; })[0]
      : null;
    if (voice) return voice;
    voice = voices.filter(function (v) {
      return /^es(-|_)/i.test(v.lang || '') &&
        /female|mujer|sofia|paulina|sabina|google/i.test(v.name || '');
    })[0];
    if (voice) return voice;
    return voices.filter(function (v) {
      return /^es(-|_)/i.test(v.lang || '');
    })[0] || null;
  }

  function applyVoiceSettings(utter, voice) {
    if (!utter) return utter;
    utter.lang = 'es-DO';
    utter.rate = 0.95;
    utter.pitch = 1;
    utter.volume = 0.82;
    voice = voice || resolveVoice();
    if (voice) utter.voice = voice;
    return utter;
  }

  function capitalizeWord(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Convierte IDs tipo j.lugo, j_lugo, jperez → texto pronunciable en español.
   */
  function formatUsernameForSpeech(raw) {
    if (!raw) return 'sin identificar';
    var s = String(raw).trim();
    if (!s || /^sin\s+nombre$/i.test(s)) return 'sin identificar';

    var slash = s.lastIndexOf('\\');
    if (slash >= 0) s = s.slice(slash + 1);
    slash = s.lastIndexOf('/');
    if (slash >= 0) s = s.slice(slash + 1);

    var at = s.indexOf('@');
    if (at > 0) s = s.slice(0, at);

    s = s.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');

    var parts = s.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'sin identificar';

    if (parts.length === 1) {
      var one = parts[0];
      if (/^[a-z][a-z]{3,5}$/.test(one)) {
        return capitalizeWord(one.slice(1));
      }
      if (/^[A-Z]{2,}$/.test(one)) {
        return capitalizeWord(one.toLowerCase());
      }
      return capitalizeWord(one);
    }

    if (parts.length >= 2 && parts[0].length === 1 && /^[a-zA-Z]$/.test(parts[0])) {
      return capitalizeWord(parts[parts.length - 1]);
    }

    return parts.map(function (p) {
      if (p.length === 1 && /^[a-zA-Z]$/.test(p)) return p.toUpperCase();
      return capitalizeWord(p);
    }).join(' ');
  }

  var COUNT_WORDS = [
    'cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'
  ];

  function formatCountForSpeech(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n <= 10) return COUNT_WORDS[n] || String(n);
    return String(n);
  }

  function supported() {
    return typeof global.speechSynthesis !== 'undefined' &&
      typeof global.SpeechSynthesisUtterance !== 'undefined';
  }

  /**
   * @param {string} message
   * @param {{ cancel?: boolean, onEnd?: Function, onError?: Function }} opts
   */
  function speak(message, opts) {
    if (!message || !supported()) return false;
    opts = opts || {};
    try {
      var utter = new global.SpeechSynthesisUtterance(message);
      applyVoiceSettings(utter);
      if (opts.onEnd) utter.onend = opts.onEnd;
      if (opts.onError) utter.onerror = opts.onError;
      if (opts.cancel !== false) {
        try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      }
      global.speechSynthesis.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (supported()) {
    global.speechSynthesis.getVoices();
    if (global.speechSynthesis.addEventListener) {
      global.speechSynthesis.addEventListener('voiceschanged', function () {
        global.speechSynthesis.getVoices();
      });
    } else {
      global.speechSynthesis.onvoiceschanged = function () {
        global.speechSynthesis.getVoices();
      };
    }
  }

  global.PlatformSpeech = {
    supported: supported,
    getVoices: getVoices,
    getPreferredVoiceURI: getPreferredVoiceURI,
    resolveVoice: resolveVoice,
    applyVoiceSettings: applyVoiceSettings,
    formatUsernameForSpeech: formatUsernameForSpeech,
    formatCountForSpeech: formatCountForSpeech,
    speak: speak
  };
})(typeof window !== 'undefined' ? window : this);
