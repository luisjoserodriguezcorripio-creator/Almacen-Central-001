/**
 * Vista de auditoría — temperatura (solo lectura, acceso por QR)
 */
(function (global) {
  'use strict';

  var state = {
    tab: 'overview',
    historyAreaId: '',
    historyLimit: 250,
    offSync: null,
    historyRows: []
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function core() { return global.PlatformTemperatureCore; }
  function sync() { return global.PlatformTemperatureSync; }

  function areaName(areaId) {
    var areas = sync().getAreas();
    var found = areas.find(function (a) { return a.id === areaId; });
    return found ? found.name : areaId;
  }

  function statusClass(status) {
    if (status === 'ok') return 'temp-auditor-card--ok';
    if (status === 'warn') return 'temp-auditor-card--warn';
    if (status === 'critical') return 'temp-auditor-card--critical';
    return 'temp-auditor-card--unknown';
  }

  function updateSyncBadge() {
    var el = $('tempAuditorSync');
    var updated = $('tempAuditorUpdated');
    if (!el) return;
    var S = sync();
    if (S.isSetupRequired && S.isSetupRequired()) {
      el.textContent = 'Sin datos en nube';
      el.className = 'temp-auditor-sync is-warn';
      return;
    }
    var last = S.getLastSyncAt();
    var fresh = last && (Date.now() - last) < 25000;
    el.textContent = fresh ? 'En vivo' : 'Sincronizando…';
    el.className = 'temp-auditor-sync' + (fresh ? ' is-live' : '');
    if (updated && last) {
      updated.textContent = 'Última actualización: ' + core().formatDateTime(new Date(last).toISOString());
    }
  }

  function setupBanner() {
    var S = sync();
    if (!S.isSetupRequired || !S.isSetupRequired()) return '';
    return '<div class="temp-auditor-banner" role="alert"><strong>Sin registros en la nube todavía.</strong> ' +
      'Cuando el almacén active el monitoreo de temperatura, esta vista mostrará los datos automáticamente.</div>';
  }

  function renderOverview() {
    var host = $('tempAuditorOverview');
    if (!host) return;
    var C = core();
    var S = sync();
    var current = S.getCurrent();
    var summary = C.summarizeCurrent(current);
    var activeAlerts = S.getAlerts().filter(function (a) {
      return a.status === 'active' || a.status === 'acknowledged';
    });

    var cards = current.map(function (item) {
      var area = item.area || {};
      return '<article class="temp-auditor-card ' + statusClass(item.status) + '">' +
        '<div class="temp-auditor-card-head">' +
        '<h3>' + esc(area.name || item.areaId) + '</h3>' +
        '<span class="temp-auditor-badge">' + esc(C.statusLabel(item.status)) + '</span></div>' +
        '<div class="temp-auditor-value">' + esc(C.formatCelsius(item.celsius)) + '</div>' +
        '<div class="temp-auditor-meta">' +
        '<span>Rango permitido: ' + esc(C.formatRange(area)) + '</span>' +
        '<span>Última lectura: ' + esc(C.formatDateTime(item.updatedAt)) + '</span></div></article>';
    }).join('');

    var alertPreview = '';
    if (activeAlerts.length) {
      alertPreview = '<h2 class="temp-auditor-section-title">Alertas activas (' + activeAlerts.length + ')</h2>' +
        activeAlerts.slice(0, 5).map(function (a) {
          return '<article class="temp-auditor-alert temp-auditor-alert--' + esc(a.severity) + '">' +
            '<div class="temp-auditor-alert-head"><span>' + esc(areaName(a.areaId)) + '</span>' +
            '<span>' + esc(C.formatCelsius(a.celsius)) + '</span></div>' +
            '<p>' + esc(a.message) + '</p>' +
            '<div class="temp-auditor-alert-meta">' + esc(C.formatDateTime(a.createdAt)) + '</div></article>';
        }).join('');
    }

    host.innerHTML =
      setupBanner() +
      '<h2 class="temp-auditor-section-title" style="margin-top:0">Estado actual por área</h2>' +
      '<div class="temp-auditor-kpis">' +
      '<div class="temp-auditor-kpi temp-auditor-kpi--ok"><strong>' + summary.ok + '</strong><span>Normal</span></div>' +
      '<div class="temp-auditor-kpi temp-auditor-kpi--warn"><strong>' + summary.warn + '</strong><span>Advertencia</span></div>' +
      '<div class="temp-auditor-kpi temp-auditor-kpi--critical"><strong>' + summary.critical + '</strong><span>Críticas</span></div>' +
      '<div class="temp-auditor-kpi"><strong>' + current.length + '</strong><span>Áreas</span></div>' +
      '</div>' +
      '<div class="temp-auditor-grid">' + (cards || '<p class="temp-auditor-empty">Sin áreas configuradas.</p>') + '</div>' +
      alertPreview;
  }

  function renderHistoryShell() {
    var host = $('tempAuditorHistory');
    if (!host) return;
    var areas = sync().getAreas();
    var opts = '<option value="">Todas las áreas</option>' + areas.map(function (a) {
      var sel = state.historyAreaId === a.id ? ' selected' : '';
      return '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.name) + '</option>';
    }).join('');

    host.innerHTML =
      setupBanner() +
      '<h2 class="temp-auditor-section-title" style="margin-top:0">Historial de lecturas</h2>' +
      '<div class="temp-auditor-toolbar">' +
      '<label class="temp-auditor-field"><span>Filtrar por área</span>' +
      '<select id="tempAuditorHistoryFilter">' + opts + '</select></label>' +
      '<label class="temp-auditor-field"><span>Registros</span>' +
      '<select id="tempAuditorHistoryLimit">' +
      '<option value="100"' + (state.historyLimit === 100 ? ' selected' : '') + '>Últimos 100</option>' +
      '<option value="250"' + (state.historyLimit === 250 ? ' selected' : '') + '>Últimos 250</option>' +
      '<option value="500"' + (state.historyLimit === 500 ? ' selected' : '') + '>Últimos 500</option>' +
      '</select></label></div>' +
      '<div id="tempAuditorHistoryTable"><p class="temp-auditor-loading">Cargando historial…</p></div>';

    var filter = $('tempAuditorHistoryFilter');
    if (filter) {
      filter.onchange = function () {
        state.historyAreaId = filter.value || '';
        loadHistoryTable();
      };
    }
    var limitSel = $('tempAuditorHistoryLimit');
    if (limitSel) {
      limitSel.onchange = function () {
        state.historyLimit = parseInt(limitSel.value, 10) || 250;
        loadHistoryTable();
      };
    }
    loadHistoryTable();
  }

  function loadHistoryTable() {
    var tableHost = $('tempAuditorHistoryTable');
    if (!tableHost) return;
    tableHost.innerHTML = '<p class="temp-auditor-loading">Cargando historial…</p>';
    sync().fetchHistory(state.historyAreaId || null, state.historyLimit).then(function (rows) {
      state.historyRows = rows || [];
      if (!rows.length) {
        tableHost.innerHTML = '<p class="temp-auditor-empty">No hay lecturas registradas todavía.</p>';
        return;
      }
      var C = core();
      var html = '<div class="temp-auditor-table-wrap"><table class="temp-auditor-table">' +
        '<thead><tr><th>Área</th><th>Temperatura</th><th>Fecha y hora</th><th>Registrado por</th><th>Notas</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><td>' + esc(areaName(r.areaId)) + '</td>' +
          '<td><strong>' + esc(C.formatCelsius(r.celsius)) + '</strong></td>' +
          '<td>' + esc(C.formatDateTime(r.recordedAt)) + '</td>' +
          '<td>' + esc(r.recordedBy || '—') + '</td>' +
          '<td>' + esc(r.notes || '—') + '</td></tr>';
      });
      tableHost.innerHTML = html + '</tbody></table></div>';
    }).catch(function () {
      tableHost.innerHTML = '<p class="temp-auditor-empty">No se pudo cargar el historial.</p>';
    });
  }

  function renderAlerts() {
    var host = $('tempAuditorAlerts');
    if (!host) return;
    var C = core();
    var all = sync().getAlerts().slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    if (!all.length) {
      host.innerHTML = setupBanner() +
        '<h2 class="temp-auditor-section-title" style="margin-top:0">Alertas registradas</h2>' +
        '<p class="temp-auditor-empty">No hay alertas en el sistema.</p>';
      return;
    }

    var rows = all.map(function (a) {
      return '<article class="temp-auditor-alert temp-auditor-alert--' + esc(a.severity) + '">' +
        '<div class="temp-auditor-alert-head"><span>' + esc(areaName(a.areaId)) + '</span>' +
        '<span>' + esc(C.formatCelsius(a.celsius)) + '</span></div>' +
        '<p>' + esc(a.message) + '</p>' +
        '<div class="temp-auditor-alert-meta">Registrada: ' + esc(C.formatDateTime(a.createdAt)) +
        (a.resolvedAt ? ' · Resuelta: ' + esc(C.formatDateTime(a.resolvedAt)) : '') +
        ' · Estado: ' + esc(a.status) + '</div></article>';
    }).join('');

    host.innerHTML = setupBanner() +
      '<h2 class="temp-auditor-section-title" style="margin-top:0">Alertas (' + all.length + ')</h2>' +
      rows;
  }

  function showTab(tab) {
    state.tab = tab || 'overview';
    document.querySelectorAll('[data-temp-aud-tab]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-temp-aud-tab') === state.tab);
    });
    document.querySelectorAll('[data-temp-aud-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-temp-aud-panel') === state.tab;
      panel.classList.toggle('is-hidden', !on);
      panel.hidden = !on;
    });
    if (state.tab === 'overview') renderOverview();
    else if (state.tab === 'history') renderHistoryShell();
    else if (state.tab === 'alerts') renderAlerts();
  }

  function refreshAll() {
    updateSyncBadge();
    if (state.tab === 'overview') renderOverview();
    else if (state.tab === 'history') loadHistoryTable();
    else if (state.tab === 'alerts') renderAlerts();
  }

  function exportCsv() {
    var rows = state.historyRows;
    function doExport(list) {
      if (!list || !list.length) {
        global.alert('No hay registros para exportar. Abra la pestaña Historial primero.');
        return;
      }
      var csv = sync().exportHistoryCsv(list);
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'auditoria_temperaturas_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
    if (rows.length) {
      doExport(rows);
      return;
    }
    sync().fetchHistory(state.historyAreaId || null, state.historyLimit).then(function (fetched) {
      state.historyRows = fetched || [];
      doExport(state.historyRows);
    });
  }

  function bindUi() {
    document.querySelectorAll('[data-temp-aud-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showTab(btn.getAttribute('data-temp-aud-tab'));
      });
    });
    var refreshBtn = $('tempAuditorRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        sync().fetchCurrent();
        sync().fetchAlerts();
        if (state.tab === 'history') loadHistoryTable();
        else refreshAll();
      });
    }
    var exportBtn = $('tempAuditorExport');
    if (exportBtn) exportBtn.addEventListener('click', exportCsv);
  }

  function start() {
    bindUi();
    showTab('overview');
    updateSyncBadge();
    state.offSync = sync().onChange(function (kind) {
      updateSyncBadge();
      if (kind === 'reading' && state.tab === 'history') loadHistoryTable();
      else refreshAll();
    });
    global.setInterval(updateSyncBadge, 8000);
  }

  function init() {
    var host = $('tempAuditorOverview');
    if (!host) return;
    host.innerHTML = '<p class="temp-auditor-loading">Conectando con el monitoreo de temperatura…</p>';
    sync().ready().then(function () {
      start();
    }).catch(function () {
      host.innerHTML = '<p class="temp-auditor-empty">No se pudo conectar. Verifique su conexión e intente de nuevo.</p>';
    });
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.PlatformTemperatureAuditor = { refresh: refreshAll, showTab: showTab };
})(typeof window !== 'undefined' ? window : this);
