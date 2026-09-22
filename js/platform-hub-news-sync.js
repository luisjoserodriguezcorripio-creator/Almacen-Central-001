/**
 * Tablón informativo — Supabase Free
 * Preferencia: tabla hub_news; si no existe, web_snapshots.module = hub_news
 */
(function (global) {
  'use strict';

  var CORE = null;
  var SNAPSHOT_MODULE = 'hub_news';
  var items = [];
  var listeners = [];
  var unsub = null;
  var readyPromise = null;
  var setupRequired = false;
  var useSnapshot = false;

  function core() {
    return CORE || (CORE = global.PlatformHubNewsCore);
  }

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function bridge() {
    return global.PlatformSupabaseBridge;
  }

  function isMissingTableError(err) {
    if (!err) return false;
    var blob = [err.message, err.details, err.hint, err.code, err.error, err.statusText]
      .filter(Boolean).join(' ');
    return /hub_news|does not exist|42P01|PGRST205|PGRST204|Could not find the table/i.test(blob);
  }

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function mergeRows(rows) {
    var C = core();
    if (!C) return items;
    try {
      var mapped = (rows || []).map(C.mapRow).filter(Boolean);
      items = C.activeItems(C.applyPortalSeeds ? C.applyPortalSeeds(mapped) : mapped);
    } catch (e) {
      items = C.readLocal();
    }
    C.writeLocal(items);
    notify('items', items);
    return items;
  }

  function getItems() {
    return items.slice();
  }

  function isSetupRequired() {
    return setupRequired;
  }

  function snapshotPayload(list) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      items: list || []
    };
  }

  function pullSnapshot() {
    var B = bridge();
    if (!B || !B.pull) return Promise.resolve(null);
    return B.pull(SNAPSHOT_MODULE).then(function (data) {
      if (!data) return null;
      return data.items || data.news || null;
    });
  }

  function pushSnapshot(list) {
    var B = bridge();
    if (!B || !B.push) return Promise.resolve(false);
    return B.push(SNAPSHOT_MODULE, snapshotPayload(list));
  }

  function fetchFromTable() {
    var client = sb();
    if (!client) return Promise.reject(new Error('no-client'));
    return client.from('hub_news')
      .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
      .eq('active', true)
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(30)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      });
  }

  function fetchAll() {
    if (useSnapshot) {
      return pullSnapshot().then(function (rows) {
        setupRequired = false;
        if (rows && rows.length) mergeRows(rows);
        else mergeRows(core().readLocal());
        return items;
      }).catch(function () {
        mergeRows(core().readLocal());
        return items;
      });
    }

    var client = sb();
    if (!client) {
      mergeRows(core().readLocal());
      return Promise.resolve(items);
    }

    return fetchFromTable()
      .then(function (rows) {
        setupRequired = false;
        useSnapshot = false;
        mergeRows(rows);
        if (!items.length) mergeRows(core().readLocal());
        return items;
      })
      .catch(function (err) {
        if (isMissingTableError(err)) {
          useSnapshot = true;
          setupRequired = false;
          return pullSnapshot().then(function (rows) {
            if (rows && rows.length) {
              mergeRows(rows);
              return items;
            }
            var local = core().readLocal();
            mergeRows(local);
            return pushSnapshot(local).then(function () { return items; });
          }).catch(function () {
            mergeRows(core().readLocal());
            return items;
          });
        }
        mergeRows(core().readLocal());
        return items;
      });
  }

  function subscribe() {
    if (unsub) return;

    if (useSnapshot) {
      var B = bridge();
      if (!B || !B.subscribe) return;
      unsub = B.subscribe(SNAPSHOT_MODULE, function (remote) {
        if (!remote) return;
        var rows = remote.items || remote.news;
        if (rows) mergeRows(rows);
      });
      return;
    }

    var RT = global.PlatformSupabaseRealtime;
    if (!RT || !RT.subscribeTable || !sb()) return;
    unsub = RT.subscribeTable({
      id: 'hub_news',
      table: 'hub_news',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      onEvent: function () { fetchAll(); },
      pull: fetchAll,
      pollFallbackMs: 4000,
      safetyPollMs: 10000
    });
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (global.PlatformSupabase && global.PlatformSupabase.init
      ? global.PlatformSupabase.init()
      : Promise.resolve()
    ).then(function () {
      return fetchAll().then(function () {
        subscribe();
        return items;
      });
    });
    return readyPromise;
  }

  function saveItem(data, actorName) {
    var C = core();
    var check = C.validateItem(data);
    if (!check.ok) return Promise.resolve(check);
    var client = sb();
    var now = new Date().toISOString();
    var row = C.toDbRow({
      id: data.id || '',
      title: check.item.title,
      body: check.item.body,
      publishedAt: data.id ? undefined : now,
      publishedBy: actorName || '',
      active: true,
      pinned: check.item.pinned,
      imageUrl: check.item.imageUrl,
      linkUrl: check.item.linkUrl,
      theme: check.item.theme
    });

    if (useSnapshot || !client) {
      return saveViaSnapshot(data, check.item, actorName);
    }

    if (data.id) {
      return client.from('hub_news')
        .update({
          title: row.title,
          body: row.body,
          pinned: row.pinned,
          image_url: row.image_url,
          link_url: row.link_url,
          theme: row.theme
        })
        .eq('id', data.id)
        .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
        .single()
        .then(function (res) {
          if (res.error) throw res.error;
          return fetchAll().then(function () {
            return { ok: true, item: C.mapRow(res.data) };
          });
        })
        .catch(function (err) {
          if (isMissingTableError(err)) {
            useSnapshot = true;
            return saveViaSnapshot(data, check.item, actorName);
          }
          return saveLocalFallback(data, check.item, actorName, err);
        });
    }

    return client.from('hub_news')
      .insert({
        title: row.title,
        body: row.body,
        published_at: now,
        published_by: actorName || '',
        active: true,
        pinned: row.pinned,
        image_url: row.image_url,
        link_url: row.link_url,
        theme: row.theme
      })
      .select('id, title, body, published_at, published_by, active, pinned, image_url, link_url, theme')
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        return fetchAll().then(function () {
          return { ok: true, item: C.mapRow(res.data) };
        });
      })
      .catch(function (err) {
        if (isMissingTableError(err)) {
          useSnapshot = true;
          return saveViaSnapshot(data, check.item, actorName);
        }
        return saveLocalFallback(data, check.item, actorName, err);
      });
  }

  function saveViaSnapshot(data, validated, actorName) {
    var C = core();
    var list = (items.length ? items.slice() : C.readLocal()).slice();
    var now = new Date().toISOString();
    var saved;
    if (data.id) {
      list = list.map(function (n) {
        if (n.id !== data.id) return n;
        saved = Object.assign({}, n, validated);
        return saved;
      });
      if (!saved) {
        saved = Object.assign({ id: data.id, publishedAt: now, publishedBy: actorName || '', active: true }, validated);
        list.unshift(saved);
      }
    } else {
      saved = {
        id: 'snap_' + Date.now(),
        title: validated.title,
        body: validated.body,
        publishedAt: now,
        publishedBy: actorName || '',
        active: true,
        pinned: validated.pinned,
        imageUrl: validated.imageUrl || '',
        linkUrl: validated.linkUrl || '',
        theme: validated.theme || ''
      };
      list.unshift(saved);
    }
    mergeRows(list);
    return pushSnapshot(items).then(function (ok) {
      if (!unsub) subscribe();
      return {
        ok: true,
        item: saved,
        localOnly: !ok,
        message: ok ? '' : 'Guardado local; reintente sync en unos segundos.'
      };
    });
  }

  function saveLocalFallback(data, validated, actorName, err) {
    var C = core();
    var list = C.readLocal();
    var now = new Date().toISOString();
    if (data.id) {
      list = list.map(function (n) {
        if (n.id !== data.id) return n;
        return Object.assign({}, n, validated);
      });
    } else {
      list.unshift({
        id: 'local_' + Date.now(),
        title: validated.title,
        body: validated.body,
        publishedAt: now,
        publishedBy: actorName || '',
        active: true,
        pinned: validated.pinned,
        imageUrl: validated.imageUrl || '',
        linkUrl: validated.linkUrl || '',
        theme: validated.theme || ''
      });
    }
    mergeRows(list);
    var msg = err && isMissingTableError(err)
      ? 'Usando sync Free (web_snapshots).'
      : (err ? ((err.message || 'Error') + ' — guardado localmente.') : '');
    return Promise.resolve({ ok: true, item: list[0], localOnly: true, message: msg });
  }

  function removeItem(id) {
    if (!id) return Promise.resolve({ ok: false, message: 'Noticia no encontrada.' });

    if (useSnapshot) {
      var next = items.filter(function (n) { return n.id !== id; });
      mergeRows(next);
      return pushSnapshot(items).then(function () { return { ok: true }; });
    }

    var client = sb();
    if (client && !setupRequired) {
      return client.from('hub_news')
        .update({ active: false })
        .eq('id', id)
        .then(function (res) {
          if (res.error) throw res.error;
          return fetchAll().then(function () { return { ok: true }; });
        })
        .catch(function (err) {
          if (isMissingTableError(err)) {
            useSnapshot = true;
            return removeItem(id);
          }
          return removeLocal(id);
        });
    }
    return removeLocal(id);
  }

  function removeLocal(id) {
    var C = core();
    var list = C.readLocal().filter(function (n) { return n.id !== id; });
    mergeRows(list);
    return Promise.resolve({ ok: true, localOnly: true });
  }

  global.PlatformHubNewsSync = {
    init: init,
    fetchAll: fetchAll,
    getItems: getItems,
    onChange: onChange,
    saveItem: saveItem,
    removeItem: removeItem,
    isSetupRequired: isSetupRequired,
    usesSnapshot: function () { return useSnapshot; }
  };
})(typeof window !== 'undefined' ? window : this);
