/**
 * Indicador global EN VIVO — Supabase (primario) o Firebase (respaldo)
 */
(function (global) {
  'use strict';

  var badge = null;

  function ensureBadge() {
    if (badge || !global.document || !global.document.body) return badge;
    badge = global.document.createElement('div');
    badge.id = 'dcRealtimeBadge';
    badge.className = 'dc-realtime-badge';
    badge.hidden = true;
    badge.setAttribute('role', 'status');
    badge.innerHTML = '<span class="dc-realtime-dot"></span><span class="dc-realtime-text">EN VIVO</span>';
    global.document.body.appendChild(badge);
    return badge;
  }

  function isLive() {
    if (global.PlatformSupabase && global.PlatformSupabase.isEnabled && global.PlatformSupabase.isEnabled()) {
      if (global.PlatformSupabase.isConnected && global.PlatformSupabase.isConnected()) return true;
      if (global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.getLastPullAt) {
        var keys = ['averias', 'despacho', 'platform', 'registry', 'turnos', 'agenda', 'hub_news'];
        for (var i = 0; i < keys.length; i++) {
          var t = global.PlatformSupabaseBridge.getLastPullAt(keys[i]);
          if (t && (Date.now() - t) < 12000) return true;
        }
      }
    }
    return !!(global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled &&
      global.PlatformFirebaseBridge.isConnected && global.PlatformFirebaseBridge.isConnected());
  }

  function update() {
    var el = ensureBadge();
    if (!el) return;
    var on = isLive();
    el.hidden = !on;
    var viaSupabase = global.PlatformSupabase && global.PlatformSupabase.isConnected && global.PlatformSupabase.isConnected();
    el.title = on
      ? (viaSupabase
        ? 'Sync Supabase Free — datos compartidos cada pocos segundos'
        : 'Sync en tiempo real activa')
      : '';
    if (viaSupabase) {
      el.style.background = 'rgba(56, 142, 60, 0.92)';
    }
  }

  function injectStyles() {
    if (!global.document || global.document.getElementById('dcRealtimeBadgeStyles')) return;
    var s = global.document.createElement('style');
    s.id = 'dcRealtimeBadgeStyles';
    s.textContent = [
      '.dc-realtime-badge{position:fixed;bottom:14px;right:14px;z-index:99999;',
      'display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;',
      'background:rgba(16,185,129,.92);color:#fff;font:600 11px/1 "DM Sans",system-ui,sans-serif;',
      'letter-spacing:.06em;box-shadow:0 4px 20px rgba(0,0,0,.35);pointer-events:none}',
      '.dc-realtime-dot{width:8px;height:8px;border-radius:50%;background:#fff;',
      'animation:dcRtPulse 1.2s ease-in-out infinite}',
      '@keyframes dcRtPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}'
    ].join('');
    global.document.head.appendChild(s);
  }

  function init() {
    injectStyles();
    update();
    global.addEventListener('firebase-connection', update);
    global.addEventListener('supabase-connection', update);
    global.setInterval(update, 400);
    if (global.PlatformSupabase && global.PlatformSupabase.init) {
      global.PlatformSupabase.init().then(update);
    }
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.ensureReady) {
      global.PlatformFirebaseBridge.ensureReady().then(update);
    }
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
