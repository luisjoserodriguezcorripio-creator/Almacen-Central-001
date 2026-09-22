/**
 * Rendimiento login — poster instantáneo en web pública; video mini solo en LAN
 */
(function (global) {
  'use strict';

  var AUTH_VIDEO_MINI = 'assets/video/login-operation-mini.mp4';

  function shouldUsePerfLite() {
    try {
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
      }
      var conn = global.navigator && global.navigator.connection;
      if (conn) {
        if (conn.saveData) return true;
        var type = conn.effectiveType;
        if (type === 'slow-2g' || type === '2g') return true;
      }
      var cores = global.navigator && global.navigator.hardwareConcurrency;
      if (cores && cores <= 2) return true;
      var mem = global.navigator && global.navigator.deviceMemory;
      if (mem && mem <= 2) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function isLanHost() {
    var h = global.location && global.location.hostname;
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    return false;
  }

  function isPublicWeb() {
    var h = global.location && global.location.hostname;
    if (!h) return false;
    return h.indexOf('github.io') !== -1 || h.indexOf('githubusercontent.com') !== -1;
  }

  function wantsVideoOverride() {
    try {
      if (global.localStorage && global.localStorage.getItem('authVideo') === '1') return true;
      if (global.location && /[?&]video=1(?:&|$)/.test(global.location.search)) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function shouldUsePosterOnly() {
    if (shouldUsePerfLite()) return true;
    if (isPublicWeb() && !wantsVideoOverride()) return true;
    return false;
  }

  function shouldLoadAuthVideo() {
    if (shouldUsePosterOnly()) return false;
    return isLanHost() || wantsVideoOverride();
  }

  function applyPerfLite() {
    if (!shouldUsePerfLite()) return false;
    var root = global.document && global.document.documentElement;
    if (root) root.classList.add('perf-lite');
    return true;
  }

  function setPosterMode(wrap, on) {
    if (!wrap) return;
    wrap.classList.toggle('auth-video-wrap--poster', !!on);
    wrap.classList.toggle('is-video-ready', !on);
  }

  function lazyLoadAuthVideo(video) {
    if (!video || video.dataset.lazyLoaded === '1') return;
    var wrap = video.closest('.auth-video-wrap');
    if (!shouldLoadAuthVideo()) {
      setPosterMode(wrap, true);
      video.removeAttribute('autoplay');
      try { video.pause(); } catch (e) { /* ignore */ }
      return;
    }

    setPosterMode(wrap, true);

    function attachAndPlay() {
      if (video.dataset.lazyLoaded === '1') return;
      video.dataset.lazyLoaded = '1';
      video.preload = 'auto';
      video.src = AUTH_VIDEO_MINI;
      video.load();
      video.muted = true;

      function reveal() {
        setPosterMode(wrap, false);
        wrap && wrap.classList.add('is-video-ready');
        video.classList.add('is-active');
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked */ });
      }

      if (video.readyState >= 2) {
        reveal();
        return;
      }
      video.addEventListener('canplay', reveal, { once: true });
    }

    if (global.requestIdleCallback) {
      global.requestIdleCallback(attachAndPlay, { timeout: 2000 });
    } else {
      global.setTimeout(attachAndPlay, 800);
    }
  }

  function initAuthVideo() {
    applyPerfLite();
    var video = global.document && global.document.getElementById('authBgVideo');
    if (!video) return;
    if (shouldUsePosterOnly()) {
      setPosterMode(video.closest('.auth-video-wrap'), true);
      video.removeAttribute('autoplay');
      video.preload = 'none';
      try { video.pause(); } catch (e) { /* ignore */ }
      return;
    }
    video.preload = 'none';
    lazyLoadAuthVideo(video);
  }

  function primeAuthVideoElement(video) {
    if (!video || video.dataset.perfPrimed === '1') return;
    video.dataset.perfPrimed = '1';
    if (shouldUsePosterOnly()) {
      setPosterMode(video.closest('.auth-video-wrap'), true);
      video.preload = 'none';
      try { video.pause(); } catch (e) { /* ignore */ }
      return;
    }
    if (!video.dataset.lazyLoaded) lazyLoadAuthVideo(video);
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', initAuthVideo);
    } else {
      initAuthVideo();
    }
  }

  global.PlatformPerf = {
    shouldUsePerfLite: shouldUsePerfLite,
    shouldUsePosterOnly: shouldUsePosterOnly,
    shouldLoadAuthVideo: shouldLoadAuthVideo,
    isPublicWeb: isPublicWeb,
    isLanHost: isLanHost,
    applyPerfLite: applyPerfLite,
    primeAuthVideoElement: primeAuthVideoElement,
    lazyLoadAuthVideo: lazyLoadAuthVideo,
    AUTH_VIDEO_MINI: AUTH_VIDEO_MINI
  };
})(typeof window !== 'undefined' ? window : this);
