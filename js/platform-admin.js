/**
 * Administración: usuarios, áreas, permisos, solicitudes de acceso, logs
 */
(function (global) {
  'use strict';

  var KEYS = {
    users: 'almacen_users',
    areas: 'almacen_areas',
    logs: 'almacen_logs',
    accessRequests: 'almacen_access_requests'
  };

  var PERMISSIONS = {
    'dashboard.view': 'Ver dashboards',
    'filter.apply': 'Aplicar filtros',
    'data.import': 'Importar Excel',
    'users.manage': 'Gestionar usuarios',
    'areas.manage': 'Gestionar áreas',
    'config.save': 'Configuración',
    'logs.view': 'Ver historial',
    'ai.use': 'Asistente IA',
    'tv.mode': 'Modo TV',
    'admin.panel': 'Panel administración completo',
    'export.data': 'Exportar datos',
    'reportes.view': 'Ver módulo Reportes',
    'despacho.use': 'Módulo Despacho (preparador)',
    'despacho.validate': 'Validador de despacho',
    'access.request': 'Solicitar acceso a configuración',
    'requests.manage': 'Gestionar solicitudes de acceso',
    'news.manage': 'Publicar noticias del tablón',
    'agenda.use': 'Módulo Agenda operativa',
    'agenda.all': 'Agenda — ver todos los puestos',
    'recepcion.use': 'Gestión de Recepción y Ubicación',
    'recepcion.validate': 'Validar y dar entrada a contenedores'
  };

  var SECONDARY_ADMIN_PERMISSIONS = [
    'dashboard.view', 'filter.apply', 'data.import', 'export.data', 'reportes.view',
    'ai.use', 'tv.mode', 'despacho.use', 'despacho.validate', 'logs.view', 'news.manage',
    'agenda.use', 'agenda.all', 'recepcion.use', 'recepcion.validate'
  ];

  var PRIMARY_ONLY_PERMISSIONS = [
    'config.save', 'users.manage', 'areas.manage', 'requests.manage', 'admin.panel'
  ];

  var ROLE_PERMISSIONS = {
    administrador: SECONDARY_ADMIN_PERMISSIONS,
    supervisor: ['dashboard.view', 'filter.apply', 'data.import', 'export.data', 'reportes.view', 'logs.view', 'ai.use', 'tv.mode', 'despacho.use', 'despacho.validate', 'agenda.use', 'recepcion.use', 'recepcion.validate'],
    colaborador: ['dashboard.view', 'filter.apply', 'data.import', 'export.data', 'reportes.view', 'ai.use', 'tv.mode', 'despacho.use', 'despacho.validate', 'access.request', 'agenda.use', 'recepcion.use', 'recepcion.validate'],
    operador: ['dashboard.view', 'tv.mode', 'despacho.use', 'recepcion.use'],
    preparador: ['dashboard.view', 'tv.mode', 'despacho.use', 'recepcion.use'],
    validador: ['dashboard.view', 'tv.mode', 'despacho.use', 'despacho.validate', 'reportes.view', 'export.data', 'filter.apply', 'recepcion.use', 'recepcion.validate']
  };

  var ROLE_LABELS = {
    administrador: 'Administrador',
    supervisor: 'Supervisor',
    colaborador: 'Colaborador',
    operador: 'Operador',
    preparador: 'Preparador',
    validador: 'Validador'
  };

  var AGENDA_PUESTO_IDS = {
    supervisor_inventario: 'Supervisor de Inventario',
    digitadora_inventario: 'Digitadora de Inventario',
    coordinador_almacen: 'Coordinador Almacén',
    auxiliar_despacho: 'Auxiliar de Despacho',
    supervisor_despacho: 'Supervisor de Despacho',
    supervisor_validadores: 'Supervisor de Validadores',
    supervisor_devoluciones: 'Supervisor de Devoluciones',
    coordinador_recepcion: 'Coordinador Recepción',
    supervisora_oficina: 'Supervisora de Oficina'
  };

  // Administrador general — usuario y contraseña SOLO se cambian aquí (Cursor), no en la plataforma.
  // Cuenta propia — cambie usuario/hash aquí (no desde la UI).
  var PRIMARY_ADMIN_USERNAME = 'luisjose';
  var ADMIN_DEFAULT_PASSWORD_HASH = 'a8ffef0576b53a79c84409727674ee096bf2d67961aa9ebd613f2b06a2fc423c';
  var CREDENTIALS_VERSION = 5;
  var PRIMARY_LOGIN_ALIASES = ['admin', 'administrador'];

  var DEFAULT_USERS = [
    {
      id: 'u_primary_admin',
      username: PRIMARY_ADMIN_USERNAME,
      name: 'Administrador general',
      role: 'administrador',
      passwordHash: ADMIN_DEFAULT_PASSWORD_HASH,
      areas: [],
      active: true,
      extraPermissions: [],
      isPrimaryAdmin: true
    }
  ];

  var DEFAULT_AREAS = [
    { id: 'a1', name: 'Recepción', description: 'Órdenes de compra y recibos', active: true },
    { id: 'a2', name: 'Control', description: 'Inventario y recuentos', active: true },
    { id: 'a3', name: 'Despacho', description: 'Ventas y reabastecimiento', active: true },
    { id: 'a4', name: 'Transferencia', description: 'Emisión de transferencias', active: true }
  ];

  function parse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizeUser(u) {
    if (!u.extraPermissions) u.extraPermissions = [];
    u.agendaPuesto = normalizeAgendaPuestoField(u.agendaPuesto);
    return u;
  }

  function normalizeAgendaPuestoField(value) {
    var id = String(value || '').trim();
    if (!id) return '';
    if (AGENDA_PUESTO_IDS[id]) return id;
    return '';
  }

  function getAgendaPuestoLabel(id) {
    return AGENDA_PUESTO_IDS[id] || '';
  }

  function dedupeStaffByUsername(staffList) {
    var byKey = Object.create(null);

    function score(u) {
      var s = 0;
      if (u.active !== false) s += 8;
      if (u.passwordHash) s += 4;
      if (u.name && String(u.name).trim() && String(u.name).toLowerCase() !== String(u.username || '').toLowerCase()) {
        s += 2;
      }
      return s;
    }

    (staffList || []).forEach(function (u) {
      if (!u || !u.username) return;
      var key = String(u.username).toLowerCase().trim();
      if (!key) return;
      var prev = byKey[key];
      if (!prev) {
        byKey[key] = normalizeUser(Object.assign({}, u));
        return;
      }
      var keep = score(u) >= score(prev) ? u : prev;
      var drop = keep === u ? prev : u;
      byKey[key] = normalizeUser(Object.assign({}, drop, keep, {
        id: keep.id || drop.id,
        username: keep.username || drop.username
      }));
    });

    return Object.values(byKey);
  }

  function isPrimaryAdminUser(user) {
    if (!user) return false;
    if (user.isPrimaryAdmin) return true;
    return String(user.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase();
  }

  function isPrimaryLoginName(username) {
    var un = String(username || '').toLowerCase().trim();
    if (un === PRIMARY_ADMIN_USERNAME.toLowerCase()) return true;
    return PRIMARY_LOGIN_ALIASES.indexOf(un) >= 0;
  }

  function isPrimaryPasswordHash(passwordHash) {
    return passwordHash === ADMIN_DEFAULT_PASSWORD_HASH;
  }

  function syncPrimaryFromCode(user) {
    return normalizeUser(Object.assign({}, user, {
      role: 'administrador',
      active: true,
      isPrimaryAdmin: true,
      username: PRIMARY_ADMIN_USERNAME,
      passwordHash: ADMIN_DEFAULT_PASSWORD_HASH
    }));
  }

  function maskLogIdentity(value) {
    if (value == null || value === '') return value;
    var str = String(value);
    if (str.toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase()) {
      var primary = getPrimaryAdmin();
      return primary ? (getDisplayName(primary) || 'Administrador general') : 'Administrador general';
    }
    return str;
  }

  function ensureUserRegistry(list) {
    var primaryKey = PRIMARY_ADMIN_USERNAME.toLowerCase();
    var staff = [];
    var primary = null;

    (list || []).forEach(function (u) {
      var un = String(u.username || '').toLowerCase();
      if (un === primaryKey) {
        primary = syncPrimaryFromCode(u);
        return;
      }
      if (un === 'admin' && u.role === 'administrador') {
        return;
      }
      if (u.isPrimaryAdmin) {
        return;
      }
      var copy = Object.assign({}, u);
      if (copy.role === 'administrador') {
        copy.isPrimaryAdmin = false;
      }
      staff.push(normalizeUser(copy));
    });

    staff = staff.filter(function (u) {
      return String(u.username || '').toLowerCase() !== primaryKey;
    });

    staff = dedupeStaffByUsername(staff);

    if (!primary) {
      primary = syncPrimaryFromCode({
        id: 'u_primary_admin',
        name: 'Administrador general',
        areas: [],
        extraPermissions: []
      });
    }

    return [primary].concat(staff);
  }

  function getUsers() {
    if (!global.localStorage) {
      return ensureUserRegistry(DEFAULT_USERS).map(function (u) { return Object.assign({}, u); });
    }
    var list = parse(localStorage.getItem(KEYS.users), null);
    if (!list || !list.length) {
      var seeded = ensureUserRegistry(DEFAULT_USERS);
      saveUsers(seeded);
      return seeded.map(function (u) { return Object.assign({}, u); });
    }
    var normalized = ensureUserRegistry(list);
    var primary = normalized.find(isPrimaryAdminUser);
    var mustSave = JSON.stringify(normalized) !== JSON.stringify(list);
    if (primary && primary.passwordHash !== ADMIN_DEFAULT_PASSWORD_HASH) {
      mustSave = true;
      normalized = ensureUserRegistry(normalized);
    }
    if (mustSave) saveUsers(normalized);
    return normalized.map(function (u) { return Object.assign({}, u); });
  }

  function forceSyncPrimaryCredentials() {
    if (!global.localStorage) return;
    var verKey = 'almacen_admin_cred_ver';
    var ver = localStorage.getItem(verKey);
    if (ver !== String(CREDENTIALS_VERSION)) {
      localStorage.setItem(verKey, String(CREDENTIALS_VERSION));
      try {
        localStorage.removeItem('almacen_login_attempts');
        localStorage.removeItem('panel_almacen_session');
      } catch (e) { /* noop */ }
    }
    var list = parse(localStorage.getItem(KEYS.users), null);
    var normalized = ensureUserRegistry(list && list.length ? list : DEFAULT_USERS);
    saveUsers(normalized);
  }

  function getPrimaryAdmin() {
    return getUsers().find(isPrimaryAdminUser) || null;
  }

  function getStaffUsers() {
    var primaryKey = PRIMARY_ADMIN_USERNAME.toLowerCase();
    return getUsers().filter(function (u) {
      if (isPrimaryAdminUser(u)) return false;
      return String(u.username || '').toLowerCase() !== primaryKey;
    });
  }

  function getVisibleUsers() {
    return getStaffUsers();
  }

  function exportStaffForWeb() {
    return dedupeStaffByUsername(getStaffUsers()).map(function (u) {
      return {
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        passwordHash: u.passwordHash,
        areas: u.areas || [],
        active: u.active !== false,
        extraPermissions: u.extraPermissions || [],
        agendaPuesto: normalizeAgendaPuestoField(u.agendaPuesto)
      };
    });
  }

  function mergeWebUsersFromRemote(localList, remoteList) {
    var map = Object.create(null);
    var byUsername = Object.create(null);

    (Array.isArray(localList) ? localList : []).forEach(function (u) {
      if (!u || !u.id) return;
      var copy = normalizeUser(Object.assign({}, u));
      map[u.id] = copy;
      var un = String(u.username || '').toLowerCase().trim();
      if (un) byUsername[un] = copy;
    });

    (Array.isArray(remoteList) ? remoteList : []).forEach(function (u) {
      if (!u || !u.username) return;
      var un = String(u.username).toLowerCase().trim();
      var target = (u.id && map[u.id]) || byUsername[un] || null;
      if (target) {
        var merged = normalizeUser(Object.assign({}, target, u, {
          id: target.id,
          username: u.username || target.username,
          isPrimaryAdmin: false
        }));
        if (merged.role === 'administrador') merged.isPrimaryAdmin = false;
        map[target.id] = merged;
        byUsername[un] = merged;
        return;
      }
      var created = normalizeUser(Object.assign({}, u));
      if (created.role === 'administrador') created.isPrimaryAdmin = false;
      map[created.id] = created;
      if (un) byUsername[un] = created;
    });

    return ensureUserRegistry(Object.values(map));
  }

  function importWebUsers(payload) {
    var remote = [];
    var updatedAt = '';
    if (Array.isArray(payload)) {
      remote = payload;
    } else if (payload && Array.isArray(payload.users)) {
      remote = payload.users;
      updatedAt = String(payload.updatedAt || '');
    }
    if (!remote.length) {
      return { count: 0, updatedAt: updatedAt };
    }
    var local = getUsers();
    var merged = mergeWebUsersFromRemote(local, remote);
    saveUsers(merged);
    if (updatedAt && global.localStorage) {
      localStorage.setItem(KEYS.users + '_web', updatedAt);
    }
    return { count: remote.length, updatedAt: updatedAt, total: merged.length };
  }

  function mergeUserRegistries(localList, remoteList) {
    var map = Object.create(null);
    (Array.isArray(remoteList) ? remoteList : []).forEach(function (u) {
      if (u && u.id) map[u.id] = normalizeUser(Object.assign({}, u));
    });
    (Array.isArray(localList) ? localList : []).forEach(function (u) {
      if (u && u.id) {
        map[u.id] = normalizeUser(Object.assign({}, map[u.id] || {}, u));
      }
    });
    var merged = ensureUserRegistry(Object.values(map));
    var primary = merged.find(isPrimaryAdminUser);
    var staff = dedupeStaffByUsername(merged.filter(function (u) { return !isPrimaryAdminUser(u); }));
    return primary ? [primary].concat(staff) : staff;
  }

  function saveUsers(users) {
    var list = ensureUserRegistry((users || []).map(normalizeUser));
    if (global.localStorage) {
      localStorage.setItem(KEYS.users, JSON.stringify(list));
      localStorage.setItem(KEYS.users + '_sync', String(Date.now()));
    }
  }

  function getAreas() {
    if (!global.localStorage) return DEFAULT_AREAS.slice();
    var list = parse(localStorage.getItem(KEYS.areas), null);
    if (!list || !list.length) {
      saveAreas(DEFAULT_AREAS);
      return DEFAULT_AREAS.slice();
    }
    return list;
  }

  function saveAreas(areas) {
    if (global.localStorage) localStorage.setItem(KEYS.areas, JSON.stringify(areas));
  }

  function getLogs() {
    if (!global.localStorage) return [];
    return parse(localStorage.getItem(KEYS.logs), []);
  }

  function getAccessRequests() {
    if (!global.localStorage) return [];
    return parse(localStorage.getItem(KEYS.accessRequests), []);
  }

  function saveAccessRequests(list) {
    if (global.localStorage) localStorage.setItem(KEYS.accessRequests, JSON.stringify(list));
  }

  function clearLogs() {
    if (global.localStorage) localStorage.setItem(KEYS.logs, JSON.stringify([]));
    return { ok: true };
  }

  function addLog(action, detail, username) {
    var logs = getLogs();
    logs.unshift({
      id: uid(),
      at: new Date().toISOString(),
      action: action,
      detail: maskLogIdentity(detail || ''),
      user: maskLogIdentity(username || 'sistema')
    });
    if (logs.length > 200) logs = logs.slice(0, 200);
    if (global.localStorage) localStorage.setItem(KEYS.logs, JSON.stringify(logs));
  }

  function userExtraPermissions(user) {
    if (!user || !user.extraPermissions) return [];
    return user.extraPermissions;
  }

  function canManageConfig(user) {
    return isPrimaryAdminUser(user);
  }

  function getDisplayName(user) {
    if (!user) return '';
    if (isPrimaryAdminUser(user)) return 'Administrador general';
    var name = String(user.name || '').trim();
    return name || String(user.username || '').trim();
  }

  function getLogActor(user) {
    if (!user) return 'sistema';
    if (isPrimaryAdminUser(user)) return 'Administrador general';
    return user.username || user.name || 'sistema';
  }

  function getRoleLabel(user) {
    if (!user) return '';
    if (isPrimaryAdminUser(user)) return 'Administrador general';
    return ROLE_LABELS[user.role] || user.role;
  }

  function can(role, permission, user) {
    if (PRIMARY_ONLY_PERMISSIONS.indexOf(permission) >= 0) {
      return isPrimaryAdminUser(user);
    }
    if (user && userExtraPermissions(user).indexOf(permission) >= 0) {
      if (PRIMARY_ONLY_PERMISSIONS.indexOf(permission) >= 0) return isPrimaryAdminUser(user);
      return true;
    }
    if (role === 'administrador' && isPrimaryAdminUser(user)) {
      return true;
    }
    var perms = ROLE_PERMISSIONS[role] || [];
    return perms.indexOf(permission) >= 0;
  }

  function canAccessAdminModal(user) {
    if (!user) return false;
    return can(user.role, 'admin.panel', user) || can(user.role, 'data.import', user);
  }

  function authenticate(username, passwordHash) {
    if (!isPrimaryLoginName(username)) {
      var un = String(username || '').toLowerCase().trim();
      var user = getUsers().find(function (u) {
        return u.active && !isPrimaryAdminUser(u) && u.username.toLowerCase() === un;
      });
      if (!user || user.passwordHash !== passwordHash) return null;
      return normalizeUser(Object.assign({}, user));
    }
    if (!isPrimaryPasswordHash(passwordHash)) return null;
    var users = getUsers();
    var primary = users.find(isPrimaryAdminUser);
    if (!primary) {
      primary = syncPrimaryFromCode({
        id: 'u_primary_admin',
        name: 'Administrador general',
        areas: [],
        extraPermissions: []
      });
    } else {
      primary = syncPrimaryFromCode(primary);
    }
    if (!primary.active) return null;
    var idx = users.findIndex(isPrimaryAdminUser);
    if (idx >= 0) users[idx] = primary;
    else users.unshift(primary);
    saveUsers(ensureUserRegistry(users));
    return normalizeUser(Object.assign({}, primary));
  }

  function findUserById(id) {
    return getUsers().find(function (u) { return u.id === id; }) || null;
  }

  function createUser(data) {
    if (String(data.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase()) {
      return { ok: false, message: 'Ese nombre está reservado para el administrador general.' };
    }
    if (data.role === 'administrador') {
      data.isPrimaryAdmin = false;
    }
    var users = getUsers();
    if (users.some(function (u) { return u.username.toLowerCase() === data.username.toLowerCase(); })) {
      return { ok: false, message: 'El usuario ya existe.' };
    }
    var user = normalizeUser({
      id: uid(),
      username: String(data.username || '').trim(),
      name: String(data.name || data.username || '').trim() || String(data.username || '').trim(),
      role: data.role,
      passwordHash: data.passwordHash,
      areas: data.areas || [],
      active: data.active !== false,
      extraPermissions: data.extraPermissions || [],
      agendaPuesto: normalizeAgendaPuestoField(data.agendaPuesto),
      isPrimaryAdmin: data.role === 'administrador' ? false : undefined
    });
    users.push(user);
    saveUsers(users);
    return { ok: true, user: user };
  }

  function updateUser(id, patch) {
    var users = getUsers();
    var idx = users.findIndex(function (u) { return u.id === id; });
    if (idx < 0) return { ok: false, message: 'Usuario no encontrado.' };
    if (isPrimaryAdminUser(users[idx])) {
      return { ok: false, message: 'La cuenta del administrador general no se edita desde la plataforma.' };
    } else if (patch.role === 'administrador') {
      patch.isPrimaryAdmin = false;
    }
    if (patch.username && users.some(function (u, i) { return i !== idx && u.username.toLowerCase() === patch.username.toLowerCase(); })) {
      return { ok: false, message: 'Nombre de usuario en uso.' };
    }
    Object.assign(users[idx], patch);
    normalizeUser(users[idx]);
    saveUsers(users);
    return { ok: true, user: users[idx] };
  }

  function deleteUser(id) {
    var target = findUserById(id);
    if (target && isPrimaryAdminUser(target)) {
      return { ok: false, message: 'No se puede eliminar al administrador principal.' };
    }
    var users = getUsers().filter(function (u) { return u.id !== id; });
    if (users.length === getUsers().length) return { ok: false };
    if (users.filter(function (u) { return u.role === 'administrador'; }).length === 0) {
      return { ok: false, message: 'Debe existir al menos un administrador.' };
    }
    saveUsers(users);
    return { ok: true };
  }

  function submitAccessRequest(user, permission, reason) {
    if (!user) return { ok: false, message: 'Sesión no válida.' };
    if (!can(user.role, 'access.request', user)) {
      return { ok: false, message: 'No puede enviar solicitudes.' };
    }
    if (can(user.role, permission, user)) {
      return { ok: false, message: 'Ya tiene ese permiso.' };
    }
    var perm = permission || 'config.save';
    var list = getAccessRequests();
    var pending = list.find(function (r) {
      return r.userId === user.id && r.permission === perm && r.status === 'pending';
    });
    if (pending) {
      return { ok: false, message: 'Ya tiene una solicitud pendiente para este acceso.' };
    }
    var req = {
      id: uid(),
      userId: user.id,
      username: user.username,
      name: user.name || user.username,
      permission: perm,
      reason: String(reason || '').trim(),
      status: 'pending',
      at: new Date().toISOString(),
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: ''
    };
    list.unshift(req);
    saveAccessRequests(list);
    addLog('solicitud_acceso', perm + ' — ' + user.username, user.username);
    return { ok: true, request: req };
  }

  function reviewAccessRequest(id, approved, reviewer, note) {
    var list = getAccessRequests();
    var idx = list.findIndex(function (r) { return r.id === id; });
    if (idx < 0) return { ok: false, message: 'Solicitud no encontrada.' };
    if (list[idx].status !== 'pending') {
      return { ok: false, message: 'La solicitud ya fue revisada.' };
    }
    list[idx].status = approved ? 'approved' : 'rejected';
    list[idx].reviewedBy = reviewer || 'admin';
    list[idx].reviewedAt = new Date().toISOString();
    list[idx].reviewNote = String(note || '').trim();
    saveAccessRequests(list);

    if (approved) {
      var target = findUserById(list[idx].userId);
      if (target) {
        var extra = target.extraPermissions ? target.extraPermissions.slice() : [];
        if (extra.indexOf(list[idx].permission) < 0) extra.push(list[idx].permission);
        updateUser(target.id, { extraPermissions: extra });
      }
    }
    addLog(
      approved ? 'solicitud_aprobada' : 'solicitud_rechazada',
      list[idx].username + ' → ' + list[idx].permission,
      reviewer || 'admin'
    );
    return { ok: true, request: list[idx] };
  }

  function getPendingRequestsCount() {
    return getAccessRequests().filter(function (r) { return r.status === 'pending'; }).length;
  }

  function createArea(data) {
    var areas = getAreas();
    if (areas.some(function (a) { return a.name.toLowerCase() === data.name.toLowerCase(); })) {
      return { ok: false, message: 'El área ya existe.' };
    }
    var area = { id: uid(), name: data.name.trim(), description: (data.description || '').trim(), active: true };
    areas.push(area);
    saveAreas(areas);
    return { ok: true, area: area };
  }

  function updateArea(id, patch) {
    var areas = getAreas();
    var idx = areas.findIndex(function (a) { return a.id === id; });
    if (idx < 0) return { ok: false };
    Object.assign(areas[idx], patch);
    saveAreas(areas);
    return { ok: true };
  }

  function deleteArea(id) {
    saveAreas(getAreas().filter(function (a) { return a.id !== id; }));
    return { ok: true };
  }

  global.PlatformAdmin = {
    KEYS: KEYS,
    PERMISSIONS: PERMISSIONS,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    ROLE_LABELS: ROLE_LABELS,
    AGENDA_PUESTO_IDS: AGENDA_PUESTO_IDS,
    getAgendaPuestoLabel: getAgendaPuestoLabel,
    getUsers: getUsers,
    getPrimaryAdmin: getPrimaryAdmin,
    getStaffUsers: getStaffUsers,
    getVisibleUsers: getVisibleUsers,
    canManageConfig: canManageConfig,
    getDisplayName: getDisplayName,
    getLogActor: getLogActor,
    getRoleLabel: getRoleLabel,
    isPrimaryAdminUser: isPrimaryAdminUser,
    isPrimaryLoginName: isPrimaryLoginName,
    saveUsers: saveUsers,
    mergeUserRegistries: mergeUserRegistries,
    exportStaffForWeb: exportStaffForWeb,
    importWebUsers: importWebUsers,
    getAreas: getAreas,
    saveAreas: saveAreas,
    getLogs: getLogs,
    getAccessRequests: getAccessRequests,
    saveAccessRequests: saveAccessRequests,
    clearLogs: clearLogs,
    addLog: addLog,
    can: can,
    canAccessAdminModal: canAccessAdminModal,
    authenticate: authenticate,
    findUserById: findUserById,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    submitAccessRequest: submitAccessRequest,
    reviewAccessRequest: reviewAccessRequest,
    getPendingRequestsCount: getPendingRequestsCount,
    createArea: createArea,
    updateArea: updateArea,
    deleteArea: deleteArea,
    uid: uid,
    forceSyncPrimaryCredentials: forceSyncPrimaryCredentials
  };

  forceSyncPrimaryCredentials();

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('lan-sync', function (ev) {
      if (ev.detail && ev.detail.store === 'users') {
        forceSyncPrimaryCredentials();
      }
    });
    global.addEventListener('registry-sync', function () {
      forceSyncPrimaryCredentials();
    });
  }
})(typeof window !== 'undefined' ? window : this);
