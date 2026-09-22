/**
 * Autenticación — Portal Despacho (sesión separada del WMS)
 * Usuarios registrados en Administración + cuentas demo legacy
 */
(function (global) {
  'use strict';

  var ROLE_LABELS = {
    preparador: 'Preparador',
    validador: 'Validador'
  };

  var LEGACY_USERS = [
    {
      id: 'd1',
      username: 'preparador',
      name: 'Preparador de pedidos',
      role: 'preparador',
      passwordHash: 'bc94e593460eb3d9601b27509c484088def83c9572f57d7bd3a703c32853b33a',
      active: true
    },
    {
      id: 'd2',
      username: 'validador',
      name: 'Validador de despacho',
      role: 'validador',
      passwordHash: '436fd78d0e9c9b19dcbd24b853b01f06032da2239b9d590424b87549a91c68da',
      active: true
    }
  ];

  function resolveUsername(username) {
    return String(username || '').toLowerCase().trim();
  }

  function getDisplayName(user) {
    if (!user) return '';
    var name = String(user.name || '').trim();
    return name || String(user.username || '').trim();
  }

  function getRoleLabel(user) {
    if (!user) return '';
    if (global.PlatformAdmin && global.PlatformAdmin.getRoleLabel) {
      return global.PlatformAdmin.getRoleLabel({
        role: user.registeredRole || user.role,
        username: user.username,
        isPrimaryAdmin: user.isPrimaryAdmin
      });
    }
    return ROLE_LABELS[user.role] || user.role;
  }

  function mapWmsToDespachoRole(wmsUser) {
    if (!global.PlatformAdmin) return null;
    if (!global.PlatformAdmin.can(wmsUser.role, 'despacho.use', wmsUser)) return null;
    if (wmsUser.role === 'validador') return 'validador';
    if (wmsUser.role === 'preparador') return 'preparador';
    if (global.PlatformAdmin.can(wmsUser.role, 'despacho.validate', wmsUser)) return 'validador';
    return 'preparador';
  }

  function sessionFromWmsUser(wmsUser) {
    var despRole = mapWmsToDespachoRole(wmsUser);
    if (!despRole) return null;
    return {
      id: wmsUser.id,
      username: wmsUser.username,
      name: getDisplayName(wmsUser),
      role: despRole,
      registeredRole: wmsUser.role,
      isPrimaryAdmin: wmsUser.isPrimaryAdmin
    };
  }

  function authenticateWms(username, passwordHash) {
    if (!global.PlatformAdmin) return null;
    var wmsUser = global.PlatformAdmin.authenticate(username, passwordHash);
    if (!wmsUser) return null;
    return sessionFromWmsUser(wmsUser);
  }

  function authenticateLegacy(username, passwordHash) {
    if (global.PlatformSecurity && global.PlatformSecurity.isPublicWeb && global.PlatformSecurity.isPublicWeb()) {
      return null;
    }
    var resolved = resolveUsername(username);
    var user = LEGACY_USERS.find(function (u) {
      return u.active && u.username.toLowerCase() === resolved;
    });
    if (!user || user.passwordHash !== passwordHash) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  }

  function authenticate(username, passwordHash) {
    return authenticateWms(username, passwordHash) || authenticateLegacy(username, passwordHash);
  }

  function getUserById(id) {
    if (global.PlatformAdmin) {
      var wmsUser = global.PlatformAdmin.findUserById(id);
      if (wmsUser) {
        var session = sessionFromWmsUser(wmsUser);
        if (session) return session;
      }
    }
    var user = LEGACY_USERS.find(function (u) { return u.id === id && u.active; });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  }

  function canValidate(role) {
    if (role === 'validador') return true;
    if (global.PlatformAdmin) {
      return global.PlatformAdmin.can(role, 'despacho.validate', { role: role });
    }
    return false;
  }

  /** Administrador de plataforma (incl. administrador general): puede detener pantalla TV ajena. */
  function isDespachoAdmin(user) {
    if (!user) return false;
    if (user.isPrimaryAdmin === true) return true;
    if (global.PlatformAdmin) {
      if (global.PlatformAdmin.isPrimaryAdminUser && global.PlatformAdmin.isPrimaryAdminUser(user)) {
        return true;
      }
      if (user.id && global.PlatformAdmin.findUserById) {
        var wms = global.PlatformAdmin.findUserById(user.id);
        if (wms && global.PlatformAdmin.isPrimaryAdminUser(wms)) return true;
      }
    }
    var role = user.registeredRole || user.role;
    if (role === 'administrador') return true;
    if (global.PlatformAdmin && global.PlatformAdmin.canAccessAdminModal) {
      return global.PlatformAdmin.canAccessAdminModal(user);
    }
    if (global.PlatformAdmin && global.PlatformAdmin.can) {
      return global.PlatformAdmin.can(role, 'admin.panel', user) ||
        global.PlatformAdmin.can(role, 'data.import', user);
    }
    return false;
  }

  function getUsers() {
    return LEGACY_USERS.slice();
  }

  global.PlatformDespachoAuth = {
    ROLE_LABELS: ROLE_LABELS,
    getUsers: getUsers,
    getDisplayName: getDisplayName,
    getRoleLabel: getRoleLabel,
    authenticate: authenticate,
    getUserById: getUserById,
    canValidate: canValidate,
    isDespachoAdmin: isDespachoAdmin
  };
})(typeof window !== 'undefined' ? window : this);
