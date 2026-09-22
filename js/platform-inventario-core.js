/**
 * Inventario RF — reglas de negocio (port desde app Zebra)
 */
(function (global) {
  'use strict';

  var WAREHOUSE = '300-001';
  var DOUBLE_PASILLOS = {
    1:1, 2:1, 3:1, 4:1, 5:1,
    12:1, 13:1, 14:1, 15:1, 16:1, 18:1,
    23:1, 24:1, 26:1, 27:1,
    37:1, 38:1, 39:1, 40:1, 41:1
  };
  var RACK_PREFIX = /^[A-Za-z](\d{3})$/i;

  var MODE_LABELS = { pickup: 'PICKUP', pallet: 'RACK', cuadre: 'PISO' };
  var MODE_DB = { pickup: 'PICKUP', pallet: 'ALTURA', cuadre: 'CUADRE_UBICACIONES' };

  function pasilloFromLocation(location) {
    var parts = String(location || '').trim().split('-');
    var rack = (parts[0] || '').trim();
    var m = RACK_PREFIX.exec(rack);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return n >= 1 && n <= 999 ? n : null;
  }

  function isDoubleRackPasillo(pasillo) {
    return !!DOUBLE_PASILLOS[pasillo];
  }

  function isDoubleRackLocation(location) {
    var p = pasilloFromLocation(location);
    return p != null ? isDoubleRackPasillo(p) : null;
  }

  function rackTypeLabel(location) {
    var p = pasilloFromLocation(location);
    if (p == null || p < 1 || p > 41) return 'Sencillo';
    return isDoubleRackPasillo(p) ? 'Doble Rick' : 'Sencillo';
  }

  function rackTypeForPasillo(pasillo) {
    var p = parseInt(pasillo, 10);
    if (isNaN(p) || p < 1 || p > 41) return 'Sencillo';
    return isDoubleRackPasillo(p) ? 'Doble Rick' : 'Sencillo';
  }

  function pasilloCatalog() {
    var list = [];
    for (var p = 1; p <= 41; p++) {
      list.push({ pasillo: p, tipo: rackTypeForPasillo(p) });
    }
    return list;
  }

  function levelFromLocation(location) {
    var m = /-(\d)$/.exec(String(location || '').trim());
    return m ? m[1] : '';
  }

  function isValidPickupLocation(code) {
    code = String(code || '').trim();
    if (code === '0') return true;
    return code.length > 0 && code.slice(-1) === '1';
  }

  function flowStepsForMode(mode) {
    return mode === 'pickup' ? [1, 2, 4, 5] : [1, 2, 3, 4, 5];
  }

  function buildEntryPayload(fields) {
    fields = fields || {};
    var qty = parseInt(fields.quantity, 10) || 0;
    var expected = parseFloat(fields.expectedQty) || 0;
    return {
      barcode: String(fields.barcode || '').trim(),
      product_name: String(fields.productName || '').trim(),
      quantity: qty,
      zone: String(fields.zone || '').trim(),
      warehouse: String(fields.warehouse || WAREHOUSE).trim(),
      unit: String(fields.unit || 'CJ').trim(),
      expected_qty: expected,
      matricula: String(fields.matricula || '').trim(),
      expiration_date: String(fields.expirationDate || '').trim(),
      user_id: String(fields.userId || '').trim(),
      synced: true,
      count_mode: String(fields.countMode || '').trim(),
      rack_pass_index: parseInt(fields.rackPassIndex, 10) || 0,
      rack_passes_total: parseInt(fields.rackPassesTotal, 10) || 0,
      count_number: parseInt(fields.countNumber, 10) || 1
    };
  }

  function entryMeta(entry) {
    var loc = entry.zone || entry.location || '';
    var save = entry.count_number || entry.save || 1;
    var passes = entry.rack_passes_total || 0;
    if (!passes) {
      var dbl = isDoubleRackLocation(loc);
      passes = dbl === true ? 2 : 1;
    }
    var cycle = passes >= 2 ? Math.floor((save - 1) / 2) + 1 : save;
    var lectura = passes >= 2 ? ((save - 1) % 2 + 1) + ' de 2' : '1 de 1';
    var re = cycle >= 2;
    return {
      pasillo: pasilloFromLocation(loc),
      tipo: rackTypeLabel(loc),
      passes: passes,
      cycle: cycle,
      lectura: lectura,
      re: re,
      label: 'Conteo ' + cycle + ' · Lectura ' + lectura + (re ? ' · Reconteo' : '')
    };
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleString('es-DO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val).trim();
    if (!s) return '';
    return '="' + s.replace(/"/g, '""') + '"';
  }

  function entriesToCsv(entries) {
    var lines = [
      'Fecha;Usuario;Ubicación;Almacén;Código;Matrícula;Vencimiento;Producto;Empaque;Cantidad;Sistema;Diferencia;Modo;Conteo#'
    ];
    (entries || []).forEach(function (e) {
      var diff = (e.quantity || 0) - (parseFloat(e.expected_qty) || 0);
      lines.push([
        formatDateTime(e.created_at),
        e.user_id || '',
        e.zone || '',
        e.warehouse || WAREHOUSE,
        e.barcode || '',
        e.matricula || '',
        e.expiration_date || '',
        e.product_name || '',
        e.unit || 'CJ',
        e.quantity || 0,
        e.expected_qty || 0,
        diff,
        e.count_mode || '',
        e.count_number || 1
      ].map(csvEscape).join(';'));
    });
    return lines.join('\r\n');
  }

  global.PlatformInventarioCore = {
    WAREHOUSE: WAREHOUSE,
    MODE_LABELS: MODE_LABELS,
    MODE_DB: MODE_DB,
    pasilloFromLocation: pasilloFromLocation,
    isDoubleRackPasillo: isDoubleRackPasillo,
    rackTypeForPasillo: rackTypeForPasillo,
    pasilloCatalog: pasilloCatalog,
    isDoubleRackLocation: isDoubleRackLocation,
    rackTypeLabel: rackTypeLabel,
    levelFromLocation: levelFromLocation,
    isValidPickupLocation: isValidPickupLocation,
    flowStepsForMode: flowStepsForMode,
    buildEntryPayload: buildEntryPayload,
    entryMeta: entryMeta,
    formatDateTime: formatDateTime,
    entriesToCsv: entriesToCsv
  };
})(typeof window !== 'undefined' ? window : this);
