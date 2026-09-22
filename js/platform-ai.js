/**
 * Asistente IA — chat interactivo, contexto multi-módulo, OpenAI opcional
 */
(function (global) {
  'use strict';

  var CHAT_STORAGE_KEY = 'almacen_ai_chat_v1';
  var MAX_HISTORY = 24;
  var MAX_OPENAI_MESSAGES = 12;

  var chatHistory = [];

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function getConfig() {
    return global.PlatformStore && global.PlatformStore.getConfig
      ? global.PlatformStore.getConfig()
      : { openai: {} };
  }

  function isOpenAiReady() {
    var cfg = getConfig();
    var oa = cfg.openai || {};
    return !!(oa.enabled && oa.apiKey && String(oa.apiKey).indexOf('sk-') === 0);
  }

  function getOpenAiModel() {
    var oa = getConfig().openai || {};
    return oa.model || 'gpt-4o-mini';
  }

  function loadChatHistory() {
    if (!global.sessionStorage) return;
    try {
      var raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      chatHistory = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(chatHistory)) chatHistory = [];
    } catch (e) {
      chatHistory = [];
    }
  }

  function saveChatHistory() {
    if (!global.sessionStorage) return;
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory.slice(-MAX_HISTORY)));
    } catch (e) { /* quota */ }
  }

  function clearChatHistory() {
    chatHistory = [];
    saveChatHistory();
  }

  function addToHistory(role, content, meta) {
    chatHistory.push({
      role: role,
      content: String(content || ''),
      at: new Date().toISOString(),
      source: meta && meta.source ? meta.source : 'local'
    });
    if (chatHistory.length > MAX_HISTORY) {
      chatHistory = chatHistory.slice(-MAX_HISTORY);
    }
    saveChatHistory();
  }

  function getChatHistory() {
    return chatHistory.slice();
  }

  function isProdData(d) {
    return d && d.module === 'productividad' && d.celdas && d.celdas.length;
  }

  function isOpsData(d) {
    return d && ((d.format === 'control' && d.registros && d.registros.length) ||
      (d.bd && d.bd.registros && d.bd.registros.length));
  }

  function getAllData(override) {
    if (override && typeof override === 'object' && !override.module) {
      return {
        productividad: override.productividad || null,
        operaciones: override.operaciones || null,
        facturas: override.facturas || null
      };
    }
    if (override && override.module) {
      var all = global.PlatformStore ? global.PlatformStore.getAllPublished() : {};
      all[override.module] = override;
      return all;
    }
    return global.PlatformStore && global.PlatformStore.getAllPublished
      ? global.PlatformStore.getAllPublished()
      : {};
  }

  function analyzeProductividad(data) {
    var insights = [];
    if (!isProdData(data)) return { insights: insights };
    var kp = global.PlatformExcelProductivity.buildKpis(data);
    var porFecha = global.PlatformUtils
      ? global.PlatformUtils.sortByDateAsc(data.porFecha || [], 'fecha')
      : (data.porFecha || []).slice();

    insights.push('Trabajo total del período: ' + kp.totalTrabajo + ' unidades en ' + kp.diasConDatos + ' días.');
    insights.push('Mejor rendimiento: ' + kp.mejorEmpleado + '.');

    if (porFecha.length >= 2) {
      var last = porFecha[porFecha.length - 1];
      var prev = porFecha[porFecha.length - 2];
      var diff = last.total - prev.total;
      var pct = prev.total ? Math.round((diff / prev.total) * 100) : 0;
      if (diff < 0) {
        insights.push('La productividad bajó en el último día (' + pct + '% vs anterior).');
      } else if (diff > 0) {
        insights.push('La productividad subió en el último día (+' + pct + '%).');
      }
      var maxDay = porFecha.reduce(function (b, x) { return x.total > b.total ? x : b; }, porFecha[0]);
      insights.push('Día pico: ' + maxDay.fecha + ' (' + maxDay.total + ' u.).');
    }

    return { insights: insights, kp: kp, porFecha: porFecha };
  }

  function analyzeOperaciones(data) {
    var insights = [];
    var opsDash = global.PlatformOpsDashboard && data
      ? global.PlatformOpsDashboard.buildModel(data) : null;
    if (opsDash && opsDash.kpis) {
      insights.push('Operación: ' + opsDash.kpis.abiertos + ' abiertos, ' + opsDash.kpis.enProceso +
        ' en proceso, ' + opsDash.kpis.totalTrabajar + ' total a trabajar.');
      if (opsDash.operaciones && opsDash.operaciones[0]) {
        insights.push('Mayor carga operativa: ' + opsDash.operaciones[0].name + ' (' + opsDash.operaciones[0].total + ').');
      }
      return { insights: insights, kp: opsDash.kpis, model: opsDash };
    }
    if (!isOpsData(data)) return { insights: insights };
    var kp = global.PlatformExcelOperaciones.buildKpis(data);
    var agg = data.aggregates || {};
    insights.push(kp.totalRegistros + ' registros · cantidad procesada: ' + kp.totalCantidad + '.');
    if (agg.porUsuario && agg.porUsuario[0]) {
      insights.push('Mayor actividad: ' + agg.porUsuario[0].usuario + ' (' + agg.porUsuario[0].count + ' tareas).');
    }
    if (agg.porEstado && agg.porEstado[0]) {
      insights.push('Estado predominante: ' + agg.porEstado[0].estado + ' (' + agg.porEstado[0].count + ').');
    }
    return { insights: insights, kp: kp };
  }

  function analyzeFacturas(data, tipoCambio) {
    var insights = [];
    var FX = global.PlatformExcelFacturas;
    if (!FX || !FX.isFacturasData(data)) return { insights: insights };
    var cfg = getConfig();
    var tc = FX.resolveTipoCambio(tipoCambio || cfg.facturasTipoCambio);
    var k = FX.buildKpis(data, tc);
    var view = FX.enrichAggregatesForDisplay(data.aggregates, tc);
    var top = (view.porAlmacen || [])[0];
    insights.push('Facturas: ventas ' + FX.formatMillions(k.ventasPesos) + ' RD$, ' + k.ordenes + ' órdenes, ' + k.almacenes + ' almacenes.');
    if (top) {
      insights.push('Almacén líder en ventas: ' + top.almacen + ' (' + FX.formatMillions(top.ventasPesos) + ' RD$).');
    }
    var compliance = FX.buildMetasCompliance(data.aggregates.porAlmacen, cfg.facturasMetas || {}, tc);
    var bajo = compliance.filter(function (c) { return c.semaforoGeneral === 'danger'; });
    if (bajo.length) {
      insights.push('Almacenes bajo meta: ' + bajo.map(function (x) { return x.almacen; }).join(', ') + '.');
    }
    return { insights: insights, kp: k, compliance: compliance };
  }

  function buildContext(data) {
    var all = getAllData(data);
    var cfg = getConfig();
    return {
      prod: isProdData(all.productividad) ? analyzeProductividad(all.productividad) : null,
      ops: all.operaciones ? analyzeOperaciones(all.operaciones) : null,
      fac: analyzeFacturas(all.facturas, cfg.facturasTipoCambio),
      modulesLoaded: {
        productividad: !!isProdData(all.productividad),
        operaciones: !!(all.operaciones && (isOpsData(all.operaciones) || global.PlatformOpsDashboard)),
        facturas: !!(global.PlatformExcelFacturas && global.PlatformExcelFacturas.isFacturasData(all.facturas))
      }
    };
  }

  function buildDataSnapshot(data, activeModule) {
    var ctx = buildContext(data);
    var lines = ['=== DATOS PUBLICADOS ALMACÉN CENTRAL ==='];
    if (activeModule) lines.push('Módulo activo en pantalla: ' + activeModule);
    lines.push('Módulos con datos: ' + Object.keys(ctx.modulesLoaded).filter(function (k) {
      return ctx.modulesLoaded[k];
    }).join(', ') || 'ninguno');

    if (ctx.ops && ctx.ops.insights.length) {
      lines.push('\n[OPERACIONES]');
      ctx.ops.insights.forEach(function (i) { lines.push('- ' + i); });
    }
    if (ctx.fac && ctx.fac.insights.length) {
      lines.push('\n[FACTURAS]');
      ctx.fac.insights.forEach(function (i) { lines.push('- ' + i); });
    }
    if (ctx.prod && ctx.prod.insights.length) {
      lines.push('\n[PRODUCTIVIDAD]');
      ctx.prod.insights.forEach(function (i) { lines.push('- ' + i); });
    }
    if (!ctx.ops && !ctx.fac && !ctx.prod) {
      lines.push('\nNo hay Excel importado. Indica al usuario que importe datos en Administración.');
    }
    return lines.join('\n');
  }

  function buildSystemPrompt(data, activeModule) {
    return 'Eres el asistente gerencial de «Almacén Central 001», un panel WMS con datos de Excel.\n' +
      'Habla como una persona del equipo: natural, cercana, directa y profesional. Evita sonar robótico.\n' +
      'Responde en español, claro y breve (máximo 8 frases salvo que pidan detalle).\n' +
      'Usa SOLO los datos del contexto; si falta información, dilo y sugiere importar Excel o cambiar de módulo.\n' +
      'Puedes dar recomendaciones operativas concretas para jefatura de almacén.\n\n' +
      buildDataSnapshot(data, activeModule);
  }

  function callOpenAI(userMessage, data, activeModule) {
    var cfg = getConfig().openai || {};
    var apiKey = cfg.apiKey;
    var model = getOpenAiModel();
    var system = buildSystemPrompt(data, activeModule);
    var messages = [{ role: 'system', content: system }];

    chatHistory.slice(-MAX_OPENAI_MESSAGES).forEach(function (m) {
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: m.content });
      }
    });
    messages.push({ role: 'user', content: userMessage });

    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.35,
        max_tokens: 900
      })
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var errMsg = (body.error && body.error.message) ? body.error.message : ('HTTP ' + res.status);
          throw new Error(errMsg);
        }
        var text = body.choices && body.choices[0] && body.choices[0].message
          ? body.choices[0].message.content
          : '';
        return { text: text.trim() || 'Sin respuesta del modelo.', source: 'openai', model: model };
      });
    });
  }

  function localAnswer(question, data) {
    var q = norm(question);
    var all = getAllData(data);
    var prodData = all.productividad;
    var opsData = all.operaciones;
    var facData = all.facturas;
    var FX = global.PlatformExcelFacturas;

    if (q.indexOf('hola') >= 0 || q.indexOf('buenas') >= 0 || q === 'ayuda') {
      return {
        text: 'Hola. Puedo ayudarte con operaciones, facturas y productividad. ' +
          'Pregunta en lenguaje natural o usa las sugerencias debajo del chat.',
        source: 'local'
      };
    }

    if (q.indexOf('resumen') >= 0 || q.indexOf('ejecutiv') >= 0 || q.indexOf('panorama') >= 0) {
      return summarize(data).then(function (r) {
        return {
          text: 'Resumen ejecutivo:\n\n' + (r.insights || []).map(function (l, i) {
            return (i + 1) + '. ' + l;
          }).join('\n'),
          source: 'local',
          insights: r.insights
        };
      });
    }

    if ((q.indexOf('factur') >= 0 || q.indexOf('venta') >= 0 || q.indexOf('almacen') >= 0) && facData && FX) {
      var kf = FX.buildKpis(facData, FX.resolveTipoCambio(getConfig().facturasTipoCambio));
      var view = FX.enrichAggregatesForDisplay(facData.aggregates, FX.resolveTipoCambio(getConfig().facturasTipoCambio));
      var topA = (view.porAlmacen || [])[0];
      return Promise.resolve({
        text: 'Facturas: ventas totales ' + FX.formatMillions(kf.ventasPesos) + ' RD$, ' + kf.ordenes +
          ' órdenes en ' + kf.almacenes + ' almacenes.' +
          (topA ? ' Mejor almacén: ' + topA.almacen + ' (' + FX.formatMillions(topA.ventasPesos) + ' RD$).' : ''),
        source: 'local'
      });
    }

    if (q.indexOf('quien') >= 0 && (q.indexOf('trabaj') >= 0 || q.indexOf('mas') >= 0) && prodData) {
      var top = (prodData.empleados || [])[0];
      return Promise.resolve({
        text: top ? 'Quien más trabajó: ' + top.nombre + ' con ' + top.total + ' unidades (' + top.rendimientoLabel + ').' : 'Sin ranking.',
        source: 'local'
      });
    }

    if ((q.indexOf('abiert') >= 0 || q.indexOf('trabajar') >= 0 || q.indexOf('operac') >= 0 ||
        q.indexOf('proceso') >= 0 || q.indexOf('pendiente') >= 0) && opsData) {
      var opsCtx = analyzeOperaciones(opsData);
      return Promise.resolve({
        text: opsCtx.insights.join(' ') || 'Sin datos de operación.',
        source: 'local'
      });
    }

    if (q.indexOf('recomend') >= 0 || q.indexOf('que hago') >= 0 || q.indexOf('prioridad') >= 0) {
      return summarize(data).then(function (r) {
        var tips = ['Revise primero los indicadores en rojo o con caída reciente.'];
        (r.insights || []).forEach(function (line) {
          if (line.indexOf('baj') >= 0 || line.indexOf('bajo meta') >= 0) {
            tips.push('Atención: ' + line);
          }
        });
        if (tips.length === 1) tips.push('Mantenga el ritmo actual y compare con el día pico del período.');
        return { text: '• ' + tips.join('\n• '), source: 'local' };
      });
    }

    if (q.indexOf('usuario') >= 0 && q.indexOf('actividad') >= 0 && opsData && opsData.aggregates) {
      var u = opsData.aggregates.porUsuario && opsData.aggregates.porUsuario[0];
      return Promise.resolve({
        text: u ? 'Mayor actividad: ' + u.usuario + ' (' + u.count + ' tareas).' : 'Sin usuarios.',
        source: 'local'
      });
    }

    return summarize(data).then(function (r) {
      if (!r.insights || !r.insights.length) {
        return {
          text: 'Aún no hay datos importados. Vaya a Administración → Datos Excel e importe operaciones, facturas o productividad. ' +
            'Luego pregúnteme de nuevo.',
          source: 'local'
        };
      }
      return {
        text: 'Según los datos publicados:\n\n• ' + r.insights.join('\n• ') +
          '\n\nPuede preguntar algo más específico (ej. facturas, operaciones abiertas, ranking de empleados).',
        source: 'local',
        insights: r.insights
      };
    });
  }

  function chat(userMessage, options) {
    options = options || {};
    var msg = String(userMessage || '').trim();
    if (!msg) {
      return Promise.resolve({ text: 'Escriba una pregunta.', source: 'local' });
    }

    var run = isOpenAiReady() && options.preferLocal !== true
      ? callOpenAI(msg, options.data, options.activeModule).catch(function (err) {
        return localAnswer(msg, options.data).then(function (local) {
          local.text = '(OpenAI no disponible: ' + err.message + ')\n\n' + local.text;
          local.source = 'local-fallback';
          return local;
        });
      })
      : localAnswer(msg, options.data);

    return run.then(function (res) {
      addToHistory('user', msg, { source: 'user' });
      addToHistory('assistant', res.text, { source: res.source });
      return res;
    });
  }

  function summarize(data) {
    var ctx = buildContext(data);
    var lines = [];
    if (ctx.ops && ctx.ops.insights) lines = lines.concat(ctx.ops.insights);
    if (ctx.fac && ctx.fac.insights) lines = lines.concat(ctx.fac.insights);
    if (ctx.prod && ctx.prod.insights) lines = lines.concat(ctx.prod.insights);
    if (!lines.length) {
      return Promise.resolve({
        text: 'Sin datos publicados. Importe Excel en Administración (Operaciones, Facturas o Productividad).',
        source: 'local',
        insights: []
      });
    }
    return Promise.resolve({
      text: lines.join(' '),
      source: isOpenAiReady() ? 'openai-ready' : 'local',
      insights: lines,
      context: ctx
    });
  }

  function ask(question, data) {
    return chat(question, { data: data });
  }

  function getInsightChips(data) {
    return summarize(data).then(function (r) {
      return (r.insights || []).map(function (text, i) {
        var type = 'info';
        if (text.indexOf('baj') >= 0 || text.indexOf('bajo meta') >= 0) type = 'warning';
        if (text.indexOf('Mejor') >= 0 || text.indexOf('Mayor') >= 0 || text.indexOf('líder') >= 0) type = 'success';
        return { id: 'ins_' + i, text: text, type: type };
      });
    });
  }

  function getCriticalAlerts(data) {
    var ctx = buildContext(data);
    var cards = [];
    if (ctx.prod) {
      (ctx.prod.insights || []).forEach(function (t) {
        if (t.indexOf('baj') >= 0) {
          cards.push({ title: 'Productividad', text: t, level: 'warning' });
        }
      });
    }
    if (ctx.fac && ctx.fac.compliance) {
      ctx.fac.compliance.forEach(function (c) {
        if (c.semaforoGeneral === 'danger') {
          cards.push({ title: 'Facturas · ' + c.almacen, text: 'Bajo meta de ventas u órdenes.', level: 'critical' });
        } else if (c.semaforoGeneral === 'warn') {
          cards.push({ title: 'Facturas · ' + c.almacen, text: 'En riesgo de no cumplir meta.', level: 'warning' });
        }
      });
    }
    if (ctx.ops && ctx.ops.kp && ctx.ops.kp.totalTrabajar > 50) {
      cards.push({
        title: 'Operaciones',
        text: 'Carga elevada: ' + ctx.ops.kp.totalTrabajar + ' unidades a trabajar.',
        level: 'warning'
      });
    }
    return cards.slice(0, 6);
  }

  function getSuggestedQuestions(activeModule) {
    var base = [
      'Dame un resumen ejecutivo de todo el almacén',
      '¿Qué debería priorizar hoy la jefatura?',
      '¿Cómo van las facturas por almacén?'
    ];
    var byMod = {
      general: [
        'Resume operación y facturas en 5 puntos',
        '¿Hay algún riesgo que deba ver el gerente?'
      ],
      operaciones: [
        '¿Cuánto hay abierto, en proceso y a trabajar?',
        '¿Qué área concentra más carga?'
      ],
      productividad: [
        '¿Quién lleva el mejor rendimiento?',
        '¿La productividad subió o bajó últimamente?'
      ],
      facturas: [
        '¿Qué almacén lidera en ventas RD$?',
        '¿Cuáles almacenes están bajo meta?'
      ],
      reportes: ['Genera conclusiones para mi reunión gerencial']
    };
    return base.concat(byMod[activeModule] || []).slice(0, 8);
  }

  function getStatusLabel() {
    if (isOpenAiReady()) {
      return { mode: 'openai', label: 'OpenAI · ' + getOpenAiModel(), hint: 'Respuestas con modelo conectado a tus datos.' };
    }
    return {
      mode: 'local',
      label: 'Motor local',
      hint: 'Activa OpenAI en Administración → IA para respuestas más conversacionales.'
    };
  }

  loadChatHistory();

  global.PlatformAI = {
    summarize: summarize,
    ask: ask,
    chat: chat,
    getInsightChips: getInsightChips,
    getCriticalAlerts: getCriticalAlerts,
    getSuggestedQuestions: getSuggestedQuestions,
    getChatHistory: getChatHistory,
    clearChatHistory: clearChatHistory,
    isOpenAiReady: isOpenAiReady,
    getStatusLabel: getStatusLabel,
    buildContext: buildContext,
    buildDataSnapshot: buildDataSnapshot,
    analyzeProductividad: analyzeProductividad,
    analyzeOperaciones: analyzeOperaciones
  };
})(typeof window !== 'undefined' ? window : this);
