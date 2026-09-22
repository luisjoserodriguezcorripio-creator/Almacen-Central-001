/**
 * Herramientas avanzadas de administración — diagnóstico, backup, validación Excel
 */
(function (global) {
  'use strict';

  var BACKUP_VERSION = 1;

  var REQUIRED_GLOBALS = [
    { name: 'PanelCore', label: 'Núcleo / seguridad' },
    { name: 'PlatformStore', label: 'Almacenamiento' },
    { name: 'PlatformExcelProductivity', label: 'Excel productividad' },
    { name: 'PlatformExcelOperaciones', label: 'Excel operaciones' },
    { name: 'PlatformExcelFacturas', label: 'Excel facturas' },
    { name: 'PlatformFacturasUI', label: 'UI facturas' },
    { name: 'PlatformTvDashboard', label: 'Dashboard TV' },
    { name: 'PlatformGestures', label: 'Gestos panel' },
    { name: 'PlatformExcel', label: 'Excel enrutador' },
    { name: 'PlatformExport', label: 'Exportación' },
    { name: 'PlatformOperacionesUI', label: 'UI operaciones' },
    { name: 'PlatformModules', label: 'UI módulos' },
    { name: 'PlatformAdmin', label: 'Administración' },
    { name: 'PlatformAdminUI', label: 'UI admin' },
    { name: 'PlatformAI', label: 'Asistente IA' },
    { name: 'PlatformAdminTools', label: 'Herramientas admin' },
    { name: 'PlatformDespachoStore', label: 'Despacho store' },
    { name: 'PlatformDespachoUI', label: 'UI despacho' }
  ];

  var AVERIAS_LS_KEYS = [
    'averias_dc_snapshot',
    'averias_dc_incidences',
    'averias_dc_damages',
    'averias_dc_securityIncidents',
    'averias_dc_audits5s',
    'averias_dc_despachoAudits',
    'averias_dc_equipmentInspections',
    'averias_dc_equipmentRegistry',
    'averias_dc_audit_log'
  ];

  var STORAGE_KEYS = [
    { key: 'almacen_platform_config', label: 'Configuración' },
    { key: 'almacen_platform_data_operaciones', label: 'Datos operaciones' },
    { key: 'almacen_platform_data_productividad', label: 'Datos productividad' },
    { key: 'almacen_platform_data_linea_trabajo', label: 'Datos línea de trabajo' },
    { key: 'almacen_platform_data_facturas', label: 'Datos facturas' },
    { key: 'almacen_platform_data_despacho', label: 'Datos despacho' },
    { key: 'almacen_platform_data', label: 'Datos legacy' },
    { key: 'almacen_users', label: 'Usuarios' },
    { key: 'almacen_areas', label: 'Áreas' },
    { key: 'almacen_logs', label: 'Historial' },
    { key: 'panel_almacen_session', label: 'Sesión' }
  ];

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function checkModules() {
    return REQUIRED_GLOBALS.map(function (m) {
      return {
        name: m.name,
        label: m.label,
        ok: !!global[m.name]
      };
    });
  }

  function checkLibraries() {
    return [
      { name: 'SheetJS (XLSX)', ok: typeof global.XLSX !== 'undefined', required: true },
      { name: 'Chart.js', ok: typeof global.Chart !== 'undefined', required: false },
      { name: 'localStorage', ok: !!global.localStorage, required: true }
    ];
  }

  function getStorageReport() {
    if (!global.localStorage) return { items: [], totalBytes: 0 };
    var items = [];
    var total = 0;
    STORAGE_KEYS.forEach(function (sk) {
      var raw = localStorage.getItem(sk.key);
      var bytes = raw ? new Blob([raw]).size : 0;
      total += bytes;
      items.push({
        key: sk.key,
        label: sk.label,
        bytes: bytes,
        present: !!raw,
        summary: summarizeStored(sk.key, raw)
      });
    });
    return { items: items, totalBytes: total };
  }

  function summarizeStored(key, raw) {
    if (!raw) return '—';
    try {
      var data = JSON.parse(raw);
      if (key.indexOf('productividad') >= 0 && data.celdas) {
        return data.celdas.length + ' celdas · ' + (data.meta && data.meta.empleados ? data.meta.empleados.length : 0) + ' empleados';
      }
      if (key.indexOf('linea_trabajo') >= 0 && data.registros) {
        return data.registros.length + ' líneas · ' + (data.meta && data.meta.enProceso != null ? data.meta.enProceso : 0) + ' en proceso';
      }
      if (key.indexOf('facturas') >= 0 && data.registros) {
        var t = data.aggregates && data.aggregates.totales;
        return data.registros.length + ' facturas · ' + (t ? t.ordenes : 0) + ' órdenes';
      }
      if (key.indexOf('despacho') >= 0 && data.pedidos) {
        return data.pedidos.length + ' pedido(s)';
      }
      if (key.indexOf('operaciones') >= 0) {
        if (data.format === 'control' && data.registros) {
          return data.registros.length + ' registros · cant. ' + (data.meta && data.meta.totalCantidad != null ? data.meta.totalCantidad : '—');
        }
        if (data.bd && data.bd.registros) return data.bd.registros.length + ' registros (legacy)';
      }
      if (key.indexOf('config') >= 0) return 'tema ' + (data.theme || 'dark') + ' · módulo ' + (data.activeModule || '—');
      if (key.indexOf('users') >= 0 && Array.isArray(data)) return data.length + ' usuarios';
      if (key.indexOf('logs') >= 0 && Array.isArray(data)) return data.length + ' eventos';
    } catch (e) {
      return 'JSON inválido';
    }
    return 'OK';
  }

  function getModuleStatus() {
    var pub = global.PlatformStore.getAllPublished();
    var prod = pub.productividad;
    var ops = pub.operaciones;
    var fac = pub.facturas;
    return {
      productividad: {
        loaded: !!(prod && prod.celdas && prod.celdas.length),
        fileName: prod && prod.fileName,
        updatedAt: prod && prod.updatedAt,
        rows: prod && prod.celdas ? prod.celdas.length : 0
      },
      operaciones: {
        loaded: !!(ops && ((ops.registros && ops.registros.length) || (ops.bd && ops.bd.registros && ops.bd.registros.length))),
        fileName: ops && ops.fileName,
        updatedAt: ops && ops.updatedAt,
        format: ops && ops.format,
        rows: ops && ops.registros ? ops.registros.length : (ops && ops.bd && ops.bd.registros ? ops.bd.registros.length : 0)
      },
      facturas: {
        loaded: !!(fac && fac.registros && fac.registros.length),
        fileName: fac && fac.fileName,
        updatedAt: fac && fac.updatedAt,
        rows: fac && fac.registros ? fac.registros.length : 0,
        ordenes: fac && fac.aggregates && fac.aggregates.totales ? fac.aggregates.totales.ordenes : 0
      },
      despacho: {
        loaded: !!(pub.despacho && pub.despacho.pedidos && pub.despacho.pedidos.length),
        updatedAt: pub.despacho && pub.despacho.updatedAt,
        rows: pub.despacho && pub.despacho.pedidos ? pub.despacho.pedidos.length : 0
      }
    };
  }

  function runDiagnostics() {
    var modules = checkModules();
    var libs = checkLibraries();
    var storage = getStorageReport();
    var modStatus = getModuleStatus();
    var errors = [];
    var warnings = [];

    modules.forEach(function (m) {
      if (!m.ok) errors.push('Módulo no cargado: ' + m.label + ' (' + m.name + ')');
    });
    libs.forEach(function (l) {
      if (!l.ok && l.required) errors.push('Biblioteca requerida ausente: ' + l.name);
      if (!l.ok && !l.required) warnings.push('Biblioteca opcional ausente: ' + l.name);
    });
    if (storage.totalBytes > 4 * 1024 * 1024) {
      warnings.push('Almacenamiento local > 4 MB. Considere exportar backup y limpiar datos antiguos.');
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      modules: modules,
      libraries: libs,
      storage: storage,
      moduleStatus: modStatus,
      checkedAt: new Date().toISOString()
    };
  }

  function validateExcelBuffer(arrayBuffer, forcedModule, allowForcedImport) {
    if (typeof global.XLSX === 'undefined') {
      return { ok: false, errors: ['SheetJS (XLSX) no está cargado. Use el servidor local con internet.'] };
    }
    try {
      var wb = global.XLSX.read(arrayBuffer, { type: 'array' });
      var detected = global.PlatformExcel.detectWorkbookType(wb);
      if (forcedModule && detected !== forcedModule && !allowForcedImport) {
        return {
          ok: false,
          detected: detected,
          forced: forcedModule,
          errors: ['El archivo parece ser de tipo «' + detected + '», no «' + forcedModule + '». Use el botón correcto de carga.'],
          sheetNames: wb.SheetNames
        };
      }
      if (forcedModule && detected !== forcedModule && allowForcedImport) {
        /* validación con import forzado — puede fallar si formato incompatible */
      }
      var payload = forcedModule
        ? global.PlatformExcel.importForModule(wb, 'validacion.xlsx', forcedModule)
        : global.PlatformExcel.importWorkbookAuto(wb, 'validacion.xlsx');
      var summary = {};
      if (payload.module === 'productividad') {
        summary = {
          empleados: (payload.meta && payload.meta.empleados) ? payload.meta.empleados.length : 0,
          dias: (payload.meta && payload.meta.diasConDatos) || 0,
          celdas: (payload.celdas && payload.celdas.length) || 0
        };
      } else if (payload.module === 'facturas' || payload.format === 'facturas') {
        var kf = global.PlatformExcelFacturas && global.PlatformExcelFacturas.buildKpis(payload);
        summary = {
          facturas: (payload.registros && payload.registros.length) || 0,
          ordenes: kf ? kf.ordenes : 0,
          almacenes: kf ? kf.almacenes : 0,
          ventasDop: kf ? kf.ventasDop : 0,
          ventasUsd: kf ? kf.ventasUsd : 0
        };
      } else if (payload.format === 'control') {
        summary = {
          registros: (payload.registros && payload.registros.length) || 0,
          usuarios: (payload.meta && payload.meta.usuarios) ? payload.meta.usuarios.length : 0,
          cantidadTotal: (payload.meta && payload.meta.totalCantidad) || 0,
          columnas: (payload.tableColumns && payload.tableColumns.length) || 0
        };
      } else {
        summary = {
          registros: (payload.bd && payload.bd.registros) ? payload.bd.registros.length : 0,
          formato: 'legacy'
        };
      }
      return {
        ok: true,
        detected: detected,
        module: payload.module,
        format: payload.format || payload.module,
        sheetNames: wb.SheetNames,
        sourceSheet: payload.sourceSheet,
        summary: summary,
        errors: []
      };
    } catch (err) {
      return {
        ok: false,
        errors: [err.message || String(err)],
        sheetNames: []
      };
    }
  }

  function createBackup() {
    var backup = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      config: global.PlatformStore.getConfig(),
      data: {
        operaciones: global.PlatformStore.getPublishedData('operaciones'),
        productividad: global.PlatformStore.getPublishedData('productividad'),
        facturas: global.PlatformStore.getPublishedData('facturas'),
        despacho: global.PlatformDespachoStore ? global.PlatformDespachoStore.load() : global.PlatformStore.getPublishedData('despacho')
      }
    };
    if (global.PlatformAdmin) {
      backup.users = global.PlatformAdmin.getVisibleUsers
        ? global.PlatformAdmin.getVisibleUsers()
        : global.PlatformAdmin.getStaffUsers();
      backup.areas = global.PlatformAdmin.getAreas();
      backup.logs = global.PlatformAdmin.getLogs();
    }
    return backup;
  }

  function downloadBackup() {
    var backup = createBackup();
    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'wms_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
    return { ok: true, size: json.length };
  }

  function restoreBackup(backup) {
    if (!backup || backup.version !== BACKUP_VERSION) {
      return { ok: false, message: 'Backup inválido o versión no compatible.' };
    }
    if (!global.localStorage) return { ok: false, message: 'localStorage no disponible.' };
    try {
      if (backup.config) global.PlatformStore.saveConfig(backup.config);
      if (backup.data) {
        if (backup.data.operaciones) {
          global.PlatformStore.publishData(backup.data.operaciones, 'operaciones');
        }
        if (backup.data.productividad) {
          global.PlatformStore.publishData(backup.data.productividad, 'productividad');
        }
        if (backup.data.facturas) {
          global.PlatformStore.publishData(backup.data.facturas, 'facturas');
        }
        if (backup.data.despacho && global.PlatformDespachoStore) {
          global.PlatformDespachoStore.save(backup.data.despacho);
        }
      }
      if (backup.users && global.PlatformAdmin) {
        global.localStorage.setItem('almacen_users', JSON.stringify(backup.users));
      }
      if (backup.areas && global.PlatformAdmin) {
        global.localStorage.setItem('almacen_areas', JSON.stringify(backup.areas));
      }
      return { ok: true, message: 'Backup restaurado correctamente.' };
    } catch (e) {
      return { ok: false, message: e.message || String(e) };
    }
  }

  function clearModuleData(module) {
    if (!global.localStorage || !global.PlatformStore) return { ok: false };
    var KEYS = global.PlatformStore.KEYS;
    if (module === 'productividad') {
      localStorage.removeItem(KEYS.dataProductividad);
      return { ok: true, message: 'Datos de productividad eliminados.' };
    }
    if (module === 'operaciones') {
      localStorage.removeItem(KEYS.dataOperaciones);
      return { ok: true, message: 'Datos de operaciones eliminados.' };
    }
    if (module === 'linea_trabajo') {
      localStorage.removeItem('almacen_platform_data_linea_trabajo');
      return { ok: true, message: 'Datos legacy de línea de trabajo eliminados.' };
    }
    if (module === 'facturas') {
      localStorage.removeItem(KEYS.dataFacturas);
      return { ok: true, message: 'Datos de facturas eliminados.' };
    }
    if (module === 'despacho') {
      localStorage.removeItem(KEYS.dataDespacho);
      return { ok: true, message: 'Datos de despacho eliminados.' };
    }
    if (module === 'all') {
      localStorage.removeItem(KEYS.dataProductividad);
      localStorage.removeItem(KEYS.dataOperaciones);
      localStorage.removeItem('almacen_platform_data_linea_trabajo');
      localStorage.removeItem(KEYS.dataFacturas);
      localStorage.removeItem(KEYS.dataDespacho);
      localStorage.removeItem(KEYS.data);
      return { ok: true, message: 'Todos los datos de módulos eliminados.' };
    }
    return { ok: false, message: 'Módulo no reconocido.' };
  }

  function resetConfig() {
    if (!global.localStorage) return { ok: false };
    var def = JSON.parse(JSON.stringify(global.PlatformStore.DEFAULT_CONFIG));
    global.PlatformStore.saveConfig(def);
    return { ok: true, message: 'Configuración restablecida a valores por defecto.' };
  }

  function emptyAveriasSnapshot() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      incidences: [],
      damages: [],
      securityIncidents: [],
      audits5s: [],
      despachoAudits: [],
      equipmentInspections: [],
      equipmentRegistry: {}
    };
  }

  function jsonBinAuthHeaders(jb) {
    var key = jb && jb.accessKey;
    if (!key) return {};
    if (jb.keyType === 'master' || String(key).indexOf('$2a$') === 0) {
      return { 'X-Master-Key': key };
    }
    return { 'X-Access-Key': key };
  }

  function clearLocalAveriasData() {
    if (!global.localStorage) return { ok: false };
    AVERIAS_LS_KEYS.forEach(function (k) {
      try { global.localStorage.removeItem(k); } catch (e) { /* noop */ }
    });
    return { ok: true };
  }

  function fetchSiteConfigForAdmin() {
    return global.fetch('data/site-config.json?t=' + Date.now(), { cache: 'no-store', mode: 'cors' })
      .then(function (res) {
        if (!res.ok) throw new Error('No se pudo leer site-config.json');
        return res.json();
      });
  }

  function pushEmptyToJsonBin(jb) {
    if (!jb || !jb.binId || !jb.accessKey) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    var snap = emptyAveriasSnapshot();
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(snap),
      mode: 'cors'
    }).then(function (res) {
      return { ok: res.ok, status: res.status, target: 'jsonbin' };
    }).catch(function (err) {
      return { ok: false, target: 'jsonbin', error: err.message || String(err) };
    });
  }

  function pushEmptyToLanAverias() {
    var snap = emptyAveriasSnapshot();
    return global.fetch('/api/cloud/averias', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap })
    }).then(function (res) {
      return { ok: res.ok, target: 'lan' };
    }).catch(function () {
      return { ok: false, target: 'lan', skipped: true };
    });
  }

  function wipeCloudAveriasData() {
    if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.wipeAll) {
      return global.PlatformAveriasCloudSync.wipeAll();
    }
    return fetchSiteConfigForAdmin().then(function (cfg) {
      var tasks = [pushEmptyToLanAverias()];
      var jb = cfg && cfg.averiasJsonBin;
      if (jb && jb.enabled && jb.binId && jb.accessKey) {
        tasks.unshift(pushEmptyToJsonBin(jb));
      }
      return Promise.all(tasks).then(function (results) {
        var jsonbin = results.find(function (r) { return r && r.target === 'jsonbin'; });
        var lan = results.find(function (r) { return r && r.target === 'lan'; });
        var cloudOk = !!(jsonbin && jsonbin.ok) || !!(lan && lan.ok);
        return { ok: cloudOk, jsonbin: jsonbin, lan: lan, results: results };
      });
    }).catch(function (err) {
      return { ok: false, error: err.message || String(err) };
    });
  }

  function pushEmptyToLanDespacho() {
    var empty = {
      module: 'despacho',
      version: 1,
      updatedAt: new Date().toISOString(),
      pedidos: [],
      liveShare: null,
      liveShareLista: null
    };
    return global.fetch('/api/data/despacho', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: empty, source: 'wipe' })
    }).then(function (res) {
      return { ok: res.ok, target: 'lan-despacho' };
    }).catch(function () {
      return { ok: false, target: 'lan-despacho', skipped: true };
    });
  }

  function wipeDespachoData() {
    var empty = {
      module: 'despacho',
      version: 1,
      updatedAt: new Date().toISOString(),
      pedidos: [],
      liveShare: null,
      liveShareLista: null
    };
    if (global.PlatformDespachoStore && global.PlatformDespachoStore.wipeAll) {
      global.PlatformDespachoStore.wipeAll();
      return { ok: true, via: 'store' };
    }
    if (global.localStorage && global.PlatformStore && global.PlatformStore.KEYS) {
      try {
        global.localStorage.setItem(global.PlatformStore.KEYS.dataDespacho, JSON.stringify(empty));
      } catch (e) { return { ok: false }; }
    }
    try {
      global.dispatchEvent(new CustomEvent('despacho-web-wiped'));
      global.dispatchEvent(new CustomEvent('despacho-updated', { detail: { data: empty, at: empty.updatedAt } }));
    } catch (e) { /* noop */ }
    return { ok: true, via: 'local' };
  }

  function wipeAllWebRegisteredData() {
    clearLocalAveriasData();
    var modules = clearModuleData('all');
    var desp = wipeDespachoData();
    return Promise.all([
      wipeCloudAveriasData(),
      pushEmptyToLanDespacho()
    ]).then(function (parts) {
      var cloud = parts[0];
      var lanDesp = parts[1];
      try {
        global.dispatchEvent(new CustomEvent('averias-web-wiped'));
        global.dispatchEvent(new CustomEvent('despacho-web-wiped'));
      } catch (e) { /* noop */ }
      if (global.PlatformAveriasCloudSync && global.PlatformAveriasCloudSync.schedulePullBurst) {
        global.PlatformAveriasCloudSync.schedulePullBurst();
      }
      var cloudOk = !!(cloud && cloud.ok);
      var jsonBinOk = !!(cloud && (cloud.jsonBinOk || (cloud.jsonbin && cloud.jsonbin.ok)));
      return {
        ok: modules.ok !== false && desp.ok !== false && (cloudOk || !(cloud && cloud.error)),
        cloudOk: cloudOk,
        jsonBinOk: jsonBinOk,
        message: cloudOk
          ? 'Limpieza completa: reportes en 0 en la nube, WMS y portales de despacho. Los demás dispositivos se actualizan en ~1 s.'
          : 'Datos locales borrados. No se pudo vaciar la nube — compruebe internet o JSONBin.',
        modules: modules,
        despacho: desp,
        cloud: cloud,
        lanDespacho: lanDesp
      };
    });
  }

  global.PlatformAdminTools = {
    runDiagnostics: runDiagnostics,
    validateExcelBuffer: validateExcelBuffer,
    getStorageReport: getStorageReport,
    getModuleStatus: getModuleStatus,
    createBackup: createBackup,
    downloadBackup: downloadBackup,
    restoreBackup: restoreBackup,
    clearModuleData: clearModuleData,
    resetConfig: resetConfig,
    wipeAllWebRegisteredData: wipeAllWebRegisteredData,
    clearLocalAveriasData: clearLocalAveriasData,
    emptyAveriasSnapshot: emptyAveriasSnapshot,
    formatBytes: formatBytes
  };
})(typeof window !== 'undefined' ? window : this);
