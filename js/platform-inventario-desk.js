/**
 * Inventario RF — escritorio web (Conciliación · Exactitud + Auditoría)
 * Lee conteos APK en vivo desde Supabase. No modifica la APK.
 */
(function (global) {
  'use strict';

  var CONC, SYNC, CORE, toastFn, escFn;

  var desk = {
    tab: 'cuadre',
    workspace: 'conciliacion',
    sistemaRows: [],
    meta: {},
    concRows: [],
    liveRows: [],
    stats: { ok: 0, revisar: 0, total: 0, accuracy: 0 },
    filters: {
      location: '', barcode: '', product: '', matricula: '', pack: '',
      qtySistema: '', qtyContada: '', status: '', userId: '', scannedAt: ''
    }
  };

  function $(id) { return document.getElementById(id); }

  function fmtQty(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    return isNaN(n) ? '—' : String(n);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return String(iso); }
  }

  function metaText() {
    if (desk.excelLoading) return 'Importando archivo…';
    if (desk.meta && desk.meta.loadError) {
      return (desk.meta.loadHint || 'Revise que sea «Inventario disponible» con columna Física disponible (CJ)');
    }
    if (!desk.meta || !desk.meta.fileName) {
      return 'Exporte «Inventario disponible» de Dynamics · se guarda en este navegador hasta reemplazarlo';
    }
    return (desk.meta.formatLabel || 'Excel') + ' · hoja «' + (desk.meta.sheet || '—') + '» · ' +
      desk.sistemaRows.length.toLocaleString('es-DO') + ' líneas CJ · importado ' +
      fmtDate(desk.meta.importedAt) + ' · guardado hasta cambiar';
  }

  function renderExcelCard() {
    var card = $('invDeskExcelCard');
    var nameEl = $('invDeskExcelName');
    var metaEl = $('invDeskExcelMeta');
    var badge = $('invDeskExcelBadge');
    var btnLoad = $('invBtnLoadSistema');
    var btnReplace = $('invBtnReplaceSistema');
    var btnClearSistema = $('invBtnClearSistema');
    var hasFile = !!(desk.meta && desk.meta.fileName && desk.sistemaRows.length);
    var loading = desk.excelLoading;
    if (card) {
      card.classList.toggle('is-loaded', hasFile && !loading);
      card.classList.toggle('is-loading', !!loading);
      card.classList.toggle('is-error', !!(desk.meta && desk.meta.loadError && !loading));
    }
    if (nameEl) {
      if (loading) nameEl.textContent = 'Leyendo Excel…';
      else if (hasFile) nameEl.textContent = desk.meta.fileName;
      else if (desk.meta && desk.meta.loadError) nameEl.textContent = 'No se pudo cargar el archivo';
      else nameEl.textContent = 'Sin inventario de sistema cargado';
    }
    if (metaEl) {
      if (loading) metaEl.textContent = 'Importando «Inventario disponible» — espere un momento';
      else metaEl.textContent = metaText();
    }
    if (badge) {
      if (loading) {
        badge.textContent = 'Cargando…';
        badge.className = 'inv-desk-excel-badge inv-desk-excel-badge--load';
      } else if (hasFile) {
        badge.textContent = '✓ ' + desk.sistemaRows.length.toLocaleString('es-DO') + ' líneas guardadas';
        badge.className = 'inv-desk-excel-badge inv-desk-excel-badge--ok';
      } else if (desk.meta && desk.meta.loadError) {
        badge.textContent = 'Error';
        badge.className = 'inv-desk-excel-badge inv-desk-excel-badge--err';
      } else {
        badge.textContent = 'Sin archivo';
        badge.className = 'inv-desk-excel-badge';
      }
    }
    if (btnLoad) {
      btnLoad.disabled = !!loading;
      btnLoad.textContent = loading ? 'Importando…' : (hasFile ? 'Cargar otro' : 'Cargar Excel');
    }
    if (btnReplace) {
      btnReplace.hidden = !hasFile || !!loading;
      btnReplace.disabled = !!loading;
    }
    if (btnClearSistema) {
      btnClearSistema.hidden = !hasFile || !!loading;
      btnClearSistema.disabled = !!loading;
    }
  }

  function setExcelLoading(on) {
    desk.excelLoading = !!on;
    renderExcelCard();
  }

  function ensureXlsx() {
    return new Promise(function (resolve, reject) {
      if (global.XLSX) { resolve(global.XLSX); return; }
      var tries = 0;
      var timer = global.setInterval(function () {
        tries++;
        if (global.XLSX) {
          global.clearInterval(timer);
          resolve(global.XLSX);
        } else if (tries > 80) {
          global.clearInterval(timer);
          reject(new Error('SheetJS no cargó'));
        }
      }, 100);
    });
  }

  function applyParsedExcel(parsed, fileName) {
    desk.sistemaRows = parsed.rows || [];
    desk.meta = parsed.meta || {};
    desk.meta.fileName = desk.meta.fileName || fileName || '';
    desk.meta.count = desk.sistemaRows.length;
    if (desk.sistemaRows.length === 0) {
      desk.meta.loadError = true;
      var hdr = (desk.meta.headers || []).slice(0, 6).join(' · ');
      desk.meta.loadHint = hdr
        ? ('Columnas detectadas: ' + hdr)
        : 'Use export «Inventario disponible» de Dynamics (Física disponible · CJ)';
    } else {
      desk.meta.loadError = false;
      desk.meta.loadHint = '';
    }
    var saved = CONC.saveSistemaCache(desk.sistemaRows, desk.meta);
    if (!saved.ok) {
      toastFn('Importado en memoria (' + desk.sistemaRows.length + ' líneas) pero no se guardó: ' + saved.error, 'err');
    }
    desk.tab = 'sistema';
    desk.concRows = CONC.buildConciliation(desk.sistemaRows, CONC.aggregateScans([]));
    desk.stats = CONC.dashboardStats(desk.concRows);
    renderDesk();
    if (desk.sistemaRows.length === 0) {
      toastFn('0 líneas CJ encontradas. ' + (desk.meta.loadHint || 'Revise columnas del Excel.'), 'err');
    } else {
      toastFn('✓ ' + desk.sistemaRows.length.toLocaleString('es-DO') + ' líneas · guardado' + (saved.ok ? ' en navegador' : ' (solo sesión)'), 'ok');
    }
  }

  function renderAccVisual() {
    var s = desk.stats;
    var pct = s.total ? s.accuracy : 0;
    var ring = $('invDeskAccRing');
    var ringVal = $('invDeskAccRingVal');
    var bar = $('invDeskAccBar');
    if (ring) ring.style.setProperty('--acc-pct', String(pct));
    if (ringVal) ringVal.textContent = s.total ? (s.accuracy + '%') : '—';
    if (bar) bar.style.width = (s.total ? s.accuracy : 0) + '%';
  }

  function renderTabHint() {
    var el = $('invDeskTabHint');
    if (!el) return;
    if (desk.tab === 'vivo') {
      el.textContent = 'Ubicaciones que van contando en piso ahora mismo (último registro por ubicación · CJ).';
    } else if (desk.tab === 'sistema') {
      el.textContent = hasSistema()
        ? 'Inventario exportado de Dynamics guardado localmente (' + desk.sistemaRows.length + ' líneas).'
        : 'Cargue el Excel «Inventario disponible» — quedará guardado hasta que lo reemplace.';
    } else if (desk.workspace === 'auditoria') {
      el.textContent = 'Solo ubicaciones REVISAR · compare con el Excel de sistema y el conteo en vivo.';
    } else {
      el.textContent = 'Cuadre automático: Ok = coincide en CJ · Revisar = diferencia, sin conteo o extra.';
    }
  }

  function hasSistema() {
    return !!(desk.sistemaRows && desk.sistemaRows.length);
  }

  function renderKpis() {
    var s = desk.stats;
    if ($('invDeskKpiOk')) $('invDeskKpiOk').textContent = String(s.ok);
    if ($('invDeskKpiRev')) $('invDeskKpiRev').textContent = String(s.revisar);
    if ($('invDeskKpiTotal')) $('invDeskKpiTotal').textContent = String(s.total);
    if ($('invDeskKpiAcc')) $('invDeskKpiAcc').textContent = s.total ? (s.accuracy + '%') : '—';
    if ($('invDeskKpiLive')) $('invDeskKpiLive').textContent = String((desk.liveRows || []).length);
    renderExcelCard();
    renderAccVisual();
    renderTabHint();
    var live = $('invDeskLive');
    if (live) {
      live.textContent = SYNC && SYNC.isOnline && SYNC.isOnline() ? '● Conteo en vivo' : '○ Sin enlace en vivo';
      live.classList.toggle('is-on', !!(SYNC && SYNC.isOnline && SYNC.isOnline()));
    }
  }

  function filterMatch(val, q) {
    if (!q) return true;
    return String(val == null ? '' : val) === String(q);
  }

  var PASILLO_FILTER_PREFIX = '__pasillo__:';

  function pasilloFromLocation(loc) {
    if (CORE && CORE.pasilloFromLocation) return CORE.pasilloFromLocation(loc);
    var parts = String(loc || '').trim().split('-');
    var m = /^[A-Za-z](\d{3})$/i.exec((parts[0] || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return n >= 1 && n <= 999 ? n : null;
  }

  function pasilloFilterValue(n) {
    return PASILLO_FILTER_PREFIX + n;
  }

  function pasilloFilterLabel(n, count) {
    var tipo = rackTypeLabelForPasillo(n);
    var label = tipo + ' · Pasillo ' + n;
    if (count != null && count > 0) label += ' (' + count + ')';
    return label;
  }

  function rackTypeLabelForPasillo(p) {
    if (CORE && CORE.rackTypeForPasillo) return CORE.rackTypeForPasillo(p);
    var dob = { 1:1,2:1,3:1,4:1,5:1,12:1,13:1,14:1,15:1,16:1,18:1,23:1,24:1,26:1,27:1,37:1,38:1,39:1,40:1,41:1 };
    return dob[p] ? 'Doble Rick' : 'Sencillo';
  }

  function pasilloCatalogList() {
    if (CORE && CORE.pasilloCatalog) return CORE.pasilloCatalog();
    var list = [];
    for (var p = 1; p <= 41; p++) {
      list.push({ pasillo: p, tipo: rackTypeLabelForPasillo(p) });
    }
    return list;
  }

  function pasilloRowCount(rows, p) {
    var n = 0;
    (rows || []).forEach(function (r) {
      if (pasilloFromLocation(r.location) === p) n++;
    });
    return n;
  }

  function parsePasilloFilter(val) {
    if (!val || String(val).indexOf(PASILLO_FILTER_PREFIX) !== 0) return null;
    var n = parseInt(String(val).slice(PASILLO_FILTER_PREFIX.length), 10);
    return isNaN(n) ? null : n;
  }

  function locationFilterMatch(row, filterVal) {
    if (!filterVal) return true;
    var pasillo = parsePasilloFilter(filterVal);
    if (pasillo != null) return pasilloFromLocation(row.location) === pasillo;
    return String(row.location == null ? '' : row.location) === String(filterVal);
  }

  function rowMatchesFilters(r, f, skipKey) {
    return Object.keys(f).every(function (key) {
      if (skipKey && key === skipKey) return true;
      if (key === 'location') return locationFilterMatch(r, f[key]);
      return filterMatch(rowFilterValue(r, key), f[key]);
    });
  }

  function rowsForFilterOptions(excludeKey) {
    return rowsForTab().filter(function (r) {
      return rowMatchesFilters(r, desk.filters, excludeKey);
    });
  }

  function rowFilterValue(r, key) {
    if (key === 'qtySistema') return fmtQty(r.qtySistema);
    if (key === 'qtyContada') return fmtQty(r.qtyContada);
    if (key === 'scannedAt') return fmtDate(r.scannedAt);
    return String(r[key] == null ? '' : r[key]);
  }

  function uniqueFilterValues(rows, key) {
    if (key === 'location') return uniqueLocationFilterValues(rows);
    var seen = {};
    var list = [];
    (rows || []).forEach(function (r) {
      var v = rowFilterValue(r, key);
      if (!v || v === '—' || seen[v]) return;
      seen[v] = true;
      list.push({ value: v, label: v });
    });
    list.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label), 'es', { numeric: true, sensitivity: 'base' });
    });
    return list;
  }

  function uniqueLocationFilterValues(rows) {
    var out = [];
    var catalog = pasilloCatalogList();
    catalog.forEach(function (item) {
      if (item.tipo !== 'Doble Rick') return;
      var c = pasilloRowCount(rows, item.pasillo);
      out.push({
        value: pasilloFilterValue(item.pasillo),
        label: pasilloFilterLabel(item.pasillo, c),
        group: 'doble'
      });
    });
    catalog.forEach(function (item) {
      if (item.tipo !== 'Sencillo') return;
      var c = pasilloRowCount(rows, item.pasillo);
      out.push({
        value: pasilloFilterValue(item.pasillo),
        label: pasilloFilterLabel(item.pasillo, c),
        group: 'sencillo'
      });
    });
    var locCounts = {};
    (rows || []).forEach(function (r) {
      var loc = String(r.location || '').trim();
      if (!loc) return;
      locCounts[loc] = (locCounts[loc] || 0) + 1;
    });
    Object.keys(locCounts).sort(function (a, b) {
      return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
    }).forEach(function (loc) {
      var c = locCounts[loc];
      out.push({
        value: loc,
        label: c > 1 ? (loc + ' (' + c + ' líneas)') : loc,
        group: 'ubicacion'
      });
    });
    return out;
  }

  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function populateFilterSelects() {
    Object.keys(desk.filters).forEach(function (key) {
      var sel = document.querySelector('.inv-sheet-filter[data-filter="' + key + '"]');
      if (!sel) return;
      var current = desk.filters[key] || '';
      var pool = rowsForFilterOptions(key);
      var vals = uniqueFilterValues(pool, key);
      var html = '<option value="">Todos (' + pool.length + ')</option>';
      if (key === 'location') {
        var dobres = vals.filter(function (v) { return v.group === 'doble'; });
        var sencillos = vals.filter(function (v) { return v.group === 'sencillo'; });
        var ubicaciones = vals.filter(function (v) { return v.group === 'ubicacion'; });
        if (dobres.length) {
          html += '<optgroup label="Doble Rick">';
          dobres.forEach(function (v) {
            html += '<option value="' + escAttr(v.value) + '">' + escFn(v.label) + '</option>';
          });
          html += '</optgroup>';
        }
        if (sencillos.length) {
          html += '<optgroup label="Sencillo">';
          sencillos.forEach(function (v) {
            html += '<option value="' + escAttr(v.value) + '">' + escFn(v.label) + '</option>';
          });
          html += '</optgroup>';
        }
        if (ubicaciones.length) {
          html += '<optgroup label="Ubicación exacta">';
          ubicaciones.forEach(function (v) {
            html += '<option value="' + escAttr(v.value) + '">' + escFn(v.label) + '</option>';
          });
          html += '</optgroup>';
        }
      } else {
        vals.forEach(function (v) {
          html += '<option value="' + escAttr(v.value) + '">' + escFn(v.label) + '</option>';
        });
      }
      sel.innerHTML = html;
      var valid = vals.some(function (v) { return v.value === current; });
      if (current && valid) sel.value = current;
      else {
        sel.value = '';
        desk.filters[key] = '';
      }
    });
    updateFilterUi();
  }

  function applyRowFilters(rows) {
    var f = desk.filters;
    return (rows || []).filter(function (r) {
      return locationFilterMatch(r, f.location) &&
        filterMatch(rowFilterValue(r, 'barcode'), f.barcode) &&
        filterMatch(rowFilterValue(r, 'product'), f.product) &&
        filterMatch(rowFilterValue(r, 'matricula'), f.matricula) &&
        filterMatch(rowFilterValue(r, 'pack'), f.pack) &&
        filterMatch(rowFilterValue(r, 'qtySistema'), f.qtySistema) &&
        filterMatch(rowFilterValue(r, 'qtyContada'), f.qtyContada) &&
        filterMatch(rowFilterValue(r, 'status'), f.status) &&
        filterMatch(rowFilterValue(r, 'userId'), f.userId) &&
        filterMatch(rowFilterValue(r, 'scannedAt'), f.scannedAt);
    });
  }

  function hasActiveFilters() {
    return Object.keys(desk.filters).some(function (k) { return !!desk.filters[k]; });
  }

  function clearFilters() {
    Object.keys(desk.filters).forEach(function (k) { desk.filters[k] = ''; });
    populateFilterSelects();
    renderTable();
  }

  function updateFilterUi() {
    var btn = $('invBtnClearFilters');
    if (btn) btn.hidden = !hasActiveFilters();
  }

  function rowsForTab() {
    if (desk.tab === 'vivo') {
      return desk.liveRows.map(function (r) {
        return {
          location: r.location,
          barcode: r.barcode,
          product: r.product,
          matricula: r.matricula,
          pack: r.pack || 'CJ',
          qtySistema: null,
          qtyContada: r.qtyCj,
          status: 'EN VIVO',
          userId: r.userId,
          scannedAt: r.scannedAt
        };
      });
    }
    if (desk.tab === 'sistema') {
      return desk.sistemaRows.map(function (r) {
        return {
          location: r.location,
          barcode: r.barcode,
          product: r.product,
          matricula: r.matricula,
          pack: r.pack || 'CJ',
          qtySistema: r.qtyCj,
          qtyContada: null,
          status: 'SISTEMA',
          userId: '',
          scannedAt: ''
        };
      });
    }
    if (desk.workspace === 'auditoria') {
      return CONC.filterRows(desk.concRows, 'revisar');
    }
    return desk.concRows;
  }

  function renderTable() {
    var tbody = $('invDeskTbody');
    if (!tbody) return;
    var allRows = rowsForTab();
    var rows = applyRowFilters(allRows);
    var countEl = $('invDeskRowCount');
    if (countEl) {
      countEl.textContent = rows.length === allRows.length
        ? rows.length.toLocaleString('es-DO') + ' filas'
        : rows.length.toLocaleString('es-DO') + ' de ' + allRows.length.toLocaleString('es-DO') + ' filas';
    }
    updateFilterUi();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="inv-empty">' +
        (allRows.length ? 'Ninguna fila coincide con el filtro.' : 'Sin datos para esta vista.') +
        '</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var rowCls = 'row-live';
      if (r.status === 'Ok') rowCls = 'row-ok';
      else if (r.status === 'REVISAR') rowCls = 'row-revisar';
      var stCls = r.status === 'Ok' ? 'st-ok' : (r.status === 'REVISAR' ? 'st-revisar' : '');
      var qtyCls = (desk.tab === 'cuadre' && r.status === 'REVISAR') ? ' num qty-hi' : ' num';
      return '<tr class="' + rowCls + '">' +
        '<td>' + escFn(r.location) + '</td>' +
        '<td>' + escFn(r.barcode) + '</td>' +
        '<td>' + escFn(r.product) + '</td>' +
        '<td>' + escFn(r.matricula) + '</td>' +
        '<td>' + escFn(r.pack) + '</td>' +
        '<td class="num">' + fmtQty(r.qtySistema) + '</td>' +
        '<td class="' + qtyCls.trim() + '">' + fmtQty(r.qtyContada) + '</td>' +
        '<td class="' + stCls + '">' + escFn(r.status) + '</td>' +
        '<td>' + escFn(r.userId) + '</td>' +
        '<td>' + fmtDate(r.scannedAt) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderDesk() {
    renderKpis();
    document.querySelectorAll('.inv-desk-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-desk-tab') === desk.tab);
    });
    var title = $('invDeskTitle');
    var sub = $('invDeskSub');
    var logo = $('invDeskLogo');
    if (desk.workspace === 'auditoria') {
      if (title) title.textContent = 'Auditoría de conteo';
      if (sub) sub.textContent = 'Ubicaciones REVISAR · supervisión en tiempo real';
      if (logo) logo.src = 'assets/img/icon-auditoria.svg?v=1';
    } else {
      if (title) title.textContent = 'Conciliación · Exactitud';
      if (sub) sub.textContent = 'Dashboard de exactitud · sistema vs conteo CJ';
      if (logo) logo.src = 'assets/img/icon-exactitud.svg?v=1';
    }
    populateFilterSelects();
    renderTable();
  }

  function refreshDesk() {
    if (!SYNC || !CONC) return Promise.resolve();
    return SYNC.fetchEntries().then(function (entries) {
      var scanMap = CONC.aggregateScans(entries);
      desk.liveRows = CONC.scansToLiveRows(scanMap);
      desk.concRows = CONC.buildConciliation(desk.sistemaRows, scanMap);
      desk.stats = CONC.dashboardStats(desk.concRows);
      renderDesk();
    }).catch(function () {
      desk.concRows = CONC.buildConciliation(desk.sistemaRows, {});
      desk.stats = CONC.dashboardStats(desk.concRows);
      renderDesk();
    });
  }

  function setDeskTab(tab) {
    desk.tab = tab;
    renderDesk();
  }

  function setWorkspace(ws) {
    desk.workspace = ws || 'conciliacion';
    if (desk.workspace === 'auditoria') desk.tab = 'cuadre';
  }

  function clearSistemaInventory() {
    if (!CONC) return;
    var hasFile = !!(desk.sistemaRows.length || (desk.meta && desk.meta.fileName));
    if (!hasFile) {
      toastFn('No hay inventario de sistema guardado', 'err');
      return;
    }
    var name = (desk.meta && desk.meta.fileName) ? desk.meta.fileName : 'inventario guardado';
    if (!global.confirm('¿Eliminar «' + name + '» de este navegador?\n\nEl cuadre quedará sin datos de sistema hasta cargar un Excel nuevo.')) return;
    var cleared = CONC.clearSistemaCache();
    desk.sistemaRows = [];
    desk.meta = {};
    desk.tab = 'cuadre';
    Object.keys(desk.filters).forEach(function (k) { desk.filters[k] = ''; });
    if (!cleared.ok) {
      toastFn('Inventario borrado en pantalla pero no del almacenamiento: ' + cleared.error, 'err');
    } else {
      toastFn('Inventario de sistema eliminado', 'ok');
    }
    refreshDesk();
  }

  function loadSistemaFile(file) {
    if (!file || !CONC) return;
    setExcelLoading(true);
    ensureXlsx().then(function () {
      var reader = new FileReader();
      reader.onerror = function () {
        setExcelLoading(false);
        toastFn('No se pudo leer el archivo', 'err');
      };
      reader.onload = function () {
        try {
          var wb = global.XLSX.read(reader.result, { type: 'array', cellDates: false });
          var parsed = CONC.parseWorkbook(wb, file.name);
          setExcelLoading(false);
          applyParsedExcel(parsed, file.name);
          refreshDesk();
        } catch (e) {
          setExcelLoading(false);
          desk.meta = { fileName: file.name, loadError: true, loadHint: String(e.message || 'Formato no válido') };
          renderExcelCard();
          toastFn('No se pudo leer el Excel: ' + (e.message || 'error'), 'err');
        }
      };
      reader.readAsArrayBuffer(file);
    }).catch(function () {
      setExcelLoading(false);
      toastFn('Biblioteca Excel aún no cargó. Espere 2 segundos e intente de nuevo.', 'err');
    });
  }

  function exportCuadre() {
    var rows = desk.workspace === 'auditoria'
      ? CONC.filterRows(desk.concRows, 'revisar')
      : desk.concRows;
    if (!rows.length) {
      toastFn('No hay datos para exportar', 'err');
      return;
    }
    var name = 'cuadre-inventario-dc-' + new Date().toISOString().slice(0, 10);
    if (CONC.exportCuadreXlsx(rows, name + '.xlsx')) {
      toastFn('Excel exportado', 'ok');
      return;
    }
    var csv = CONC.exportCuadreCsv(rows);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.csv';
    a.click();
    toastFn('CSV exportado', 'ok');
  }

  function bindFilterEvents() {
    document.querySelectorAll('.inv-sheet-filter').forEach(function (sel) {
      if (sel.dataset.bound) return;
      sel.dataset.bound = '1';
      sel.addEventListener('change', function () {
        var key = sel.getAttribute('data-filter');
        if (key && desk.filters.hasOwnProperty(key)) desk.filters[key] = sel.value || '';
        populateFilterSelects();
        renderTable();
      });
    });
    var btnClear = $('invBtnClearFilters');
    if (btnClear && !btnClear.dataset.bound) {
      btnClear.dataset.bound = '1';
      btnClear.addEventListener('click', clearFilters);
    }
  }

  function bindDeskEvents() {
    document.querySelectorAll('[data-desk-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setDeskTab(btn.getAttribute('data-desk-tab'));
      });
    });
    var fileInput = $('invSistemaFile');
    var btnLoad = $('invBtnLoadSistema');
    var btnReplace = $('invBtnReplaceSistema');
    var btnClearSistema = $('invBtnClearSistema');
    if (btnLoad && fileInput) {
      btnLoad.addEventListener('click', function () { fileInput.click(); });
      if (btnReplace) btnReplace.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadSistemaFile(fileInput.files[0]);
        fileInput.value = '';
      });
    }
    if (btnClearSistema) btnClearSistema.addEventListener('click', clearSistemaInventory);
    var btnExport = $('invBtnExportCuadre');
    if (btnExport) btnExport.addEventListener('click', exportCuadre);
    var btnRefresh = $('invBtnRefreshDesk');
    if (btnRefresh) btnRefresh.addEventListener('click', function () { refreshDesk(); });
  }

  function init(deps) {
    CONC = deps.CONC;
    SYNC = deps.SYNC;
    CORE = deps.CORE;
    toastFn = deps.toast || function () {};
    escFn = deps.esc || function (s) { return String(s || ''); };
    bindDeskEvents();
    bindFilterEvents();
    var cached = CONC.loadSistemaCache();
    desk.sistemaRows = cached.rows || [];
    desk.meta = cached.meta || {};
    if (desk.sistemaRows.length && desk.meta.fileName) {
      desk.meta.count = desk.sistemaRows.length;
    }
  }

  function deskShell() {
    return $('ixApp') || $('invApp');
  }

  function showDesk(workspace) {
    setWorkspace(workspace);
    var shell = deskShell();
    if (shell) shell.classList.add('inv-app-shell--desk');
    var concEl = $('invViewConciliacion');
    if (concEl) concEl.hidden = false;
    desk.tab = workspace === 'auditoria' ? 'cuadre' : desk.tab;
    refreshDesk();
  }

  function hideDeskLayout() {
    var shell = deskShell();
    if (shell) shell.classList.remove('inv-app-shell--desk');
    var concEl = $('invViewConciliacion');
    if (concEl) concEl.hidden = true;
  }

  global.PlatformInventarioDesk = {
    init: init,
    refreshDesk: refreshDesk,
    showDesk: showDesk,
    hideDeskLayout: hideDeskLayout,
    setWorkspace: setWorkspace
  };
})(typeof window !== 'undefined' ? window : this);
