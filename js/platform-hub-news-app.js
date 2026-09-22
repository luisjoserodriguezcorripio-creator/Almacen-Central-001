/**
 * Tablón informativo — app pública + admin
 */
(function (global) {
  'use strict';

  var boardReady = false;
  var adminBound = false;

  function sync() {
    return global.PlatformHubNewsSync;
  }

  function ui() {
    return global.PlatformHubNewsUI;
  }

  function actorName(user) {
    if (!user) return 'Administrador';
    if (global.PlatformAdmin && global.PlatformAdmin.getDisplayName) {
      return global.PlatformAdmin.getDisplayName(user);
    }
    return user.name || user.username || 'Administrador';
  }

  function canManage(user) {
    if (!user || !global.PlatformAdmin) return false;
    return global.PlatformAdmin.can(user.role, 'news.manage', user);
  }

  function refreshBoard() {
    if (!ui()) return;
    ui().renderBoard(sync().getItems());
  }

  function initPublicBoard() {
    if (boardReady || !sync() || !ui()) return;
    boardReady = true;
    var C = global.PlatformHubNewsCore;
    if (C && C.applyPortalSeeds) {
      ui().renderBoard(C.activeItems(C.applyPortalSeeds(C.defaultSeedItems())));
    }
    sync().init().then(refreshBoard).catch(function () { refreshBoard(); });
    sync().onChange(function () { refreshBoard(); });
  }

  function refreshAdmin(user) {
    var host = document.getElementById('adminNewsHost');
    if (!host || !ui() || !sync()) return;
    if (!canManage(user)) {
      host.innerHTML = '<p class="admin-empty">Solo administradores pueden publicar noticias.</p>';
      return;
    }
    sync().fetchAll().then(function (items) {
      ui().renderAdminPanel(host, {
        items: items,
        actor: actorName(user),
        setupRequired: sync().isSetupRequired(),
        onSave: function (data) {
          return sync().saveItem(data, actorName(user)).then(function (res) {
            if (res.ok) {
              if (global.PlatformAdmin && global.PlatformAdmin.addLog) {
                global.PlatformAdmin.addLog(
                  data.id ? 'news_update' : 'news_publish',
                  data.title || 'Aviso',
                  actorName(user)
                );
              }
              refreshAdmin(user);
            }
            return res;
          });
        },
        onDelete: function (id) {
          return sync().removeItem(id).then(function (res) {
            if (res.ok) refreshAdmin(user);
            return res;
          });
        }
      });
    });
  }

  function bindAdminTab(user) {
    if (adminBound) return;
    adminBound = true;
    document.querySelectorAll('.admin-tab-btn[data-tab="news"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        refreshAdmin(user);
      });
    });
  }

  function initAdmin(user) {
    if (!user || !canManage(user)) return;
    bindAdminTab(user);
    var pane = document.getElementById('adminPaneNews');
    if (pane && pane.classList.contains('active')) refreshAdmin(user);
  }

  function boot() {
    initPublicBoard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PlatformHubNewsApp = {
    canManage: canManage,
    initPublicBoard: initPublicBoard,
    initAdmin: initAdmin,
    refreshAdmin: refreshAdmin,
    refreshBoard: refreshBoard
  };
})(typeof window !== 'undefined' ? window : this);
