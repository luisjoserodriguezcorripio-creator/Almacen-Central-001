/**
 * Filtro de sitio — Centro de mando exclusivo 300-001 (CENTRAL)
 */
(function (global) {
  'use strict';

  var DEFAULT_SITE = {
    code: '300-001',
    label: 'CENTRAL',
    title: '300-001 (CENTRAL)'
  };

  function normSite(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactCode(s) {
    return normSite(s).replace(/[\s\-_./]/g, '');
  }

  function getSiteConfig(config) {
    var cfg = (config && config.siteFilter) || {};
    return {
      code: cfg.code || DEFAULT_SITE.code,
      label: cfg.label || DEFAULT_SITE.label,
      title: cfg.title || (cfg.code || DEFAULT_SITE.code) + ' (' + (cfg.label || DEFAULT_SITE.label) + ')'
    };
  }

  /** Coincide ubicación/almacén con el sitio activo (p. ej. "300-001", "300-001 CENTRAL"). */
  function matchesSite(value, site) {
    site = site || DEFAULT_SITE;
    var n = normSite(value);
    if (!n) return false;
    var code = normSite(site.code);
    var codeCompact = compactCode(site.code);
    var valueCompact = compactCode(value);

    if (code && n.indexOf(code) >= 0) return true;
    if (codeCompact && valueCompact.indexOf(codeCompact) >= 0) return true;

    var label = normSite(site.label);
    if (label && n.indexOf(label) >= 0) return true;
    if (label === 'central' && n.indexOf('central') >= 0) return true;

    return false;
  }

  /** Campos del registro de operaciones que pueden indicar almacén/sitio. */
  function operacionSiteHints(rec) {
    if (!rec) return [];
    var hints = [];
    if (rec.ubicacion) hints.push(rec.ubicacion);
    if (rec.codigo) hints.push(rec.codigo);
    var extra = rec.extra || {};
    Object.keys(extra).forEach(function (key) {
      if (!extra[key]) return;
      var k = normSite(key);
      if (k.indexOf('almacen') >= 0 || k.indexOf('warehouse') >= 0 ||
          k === 'sitio' || k.indexOf('centro') >= 0 || k.indexOf('planta') >= 0 ||
          k.indexOf('bodega') >= 0 || k.indexOf('wh') >= 0 || k.indexOf('site') >= 0) {
        hints.push(extra[key]);
      }
    });
    return hints;
  }

  function matchesOperacionRecord(rec, site) {
    var hints = operacionSiteHints(rec);
    for (var i = 0; i < hints.length; i++) {
      if (matchesSite(hints[i], site)) return true;
    }
    return false;
  }

  /** ¿Hay registros que claramente pertenecen a otro almacén? */
  function recordsHaveExplicitOtherSite(regs, site) {
    return (regs || []).some(function (rec) {
      return operacionSiteHints(rec).some(function (hint) {
        var n = normSite(hint);
        if (!n) return false;
        if (matchesSite(hint, site)) return false;
        if (/300[\s\-]?\d{3}/.test(n)) return true;
        if (n.indexOf('central') >= 0 && normSite(site.label) !== 'central') return true;
        if (/\b(norte|sur|este|oeste|zona|sucursal|branch)\b/.test(n) && n.indexOf('300') >= 0) return true;
        return false;
      });
    });
  }

  function cloneData(data, patch) {
    return Object.assign({}, data || {}, patch || {});
  }

  function filterFacturas(data, site) {
    if (!data || !data.registros) return null;
    site = site || DEFAULT_SITE;
    var FX = global.PlatformExcelFacturas;
    var regs = data.registros.filter(function (rec) {
      return matchesSite(rec.almacen, site);
    });
    if (!regs.length) {
      return cloneData(data, {
        registros: [],
        aggregates: FX && FX.buildAggregates ? FX.buildAggregates([]) : { porAlmacen: [], totales: {} },
        meta: Object.assign({}, data.meta, { totalRegistros: 0, siteFiltered: true, siteCode: site.code })
      });
    }
    return cloneData(data, {
      registros: regs,
      aggregates: FX.buildAggregates(regs),
      meta: Object.assign({}, data.meta, {
        totalRegistros: regs.length,
        almacenes: [site.title || site.code],
        siteFiltered: true,
        siteCode: site.code
      })
    });
  }

  function filterOperaciones(data, site) {
    if (!data || !data.registros) return null;
    site = site || DEFAULT_SITE;
    var XO = global.PlatformExcelOperaciones;
    var sourceRegs = data.registros || [];
    var regs = sourceRegs.filter(function (rec) {
      return matchesOperacionRecord(rec, site);
    });

    /* Excel de control: ubicación suele ser bin/pasillo, no código de almacén.
       Si no hay coincidencias pero tampoco hay otro sitio explícito → monositio CENTRAL. */
    if (!regs.length && sourceRegs.length > 0 && !recordsHaveExplicitOtherSite(sourceRegs, site)) {
      regs = sourceRegs.slice();
      var assumedMeta = Object.assign({}, data.meta || {}, {
        totalRegistros: regs.length,
        siteFiltered: true,
        siteCode: site.code,
        siteAssumed: true
      });
      if (!XO) {
        return cloneData(data, { registros: regs, meta: assumedMeta });
      }
      return cloneData(data, {
        registros: regs,
        aggregates: XO.buildAggregates(regs),
        meta: assumedMeta
      });
    }

    if (!XO) {
      return cloneData(data, { registros: regs });
    }
    return cloneData(data, {
      registros: regs,
      aggregates: XO.buildAggregates(regs),
      meta: Object.assign({}, data.meta || {}, {
        totalRegistros: regs.length,
        siteFiltered: true,
        siteCode: site.code
      })
    });
  }

  function applySiteFilter(ctx) {
    ctx = ctx || {};
    var site = getSiteConfig(ctx.config);
    var out = {
      site: site,
      facturas: null,
      operaciones: null,
      productividad: null,
      hasFacturas: false,
      hasOperaciones: false,
      hasProductividad: false
    };

    if (ctx.facturas && global.PlatformExcelFacturas && global.PlatformExcelFacturas.isFacturasData(ctx.facturas)) {
      out.facturas = filterFacturas(ctx.facturas, site);
      out.hasFacturas = !!(out.facturas && out.facturas.registros && out.facturas.registros.length);
    }

    if (ctx.operaciones && global.PlatformExcelOperaciones && global.PlatformExcelOperaciones.isControlData(ctx.operaciones)) {
      out.operaciones = filterOperaciones(ctx.operaciones, site);
      out.hasOperaciones = !!(out.operaciones && out.operaciones.registros && out.operaciones.registros.length);
    }

    /* Productividad derivada del mismo sitio vía operaciones (Excel pivot no trae almacén). */
    if (out.hasOperaciones) {
      out.productividad = { source: 'operaciones', site: site.code };
      out.hasProductividad = true;
    } else if (ctx.productividad && ctx.productividad.celdas && ctx.productividad.celdas.length) {
      out.productividad = null;
      out.hasProductividad = false;
    }

    return out;
  }

  global.PlatformSiteFilter = {
    DEFAULT_SITE: DEFAULT_SITE,
    getSiteConfig: getSiteConfig,
    matchesSite: matchesSite,
    operacionSiteHints: operacionSiteHints,
    matchesOperacionRecord: matchesOperacionRecord,
    filterFacturas: filterFacturas,
    filterOperaciones: filterOperaciones,
    applySiteFilter: applySiteFilter,
    normSite: normSite
  };
})(typeof window !== 'undefined' ? window : this);
