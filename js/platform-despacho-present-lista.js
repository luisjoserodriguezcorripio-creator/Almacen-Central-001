/**
 * Presentación pantalla TV — seguimiento validador + resumen gráfico
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var bound = false;
  var mountEl = null;
  var lastSig = '';
  var displayMode = false;
  var pollTimer = null;

  var ETAPA_LABELS = {
    pendiente_carga: 'Pend. por validar',
    en_validacion: 'Validado',
    listo_despacho: 'Cargado'
  };

  var ETAPA_CLS = {
    pendiente_carga: 'pendiente',
    en_validacion: 'validado',
    listo_despacho: 'cargado'
  };

  var KPI_LABELS = {
    pendiente_carga: 'Pendiente',
    en_validacion: 'Validado',
    listo_despacho: 'Cargado'
  };

  function DS() {
    return global.PlatformDespachoStore;
  }

  function resolveDisplayMode(opts) {
    if (opts && opts.displayMode != null) return !!opts.displayMode;
    if (global.PlatformDespachoDisplay && global.PlatformDespachoDisplay.isDisplayMode) {
      return global.PlatformDespachoDisplay.isDisplayMode();
    }
    return !!(global.document && global.document.body &&
      global.document.body.classList.contains('desp-display-mode'));
  }

  function shouldShowOnThisPage() {
    return displayMode;
  }

  function estadoHtml(estadoId) {
    var store = DS();
    if (!store) return esc(estadoId || '—');
    var e = store.ESTADOS[estadoId] || { label: estadoId, short: estadoId, color: 'neutral' };
    var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(estadoId) : '';
    return '<span class="desp-lista-present-estado desp-lista-present-estado--' + esc(e.color) + '">' +
      icon + '<span>' + esc(e.short || e.label) + '</span></span>';
  }

  function listaSignature(share, pedidos, counts, resumen, dataUpdatedAt) {
    if (!share || !share.active) return '';
    var rows = (pedidos || []).map(function (p) {
      var store = DS();
      var etapas = store && store.fechasEtapasValidador
        ? store.fechasEtapasValidador(p)
        : {};
      return [p.idc, p.cliente, p.jaula, p.estado, p.validadorAsignado,
        (p.cargasEquipo || []).map(function (c) { return c.validador + ':' + c.camiones; }).join(','),
        etapas.pendiente_carga, etapas.en_validacion, etapas.listo_despacho].join(':');
    }).join('|');
    var countSig = counts
      ? [counts.pendiente_carga, counts.en_validacion, counts.listo_despacho,
        counts.cargadoUnidades, counts.totalCamiones, counts.total].join(',')
      : '';
    var valSig = '';
    if (resumen && resumen.filas) {
      valSig = resumen.filas.map(function (r) {
        return r.nombre + ':' + r.validado + '/' + r.cargado + '/' + (r.camiones || 0) + '@' + (r.ultimaValidacion || '');
      }).join(';');
    }
    return share.updatedAt + '::' + String(dataUpdatedAt || '') + '::' + countSig + '::' + valSig + '::' + rows;
  }

  function fmtDtLista(iso) {
    var store = DS();
    if (store && store.formatFechaDespacho) return store.formatFechaDespacho(iso);
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-DO', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Santo_Domingo'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 16).replace('T', ' ');
    }
  }

  function fechaEtapaCellHtml(iso, etapaId) {
    var cls = iso ? (ETAPA_CLS[etapaId] || 'empty') : 'empty';
    return '<td class="desp-lista-present-fecha-etapa desp-lista-present-fecha-etapa--' + cls + '">' +
      esc(iso ? fmtDtLista(iso) : '—') + '</td>';
  }

  function renderTableFoot(counts, updatedAt) {
    if (!counts) return '';
    var syncLbl = updatedAt ? fmtDtLista(updatedAt) : '—';
    return '<tfoot><tr class="desp-lista-present-foot">' +
      '<td colspan="9">' +
      '<span class="desp-lista-present-foot-item">IDC visibles: <strong>' + esc(String(counts.total || 0)) + '</strong></span>' +
      '<span class="desp-lista-present-foot-item">Pendiente: <strong>' + esc(String(counts.pendiente_carga || 0)) + '</strong></span>' +
      '<span class="desp-lista-present-foot-item">Validado: <strong>' + esc(String(counts.en_validacion || 0)) + '</strong></span>' +
      '<span class="desp-lista-present-foot-item">Cargado: <strong>' + esc(String(counts.cargadoUnidades != null ? counts.cargadoUnidades : counts.listo_despacho || 0)) + ' cam.</strong>' +
      ' <span class="desp-lista-present-foot-idc">(' + esc(String(counts.listo_despacho || 0)) + ' IDC)</span></span>' +
      '<span class="desp-lista-present-foot-item desp-lista-present-foot-sync" title="Última actualización de datos">Actualizado: ' + esc(syncLbl) + '</span>' +
      '</td></tr></tfoot>';
  }

  function renderTableRows(pedidos) {
    if (!pedidos.length) {
      return '<tr><td colspan="9" class="desp-lista-present-empty">Sin IDC registrados todavía.</td></tr>';
    }
    return pedidos.map(function (p) {
      var store = DS();
      var etapas = store && store.fechasEtapasValidador
        ? store.fechasEtapasValidador(p)
        : {};
      var idc = store ? store.formatIdc(p.idc) : p.idc;
      var cliente = p.cliente ? String(p.cliente).trim() : '—';
      var validador = p.validadorAsignado ? String(p.validadorAsignado).trim() : '—';
      if (!validador) validador = '—';
      var cargaTxt = store && store.formatCargasEquipoResumen
        ? store.formatCargasEquipoResumen(p, { withTotal: true })
        : '—';
      return '<tr>' +
        '<td class="desp-lista-present-idc">' + esc(idc) + '</td>' +
        '<td class="desp-lista-present-cliente">' + esc(cliente) + '</td>' +
        '<td class="desp-lista-present-jaula">' + esc(p.jaula || '—') + '</td>' +
        '<td class="desp-lista-present-validador">' +
        '<span class="desp-lista-present-validador-pill">' + esc(validador) + '</span></td>' +
        '<td class="desp-lista-present-carga">' + esc(cargaTxt) + '</td>' +
        '<td class="desp-lista-present-estado-cell-only">' + estadoHtml(p.estado) + '</td>' +
        fechaEtapaCellHtml(etapas.pendiente_carga, 'pendiente_carga') +
        fechaEtapaCellHtml(etapas.en_validacion, 'en_validacion') +
        fechaEtapaCellHtml(etapas.listo_despacho, 'listo_despacho') +
        '</tr>';
    }).join('');
  }

  function renderKpiCards(data) {
    if (!displayMode) return '';
    var store = DS();
    if (!store) return '';
    var counts = store.countResumenValidador
      ? store.countResumenValidador(data.pedidos || [])
      : { total: 0 };
    return '<div class="desp-lista-present-kpis" role="group" aria-label="Totales por estado">' +
      store.VALIDADOR_ESTADOS.map(function (id) {
        var e = store.ESTADOS[id];
        var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(id, { compact: true }) : '';
        var lbl = KPI_LABELS[id] || e.kpiLabel || e.short || e.label;
        var kpiCls = id === 'pendiente_carga' ? 'pendiente' : (id === 'en_validacion' ? 'validado' : 'cargado');
        var num = counts[id] || 0;
        var title = id === 'listo_despacho'
          ? 'Camiones registrados en IDC cargados'
          : (id === 'en_validacion' ? 'IDC en validación' : 'IDC pendientes por validar');
        if (id === 'listo_despacho' && counts.cargadoUnidades != null) {
          num = counts.cargadoUnidades;
          title = (counts.cargadoUnidades || 0) + ' camiones · ' + (counts.listo_despacho || 0) + ' IDC cargados';
        }
        return '<div class="desp-lista-present-kpi desp-lista-present-kpi--' + esc(kpiCls) + '">' +
          (icon ? '<span class="desp-lista-present-kpi-iconbox" aria-hidden="true">' + icon + '</span>' : '') +
          '<span class="desp-lista-present-kpi-num" title="' + esc(title) + '">' + esc(String(num)) + '</span>' +
          '<span class="desp-lista-present-kpi-lbl" title="' + esc(title) + '">' + esc(lbl) + '</span></div>';
      }).join('') +
      '</div>';
  }

  /** Tope visual de productividad (no se muestra en pantalla). Evita barras siempre llenas. */
  var BAR_SCALE_MAX = 10;

  function barScaleGlobal(filas) {
    var max = BAR_SCALE_MAX;
    (filas || []).forEach(function (r) {
      max = Math.max(max, r.validado || 0, r.cargado || 0);
    });
    return Math.min(250, max);
  }

  function barFlexClass(n) {
    n = Math.max(0, Math.min(250, Math.round(n || 0)));
    return 'desp-bar-n-' + n;
  }

  function renderBarFlex(value, scaleMax, kind) {
    var v = Math.max(0, Math.min(scaleMax, value || 0));
    var rest = Math.max(0, scaleMax - v);
    var html = '<div class="desp-val-chart-bar-line desp-val-chart-bar-line--flex">';
    if (v > 0) {
      html += '<span class="desp-val-chart-bar-fill desp-val-chart-bar-fill--' + kind + ' ' + barFlexClass(v) + '"></span>';
    }
    if (rest > 0) {
      html += '<span class="desp-val-chart-bar-rest ' + barFlexClass(rest) + '"></span>';
    }
    html += '</div>';
    return html;
  }

  function renderResumenGrafico(pedidos) {
    var store = DS();
    if (!store || !store.resumenPorValidador) return '';
    var resumen = store.resumenPorValidador(pedidos || []);
    var filas = (resumen.filas || []).filter(function (r) {
      return (r.validado || 0) > 0 || (r.cargado || 0) > 0;
    });
    var scaleMax = barScaleGlobal(filas);

    var rows = filas.map(function (r) {
      var cargado = r.cargado != null ? r.cargado : 0;
      return '<div class="desp-val-chart-row">' +
        '<span class="desp-val-chart-name" title="' + esc(r.nombre) + '">' + esc(r.nombre) + '</span>' +
        '<div class="desp-val-chart-bars" role="img" aria-label="' + esc(r.nombre) + ': ' +
        r.validado + ' validados, ' + cargado + ' camiones cargados">' +
        '<div class="desp-val-chart-bar-row">' +
        renderBarFlex(r.validado, scaleMax, 'validado') +
        '<span class="desp-val-chart-seg-num desp-val-chart-seg-num--validado" title="IDC validados">' +
        esc(String(r.validado)) + '</span></div>' +
        '<div class="desp-val-chart-bar-row">' +
        renderBarFlex(cargado, scaleMax, 'cargado') +
        '<span class="desp-val-chart-seg-num desp-val-chart-seg-num--cargado" title="Camiones cargados">' +
        esc(String(cargado)) + '</span></div>' +
        '</div>' +
        '</div>';
    }).join('');

    if (!rows) {
      rows = '<p class="desp-val-chart-empty">Sin IDC validados ni cargados asignados.</p>';
    }

    return '<aside class="desp-val-resumen desp-val-resumen--solo-barras" aria-label="Resumen validadores">' +
      '<div class="desp-val-resumen-legend desp-val-resumen-legend--tv">' +
      '<span class="desp-val-resumen-legend-item"><span class="desp-val-swatch desp-val-swatch--validado" aria-hidden="true"></span> Validados</span>' +
      '<span class="desp-val-resumen-legend-item"><span class="desp-val-swatch desp-val-swatch--cargado" aria-hidden="true"></span> Cargados (cam.)</span>' +
      '</div>' +
      '<div class="desp-val-chart-rows">' + rows + '</div></aside>';
  }

  function renderMount(share, data) {
    if (!mountEl) return;
    if (!shouldShowOnThisPage() || !share || !share.active) {
      mountEl.hidden = true;
      mountEl.setAttribute('aria-hidden', 'true');
      mountEl.innerHTML = '';
      if (global.document && global.document.body) {
        global.document.body.classList.remove('desp-live-lista-on');
      }
      lastSig = '';
      return;
    }

    data = data || (DS() ? DS().load() : { pedidos: [] });
    var pedidos = DS() ? DS().getPedidosVisiblesValidador(data.pedidos) : [];
    var counts = DS() && DS().countResumenValidador ? DS().countResumenValidador(data.pedidos) : null;
    var resumen = DS() && DS().resumenPorValidador ? DS().resumenPorValidador(data.pedidos) : null;

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('desp-live-lista-on');

    mountEl.innerHTML =
      '<div class="desp-lista-present-shell">' +
      '<div class="desp-lista-present-inner">' +
      '<div class="desp-lista-present-toolbar">' +
      renderKpiCards(data) +
      renderResumenGrafico(data.pedidos) +
      '</div>' +
      '<div class="desp-lista-present-table-wrap">' +
      '<table class="desp-lista-present-table" aria-label="Lista IDC en seguimiento validador">' +
      '<colgroup><col class="desp-lista-present-col-idc"><col class="desp-lista-present-col-cliente">' +
      '<col class="desp-lista-present-col-jaula"><col class="desp-lista-present-col-validador">' +
      '<col class="desp-lista-present-col-carga"><col class="desp-lista-present-col-estado"><col class="desp-lista-present-col-f1">' +
      '<col class="desp-lista-present-col-f2"><col class="desp-lista-present-col-f3"></colgroup>' +
      '<thead><tr><th>IDC</th><th>Cliente</th><th>Jaula</th><th>Validador</th><th>Carga</th>' +
      '<th class="desp-lista-present-th-estado">Estado</th>' +
      '<th class="desp-lista-present-th-fecha-etapa">Registro IDC</th>' +
      '<th class="desp-lista-present-th-fecha-etapa">Validado</th>' +
      '<th class="desp-lista-present-th-fecha-etapa">Cargado</th></tr></thead>' +
      '<tbody>' + renderTableRows(pedidos) + '</tbody>' +
      renderTableFoot(counts, data.updatedAt) +
      '</table></div></div></div>';

    lastSig = listaSignature(share, pedidos, counts, resumen, data.updatedAt);
  }

  function refreshFromStore() {
    var store = DS();
    if (!store) return;
    if (!shouldShowOnThisPage()) {
      renderMount(null);
      return;
    }
    var data = store.load();
    var share = store.getLiveShareLista ? store.getLiveShareLista(data) : null;
    if (!share || !share.active) {
      renderMount(null);
      return;
    }
    var pedidos = store.getPedidosVisiblesValidador(data.pedidos);
    var counts = store.countResumenValidador ? store.countResumenValidador(data.pedidos) : null;
    var resumen = store.resumenPorValidador ? store.resumenPorValidador(data.pedidos) : null;
    var sig = listaSignature(share, pedidos, counts, resumen, data.updatedAt);
    if (sig === lastSig) return;
    renderMount(share, data);
  }

  var LISTA_POLL_MS = 800;
  var LISTA_POLL_DISPLAY_MS = 500;

  function startListaPoll() {
    if (pollTimer) return;
    var interval = displayMode ? LISTA_POLL_DISPLAY_MS : LISTA_POLL_MS;
    pollTimer = global.setInterval(function () {
      if (!shouldShowOnThisPage()) return;
      refreshFromStore();
    }, interval);
  }

  function stopListaPoll() {
    if (!pollTimer) return;
    global.clearInterval(pollTimer);
    pollTimer = null;
  }

  function ensureMount() {
    if (mountEl && mountEl.isConnected) return mountEl;
    mountEl = document.getElementById('despGlobalLiveLista');
    if (!mountEl) {
      mountEl = document.createElement('div');
      mountEl.id = 'despGlobalLiveLista';
      mountEl.className = 'desp-live-present-lista';
      mountEl.hidden = true;
      mountEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(mountEl);
    }
    return mountEl;
  }

  function bind(opts) {
    if (bound) return;
    bound = true;
    displayMode = resolveDisplayMode(opts || {});
    ensureMount();

    function onUpdate() {
      refreshFromStore();
    }

    global.addEventListener('despacho-updated', onUpdate);
    global.addEventListener('despacho-live-lista', onUpdate);
    global.addEventListener('storage', function (ev) {
      if (ev.key === (DS() && DS().STORAGE_KEY)) onUpdate();
    });

    if (typeof global.BroadcastChannel !== 'undefined') {
      var bc = new global.BroadcastChannel('despacho-live-lista');
      bc.onmessage = function () { onUpdate(); };
    }

    refreshFromStore();
    if (shouldShowOnThisPage()) startListaPoll();
  }

  function unbind() {
    bound = false;
    stopListaPoll();
    if (mountEl) renderMount(null);
  }

  global.PlatformDespachoPresentLista = {
    bind: bind,
    unbind: unbind,
    refresh: refreshFromStore,
    render: renderMount,
    renderTableRows: renderTableRows
  };
})(typeof window !== 'undefined' ? window : this);
