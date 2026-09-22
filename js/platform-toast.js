/**
 * Notificaciones toast — feedback no intrusivo
 */
(function (global) {
  'use strict';

  var CONTAINER_ID = 'toastContainer';
  var MAX_VISIBLE = 4;

  function ensureContainer() {
    var el = document.getElementById(CONTAINER_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(el);
    return el;
  }

  function dismissToast(node) {
    if (!node || !node.parentNode) return;
    node.classList.add('toast-out');
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 280);
  }

  function show(message, type, durationMs) {
    if (!message) return null;
    type = type || 'info';
    durationMs = durationMs == null ? 4200 : durationMs;

    var container = ensureContainer();
    while (container.children.length >= MAX_VISIBLE) {
      dismissToast(container.firstElementChild);
    }

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', 'status');

    var icons = {
      success: '✓',
      error: '!',
      warning: '⚠',
      info: 'i'
    };

    toast.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' + (icons[type] || icons.info) + '</span>' +
      '<span class="toast-msg"></span>' +
      '<button type="button" class="toast-close" aria-label="Cerrar">×</button>';

    toast.querySelector('.toast-msg').textContent = message;
    var closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', function () { dismissToast(toast); });

    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('toast-in'); });

    if (durationMs > 0) {
      setTimeout(function () { dismissToast(toast); }, durationMs);
    }
    return toast;
  }

  global.PlatformToast = {
    show: show,
    success: function (msg, ms) { return show(msg, 'success', ms); },
    error: function (msg, ms) { return show(msg, 'error', ms); },
    warning: function (msg, ms) { return show(msg, 'warning', ms); },
    info: function (msg, ms) { return show(msg, 'info', ms); }
  };
})(typeof window !== 'undefined' ? window : this);
