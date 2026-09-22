/**
 * Almacén de persistencia local — datos separados por módulo
 */
(function (global) {
  'use strict';

  var KEYS = {
    config: 'almacen_platform_config',
    dataOperaciones: 'almacen_platform_data_operaciones',
    dataProductividad: 'almacen_platform_data_productividad',
    dataFacturas: 'almacen_platform_data_facturas',
    dataDespacho: 'almacen_platform_data_despacho',
    data: 'almacen_platform_data',
    session: 'panel_almacen_session'
  };

  var DEFAULT_CONFIG = {
    refreshSeconds: 20,
    theme: 'dark',
    tvMode: false,
    tvRotateSeconds: 8,
    activeModule: 'general',
    activeDashboard: 'resumen',
    productividadView: 'resumen',
    operacionesView: 'resumen',
    despachoView: 'combinado',
    facturasMetas: {},
    facturasTipoCambio: '58.5',
    siteFilter: {
      code: '300-001',
      label: 'CENTRAL',
      title: '300-001 (CENTRAL)'
    },
    dashboards: {
      resumen: { id: 'resumen', title: 'Resumen ejecutivo', enabled: true, widgets: ['kpis', 'barArea', 'doughEstado'] },
      operaciones: { id: 'operaciones', title: 'Operaciones por área', enabled: true, widgets: ['barTipo', 'tableArea'] },
      tendencias: { id: 'tendencias', title: 'Tendencias por fecha', enabled: true, widgets: ['lineFecha', 'kpisFecha'] },
      detalle: { id: 'detalle', title: 'Detalle de trabajos', enabled: true, widgets: ['dataTable'] }
    },
    filters: {
      fechaDesde: '',
      fechaHasta: '',
      usuario: '',
      ubicacion: '',
      tipoTrabajo: '',
      area: '',
      tipoOrden: '',
      estado: '',
      empleado: ''
    },
    openai: {
      enabled: false,
      apiKey: '',
      model: 'gpt-4o-mini'
    },
    charts: {
      productividad: { linea: true, ranking: true, rendimiento: false },
      operaciones: { fecha: true, usuario: true, estado: true, ubicacion: true }
    },
    fileHistory: [],
    generalLayout: [
      { id: 'ops', enabled: true, order: 0 },
      { id: 'fac', enabled: true, order: 1 },
      { id: 'desp', enabled: true, order: 2 }
    ],
    tvLayout: [
      { id: 'ops', enabled: true, order: 0 },
      { id: 'fac', enabled: true, order: 1 },
      { id: 'desp', enabled: true, order: 2 }
    ],
    networkRelay: {
      enabled: false,
      baseUrl: '',
      autoRedirect: true
    }
  };

  var MODULE_LABELS = {
    general: 'Almacén Central 001',
    productividad: 'Productividad',
    operaciones: 'Operaciones',
    facturas: 'Facturas',
    reportes: 'Reportes',
    despacho: 'Despacho'
  };

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function migrateLegacyData() {
    if (!global.localStorage) return;
    var legacy = localStorage.getItem(KEYS.data);
    if (!legacy) return;
    if (!localStorage.getItem(KEYS.dataOperaciones)) {
      localStorage.setItem(KEYS.dataOperaciones, legacy);
    }
  }

  function getConfig() {
    if (!global.localStorage) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    migrateLegacyData();
    var cfg = safeParse(localStorage.getItem(KEYS.config), null);
    if (!cfg) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    var out = Object.assign({}, DEFAULT_CONFIG, cfg, {
      dashboards: Object.assign({}, DEFAULT_CONFIG.dashboards, cfg.dashboards || {}),
      filters: Object.assign({}, DEFAULT_CONFIG.filters, cfg.filters || {}),
      openai: Object.assign({}, DEFAULT_CONFIG.openai, cfg.openai || {}),
      charts: Object.assign({}, DEFAULT_CONFIG.charts, cfg.charts || {}, {
        productividad: Object.assign({}, DEFAULT_CONFIG.charts.productividad, (cfg.charts && cfg.charts.productividad) || {}),
        operaciones: Object.assign({}, DEFAULT_CONFIG.charts.operaciones, (cfg.charts && cfg.charts.operaciones) || {})
      }),
      fileHistory: cfg.fileHistory || [],
      siteFilter: Object.assign({}, DEFAULT_CONFIG.siteFilter, cfg.siteFilter || {}),
      generalLayout: (cfg.generalLayout && cfg.generalLayout.length)
        ? cfg.generalLayout
        : DEFAULT_CONFIG.generalLayout.slice(),
      tvLayout: (cfg.tvLayout && cfg.tvLayout.length)
        ? cfg.tvLayout
        : DEFAULT_CONFIG.tvLayout.slice(),
      networkRelay: Object.assign({}, DEFAULT_CONFIG.networkRelay, cfg.networkRelay || {})
    });
    if (global.PlatformLayout && global.PlatformLayout.mergeConfigLayout) {
      global.PlatformLayout.mergeConfigLayout(out);
    }
    if (out.activeModule === 'linea_trabajo') {
      out.activeModule = 'general';
    }
    return out;
  }

  function pushFileHistory(entry) {
    var cfg = getConfig();
    cfg.fileHistory = cfg.fileHistory || [];
    cfg.fileHistory.unshift({
      module: entry.module,
      fileName: entry.fileName,
      at: new Date().toISOString(),
      rows: entry.rows || 0
    });
    cfg.fileHistory = cfg.fileHistory.slice(0, 30);
    saveConfig(cfg);
  }

  function saveConfig(config) {
    if (!global.localStorage) return;
    localStorage.setItem(KEYS.config, JSON.stringify(config));
  }

  function storageKeyForModule(module) {
    if (module === 'productividad') return KEYS.dataProductividad;
    if (module === 'facturas') return KEYS.dataFacturas;
    if (module === 'despacho') return KEYS.dataDespacho;
    return KEYS.dataOperaciones;
  }

  function getPublishedData(module) {
    if (!global.localStorage) return null;
    migrateLegacyData();
    return safeParse(localStorage.getItem(storageKeyForModule(module)), null);
  }

  function publishData(payload, module) {
    if (!global.localStorage) return false;
    var mod = module || payload.module || 'operaciones';
    var key = storageKeyForModule(mod);
    payload.module = mod;
    payload.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(payload));
    if (global.PlatformWebCloudSync && global.PlatformWebCloudSync.pushLocal) {
      global.PlatformWebCloudSync.pushLocal(3);
    }
    if (mod === 'despacho' && global.PlatformDespachoCloudSync && global.PlatformDespachoCloudSync.pushLocal) {
      global.PlatformDespachoCloudSync.pushLocal(3);
    }
    return true;
  }

  function getAllPublished() {
    return {
      operaciones: getPublishedData('operaciones'),
      productividad: getPublishedData('productividad'),
      facturas: getPublishedData('facturas'),
      despacho: getPublishedData('despacho')
    };
  }

  global.PlatformStore = {
    KEYS: KEYS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    MODULE_LABELS: MODULE_LABELS,
    getConfig: getConfig,
    saveConfig: saveConfig,
    getPublishedData: getPublishedData,
    publishData: publishData,
    getAllPublished: getAllPublished,
    pushFileHistory: pushFileHistory
  };
})(typeof window !== 'undefined' ? window : this);
