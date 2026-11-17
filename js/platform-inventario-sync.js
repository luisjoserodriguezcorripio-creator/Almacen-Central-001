/**
 * Inventario RF — sincronización Supabase + caché local
 */
(function (global) {
  'use strict';

  var CACHE_USERS = 'inv_dc_users_cache';
  var CACHE_ENTRIES = 'inv_dc_entries_cache';
  var CACHE_DIRECTED = 'inv_dc_directed_plan_v1';
  var CACHE_DIRECTED_META = 'inv_dc_directed_meta_v1';
  var CACHE_CODIGOS = 'inv_dc_codigos_catalog_v1';
  var codigosIndex = null;
  var codigosLoadPromise = null;
  var DEFAULT_USERS = [
    { employeeId: '51192', displayName: 'Jansel Castro', role: 'COUNT', active: true, adminPin: '' },
    { employeeId: '51963', displayName: 'Luis José Rodríguez Ruíz', role: 'COUNT', active: true, adminPin: '' },
    { employeeId: '12345', displayName: 'María López', role: 'COUNT', active: true, adminPin: '' },
    { employeeId: 'admin', displayName: 'Administrador', role: 'ADMIN', active: true, adminPin: 'Central@' }
  ];
  var ADMIN_EMPLOYEE_ID = 'admin';
  var CORE = null;
  var realtimeUnsub = null;
  var listeners = [];

  function core() {
    return CORE || (CORE = global.PlatformInventarioCore);
  }

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
  }

  function readCache(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : (fallback || null);
    } catch (e) {
      return fallback || null;
    }
  }

  function writeCache(key, data) {
    try {
      global.localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { /* noop */ }
  }

  function notify(kind, payload) {
    listeners.forEach(function (fn) {
      try { fn(kind, payload); } catch (e) { /* noop */ }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  function mapUser(row) {
    if (!row) return null;
    return {
      employeeId: row.employee_id,
      displayName: row.display_name,
      role: row.role,
      active: row.active !== false,
      adminPin: row.admin_pin || ''
    };
  }

  function mapEntry(row) {
    if (!row) return null;
    return {
      id: row.id,
      barcode: row.barcode,
      productName: row.product_name,
      quantity: row.quantity,
      zone: row.zone,
      warehouse: row.warehouse,
      unit: row.unit,
      expectedQty: row.expected_qty,
      matricula: row.matricula,
      expirationDate: row.expiration_date,
      userId: row.user_id,
      createdAt: row.created_at,
      synced: row.synced,
      countMode: row.count_mode,
      rackPassIndex: row.rack_pass_index,
      rackPassesTotal: row.rack_passes_total,
      countNumber: row.count_number
    };
  }

  function normEmployeeId(id) {
    return String(id == null ? '' : id).trim();
  }

  function defaultUsers() {
    return DEFAULT_USERS.slice();
  }

  function defaultAdminPin() {
    var admin = DEFAULT_USERS.find(function (u) {
      return u.role === 'ADMIN' && normEmployeeId(u.employeeId).toLowerCase() === ADMIN_EMPLOYEE_ID;
    });
    return admin ? String(admin.adminPin || '') : '';
  }

  /** Aplica PIN admin del código (Supabase/caché pueden quedar con 1234 antiguo). */
  function applyDefaultAdminPin(users) {
    var pin = defaultAdminPin();
    if (!pin) return users || [];
    var list = (users || []).slice();
    var found = false;
    list = list.map(function (u) {
      if (u.role === 'ADMIN' && normEmployeeId(u.employeeId).toLowerCase() === ADMIN_EMPLOYEE_ID) {
        found = true;
        if (u.adminPin !== pin) return Object.assign({}, u, { adminPin: pin });
      }
      return u;
    });
    if (!found) {
      var defAdmin = DEFAULT_USERS.find(function (u) { return u.role === 'ADMIN'; });
      if (defAdmin) list.push(Object.assign({}, defAdmin));
    }
    return list;
  }

  function syncAdminPinToCloud() {
    var client = sb();
    var pin = defaultAdminPin();
    if (!client || !pin) return Promise.resolve(false);
    return client.from('inv_users')
      .update({ admin_pin: pin })
      .eq('employee_id', ADMIN_EMPLOYEE_ID)
      .then(function (res) {
        return !res.error;
      })
      .catch(function () { return false; });
  }

  function fetchUsers() {
    var client = sb();
    if (!client) {
      var cached = readCache(CACHE_USERS, null);
      var offline = applyDefaultAdminPin(cached && cached.length ? cached : defaultUsers());
      writeCache(CACHE_USERS, offline);
      return Promise.resolve(offline);
    }
    return client.from('inv_users')
      .select('employee_id, display_name, role, active, admin_pin')
      .eq('active', true)
      .then(function (res) {
        if (res.error) throw res.error;
        var list = applyDefaultAdminPin((res.data || []).map(mapUser));
        writeCache(CACHE_USERS, list);
        syncAdminPinToCloud();
        return list;
      })
      .catch(function () {
        var cached = readCache(CACHE_USERS, null);
        var fallback = applyDefaultAdminPin(cached && cached.length ? cached : defaultUsers());
        writeCache(CACHE_USERS, fallback);
        return fallback;
      });
  }

  function verifyLogin(role, code, pin) {
    return fetchUsers().then(function (users) {
      if (!users || !users.length) return null;
      if (role === 'admin') {
        var adminCode = normEmployeeId(code).toLowerCase();
        var admin = users.find(function (u) {
          return u.role === 'ADMIN' && normEmployeeId(u.employeeId).toLowerCase() === adminCode;
        });
        if (!admin) return null;
        if (String(admin.adminPin || '') !== String(pin || '')) return null;
        return admin;
      }
      var id = normEmployeeId(code);
      if (!id) return null;
      var counter = users.find(function (u) {
        return u.role === 'COUNT' && normEmployeeId(u.employeeId) === id && u.active;
      });
      return counter || null;
    });
  }

  function buildCodigosIndex(payload) {
    var byCode = {};
    var byDigits = {};
    var items = (payload && payload.items) || [];
    var C = core();
    items.forEach(function (it) {
      var code = String(it.code || '').trim();
      var name = String(it.name || '').trim();
      if (!code || !name) return;
      var dig = String(it.digits || (C && C.articleDigits ? C.articleDigits(code) : code.replace(/^N/i, '').replace(/\D/g, '')));
      byCode[code.toUpperCase()] = name;
      if (dig) {
        byDigits[dig] = name;
        byCode[('N' + dig).toUpperCase()] = name;
      }
    });
    return { byCode: byCode, byDigits: byDigits, count: items.length, meta: payload || {} };
  }

  function ensureCodigosCatalog() {
    if (codigosIndex) return Promise.resolve(codigosIndex);
    if (codigosLoadPromise) return codigosLoadPromise;
    var cached = readCache(CACHE_CODIGOS, null);
    if (cached && cached.items && cached.items.length) {
      codigosIndex = buildCodigosIndex(cached);
    }
    codigosLoadPromise = global.fetch('data/inv-codigos-catalog.json?v=1', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('Catálogo CODIGOS no disponible');
        return res.json();
      })
      .then(function (data) {
        writeCache(CACHE_CODIGOS, data);
        codigosIndex = buildCodigosIndex(data);
        notify('catalog', { count: codigosIndex.count });
        return codigosIndex;
      })
      .catch(function () {
        if (!codigosIndex && cached && cached.items) {
          codigosIndex = buildCodigosIndex(cached);
        }
        return codigosIndex || { byCode: {}, byDigits: {}, count: 0, meta: {} };
      });
    return codigosLoadPromise;
  }

  function lookupCodigosLocal(barcode) {
    return ensureCodigosCatalog().then(function (idx) {
      if (!barcode || !idx) return null;
      var C = core();
      if (C && C.isVaciaArticle && C.isVaciaArticle(barcode)) {
        return { name: 'UBICACIÓN VACÍA', matricula: '', expectedQty: 0, unit: 'CJ', vacia: true, source: 'vacia' };
      }
      var raw = String(barcode || '').trim();
      var dig = C && C.articleDigits ? C.articleDigits(raw) : raw.replace(/^N/i, '').replace(/\D/g, '');
      var name =
        idx.byCode[raw.toUpperCase()] ||
        idx.byDigits[dig] ||
        idx.byCode[('N' + dig).toUpperCase()] ||
        '';
      if (!name) return null;
      return {
        name: name,
        matricula: '',
        expectedQty: 0,
        unit: 'CJ',
        source: 'codigos'
      };
    });
  }

  function lookupCatalog(barcode, location) {
    if (!barcode) return Promise.resolve(null);
    return lookupCodigosLocal(barcode).then(function (local) {
      if (local) return local;
      var client = sb();
      if (!client) return null;
      var q = client.from('inv_catalog')
        .select('*')
        .eq('article_code', String(barcode).trim())
        .limit(5);
      if (location) q = q.eq('location', String(location).trim());
      return q.then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        var row = res.data[0];
        return {
          name: row.product_name,
          matricula: row.matricula || '',
          expectedQty: parseFloat(row.qty_available) || 0,
          unit: row.unit || 'CJ',
          source: 'cloud'
        };
      }).catch(function () { return null; });
    });
  }

  function lookupPairCode(code) {
    var client = sb();
    if (!client || !code) return Promise.resolve(null);
    return client.from('inv_article_pairs')
      .select('*')
      .or('codigo_v1.eq.' + code + ',codigo_v2.eq.' + code)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) return null;
        var row = res.data[0];
        return {
          articleCode: row.articulo || row.codigo_v1,
          productName: row.product_name,
          scannedCode: code
        };
      }).catch(function () { return null; });
  }

  function fetchEntries(limit) {
    limit = limit || 500;
    var client = sb();
    if (!client) {
      return Promise.resolve(readCache(CACHE_ENTRIES, []));
    }
    return client.from('inv_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error) throw res.error;
        var list = (res.data || []).map(mapEntry);
        writeCache(CACHE_ENTRIES, list);
        return list;
      })
      .catch(function () {
        return readCache(CACHE_ENTRIES, []);
      });
  }

  function countRoundForLocation(location, barcode) {
    return fetchEntries(1000).then(function (entries) {
      var same = entries.filter(function (e) {
        return e.zone === location && e.barcode === barcode;
      });
      return same.length + 1;
    });
  }

  function insertEntry(fields) {
    var C = core();
    var payload = C.buildEntryPayload(fields);
    var client = sb();
    if (!client) {
      var local = readCache(CACHE_ENTRIES, []);
      var entry = Object.assign({ id: 'local-' + Date.now(), createdAt: new Date().toISOString() }, fields);
      local.unshift(entry);
      writeCache(CACHE_ENTRIES, local.slice(0, 500));
      notify('entry', entry);
      return Promise.resolve({ ok: true, entry: entry, offline: true });
    }
    return client.from('inv_entries').insert(payload).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        var entry = mapEntry(res.data);
        notify('entry', entry);
        return { ok: true, entry: entry, offline: false };
      });
  }

  function deleteAllEntries() {
    var client = sb();
    if (!client) {
      writeCache(CACHE_ENTRIES, []);
      notify('clear', []);
      return Promise.resolve(true);
    }
    return client.from('inv_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      .then(function (res) {
        if (res.error) throw res.error;
        writeCache(CACHE_ENTRIES, []);
        notify('clear', []);
        return true;
      });
  }

  function bindRealtime() {
    if (realtimeUnsub || !global.PlatformSupabaseRealtime) return;
    var refreshTimer = null;
    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = global.setTimeout(function () {
        fetchEntries().then(function (list) {
          notify('sync', list);
        });
      }, 120);
    }
    realtimeUnsub = global.PlatformSupabaseRealtime.subscribeTable({
      table: 'inv_entries',
      events: ['INSERT', 'UPDATE', 'DELETE'],
      pollFallbackMs: 4000,
      safetyPollMs: 10000,
      pausePollOnRealtime: true,
      pull: function () {
        return fetchEntries().then(function (list) {
          notify('sync', list);
          return list;
        });
      },
      onEvent: function (ev) {
        if (ev.eventType === 'INSERT' && ev.new) {
          notify('entry', mapEntry(ev.new));
        }
        scheduleRefresh();
      }
    });
  }

  function getDirectedPlan() {
    var rows = readCache(CACHE_DIRECTED, []) || [];
    var meta = readCache(CACHE_DIRECTED_META, {}) || {};
    return Promise.resolve({ rows: rows, meta: meta });
  }

  function publishDirectedPlan(rows, meta) {
    var list = (rows || []).map(function (r, i) {
      return {
        id: r.id || ('d' + i + '-' + Date.now()),
        location: String(r.location || r.loc || '').trim(),
        barcode: String(r.barcode || r.code || '').trim(),
        product: String(r.product || r.productName || '').trim(),
        expectedQty: Number(r.expectedQty != null ? r.expectedQty : (r.qtyCj != null ? r.qtyCj : r.expected)) || 0,
        matricula: String(r.matricula || '').trim(),
        status: r.status || 'pending',
        countedQty: r.countedQty != null ? r.countedQty : null,
        countedAt: r.countedAt || null,
        countedBy: r.countedBy || ''
      };
    }).filter(function (r) { return r.location && r.barcode; });
    var m = Object.assign({
      publishedAt: new Date().toISOString(),
      count: list.length
    }, meta || {});
    writeCache(CACHE_DIRECTED, list);
    writeCache(CACHE_DIRECTED_META, m);
    notify('directed', { rows: list, meta: m });

    var client = sb();
    if (!client) {
      return Promise.resolve({ ok: true, offline: true, rows: list, meta: m });
    }
    // Tabla opcional: inv_directed_plan (si no existe, queda solo local + JSON)
    return client.from('inv_directed_plan').delete().neq('id', '__none__')
      .then(function (delRes) {
        if (delRes && delRes.error) {
          return { ok: true, offline: true, cloudError: delRes.error.message, rows: list, meta: m };
        }
        if (!list.length) return { ok: true, offline: false, rows: list, meta: m };
        var payload = list.map(function (r) {
          return {
            id: r.id,
            location: r.location,
            barcode: r.barcode,
            product_name: r.product,
            expected_qty: r.expectedQty,
            matricula: r.matricula,
            status: r.status,
            counted_qty: r.countedQty,
            counted_at: r.countedAt,
            counted_by: r.countedBy
          };
        });
        return client.from('inv_directed_plan').insert(payload).then(function (res) {
          if (res.error) {
            return { ok: true, offline: true, cloudError: res.error.message, rows: list, meta: m };
          }
          return { ok: true, offline: false, rows: list, meta: m };
        });
      })
      .catch(function (err) {
        return { ok: true, offline: true, cloudError: err && err.message, rows: list, meta: m };
      });
  }

  function patchDirectedLine(id, patch) {
    return getDirectedPlan().then(function (plan) {
      var rows = (plan.rows || []).map(function (r) {
        if (r.id !== id) return r;
        return Object.assign({}, r, patch || {});
      });
      writeCache(CACHE_DIRECTED, rows);
      notify('directed', { rows: rows, meta: plan.meta });
      var client = sb();
      if (!client) return { ok: true, offline: true, rows: rows };
      var row = rows.find(function (r) { return r.id === id; });
      if (!row) return { ok: true, offline: true, rows: rows };
      return client.from('inv_directed_plan').upsert({
        id: row.id,
        location: row.location,
        barcode: row.barcode,
        product_name: row.product,
        expected_qty: row.expectedQty,
        matricula: row.matricula,
        status: row.status,
        counted_qty: row.countedQty,
        counted_at: row.countedAt,
        counted_by: row.countedBy
      }).then(function (res) {
        if (res.error) return { ok: true, offline: true, rows: rows };
        return { ok: true, offline: false, rows: rows };
      }).catch(function () {
        return { ok: true, offline: true, rows: rows };
      });
    });
  }

  function pullDirectedPlanFromCloud() {
    var client = sb();
    if (!client) return getDirectedPlan();
    return client.from('inv_directed_plan').select('*').order('location')
      .then(function (res) {
        if (res.error || !res.data) return getDirectedPlan();
        var rows = (res.data || []).map(function (r) {
          return {
            id: r.id,
            location: r.location,
            barcode: r.barcode,
            product: r.product_name || '',
            expectedQty: r.expected_qty || 0,
            matricula: r.matricula || '',
            status: r.status || 'pending',
            countedQty: r.counted_qty,
            countedAt: r.counted_at,
            countedBy: r.counted_by || ''
          };
        });
        var meta = { publishedAt: new Date().toISOString(), count: rows.length, source: 'cloud' };
        writeCache(CACHE_DIRECTED, rows);
        writeCache(CACHE_DIRECTED_META, meta);
        notify('directed', { rows: rows, meta: meta });
        return { rows: rows, meta: meta };
      })
      .catch(function () { return getDirectedPlan(); });
  }

  function init() {
    return (global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false))
      .then(function () {
        bindRealtime();
        return ensureCodigosCatalog().then(function () {
          return fetchUsers().then(function (users) {
            return syncAdminPinToCloud().then(function () { return users; });
          });
        });
      });
  }

  global.PlatformInventarioSync = {
    init: init,
    onChange: onChange,
    fetchUsers: fetchUsers,
    verifyLogin: verifyLogin,
    ensureCodigosCatalog: ensureCodigosCatalog,
    lookupCodigosLocal: lookupCodigosLocal,
    lookupCatalog: lookupCatalog,
    lookupPairCode: lookupPairCode,
    fetchEntries: fetchEntries,
    countRoundForLocation: countRoundForLocation,
    insertEntry: insertEntry,
    deleteAllEntries: deleteAllEntries,
    getDirectedPlan: getDirectedPlan,
    publishDirectedPlan: publishDirectedPlan,
    patchDirectedLine: patchDirectedLine,
    pullDirectedPlanFromCloud: pullDirectedPlanFromCloud,
    isOnline: function () {
      return global.PlatformSupabase && global.PlatformSupabase.isConnected();
    }
  };
})(typeof window !== 'undefined' ? window : this);
