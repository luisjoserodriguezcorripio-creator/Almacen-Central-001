/**
 * UI del panel de administración
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var TAB_PANE_IDS = {
    excel: 'adminPaneExcel',
    sistema: 'adminPaneSistema',
    herramientas: 'adminPaneHerramientas',
    users: 'adminPaneUsers',
    areas: 'adminPaneAreas',
    config: 'adminPaneConfig',
    logs: 'adminPaneLogs',
    ai: 'adminPaneAi',
    accessRequest: 'adminPaneAccessRequest',
    requests: 'adminPaneRequests',
    news: 'adminPaneNews'
  };

  function statusTag(ok, text) {
    return '<span class="admin-status-tag ' + (ok ? 'ok' : 'err') + '">' + esc(text) + '</span>';
  }

  function renderUsersPanel(primaryHost, staffHost, onEdit, onDelete) {
    if (primaryHost) primaryHost.innerHTML = '';

    if (!staffHost) return;
    var users = global.PlatformAdmin.getVisibleUsers
      ? global.PlatformAdmin.getVisibleUsers()
      : global.PlatformAdmin.getStaffUsers();
    if (!users.length) {
      staffHost.innerHTML = '<p class="admin-empty">Aún no hay usuarios registrados. Agrega aquí solo al personal al que des acceso.</p>';
      return;
    }
    var html = '<div class="admin-table-wrap"><table class="data-table admin-staff-table"><thead><tr>' +
      '<th>Usuario</th><th>Nombre</th><th>Rol</th><th>Agenda / Puesto</th><th>Estado</th><th></th></tr></thead><tbody>';
    users.forEach(function (u) {
      var roleLabel = global.PlatformAdmin.getRoleLabel
        ? global.PlatformAdmin.getRoleLabel(u)
        : (global.PlatformAdmin.ROLE_LABELS[u.role] || u.role);
      var agendaLabel = '—';
      if (u.role === 'administrador' || (global.PlatformAdmin.can && global.PlatformAdmin.can(u.role, 'agenda.all', u))) {
        agendaLabel = 'Todos';
      } else if (u.agendaPuesto && global.PlatformAdmin.getAgendaPuestoLabel) {
        agendaLabel = global.PlatformAdmin.getAgendaPuestoLabel(u.agendaPuesto) || u.agendaPuesto;
      }
      html += '<tr><td>' + esc(u.username) + '</td><td>' + esc(global.PlatformAdmin.getDisplayName ? global.PlatformAdmin.getDisplayName(u) : (u.name || u.username)) + '</td><td>' +
        esc(roleLabel) + '</td><td>' + esc(agendaLabel) + '</td><td>' +
        (u.active ? 'Activo' : 'Inactivo') + '</td><td class="admin-actions">' +
        '<button type="button" class="btn btn-sm" data-edit="' + esc(u.id) + '">Editar</button> ' +
        '<button type="button" class="btn btn-sm" data-del="' + esc(u.id) + '">Eliminar</button></td></tr>';
    });
    html += '</tbody></table></div>';
    staffHost.innerHTML = html;
    staffHost.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { onEdit(btn.getAttribute('data-edit')); });
    });
    staffHost.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { onDelete(btn.getAttribute('data-del')); });
    });
  }

  function renderUsersTable(container, onEdit, onDelete) {
    renderUsersPanel(null, container, onEdit, onDelete);
  }

  function renderAreasTable(container, onEdit, onDelete) {
    var areas = global.PlatformAdmin.getAreas();
    var html = '<div class="admin-table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Área</th><th>Descripción</th><th></th></tr></thead><tbody>';
    areas.forEach(function (a) {
      html += '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.description) + '</td>' +
        '<td class="admin-actions">' +
        '<button type="button" class="btn btn-sm" data-edit="' + esc(a.id) + '">Editar</button> ' +
        '<button type="button" class="btn btn-sm" data-del="' + esc(a.id) + '">Eliminar</button></td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { onEdit(btn.getAttribute('data-edit')); });
    });
    container.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { onDelete(btn.getAttribute('data-del')); });
    });
  }

  function renderLogs(container) {
    var logs = global.PlatformAdmin.getLogs();
    if (!logs.length) {
      container.innerHTML = '<p class="admin-empty">Sin registros en el historial.</p>';
      return;
    }
    var html = '<div class="admin-logs">';
    logs.slice(0, 50).forEach(function (log) {
      html += '<div class="admin-log-item"><span class="admin-log-time">' +
        esc(global.PanelCore.formatDateTime(new Date(log.at))) + '</span> ' +
        '<strong>' + esc(log.user) + '</strong> — ' + esc(log.action) +
        (log.detail ? ': <span>' + esc(log.detail) + '</span>' : '') + '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderSystemPanel(container) {
    if (!container || !global.PlatformAdminTools) return;
    var diag = global.PlatformAdminTools.runDiagnostics();
    var html = '<div class="admin-diag-header">' +
      statusTag(diag.ok, diag.ok ? 'Sistema OK' : 'Errores detectados') +
      '<button type="button" class="btn btn-sm" id="btnRefreshDiag">Volver a comprobar</button></div>';

    if (diag.errors.length) {
      html += '<div class="admin-alert admin-alert-err"><strong>Errores</strong><ul>';
      diag.errors.forEach(function (e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul></div>';
    }
    if (diag.warnings.length) {
      html += '<div class="admin-alert admin-alert-warn"><strong>Avisos</strong><ul>';
      diag.warnings.forEach(function (w) { html += '<li>' + esc(w) + '</li>'; });
      html += '</ul></div>';
    }

    html += '<h4 class="admin-subtitle">Módulos JavaScript</h4><div class="admin-check-grid">';
    diag.modules.forEach(function (m) {
      html += '<div class="admin-check-item">' + statusTag(m.ok, m.label) + '</div>';
    });
    html += '</div>';

    html += '<h4 class="admin-subtitle">Bibliotecas</h4><div class="admin-check-grid">';
    diag.libraries.forEach(function (l) {
      html += '<div class="admin-check-item">' + statusTag(l.ok, l.name) + '</div>';
    });
    html += '</div>';

    html += '<h4 class="admin-subtitle">Estado de datos publicados</h4><div class="admin-module-status-grid">';
    var ms = diag.moduleStatus;
    html += '<div class="admin-module-status-card prod"><strong>Productividad</strong><p>' +
      (ms.productividad.loaded ? statusTag(true, ms.productividad.rows + ' registros') : statusTag(false, 'Sin datos')) +
      '</p><p class="admin-hint small">' + esc(ms.productividad.fileName || '—') + '</p></div>';
    html += '<div class="admin-module-status-card ops"><strong>Operaciones</strong><p>' +
      (ms.operaciones.loaded ? statusTag(true, ms.operaciones.rows + ' registros') : statusTag(false, 'Sin datos')) +
      '</p><p class="admin-hint small">' + esc(ms.operaciones.fileName || '—') +
      (ms.operaciones.format ? ' · ' + esc(ms.operaciones.format) : '') + '</p></div>';
    html += '</div>';

    html += '<h4 class="admin-subtitle">Almacenamiento local</h4>';
    html += '<p class="admin-hint">Total: <strong>' + esc(global.PlatformAdminTools.formatBytes(diag.storage.totalBytes)) + '</strong></p>';
    html += '<div class="admin-table-wrap"><table class="data-table admin-storage-table"><thead><tr>' +
      '<th>Clave</th><th>Tamaño</th><th>Resumen</th></tr></thead><tbody>';
    diag.storage.items.forEach(function (item) {
      html += '<tr><td>' + esc(item.label) + '</td><td>' + esc(global.PlatformAdminTools.formatBytes(item.bytes)) +
        '</td><td>' + esc(item.summary) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    container.innerHTML = html;
    var refreshBtn = container.querySelector('#btnRefreshDiag');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { renderSystemPanel(container); });
    }
  }

  function renderToolsPanel(container, handlers) {
    if (!container) return;
    handlers = handlers || {};
    var html =
      '<div class="admin-tools-section admin-danger-zone">' +
      '<h4 class="admin-subtitle admin-danger-title">⛔ Limpieza total en la web</h4>' +
      '<p class="admin-hint small">Si la web está muy cargada con reportes viejos (celulares y PC), use este botón para borrar <strong>todos</strong> los reportes de averías en la nube y los datos importados del WMS. Usuarios y configuración <strong>no</strong> se borran.</p>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn btn-no-tocar" id="btnNoTocar">NO TOCAR</button>' +
      '</div>' +
      '<p class="admin-hint small admin-danger-hint">Irreversible. Debe escribir <strong>LIMPIAR</strong> para confirmar. Los demás dispositivos verán la web vacía en ~1 s.</p>' +
      '</div>' +
      '<hr class="admin-divider">' +
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Copia de seguridad</h4>' +
      '<p class="admin-hint small">Exporta configuración, datos de ambos módulos, usuarios y áreas en un archivo JSON.</p>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn btn-primary" id="btnAdminBackup">Descargar backup (.json)</button>' +
      '<label class="btn btn-admin-file">Restaurar backup<input type="file" id="adminBackupFile" accept=".json,application/json" class="is-hidden"></label>' +
      '</div></div>' +
      '<hr class="admin-divider">' +
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Limpieza de datos</h4>' +
      '<p class="admin-hint small">Elimina solo los datos publicados del módulo indicado. No borra usuarios ni configuración.</p>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn btn-warn" id="btnClearProd">Limpiar productividad</button>' +
      '<button type="button" class="btn btn-warn" id="btnClearOps">Limpiar operaciones</button>' +
      '<button type="button" class="btn btn-danger" id="btnClearAll">Limpiar todos los módulos</button>' +
      '</div></div>' +
      '<hr class="admin-divider">' +
      '<div class="admin-tools-section">' +
      '<h4 class="admin-subtitle">Mantenimiento</h4>' +
      '<div class="admin-btn-row">' +
      '<button type="button" class="btn" id="btnResetConfig">Restablecer configuración</button>' +
      '<button type="button" class="btn" id="btnPurgeLogs">Vaciar historial</button>' +
      '</div></div>' +
      '<div class="status-msg" id="adminToolsStatus"></div>';

    container.innerHTML = html;

    function bind(id, ev, fn) {
      var el = container.querySelector(id);
      if (el) el.addEventListener(ev, fn);
    }

    bind('#btnAdminBackup', 'click', function () {
      if (handlers.onBackup) handlers.onBackup();
    });
    bind('#adminBackupFile', 'change', function (ev) {
      if (handlers.onRestore && ev.target.files[0]) handlers.onRestore(ev.target.files[0]);
      ev.target.value = '';
    });
    bind('#btnClearProd', 'click', function () { if (handlers.onClear) handlers.onClear('productividad'); });
    bind('#btnClearOps', 'click', function () { if (handlers.onClear) handlers.onClear('operaciones'); });
    bind('#btnClearAll', 'click', function () { if (handlers.onClear) handlers.onClear('all'); });
    bind('#btnResetConfig', 'click', function () { if (handlers.onResetConfig) handlers.onResetConfig(); });
    bind('#btnPurgeLogs', 'click', function () { if (handlers.onPurgeLogs) handlers.onPurgeLogs(); });
    bind('#btnNoTocar', 'click', function () { if (handlers.onWipeWeb) handlers.onWipeWeb(); });
  }

  function renderExcelPreview(container, result) {
    if (!container) return;
    if (!result) {
      container.innerHTML = '';
      container.classList.remove('show');
      return;
    }
    container.classList.add('show');
    var html = '<div class="admin-preview ' + (result.ok ? 'ok' : 'err') + '">';
    html += '<strong>' + (result.ok ? '✓ Validación correcta' : '✗ Validación fallida') + '</strong>';
    if (result.detected) html += '<p>Tipo detectado: <code>' + esc(result.detected) + '</code></p>';
    if (result.sheetNames && result.sheetNames.length) {
      html += '<p>Hojas: ' + esc(result.sheetNames.join(', ')) + '</p>';
    }
    if (result.summary) {
      html += '<ul class="admin-preview-summary">';
      Object.keys(result.summary).forEach(function (k) {
        html += '<li>' + esc(k) + ': <strong>' + esc(result.summary[k]) + '</strong></li>';
      });
      html += '</ul>';
    }
    if (result.errors && result.errors.length) {
      html += '<ul class="admin-preview-errors">';
      result.errors.forEach(function (e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function switchTab(tabId) {
    var paneId = TAB_PANE_IDS[tabId];
    document.querySelectorAll('.admin-tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-tab-pane').forEach(function (p) {
      p.classList.toggle('active', p.id === paneId);
    });
    return tabId;
  }

  function renderAccessRequestForm(container, user, onSubmit) {
    if (!container || !user) return;
    var requests = global.PlatformAdmin.getAccessRequests().filter(function (r) {
      return r.userId === user.id;
    });
    var pending = requests.find(function (r) { return r.status === 'pending'; });
    var hasConfig = global.PlatformAdmin.can(user.role, 'config.save', user);

    var html = '<div class="admin-access-request">';
    if (hasConfig) {
      html += '<p class="admin-hint ok">Ya tienes acceso a la configuración del sistema.</p>';
    } else if (pending) {
      html += '<div class="admin-alert admin-alert-warn"><strong>Solicitud pendiente</strong><p>Enviada el ' +
        esc(global.PanelCore.formatDateTime(new Date(pending.at))) + '.</p><p>' + esc(pending.reason || '—') + '</p></div>';
    } else {
      html += '<p class="admin-hint">Como colaborador puedes ver todos los paneles e importar Excel. ' +
        'Para cambiar configuración del sistema, envía una solicitud al administrador.</p>' +
        '<form id="accessRequestForm" class="admin-form">' +
        '<label for="accessRequestReason">Motivo de la solicitud</label>' +
        '<textarea id="accessRequestReason" rows="4" maxlength="500" placeholder="Ej.: necesito ajustar metas de facturación para el mes…" required></textarea>' +
        '<button type="submit" class="btn btn-primary">Enviar solicitud de acceso a configuración</button>' +
        '</form>';
    }

    if (requests.length) {
      html += '<h4 class="admin-subtitle">Mis solicitudes</h4><div class="admin-table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Fecha</th><th>Permiso</th><th>Estado</th><th>Nota admin</th></tr></thead><tbody>';
      requests.slice(0, 10).forEach(function (r) {
        var statusLabel = r.status === 'pending' ? 'Pendiente' : (r.status === 'approved' ? 'Aprobada' : 'Rechazada');
        html += '<tr><td>' + esc(global.PanelCore.formatDateTime(new Date(r.at))) + '</td><td>' +
          esc(global.PlatformAdmin.PERMISSIONS[r.permission] || r.permission) + '</td><td>' +
          esc(statusLabel) + '</td><td>' + esc(r.reviewNote || '—') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';
    container.innerHTML = html;

    var form = container.querySelector('#accessRequestForm');
    if (form && onSubmit) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var reason = (container.querySelector('#accessRequestReason').value || '').trim();
        onSubmit(reason);
      });
    }
  }

  function renderRequestsQueue(container, onReview) {
    if (!container) return;
    var list = global.PlatformAdmin.getAccessRequests();
    if (!list.length) {
      container.innerHTML = '<p class="admin-empty">No hay solicitudes de acceso.</p>';
      return;
    }
    var html = '<p class="admin-hint">Aprueba o rechaza solicitudes. Al aprobar, el usuario recibe permiso de configuración.</p>' +
      '<div class="admin-table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Fecha</th><th>Usuario</th><th>Permiso</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>';
    list.slice(0, 40).forEach(function (r) {
      var statusLabel = r.status === 'pending' ? 'Pendiente' : (r.status === 'approved' ? 'Aprobada' : 'Rechazada');
      html += '<tr><td>' + esc(global.PanelCore.formatDateTime(new Date(r.at))) + '</td><td>' +
        esc(r.name || r.username) + '<br><span class="admin-hint small">' + esc(r.username) + '</span></td><td>' +
        esc(global.PlatformAdmin.PERMISSIONS[r.permission] || r.permission) + '</td><td>' + esc(r.reason || '—') + '</td><td>' +
        esc(statusLabel) + '</td><td class="admin-actions">';
      if (r.status === 'pending') {
        html += '<button type="button" class="btn btn-sm btn-primary" data-approve="' + esc(r.id) + '">Aprobar</button> ' +
          '<button type="button" class="btn btn-sm" data-reject="' + esc(r.id) + '">Rechazar</button>';
      } else {
        html += '—';
      }
      html += '</td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onReview) onReview(btn.getAttribute('data-approve'), true);
      });
    });
    container.querySelectorAll('[data-reject]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onReview) onReview(btn.getAttribute('data-reject'), false);
      });
    });
  }

  global.PlatformAdminUI = {
    TAB_PANE_IDS: TAB_PANE_IDS,
    renderUsersPanel: renderUsersPanel,
    renderUsersTable: renderUsersTable,
    renderAreasTable: renderAreasTable,
    renderLogs: renderLogs,
    renderSystemPanel: renderSystemPanel,
    renderToolsPanel: renderToolsPanel,
    renderExcelPreview: renderExcelPreview,
    renderAccessRequestForm: renderAccessRequestForm,
    renderRequestsQueue: renderRequestsQueue,
    switchTab: switchTab
  };
})(typeof window !== 'undefined' ? window : this);
