/**
 * Dashboard operativo — métricas unificadas (legacy + control) y modo TV
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var AREA_ICONS = {
    recepcion: '📥',
    compra: '📥',
    control: '📋',
    inventario: '📋',
    despacho: '📤',
    venta: '📤',
    transferencia: '🔄',
    default: '📦'
  };

  var TV_SLIDES = ['kpis', 'chart', 'operations'];
  var TV_SLIDE_LABELS = { kpis: 'Indicadores', chart: 'Gráfico', operations: 'Visuales' };
  var tvTimer = null;
  var tvSlideIndex = 0;
  var tvCarouselSeconds = 8;
  var tvCarouselRunning = false;

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function classifyEstado(estado) {
    var e = norm(estado);
    if (!e) return 'other';
    if (e === 'abrir' || e === 'abierto' || e.indexOf('open') >= 0 || e.indexOf('pendiente') >= 0) return 'abierto';
    if (e.indexOf('proceso') >= 0 || e.indexOf('process') >= 0 || e.indexOf('curso') >= 0) return 'proceso';
    if (e.indexOf('cerrad') >= 0 || e.indexOf('closed') >= 0 || e.indexOf('complet') >= 0 ||
        e.indexOf('finaliz') >= 0 || e.indexOf('termin') >= 0) return 'cerrado';
    return 'other';
  }

  function iconForArea(name) {
    var n = norm(name);
    var keys = Object.keys(AREA_ICONS);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== 'default' && n.indexOf(keys[i]) >= 0) return AREA_ICONS[keys[i]];
    }
    return AREA_ICONS.default;
  }

  function formatDateLabel(iso) {
    if (!iso) return '—';
    var parts = String(iso).split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return iso;
  }

  function getOperationalDateIso(rec) {
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.recordOperationalDateIso) {
      return global.PlatformExcelOperaciones.recordOperationalDateIso(rec);
    }
    if (!rec) return '';
    if (rec.fechaModificacion) return String(rec.fechaModificacion).slice(0, 10);
    if (rec.fechaHora) return String(rec.fechaHora).slice(0, 10);
    return rec.fecha || '';
  }

  /* Usa la fecha de CREACIÓN (fechaHora / fecha) para el gráfico de avance */
  function getCreationDateIso(rec) {
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.recordCreationDateIso) {
      return global.PlatformExcelOperaciones.recordCreationDateIso(rec);
    }
    if (!rec) return '';
    if (rec.fechaHora) return String(rec.fechaHora).slice(0, 10);
    if (rec.fecha) return String(rec.fecha).slice(0, 10);
    return '';
  }

  function buildPorFechaFromRegistros(regs) {
    var XO = global.PlatformExcelOperaciones;
    if (XO && XO.buildPorFechaCreacion) {
      return XO.buildPorFechaCreacion(regs, { classifyEstado: classifyEstado });
    }
    return [];
  }

  function parseRecordDateTime(value) {
    if (!value && value !== 0) return null;
    if (value instanceof Date && !isNaN(value)) return value;
    var s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      var isoLike = s.replace(' ', 'T');
      var dIso = new Date(isoLike);
      return isNaN(dIso) ? null : dIso;
    }
    var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      var y = parseInt(m[3], 10);
      if (y < 100) y += 2000;
      var d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4] || '0', 10), parseInt(m[5] || '0', 10), parseInt(m[6] || '0', 10));
      return isNaN(d) ? null : d;
    }
    var fallback = new Date(s);
    return isNaN(fallback) ? null : fallback;
  }

  function formatAgeHours(hours) {
    var h = Math.max(0, Math.floor(Number(hours) || 0));
    var days = Math.floor(h / 24);
    var rest = h % 24;
    return days > 0 ? days + 'd ' + rest + 'h' : h + 'h';
  }

  function resolveResponsible(rec) {
    if (!rec) return 'Sin nombre';
    if (rec.usuario) return rec.usuario;
    var extra = rec.extra || {};
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) {
      var k = norm(keys[i]);
      if (k.indexOf('responsable') >= 0 || k.indexOf('nombre') >= 0 || k.indexOf('usuario') >= 0 || k.indexOf('operador') >= 0) {
        if (extra[keys[i]]) return extra[keys[i]];
      }
    }
    return 'Sin nombre';
  }

  function resolveModificationDateTime(rec) {
    if (!rec) return '';
    if (rec.fechaModificacion) return rec.fechaModificacion;
    var extra = rec.extra || {};
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) {
      var k = norm(keys[i]);
      var looksLikeModification = k.indexOf('modificacion') >= 0 ||
        k.indexOf('modified') >= 0 ||
        k.indexOf('ultima modificacion') >= 0 ||
        k.indexOf('last modified') >= 0;
      if (looksLikeModification && extra[keys[i]]) return extra[keys[i]];
    }
    return rec.fechaHora || rec.fecha || '';
  }

  function buildProceso24hAlerts(regs, refDate) {
    var now = refDate instanceof Date ? refDate : new Date();
    return (regs || []).filter(function (r) {
      return classifyEstado(r.estado) === 'proceso';
    }).map(function (r) {
      var modificationDate = resolveModificationDateTime(r);
      var started = parseRecordDateTime(modificationDate);
      var ageHours = started ? (now.getTime() - started.getTime()) / 3600000 : null;
      return {
        record: r,
        responsable: resolveResponsible(r),
        fechaHora: modificationDate,
        ageHours: ageHours,
        ageLabel: ageHours == null ? 'Sin hora' : formatAgeHours(ageHours),
        vencido: ageHours != null && ageHours >= 24
      };
    }).filter(function (x) {
      return x.vencido;
    }).sort(function (a, b) {
      return (b.ageHours || 0) - (a.ageHours || 0);
    });
  }

  function buildProceso24hUserAlerts(alerts) {
    var byUser = {};
    (alerts || []).forEach(function (item) {
      var user = item.responsable || 'Sin nombre';
      if (!byUser[user]) {
        byUser[user] = { usuario: user, count: 0, totalAgeHours: 0, maxAgeHours: 0, maxAgeLabel: '0h', tareas: [] };
      }
      byUser[user].count += 1;
      byUser[user].totalAgeHours += item.ageHours || 0;
      if ((item.ageHours || 0) > byUser[user].maxAgeHours) {
        byUser[user].maxAgeHours = item.ageHours || 0;
        byUser[user].maxAgeLabel = item.ageLabel || formatAgeHours(item.ageHours || 0);
      }
      byUser[user].tareas.push(item);
    });
    return Object.keys(byUser).map(function (k) { return byUser[k]; }).sort(function (a, b) {
      return (b.totalAgeHours || 0) - (a.totalAgeHours || 0);
    });
  }

  function resolveWorkOrderType(rec, preferredField) {
    if (!rec) return 'Sin tipo';
    var direct = rec[preferredField || 'tipoTrabajo'] || rec.tipoTrabajo || rec.tipoOrden || rec.tipo || rec.claseOrden || rec.area;
    if (direct) return direct;
    var extra = rec.extra || {};
    var keys = Object.keys(extra);
    var best = '';
    keys.forEach(function (key) {
      if (best || !extra[key]) return;
      var k = norm(key);
      var isType = (k.indexOf('tipo') >= 0 && (k.indexOf('orden') >= 0 || k.indexOf('trabajo') >= 0 || k === 'tipo')) ||
        k.indexOf('clase de orden') >= 0 ||
        k.indexOf('orden de trabajo') >= 0 ||
        k.indexOf('work order type') >= 0 ||
        k.indexOf('order type') >= 0;
      if (isType) best = extra[key];
    });
    return best || rec.ubicacion || 'Sin tipo';
  }

  function buildMiddleVisuals(registros, opts) {
    opts = opts || {};
    var typeField = opts.typeField || 'tipoTrabajo';
    var userField = opts.userField || 'usuario';
    var typeMap = {};
    var userProcessMap = {};

    (registros || []).forEach(function (r) {
      var cls = classifyEstado(r.estado);
      var qty = r.cantidad > 0 ? r.cantidad : 1;
      var typeName = resolveWorkOrderType(r, typeField);
      if (!typeMap[typeName]) typeMap[typeName] = { name: typeName, abiertos: 0, enProceso: 0, total: 0 };
      if (cls === 'abierto') typeMap[typeName].abiertos += qty;
      if (cls === 'proceso') typeMap[typeName].enProceso += qty;
      if (cls === 'abierto' || cls === 'proceso') typeMap[typeName].total += qty;

      if (cls === 'proceso') {
        var user = r[userField] || r.usuarioId || r.operador || 'Sin nombre';
        if (!userProcessMap[user]) userProcessMap[user] = { name: user, enProceso: 0, tipos: {} };
        userProcessMap[user].enProceso += qty;
        userProcessMap[user].tipos[typeName] = true;
      }
    });

    return {
      tiposOrden: Object.keys(typeMap).map(function (k) { return typeMap[k]; })
        .filter(function (x) { return x.abiertos || x.enProceso; })
        .sort(function (a, b) { return (b.abiertos + b.enProceso) - (a.abiertos + a.enProceso); })
        .slice(0, 10),
      usuariosProceso: Object.keys(userProcessMap).map(function (k) {
        var row = userProcessMap[k];
        row.tipoCount = Object.keys(row.tipos).length;
        return row;
      }).sort(function (a, b) { return b.enProceso - a.enProceso; }).slice(0, 10)
    };
  }

  function prepareResumenData(data, filters) {
    var XO = global.PlatformExcelOperaciones;
    if (XO && XO.prepareResumenPorDiaAnterior) {
      return XO.prepareResumenPorDiaAnterior(data, filters);
    }
    return { data: data, useDiaAnterior: false, diaIso: null, diaLabel: '', abiertosRows: [] };
  }

  function renderAbiertosResponsablesSection(measurement) {
    measurement = measurement || {};
    var rows = measurement.abiertosRows || [];
    var XO = global.PlatformExcelOperaciones;
    var fmt = XO && XO.formatFechaHoraDisplay ? XO.formatFechaHoraDisplay : function (v) { return v || '—'; };
    var hasDateFilter = measurement.filters && (measurement.filters.fechaDesde || measurement.filters.fechaHasta);
    var badge = hasDateFilter ? 'Filtro activo' : 'Excel completo';
    var note = hasDateFilter
      ? 'Trabajos en estado <strong>abierto</strong> dentro del rango de fechas aplicado.'
      : 'Trabajos en estado <strong>abierto</strong> detectados en todo el Excel importado.';

    var html = '<section class="ops-panel ops-panel-abiertos span-12">' +
      '<div class="ops-section-head">' +
      '<h3>Responsables con trabajos abiertos</h3>' +
      '<span class="ops-section-badge ops-badge-dia-anterior">' + esc(badge) + '</span>' +
      '</div>' +
      '<p class="ops-dia-anterior-note">' + note + '</p>';

    if (!rows.length) {
      html += '<p class="ops-muted ops-abiertos-empty">No hay trabajos abiertos para ' +
        (measurement.useDiaAnterior ? 'el día anterior (' + esc(measurement.diaLabel) + ').' : 'el filtro actual.') +
        '</p></section>';
      return html;
    }

    html += '<div class="ops-table-wrap ops-abiertos-wrap"><table class="ops-table ops-abiertos-table">' +
      '<thead><tr>' +
      '<th>Responsable</th><th>Fecha y hora de creación</th><th>ID tarea</th>' +
      '<th>Tipo trabajo</th><th>Ubicación</th><th>Estado</th><th class="num">Cant.</th>' +
      '</tr></thead><tbody>';

    var uniqUsers = {};
    rows.forEach(function (r) {
      if (r.usuario) uniqUsers[r.usuario] = true;
      html += '<tr>' +
        '<td><strong>' + esc(r.usuario || 'Sin nombre') + '</strong></td>' +
        '<td class="ops-fecha-hora">' + esc(fmt(r.fechaHora || r.fecha)) + '</td>' +
        '<td>' + esc(r.tareaId || '—') + '</td>' +
        '<td>' + esc(r.tipoTrabajo || '—') + '</td>' +
        '<td>' + esc(r.ubicacion || '—') + '</td>' +
        '<td><span class="ops-tag ops-tag-open">' + esc(r.estado || 'Abierto') + '</span></td>' +
        '<td class="num">' + esc(r.cantidad > 0 ? r.cantidad : 1) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>' +
      '<p class="ops-abiertos-foot">' + esc(rows.length) + ' trabajo(s) abierto(s) · ' +
      esc(Object.keys(uniqUsers).length) + ' responsable(s)</p></section>';
    return html;
  }

  function renderProceso24hAlertSection(alerts) {
    alerts = alerts || [];
    var XO = global.PlatformExcelOperaciones;
    var fmt = XO && XO.formatFechaHoraDisplay ? XO.formatFechaHoraDisplay : function (v) { return v || '—'; };

    var html = '<section class="ops-panel ops-panel-sla span-12' + (alerts.length ? ' has-alerts' : '') + '">' +
      '<div class="ops-section-head">' +
      '<h3>Alerta 24 horas · trabajos en proceso</h3>' +
      '<span class="ops-section-badge ops-badge-sla">' + esc(alerts.length) + ' vencido(s)</span>' +
      '</div>';

    if (!alerts.length) {
      html += '<p class="ops-muted ops-sla-ok">No hay trabajos en proceso con más de 24 horas desde su última modificación.</p></section>';
      return html;
    }

    html += '<p class="ops-sla-note">Estos trabajos deben revisarse y llamar al responsable. La alerta usa la fecha y hora de modificación; ningún trabajo puede permanecer en proceso por más de 24 horas sin moverse.</p>' +
      '<div class="ops-table-wrap ops-sla-wrap"><table class="ops-table ops-sla-table">' +
      '<thead><tr><th>Responsable</th><th>Tiempo desde modificación</th><th>Fecha/hora modificación</th><th>ID tarea</th><th>Tipo trabajo</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>';

    alerts.slice(0, 30).forEach(function (item) {
      var r = item.record || {};
      html += '<tr class="ops-sla-danger">' +
        '<td><strong>' + esc(item.responsable || 'Sin nombre') + '</strong></td>' +
        '<td><span class="ops-sla-age">' + esc(item.ageLabel) + '</span></td>' +
        '<td class="ops-fecha-hora">' + esc(fmt(item.fechaHora)) + '</td>' +
        '<td>' + esc(r.tareaId || '—') + '</td>' +
        '<td>' + esc(r.tipoTrabajo || '—') + '</td>' +
        '<td>' + esc(r.ubicacion || '—') + '</td>' +
        '<td><span class="ops-tag ops-tag-process">' + esc(r.estado || 'En proceso') + '</span></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    if (alerts.length > 30) {
      html += '<p class="ops-abiertos-foot">Mostrando 30 de ' + esc(alerts.length) + ' alertas vencidas.</p>';
    }
    html += '</section>';
    return html;
  }

  function buildFromLegacy(data) {
    var bDTD = data.bDTD || {};
    var tot = bDTD.totales || {};
    var kpis = global.PlatformExcel ? global.PlatformExcel.buildKpis(data) : {
      abiertos: tot.abiertos || 0,
      enProceso: tot.enProceso || 0,
      totalTrabajar: tot.totalTrabajar || 0
    };
    var porFecha = (bDTD.porFecha && bDTD.porFecha.length) ? bDTD.porFecha.slice() : [];
    if (!porFecha.length && data.bd && global.PlatformExcel && global.PlatformExcel.buildBDTDFromBD) {
      porFecha = global.PlatformExcel.buildBDTDFromBD(data.bd).porFecha || [];
    }

    var opsMap = {};
    (bDTD.abiertosPorTipo || []).forEach(function (x) {
      var key = x.area || x.tipo || 'General';
      if (!opsMap[key]) opsMap[key] = { name: key, tipo: x.tipo, area: x.area, abiertos: 0, enProceso: 0, total: 0, icon: iconForArea(key) };
      opsMap[key].abiertos += x.total || 0;
      opsMap[key].total += x.total || 0;
    });
    (bDTD.enProcesoPorTipo || []).forEach(function (x) {
      var key = x.area || x.tipo || 'General';
      if (!opsMap[key]) opsMap[key] = { name: key, tipo: x.tipo, area: x.area, abiertos: 0, enProceso: 0, total: 0, icon: iconForArea(key) };
      opsMap[key].enProceso += x.total || 0;
      opsMap[key].total += x.total || 0;
    });
    var operaciones = Object.keys(opsMap).map(function (k) { return opsMap[k]; })
      .sort(function (a, b) { return b.total - a.total; });

    var detailRows = (data.bd && data.bd.registros ? data.bd.registros : []).slice(-40).reverse().map(function (r) {
      var cls = classifyEstado(r.estado);
      return {
        fecha: r.fecha || '—',
        label: (r.tipo || r.area || '—'),
        sub: r.area || r.estado || '',
        abiertos: cls === 'abierto' ? 1 : 0,
        enProceso: cls === 'proceso' ? 1 : 0,
        total: 1
      };
    });

    return {
      format: 'legacy',
      kpis: kpis,
      porFecha: porFecha,
      operaciones: operaciones,
      detailRows: detailRows,
      middleVisuals: buildMiddleVisuals((data.bd && data.bd.registros) || [], { typeField: 'tipo', userField: 'usuario' }),
      fileName: data.fileName,
      updatedAt: data.updatedAt || data.importedAt
    };
  }

  function buildFromControl(data) {
    var regs = data.registros || [];
    var abiertos = 0;
    var enProceso = 0;
    var byArea = {};

    regs.forEach(function (r) {
      var cls = classifyEstado(r.estado);
      var qty = r.cantidad > 0 ? r.cantidad : 1;
      if (cls === 'abierto') abiertos += qty;
      else if (cls === 'proceso') enProceso += qty;

      var areaKey = resolveWorkOrderType(r, 'tipoTrabajo') || r.ubicacion || 'Operaciones';
      if (!byArea[areaKey]) {
        byArea[areaKey] = { name: areaKey, tipo: areaKey, area: r.ubicacion, abiertos: 0, enProceso: 0, total: 0, icon: iconForArea(areaKey) };
      }
      if (cls === 'abierto') byArea[areaKey].abiertos += qty;
      else if (cls === 'proceso') byArea[areaKey].enProceso += qty;
      byArea[areaKey].total += qty;
    });

    var porFecha = buildPorFechaFromRegistros(regs);
    var operaciones = Object.keys(byArea).map(function (k) { return byArea[k]; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 12);
    var processAlerts = buildProceso24hAlerts(regs);

    var detailRows = regs.slice(0, 50).map(function (r) {
      var cls = classifyEstado(r.estado);
      var qty = r.cantidad > 0 ? r.cantidad : 1;
      return {
        fecha: getCreationDateIso(r) || '—',
        label: r.usuario || '—',
        sub: (r.estado || '') + (r.ubicacion ? ' · ' + r.ubicacion : ''),
        abiertos: cls === 'abierto' ? qty : 0,
        enProceso: cls === 'proceso' ? qty : 0,
        total: qty
      };
    });

    return {
      format: 'control',
      kpis: {
        abiertos: abiertos,
        enProceso: enProceso,
        totalTrabajar: abiertos + enProceso
      },
      porFecha: porFecha,
      registros: regs,
      operaciones: operaciones,
      detailRows: detailRows,
      middleVisuals: buildMiddleVisuals(regs),
      processAlerts: processAlerts,
      processUserAlerts: buildProceso24hUserAlerts(processAlerts),
      fileName: data.fileName,
      updatedAt: data.updatedAt || data.importedAt
    };
  }

  function buildModel(data) {
    if (!data) return null;
    if (global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.isControlData(data)) {
      return buildFromControl(data);
    }
    if (data.bd && data.bd.registros && data.bd.registros.length) {
      return buildFromLegacy(data);
    }
    return null;
  }

  function formatKpiNum(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 10000) return (v / 1000).toFixed(1) + 'K';
    return String(Math.round(v));
  }

  function kpiHero(label, value, variant, icon) {
    var display = formatKpiNum(value);
    return '<article class="ops-kpi ops-kpi-' + variant + '" role="group" aria-label="' + esc(label) + '">' +
      '<span class="ops-kpi-icon" aria-hidden="true">' + icon + '</span>' +
      '<div class="ops-kpi-body">' +
      '<span class="ops-kpi-value" title="' + esc(String(value)) + '">' + esc(display) + '</span>' +
      '<span class="ops-kpi-label">' + esc(label) + '</span>' +
      '</div></article>';
  }

  function renderProceso24hUserAlertStrip(groups) {
    if (global.PlatformOpsVoiceAlerts && global.PlatformOpsVoiceAlerts.renderPanelHtml) {
      return global.PlatformOpsVoiceAlerts.renderPanelHtml(groups);
    }
    groups = groups || [];
    if (!groups.length) {
      return '<div class="ops-alert-strip ops-alert-strip-ok"><strong>Sin alertas 24H</strong><span>No hay usuarios con tareas en proceso mayores a 24 horas.</span></div>';
    }
    return '<div class="ops-alert-strip ops-alert-strip-danger" role="alert">' +
      groups.slice(0, 4).map(function (g) {
        return '<article class="ops-alert-user">' +
          '<strong>⚠ Usuario ' + esc(g.usuario) + ' tiene ' + esc(g.count) + ' tareas en proceso por más de 24 horas</strong>' +
          '<span>Mayor tiempo: ' + esc(g.maxAgeLabel || '—') + ' · Tiempo acumulado: ' + esc(formatAgeHours(g.totalAgeHours || 0)) + '</span>' +
          '</article>';
      }).join('') +
      (groups.length > 4 ? '<em>+' + esc(groups.length - 4) + ' usuario(s) adicional(es) con alerta</em>' : '') +
      '</div>';
  }

  function opsTvProgressHtml() {
    return TV_SLIDES.map(function (id, i) {
      return '<button type="button" class="ops-tv-seg' + (i === 0 ? ' active' : '') + '" data-slide="' + id + '" aria-label="' + esc(TV_SLIDE_LABELS[id] || id) + '">' +
        '<span class="ops-tv-seg-label">' + esc(TV_SLIDE_LABELS[id] || id) + '</span>' +
        '<span class="ops-tv-seg-track"><i class="ops-tv-seg-fill"></i></span></button>';
    }).join('');
  }

  function renderDateFilter(f) {
    f = f || {};
    return '<div class="ops-date-filter" data-perm="filter.apply">' +
      '<label class="ops-date-label"><span>Desde</span><input type="date" id="opsFilterDesde" value="' + esc(f.fechaDesde || '') + '"></label>' +
      '<label class="ops-date-label"><span>Hasta</span><input type="date" id="opsFilterHasta" value="' + esc(f.fechaHasta || '') + '"></label>' +
      '<button type="button" class="btn btn-primary btn-compact" id="opsBtnApplyDate">Aplicar</button>' +
      '</div>';
  }

  function renderOperationsCards(items) {
    if (!items.length) {
      return '<p class="ops-muted">Sin desglose por área o tipo de operación.</p>';
    }
    var html = '<div class="ops-ops-grid">';
    items.slice(0, 8).forEach(function (op) {
      var max = op.total || 1;
      var pctA = Math.round((op.abiertos / max) * 100);
      var pctP = Math.round((op.enProceso / max) * 100);
      html += '<article class="ops-op-card">' +
        '<div class="ops-op-head"><span class="ops-op-icon">' + op.icon + '</span>' +
        '<div><strong>' + esc(op.name) + '</strong>' +
        (op.tipo && op.area ? '<span class="ops-op-sub">' + esc(op.tipo) + '</span>' : '') +
        '</div><span class="ops-op-total">' + esc(op.total) + '</span></div>' +
        '<div class="ops-op-bars">' +
        '<div class="ops-op-bar"><span>Abierto</span><div class="ops-bar-track"><div class="ops-bar-fill ops-bar-open" style="width:' + pctA + '%"></div></div><em>' + esc(op.abiertos) + '</em></div>' +
        '<div class="ops-op-bar"><span>Proceso</span><div class="ops-bar-track"><div class="ops-bar-fill ops-bar-process" style="width:' + pctP + '%"></div></div><em>' + esc(op.enProceso) + '</em></div>' +
        '</div></article>';
    });
    html += '</div>';
    return html;
  }

  function renderMiddleVisuals(visuals) {
    visuals = visuals || {};
    var tipos = visuals.tiposOrden || [];
    var users = visuals.usuariosProceso || [];
    var maxUser = users.reduce(function (m, x) {
      return Math.max(m, x.enProceso || 0);
    }, 1);

    function tiposHtml() {
      if (!tipos.length) return '<p class="ops-muted">Sin tipos de orden abiertos/en proceso para mostrar.</p>';
      return '<div class="ops-vertical-list">' + tipos.slice(0, 6).map(function (x) {
        var total = (x.abiertos || 0) + (x.enProceso || 0);
        var openPct = total ? Math.round(((x.abiertos || 0) / total) * 100) : 0;
        var processPct = Math.max(0, 100 - openPct);
        return '<article class="ops-vertical-item">' +
          '<div class="ops-vertical-row-head"><strong>' + esc(x.name) + '</strong><span>' + esc(total) + '</span></div>' +
          '<div class="ops-vertical-stacked" aria-label="Abiertos ' + esc(x.abiertos || 0) + ', en proceso ' + esc(x.enProceso || 0) + '">' +
          '<i class="ops-stack-open" style="width:' + openPct + '%"></i>' +
          '<i class="ops-stack-process" style="width:' + processPct + '%"></i>' +
          '</div>' +
          '<div class="ops-vertical-legend"><span><b class="ops-dot-open"></b>Abiertos ' + esc(x.abiertos || 0) + '</span><span><b class="ops-dot-process"></b>En proceso ' + esc(x.enProceso || 0) + '</span></div>' +
          '</article>';
      }).join('') + '</div>';
    }

    function usersHtml() {
      if (!users.length) return '<p class="ops-muted">No hay usuarios con trabajos en proceso.</p>';
      return '<div class="ops-vertical-list">' + users.slice(0, 6).map(function (x) {
        var pct = Math.round(((x.enProceso || 0) / maxUser) * 100);
        return '<article class="ops-vertical-item ops-user-process-item">' +
          '<div class="ops-vertical-row-head"><strong>' + esc(x.name) + '</strong><span>' + esc(x.enProceso || 0) + '</span></div>' +
          '<div class="ops-vertical-bar"><span>En proceso</span><div class="ops-bar-track"><i class="ops-bar-fill ops-bar-process" style="width:' + pct + '%"></i></div><em>' + esc(x.tipoCount || 0) + ' tipo(s)</em></div>' +
          '</article>';
      }).join('') + '</div>';
    }

    return '<section class="ops-panel ops-panel-middle span-12">' +
      '<div class="ops-middle-grid">' +
      '<div class="ops-middle-card">' +
      '<div class="ops-section-head"><h3>Tipos de orden de trabajo</h3><span class="ops-section-badge">Abiertos / En proceso</span></div>' +
      tiposHtml() +
      '</div>' +
      '<div class="ops-middle-card">' +
      '<div class="ops-section-head"><h3>Usuarios en proceso</h3><span class="ops-section-badge">Responsables</span></div>' +
      usersHtml() +
      '</div>' +
      '</div></section>';
  }

  function renderDetailTable(rows, format) {
    var head = format === 'control'
      ? '<tr><th>Fecha</th><th>Usuario</th><th>Estado</th><th>Detalle</th><th class="num">Cant.</th></tr>'
      : '<tr><th>Fecha</th><th>Operación</th><th>Detalle</th><th class="num">Abierto</th><th class="num">Proceso</th></tr>';
    var body = '';
    rows.slice(0, 25).forEach(function (r) {
      if (format === 'control') {
        body += '<tr><td>' + esc(r.fecha) + '</td><td>' + esc(r.label) + '</td>' +
          '<td><span class="ops-tag">' + esc(r.sub.split(' · ')[0] || r.sub) + '</span></td>' +
          '<td class="ops-cell-muted">' + esc(r.sub) + '</td><td class="num">' + esc(r.total) + '</td></tr>';
      } else {
        body += '<tr><td>' + esc(r.fecha) + '</td><td>' + esc(r.label) + '</td>' +
          '<td class="ops-cell-muted">' + esc(r.sub) + '</td>' +
          '<td class="num">' + esc(r.abiertos) + '</td><td class="num">' + esc(r.enProceso) + '</td></tr>';
      }
    });
    if (!body) body = '<tr><td colspan="5" class="ops-muted">Sin registros para el filtro actual.</td></tr>';
    return '<div class="ops-table-wrap"><table class="ops-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderDashboard(host, model, filters, callbacks) {
    if (!host || !model) return '';
    callbacks = callbacks || {};
    var measurement = callbacks.measurement || {};
    var dateRange;
    if (filters.fechaDesde || filters.fechaHasta) {
      dateRange = formatDateLabel(filters.fechaDesde) + ' — ' + formatDateLabel(filters.fechaHasta);
    } else {
      dateRange = 'Todo el Excel';
    }

    host.innerHTML =
      '<div class="ops-dashboard" id="opsDashboard">' +
      '<header class="ops-dash-header">' +
      '<div class="ops-dash-title-block">' +
      '<span class="ops-dash-eyebrow">Dashboard operativo</span>' +
      '<h2 class="ops-dash-title">Operaciones</h2>' +
      '<p class="ops-dash-sub">' + esc(dateRange) + ' · ' + esc(model.fileName || 'Datos publicados') + '</p>' +
      '</div>' +
      renderDateFilter(filters) +
      '</header>' +

      '<div class="ops-kpi-row ops-kpi-desktop">' +
      kpiHero('Total abiertos', model.kpis.abiertos, 'open', '○') +
      kpiHero('Total en proceso', model.kpis.enProceso, 'process', '◐') +
      kpiHero('Total a trabajar', model.kpis.totalTrabajar, 'total', '◎') +
      '</div>' +

      '<div class="ops-tv-slides" id="opsTvSlides">' +
      '<section class="ops-tv-slide ops-slide-kpis active" data-slide="kpis">' +
      '<div class="ops-kpi-row">' +
      kpiHero('Total abiertos', model.kpis.abiertos, 'open', '○') +
      kpiHero('Total en proceso', model.kpis.enProceso, 'process', '◐') +
      kpiHero('Total a trabajar', model.kpis.totalTrabajar, 'total', '◎') +
      '</div>' +
      (model.processUserAlerts && model.processUserAlerts.length
        ? '<div class="ops-tv-sla-alert"><strong>ALERTA 24H</strong><span>' + esc(model.processUserAlerts[0].usuario) + ' tiene ' + esc(model.processUserAlerts[0].count) + ' tarea(s) vencida(s)</span><em>Mayor tiempo: ' + esc(model.processUserAlerts[0].maxAgeLabel || '—') + '</em></div>'
        : '<div class="ops-tv-sla-ok">Sin trabajos en proceso mayores a 24 horas desde modificación</div>') +
      '</section>' +

      '<section class="ops-tv-slide ops-slide-chart" data-slide="chart">' +
      renderProceso24hUserAlertStrip(model.processUserAlerts || []) +
      '<div class="ops-chart-hero exec-chart-view" id="opsTvChartHost"></div></section>' +

      '<section class="ops-tv-slide ops-slide-operations" data-slide="operations">' +
      renderMiddleVisuals(model.middleVisuals || {}) +
      '</section>' +
      '</div>' +

      '<div class="ops-desktop-grid">' +
      '<section class="ops-panel ops-panel-chart span-12">' +
      renderProceso24hUserAlertStrip(model.processUserAlerts || []) +
      '<div class="ops-chart-hero exec-chart-view" id="opsDesktopChartHost"></div></section>' +
      renderMiddleVisuals(model.middleVisuals || {}) +
      renderProceso24hAlertSection(model.processAlerts || []) +
      renderAbiertosResponsablesSection(measurement) +
      '<section class="ops-panel ops-panel-table span-12">' +
      '<div class="ops-section-head"><h3>Movimientos del período</h3><span class="ops-meta">' + model.detailRows.length + ' filas</span></div>' +
      renderDetailTable(model.detailRows, model.format) +
      '</section></div>' +

      '<div class="ops-tv-progress" id="opsTvProgress" role="tablist">' + opsTvProgressHtml() + '</div></div>';

    var EC = global.PlatformExecutiveCharts;
    if (EC && EC.operacionesEvolucionMeta) {
      var meta = EC.operacionesEvolucionMeta(model);
      if (global.PlatformOperationalInsights) {
        global.PlatformOperationalInsights.attachToMeta(meta, 'operaciones', 'resumen', {
          model: model,
          measurement: measurement
        });
      }
      var shellFn = (meta.useBiShell && EC.operacionesBiShell) ? EC.operacionesBiShell : EC.executiveShell;
      var shell = shellFn(meta);
      var tvHost = host.querySelector('#opsTvChartHost');
      var deskHost = host.querySelector('#opsDesktopChartHost');
      if (tvHost) tvHost.innerHTML = shell;
      if (deskHost) deskHost.innerHTML = shell.replace(/chartOpsExecutive/g, 'chartOpsExecutiveDesktop');
    }

    bindDashboardEvents(host, callbacks);
    bindOpsTvProgress(host.querySelector('#opsTvProgress'));
    if (global.PlatformOpsVoiceAlerts) {
      global.PlatformOpsVoiceAlerts.bindControls(host);
      global.PlatformOpsVoiceAlerts.sync(model.processUserAlerts || []);
    }
    if (callbacks.onRendered) callbacks.onRendered(model, measurement);
    return model;
  }

  function bindDashboardEvents(host, callbacks) {
    var applyBtn = host.querySelector('#opsBtnApplyDate');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        if (callbacks.onDateFilter) {
          callbacks.onDateFilter({
            fechaDesde: (host.querySelector('#opsFilterDesde') || {}).value || '',
            fechaHasta: (host.querySelector('#opsFilterHasta') || {}).value || ''
          });
        }
      });
    }
  }

  function updateOpsTvProgress(slideId) {
    var root = document.getElementById('opsDashboard');
    if (!root) return;
    var sec = tvCarouselSeconds || 8;
    var animate = TV_SLIDES.length > 1 && tvCarouselRunning;
    root.querySelectorAll('.ops-tv-seg').forEach(function (seg) {
      var on = seg.getAttribute('data-slide') === slideId;
      seg.classList.toggle('active', on);
      var fill = seg.querySelector('.ops-tv-seg-fill');
      if (!fill) return;
      fill.style.animation = 'none';
      fill.style.width = on && !animate ? '100%' : '0%';
      if (on && animate) {
        void fill.offsetWidth;
        fill.style.animation = 'opsTvSegProgress ' + sec + 's linear forwards';
      }
    });
  }

  function bindOpsTvProgress(root) {
    if (!root) return;
    root.querySelectorAll('.ops-tv-seg').forEach(function (btn) {
      if (btn.dataset.opsSegBound === '1') return;
      btn.dataset.opsSegBound = '1';
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-slide');
        var idx = TV_SLIDES.indexOf(id);
        if (idx >= 0) setTvSlide(idx, true);
      });
    });
  }

  function setTvSlide(index, userAction) {
    var root = document.getElementById('opsDashboard');
    if (!root || !TV_SLIDES.length) return;
    var prevId = TV_SLIDES[tvSlideIndex];
    tvSlideIndex = ((index % TV_SLIDES.length) + TV_SLIDES.length) % TV_SLIDES.length;
    var slideId = TV_SLIDES[tvSlideIndex];
    var sameSlide = slideId === prevId;
    if (sameSlide && !userAction) return;
    root.querySelectorAll('.ops-tv-slide').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-slide') === slideId);
    });
    updateOpsTvProgress(slideId);
    global.dispatchEvent(new CustomEvent('ops-tv-slide', { detail: { slide: slideId } }));
    if (tvCarouselRunning && TV_SLIDES.length > 1) {
      restartOpsTvTimer();
    }
  }

  function clearOpsTvTimer() {
    if (tvTimer) {
      clearTimeout(tvTimer);
      tvTimer = null;
    }
  }

  function restartOpsTvTimer() {
    clearOpsTvTimer();
    if (!tvCarouselRunning || TV_SLIDES.length <= 1) return;
    tvTimer = setTimeout(function () {
      if (!tvCarouselRunning) return;
      setTvSlide(tvSlideIndex + 1, false);
    }, tvCarouselSeconds * 1000);
  }

  function stopTvCarousel() {
    tvCarouselRunning = false;
    clearOpsTvTimer();
  }

  function startTvCarousel(seconds) {
    stopTvCarousel();
    if (!document.body.classList.contains('tv-mode') || !document.body.classList.contains('ops-tv-active')) return;
    tvCarouselSeconds = Math.max(5, Math.min(60, Number(seconds) || 8));
    var root = document.getElementById('opsDashboard');
    if (root) bindOpsTvProgress(root);
    if (TV_SLIDES.length <= 1) {
      updateOpsTvProgress(TV_SLIDES[tvSlideIndex]);
      return;
    }
    tvCarouselRunning = true;
    updateOpsTvProgress(TV_SLIDES[tvSlideIndex]);
    restartOpsTvTimer();
  }

  function syncTvMode(enabled, seconds) {
    document.body.classList.toggle('ops-tv-active', !!enabled);
    if (enabled) startTvCarousel(seconds);
    else stopTvCarousel();
  }

  global.PlatformOpsDashboard = {
    buildModel: buildModel,
    prepareResumenData: prepareResumenData,
    renderDashboard: renderDashboard,
    startTvCarousel: startTvCarousel,
    stopTvCarousel: stopTvCarousel,
    syncTvMode: syncTvMode,
    setTvSlide: setTvSlide,
    TV_SLIDES: TV_SLIDES
  };
})(typeof window !== 'undefined' ? window : this);
