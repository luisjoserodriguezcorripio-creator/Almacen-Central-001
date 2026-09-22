/**
 * Gestos profesionales — swipe con arrastre, feedback visual, navegación táctil
 */
(function (global) {
  'use strict';

  var SWIPE_MIN = 52;
  var SWIPE_MAX_Y = 88;
  var SWIPE_EDGE = 44;
  var RUBBER_MAX = 72;
  var MODULE_CYCLE = ['operaciones', 'facturas'];

  function updateSwipeIndicator(indicatorEl, dx) {
    if (!indicatorEl) return;
    var show = Math.abs(dx) > 12;
    indicatorEl.classList.toggle('is-visible', show);
    var left = indicatorEl.querySelector('.gesture-swipe-chevron--left');
    var right = indicatorEl.querySelector('.gesture-swipe-chevron--right');
    if (left) left.classList.toggle('is-active', dx < -12);
    if (right) right.classList.toggle('is-active', dx > 12);
  }

  function hideSwipeIndicator(indicatorEl) {
    if (!indicatorEl) return;
    indicatorEl.classList.remove('is-visible');
    indicatorEl.querySelectorAll('.gesture-swipe-chevron').forEach(function (c) {
      c.classList.remove('is-active');
    });
  }

  function bindSwipePro(el, opts) {
    if (!el || el.dataset.swipeProBound === '1') return;
    el.dataset.swipeProBound = '1';
    opts = opts || {};
    var track = opts.trackEl || el;
    var minDist = opts.threshold != null ? opts.threshold : SWIPE_MIN;
    var maxY = opts.maxY != null ? opts.maxY : SWIPE_MAX_Y;
    var rubber = opts.rubberBand !== false;
    var zone = opts.zoneEl || el;
    var indicatorEl = zone.querySelector ? zone.querySelector('.gesture-swipe-indicator') : null;

    track.classList.add('gesture-swipe-track');

    var startX = 0;
    var startY = 0;
    var tracking = false;
    var pointerId = null;

    function isScrollableTableTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest(
        '.data-table-wrap, .ops-table-wrap, .fac-metas-table-wrap, .fac-table-wrap, .lt-table-wrap, .matrix-wrap, .admin-table-wrap, table'
      );
    }

    function resetTrack(animate) {
      track.classList.remove('is-dragging');
      if (animate) track.classList.add('is-snap-back');
      track.style.transform = '';
      hideSwipeIndicator(indicatorEl);
      if (animate) {
        setTimeout(function () {
          track.classList.remove('is-snap-back');
        }, 450);
      }
    }

    function setTrackOffset(dx) {
      var damped = dx * 0.42;
      if (Math.abs(damped) > RUBBER_MAX) damped = Math.sign(damped) * RUBBER_MAX;
      track.style.transform = 'translate3d(' + damped + 'px,0,0)';
      updateSwipeIndicator(indicatorEl, dx);
    }

    el.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (isScrollableTableTarget(ev.target)) return;
      if (opts.allowStart && !opts.allowStart(ev)) return;
      tracking = true;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      track.classList.add('is-dragging');
      track.classList.remove('is-snap-back');
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      if (opts.onStart) opts.onStart(ev);
    });

    el.addEventListener('pointermove', function (ev) {
      if (!tracking || ev.pointerId !== pointerId) return;
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (Math.abs(dy) > maxY && Math.abs(dx) < 24) {
        tracking = false;
        resetTrack(true);
        return;
      }
      if (rubber) setTrackOffset(dx);
      if (opts.onMove) opts.onMove(dx, dy, ev);
    }, { passive: true });

    function endSwipe(ev) {
      if (!tracking) return;
      tracking = false;
      try { el.releasePointerCapture(pointerId); } catch (e) { /* ignore */ }
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      resetTrack(true);
      if (Math.abs(dy) > maxY && Math.abs(dx) < minDist) return;
      if (dx <= -minDist && opts.onLeft) opts.onLeft(dx, startX, ev);
      else if (dx >= minDist && opts.onRight) opts.onRight(dx, startX, ev);
      else if (opts.onCancel) opts.onCancel();
    }

    el.addEventListener('pointerup', endSwipe);
    el.addEventListener('pointercancel', function () {
      tracking = false;
      resetTrack(true);
    });
  }

  function flashSwipeOk(host) {
    if (!host) return;
    host.classList.remove('gesture-flash-ok');
    void host.offsetWidth;
    host.classList.add('gesture-flash-ok');
    setTimeout(function () {
      host.classList.remove('gesture-flash-ok');
    }, 480);
  }

  function initNavTouch(root) {
    root = root || document;
    var sel = '.nav-module-btn, .nav-submodule-list button';
    root.querySelectorAll(sel).forEach(function (btn) {
      if (btn.dataset.navTouchBound === '1') return;
      btn.dataset.navTouchBound = '1';
      btn.addEventListener('pointerdown', function () {
        if (btn.disabled) return;
        btn.classList.add('is-touch-active');
      });
      function off() {
        btn.classList.remove('is-touch-active');
      }
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  function initSidebarGestures() {
    var main = document.querySelector('.platform-main');
    if (!main || main.dataset.sidebarSwipeBound === '1') return;
    main.dataset.sidebarSwipeBound = '1';

    bindSwipePro(main, {
      threshold: 64,
      maxY: 100,
      rubberBand: false,
      allowStart: function (ev) {
        if (ev.target.closest('.data-table-wrap, .ops-table-wrap, .fac-metas-table-wrap, .fac-table-wrap, .lt-table-wrap, .matrix-wrap, .admin-table-wrap, table')) return false;
        return window.innerWidth <= 1100;
      },
      onRight: function (dx, startX) {
        if (startX <= SWIPE_EDGE && window.innerWidth <= 1100) {
          document.body.classList.add('sidebar-open');
        }
      },
      onLeft: function () {
        if (document.body.classList.contains('sidebar-open')) {
          document.body.classList.remove('sidebar-open');
        }
      }
    });

    var backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop && backdrop.dataset.tapBound !== '1') {
      backdrop.dataset.tapBound = '1';
      backdrop.addEventListener('click', function () {
        document.body.classList.remove('sidebar-open');
      });
    }
  }

  function initGeneralDashboard(host, callbacks) {
    if (!host) return;
    callbacks = callbacks || {};
    var dash = host.querySelector('.gen-dashboard');
    if (!dash) return;

    var cycleIndex = 0;
    var zoneWrap = document.createElement('div');
    zoneWrap.className = 'gesture-swipe-zone';
    zoneWrap.setAttribute('data-gesture-zone', '1');
    dash.parentNode.insertBefore(zoneWrap, dash);
    zoneWrap.appendChild(dash);
    var ind = document.createElement('div');
    ind.className = 'gesture-swipe-indicator';
    ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML =
      '<span class="gesture-swipe-chevron gesture-swipe-chevron--left">‹</span>' +
      '<span class="gesture-swipe-chevron gesture-swipe-chevron--right">›</span>';
    zoneWrap.appendChild(ind);

    function goModule(dir) {
      cycleIndex = (cycleIndex + dir + MODULE_CYCLE.length) % MODULE_CYCLE.length;
      var mod = MODULE_CYCLE[cycleIndex];
      flashSwipeOk(dash);
      if (callbacks.onNavigateModule) callbacks.onNavigateModule(mod);
    }

    bindSwipePro(zoneWrap, {
      trackEl: dash,
      zoneEl: zoneWrap,
      threshold: SWIPE_MIN,
      allowStart: function (ev) {
        return !ev.target.closest('.data-table-wrap, .ops-table-wrap, .fac-metas-table-wrap, .fac-table-wrap, .lt-table-wrap, .matrix-wrap, .admin-table-wrap, table');
      },
      onLeft: function () { goModule(1); },
      onRight: function () { goModule(-1); }
    });

    host.querySelectorAll('.gen-card--interactive').forEach(function (card) {
      if (card.dataset.cardBound === '1') return;
      card.dataset.cardBound = '1';
      card.addEventListener('click', function (ev) {
        if (ev.target.closest('.gen-link, button, a')) return;
        var mod = card.getAttribute('data-module-jump');
        if (mod && callbacks.onNavigateModule) callbacks.onNavigateModule(mod);
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          var mod = card.getAttribute('data-module-jump');
          if (mod && callbacks.onNavigateModule) callbacks.onNavigateModule(mod);
        }
      });
    });

    host.querySelectorAll('.gen-status-item[data-module-jump]').forEach(function (item) {
      if (item.dataset.statusBound === '1') return;
      item.dataset.statusBound = '1';
      if (item.classList.contains('is-live')) {
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
      }
      item.addEventListener('click', function () {
        if (!item.classList.contains('is-live')) return;
        var mod = item.getAttribute('data-module-jump');
        if (mod && callbacks.onNavigateModule) callbacks.onNavigateModule(mod);
      });
    });
  }

  function initTvCarousel(host) {
    if (!host || !global.PlatformTvDashboard) return;
    var carousel = host.querySelector('#tvCarousel') || host.querySelector('.tv-carousel');
    var viewport = host.querySelector('.tv-slides-viewport');
    if (!carousel || !viewport || viewport.dataset.tvSwipeBound === '1') return;
    viewport.dataset.tvSwipeBound = '1';

    if (!carousel.querySelector('.tv-swipe-indicator')) {
      var ind = document.createElement('div');
      ind.className = 'gesture-swipe-indicator tv-swipe-indicator';
      ind.setAttribute('aria-hidden', 'true');
      ind.innerHTML =
        '<span class="gesture-swipe-chevron gesture-swipe-chevron--left">‹</span>' +
        '<span class="gesture-swipe-chevron gesture-swipe-chevron--right">›</span>';
      carousel.insertBefore(ind, viewport);
    }

    bindSwipePro(viewport, {
      trackEl: viewport,
      zoneEl: carousel,
      threshold: 48,
      rubberBand: false,
      allowStart: function (ev) {
        return !ev.target.closest('.data-table-wrap, .ops-table-wrap, .fac-metas-table-wrap, .fac-table-wrap, .lt-table-wrap, .matrix-wrap, .admin-table-wrap, table');
      },
      onLeft: function () {
        var idx = global.PlatformTvDashboard.TV_SLIDES.indexOf(getActiveTvSlide(host));
        global.PlatformTvDashboard.setSlide(idx + 1, true);
      },
      onRight: function () {
        var idx = global.PlatformTvDashboard.TV_SLIDES.indexOf(getActiveTvSlide(host));
        global.PlatformTvDashboard.setSlide(idx - 1, true);
      }
    });
  }

  function getActiveTvSlide(host) {
    var active = host.querySelector('.tv-slide.active');
    return active ? active.getAttribute('data-slide') : 'ops';
  }

  function initApp() {
    initNavTouch(document);
    initSidebarGestures();
  }

  global.PlatformGestures = {
    initApp: initApp,
    initNavTouch: initNavTouch,
    initGeneralDashboard: initGeneralDashboard,
    initTvCarousel: initTvCarousel,
    bindSwipePro: bindSwipePro,
    MODULE_CYCLE: MODULE_CYCLE
  };
})(typeof window !== 'undefined' ? window : this);
