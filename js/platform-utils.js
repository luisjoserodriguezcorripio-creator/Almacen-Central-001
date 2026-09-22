/**
 * Utilidades compartidas — fechas, tablas, permisos UI
 */
(function (global) {
  'use strict';

  function compareDateIso(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function sortByDateAsc(list, key) {
    return (list || []).slice().sort(function (a, b) {
      return compareDateIso(a[key], b[key]);
    });
  }

  function sortDateKeysAsc(keys) {
    return (keys || []).slice().sort(compareDateIso);
  }

  function heatLevel(value, max) {
    if (!max || value <= 0) return 0;
    return Math.min(5, Math.ceil((value / max) * 5));
  }

  function bindSortableTable(tableEl) {
    if (!tableEl) return;
    var thead = tableEl.querySelector('thead');
    if (!thead || thead.dataset.sortBound) return;
    thead.dataset.sortBound = '1';
    thead.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.style.cursor = 'pointer';
      th.title = 'Ordenar';
      th.addEventListener('click', function () {
        var col = parseInt(th.getAttribute('data-sort'), 10);
        var tbody = tableEl.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        var dir = th.getAttribute('data-dir') === 'asc' ? 'desc' : 'asc';
        thead.querySelectorAll('th[data-sort]').forEach(function (h) {
          h.removeAttribute('data-dir');
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.setAttribute('data-dir', dir);
        th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');
        rows.sort(function (ra, rb) {
          var av = (ra.children[col] && ra.children[col].textContent) || '';
          var bv = (rb.children[col] && rb.children[col].textContent) || '';
          var an = parseFloat(av.replace(/[^0-9.,\-]/g, '').replace(',', '.'));
          var bn = parseFloat(bv.replace(/[^0-9.,\-]/g, '').replace(',', '.'));
          if (isFinite(an) && isFinite(bn)) {
            return dir === 'asc' ? an - bn : bn - an;
          }
          return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
      });
    });
  }

  function formatCompact(n) {
    var num = Number(n);
    if (!isFinite(num)) return String(n || '—');
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(num));
  }

  function applyRoleUi(user) {
    var role = user ? user.role : '';
    var canExport = global.PlatformAdmin && global.PlatformAdmin.can(role, 'export.data', user);
    var canImport = global.PlatformAdmin && global.PlatformAdmin.can(role, 'data.import', user);
    var canAdmin = global.PlatformAdmin && global.PlatformAdmin.canAccessAdminModal(user);
    document.querySelectorAll('[data-perm="export.data"]').forEach(function (el) {
      el.classList.toggle('perm-denied', !canExport);
    });
    document.querySelectorAll('[data-perm="data.import"]').forEach(function (el) {
      el.classList.toggle('perm-denied', !canImport);
    });
    document.querySelectorAll('[data-perm="admin.panel"]').forEach(function (el) {
      el.classList.toggle('perm-denied', !canAdmin);
    });
    if (role === 'operador') {
      document.body.classList.add('role-operador');
    } else {
      document.body.classList.remove('role-operador');
    }
  }

  var SITE = {
    warehouse: '300-001 (CENTRAL)',
    product: 'Almacén Central 001',
    shortLabel: '300-001 CENTRAL',
    code: '300-001'
  };

  global.PlatformSite = SITE;
  global.PlatformUtils = {
    compareDateIso: compareDateIso,
    sortByDateAsc: sortByDateAsc,
    sortDateKeysAsc: sortDateKeysAsc,
    heatLevel: heatLevel,
    formatCompact: formatCompact,
    bindSortableTable: bindSortableTable,
    applyRoleUi: applyRoleUi
  };
})(typeof window !== 'undefined' ? window : this);
