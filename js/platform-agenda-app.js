/**
 * Portal Agenda operativa — auth + UI
 */
(function (global) {
  'use strict';

  var PC = global.PanelCore;
  var Auth = global.PlatformAdmin;
  var C = function () { return global.PlatformAgendaCore; };
  var S = function () { return global.PlatformAgendaStore; };

  var SESSION_KEY = 'dc_agenda_session';
  var state = {
    user: null,
    view: 'dashboard',
    puestoId: null,
    freqFilter: 'ALL',
    statusFilter: 'ALL',
    dayKey: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (!global.PlatformToast || !msg) return;
    if (type === 'err') global.PlatformToast.error(msg);
    else if (type === 'ok') global.PlatformToast.success(msg);
    else global.PlatformToast.info(msg);
  }

  function saveSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, at: Date.now() }));
    } catch (e) { /* noop */ }
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function setAuthVisible(visible) {
    var overlay = $('agendaAuthOverlay');
    var app = $('agendaApp');
    if (overlay) {
      overlay.classList.toggle('is-hidden', !visible);
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (app) {
      app.classList.toggle('is-hidden', visible);
      if (visible) app.setAttribute('aria-hidden', 'true');
      else app.removeAttribute('aria-hidden');
    }
    document.body.classList.toggle('auth-locked', visible);
    document.body.classList.toggle('agenda-dash-view', !visible);
  }

  function allowedPuestos() {
    var list = C().resolveUserPuestos(state.user);
    if (!list) return C().PUESTOS.slice();
    return C().PUESTOS.filter(function (p) { return list.indexOf(p.id) >= 0; });
  }

  function resolveInitialView() {
    if (!C().userHasAgendaAccess(state.user)) return 'no-access';
    if (C().canManageAll(state.user)) return 'dashboard';
    var puesto = C().getUserAgendaPuesto(state.user);
    if (puesto) {
      state.puestoId = puesto;
      return 'detail';
    }
    return 'no-access';
  }

  function enterApp(user) {
    state.user = user;
    state.dayKey = C().todayKey();
    setAuthVisible(false);
    S().init().then(function () {
      state.view = resolveInitialView();
      render();
    });
  }

  function doLogin() {
    var username = PC.sanitizeUsername($('agendaAuthUsername') && $('agendaAuthUsername').value);
    var password = String(($('agendaAuthPassword') && $('agendaAuthPassword').value) || '').trim();
    var errEl = $('agendaAuthError');
    if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
    if (!username || !password) {
      if (errEl) { errEl.textContent = 'Usuario y contraseña requeridos.'; errEl.hidden = false; }
      return;
    }
    var Sec = global.PlatformSecurity;
    var verify = Sec && Sec.verifyBeforeLogin
      ? Sec.verifyBeforeLogin({ portal: 'agenda', form: $('agendaAuthForm') })
      : Promise.resolve({ ok: true });
    verify.then(function (human) {
      if (!human.ok) {
        if (errEl) { errEl.textContent = human.error || 'Verificación requerida.'; errEl.hidden = false; }
        return;
      }
      var refresh = global.PlatformWebUsers && global.PlatformWebUsers.refresh
        ? global.PlatformWebUsers.refresh()
        : Promise.resolve();
      refresh.then(function () {
        var user = Auth.authenticate(username, PC.sha256Sync(password));
      if (!user) {
        if (errEl) { errEl.textContent = 'Usuario o contraseña incorrectos.'; errEl.hidden = false; }
        return;
      }
      if (!C().userHasAgendaAccess(user)) {
        if (errEl) {
          var hasPerm = Auth.can(user.role, 'agenda.use', user);
          errEl.textContent = hasPerm
            ? 'No tiene puesto de agenda asignado. Contacte al administrador.'
            : 'Su usuario no tiene acceso al módulo Agenda.';
          errEl.hidden = false;
        }
        return;
      }
      PC.persistRememberedLoginUsername('agenda', username, !!($('agendaAuthRememberUser') && $('agendaAuthRememberUser').checked));
      saveSession(user);
      enterApp(user);
      toast('Bienvenido, ' + (Auth.getDisplayName ? Auth.getDisplayName(user) : user.name), 'ok');
      });
    });
  }

  function logout() {
    clearSession();
    state.user = null;
    setAuthVisible(true);
  }

  function statusClass(estado) {
    if (estado === C().ESTADO_COMPLETADO) return 'agenda-status--done';
    if (estado === C().ESTADO_EN_PROCESO) return 'agenda-status--progress';
    return 'agenda-status--pending';
  }

  function nextEstadoLabel(current) {
    var next = C().nextEstado(current);
    return C().ESTADO_LABELS[next] || next;
  }

  function renderFiltersSection(extraClass) {
    var cls = 'agenda-filters' + (extraClass ? ' ' + extraClass : '');
    return '<section class="' + cls + '">' +
      '<p class="agenda-filters__title">Filtrar tareas</p>' +
      '<label><span>Frecuencia</span><select id="agendaFilterFreq">' +
      '<option value="ALL">Todas</option>' +
      '<option value="DIARIA">Diaria</option>' +
      '<option value="INTER_DIARIA">Inter-diaria</option>' +
      '<option value="SEMANAL">Semanal</option></select></label>' +
      '<label><span>Estado</span><select id="agendaFilterStatus">' +
      '<option value="ALL">Todos</option>' +
      '<option value="PENDIENTE">Pendiente</option>' +
      '<option value="EN_PROCESO">En proceso</option>' +
      '<option value="COMPLETADO">Completado</option></select></label>' +
      '</section>';
  }

  function syncFilterControls() {
    var ff = $('agendaFilterFreq');
    var fs = $('agendaFilterStatus');
    if (ff) ff.value = state.freqFilter;
    if (fs) fs.value = state.statusFilter;
  }

  function filterTasks(tasks) {
    return tasks.filter(function (row) {
      if (state.freqFilter !== 'ALL' && row.template.frecuencia !== state.freqFilter) return false;
      if (state.statusFilter !== 'ALL' && row.progress.estado !== state.statusFilter) return false;
      return true;
    });
  }

  function renderProgressRing(stats, extraClass) {
    var cls = 'agenda-ring' + (extraClass ? ' ' + extraClass : '');
    return '<div class="' + cls + '" style="--pct:' + stats.pct + '">' +
      '<div class="agenda-ring__inner">' + stats.pct + '%</div></div>';
  }

  function renderProgressBar(stats) {
    return '<div class="agenda-progress">' +
      '<div class="agenda-progress__meta"><span>Avance del día</span><strong>' + stats.pct + '%</strong></div>' +
      '<div class="agenda-progress__track"><div class="agenda-progress__fill" style="width:' + stats.pct + '%"></div></div>' +
      '<p class="agenda-progress__sub">' + stats.done + ' de ' + stats.total + ' tareas · ' +
      stats.minutesDone + '/' + stats.minutesTotal + ' min</p></div>';
  }

  function renderHeroStats(stats) {
    return '<section class="agenda-hero">' +
      renderProgressRing(stats, 'agenda-hero__ring') +
      '<div class="agenda-hero__copy">' +
      '<strong>Productividad del día</strong>' +
      '<span>' + stats.done + ' completadas · ' + stats.inProg + ' en proceso · ' + stats.pending + ' pendientes</span>' +
      '</div></section>';
  }

  function renderDashboard() {
    var host = $('agendaMain');
    if (!host) return;
    var data = S().getState();
    var dayKey = state.dayKey || C().todayKey();
    var puestos = allowedPuestos();
    var rows = puestos.map(function (p) {
      var st = C().statsForPuesto(data.state, dayKey, p.id);
      var alert = st.pending > 0 && st.pct < 100;
      return '<button type="button" class="agenda-puesto-card' + (alert ? ' agenda-puesto-card--alert' : '') + '" data-agenda-puesto="' + esc(p.id) + '">' +
        '<div class="agenda-puesto-card__head"><strong>' + esc(p.label) + '</strong>' +
        renderProgressRing(st, 'agenda-puesto-card__pct') + '</div>' +
        renderProgressBar(st) +
        '<div class="agenda-puesto-card__counts">' +
        '<span class="agenda-chip agenda-chip--done">' + st.done + ' hechas</span>' +
        '<span class="agenda-chip agenda-chip--progress">' + st.inProg + ' en proceso</span>' +
        '<span class="agenda-chip agenda-chip--pending">' + st.pending + ' pendientes</span>' +
        '</div></button>';
    }).join('');

    host.innerHTML =
      '<header class="agenda-topbar">' +
      '<div><p class="agenda-eyebrow">Panel supervisor</p><h1>Puestos del almacén</h1>' +
      '<p class="agenda-sub">Resumen del día · ' + esc(C().formatDateDisplay(dayKey)) + '</p></div>' +
      '<div class="agenda-topbar__actions">' +
      '<button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-action="refresh">↻ Actualizar</button>' +
      '<button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-action="logout">Salir</button>' +
      '</div></header>' +
      '<p class="agenda-help">Seleccione un puesto para ver y actualizar sus tareas del día.</p>' +
      renderFiltersSection() +
      '<div class="agenda-puesto-grid">' + rows + '</div>';
    syncFilterControls();
  }

  function renderDetail() {
    var host = $('agendaMain');
    if (!host || !state.puestoId) return;
    var puesto = C().PUESTO_BY_ID[state.puestoId];
    if (!puesto) return;
    var data = S().getState();
    var dayKey = state.dayKey || C().todayKey();
    var tasks = filterTasks(C().tasksForDay(data.state, dayKey, state.puestoId));
    var stats = C().statsForPuesto(data.state, dayKey, state.puestoId);

    var rows = tasks.map(function (row) {
      var t = row.template;
      var p = row.progress;
      var freqKey = String(t.frecuencia || '').toLowerCase().replace('_', '_');
      return '<article class="agenda-task ' + statusClass(p.estado) + '" data-task-id="' + esc(t.id) + '">' +
        '<div class="agenda-task__head">' +
        '<span class="agenda-task__num">' + esc(t.numero || '·') + '</span>' +
        '<span class="agenda-freq agenda-freq--' + esc(freqKey) + '">' + esc(C().FREQ_LABELS[t.frecuencia] || t.frecuencia) + '</span>' +
        '<span class="agenda-task__min">' + esc(t.minutos) + ' min</span></div>' +
        '<p class="agenda-task__title">' + esc(t.actividad) + '</p>' +
        '<div class="agenda-task__foot">' +
        '<button type="button" class="agenda-status-btn ' + statusClass(p.estado) + '" data-agenda-status="' + esc(p.estado) + '" data-task-id="' + esc(t.id) + '"' +
        ' aria-label="Marcar como ' + esc(nextEstadoLabel(p.estado)) + '"' +
        ' title="Toque para cambiar a ' + esc(nextEstadoLabel(p.estado)) + '">' +
        esc(C().ESTADO_LABELS[p.estado] || p.estado) + ' → ' + esc(nextEstadoLabel(p.estado)) + '</button>' +
        '<span class="agenda-task__time" aria-label="Hora de ejecución">' + esc(p.horaEjecucion || '—') + '</span>' +
        '<input class="agenda-comment" type="text" maxlength="240" placeholder="Añadir comentario (opcional)" value="' + esc(p.comentarios) + '" data-task-id="' + esc(t.id) + '" aria-label="Comentario de la tarea">' +
        '</div></article>';
    }).join('');

    var showBack = C().canManageAll(state.user);
    host.innerHTML =
      '<header class="agenda-topbar">' +
      '<div>' + (showBack ? '<button type="button" class="agenda-back" data-agenda-action="back">← Todos los puestos</button>' : '') +
      '<p class="agenda-eyebrow">Mi agenda</p>' +
      '<h1>' + esc(puesto.label) + '</h1><p class="agenda-sub">' + esc(C().formatDateDisplay(dayKey)) + '</p></div>' +
      '<div class="agenda-topbar__actions">' +
      '<button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-action="refresh">↻ Actualizar</button>' +
      '<button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-action="logout">Salir</button>' +
      '</div></header>' +
      renderHeroStats(stats) +
      '<p class="agenda-help">Toque el botón de estado en cada tarea para marcar el avance. Puede añadir un comentario si lo necesita.</p>' +
      renderFiltersSection('agenda-filters--detail') +
      '<div class="agenda-task-list">' + (rows || '<p class="agenda-task-list__empty">Sin tareas para los filtros seleccionados.</p>') + '</div>';
    syncFilterControls();
  }

  function renderNoAccess() {
    var host = $('agendaMain');
    if (!host) return;
    host.innerHTML =
      '<header class="agenda-topbar">' +
      '<div><h1>Agenda no disponible</h1>' +
      '<p class="agenda-sub">Su usuario no tiene un puesto de agenda asignado.</p></div>' +
      '<div class="agenda-topbar__actions">' +
      '<button type="button" class="agenda-btn agenda-btn--ghost" data-agenda-action="logout">Salir</button>' +
      '</div></header>' +
      '<section class="agenda-empty-state">' +
      '<p>Contacte al administrador para que le asigne su puesto en <strong>Usuarios → Agenda / Puesto</strong>.</p>' +
      '</section>';
  }

  function renderSidebar() {
    var nav = $('agendaSidebarNav');
    if (!nav) return;
    var puestos = allowedPuestos();
    nav.innerHTML = puestos.map(function (p) {
      var active = state.puestoId === p.id && state.view === 'detail' ? ' active' : '';
      return '<button type="button" class="agenda-nav-item' + active + '" data-agenda-nav="' + esc(p.id) + '">' + esc(p.short || p.label) + '</button>';
    }).join('');
  }

  function render() {
    state.dayKey = state.dayKey || C().todayKey();
    renderSidebar();
    if (state.view === 'no-access') renderNoAccess();
    else if (state.view === 'detail') renderDetail();
    else renderDashboard();
    var live = S().getState().live;
    var badge = $('agendaLiveBadge');
    if (badge) {
      badge.textContent = live ? '● EN VIVO' : '○ LOCAL';
      badge.classList.toggle('agenda-live--ok', !!live);
    }
    var userEl = $('agendaUserLabel');
    if (userEl && state.user) {
      var puesto = C().getUserAgendaPuesto(state.user);
      var puestoLabel = puesto && C().PUESTO_BY_ID[puesto] ? C().PUESTO_BY_ID[puesto].short || C().PUESTO_BY_ID[puesto].label : '';
      userEl.textContent = (state.user.name || state.user.username) + (puestoLabel ? ' · ' + puestoLabel : '');
    }
  }

  function openPuesto(id) {
    state.puestoId = id;
    state.view = 'detail';
    render();
  }

  function handleAction(action) {
    if (action === 'back') { state.view = 'dashboard'; render(); return; }
    if (action === 'logout') { logout(); return; }
    if (action === 'refresh') {
      S().pullFresh().then(function () { render(); toast('Agenda actualizada.', 'ok'); });
    }
  }

  function bind() {
    var root = $('agendaApp');
    if (!root || root.dataset.bound) return;
    root.dataset.bound = '1';

    root.addEventListener('click', function (ev) {
      var puestoBtn = ev.target.closest('[data-agenda-puesto]');
      if (puestoBtn) { openPuesto(puestoBtn.getAttribute('data-agenda-puesto')); return; }
      var navBtn = ev.target.closest('[data-agenda-nav]');
      if (navBtn) { openPuesto(navBtn.getAttribute('data-agenda-nav')); return; }
      var statusBtn = ev.target.closest('[data-agenda-status]');
      if (statusBtn) {
        var taskId = statusBtn.getAttribute('data-task-id');
        var next = C().nextEstado(statusBtn.getAttribute('data-agenda-status'));
        S().updateTask(state.dayKey, state.puestoId, taskId, { estado: next }, state.user).then(function (res) {
          if (!res.ok) toast(res.msg, 'err');
          render();
        });
        return;
      }
      var actBtn = ev.target.closest('[data-agenda-action]');
      if (actBtn) handleAction(actBtn.getAttribute('data-agenda-action'));
    });

    root.addEventListener('change', function (ev) {
      if (ev.target.id === 'agendaFilterFreq') {
        state.freqFilter = ev.target.value;
        render();
      }
      if (ev.target.id === 'agendaFilterStatus') {
        state.statusFilter = ev.target.value;
        render();
      }
    });

    root.addEventListener('blur', function (ev) {
      var input = ev.target.closest('.agenda-comment');
      if (!input || !state.puestoId) return;
      var taskId = input.getAttribute('data-task-id');
      S().updateTask(state.dayKey, state.puestoId, taskId, { comentarios: input.value }, state.user);
    }, true);
  }

  function initAuth() {
    var form = $('agendaAuthForm');
    if (!form) return;
    form.addEventListener('submit', function (ev) { ev.preventDefault(); doLogin(); });
    PC.applyRememberedLoginUsername('agenda', $('agendaAuthUsername'), $('agendaAuthRememberUser'));
    if (global.PlatformSecurity && global.PlatformSecurity.mountLoginForm) {
      global.PlatformSecurity.mountLoginForm(form, 'agenda');
    }
    var toggle = $('agendaBtnTogglePassword');
    var pwd = $('agendaAuthPassword');
    if (toggle && pwd) {
      toggle.addEventListener('click', function () {
        var show = pwd.type === 'password';
        pwd.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Ocultar' : 'Ver';
      });
    }
  }

  function tryRestore() {
    var sess = getSession();
    if (!sess || !sess.userId) return false;
    var user = Auth.findUserById(sess.userId);
    if (!user || !C().userHasAgendaAccess(user)) {
      clearSession();
      return false;
    }
    enterApp(user);
    return true;
  }

  function start() {
    if (!PC || !Auth || !C() || !S()) return;
    bind();
    initAuth();
    if (!tryRestore()) setAuthVisible(true);
    S().subscribe(function () { render(); });
    setInterval(function () {
      var clock = $('agendaClock');
      if (clock) clock.textContent = C().formatClockTime().slice(0, 5);
    }, 1000);
  }

  function boot() {
    if (global.PlatformWebUsers && global.PlatformWebUsers.ready) {
      global.PlatformWebUsers.ready().then(start).catch(start);
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.PlatformAgendaApp = { start: start, logout: logout };
})(typeof window !== 'undefined' ? window : this);
