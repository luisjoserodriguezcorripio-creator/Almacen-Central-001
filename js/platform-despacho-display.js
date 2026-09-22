/**
 * Modo pantalla externa — solo muestra lo compartido (no el panel de control)
 */
(function (global) {
  'use strict';

  function isDisplayMode() {
    return !!(global.document && global.document.body &&
      global.document.body.classList.contains('desp-display-mode'));
  }

  function isControllerMode() {
    return !isDisplayMode();
  }

  global.PlatformDespachoDisplay = {
    isDisplayMode: isDisplayMode,
    isControllerMode: isControllerMode,
    getDisplayUrl: function (view) {
      view = view || 'barcode';
      var path = global.location.pathname.replace(/[^/]*$/, 'despacho-pantalla.html');
      return global.location.origin + path + '?v=' + encodeURIComponent(view);
    }
  };
})(typeof window !== 'undefined' ? window : this);
