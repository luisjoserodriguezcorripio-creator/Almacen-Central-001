/**
 * Tablón informativo — modelo y caché local
 */
(function (global) {
  'use strict';

  var LS_KEY = 'almacen_hub_news';
  var SEED_VERSION = 16;

  function findSeedForItem(item, seeds) {
    if (!item) return null;
    var byId = seeds.find(function (s) { return item.id && s.id === item.id; });
    if (byId) return byId;
    if (item.theme) {
      var byTheme = seeds.find(function (s) { return s.theme && s.theme === item.theme; });
      if (byTheme) return byTheme;
    }
    return seeds.find(function (s) { return s.title === item.title; });
  }

  function refreshSeedCopy(items) {
    var seeds = defaultSeedItems();
    return (items || []).map(function (item) {
      var seed = findSeedForItem(item, seeds);
      if (seed) {
        return Object.assign({}, item, {
          title: seed.title,
          body: seed.body,
          imageUrl: seed.imageUrl,
          linkUrl: seed.linkUrl,
          theme: seed.theme,
          comingSoon: seed.comingSoon,
          imageOnly: seed.imageOnly
        });
      }
      return item;
    });
  }

  function ensurePortalSeeds(items) {
    var merged = (items || []).slice();
    defaultSeedItems().forEach(function (seed) {
      var exists = merged.some(function (n) {
        return n.id === seed.id || (n.theme === seed.theme && n.title === seed.title);
      });
      if (!exists) merged.push(Object.assign({}, seed));
    });
    return activeItems(merged);
  }

  function defaultSeedItems() {
    return [
      {
        id: 'seed_portal_despacho',
        title: 'Portal de Despacho',
        body: 'Qué puedes hacer:\n• Preparar y validar pedidos en vivo\n• Ver listas, estados y avance del despacho\n• Trabajar sincronizado con todo el equipo',
        publishedAt: '2026-06-17T12:00:00.000Z',
        publishedBy: 'Almacén Central 001',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/login-dispatch-poster.jpg',
        linkUrl: 'despacho.html',
        theme: 'despacho'
      },
      {
        id: 'seed_portal_ops',
        title: 'Operaciones de Piso',
        body: 'Qué puedes hacer:\n• Registrar y seguir averías de piso\n• Auditorías 5S, seguridad y equipos\n• Monitoreo de temperatura y módulos en vivo',
        publishedAt: '2026-06-17T11:00:00.000Z',
        publishedBy: 'Almacén Central 001',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/login-averias-poster.jpg',
        linkUrl: 'averias.html',
        theme: 'ops'
      },
      {
        id: 'seed_portal_turnos',
        title: 'Control de Turnos de Despacho',
        body: 'Qué puedes hacer:\n• Elegir trámite: despacho, liquidación o nota de crédito\n• Pedir turno desde el celular sin hacer fila\n• Recibir aviso con voz y alarma cuando sea su turno\n\nCarteles PDF en Escritorio\\Turnos-Imprimir-DC: QR chofer, pasos chofer, QR supervisor y pasos supervisor (separados).',
        publishedAt: '2026-06-16T10:00:00.000Z',
        publishedBy: 'Almacén Central 001',
        active: true,
        pinned: true,
        imageUrl: 'assets/img/turnos-hub-poster.jpg',
        linkUrl: 'turnos.html',
        theme: 'turnos'
      },
      {
        id: 'seed_portal_agenda',
        title: 'Agenda Operativa',
        body: 'Próximamente disponible para todo el personal.\n\nEn qué nos puede ayudar:\n• Ver tareas diarias, inter-diarias y semanales de su puesto\n• Marcar pendiente, en proceso o completado con hora y comentarios\n• Medir productividad del día por área en tiempo real\n• Cada colaborador entra con su usuario y ve solo su agenda\n• Supervisores y administración tienen vista completa del almacén',
        publishedAt: '2026-06-19T12:00:00.000Z',
        publishedBy: 'Almacén Central 001',
        active: true,
        pinned: true,
        comingSoon: true,
        imageOnly: true,
        imageUrl: 'assets/img/agenda-hub-poster.jpg?v=4',
        linkUrl: 'agenda.html',
        theme: 'agenda'
      },
      {
        id: 'seed_portal_recepcion',
        title: 'Gestión de Recepción y Ubicación',
        body: 'Gestión de Recepción y Ubicación — Próximamente disponible para el equipo de patio.\n\nQué podrás hacer:\n• Registrar contenedores importados o locales\n• Validar mercancía y dar entrada al muelle\n• Ver paletas, división y estado en una sola tabla\n• Compartir el seguimiento en pantalla TV del patio',
        publishedAt: '2026-06-20T14:00:00.000Z',
        publishedBy: 'Almacén Central 001',
        active: true,
        pinned: true,
        comingSoon: true,
        imageUrl: 'assets/img/recepcion-hub-poster.jpg?v=1',
        linkUrl: 'recepcion.html',
        theme: 'recepcion'
      }
    ];
  }

  function mapRow(row) {
    if (!row) return null;
    return {
      id: String(row.id || row.uuid || ''),
      title: String(row.title || '').trim(),
      body: String(row.body || '').trim(),
      publishedAt: row.published_at || row.publishedAt || new Date().toISOString(),
      publishedBy: String(row.published_by || row.publishedBy || '').trim(),
      active: row.active !== false,
      pinned: !!row.pinned,
      comingSoon: !!(row.coming_soon || row.comingSoon),
      imageOnly: !!(row.image_only || row.imageOnly),
      imageUrl: String(row.image_url || row.imageUrl || '').trim(),
      linkUrl: String(row.link_url || row.linkUrl || '').trim(),
      theme: String(row.theme || '').trim()
    };
  }

  function sortItems(items) {
    return (items || []).slice().sort(function (a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return String(b.publishedAt).localeCompare(String(a.publishedAt));
    });
  }

  function activeItems(items) {
    return sortItems((items || []).filter(function (n) { return n && n.active !== false && n.title; }));
  }

  function validateItem(data) {
    var title = String(data && data.title || '').trim();
    var body = String(data && data.body || '').trim();
    var imageUrl = String(data && data.imageUrl || '').trim();
    var linkUrl = String(data && data.linkUrl || '').trim();
    var theme = String(data && data.theme || '').trim();
    if (title.length < 3) return { ok: false, message: 'El título debe tener al menos 3 caracteres.' };
    if (title.length > 120) return { ok: false, message: 'El título es demasiado largo (máx. 120).' };
    if (body.length > 2000) return { ok: false, message: 'El texto es demasiado largo (máx. 2000).' };
    if (imageUrl.length > 240) return { ok: false, message: 'La ruta de imagen es demasiado larga.' };
    if (linkUrl.length > 240) return { ok: false, message: 'El enlace es demasiado largo.' };
    return {
      ok: true,
      item: {
        title: title,
        body: body,
        pinned: !!data.pinned,
        comingSoon: !!data.comingSoon,
        imageUrl: imageUrl,
        linkUrl: linkUrl,
        theme: theme
      }
    };
  }

  function readLocal() {
    if (!global.localStorage) return [];
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      var items = activeItems((parsed || []).map(mapRow).filter(Boolean));
      var seeded = global.localStorage.getItem(LS_KEY + '_seed_v');
      if (String(seeded) !== String(SEED_VERSION) || !items.length) {
        items = refreshSeedCopy(ensurePortalSeeds(items));
        writeLocal(items);
        global.localStorage.setItem(LS_KEY + '_seed_v', String(SEED_VERSION));
      } else {
        items = refreshSeedCopy(ensurePortalSeeds(items));
        writeLocal(items);
      }
      return items;
    } catch (e) {
      return defaultSeedItems();
    }
  }

  function writeLocal(items) {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(LS_KEY, JSON.stringify(items || []));
    } catch (e) { /* noop */ }
  }

  function toDbRow(item) {
    return {
      id: item.id || undefined,
      title: item.title,
      body: item.body || '',
      published_at: item.publishedAt || new Date().toISOString(),
      published_by: item.publishedBy || '',
      active: item.active !== false,
      pinned: !!item.pinned,
      coming_soon: !!item.comingSoon,
      image_url: item.imageUrl || '',
      link_url: item.linkUrl || '',
      theme: item.theme || ''
    };
  }

  function applyPortalSeeds(items) {
    return ensurePortalSeeds(refreshSeedCopy(items || []));
  }

  global.PlatformHubNewsCore = {
    LS_KEY: LS_KEY,
    SEED_VERSION: SEED_VERSION,
    defaultSeedItems: defaultSeedItems,
    refreshSeedCopy: refreshSeedCopy,
    ensurePortalSeeds: ensurePortalSeeds,
    applyPortalSeeds: applyPortalSeeds,
    mapRow: mapRow,
    sortItems: sortItems,
    activeItems: activeItems,
    validateItem: validateItem,
    readLocal: readLocal,
    writeLocal: writeLocal,
    toDbRow: toDbRow
  };
})(typeof window !== 'undefined' ? window : this);
