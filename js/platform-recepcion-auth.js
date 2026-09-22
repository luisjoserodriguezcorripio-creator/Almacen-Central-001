/**
 * Autenticación — Control Patio · Recepción de contenedores
 * Un solo login; permisos del usuario WMS definen qué puede hacer.
 */
(function (global) {
  'use strict';

  function getDisplayName(user) {
    if (!user) return '';
    return String(user.name || user.username || '').trim();
  }

  function getAccessLabel(user) {
    if (!user) return '';
    var parts = [];
    if (canRegister(user)) parts.push('Registro');
    if (canValidate(user)) parts.push('Validación y entrada');
    return parts.length ? parts.join(' · ') : 'Recepción';
  }

  function sessionFromWmsUser(wmsUser) {
    if (!global.PlatformAdmin || !wmsUser) return null;
    var canUse = global.PlatformAdmin.can(wmsUser.role, 'recepcion.use', wmsUser);
    var canVal = global.PlatformAdmin.can(wmsUser.role, 'recepcion.validate', wmsUser);
    if (!canUse && !canVal) return null;
    return {
      id: wmsUser.id,
      username: wmsUser.username,
      name: getDisplayName(wmsUser),
      canRegister: canUse,
      canValidate: canVal,
      registeredRole: wmsUser.role,
      isPrimaryAdmin: wmsUser.isPrimaryAdmin
    };
  }

  function authenticate(username, passwordHash) {
    if (!global.PlatformAdmin) return null;
    var wmsUser = global.PlatformAdmin.authenticate(username, passwordHash);
    if (!wmsUser) return null;
    return sessionFromWmsUser(wmsUser);
  }

  function getUserById(userId) {
    if (!global.PlatformAdmin || !userId) return null;
    var users = global.PlatformAdmin.getUsers ? global.PlatformAdmin.getUsers() : [];
    var i;
    for (i = 0; i < users.length; i++) {
      if (users[i].id === userId && users[i].active !== false) {
        return sessionFromWmsUser(users[i]);
      }
    }
    return null;
  }

  function normalizeStoredUser(user) {
    if (!user) return null;
    if (user.canRegister != null || user.canValidate != null) {
      if (!user.canRegister && !user.canValidate) return null;
      return user;
    }
    if (user.role === 'registrador') {
      user.canRegister = true;
      user.canValidate = false;
    } else if (user.role === 'validador') {
      user.canRegister = false;
      user.canValidate = true;
    } else {
      return null;
    }
    delete user.role;
    return user;
  }

  function canValidate(user) {
    return !!(user && user.canValidate);
  }

  function canRegister(user) {
    return !!(user && user.canRegister);
  }

  global.PlatformRecepcionAuth = {
    authenticate: authenticate,
    getUserById: getUserById,
    normalizeStoredUser: normalizeStoredUser,
    getDisplayName: getDisplayName,
    getAccessLabel: getAccessLabel,
    getRoleLabel: getAccessLabel,
    canValidate: canValidate,
    canRegister: canRegister
  };
})(typeof window !== 'undefined' ? window : this);
