/**
 * Parser — Planilla Excel «Reporte Diario» (Recepción)
 */
(function (global) {
  'use strict';

  var SHEET_NAME = 'Reporte Diario';
  var XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  var EXPECTED_HEADERS = [
    'NO.',
    'FECHA LLEGADA',
    'FECHA DESCARGA',
    'Bahias',
    '# CONT. / FACTURA',
    '# OC/OT',
    '#IDC',
    'Turno',
    'ARTICULO',
    'Fecha de vencimiento',
    'VIDA UTIL (DIAS)',
    'DESCARGADO',
    'VALIDADO',
    'REMISION',
    'NO.REMISION',
    'MUELLE',
    'OPERADOR',
    'VALIDADOR',
    'UBICADOR',
    'DIGITADOR',
    'TIPO',
    'PALETA',
    'HORA RAMPA',
    'COMENTARIOS'
  ];

  var MONTHS_ES = {
    ene: 1, enero: 1,
    feb: 2, febrero: 2,
    mar: 3, marzo: 3,
    abr: 4, abril: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6,
    jul: 7, julio: 7,
    ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9,
    oct: 10, octubre: 10,
    nov: 11, noviembre: 11,
    dic: 12, diciembre: 12
  };

  function normHeader(h) {
    return String(h || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-rec-xlsx]');
      if (existing && global.XLSX) {
        resolve(global.XLSX);
        return;
      }
      if (existing) {
        existing.addEventListener('load', function () {
          if (global.XLSX) resolve(global.XLSX);
          else reject(new Error('SheetJS no disponible'));
        });
        existing.addEventListener('error', function () {
          reject(new Error('No se pudo cargar SheetJS'));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.recXlsx = '1';
      s.onload = function () {
        if (global.XLSX) resolve(global.XLSX);
        else reject(new Error('SheetJS no disponible'));
      };
      s.onerror = function () { reject(new Error('No se pudo cargar SheetJS')); };
      document.head.appendChild(s);
    });
  }

  function ensureXlsx() {
    if (global.XLSX) return Promise.resolve(global.XLSX);
    return loadScriptOnce(XLSX_CDN);
  }

  function looksDrmEncrypted(buf) {
    if (!buf || buf.byteLength < 8) return false;
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // OLE compound magic
    if (!(u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0)) return false;
    try {
      var ascii = '';
      var lim = Math.min(u8.length, 65536);
      for (var i = 0; i < lim; i++) ascii += String.fromCharCode(u8[i]);
      return /EncryptedPackage/i.test(ascii) || /DRMEncrypted/i.test(ascii);
    } catch (e) {
      return true;
    }
  }

  function cellText(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
      var dd = String(v.getDate()).padStart(2, '0');
      var mm = String(v.getMonth() + 1).padStart(2, '0');
      return dd + '/' + mm + '/' + v.getFullYear();
    }
    return String(v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function findSheet(wb) {
    var names = wb.SheetNames || [];
    var i;
    for (i = 0; i < names.length; i++) {
      if (normHeader(names[i]) === normHeader(SHEET_NAME)) return names[i];
    }
    for (i = 0; i < names.length; i++) {
      if (/reporte\s*diario/i.test(names[i]) && !/no\s*usar/i.test(names[i])) return names[i];
    }
    return null;
  }

  function findHeaderRow(matrix) {
    var want = EXPECTED_HEADERS.map(normHeader);
    var best = { idx: -1, score: 0, map: [] };
    var maxScan = Math.min(40, matrix.length);
    for (var r = 0; r < maxScan; r++) {
      var row = matrix[r] || [];
      var map = [];
      var score = 0;
      for (var c = 0; c < row.length; c++) {
        var nh = normHeader(row[c]);
        if (!nh) continue;
        var hi = want.indexOf(nh);
        if (hi >= 0 && map[hi] == null) {
          map[hi] = c;
          score += 1;
        }
      }
      if (score > best.score) best = { idx: r, score: score, map: map };
      if (score >= 10) break;
    }
    if (best.score < 8) return null;
    return best;
  }

  function parseFlexibleDate(raw) {
    var s = cellText(raw);
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    var m1 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m1) {
      var d = parseInt(m1[1], 10);
      var mo = parseInt(m1[2], 10);
      var y = parseInt(m1[3], 10);
      if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }

    var m2 = s.match(/^(\d{1,2})\s*[-–]\s*([A-Za-zÁÉÍÓÚáéíóúñÑ.]+)\s*[-–.]?\s*(\d{2,4})$/);
    if (m2) {
      var day = parseInt(m2[1], 10);
      var monKey = normHeader(m2[2]).replace(/\./g, '');
      var month = MONTHS_ES[monKey];
      var year = parseInt(m2[3], 10);
      if (year < 100) year += 2000;
      if (month && day >= 1 && day <= 31) {
        return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
    }

    var t = Date.parse(s);
    if (!isNaN(t)) {
      var dt = new Date(t);
      return dt.getFullYear() + '-' +
        String(dt.getMonth() + 1).padStart(2, '0') + '-' +
        String(dt.getDate()).padStart(2, '0');
    }
    return null;
  }

  function rowHasData(values) {
    for (var i = 0; i < values.length; i++) {
      if (String(values[i] || '').trim()) return true;
    }
    return false;
  }

  function matrixFromSheet(ws, XLSX) {
    return XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    }) || [];
  }

  function parseWorkbook(wb, fileName) {
    var sheetName = findSheet(wb);
    if (!sheetName) {
      return {
        ok: false,
        error: 'No se encontró la hoja «Reporte Diario». Hojas: ' +
          ((wb.SheetNames || []).join(', ') || 'ninguna') + '.'
      };
    }
    var XLSX = global.XLSX;
    var matrix = matrixFromSheet(wb.Sheets[sheetName], XLSX);
    var found = findHeaderRow(matrix);
    if (!found) {
      return {
        ok: false,
        error: 'En «Reporte Diario» no se reconocieron los encabezados esperados.'
      };
    }

    var headers = EXPECTED_HEADERS.slice();
    var rows = [];
    var emptyStreak = 0;
    for (var r = found.idx + 1; r < matrix.length; r++) {
      var raw = matrix[r] || [];
      var values = headers.map(function (_h, hi) {
        var col = found.map[hi];
        return col == null ? '' : cellText(raw[col]);
      });
      if (!rowHasData(values)) {
        emptyStreak += 1;
        if (emptyStreak > 40) break;
        continue;
      }
      emptyStreak = 0;
      // Skip leftover title/summary rows
      if (!/^\d+$/.test(String(values[0] || '').trim()) && !values[4] && !values[8]) {
        continue;
      }
      var fechaDescarga = parseFlexibleDate(values[2]);
      var fechaLlegada = parseFlexibleDate(values[1]);
      rows.push({
        values: values,
        fechaKey: fechaDescarga || fechaLlegada || '',
        fechaLlegadaKey: fechaLlegada || '',
        fechaDescargaKey: fechaDescarga || ''
      });
    }

    if (!rows.length) {
      return { ok: false, error: 'La hoja «Reporte Diario» no tiene filas de datos.' };
    }

    return {
      ok: true,
      fileName: fileName || 'planilla.xlsx',
      sheet: sheetName,
      headers: headers,
      rows: rows
    };
  }

  function parseArrayBuffer(buf, fileName) {
    if (looksDrmEncrypted(buf)) {
      return Promise.resolve({
        ok: false,
        error: 'Este Excel tiene protección DRM corporativa y el navegador no puede leerlo. En Excel: Archivo → Guardar una copia → Libro de Excel (.xlsx) sin restricción, o exporta solo la hoja «Reporte Diario» a CSV e impórtala aquí.'
      });
    }
    return ensureXlsx().then(function (XLSX) {
      try {
        var wb = XLSX.read(buf, { type: 'array', cellDates: true });
        return parseWorkbook(wb, fileName);
      } catch (e) {
        var msg = String((e && e.message) || e || '');
        if (/Encrypt|DRM|password/i.test(msg) || looksDrmEncrypted(buf)) {
          return {
            ok: false,
            error: 'No se pudo leer el archivo (protección DRM o cifrado). Guarda una copia .xlsx sin restricción o un CSV de «Reporte Diario».'
          };
        }
        return { ok: false, error: 'No se pudo leer el Excel: ' + msg };
      }
    });
  }

  function parseFile(file) {
    if (!file) return Promise.resolve({ ok: false, error: 'Seleccione un archivo.' });
    var name = String(file.name || '').toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(name)) {
      return Promise.resolve({ ok: false, error: 'Solo se admiten archivos .xlsx, .xls o .csv.' });
    }
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var buf = reader.result;
        if (/\.csv$/i.test(name)) {
          ensureXlsx().then(function (XLSX) {
            try {
              var text = '';
              if (typeof buf === 'string') text = buf;
              else text = new TextDecoder('utf-8').decode(new Uint8Array(buf));
              // fallback latin1 if lots of replacement chars
              if (text.indexOf('\ufffd') >= 0) {
                text = new TextDecoder('windows-1252').decode(new Uint8Array(reader.result));
              }
              var wb = XLSX.read(text, { type: 'string', FS: ';' });
              // If few columns, retry comma
              var first = wb.SheetNames[0];
              var probe = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1 })[2] || [];
              if (probe.length < 8) {
                wb = XLSX.read(text, { type: 'string', FS: ',' });
              }
              // Force sheet name recognition for single-sheet CSV
              if (wb.SheetNames.length === 1) {
                wb.Sheets[SHEET_NAME] = wb.Sheets[wb.SheetNames[0]];
                wb.SheetNames = [SHEET_NAME];
              }
              resolve(parseWorkbook(wb, file.name));
            } catch (e) {
              resolve({ ok: false, error: 'No se pudo leer el CSV: ' + String((e && e.message) || e) });
            }
          }).catch(function (e) {
            resolve({ ok: false, error: String((e && e.message) || e) });
          });
          return;
        }
        parseArrayBuffer(buf, file.name).then(resolve);
      };
      reader.onerror = function () {
        resolve({ ok: false, error: 'No se pudo abrir el archivo.' });
      };
      if (/\.csv$/i.test(name)) reader.readAsArrayBuffer(file);
      else reader.readAsArrayBuffer(file);
    });
  }

  global.PlatformRecepcionPlanilla = {
    SHEET_NAME: SHEET_NAME,
    EXPECTED_HEADERS: EXPECTED_HEADERS,
    parseFile: parseFile,
    parseFlexibleDate: parseFlexibleDate,
    normHeader: normHeader
  };
})(typeof window !== 'undefined' ? window : this);
