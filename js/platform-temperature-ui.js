/**
 * Monitoreo de temperatura — UI dashboard en vivo
 */
(function (global) {
  'use strict';

  var state = {
    user: null,
    module: 'home',
    chart: null,
    chartAreaId: 'almacen',
    historyAreaId: '',
    offSync: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function core() {
    return global.PlatformTemperatureCore;
  }

  function sync() {
    return global.PlatformTemperatureSync;
  }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else if (type === 'warn') global.PlatformToast.warning(msg);
    else global.PlatformToast.info(msg);
  }

  function areaName(areaId) {
    var areas = sync().getAreas();
    var found = areas.find(function (a) { return a.id === areaId; });
    return found ? found.name : areaId;
  }

  function statusClass(status) {
    if (status === 'ok') return 'temp-status--ok';
    if (status === 'warn') return 'temp-status--warn';
    if (status === 'critical') return 'temp-status--critical';
    return 'temp-status--unknown';
  }

  function parseTempValue(raw) {
    var s = String(raw || '').trim().replace(',', '.');
    if (!s) return NaN;
    return Number(s);
  }

  function updateSyncHeader() {
    var el = $('tempHeaderSync');
    if (!el) return;
    var S = sync();
    if (S.isSetupRequired && S.isSetupRequired()) {
      el.textContent = 'Sin base de datos';
      el.className = 'user-info temp-sync-status temp-sync-status--warn';
      el.title = 'Ejecute SETUP-TEMPERATURA-SUPABASE.bat una vez';
      return;
    }
    if (!global.PlatformSupabase || !global.PlatformSupabase.isEnabled || !global.PlatformSupabase.isEnabled()) {
      el.textContent = 'Sin conexión';
      el.className = 'user-info temp-sync-status temp-sync-status--warn';
      return;
    }
    var last = S.getLastSyncAt();
    var fresh = last && (Date.now() - last) < 20000;
    el.textContent = fresh ? 'En vivo' : 'Sincronizando…';
    el.className = 'user-info temp-sync-status' + (fresh ? ' temp-sync-status--live' : '');
    el.title = last
      ? 'Última actualización: ' + core().formatDateTime(new Date(last).toISOString())
      : 'Conectando con Supabase';
  }

  var VIEW_IDS = {
    home: 'tempViewHome',
    dashboard: 'tempViewDashboard',
    register: 'tempViewRegister',
    history: 'tempViewHistory',
    alerts: 'tempViewAlerts',
    charts: 'tempViewCharts'
  };

  function renderLoadingView(host, title, sub) {
    if (!host) return;
    host.innerHTML =
      '<div class="temp-view-loading">' +
      '<p class="temp-view-loading-title">' + esc(title || 'Cargando…') + '</p>' +
      '<p class="temp-view-loading-sub">' + esc(sub || 'Conectando con Supabase…') + '</p></div>';
  }

  function renderSetupBanner() {
    var S = sync();
    if (!S.isSetupRequired || !S.isSetupRequired()) return '';
    return (
      '<div class="temp-setup-banner" role="alert">' +
      '<strong>Base de datos de temperatura pendiente</strong>' +
      '<p>Para registrar y ver datos en tiempo real hoy, ejecute <strong>SETUP-TEMPERATURA-SUPABASE.bat</strong> ' +
      'en la carpeta del proyecto (el SQL ya queda en el portapapeles) o pegue el archivo ' +
      '<code>supabase/migrations/20250616_temperature_monitoring.sql</code> en ' +
      '<a href="https://supabase.com/dashboard/project/pjbzbwckcbhmkeidsqjz/sql/new" target="_blank" rel="noopener">Supabase → SQL Editor</a> y pulse RUN.</p></div>'
    );
  }

  function renderHome() {
    var host = $('tempViewHome');
    if (!host) return;
    host.innerHTML =
      '<div class="news-board temp-news-board">' +
      '<header class="news-board-head">' +
      '<p class="news-board-eyebrow">Monitoreo de temperatura · DC</p>' +
      '<h2 class="news-board-title">Tablón informativo</h2>' +
      '<p class="news-board-sub">Comunicados del área de temperatura y almacén</p></header>' +
      '<div class="news-board-empty">' +
      '<div class="news-board-empty-icon" aria-hidden="true">📰</div>' +
      '<p class="news-board-empty-title">Sin noticias publicadas</p>' +
      '<p class="news-board-empty-desc">Pantalla principal vacía lista para avisos. Use el menú ☰ para abrir el dashboard de temperatura.</p></div>' +
      '<div class="news-board-template" aria-label="Plantilla de noticias">' +
      '<article class="news-slot news-slot--ghost"><span class="news-slot-label">Espacio para aviso 1</span></article>' +
      '<article class="news-slot news-slot--ghost"><span class="news-slot-label">Espacio para aviso 2</span></article>' +
      '<article class="news-slot news-slot--ghost"><span class="news-slot-label">Espacio para aviso 3</span></article></div>' +
      '<p class="news-board-hint">Pulse <strong>☰</strong> en la esquina para ver temperatura, historial y alertas.</p></div>';
  }

  function renderDashboard() {
    var host = $('tempViewDashboard');
    if (!host) return;
    var C = core();
    var S = sync();
    var current = S.getCurrent();
    var summary = C.summarizeCurrent(current);
    var activeAlerts = S.getAlerts().filter(function (a) {
      return a.status === 'active' || a.status === 'acknowledged';
    });

    var setupBanner = renderSetupBanner();

    var cards = current.map(function (item) {
      var area = item.area || {};
      return '<article class="temp-area-card ' + statusClass(item.status) + '" data-area="' + esc(item.areaId) + '">' +
        '<div class="temp-area-card-head">' +
        '<h3>' + esc(area.name || item.areaId) + '</h3>' +
        '<span class="temp-area-badge">' + esc(C.statusLabel(item.status)) + '</span></div>' +
        '<div class="temp-area-value">' + esc(C.formatCelsius(item.celsius)) + '</div>' +
        '<div class="temp-area-meta">' +
        '<span>Rango: ' + esc(C.formatRange(area)) + '</span>' +
        '<span>Actualizado: ' + esc(C.formatDateTime(item.updatedAt)) + '</span></div></article>';
    }).join('');

    host.innerHTML =
      setupBanner +
      '<header class="temp-view-head"><h2>Dashboard de Temperatura</h2>' +
      '<p class="temp-view-sub">Monitoreo en tiempo real · ' + esc(current.length) + ' áreas</p></header>' +
      '<div class="temp-kpi-grid">' +
      '<div class="temp-kpi temp-kpi--ok"><span class="temp-kpi-value">' + summary.ok + '</span><span class="temp-kpi-label">Normal</span></div>' +
      '<div class="temp-kpi temp-kpi--warn"><span class="temp-kpi-value">' + summary.warn + '</span><span class="temp-kpi-label">Advertencia</span></div>' +
      '<div class="temp-kpi temp-kpi--critical"><span class="temp-kpi-value">' + summary.critical + '</span><span class="temp-kpi-label">Críticas</span></div>' +
      '<div class="temp-kpi temp-kpi--info"><span class="temp-kpi-value">' + activeAlerts.length + '</span><span class="temp-kpi-label">Alertas activas</span></div>' +
      '</div>' +
      '<div class="temp-actions">' +
      '<button type="button" class="temp-btn temp-btn--primary" data-temp-action="register">Registrar temperatura</button>' +
      '<button type="button" class="temp-btn temp-btn--secondary" data-temp-action="history">Ver historial</button>' +
      '<button type="button" class="temp-btn temp-btn--accent" data-temp-action="export">Exportar CSV</button>' +
      '</div>' +
      '<div class="temp-area-grid">' + cards + '</div>' +
      renderRecentAlertsPreview(activeAlerts.slice(0, 5));
  }

  function renderRecentAlertsPreview(items) {
    if (!items.length) {
      return '<section class="temp-section"><h3>Alertas recientes</h3><p class="temp-empty">No hay alertas activas.</p></section>';
    }
    var rows = items.map(function (a) {
      return '<li class="temp-alert-item temp-alert-item--' + esc(a.severity) + '">' +
        '<strong>' + esc(areaName(a.areaId)) + '</strong> · ' + esc(a.message) +
        '<span class="temp-alert-time">' + esc(core().formatDateTime(a.createdAt)) + '</span></li>';
    }).join('');
    return '<section class="temp-section"><h3>Alertas recientes</h3><ul class="temp-alert-list">' + rows + '</ul></section>';
  }

  function renderRegister() {
    var host = $('tempViewRegister');
    if (!host) return;
    var S = sync();
    var blocked = S.isSetupRequired && S.isSetupRequired();
    var areas = S.getAreas();
    var opts = areas.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.name) + ' (' + esc(core().formatRange(a)) + ')</option>';
    }).join('');

    host.innerHTML =
      renderSetupBanner() +
      '<header class="temp-view-head"><h2>Registrar temperatura</h2>' +
      '<p class="temp-view-sub">Entrada manual · visible para todos al instante</p></header>' +
      (blocked
        ? '<p class="temp-empty">Active la base de datos arriba para poder guardar lecturas.</p>'
        : '<form id="tempRegisterForm" class="temp-form">' +
      '<label class="temp-field"><span>Área</span><select id="tempRegArea" required>' + opts + '</select></label>' +
      '<label class="temp-field"><span>Temperatura (°C)</span>' +
      '<input id="tempRegValue" type="text" inputmode="decimal" pattern="-?[0-9]+([.,][0-9]+)?" required placeholder="Ej. 22,5" autocomplete="off"></label>' +
      '<label class="temp-field"><span>Notas (opcional)</span>' +
      '<input id="tempRegNotes" type="text" maxlength="200" placeholder="Observaciones"></label>' +
      '<p id="tempRegError" class="temp-reg-error" role="alert" hidden></p>' +
      '<div class="temp-form-actions">' +
      '<button type="submit" class="temp-btn temp-btn--primary" id="tempRegSubmit">Guardar lectura</button>' +
      '<button type="button" class="temp-btn temp-btn--ghost" data-temp-action="dashboard">Volver al dashboard</button>' +
      '</div></form>');
    updateSyncHeader();
  }

  function renderHistory() {
    var host = $('tempViewHistory');
    if (!host) return;
    var areas = sync().getAreas();
    var opts = '<option value="">Todas las áreas</option>' + areas.map(function (a) {
      var sel = state.historyAreaId === a.id ? ' selected' : '';
      return '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.name) + '</option>';
    }).join('');

    host.innerHTML =
      '<header class="temp-view-head"><h2>Historial de temperaturas</h2>' +
      '<p class="temp-view-sub">Registros con fecha y hora</p></header>' +
      '<div class="temp-history-toolbar">' +
      '<label class="temp-field temp-field--inline"><span>Filtrar área</span>' +
      '<select id="tempHistoryFilter">' + opts + '</select></label>' +
      '<button type="button" class="temp-btn temp-btn--accent" data-temp-action="export">Exportar CSV</button>' +
      '</div>' +
      '<div id="tempHistoryTable" class="temp-history-table"><p class="temp-empty">Cargando historial…</p></div>';
    loadHistoryTable();
  }

  function loadHistoryTable() {
    var tableHost = $('tempHistoryTable');
    if (!tableHost) return;
    sync().fetchHistory(state.historyAreaId || null, 150).then(function (rows) {
      if (!rows.length) {
        tableHost.innerHTML = '<p class="temp-empty">No hay registros todavía.</p>';
        return;
      }
      var C = core();
      var html = '<table class="temp-table"><thead><tr>' +
        '<th>Área</th><th>Temp.</th><th>Fecha/Hora</th><th>Usuario</th><th>Notas</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><td>' + esc(areaName(r.areaId)) + '</td>' +
          '<td>' + esc(C.formatCelsius(r.celsius)) + '</td>' +
          '<td>' + esc(C.formatDateTime(r.recordedAt)) + '</td>' +
          '<td>' + esc(r.recordedBy || '—') + '</td>' +
          '<td>' + esc(r.notes || '—') + '</td></tr>';
      });
      tableHost.innerHTML = html + '</tbody></table>';
    });
  }

  function renderAlerts() {
    var host = $('tempViewAlerts');
    if (!host) return;
    var all = sync().getAlerts();
    var active = all.filter(function (a) { return a.status !== 'resolved'; });

    host.innerHTML =
      '<header class="temp-view-head"><h2>Alertas automáticas</h2>' +
      '<p class="temp-view-sub">' + active.length + ' alertas sin resolver</p></header>' +
      '<div id="tempAlertsList"></div>';
    renderAlertsList(active);
  }

  function renderAlertsList(items) {
    var list = $('tempAlertsList');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="temp-empty">Sin alertas pendientes.</p>';
      return;
    }
    var C = core();
    list.innerHTML = items.map(function (a) {
      return '<article class="temp-alert-card temp-alert-card--' + esc(a.severity) + ' temp-alert-card--' + esc(a.status) + '">' +
        '<div class="temp-alert-card-head">' +
        '<strong>' + esc(areaName(a.areaId)) + '</strong>' +
        '<span>' + esc(C.formatCelsius(a.celsius)) + '</span></div>' +
        '<p>' + esc(a.message) + '</p>' +
        '<div class="temp-alert-card-meta">' +
        '<span>' + esc(C.formatDateTime(a.createdAt)) + '</span>' +
        '<span class="temp-alert-status">' + esc(a.status) + '</span></div>' +
        (a.status === 'active'
          ? '<div class="temp-alert-actions">' +
            '<button type="button" class="temp-btn temp-btn--sm" data-temp-ack="' + esc(a.id) + '">Confirmar</button>' +
            '<button type="button" class="temp-btn temp-btn--sm temp-btn--ghost" data-temp-resolve="' + esc(a.id) + '">Resolver</button></div>'
          : '') +
        '</article>';
    }).join('');
  }

  function renderCharts() {
    var host = $('tempViewCharts');
    if (!host) return;
    var areas = sync().getAreas();
    var opts = areas.map(function (a) {
      var sel = state.chartAreaId === a.id ? ' selected' : '';
      return '<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.name) + '</option>';
    }).join('');

    host.innerHTML =
      '<header class="temp-view-head"><h2>Gráficas por área</h2>' +
      '<p class="temp-view-sub">Comportamiento de las últimas 24 horas</p></header>' +
      '<div class="temp-chart-toolbar">' +
      '<label class="temp-field temp-field--inline"><span>Área</span>' +
      '<select id="tempChartArea">' + opts + '</select></label></div>' +
      '<div class="temp-chart-wrap"><canvas id="tempChartCanvas" aria-label="Gráfica de temperatura"></canvas></div>';
    loadChart();
  }

  function loadChart() {
    if (!global.Chart) return;
    var canvas = $('tempChartCanvas');
    if (!canvas) return;
    var areaId = state.chartAreaId || 'almacen';
    var area = sync().getAreas().find(function (a) { return a.id === areaId; });

    sync().fetchChartData(areaId, 24).then(function (rows) {
      if (state.chart) {
        state.chart.destroy();
        state.chart = null;
      }
      var labels = rows.map(function (r) {
        return new Date(r.recorded_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
      });
      var data = rows.map(function (r) { return Number(r.celsius); });

      state.chart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: area ? area.name : areaId,
            data: data,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: rows.length > 40 ? 0 : 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#e5e7eb' } }
          },
          scales: {
            x: { ticks: { color: '#9ca3af', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: {
              ticks: { color: '#9ca3af', callback: function (v) { return v + '°C'; } },
              grid: { color: 'rgba(255,255,255,0.06)' }
            }
          }
        }
      });

      if (area && rows.length) {
        var ann = state.chart.options.plugins.annotation;
        if (!ann) {
          state.chart.data.datasets.push({
            label: 'Máximo',
            data: labels.map(function () { return area.maxCelsius; }),
            borderColor: 'rgba(239,68,68,0.5)',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          });
          state.chart.data.datasets.push({
            label: 'Mínimo',
            data: labels.map(function () { return area.minCelsius; }),
            borderColor: 'rgba(34,197,94,0.5)',
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
          });
          state.chart.update();
        }
      }
    });
  }

  function showModule(mod) {
    state.module = mod || 'dashboard';
    mod = state.module;
    var activeId = VIEW_IDS[mod] || VIEW_IDS.dashboard;
    Object.keys(VIEW_IDS).forEach(function (key) {
      var el = $(VIEW_IDS[key]);
      if (el) el.hidden = VIEW_IDS[key] !== activeId;
    });
    document.querySelectorAll('#tempMainApp .drawer-item[data-module]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.module === mod);
    });
    var titles = {
      home: 'Tablón informativo',
      dashboard: 'Dashboard de Temperatura',
      register: 'Registrar temperatura',
      history: 'Historial',
      alerts: 'Alertas',
      charts: 'Gráficas'
    };
    var titleEl = $('tempPageTitle');
    if (titleEl) titleEl.textContent = titles[mod] || 'Temperatura';
    document.body.classList.toggle('temp-view-home', mod === 'home');

    if (mod === 'home') renderHome();
    else if (mod === 'dashboard') renderDashboard();
    else if (mod === 'register') renderRegister();
    else if (mod === 'history') renderHistory();
    else if (mod === 'alerts') renderAlerts();
    else if (mod === 'charts') renderCharts();
    updateSyncHeader();
    closeDrawer();
  }

  function exportCsv() {
    sync().fetchHistory(state.historyAreaId || null, 500).then(function (rows) {
      if (!rows.length) {
        toast('No hay datos para exportar.', 'warn');
        return;
      }
      var csv = sync().exportHistoryCsv(rows);
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'temperaturas_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV exportado.', 'ok');
    });
  }

  function submitRegister(ev) {
    ev.preventDefault();
    var errEl = $('tempRegError');
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (sync().isSetupRequired && sync().isSetupRequired()) {
      toast('Active Supabase con SETUP-TEMPERATURA-SUPABASE.bat antes de registrar.', 'err');
      return;
    }
    var areaId = ($('tempRegArea') && $('tempRegArea').value) || '';
    var val = parseTempValue($('tempRegValue') && $('tempRegValue').value);
    var notes = ($('tempRegNotes') && $('tempRegNotes').value) || '';
    if (!areaId || isNaN(val)) {
      var msg = 'Completa área y temperatura válida (ej. 22,5).';
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      toast(msg, 'warn');
      return;
    }
    if (val < -40 || val > 60) {
      var rangeMsg = 'La temperatura debe estar entre -40 y 60 °C.';
      if (errEl) {
        errEl.textContent = rangeMsg;
        errEl.hidden = false;
      }
      toast(rangeMsg, 'warn');
      return;
    }
    var form = $('tempRegisterForm');
    var btn = $('tempRegSubmit') || (form && form.querySelector('[type="submit"]'));
    if (btn) btn.disabled = true;
    sync().insertReading({
      areaId: areaId,
      celsius: val,
      recordedBy: state.user ? state.user.name : '',
      notes: notes
    }).then(function () {
      toast('Temperatura registrada — todos la ven al instante.', 'ok');
      showModule('dashboard');
    }).catch(function (err) {
      var msg = sync().formatError(err, 'No se pudo guardar.');
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      toast(msg, 'err');
    }).finally(function () {
      if (btn) btn.disabled = false;
      updateSyncHeader();
    });
  }

  function bindEvents() {
    var app = $('tempApp');
    if (!app || app.dataset.bound) return;
    app.dataset.bound = '1';

    app.addEventListener('click', function (ev) {
      var ack = ev.target.closest('[data-temp-ack]');
      if (ack) {
        sync().acknowledgeAlert(ack.dataset.tempAck, state.user ? state.user.name : '')
          .then(function () { renderAlerts(); renderDashboard(); toast('Alerta confirmada.', 'ok'); })
          .catch(function () { toast('No se pudo confirmar.', 'err'); });
        return;
      }
      var resolve = ev.target.closest('[data-temp-resolve]');
      if (resolve) {
        sync().resolveAlert(resolve.dataset.tempResolve)
          .then(function () { renderAlerts(); renderDashboard(); toast('Alerta resuelta.', 'ok'); })
          .catch(function () { toast('No se pudo resolver.', 'err'); });
        return;
      }
      var action = ev.target.closest('[data-temp-action]');
      if (!action) return;
      var act = action.dataset.tempAction;
      if (act === 'register') showModule('register');
      else if (act === 'dashboard') showModule('dashboard');
      else if (act === 'history') showModule('history');
      else if (act === 'export') exportCsv();
    });

    app.addEventListener('change', function (ev) {
      if (ev.target.id === 'tempHistoryFilter') {
        state.historyAreaId = ev.target.value;
        loadHistoryTable();
      }
      if (ev.target.id === 'tempChartArea') {
        state.chartAreaId = ev.target.value;
        loadChart();
      }
    });

    app.addEventListener('submit', function (ev) {
      if (ev.target.id === 'tempRegisterForm') submitRegister(ev);
    });
  }

  function onSyncChange(kind) {
    updateSyncHeader();
    if (state.module === 'dashboard') renderDashboard();
    else if (state.module === 'home') renderHome();
    else if (state.module === 'alerts') renderAlerts();
    else if (state.module === 'register' && kind === 'setup') renderRegister();
    else if (state.module === 'history' && kind === 'reading') loadHistoryTable();
    else if (state.module === 'dashboard' && kind === 'reading') renderDashboard();
  }

  function start(user) {
    state.user = user ? {
      name: user.name || user.username || 'Usuario',
      role: user.role || 'operador'
    } : null;

    var drawerUser = $('tempDrawerUser');
    if (drawerUser && state.user) {
      drawerUser.textContent = state.user.name + ' (' + state.user.role + ')';
    }

    bindEvents();
    if (state.offSync) state.offSync();
    state.offSync = sync().onChange(onSyncChange);

    showModule('dashboard');

    var syncReady = sync().ready();
    var syncTimeout = new Promise(function (resolve) {
      global.setTimeout(function () { resolve(null); }, 8000);
    });

    Promise.race([syncReady, syncTimeout]).then(function () {
      updateSyncHeader();
      showModule(state.module || 'dashboard');
      global.setInterval(updateSyncHeader, 5000);
      global.setInterval(function () {
        if (sync().isSetupRequired && sync().isSetupRequired() && sync().recheckCloud) {
          sync().recheckCloud().then(function (ok) {
            if (ok) toast('Base de datos lista — ya puede registrar temperaturas.', 'ok');
          });
        }
      }, 12000);
    }).catch(function () {
      updateSyncHeader();
      showModule(state.module || 'dashboard');
      if (sync().isSetupRequired && sync().isSetupRequired()) {
        toast('Ejecute SETUP-TEMPERATURA-SUPABASE.bat una vez para guardar lecturas en vivo.', 'warn');
      } else {
        toast('Modo sin conexión — verifique Supabase.', 'warn');
      }
    });
  }

  function stop() {
    if (state.offSync) state.offSync();
    state.offSync = null;
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    sync().teardown();
  }

  global.navigateTempModule = showModule;
  global.PlatformTemperatureUI = {
    start: start,
    stop: stop,
    showModule: showModule,
    refresh: function () { showModule(state.module); }
  };
})(typeof window !== 'undefined' ? window : this);
