/**
 * Atajos de teclado y panel de ayuda
 */
(function (global) {
  'use strict';

  var bound = false;

  var MODULE_KEYS = {
    '1': 'general',
    '2': 'productividad',
    '3': 'operaciones',
    '4': 'facturas',
    '5': 'despacho',
    '6': 'reportes',
    '7': 'administracion'
  };

  function openHelp() {
    var modal = document.getElementById('shortcutsModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeHelp() {
    var modal = document.getElementById('shortcutsModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function init(handlers) {
    if (bound || !handlers) return;
    bound = true;
    handlers = handlers || {};

    var backdrop = document.getElementById('shortcutsBackdrop');
    var closeBtn = document.getElementById('btnCloseShortcuts');
    if (backdrop) backdrop.addEventListener('click', closeHelp);
    if (closeBtn) closeBtn.addEventListener('click', closeHelp);

    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      var inAiInput = ev.target && ev.target.id === 'aiQuestion';
      var typing = (tag === 'INPUT' || tag === 'SELECT' ||
        (tag === 'TEXTAREA' && !inAiInput) ||
        (ev.target && ev.target.isContentEditable));

      if (ev.key === 'Escape') {
        var helpOpen = document.getElementById('shortcutsModal');
        if (helpOpen && helpOpen.classList.contains('open')) {
          ev.preventDefault();
          closeHelp();
          return;
        }
      }

      if (typing) return;

      if (ev.key === '?' || (ev.shiftKey && ev.key === '/')) {
        ev.preventDefault();
        openHelp();
        return;
      }

      if (ev.altKey && MODULE_KEYS[ev.key]) {
        ev.preventDefault();
        var mod = MODULE_KEYS[ev.key];
        if (mod === 'administracion' && handlers.openAdmin) {
          handlers.openAdmin();
        } else if (handlers.switchModule) {
          handlers.switchModule(mod);
        }
        return;
      }

      if (ev.key === 't' && !ev.ctrlKey && !ev.metaKey && handlers.toggleTheme) {
        handlers.toggleTheme();
      }

      if ((ev.key === 'r' || ev.key === 'R') && !ev.ctrlKey && !ev.metaKey && handlers.refreshView) {
        ev.preventDefault();
        handlers.refreshView();
      }

      if (ev.altKey && ev.key === '8' && handlers.openAi) {
        ev.preventDefault();
        handlers.openAi();
      }
    });
  }

  global.PlatformShortcuts = {
    init: init,
    openHelp: openHelp,
    closeHelp: closeHelp
  };
})(typeof window !== 'undefined' ? window : this);
