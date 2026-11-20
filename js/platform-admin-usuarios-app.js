/**
 * Portal único — Administrar usuarios (crear, editar, borrar, contraseña)
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;
  var FB_PATH = 'platform/users';
  var SESSION_KEYS = ['dc_agenda_session', 'panel_almacen_session', 'dc_admin_usuarios_session'];

  var state = {
    user: null,
    editId: '',
    filter: ''
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function canManageUsers(user) {
    if (!user || !Auth) return false;
    if (user.isPrimaryAdmin) return true;
    if (user.role === 'administrador') return true;
    return !!(Auth.can && Auth.can(user.role, 'users.manage', user));
  }

  function sha(password) {
    return PC.sha256Sync(String(password || '').trim());
  }

  function readAnySession() {
    for (var i = 0; i < SESSION_KEYS.length; i++) {
      try {
        var raw = localStorage.getItem(SESSION_KEYS[i]);
        if (!raw) continue;
        var sess = JSON.parse(raw);
        if (sess && sess.userId) return sess;
      } catch (e) { /* noop */ }
    }
    return null;
  }

  function saveSession(user) {
    try {
      localStorage.setItem('dc_admin_usuarios_session', JSON.stringify({ userId: user.id, at: Date.now() }));
    } catch (e) { /* noop */ }
  }

  function clearSession() {
    try { localStorage.removeItem('dc_admin_usuarios_session'); } catch (e) { /* noop */ }
  }

  function setAuthVisible(visible) {
    var overlay = $('adminUsersAuth');
    var app = $('adminUsersApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) app.classList.toggle('is-hidden', visible);
    document.body.classList.toggle('auth-locked', visible);
  }

  function roleLabel(role) {
    return (Auth.ROLE_LABELS && Auth.ROLE_LABELS[role]) || role || '—';
  }

  function fillAgendaPuestos(selected) {
    var sel = $('auAgendaPuesto');
    if (!sel || !Auth || !Auth.AGENDA_PUESTO_IDS) return;
    var cur = selected || '';
    sel.innerHTML = '<option value="">Sin puesto de agenda</option>';
    Object.keys(Auth.AGENDA_PUESTO_IDS).forEach(function (id) {
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = Auth.AGENDA_PUESTO_IDS[id];
      if (id === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function resetForm() {
    state.editId = '';
    if ($('auEditId')) $('auEditId').value = '';
    if ($('auUsername')) $('auUsername').value = '';
    if ($('auName')) $('auName').value = '';
    if ($('auRole')) $('auRole').value = 'colaborador';
    if ($('auPassword')) $('auPassword').value = '';
    if ($('auActive')) $('auActive').checked = true;
    fillAgendaPuestos('');
    if ($('auFormTitle')) $('auFormTitle').textContent = 'Nuevo usuario';
    if ($('auSaveBtn')) $('auSaveBtn').textContent = 'Crear usuario';
    if ($('auCancelEdit')) $('auCancelEdit').hidden = true;
  }

  function loadUserToForm(user) {
    if (!user) return;
    state.editId = user.id;
    $('auEditId').value = user.id;
    $('auUsername').value = user.username || '';
    $('auName').value = user.name || '';
    $('auRole').value = user.role || 'colaborador';
    $('auPassword').value = '';
    $('auActive').checked = user.active !== false;
    fillAgendaPuestos(user.agendaPuesto || '');
    $('auFormTitle').textContent = 'Editar usuario';
    $('auSaveBtn').textContent = 'Guardar cambios';
    $('auCancelEdit').hidden = false;
    try { $('auUsername').focus(); } catch (e) { /* noop */ }
  }

  function staffList() {
    var list = Auth.getVisibleUsers ? Auth.getVisibleUsers() : (Auth.getStaffUsers ? Auth.getStaffUsers() : []);
    var q = String(state.filter || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (u) {
      return String(u.username || '').toLowerCase().indexOf(q) >= 0 ||
        String(u.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(u.role || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderTable() {
    var host = $('auUsersTable');
    if (!host) return;
    var rows = staffList();
    if (!rows.length) {
      host.innerHTML = '<p class="au-empty">No hay usuarios' + (state.filter ? ' con ese filtro' : '') + '.</p>';
      return;
    }
    host.innerHTML =
      '<div class="au-table-wrap"><table class="au-table">' +
      '<thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Agenda</th><th>Estado</th><th></th></tr></thead>' +
      '<tbody>' + rows.map(function (u) {
        var agenda = (Auth.getAgendaPuestoLabel && Auth.getAgendaPuestoLabel(u.agendaPuesto)) || u.agendaPuesto || '—';
        return '<tr data-user-id="' + esc(u.id) + '">' +
          '<td><strong>' + esc(u.username) + '</strong></td>' +
          '<td>' + esc(u.name) + '</td>' +
          '<td>' + esc(roleLabel(u.role)) + '</td>' +
          '<td>' + esc(agenda) + '</td>' +
          '<td>' + (u.active === false ? '<span class="au-badge au-badge--off">Inactivo</span>' : '<span class="au-badge au-badge--on">Activo</span>') + '</td>' +
          '<td class="au-actions">' +
          '<button type="button" class="au-btn au-btn--ghost" data-au-action="edit" data-user-id="' + esc(u.id) + '">Editar</button>' +
          '<button type="button" class="au-btn au-btn--ghost" data-au-action="password" data-user-id="' + esc(u.id) + '">Clave</button>' +
          '<button type="button" class="au-btn au-btn--danger" data-au-action="delete" data-user-id="' + esc(u.id) + '">Borrar</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function syncCloudBadge(ok) {
    var el = $('auCloudBadge');
    if (!el) return;
    el.textContent = ok ? '● EN VIVO' : '○ LOCAL';
    el.classList.toggle('au-live--ok', !!ok);
  }

  function pushUsersToFirebase() {
    var bridge = global.PlatformFirebaseBridge;
    if (!bridge || !bridge.ensureReady || !Auth.exportStaffForWeb) {
      return Promise.resolve(false);
    }
    var payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      users: Auth.exportStaffForWeb(),
      updatedBy: state.user && (state.user.name || state.user.username) || ''
    };
    return bridge.ensureReady().then(function () {
      return bridge.push(FB_PATH, payload);
    }).then(function (ok) {
      syncCloudBadge(!!ok);
      return !!ok;
    }).catch(function () {
      syncCloudBadge(false);
      return false;
    });
  }

  function pullUsersFromFirebase() {
    var bridge = global.PlatformFirebaseBridge;
    if (!bridge || !bridge.ensureReady || !Auth.importWebUsers) {
      return Promise.resolve(false);
    }
    return bridge.ensureReady().then(function () {
      return bridge.pull(FB_PATH);
    }).then(function (data) {
      if (!data || !data.users || !data.users.length) return false;
      Auth.importWebUsers(data);
      syncCloudBadge(true);
      return true;
    }).catch(function () {
      return false;
    });
  }

  function afterMutation(msg) {
    renderTable();
    return pushUsersToFirebase().then(function (cloudOk) {
      if (global.PlatformWebUsers && global.PlatformWebUsers.publishLive) {
        return global.PlatformWebUsers.publishLive().then(function () {
          toast((msg || 'Guardado') + (cloudOk ? ' · nube' : ''), 'ok');
        }).catch(function () {
          toast((msg || 'Guardado') + (cloudOk ? ' · nube' : ' en este equipo'), cloudOk ? 'ok' : 'err');
        });
      }
      toast((msg || 'Guardado') + (cloudOk ? ' · sincronizado' : ' en este equipo'), cloudOk ? 'ok' : 'ok');
    });
  }

  function handleSave(ev) {
    ev.preventDefault();
    var username = String(($('auUsername') && $('auUsername').value) || '').trim();
    var name = String(($('auName') && $('auName').value) || '').trim();
    var role = ($('auRole') && $('auRole').value) || 'colaborador';
    var password = String(($('auPassword') && $('auPassword').value) || '').trim();
    var agendaPuesto = ($('auAgendaPuesto') && $('auAgendaPuesto').value) || '';
    var active = !($('auActive') && !$('auActive').checked);
    if (!username || !name) {
      toast('Usuario y nombre son obligatorios.', 'err');
      return;
    }
    var editId = state.editId || ($('auEditId') && $('auEditId').value) || '';
    if (editId) {
      var patch = {
        username: username,
        name: name,
        role: role,
        agendaPuesto: agendaPuesto,
        active: active
      };
      if (password) patch.passwordHash = sha(password);
      var upd = Auth.updateUser(editId, patch);
      if (!upd.ok) {
        toast(upd.message || 'No se pudo actualizar.', 'err');
        return;
      }
      resetForm();
      afterMutation('Usuario actualizado.');
      return;
    }
    if (!password) {
      toast('Indique una contraseña para el usuario nuevo.', 'err');
      return;
    }
    var created = Auth.createUser({
      username: username,
      name: name,
      role: role,
      passwordHash: sha(password),
      agendaPuesto: agendaPuesto,
      active: active,
      areas: [],
      extraPermissions: []
    });
    if (!created.ok) {
      toast(created.message || 'No se pudo crear.', 'err');
      return;
    }
    resetForm();
    afterMutation('Usuario creado.');
  }

  function changePassword(userId) {
    var user = Auth.findUserById(userId);
    if (!user) return;
    var pwd = global.prompt('Nueva contraseña para ' + (user.name || user.username) + ':', '');
    if (pwd == null) return;
    pwd = String(pwd).trim();
    if (!pwd) {
      toast('Contraseña vacía.', 'err');
      return;
    }
    var res = Auth.updateUser(userId, { passwordHash: sha(pwd) });
    if (!res.ok) {
      toast(res.message || 'No se pudo cambiar.', 'err');
      return;
    }
    afterMutation('Contraseña actualizada.');
  }

  function deleteUser(userId) {
    var user = Auth.findUserById(userId);
    if (!user) return;
    if (!global.confirm('¿Eliminar a ' + (user.name || user.username) + '?')) return;
    var res = Auth.deleteUser(userId);
    if (!res.ok) {
      toast(res.message || 'No se pudo eliminar.', 'err');
      return;
    }
    if (state.editId === userId) resetForm();
    afterMutation('Usuario eliminado.');
  }

  function enterApp(user) {
    state.user = user;
    saveSession(user);
    setAuthVisible(false);
    if ($('auUserLabel')) $('auUserLabel').textContent = user.name || user.username;
    fillAgendaPuestos('');
    resetForm();
    pullUsersFromFirebase().then(function () {
      if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
        return global.PlatformWebUsers.ready();
      }
    }).finally(function () {
      renderTable();
      pushUsersToFirebase();
    });
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('auAuthUsername') && $('auAuthUsername').value);
    var password = String(($('auAuthPassword') && $('auAuthPassword').value) || '').trim();
    if (!username || !password) {
      toast('Usuario y contraseña requeridos.', 'err');
      return;
    }
    var user = Auth.authenticate(username, sha(password));
    if (!user) {
      toast('Credenciales incorrectas.', 'err');
      return;
    }
    if (!canManageUsers(user)) {
      toast('Solo administradores pueden gestionar usuarios.', 'err');
      return;
    }
    enterApp(user);
  }

  function tryRestore() {
    var sess = readAnySession();
    if (!sess || !sess.userId) return false;
    var user = Auth.findUserById(sess.userId);
    if (!user || !canManageUsers(user)) return false;
    enterApp(user);
    return true;
  }

  function bind() {
    var form = $('auUserForm');
    if (form) form.addEventListener('submit', handleSave);
    var authForm = $('auAuthForm');
    if (authForm) {
      authForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        doLogin();
      });
    }
    var cancel = $('auCancelEdit');
    if (cancel) cancel.addEventListener('click', resetForm);
    var search = $('auSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.filter = search.value;
        renderTable();
      });
    }
    var refresh = $('auRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        pullUsersFromFirebase().then(function () {
          if (global.PlatformWebUsers && global.PlatformWebUsers.refresh) {
            return global.PlatformWebUsers.refresh();
          }
        }).finally(function () {
          renderTable();
          toast('Lista actualizada.', 'ok');
        });
      });
    }
    var logout = $('auLogout');
    if (logout) {
      logout.addEventListener('click', function () {
        clearSession();
        state.user = null;
        setAuthVisible(true);
      });
    }
    var host = $('auUsersTable');
    if (host) {
      host.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-au-action]');
        if (!btn) return;
        var id = btn.getAttribute('data-user-id');
        var action = btn.getAttribute('data-au-action');
        if (action === 'edit') loadUserToForm(Auth.findUserById(id));
        if (action === 'password') changePassword(id);
        if (action === 'delete') deleteUser(id);
      });
    }
    var menuToggle = $('auMenuToggle');
    var menuPanel = $('auMenuPanel');
    if (menuToggle && menuPanel) {
      menuToggle.addEventListener('click', function () {
        var open = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        menuPanel.hidden = open;
      });
      document.addEventListener('click', function (ev) {
        if (!ev.target.closest('#auMenu')) {
          menuToggle.setAttribute('aria-expanded', 'false');
          menuPanel.hidden = true;
        }
      });
    }
  }

  function start() {
    if (!PC || !Auth) return;
    bind();
    if (!tryRestore()) setAuthVisible(true);
  }

  function boot() {
    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      var started = false;
      function safeStart() {
        if (started) return;
        started = true;
        start();
      }
      global.PlatformWebUsers.ready().then(safeStart).catch(safeStart);
      global.setTimeout(safeStart, 3800);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
