/**
 * Diseño del centro de mando y diapositivas TV — agregar, quitar y ordenar
 */
(function (global) {
  'use strict';

  var esc = global.PanelCore ? global.PanelCore.esc : function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  var CARD_CATALOG = {
    ops: { id: 'ops', title: 'Operaciones', icon: '⬡', jump: 'operaciones', statusLabel: 'Operación' },
    fac: { id: 'fac', title: 'Facturas', icon: '$', jump: 'facturas', statusLabel: 'Facturas' },
    desp: { id: 'desp', title: 'Despacho', icon: '🚚', jump: 'despacho', statusLabel: 'Despacho' }
  };

  var TV_SLIDE_CATALOG = {
    ops: { id: 'ops', label: 'Operación', segLabel: 'Operación' },
    fac: { id: 'fac', label: 'Facturas', segLabel: 'Facturas' },
    desp: { id: 'desp', label: 'Despacho', segLabel: 'Despacho' }
  };

  var DEFAULT_GENERAL_LAYOUT = [
    { id: 'ops', enabled: true, order: 0 },
    { id: 'fac', enabled: true, order: 1 },
    { id: 'desp', enabled: true, order: 2 }
  ];

  var DEFAULT_TV_LAYOUT = [
    { id: 'ops', enabled: true, order: 0 },
    { id: 'fac', enabled: true, order: 1 },
    { id: 'desp', enabled: true, order: 2 }
  ];

  function normalizeLayoutItems(items, defaults, catalog) {
    var byId = {};
    var list = Array.isArray(items) ? items.slice() : [];
    list.forEach(function (item, i) {
      if (!item || !item.id || !catalog[item.id]) return;
      byId[item.id] = {
        id: item.id,
        enabled: item.enabled !== false,
        order: typeof item.order === 'number' ? item.order : i
      };
    });
    Object.keys(catalog).forEach(function (id, i) {
      if (!byId[id]) {
        var def = defaults.find(function (d) { return d.id === id; });
        byId[id] = {
          id: id,
          enabled: def ? def.enabled !== false : true,
          order: def && typeof def.order === 'number' ? def.order : i
        };
      }
    });
    return Object.keys(catalog).map(function (id) { return byId[id]; });
  }

  function getEnabledSorted(layout, catalog, defaults) {
    return normalizeLayoutItems(layout, defaults, catalog)
      .filter(function (item) { return item.enabled; })
      .sort(function (a, b) { return a.order - b.order; })
      .map(function (item) {
        var meta = catalog[item.id] || { id: item.id, title: item.id };
        return Object.assign({}, meta, { order: item.order });
      });
  }

  function getGeneralCards(config) {
    return getEnabledSorted(config && config.generalLayout, CARD_CATALOG, DEFAULT_GENERAL_LAYOUT);
  }

  function getTvSlideIds(config) {
    var enabled = getEnabledSorted(config && config.tvLayout, TV_SLIDE_CATALOG, DEFAULT_TV_LAYOUT);
    var ids = enabled.map(function (item) { return item.id; });
    return ids.length ? ids : ['ops'];
  }

  function getTvSlideLabels(config) {
    return getEnabledSorted(config && config.tvLayout, TV_SLIDE_CATALOG, DEFAULT_TV_LAYOUT)
      .map(function (item) { return item.segLabel || item.label || item.id; })
      .join(' → ');
  }

  function swapPickerRows(list, id, delta) {
    var row = list.querySelector('.layout-picker-row[data-layout-id="' + id + '"]');
    if (!row) return;
    var sibling = delta < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling || !sibling.classList.contains('layout-picker-row')) return;
    if (delta < 0) list.insertBefore(row, sibling);
    else list.insertBefore(sibling, row);
  }

  function setCardEnabled(config, id, enabled) {
    if (!config || !CARD_CATALOG[id]) return config;
    config.generalLayout = normalizeLayoutItems(config.generalLayout, DEFAULT_GENERAL_LAYOUT, CARD_CATALOG);
    config.generalLayout.forEach(function (item) {
      if (item.id === id) item.enabled = !!enabled;
    });
    return config;
  }

  function setTvSlideEnabled(config, id, enabled) {
    if (!config || !TV_SLIDE_CATALOG[id]) return config;
    config.tvLayout = normalizeLayoutItems(config.tvLayout, DEFAULT_TV_LAYOUT, TV_SLIDE_CATALOG);
    config.tvLayout.forEach(function (item) {
      if (item.id === id) item.enabled = !!enabled;
    });
    var on = getTvSlideIds(config);
    if (!on.length) {
      config.tvLayout.forEach(function (item) {
        if (item.id === id) item.enabled = true;
      });
    }
    return config;
  }

  function moveLayoutItem(layout, id, delta, catalog, defaults) {
    var items = normalizeLayoutItems(layout, defaults, catalog)
      .sort(function (a, b) { return a.order - b.order; });
    var idx = items.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return layout;
    var swap = idx + delta;
    if (swap < 0 || swap >= items.length) return layout;
    var tmp = items[idx].order;
    items[idx].order = items[swap].order;
    items[swap].order = tmp;
    return items;
  }

  function moveGeneralCard(config, id, delta) {
    if (!config) return config;
    config.generalLayout = moveLayoutItem(config.generalLayout, id, delta, CARD_CATALOG, DEFAULT_GENERAL_LAYOUT);
    return config;
  }

  function moveTvSlide(config, id, delta) {
    if (!config) return config;
    config.tvLayout = moveLayoutItem(config.tvLayout, id, delta, TV_SLIDE_CATALOG, DEFAULT_TV_LAYOUT);
    return config;
  }

  function layoutPickerRows(layout, catalog, defaults, prefix) {
    var items = normalizeLayoutItems(layout, defaults, catalog)
      .sort(function (a, b) { return a.order - b.order; });
    return items.map(function (item) {
      var meta = catalog[item.id] || { id: item.id, title: item.id };
      var title = meta.title || meta.label || item.id;
      var hidden = !item.enabled;
      return '<li class="layout-picker-row' + (hidden ? ' is-hidden-card' : '') + '" data-layout-id="' + esc(item.id) + '">' +
        '<label class="layout-picker-check">' +
        '<input type="checkbox" data-' + prefix + '-toggle="' + esc(item.id) + '"' + (item.enabled ? ' checked' : '') + '>' +
        '<span>' + esc(title) + '</span></label>' +
        '<div class="layout-picker-actions">' +
        '<button type="button" class="btn btn-xs" data-' + prefix + '-up="' + esc(item.id) + '" title="Subir">↑</button>' +
        '<button type="button" class="btn btn-xs" data-' + prefix + '-down="' + esc(item.id) + '" title="Bajar">↓</button>' +
        (item.enabled
          ? '<button type="button" class="btn btn-xs btn-danger-soft" data-' + prefix + '-remove="' + esc(item.id) + '">Quitar</button>'
          : '<button type="button" class="btn btn-xs btn-primary" data-' + prefix + '-add="' + esc(item.id) + '">Agregar</button>') +
        '</div></li>';
    }).join('');
  }

  function renderGeneralCustomizePanel(config) {
    var rows = layoutPickerRows(config && config.generalLayout, CARD_CATALOG, DEFAULT_GENERAL_LAYOUT, 'gen-card');
    var tvRows = layoutPickerRows(config && config.tvLayout, TV_SLIDE_CATALOG, DEFAULT_TV_LAYOUT, 'tv-slide');
    return '<div class="layout-customize-panel" id="layoutCustomizePanel" hidden>' +
      '<div class="layout-customize-inner">' +
      '<header class="layout-customize-head">' +
      '<h3>Personalizar vista</h3>' +
      '<button type="button" class="btn btn-sm" id="btnCloseLayoutCustomize" aria-label="Cerrar">✕</button>' +
      '</header>' +
      '<section class="layout-customize-section">' +
      '<h4>Tarjetas del centro de mando</h4>' +
      '<p class="layout-customize-hint">Quita las que no quieras ver; agrégalas de nuevo cuando las necesites. El orden define cómo aparecen en la cuadrícula.</p>' +
      '<ul class="layout-picker-list" id="generalLayoutPicker">' + rows + '</ul>' +
      '</section>' +
      '<section class="layout-customize-section">' +
      '<h4>Modo TV — diapositivas</h4>' +
      '<p class="layout-customize-hint">Elige qué pantallas rotan en TV. Debe quedar al menos una activa.</p>' +
      '<ul class="layout-picker-list" id="tvLayoutPicker">' + tvRows + '</ul>' +
      '</section>' +
      '<footer class="layout-customize-foot">' +
      '<button type="button" class="btn btn-primary" id="btnLayoutCustomizeSave">Aplicar y guardar</button>' +
      '</footer></div></div>';
  }

  function readLayoutFromPicker(listEl, prefix, catalog, defaults) {
    if (!listEl) return defaults.slice();
    var items = [];
    listEl.querySelectorAll('.layout-picker-row').forEach(function (row, i) {
      var id = row.getAttribute('data-layout-id');
      if (!id || !catalog[id]) return;
      var cb = row.querySelector('[data-' + prefix + '-toggle]');
      items.push({
        id: id,
        enabled: cb ? cb.checked : true,
        order: i
      });
    });
    return normalizeLayoutItems(items, defaults, catalog);
  }

  function bindGeneralCustomize(host, callbacks) {
    if (!host) return;
    callbacks = callbacks || {};
    var panel = host.querySelector('#layoutCustomizePanel');
    if (!panel) return;

    function closePanel() {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }

    function openPanel() {
      panel.hidden = false;
      panel.setAttribute('aria-hidden', 'false');
    }

    if (!host._layoutToggleBound) {
      host._layoutToggleBound = true;
      host.addEventListener('click', function (ev) {
        if (ev.target.closest('#btnToggleLayoutCustomize')) {
          ev.preventDefault();
          openPanel();
        }
      });
    }
    bindOnce(panel, '#btnCloseLayoutCustomize', 'click', closePanel);

    panel.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var genList = $('generalLayoutPicker', panel);
      var tvList = $('tvLayoutPicker', panel);

      var genUp = t.getAttribute('data-gen-card-up');
      if (genUp && genList) {
        swapPickerRows(genList, genUp, -1);
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var genDown = t.getAttribute('data-gen-card-down');
      if (genDown && genList) {
        swapPickerRows(genList, genDown, 1);
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var tvUp = t.getAttribute('data-tv-slide-up');
      if (tvUp && tvList) {
        swapPickerRows(tvList, tvUp, -1);
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var tvDown = t.getAttribute('data-tv-slide-down');
      if (tvDown && tvList) {
        swapPickerRows(tvList, tvDown, 1);
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }

      var genRemove = t.getAttribute('data-gen-card-remove');
      if (genRemove && genList) {
        var cb = genList.querySelector('[data-gen-card-toggle="' + genRemove + '"]');
        if (cb) cb.checked = false;
        refreshPickerRow(genList, genRemove, false, 'gen-card');
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var genAdd = t.getAttribute('data-gen-card-add');
      if (genAdd && genList) {
        var cb2 = genList.querySelector('[data-gen-card-toggle="' + genAdd + '"]');
        if (cb2) cb2.checked = true;
        refreshPickerRow(genList, genAdd, true, 'gen-card');
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var tvRemove = t.getAttribute('data-tv-slide-remove');
      if (tvRemove && tvList) {
        var cbt = tvList.querySelector('[data-tv-slide-toggle="' + tvRemove + '"]');
        if (cbt) cbt.checked = false;
        refreshPickerRow(tvList, tvRemove, false, 'tv-slide');
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
        return;
      }
      var tvAdd = t.getAttribute('data-tv-slide-add');
      if (tvAdd && tvList) {
        var cbt2 = tvList.querySelector('[data-tv-slide-toggle="' + tvAdd + '"]');
        if (cbt2) cbt2.checked = true;
        refreshPickerRow(tvList, tvAdd, true, 'tv-slide');
        if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
      }
    });

    panel.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || t.type !== 'checkbox') return;
      var id = (t.getAttribute('data-gen-card-toggle') || t.getAttribute('data-tv-slide-toggle') || '');
      var prefix = t.getAttribute('data-gen-card-toggle') ? 'gen-card' : 'tv-slide';
      var list = prefix === 'gen-card' ? $('generalLayoutPicker', panel) : $('tvLayoutPicker', panel);
      if (list && id) refreshPickerRow(list, id, t.checked, prefix);
      if (callbacks.onPreview) callbacks.onPreview(readFromPanel(panel));
    });

    bindOnce(panel, '#btnLayoutCustomizeSave', 'click', function () {
      var data = readFromPanel(panel);
      if (!data.tvSlideIds.length) {
        if (global.PlatformToast) global.PlatformToast.show('Activa al menos una diapositiva de TV.', 'warn');
        else alert('Activa al menos una diapositiva de TV.');
        return;
      }
      if (callbacks.onSave) callbacks.onSave(data);
      closePanel();
    });
  }

  function readFromPanel(panel) {
    var genList = $('generalLayoutPicker', panel);
    var tvList = $('tvLayoutPicker', panel);
    var generalLayout = readLayoutFromPicker(genList, 'gen-card', CARD_CATALOG, DEFAULT_GENERAL_LAYOUT);
    var tvLayout = readLayoutFromPicker(tvList, 'tv-slide', TV_SLIDE_CATALOG, DEFAULT_TV_LAYOUT);
    return {
      generalLayout: generalLayout,
      tvLayout: tvLayout,
      tvSlideIds: getTvSlideIds({ tvLayout: tvLayout })
    };
  }

  function refreshPickerRow(list, id, enabled, prefix) {
    var row = list.querySelector('.layout-picker-row[data-layout-id="' + id + '"]');
    if (!row) return;
    row.classList.toggle('is-hidden-card', !enabled);
    var actions = row.querySelector('.layout-picker-actions');
    if (!actions) return;
    var removeBtn = actions.querySelector('[data-' + prefix + '-remove]');
    var addBtn = actions.querySelector('[data-' + prefix + '-add]');
    if (enabled) {
      if (!removeBtn) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-xs btn-danger-soft';
        btn.setAttribute('data-' + prefix + '-remove', id);
        btn.textContent = 'Quitar';
        actions.appendChild(btn);
      }
      if (addBtn) addBtn.remove();
    } else {
      if (removeBtn) removeBtn.remove();
      if (!addBtn) {
        var btn2 = document.createElement('button');
        btn2.type = 'button';
        btn2.className = 'btn btn-xs btn-primary';
        btn2.setAttribute('data-' + prefix + '-add', id);
        btn2.textContent = 'Agregar';
        actions.appendChild(btn2);
      }
    }
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function bindOnce(root, sel, ev, fn) {
    var el = typeof sel === 'string' ? $(sel, root) : sel;
    if (!el || el.dataset.layoutBound === '1') return;
    el.dataset.layoutBound = '1';
    el.addEventListener(ev, fn);
  }

  function mergeConfigLayout(cfg) {
    if (!cfg) return;
    cfg.generalLayout = normalizeLayoutItems(cfg.generalLayout, DEFAULT_GENERAL_LAYOUT, CARD_CATALOG);
    cfg.tvLayout = normalizeLayoutItems(cfg.tvLayout, DEFAULT_TV_LAYOUT, TV_SLIDE_CATALOG);
  }

  global.PlatformLayout = {
    CARD_CATALOG: CARD_CATALOG,
    TV_SLIDE_CATALOG: TV_SLIDE_CATALOG,
    DEFAULT_GENERAL_LAYOUT: DEFAULT_GENERAL_LAYOUT,
    DEFAULT_TV_LAYOUT: DEFAULT_TV_LAYOUT,
    normalizeLayoutItems: normalizeLayoutItems,
    mergeConfigLayout: mergeConfigLayout,
    getGeneralCards: getGeneralCards,
    getTvSlideIds: getTvSlideIds,
    getTvSlideLabels: getTvSlideLabels,
    setCardEnabled: setCardEnabled,
    setTvSlideEnabled: setTvSlideEnabled,
    moveGeneralCard: moveGeneralCard,
    moveTvSlide: moveTvSlide,
    renderGeneralCustomizePanel: renderGeneralCustomizePanel,
    layoutPickerRows: layoutPickerRows,
    bindGeneralCustomize: bindGeneralCustomize,
    readLayoutFromPicker: readLayoutFromPicker
  };
})(typeof window !== 'undefined' ? window : this);
