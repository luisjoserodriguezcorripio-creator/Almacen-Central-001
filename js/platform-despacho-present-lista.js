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
  /** null = todas; array YYYY-MM-DD */
  var filterFechas = null;
  /** null = todos; array de ids de estado */
  var filterEstados = null;

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
        return r.nombre + ':' + (r.pendiente || 0) + '/' + r.validado + '/' + r.cargado + '/' + (r.camiones || 0) + '@' + (r.ultimaValidacion || '');
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

  function dayKeyPedido(iso) {
    var store = DS();
    if (!iso) return '';
    if (store && store.dayKeyCalendarioDespacho) return store.dayKeyCalendarioDespacho(iso);
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function registroIso(p) {
    var store = DS();
    var etapas = store && store.fechasEtapasValidador ? store.fechasEtapasValidador(p) : {};
    return etapas.pendiente_carga || p.createdAt || p.updatedAt || '';
  }

  function shortDayLabel(dayKey) {
    if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey || '';
    var parts = dayKey.split('-');
    return parts[2] + '/' + parts[1];
  }

  /** Timestamp de carga (listo_despacho); sin inventar con updatedAt para el corte diario. */
  function cargadoIso(p) {
    var store = DS();
    if (!p) return '';
    if (store && store.fechaCambioEstado) {
      var byEstado = store.fechaCambioEstado(p);
      if (byEstado) return byEstado;
    }
    var etapas = store && store.fechasEtapasValidador ? store.fechasEtapasValidador(p) : {};
    if (etapas.listo_despacho) return etapas.listo_despacho;
    var hist = p.historial || [];
    var i;
    for (i = hist.length - 1; i >= 0; i--) {
      var h = hist[i];
      if (h && h.hacia === 'listo_despacho' && h.at) return h.at;
    }
    return '';
  }

  function collectAvailableDays(pedidos) {
    var map = {};
    (pedidos || []).forEach(function (p) {
      var k;
      if (p && p.estado === 'listo_despacho') {
        k = dayKeyPedido(cargadoIso(p));
      } else {
        k = dayKeyPedido(registroIso(p));
      }
      if (k) map[k] = true;
    });
    return Object.keys(map).sort().reverse();
  }

  function todayKeyDespacho() {
    var store = DS();
    if (store && store.hoyCalendarioDespacho) return store.hoyCalendarioDespacho();
    if (store && store.dayKeyCalendarioDespacho) {
      return store.dayKeyCalendarioDespacho(new Date().toISOString());
    }
    return dayKeyPedido(new Date().toISOString());
  }

  /**
   * Alcance TV diario (zona America/Santo_Domingo):
   * - Cargado: solo del día actual (amanecer → 0).
   * - Pendiente / Validado: backlog completo (no se ocultan al cambiar el día).
   * Histórico permanece en BD; no se borra.
   */
  function applyTvDailyScope(pedidos) {
    var hoy = todayKeyDespacho();
    return (pedidos || []).filter(function (p) {
      if (!p) return false;
      if (p.estado === 'pendiente_carga' || p.estado === 'en_validacion') return true;
      if (p.estado !== 'listo_despacho') return false;
      var iso = cargadoIso(p);
      if (!iso) return false;
      return dayKeyPedido(iso) === hoy;
    });
  }

  function applyTvFilters(pedidos) {
    return (pedidos || []).filter(function (p) {
      if (filterFechas && filterFechas.length) {
        // La fecha solo afecta Cargado. Pendiente/Validado siempre quedan visibles.
        if (p.estado === 'listo_despacho') {
          var dia = dayKeyPedido(cargadoIso(p));
          if (filterFechas.indexOf(dia) < 0) return false;
        }
      }
      if (filterEstados && filterEstados.length) {
        if (filterEstados.indexOf(p.estado) < 0) return false;
      }
      return true;
    });
  }

  function filterSummaryLabel(selected, allLabel) {
    if (!selected || !selected.length) return allLabel;
    if (selected.length === 1) return selected[0].label;
    return 'Seleccionado';
  }

  function labelFechaTv(dayKey) {
    if (!dayKey) return '';
    var base = shortDayLabel(dayKey) + '/' + String(dayKey).slice(0, 4);
    return dayKey === todayKeyDespacho() ? ('Hoy · ' + base) : base;
  }

  /** Resumen del botón Fechas: Todos (abierto) o Seleccionado al filtrar. */
  function fechaFilterSummaryLabel(selectedKeys) {
    if (!selectedKeys || !selectedKeys.length) return 'Todos';
    return 'Seleccionado';
  }

  function renderFilterDropdown(opts) {
    var id = opts.id;
    var title = opts.title;
    var summary = opts.summary;
    var items = opts.items || [];
    return '<div class="desp-lista-filter" data-filter-id="' + esc(id) + '">' +
      '<div class="desp-lista-filter-label">' + esc(title) + '</div>' +
      '<button type="button" class="desp-lista-filter-btn" data-filter-toggle="' + esc(id) + '" aria-expanded="false">' +
      '<span class="desp-lista-filter-summary">' + esc(summary) + '</span><span aria-hidden="true">▾</span></button>' +
      '<div class="desp-lista-filter-menu" hidden data-filter-menu="' + esc(id) + '">' +
      items.map(function (it) {
        return '<label class="desp-lista-filter-option">' +
          '<input type="checkbox" data-filter-check="' + esc(id) + '" value="' + esc(it.value) + '"' +
          (it.checked ? ' checked' : '') + '> ' + esc(it.label) + '</label>';
      }).join('') +
      '</div></div>';
  }

  function renderTvFilters(availableDays) {
    var hoy = todayKeyDespacho();
    var fechaItems = [{
      value: 'all',
      label: 'Todos',
      checked: !filterFechas
    }];
    availableDays.forEach(function (d) {
      fechaItems.push({
        value: d,
        label: labelFechaTv(d),
        checked: !!(filterFechas && filterFechas.indexOf(d) >= 0)
      });
    });
    var fechaSummary = fechaFilterSummaryLabel(filterFechas);

    var store = DS();
    var estadoItems = [{ value: 'all', label: 'Todos', checked: !filterEstados }];
    (store && store.VALIDADOR_ESTADOS ? store.VALIDADOR_ESTADOS : []).forEach(function (id) {
      var e = store.ESTADOS[id];
      estadoItems.push({
        value: id,
        label: (e && (e.short || e.label)) || id,
        checked: !!(filterEstados && filterEstados.indexOf(id) >= 0)
      });
    });
    var estadoSummaryItems = (filterEstados || []).map(function (id) {
      var e = store && store.ESTADOS[id];
      return { value: id, label: (e && (e.short || e.label)) || id };
    });
    var estadoSummary = filterSummaryLabel(estadoSummaryItems, 'Todos');

    return {
      fecha: renderFilterDropdown({
        id: 'fecha',
        title: 'Fechas',
        summary: fechaSummary,
        items: fechaItems
      }),
      estado: renderFilterDropdown({
        id: 'estado',
        title: 'Estado',
        summary: estadoSummary,
        items: estadoItems
      })
    };
  }

  function bindTvFilters(share, data) {
    if (!mountEl) return;
    mountEl.querySelectorAll('[data-filter-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-filter-toggle');
        var menu = mountEl.querySelector('[data-filter-menu="' + id + '"]');
        var open = menu && !menu.hidden;
        mountEl.querySelectorAll('[data-filter-menu]').forEach(function (m) { m.hidden = true; });
        mountEl.querySelectorAll('[data-filter-toggle]').forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });
        if (menu && !open) {
          menu.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
    mountEl.querySelectorAll('[data-filter-check]').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = input.getAttribute('data-filter-check');
        var boxes = Array.prototype.slice.call(
          mountEl.querySelectorAll('[data-filter-check="' + id + '"]')
        );
        if (input.value === 'all' && input.checked) {
          boxes.forEach(function (b) { if (b.value !== 'all') b.checked = false; });
        } else if (input.value !== 'all' && input.checked) {
          boxes.forEach(function (b) { if (b.value === 'all') b.checked = false; });
        }
        var selected = boxes
          .filter(function (b) { return b.value !== 'all' && b.checked; })
          .map(function (b) { return b.value; });
        if (id === 'fecha') filterFechas = selected.length ? selected : null;
        if (id === 'estado') filterEstados = selected.length ? selected : null;
        lastSig = '';
        renderMount(share, data);
      });
    });
  }

  function renderTableFoot(counts, updatedAt) {
    if (!counts) return '';
    var syncLbl = updatedAt ? fmtDtLista(updatedAt) : '—';
    return '<tfoot><tr class="desp-lista-present-foot">' +
      '<td colspan="7">' +
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
      return '<tr><td colspan="7" class="desp-lista-present-empty">Sin IDC registrados todavía.</td></tr>';
    }
    return pedidos.map(function (p) {
      var store = DS();
      var idc = store ? store.formatIdc(p.idc) : p.idc;
      var cliente = p.cliente ? String(p.cliente).trim() : '—';
      var validador = p.validadorAsignado ? String(p.validadorAsignado).trim() : '—';
      if (!validador) validador = '—';
      var cargaTxt = store && store.formatCargasEquipoResumen
        ? store.formatCargasEquipoResumen(p, { withTotal: true })
        : '—';
      var regIso = registroIso(p);
      return '<tr>' +
        '<td class="desp-lista-present-registro">' + esc(regIso ? fmtDtLista(regIso) : '—') + '</td>' +
        '<td class="desp-lista-present-idc">' + esc(idc) + '</td>' +
        '<td class="desp-lista-present-cliente">' + esc(cliente) + '</td>' +
        '<td class="desp-lista-present-jaula">' + esc(p.jaula || '—') + '</td>' +
        '<td class="desp-lista-present-validador">' +
        '<span class="desp-lista-present-validador-pill">' + esc(validador) + '</span></td>' +
        '<td class="desp-lista-present-carga">' + esc(cargaTxt) + '</td>' +
        '<td class="desp-lista-present-estado-cell-only">' + estadoHtml(p.estado) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderKpiCards(pedidos) {
    if (!displayMode) return '';
    var store = DS();
    if (!store) return '';
    var counts = store.countResumenValidador
      ? store.countResumenValidador(pedidos || [])
      : { total: 0 };
    return '<div class="desp-lista-present-kpis" role="group" aria-label="Totales por estado">' +
      store.VALIDADOR_ESTADOS.map(function (id) {
        var e = store.ESTADOS[id];
        var icon = store.renderEstadoIconSvg ? store.renderEstadoIconSvg(id, { compact: true }) : '';
        var lbl = KPI_LABELS[id] || e.kpiLabel || e.short || e.label;
        var kpiCls = id === 'pendiente_carga' ? 'pendiente' : (id === 'en_validacion' ? 'validado' : 'cargado');
        var num = counts[id] || 0;
        var title = id === 'listo_despacho'
          ? 'Camiones cargados del día actual (histórico queda en BD)'
          : (id === 'en_validacion' ? 'IDC validados (histórico)' : 'IDC pendientes por validar (histórico)');
        if (id === 'listo_despacho' && counts.cargadoUnidades != null) {
          num = counts.cargadoUnidades;
          title = (counts.cargadoUnidades || 0) + ' camiones · ' + (counts.listo_despacho || 0) +
            ' IDC cargados (solo hoy)';
        }
        return '<div class="desp-lista-present-kpi desp-lista-present-kpi--' + esc(kpiCls) + '">' +
          (icon ? '<span class="desp-lista-present-kpi-iconbox" aria-hidden="true">' + icon + '</span>' : '') +
          '<span class="desp-lista-present-kpi-num" title="' + esc(title) + '">' + esc(String(num)) + '</span>' +
          '<span class="desp-lista-present-kpi-lbl" title="' + esc(title) + '">' + esc(lbl) + '</span></div>';
      }).join('') +
      '</div>';
  }

  /** Barra TV: meta=P+V+C; no se llena al 100% hasta que todo esté Cargado. */
  function prodBarWidths(pendiente, validado, cargado) {
    var p = Math.max(0, pendiente || 0);
    var v = Math.max(0, validado || 0);
    var c = Math.max(0, cargado || 0);
    var meta = p + v + c;
    if (!meta) return { p: 0, v: 0, c: 0, done: true };
    if (p === 0 && v === 0) return { p: 0, v: 0, c: 100, done: true };
    var filled = 28 + 72 * (c / meta);
    return {
      p: +(filled * (p / meta)).toFixed(2),
      v: +(filled * (v / meta)).toFixed(2),
      c: +(filled * (c / meta)).toFixed(2),
      done: false
    };
  }

  function renderProdStackedBar(r) {
    var p = r.pendiente != null ? r.pendiente : 0;
    var v = r.validado != null ? r.validado : 0;
    var c = r.cargado != null ? r.cargado : 0;
    var w = prodBarWidths(p, v, c);
    var segs = '';
    if (w.done) {
      segs = '<span class="desp-lista-prod-seg desp-lista-prod-seg--cam" style="width:100%">' +
        esc(String(c)) + '</span>';
    } else {
      if (p > 0) {
        segs += '<span class="desp-lista-prod-seg desp-lista-prod-seg--pend" style="width:' + w.p + '%">' +
          esc(String(p)) + '</span>';
      }
      if (v > 0) {
        segs += '<span class="desp-lista-prod-seg desp-lista-prod-seg--val" style="width:' + w.v + '%">' +
          esc(String(v)) + '</span>';
      }
      if (c > 0) {
        segs += '<span class="desp-lista-prod-seg desp-lista-prod-seg--cam" style="width:' + w.c + '%">' +
          esc(String(c)) + '</span>';
      }
    }
    return '<div class="desp-lista-prod-stack' + (w.done ? ' is-done' : '') + '" role="img" aria-label="' +
      esc(r.nombre) + ': Pendiente ' + p + ', Validado ' + v + ', Cargado ' + c + '">' + segs + '</div>';
  }

  function buildProdFilasCompletas(pedidos) {
    var store = DS();
    if (!store || !store.resumenPorValidador) return [];
    var resumen = store.resumenPorValidador(pedidos || []);
    var byName = {};
    (resumen.filas || []).forEach(function (r) {
      if (r && r.nombre) byName[r.nombre] = r;
    });
    var catalog = store.getValidadoresAsignables
      ? store.getValidadoresAsignables()
      : [];
    var seen = {};
    var filas = [];
    catalog.forEach(function (name) {
      if (!name || seen[name]) return;
      seen[name] = true;
      filas.push(byName[name] || { nombre: name, pendiente: 0, validado: 0, cargado: 0 });
    });
    (resumen.filas || []).forEach(function (r) {
      if (!r || !r.nombre || seen[r.nombre]) return;
      seen[r.nombre] = true;
      filas.push(r);
    });
    filas.sort(function (a, b) {
      var ta = (a.pendiente || 0) + (a.validado || 0) + (a.cargado || 0);
      var tb = (b.pendiente || 0) + (b.validado || 0) + (b.cargado || 0);
      if (tb !== ta) return tb - ta;
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    });
    return filas;
  }

  function renderProdSide(pedidos) {
    var store = DS();
    if (!store || !store.resumenPorValidador) {
      return '<aside class="desp-lista-prod-side" aria-label="Productividad validadores">' +
        '<h2 class="desp-lista-prod-title">Productividad validadores</h2>' +
        '<p class="desp-lista-prod-empty">Sin datos</p></aside>';
    }
    var filas = buildProdFilasCompletas(pedidos);
    var cards = filas.map(function (r) {
      return '<div class="desp-lista-prod-person">' +
        '<div class="desp-lista-prod-name">' + esc(r.nombre) + '</div>' +
        renderProdStackedBar(r) +
        '</div>';
    }).join('');
    if (!cards) {
      cards = '<p class="desp-lista-prod-empty">Sin validadores en catálogo.</p>';
    }
    return '<aside class="desp-lista-prod-side" aria-label="Productividad validadores">' +
      '<h2 class="desp-lista-prod-title">Productividad validadores</h2>' +
      '<div class="desp-lista-prod-legend" aria-hidden="true">' +
      '<span><i class="desp-lista-prod-swatch desp-lista-prod-swatch--pend"></i>Pendiente</span>' +
      '<span><i class="desp-lista-prod-swatch desp-lista-prod-swatch--val"></i>Validado</span>' +
      '<span><i class="desp-lista-prod-swatch desp-lista-prod-swatch--cam"></i>Cargado</span>' +
      '</div>' +
      '<div class="desp-lista-prod-list">' + cards + '</div>' +
      '</aside>';
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
    var allPedidos = DS() ? DS().getPedidosVisiblesValidador(data.pedidos) : [];
    var scopedPedidos = applyTvDailyScope(allPedidos);
    var availableDays = collectAvailableDays(scopedPedidos);
    var pedidos = applyTvFilters(scopedPedidos);
    var counts = DS() && DS().countResumenValidador ? DS().countResumenValidador(pedidos) : null;
    var resumen = DS() && DS().resumenPorValidador ? DS().resumenPorValidador(pedidos) : null;
    var filters = renderTvFilters(availableDays);

    mountEl.hidden = false;
    mountEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('desp-live-lista-on');

    mountEl.innerHTML =
      '<div class="desp-lista-present-shell">' +
      '<div class="desp-lista-present-inner desp-lista-present-layout-v2">' +
      '<div class="desp-lista-top-band">' +
      '<div class="desp-lista-top-left">' +
      renderKpiCards(pedidos) +
      '<div class="desp-lista-filter-fecha">' + filters.fecha + '</div>' +
      '</div>' +
      '<div class="desp-lista-filter-estado">' + filters.estado + '</div>' +
      '</div>' +
      '<div class="desp-lista-body-band">' +
      '<div class="desp-lista-present-table-wrap">' +
      '<table class="desp-lista-present-table" aria-label="Lista IDC en seguimiento validador">' +
      '<colgroup><col class="desp-lista-present-col-reg"><col class="desp-lista-present-col-idc">' +
      '<col class="desp-lista-present-col-cliente"><col class="desp-lista-present-col-jaula">' +
      '<col class="desp-lista-present-col-validador"><col class="desp-lista-present-col-carga">' +
      '<col class="desp-lista-present-col-estado"></colgroup>' +
      '<thead><tr>' +
      '<th>Registro IDC</th><th>IDC</th><th>Cliente</th><th>Jaula</th><th>Validador</th>' +
      '<th>Carga</th><th class="desp-lista-present-th-estado">Estado</th>' +
      '</tr></thead>' +
      '<tbody>' + renderTableRows(pedidos) + '</tbody>' +
      renderTableFoot(counts, data.updatedAt) +
      '</table></div>' +
      renderProdSide(pedidos) +
      '</div></div></div>';

    bindTvFilters(share, data);
    lastSig = listaSignature(share, scopedPedidos, counts, resumen, data.updatedAt) +
      '::f=' + (filterFechas ? filterFechas.join(',') : 'all') +
      '::e=' + (filterEstados ? filterEstados.join(',') : 'all') +
      '::hoy=' + todayKeyDespacho();
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
    var allPedidos = store.getPedidosVisiblesValidador(data.pedidos);
    var scopedPedidos = applyTvDailyScope(allPedidos);
    var pedidos = applyTvFilters(scopedPedidos);
    var counts = store.countResumenValidador ? store.countResumenValidador(pedidos) : null;
    var resumen = store.resumenPorValidador ? store.resumenPorValidador(pedidos) : null;
    var sig = listaSignature(share, scopedPedidos, counts, resumen, data.updatedAt) +
      '::f=' + (filterFechas ? filterFechas.join(',') : 'all') +
      '::e=' + (filterEstados ? filterEstados.join(',') : 'all') +
      '::hoy=' + todayKeyDespacho();
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
