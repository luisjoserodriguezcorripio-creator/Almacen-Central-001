/**
 * Ideas de mejora operativa — sugerencias ligeras según datos publicados
 */
(function (global) {
  'use strict';

  function ideasHtml(ideas) {
    if (!ideas || !ideas.length) return '';
    var items = ideas.map(function (item) {
      var cls = item.priority === 'alta' ? 'is-high' : item.priority === 'media' ? 'is-med' : '';
      return '<li class="exec-improve-item ' + cls + '">' +
        '<span class="exec-improve-icon" aria-hidden="true">' + (item.icon || '→') + '</span>' +
        '<span>' + item.text + '</span></li>';
    }).join('');
    return '<aside class="exec-improve-panel" role="note">' +
      '<h4 class="exec-improve-title">Ideas de mejora para la operación</h4>' +
      '<ul class="exec-improve-list">' + items + '</ul></aside>';
  }

  function push(list, text, priority, icon) {
    list.push({ text: text, priority: priority || 'normal', icon: icon || '→' });
  }

  function productividad(viewId, data) {
    var ideas = [];
    if (!data || !data.celdas || !data.celdas.length) {
      push(ideas, 'Importe el Excel de productividad para activar comparativas y alertas de ritmo.', 'alta', '◇');
      return ideas;
    }
    var kp = global.PlatformExcelProductivity.buildKpis(data);
    var porFecha = data.porFecha || [];
    if (viewId === 'empleados' || viewId === 'matriz') {
      var low = (data.empleados || []).filter(function (e) {
        return e.rendimientoLabel === 'Bajo' || e.rendimientoLabel === 'Crítico';
      });
      if (low.length) {
        push(ideas, 'Hay <strong>' + low.length + '</strong> colaborador(es) en Bajo/Crítico: planifique coaching o redistribución de tareas.', 'alta', '👥');
      }
      push(ideas, 'Comparta el ranking en reunión de turno y fije meta semanal para los 3 últimos del listado.', 'media', '📋');
    }
    if (viewId === 'resumen' || viewId === 'tendencias') {
      if (porFecha.length >= 2) {
        var last = porFecha[porFecha.length - 1];
        var prev = porFecha[porFecha.length - 2];
        if (last.total < prev.total * 0.85) {
          push(ideas, 'El último día registrado cayó vs el anterior: revise ausencias, inventario o corte de datos.', 'alta', '▼');
        } else if (last.total > prev.total * 1.15) {
          push(ideas, 'Buen impulso reciente: mantenga dotación y priorice estabilizar el ritmo (evitar picos aislados).', 'media', '▲');
        }
      }
      push(ideas, 'Cruce productividad con Operaciones: si sube trabajo pero bajan órdenes cerradas, hay cuello en piso.', 'media', '🔗');
    }
    push(ideas, 'Líder actual: <strong>' + (kp.mejorEmpleado || '—') + '</strong> — use como referente para estándar de ritmo.', 'normal', '★');
    return ideas;
  }

  function operaciones(viewId, ctx) {
    var ideas = [];
    var model = ctx.model;
    var agg = ctx.agg;
    if (viewId === 'graficos' && agg) {
      if (agg.porEstado && agg.porEstado[0]) {
        var dom = agg.porEstado[0];
        push(ideas, 'Estado dominante «' + dom.estado + '»: asigne un responsable de desbloqueo diario.', 'media', '⚙');
      }
      if (agg.porUbicacion && agg.porUbicacion[0]) {
        push(ideas, 'Ubicación «' + agg.porUbicacion[0].ubicacion + '» concentra carga: valide dotación o reorden de rutas.', 'alta', '📍');
      }
      return ideas;
    }
    if (!model) {
      push(ideas, 'Publique datos de operaciones para ver tendencias y cuellos de botella.', 'alta', '◇');
      return ideas;
    }
    var abiertosActuales = ctx.measurement ? (ctx.measurement.abiertosRows || []).length : 0;
    if (abiertosActuales > 0) {
      push(ideas, 'Excel actual: <strong>' + abiertosActuales + '</strong> trabajo(s) abierto(s) sin cerrar — asigne cierre en la próxima supervisión de piso.', 'alta', '⚠');
    }
    var k = model.kpis || {};
    if (k.totalTrabajar > 40) {
      push(ideas, 'Cola alta (<strong>' + k.totalTrabajar + '</strong> a trabajar): priorice cierre de abiertos antes de nuevas entradas.', 'alta', '⚠');
    }
    if (k.enProceso > k.abiertos && k.enProceso > 10) {
      push(ideas, 'Mucho trabajo «en proceso» vs abiertos: revise si faltan cierres en WMS o estados mal clasificados.', 'alta', '⏳');
    }
    if (model.operaciones && model.operaciones[0]) {
      push(ideas, 'Refuerce el área «' + model.operaciones[0].name + '» (mayor carga) en la próxima supervisión de piso.', 'media', '🎯');
    }
    push(ideas, 'Meta sugerida: reducir 10–15% la cola «a trabajar» en 48 h midiendo este gráfico diario.', 'normal', '📈');
    return ideas;
  }

  function facturas(viewId, ctx) {
    var ideas = [];
    var por = ctx.por || [];
    var compliance = ctx.compliance || [];
    if (!por.length) {
      push(ideas, 'Importe el diario de facturas para comparar almacenes y metas en RD$.', 'alta', '◇');
      return ideas;
    }
    var bajo = compliance.filter(function (c) { return c.semaforoGeneral === 'danger'; });
    var riesgo = compliance.filter(function (c) { return c.semaforoGeneral === 'warn'; });
    if (viewId === 'cumplimiento' || viewId === 'ventas') {
      if (bajo.length) {
        push(ideas, 'Almacenes bajo meta: <strong>' + bajo.map(function (x) { return x.almacen; }).join(', ') + '</strong> — plan comercial o inventario urgente.', 'alta', '▼');
      }
      if (riesgo.length) {
        push(ideas, 'En riesgo: ' + riesgo.map(function (x) { return x.almacen; }).join(', ') + '. Acción preventiva esta semana.', 'media', '!');
      }
    }
    if (viewId === 'participacion') {
      push(ideas, 'Evite depender de un solo almacén: diversifique promociones en los de menor participación.', 'media', '◆');
    }
    push(ideas, 'Revise tasa USD→RD$ en Administración si hay facturas en dólares para no distorsionar metas.', 'normal', '💱');
    push(ideas, 'Cierre del día: compare ventas RD$ vs meta y comunique top 2 almacenes al equipo.', 'normal', '✓');
    return ideas;
  }

  function getImprovements(module, viewId, ctx) {
    ctx = ctx || {};
    switch (module) {
      case 'productividad':
        return productividad(viewId, ctx.data);
      case 'operaciones':
        return operaciones(viewId, ctx);
      case 'facturas':
        return facturas(viewId, ctx);
      default:
        return [];
    }
  }

  function attachToMeta(meta, module, viewId, ctx) {
    if (!meta) return meta;
    var POI = global.PlatformOperationalInsights;
    if (!POI) return meta;
    meta.improvements = POI.getImprovements(module, viewId, ctx);
    return meta;
  }

  global.PlatformOperationalInsights = {
    getImprovements: getImprovements,
    ideasHtml: ideasHtml,
    attachToMeta: attachToMeta
  };
})(typeof window !== 'undefined' ? window : this);
