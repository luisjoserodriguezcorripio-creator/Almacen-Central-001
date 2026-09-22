/**
 * Monitoreo de temperatura — Supabase + Realtime
 */
(function (global) {
  'use strict';

  var CORE = null;
  var areas = [];
  var current = [];
  var alerts = [];
  var listeners = [];
  var unsubCurrent = null;
  var unsubReadings = null;
  var unsubAlerts = null;
  var readyPromise = null;
  var lastSyncAt = 0;
  var setupRequired = false;
  var cloudReady = false;

  function isCloudReady() {
    return cloudReady && !setupRequired;
  }

  function isMissingTableError(err) {
    if (!err) return false;
    var blob = [err.message, err.details, err.hint, err.code, err.error, err.statusText]
      .filter(Boolean).join(' ');
    return /temp_areas|temp_readings|temp_current|temp_alerts|does not exist|42P01|PGRST205|PGRST204|Could not find the table/i.test(blob);
  }

  function formatError(err, fallback) {
    if (isMissingTableError(err)) {
      return 'Falta activar Supabase: ejecute SETUP-TEMPERATURA-SUPABASE.bat y pegue el SQL en supabase.com.';
    }
    return (err && (err.message || err.details)) || fallback || 'Error de sincronización.';
  }

  function isSetupRequired() {
    return setupRequired;
  }

  function core() {
    return CORE || (CORE = global.PlatformTemperatureCore);
  }

  function sb() {
    return global.PlatformSupabase && global.PlatformSupabase.getClient();
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

  function getAreas() {
    return areas.slice();
  }

  function getCurrent() {
    return current.slice();
  }

  function getAlerts() {
    return alerts.slice();
  }

  function getLastSyncAt() {
    return lastSyncAt;
  }

  function mergeAreas(rows) {
    var C = core();
    areas = (rows || []).map(C.mapArea).filter(Boolean)
      .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
    if (!areas.length) areas = C.defaultAreas();
    return areas;
  }

  function mergeCurrent(rows) {
    var C = core();
    var areaMap = {};
    areas.forEach(function (a) { areaMap[a.id] = a; });
    current = (rows || []).map(function (row) {
      var areaId = row.area_id || row.areaId;
      return C.mapCurrent(row, areaMap[areaId]);
    }).filter(Boolean);
    var byArea = {};
    current.forEach(function (c) { byArea[c.areaId] = c; });
    current = areas.map(function (a) {
      return byArea[a.id] || C.mapCurrent({ area_id: a.id, celsius: null, status: 'unknown' }, a);
    });
    return current;
  }

  function mergeAlerts(rows) {
    alerts = (rows || []).map(core().mapAlert).filter(Boolean);
    return alerts;
  }

  function fetchAreas() {
    var client = sb();
    if (!client) {
      mergeAreas(core().defaultAreas());
      return Promise.resolve(areas);
    }
    return client.from('temp_areas')
      .select('id, name, min_celsius, max_celsius, warn_margin, sort_order, active')
      .eq('active', true)
      .order('sort_order')
      .then(function (res) {
        if (res.error) throw res.error;
        setupRequired = false;
        cloudReady = true;
        mergeAreas(res.data);
        return areas;
      })
      .catch(function (err) {
        if (isMissingTableError(err)) {
          setupRequired = true;
          cloudReady = false;
          notify('setup', { required: true });
        }
        mergeAreas(core().defaultAreas());
        return areas;
      });
  }

  function fetchCurrent() {
    var client = sb();
    if (!client) {
      mergeCurrent([]);
      return Promise.resolve(current);
    }
    return client.from('temp_current')
      .select('area_id, celsius, status, reading_id, updated_at')
      .then(function (res) {
        if (res.error) throw res.error;
        mergeCurrent(res.data);
        lastSyncAt = Date.now();
        notify('current', current);
        return current;
      })
      .catch(function () {
        mergeCurrent([]);
        return current;
      });
  }

  function fetchAlerts(limit) {
    var client = sb();
    limit = limit || 50;
    if (!client) {
      alerts = [];
      return Promise.resolve(alerts);
    }
    return client.from('temp_alerts')
      .select('id, area_id, reading_id, celsius, alert_type, severity, status, message, created_at, resolved_at, acknowledged_by')
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error) throw res.error;
        mergeAlerts(res.data);
        notify('alerts', alerts);
        return alerts;
      })
      .catch(function () {
        alerts = [];
        return alerts;
      });
  }

  function fetchHistory(areaId, limit) {
    var client = sb();
    limit = limit || 100;
    if (!client) return Promise.resolve([]);
    var q = client.from('temp_readings')
      .select('id, area_id, celsius, recorded_at, source, recorded_by, notes')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (areaId) q = q.eq('area_id', areaId);
    return q.then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(core().mapReading);
    }).catch(function () { return []; });
  }

  function fetchChartData(areaId, hours) {
    hours = hours || 24;
    var client = sb();
    if (!client || !areaId) return Promise.resolve([]);
    var since = new Date(Date.now() - hours * 3600000).toISOString();
    return client.from('temp_readings')
      .select('celsius, recorded_at')
      .eq('area_id', areaId)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data || [];
      })
      .catch(function () { return []; });
  }

  function insertReading(payload) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Supabase no disponible'));
    if (setupRequired) {
      return Promise.reject(new Error('Falta activar Supabase: ejecute SETUP-TEMPERATURA-SUPABASE.bat y pegue el SQL en supabase.com.'));
    }
    var row = {
      area_id: payload.areaId,
      celsius: Number(payload.celsius),
      source: payload.source || 'manual',
      recorded_by: payload.recordedBy || '',
      notes: payload.notes || ''
    };
    if (payload.recordedAt) row.recorded_at = payload.recordedAt;
    return client.from('temp_readings').insert(row).select('id').single()
      .then(function (res) {
        if (res.error) throw res.error;
        setupRequired = false;
        cloudReady = true;
        lastSyncAt = Date.now();
        return Promise.all([fetchCurrent(), fetchAlerts()]).then(function () {
          notify('reading', { id: res.data && res.data.id });
          return res.data;
        });
      });
  }

  function acknowledgeAlert(alertId, userName) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Supabase no disponible'));
    return client.from('temp_alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: userName || ''
      })
      .eq('id', alertId)
      .then(function (res) {
        if (res.error) throw res.error;
        return fetchAlerts();
      });
  }

  function resolveAlert(alertId) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Supabase no disponible'));
    return client.from('temp_alerts')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString()
      })
      .eq('id', alertId)
      .then(function (res) {
        if (res.error) throw res.error;
        return fetchAlerts();
      });
  }

  function bindRealtime() {
    var RT = global.PlatformSupabaseRealtime;
    if (!RT || !RT.subscribeTable) return;

    if (unsubCurrent) unsubCurrent();
    if (unsubReadings) unsubReadings();
    if (unsubAlerts) unsubAlerts();

    // Plan gratuito: un solo canal de poll (temp_current); lecturas/alertas al refrescar
    var pollOnly = RT.preferPollOnly && RT.preferPollOnly();
    unsubCurrent = RT.subscribeTable({
      id: 'temp_current',
      table: 'temp_current',
      events: ['INSERT', 'UPDATE'],
      onEvent: function () {
        fetchCurrent();
        if (pollOnly) fetchAlerts();
      },
      pull: function () {
        return fetchCurrent().then(function () {
          return pollOnly ? fetchAlerts() : null;
        });
      },
      pollFallbackMs: 4000,
      safetyPollMs: 10000
    });

    if (pollOnly) return;

    unsubReadings = RT.subscribeTable({
      id: 'temp_readings',
      table: 'temp_readings',
      events: ['INSERT'],
      onEvent: function () {
        fetchCurrent();
        fetchAlerts();
        notify('reading', null);
      },
      pull: function () {
        return fetchCurrent().then(function () { return fetchAlerts(); });
      },
      pollFallbackMs: 4000,
      safetyPollMs: 10000
    });

    unsubAlerts = RT.subscribeTable({
      id: 'temp_alerts',
      table: 'temp_alerts',
      events: ['INSERT', 'UPDATE'],
      onEvent: function () {
        fetchAlerts();
      },
      pull: fetchAlerts,
      pollFallbackMs: 12000,
      safetyPollMs: 20000
    });
  }

  function recheckCloud() {
    if (!setupRequired) return Promise.resolve(true);
    readyPromise = null;
    return ready().then(function () {
      notify('setup', { required: setupRequired });
      return !setupRequired;
    });
  }

  function teardown() {
    if (unsubCurrent) unsubCurrent();
    if (unsubReadings) unsubReadings();
    if (unsubAlerts) unsubAlerts();
    unsubCurrent = unsubReadings = unsubAlerts = null;
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = (global.PlatformSupabase && global.PlatformSupabase.init
      ? global.PlatformSupabase.init()
      : Promise.resolve())
      .then(function () {
        return fetchAreas();
      })
      .then(function () {
        return Promise.all([fetchCurrent(), fetchAlerts()]);
      })
      .then(function () {
        bindRealtime();
        return { areas: areas, current: current, alerts: alerts };
      });
    return readyPromise;
  }

  function exportHistoryCsv(historyRows, areaMap) {
    areaMap = areaMap || {};
    areas.forEach(function (a) { areaMap[a.id] = a.name; });
    var lines = ['Área,Temperatura (°C),Fecha/Hora,Fuente,Registrado por,Notas'];
    (historyRows || []).forEach(function (r) {
      lines.push([
        '"' + (areaMap[r.areaId] || r.areaId) + '"',
        Number(r.celsius).toFixed(1),
        '"' + (r.recordedAt || '') + '"',
        r.source || 'manual',
        '"' + String(r.recordedBy || '').replace(/"/g, '""') + '"',
        '"' + String(r.notes || '').replace(/"/g, '""') + '"'
      ].join(','));
    });
    return lines.join('\n');
  }

  global.PlatformTemperatureSync = {
    ready: ready,
    onChange: onChange,
    getAreas: getAreas,
    getCurrent: getCurrent,
    getAlerts: getAlerts,
    getLastSyncAt: getLastSyncAt,
    isSetupRequired: isSetupRequired,
    isCloudReady: isCloudReady,
    recheckCloud: recheckCloud,
    formatError: formatError,
    isMissingTableError: isMissingTableError,
    fetchAreas: fetchAreas,
    fetchCurrent: fetchCurrent,
    fetchAlerts: fetchAlerts,
    fetchHistory: fetchHistory,
    fetchChartData: fetchChartData,
    insertReading: insertReading,
    acknowledgeAlert: acknowledgeAlert,
    resolveAlert: resolveAlert,
    exportHistoryCsv: exportHistoryCsv,
    teardown: teardown
  };
})(typeof window !== 'undefined' ? window : this);
