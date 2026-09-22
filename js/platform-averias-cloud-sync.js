/**
 * Sincronización casi en tiempo real — Firebase + SSE + JSONBin + servidor
 */
(function (global) {
  'use strict';

  var SNAPSHOT_KEY = 'averias_dc_snapshot';
  var EMPTY = {
    version: 1,
    updatedAt: '1970-01-01T00:00:00.000Z',
    incidences: [],
    damages: [],
    securityIncidents: [],
    audits5s: [],
    despachoAudits: [],
    equipmentInspections: [],
    equipmentRegistry: {}
  };

  var siteConfig = null;
  var publicBase = '';
  var pollTimer = null;
  var pollSlowTimer = null;
  var eventSource = null;
  var sseRetryTimer = null;
  var pushing = false;
  var pulling = false;
  var lastPullAt = 0;
  var lastAppliedJson = '';
  var firebaseDb = null;
  var firebaseBound = false;
  var liveBound = false;
  var staticPollCounter = 0;
  var CLOUD_OVERRIDE_KEY = 'averias_cloud_jsonbin_override';
  var serverReachable = false;
  var siteConfigPollTimer = null;
  var lastRemoteUpdatedAt = '';
  var lastAppliedContentSig = '';
  var lastBurstAt = 0;
  var initReady = null;
  var pendingPushSnap = null;
  var pendingPushTimer = null;
  var pendingLocalPushTimer = null;
  var lastLocalEditAt = 0;
  var LOCAL_EDIT_GRACE_MS = 30000;
  var lastPushStatus = { at: 0, pendingOk: false, snapOk: false, err: '' };
  var broadcast = typeof global.BroadcastChannel !== 'undefined'
    ? new global.BroadcastChannel('averias-dc-live')
    : null;

  function contentSignature(snap) {
    if (!snap) return '';
    function rowSig(list) {
      return (list || []).map(function (r) {
        if (!r) return '';
        return String(r.id) + '@' + String(r.status || 'PENDIENTE').toUpperCase();
      }).sort().join('|');
    }
    return [
      rowSig(snap.incidences),
      rowSig(snap.damages),
      rowSig(snap.securityIncidents),
      rowSig(snap.audits5s),
      rowSig(snap.despachoAudits),
      String((snap.equipmentInspections || []).length),
      Object.keys(snap.equipmentRegistry || {}).sort().join(',')
    ].join('~');
  }

  function snapshotSignature(snap) {
    return contentSignature(snap);
  }

  function applyCloudOverride(cfg) {
    cfg = cfg || {};
    var siteJb = cfg.averiasJsonBin;
    var siteHasSharedBin = !!(siteJb && siteJb.enabled && siteJb.binId && siteJb.accessKey);

    /* En GitHub Pages todos deben usar el MISMO bin del site-config, no bins locales del celular */
    if (isPublicHost() && siteHasSharedBin) {
      try {
        global.localStorage.removeItem(CLOUD_OVERRIDE_KEY);
      } catch (e) { /* noop */ }
      return cfg;
    }

    if (siteHasSharedBin) {
      return cfg;
    }

    try {
      var raw = global.localStorage.getItem(CLOUD_OVERRIDE_KEY);
      if (!raw) return cfg;
      var o = JSON.parse(raw);
      if (o && o.binId && o.accessKey) {
        cfg.averiasJsonBin = {
          enabled: true,
          binId: o.binId,
          accessKey: o.accessKey,
          keyType: 'master'
        };
        if (!cfg.pollSeconds) cfg.pollSeconds = 1;
        cfg.realtime = cfg.realtime !== false;
      }
    } catch (e) { /* noop */ }
    return cfg;
  }

  function getJsonBinConfig() {
    var jb = siteConfig && siteConfig.averiasJsonBin;
    if (!jb || !jb.enabled || !jb.binId || !jb.accessKey) return null;
    return jb;
  }

  function hasJsonBinConfig() {
    return !!getJsonBinConfig();
  }

  function hasFirebaseConfig() {
    if (global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.isPrimary && global.PlatformSupabaseBridge.isPrimary()) {
      return false;
    }
    if (global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.isEnabled()) return true;
    var fb = siteConfig && siteConfig.firebase;
    return !!(fb && fb.enabled && fb.databaseURL);
  }

  function hasSupabaseConfig() {
    return !!(global.PlatformSupabaseBridge && global.PlatformSupabaseBridge.isEnabled());
  }

  function isSupabasePrimary() {
    return !!(hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary && global.PlatformSupabaseBridge.isPrimary());
  }

  /** Solo Supabase en tiempo real — sin guardar snapshot en localStorage */
  function isLiveCloudOnly() {
    return isSupabasePrimary();
  }

  function applyCloudSnapshotToUi(snap, silent, fromCloud) {
    if (!snap) return false;
    if (isReportingLocked()) return false;
    snap = normalizeSnapshot(snap);
    if (fromCloud) {
      var remoteSeq = snap.localSeq || 0;
      if (remoteSeq < lastKnownRemoteSeq) return false;
      if (shouldBlockStaleRemote(snap)) return false;
    }
    lastKnownRemoteSeq = Math.max(lastKnownRemoteSeq, snap.localSeq || 0);
    lastAppliedContentSig = contentSignature(snap);
    lastRemoteUpdatedAt = String(snap.updatedAt || '');
    if (global.PlatformAveriasUI && global.PlatformAveriasUI.applySnapshotToMemory) {
      global.PlatformAveriasUI.applySnapshotToMemory(snap);
    }
    if (!silent) {
      notifyUpdated('apply', { fromCloud: !!fromCloud, signature: lastAppliedContentSig });
    }
    updateLiveIndicator(true);
    return true;
  }

  function isCloudAuthoritativeSource(source) {
    return source === 'supabase' || source === 'supabase-realtime' || source === 'push-ok';
  }

  function pullFromSupabase() {
    if (!hasSupabaseConfig()) return Promise.resolve(null);
    return global.PlatformSupabaseBridge.pull('averias');
  }

  function pullFromSupabaseRetry() {
    var attempt = 0;
    function run() {
      return pullFromSupabase().then(function (data) {
        if (data || attempt >= 2) return data;
        attempt += 1;
        return (global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false))
          .then(function () {
            return new Promise(function (resolve) {
              global.setTimeout(function () { resolve(run()); }, 350);
            });
          });
      });
    }
    return run();
  }

  function pushToSupabase(snap) {
    if (!hasSupabaseConfig()) return Promise.resolve(false);
    return global.PlatformSupabaseBridge.push('averias', snap);
  }

  function initSupabase() {
    if (!hasSupabaseConfig() || !global.PlatformSupabaseBridge.subscribe) return;
    global.PlatformSupabaseBridge.subscribe('averias', function (remote) {
      if (!remote || pushing || isReportingLocked()) return;
      applyCloudSnapshotToUi(remote, true, true);
    });
  }

  function pullFromCloudProxy() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/cloud/averias')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pushToCloudProxy(snap) {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/cloud/averias'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }

  function tryPromoteLocalCloudConfig() {
    if (!canUseServerApi() || !serverReachable) return Promise.resolve(false);
    var raw;
    try { raw = global.localStorage.getItem(CLOUD_OVERRIDE_KEY); } catch (e) { return Promise.resolve(false); }
    if (!raw || hasJsonBinConfig()) return Promise.resolve(false);
    var o;
    try { o = JSON.parse(raw); } catch (e) { return Promise.resolve(false); }
    if (!o || !o.binId || !o.accessKey) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/register-jsonbin-config'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binId: o.binId, accessKey: o.accessKey })
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data && data.ok) {
        try { global.localStorage.removeItem(CLOUD_OVERRIDE_KEY); } catch (e) { /* noop */ }
        return loadSiteConfig().then(function () {
          updateSyncUi();
          return true;
        });
      }
      return false;
    }).catch(function () { return false; });
  }

  function pollIntervalMs() {
    if (isSupabasePrimary()) {
      var cfg = siteConfig || {};
      var sb = cfg.supabase || {};
      if (sb.freeTier || sb.preferPoll) {
        var freeMs = parseInt(cfg.syncTargetMs, 10);
        if (freeMs > 0) return Math.max(3000, freeMs);
        var freeSec = parseInt(cfg.pollSeconds, 10);
        if (freeSec > 0) return Math.max(3000, freeSec * 1000);
        return 4000;
      }
      return 8000;
    }
    if (hasFirebaseConfig()) {
      var ms = siteConfig && siteConfig.syncTargetMs ? parseInt(siteConfig.syncTargetMs, 10) : 400;
      return Math.max(400, ms || 400);
    }
    var sec = (siteConfig && siteConfig.pollSeconds) || 4;
    if (siteConfig && siteConfig.realtime === false) sec = 8;
    return Math.max(1, sec) * 1000;
  }

  var LIVE_MODULE_KEYS = {
    pallets: 'incidences',
    damages: 'damages',
    security: 'securityIncidents',
    audit: 'audits5s',
    despachoAudit: 'despachoAudits'
  };
  var lastKnownRemoteSeq = 0;
  var reportingLockUntil = 0;

  function setReportingLock(ms) {
    reportingLockUntil = Date.now() + (ms || 25000);
  }

  function isReportingLocked() {
    return Date.now() < reportingLockUntil;
  }

  function partialFromPending(pending) {
    if (!pending || typeof pending !== 'object') return null;
    var partial = normalizeSnapshot({});
    Object.keys(LIVE_MODULE_KEYS).forEach(function (mod) {
      var bucket = pending[mod];
      if (!bucket || typeof bucket !== 'object') return;
      var key = LIVE_MODULE_KEYS[mod];
      partial[key] = Object.keys(bucket).map(function (k) { return bucket[k]; }).filter(Boolean);
    });
    if (!countSnapshotRecords(partial)) return null;
    partial.updatedAt = new Date().toISOString();
    return partial;
  }

  function pullPendingRecords() {
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(null);
    return global.PlatformFirebaseBridge.pull('averias/pending').then(function (pending) {
      return partialFromPending(pending);
    }).catch(function () { return null; });
  }

  function pushPendingRecord(module, record) {
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge || !record || record.id == null) {
      return Promise.resolve({ ok: false, reason: 'no-record' });
    }
    var payload;
    try { payload = JSON.parse(JSON.stringify(record)); } catch (e) { payload = record; }
    payload._syncAt = new Date().toISOString();
    payload._module = module;
    var path = 'averias/pending/' + module + '/' + String(record.id);
    return global.PlatformFirebaseBridge.ensureReady().then(function () {
      return global.PlatformFirebaseBridge.push(path, payload);
    }).then(function (ok) {
      return { ok: !!ok };
    }).catch(function () {
      return { ok: false, reason: 'pending-push-fail' };
    });
  }

  function publishReportLive(module, record) {
    if (!record || record.id == null || !isLiveCloudOnly()) {
      return Promise.resolve({ ok: false, cloud: false });
    }
    var arrKey = LIVE_MODULE_KEYS[module];
    if (!arrKey) return Promise.resolve({ ok: false, cloud: false });

    setReportingLock(25000);
    pushing = true;

    return pullFromSupabaseRetry().then(function (remote) {
      var snap = remote ? normalizeSnapshot(remote) : normalizeSnapshot({});
      var list = Array.isArray(snap[arrKey]) ? snap[arrKey].slice() : [];
      var recordKey = String(record.id);
      if (!list.some(function (r) { return r && String(r.id) === recordKey; })) {
        list.push(record);
      }
      snap[arrKey] = list;
      snap.localSeq = Math.max(snap.localSeq || 0, lastKnownRemoteSeq, (remote && remote.localSeq) || 0) + 1;
      snap.updatedAt = new Date().toISOString();
      return pushToSupabase(snap).then(function (ok) {
        if (ok) {
          reportingLockUntil = 0;
          applyCloudSnapshotToUi(snap, true, false);
          noteLocalSave(snap);
          lastKnownRemoteSeq = snap.localSeq || 0;
          setReportingLock(8000);
          broadcastSyncHint();
          notifyUpdated('push-ok');
        } else {
          reportingLockUntil = 0;
        }
        return { ok: !!ok, cloud: !!ok };
      });
    }).catch(function () {
      reportingLockUntil = 0;
      return { ok: false, cloud: false };
    }).finally(function () {
      pushing = false;
    });
  }

  function publishChange(snap, liveRecord) {
    pushing = true;
    snap = pickBestPushSnapshot(snap);
    snap.localSeq = Math.max(snap.localSeq || 0, lastKnownRemoteSeq) + 1;
    snap.updatedAt = new Date().toISOString();
    snap = normalizeSnapshot(snap);

    function finish(result) {
      pushing = false;
      return result;
    }

    if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) {
      return prepareSnapshotForPush(snap).then(function (ready) {
        return pushToSupabase(ready).then(function (ok) {
          if (ok) {
            noteLocalSave(ready);
            applyCloudSnapshotToUi(ready, true, true);
            lastKnownRemoteSeq = ready.localSeq || 0;
            broadcastSyncHint();
            notifyUpdated('push-ok');
            global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
          }
          return { ok: !!ok, cloud: !!ok, pendingOk: false, snapOk: !!ok };
        });
      }).then(finish, finish);
    }

    var pendingJob = liveRecord && liveRecord.module && liveRecord.record
      ? pushPendingRecord(liveRecord.module, liveRecord.record)
      : Promise.resolve({ ok: false, skipped: true });
    var snapJob = pushToFirebase(snap);
    return pendingJob.then(function (pendingRes) {
      var cloudOk = !!pendingRes.ok;
      snapJob.then(function (snapOk) {
        if (snapOk) {
          noteLocalSave(snap);
          try {
            global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
          } catch (e) { /* noop */ }
          lastKnownRemoteSeq = snap.localSeq || 0;
        }
      }).catch(function () { /* noop */ });
      if (cloudOk) {
        lastKnownRemoteSeq = snap.localSeq || 0;
        global.setTimeout(function () { pullAll(); }, 600);
      }
      return snapJob.then(function (snapOk) {
        return {
          ok: true,
          cloud: cloudOk || !!snapOk,
          pendingOk: cloudOk,
          snapOk: !!snapOk
        };
      }).catch(function () {
        return { ok: true, cloud: cloudOk, pendingOk: cloudOk, snapOk: false };
      });
    }).then(finish, finish);
  }

  function pullFromFirebaseOnceTimed(ms) {
    ms = ms || 3000;
    return Promise.race([
      pullFromFirebaseOnce(),
      new Promise(function (resolve) {
        global.setTimeout(function () { resolve(null); }, ms);
      })
    ]);
  }

  function countSnapshotRecords(snap) {
    if (!snap) return 0;
    return (snap.incidences || []).length + (snap.damages || []).length +
      (snap.securityIncidents || []).length + (snap.audits5s || []).length +
      (snap.despachoAudits || []).length +
      (snap.equipmentInspections || []).length;
  }

  function countCorrectedRecords(snap) {
    if (!snap) return 0;
    var Core = global.PlatformAveriasCore;
    function isCor(r) {
      if (Core && Core.isCorrectedStatus) return Core.isCorrectedStatus(r);
      var s = String(r && r.status || '').toUpperCase();
      return s === 'CORREGIDO' || s === 'FINALIZADO';
    }
    var n = 0;
    ['incidences', 'damages', 'securityIncidents', 'audits5s', 'despachoAudits', 'equipmentInspections'].forEach(function (key) {
      (snap[key] || []).forEach(function (r) { if (isCor(r)) n += 1; });
    });
    return n;
  }

  function listPendingKeys(snap) {
    snap = normalizeSnapshot(snap || EMPTY);
    var Core = global.PlatformAveriasCore;
    function isPend(r) {
      if (Core && Core.isPendingStatus) return Core.isPendingStatus(r);
      return String(r && r.status || 'PENDIENTE').toUpperCase() !== 'CORREGIDO';
    }
    var keys = [];
    (snap.incidences || []).forEach(function (r) { if (isPend(r)) keys.push('pallets:' + r.id); });
    (snap.damages || []).forEach(function (r) { if (isPend(r)) keys.push('damages:' + r.id); });
    (snap.securityIncidents || []).forEach(function (r) { if (isPend(r)) keys.push('security:' + r.id); });
    (snap.audits5s || []).forEach(function (r) { if (isPend(r)) keys.push('audit:' + r.id); });
    (snap.despachoAudits || []).forEach(function (r) { if (isPend(r)) keys.push('despachoAudit:' + r.id); });
    (snap.equipmentInspections || []).forEach(function (r) { if (isPend(r)) keys.push('equipment:' + r.id); });
    return keys;
  }

  function hasLocalPendingNotInRemote(live, remote) {
    live = normalizeSnapshot(live);
    remote = normalizeSnapshot(remote);
    var remoteKeys = {};
    listPendingKeys(remote).forEach(function (k) { remoteKeys[k] = true; });
    var missing = false;
    listPendingKeys(live).forEach(function (k) {
      if (!remoteKeys[k]) missing = true;
    });
    return missing;
  }

  function isEmptySnapshot(snap) {
    return countSnapshotRecords(snap) === 0 &&
      !Object.keys(snap && snap.equipmentRegistry || {}).length;
  }

  function mergeAveriasSnapshots(local, remote) {
    if (!remote) return local || EMPTY;
    if (!local) return remote;

    var Core = global.PlatformAveriasCore;

    function recordTime(r) {
      if (Core && Core.recordTimeForMerge) return Core.recordTimeForMerge(r);
      if (!r) return 0;
      return Date.parse(r.correctionDateIso) || Date.parse(r.correctionDate) || Date.parse(r.fechaRegistro) || Date.parse(r.fecha) ||
        Date.parse(r.reportDate) || (typeof r.id === 'number' ? r.id : parseInt(r.id, 10)) || 0;
    }

    function isCor(r) {
      if (Core && Core.isCorrectedStatus) return Core.isCorrectedStatus(r);
      return String(r && r.status || '').toUpperCase() === 'CORREGIDO';
    }

    function pickBetterRecord(a, b) {
      if (!a) return b;
      if (!b) return a;
      var aCor = isCor(a);
      var bCor = isCor(b);
      // Finalizado/CORREGIDO siempre gana sobre pendiente
      if (aCor && !bCor) return a;
      if (!aCor && bCor) return b;
      return recordTime(a) >= recordTime(b) ? a : b;
    }

    function mergeArr(a, b) {
      var map = {};
      (a || []).forEach(function (x, idx) {
        if (!x) return;
        if (x.id == null || x.id === '') x.id = 'legacy-a-' + idx + '-' + recordTime(x);
        var k = String(x.id);
        map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
      });
      (b || []).forEach(function (x, idx) {
        if (!x) return;
        if (x.id == null || x.id === '') x.id = 'legacy-b-' + idx + '-' + recordTime(x);
        var k = String(x.id);
        map[k] = map[k] ? pickBetterRecord(map[k], x) : x;
      });
      return Object.keys(map).map(function (k) { return map[k]; })
        .sort(function (x, y) { return (y.id || 0) - (x.id || 0); });
    }

    function mergeEquipmentRegistry(lReg, rReg) {
      var keys = {};
      var out = {};
      Object.keys(lReg || {}).forEach(function (k) { keys[k] = true; });
      Object.keys(rReg || {}).forEach(function (k) { keys[k] = true; });
      Object.keys(keys).forEach(function (k) {
        var l = lReg && lReg[k];
        var r = rReg && rReg[k];
        if (!l) { out[k] = r; return; }
        if (!r) { out[k] = l; return; }
        if (l.estado === 'DISPONIBLE' && r.estado === 'NO_DISPONIBLE') { out[k] = l; return; }
        if (r.estado === 'DISPONIBLE' && l.estado === 'NO_DISPONIBLE') { out[k] = r; return; }
        var lt = Date.parse(l.ultimaActualizacion) || 0;
        var rt = Date.parse(r.ultimaActualizacion) || 0;
        out[k] = lt >= rt ? l : r;
      });
      return out;
    }

    var lTime = Date.parse(local.updatedAt) || 0;
    var rTime = Date.parse(remote.updatedAt) || 0;
    return {
      version: 1,
      localSeq: Math.max(local.localSeq || 0, remote.localSeq || 0),
      updatedAt: new Date(Math.max(lTime, rTime)).toISOString(),
      incidences: mergeArr(local.incidences, remote.incidences),
      damages: mergeArr(local.damages, remote.damages),
      securityIncidents: mergeArr(local.securityIncidents, remote.securityIncidents),
      audits5s: mergeArr(local.audits5s, remote.audits5s),
      despachoAudits: mergeArr(local.despachoAudits, remote.despachoAudits),
      equipmentInspections: mergeArr(local.equipmentInspections, remote.equipmentInspections),
      equipmentRegistry: mergeEquipmentRegistry(local.equipmentRegistry, remote.equipmentRegistry)
    };
  }

  function isLanHost() {
    if (global.PlatformNetworkRelay && global.PlatformNetworkRelay.isLanHost) {
      return global.PlatformNetworkRelay.isLanHost();
    }
    var h = global.location && global.location.hostname;
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    return /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(h);
  }

  function isPublicHost() {
    if (global.PlatformNetworkRelay && global.PlatformNetworkRelay.isPublicHost) {
      return global.PlatformNetworkRelay.isPublicHost();
    }
    var h = global.location && global.location.hostname || '';
    return h.indexOf('github.io') !== -1 || h.indexOf('githubusercontent.com') !== -1;
  }

  function normalizeBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getLocalSnapshot() {
    if (isLiveCloudOnly()) return null;
    try {
      var raw = global.localStorage.getItem(SNAPSHOT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getMemorySnapshot() {
    if (global.PlatformAveriasUI && global.PlatformAveriasUI.getMemorySnapshot) {
      try {
        return global.PlatformAveriasUI.getMemorySnapshot();
      } catch (e) { /* noop */ }
    }
    return null;
  }

  function getEffectiveLocalSnapshot() {
    var mem = getMemorySnapshot();
    if (isLiveCloudOnly()) {
      return mem ? normalizeSnapshot(mem) : null;
    }
    var local = getLocalSnapshot();
    if (mem) {
      return mergeAveriasSnapshots(local || EMPTY, mem);
    }
    return local;
  }

  function isBetterSnapshot(a, b) {
    if (!b) return !!a;
    if (!a) return false;
    var seqA = a.localSeq || 0;
    var seqB = b.localSeq || 0;
    if (seqA !== seqB) return seqA > seqB;
    return countSnapshotRecords(a) >= countSnapshotRecords(b);
  }

  function pickBestPushSnapshot(candidate) {
    var best = normalizeSnapshot(candidate || EMPTY);
    var local = getEffectiveLocalSnapshot();
    if (local) best = mergeAveriasSnapshots(best, normalizeSnapshot(local));
    return best;
  }

  function isLocalSnapshotAhead(local, remote) {
    if (!local) return false;
    if (!remote) return true;
    var lSeq = local.localSeq || 0;
    var rSeq = remote.localSeq || 0;
    if (lSeq > rSeq) return true;
    if (lSeq < rSeq) return false;
    return countSnapshotRecords(local) > countSnapshotRecords(remote);
  }

  function beginLocalEdit(snap) {
    lastLocalEditAt = Date.now();
    if (snap) {
      snap = normalizeSnapshot(snap);
      try {
        lastAppliedContentSig = contentSignature(snap);
        lastAppliedJson = JSON.stringify(snap);
        lastRemoteUpdatedAt = String(snap.updatedAt || '');
      } catch (e) { /* noop */ }
    }
  }

  function shouldBlockStaleRemote(snap) {
    if (!snap) return false;
    var live = getEffectiveLocalSnapshot();
    if (!live) return false;
    live = normalizeSnapshot(live);
    snap = normalizeSnapshot(snap);
    if (hasLocalPendingNotInRemote(live, snap)) return true;
    var remoteSeq = snap.localSeq || 0;
    var liveSeq = live.localSeq || 0;
    if (remoteSeq > liveSeq) return false;
    if (countCorrectedRecords(snap) > countCorrectedRecords(live)) return false;
    if (countSnapshotRecords(live) > countSnapshotRecords(snap) && isLocalSnapshotAhead(live, snap)) return true;
    if (countSnapshotRecords(live) > countSnapshotRecords(snap)) return true;
    if (isLocalSnapshotAhead(live, snap)) return true;
    return false;
  }

  function noteLocalSave(snap) {
    snap = normalizeSnapshot(snap);
    lastLocalEditAt = Date.now();
    lastAppliedContentSig = contentSignature(snap);
    try {
      lastAppliedJson = JSON.stringify(snap);
      lastRemoteUpdatedAt = String(snap.updatedAt || '');
    } catch (e) { /* noop */ }
  }

  function inLocalEditGrace() {
    return Date.now() - lastLocalEditAt < LOCAL_EDIT_GRACE_MS;
  }

  function prepareSnapshotForPush(snap) {
    snap = pickBestPushSnapshot(snap);
    if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) {
      return pullFromSupabase().then(function (remote) {
        if (remote) snap = mergeAveriasSnapshots(snap, remote);
        snap.localSeq = Math.max(snap.localSeq || 0, (remote && remote.localSeq) || 0, lastKnownRemoteSeq) + 1;
        snap.updatedAt = new Date().toISOString();
        return normalizeSnapshot(snap);
      }).catch(function () {
        snap.localSeq = Math.max(snap.localSeq || 0, lastKnownRemoteSeq) + 1;
        snap.updatedAt = new Date().toISOString();
        return normalizeSnapshot(snap);
      });
    }
    if (!hasFirebaseConfig() || hasJsonBinConfig()) {
      snap.localSeq = (snap.localSeq || 0) + 1;
      snap.updatedAt = new Date().toISOString();
      return Promise.resolve(normalizeSnapshot(snap));
    }
    return pullFromFirebaseOnceTimed(3000).then(function (remote) {
      if (remote) {
        snap = mergeAveriasSnapshots(normalizeSnapshot(remote), snap);
      }
      snap.localSeq = Math.max(snap.localSeq || 0, (remote && remote.localSeq) || 0) + 1;
      snap.updatedAt = new Date().toISOString();
      return normalizeSnapshot(snap);
    }).catch(function () {
      snap.localSeq = (snap.localSeq || 0) + 1;
      snap.updatedAt = new Date().toISOString();
      return normalizeSnapshot(snap);
    });
  }

  function normalizeSnapshot(snap) {
    snap = snap || {};
    return {
      version: snap.version || 1,
      localSeq: snap.localSeq || 0,
      updatedAt: snap.updatedAt || new Date().toISOString(),
      incidences: Array.isArray(snap.incidences) ? snap.incidences : [],
      damages: Array.isArray(snap.damages) ? snap.damages : [],
      securityIncidents: Array.isArray(snap.securityIncidents) ? snap.securityIncidents : [],
      audits5s: Array.isArray(snap.audits5s) ? snap.audits5s : [],
      despachoAudits: Array.isArray(snap.despachoAudits) ? snap.despachoAudits : [],
      equipmentInspections: Array.isArray(snap.equipmentInspections) ? snap.equipmentInspections : [],
      equipmentRegistry: snap.equipmentRegistry && typeof snap.equipmentRegistry === 'object' ? snap.equipmentRegistry : {}
    };
  }

  function schedulePushFromLocal() {
    var local = getEffectiveLocalSnapshot();
    if (!local || isEmptySnapshot(local)) return;
    clearTimeout(pendingLocalPushTimer);
    pendingLocalPushTimer = global.setTimeout(function () {
      queuePushSnapshot(local, 1);
    }, 150);
  }

  function queuePushSnapshot(snap, retries) {
    var best = pickBestPushSnapshot(snap);
    if (pendingPushSnap && !isBetterSnapshot(best, pendingPushSnap)) {
      return;
    }
    pendingPushSnap = normalizeSnapshot(best);
    clearTimeout(pendingPushTimer);
    pendingPushTimer = global.setTimeout(function () {
      var payload = pendingPushSnap;
      pendingPushSnap = null;
      if (payload) pushSnapshotNow(payload, retries);
    }, 80);
  }

  function applySnapshotToLocal(snap, silent, source) {
    if (!snap) return false;
    if (isLiveCloudOnly()) {
      if (pushing) return false;
      return applyCloudSnapshotToUi(snap, !!silent, source === 'supabase' || source === 'supabase-realtime');
    }
    if (!global.localStorage) return false;
    if (pushing || inLocalEditGrace()) {
      schedulePushFromLocal();
      return false;
    }
    snap = normalizeSnapshot(snap);
    var liveNow = getEffectiveLocalSnapshot();
    if (liveNow) {
      liveNow = normalizeSnapshot(liveNow);
      snap = mergeAveriasSnapshots(liveNow, snap);
      if (shouldBlockStaleRemote(snap)) {
        schedulePushFromLocal();
        return false;
      }
    }
    var current = getEffectiveLocalSnapshot();
    if (current) {
      current = normalizeSnapshot(current);
      var localSeq = current.localSeq || 0;
      var remoteSeq = snap.localSeq || 0;
      if (isCloudAuthoritativeSource(source) && remoteSeq >= localSeq) {
        snap = mergeAveriasSnapshots(snap, current);
      } else if (isCloudAuthoritativeSource(source)) {
        snap = mergeAveriasSnapshots(snap, current);
      } else if (localSeq > remoteSeq) {
        if (source === 'firebase') schedulePushFromLocal();
        snap = mergeAveriasSnapshots(snap, current);
      } else if (source !== 'jsonbin') {
        snap = mergeAveriasSnapshots(current, snap);
      } else {
        snap = mergeAveriasSnapshots(snap, current);
      }
    }
    if (!isCloudAuthoritativeSource(source) && current && countSnapshotRecords(snap) < countSnapshotRecords(current)) {
      snap = mergeAveriasSnapshots(snap, current);
    }
    var contentSig = contentSignature(snap);
    var remoteAt = String(snap.updatedAt || '');
    var remoteSeq = snap.localSeq || 0;
    var forceApply = isCloudAuthoritativeSource(source) ||
      (remoteAt && remoteAt !== lastRemoteUpdatedAt) ||
      remoteSeq > lastKnownRemoteSeq;
    if (!forceApply && contentSig === lastAppliedContentSig) return false;
    var json = JSON.stringify(snap);
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, json);
      global.localStorage.setItem('averias_dc_incidences', JSON.stringify(snap.incidences || []));
      global.localStorage.setItem('averias_dc_damages', JSON.stringify(snap.damages || []));
      global.localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(snap.securityIncidents || []));
      global.localStorage.setItem('averias_dc_audits5s', JSON.stringify(snap.audits5s || []));
      global.localStorage.setItem('averias_dc_despachoAudits', JSON.stringify(snap.despachoAudits || []));
      global.localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(snap.equipmentInspections || []));
      global.localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(snap.equipmentRegistry || {}));
      lastAppliedJson = json;
      lastRemoteUpdatedAt = remoteAt;
      lastKnownRemoteSeq = Math.max(lastKnownRemoteSeq, remoteSeq);
      lastAppliedContentSig = contentSig;
      var uiRefreshed = false;
      var fromCloud = source === 'firebase' || source === 'firebase-pending' || source === 'merge' ||
        source === 'supabase' || source === 'supabase-realtime';
      if (global.PlatformAveriasUI && global.PlatformAveriasUI.applyRemoteSnapshot) {
        uiRefreshed = global.PlatformAveriasUI.applyRemoteSnapshot(snap, { silent: !!silent, fromCloud: fromCloud });
      }
      if (!silent) {
        notifyUpdated('apply', { uiRefreshed: uiRefreshed, signature: contentSig });
      }
      updateLiveIndicator(true);
      return true;
    } catch (e) {
      return false;
    }
  }

  function notifyUpdated(source, extra) {
    try {
      var detail = Object.assign({ source: source || 'cloud' }, extra || {});
      global.dispatchEvent(new CustomEvent('averias-updated', { detail: detail }));
    } catch (e) { /* noop */ }
  }

  function broadcastSyncHint() {
    if (!broadcast) return;
    try {
      broadcast.postMessage({ type: 'averias-sync', at: Date.now() });
    } catch (e) { /* noop */ }
  }

  function parseJsonText(text) {
    if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
  }

  function isJsonBinMasterKey(key) {
    return /^\$2[ab]\$/.test(String(key || ''));
  }

  function jsonBinAuthHeaders(jb) {
    var key = jb && jb.accessKey;
    if (!key) return {};
    if (jb.keyType === 'master' || jb.useMasterKey || isJsonBinMasterKey(key)) {
      return { 'X-Master-Key': key };
    }
    return { 'X-Access-Key': key };
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    return global.fetch(url, Object.assign({ cache: 'no-store', mode: 'cors' }, opts)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text().then(parseJsonText);
    });
  }

  function applySiteConfigRelay() {
    var url = siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl);
    if (!url || !global.PlatformNetworkRelay || !global.PlatformNetworkRelay.saveRelayConfig) return;
    global.PlatformNetworkRelay.saveRelayConfig({
      enabled: true,
      baseUrl: url,
      autoRedirect: false
    });
    if (global.PlatformNetworkRelay.applyRelayFromConfig) {
      global.PlatformNetworkRelay.applyRelayFromConfig();
    }
    publicBase = url;
  }

  function resolvePublicBase() {
    if (publicBase) return publicBase;
    if (siteConfig && normalizeBase(siteConfig.publicSyncBaseUrl)) {
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl);
      return publicBase;
    }
    if (global.PlatformNetworkRelay) {
      var relay = global.PlatformNetworkRelay.readRelayConfig && global.PlatformNetworkRelay.readRelayConfig();
      if (relay && relay.enabled && normalizeBase(relay.baseUrl)) {
        publicBase = normalizeBase(relay.baseUrl);
        return publicBase;
      }
    }
    return '';
  }

  function canUseServerApi() {
    return !!(resolvePublicBase() || isLanHost());
  }

  function apiUrl(path) {
    var base = resolvePublicBase();
    if (base) return base + path;
    return path;
  }

  function staticDataUrl() {
    if (siteConfig && siteConfig.githubPagesDataUrl) return siteConfig.githubPagesDataUrl;
    if (isPublicHost()) {
      return 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/averias.json';
    }
    return 'data/averias.json';
  }

  function siteConfigUrl() {
    if (global.PlatformSecurity && global.PlatformSecurity.configUrl) {
      return global.PlatformSecurity.configUrl();
    }
    if (isPublicHost()) {
      return '/Almacen-Central-001/data/site-config.json';
    }
    return 'data/site-config.json';
  }

  function loadSiteConfig() {
    return fetchJson(siteConfigUrl() + '?t=' + Date.now()).then(function (cfg) {
      siteConfig = applyCloudOverride(cfg || {});
      applySiteConfigRelay();
      publicBase = normalizeBase(siteConfig.publicSyncBaseUrl) || publicBase;
      return siteConfig;
    }).catch(function () {
      siteConfig = applyCloudOverride(siteConfig || {});
      return siteConfig;
    });
  }

  function probeServerBase(base) {
    if (!base) return Promise.resolve(false);
    return fetchJson(base + '/api/health').then(function (h) {
      return !!(h && h.ok);
    }).catch(function () { return false; });
  }

  function pullFirebaseInitial() {
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(null);
    if (global.PlatformFirebaseBridge.pull) {
      return global.PlatformFirebaseBridge.pull('averias/snapshot');
    }
    return Promise.resolve(null);
  }

  function applyPendingFromFirebase(val) {
    if (isSupabasePrimary()) return;
    if (!val) return;
    var partial = partialFromPending(val);
    if (!partial) return;
    var local = getEffectiveLocalSnapshot() || EMPTY;
    var merged = mergeAveriasSnapshots(normalizeSnapshot(local), partial);
    applySnapshotToLocal(merged, false, 'firebase-pending');
  }

  function initFirebase() {
    if (isSupabasePrimary()) return Promise.resolve(false);
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(false);
    return global.PlatformFirebaseBridge.ensureReady().then(function (db) {
      if (!db) return false;
      firebaseDb = db;
      if (!firebaseBound) {
        firebaseBound = true;
        db.ref('averias/snapshot').on('value', function (snap) {
          if (isSupabasePrimary()) return;
          var val = snap.val();
          if (!val) return;
          var local = getEffectiveLocalSnapshot();
          if (local && (local.localSeq || 0) > (val.localSeq || 0)) {
            schedulePushFromLocal();
          }
          var merged = mergeAveriasSnapshots(normalizeSnapshot(local || EMPTY), normalizeSnapshot(val));
          applySnapshotToLocal(merged, false, 'firebase');
        });
      }
      if (!liveBound) {
        liveBound = true;
        db.ref('averias/pending').on('value', function (snap) {
          if (isSupabasePrimary()) return;
          applyPendingFromFirebase(snap.val());
        });
      }
      return true;
    }).catch(function () { return false; });
  }

  function pullFromServer() {
    if (!canUseServerApi()) return Promise.resolve(null);
    return fetchJson(apiUrl('/api/data/averias')).then(function (res) {
      return res && res.data ? res.data : null;
    }).catch(function () { return null; });
  }

  function pullFromStatic() {
    if (hasJsonBinConfig() || hasFirebaseConfig()) return Promise.resolve(null);
    staticPollCounter += 1;
    var hasFastSource = isCloudConfigured() || canUseServerApi();
    if (hasFastSource && staticPollCounter % 3 !== 0) {
      return Promise.resolve(null);
    }
    return fetchJson(staticDataUrl() + '?t=' + Date.now()).catch(function () { return null; });
  }

  var lastJsonBinError = 0;
  var lastJsonBinOk = 0;

  function pullFromJsonBin() {
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(null);
    var url = 'https://api.jsonbin.io/v3/b/' + jb.binId + '/latest?t=' + Date.now();
    return global.fetch(url, {
      headers: jsonBinAuthHeaders(jb),
      cache: 'no-store',
      mode: 'cors'
    }).then(function (res) {
      if (!res.ok) {
        lastJsonBinError = Date.now();
        throw new Error('jsonbin ' + res.status);
      }
      return res.json();
    }).then(function (body) {
      lastJsonBinOk = Date.now();
      var record = body && body.record ? body.record : null;
      if (record && body.metadata && body.metadata.createdAt && !record.updatedAt) {
        record.updatedAt = body.metadata.createdAt;
      }
      return record;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return null;
    });
  }

  function pullFromFirebaseOnce() {
    if (!hasFirebaseConfig() || !global.PlatformFirebaseBridge) return Promise.resolve(null);
    if (global.PlatformFirebaseBridge.pull) {
      return global.PlatformFirebaseBridge.pull('averias/snapshot');
    }
    if (!firebaseDb) return Promise.resolve(null);
    return firebaseDb.ref('averias/snapshot').once('value').then(function (snap) {
      return snap.val() || null;
    }).catch(function () { return null; });
  }

  function promoteLocalToCloudIfNeeded() {
    if (!isSupabasePrimary()) return Promise.resolve();
    var local = getEffectiveLocalSnapshot();
    if (!local || isEmptySnapshot(local)) return Promise.resolve();
    return pullFromSupabase().then(function (remote) {
      var merged = remote ? mergeAveriasSnapshots(remote, local) : local;
      var remoteCount = remote ? countSnapshotRecords(remote) : 0;
      var mergedCount = countSnapshotRecords(merged);
      if (!remote || isEmptySnapshot(remote) || mergedCount > remoteCount ||
          String(merged.updatedAt || '') !== String(remote.updatedAt || '')) {
        return pushSnapshot(merged, 2, { wait: true });
      }
    });
  }

  function pullAll() {
    if (pulling) return Promise.resolve(getEffectiveLocalSnapshot());
    if (pushing || isReportingLocked()) return Promise.resolve(getEffectiveLocalSnapshot());
    if (isLiveCloudOnly()) {
      pulling = true;
      return pullFromSupabaseRetry().then(function (sbSnap) {
        if (sbSnap) applyCloudSnapshotToUi(sbSnap, true, true);
        lastPullAt = Date.now();
        updateSyncStatusUi();
        return sbSnap;
      }).finally(function () {
        pulling = false;
      });
    }
    if (inLocalEditGrace()) {
      schedulePushFromLocal();
      return Promise.resolve(getEffectiveLocalSnapshot());
    }
    pulling = true;
    var localBefore = getEffectiveLocalSnapshot();
    return pullFromJsonBin().then(function (jsonBinSnap) {
      return pullFromSupabaseRetry().then(function (sbSnap) {
        var tasks = [Promise.resolve(sbSnap), pullFromServer(), pullFromCloudProxy(), pullFromStatic(), pullFromFirebaseOnce(), pullPendingRecords()];
        return Promise.all(tasks).then(function (parts) {
          sbSnap = parts[0];
          var merged;
          var applySource = 'merge';

          if (isSupabasePrimary() && sbSnap) {
            var effectiveLocal = getEffectiveLocalSnapshot() || EMPTY;
            merged = mergeAveriasSnapshots(sbSnap, effectiveLocal);
            merged.localSeq = Math.max(sbSnap.localSeq || 0, effectiveLocal.localSeq || 0);
            applySource = 'supabase';
          } else {
            merged = getEffectiveLocalSnapshot() || EMPTY;
          }

          if (!isSupabasePrimary() || !sbSnap) {
            if (jsonBinSnap) {
              merged = mergeAveriasSnapshots(merged, jsonBinSnap);
              if (!isSupabasePrimary()) applySource = 'jsonbin';
            }

            parts.slice(1).forEach(function (part) {
              if (part) merged = mergeAveriasSnapshots(merged, part);
            });

            if (jsonBinSnap && !isSupabasePrimary()) {
              merged = mergeAveriasSnapshots(merged, jsonBinSnap);
            }
          }

          if (!isSupabasePrimary() && localBefore && countSnapshotRecords(localBefore) > countSnapshotRecords(merged)) {
            merged = mergeAveriasSnapshots(merged, localBefore);
          }

          if (merged) {
            var prevContentSig = contentSignature(getLocalSnapshot() || EMPTY);
            var applied = applySnapshotToLocal(merged, false, applySource);
            if (applied && contentSignature(merged) !== prevContentSig) {
              schedulePullBurst();
            }
            lastPullAt = Date.now();
            updateSyncStatusUi();

            if (isSupabasePrimary() && sbSnap && localBefore &&
                countSnapshotRecords(mergeAveriasSnapshots(sbSnap, localBefore)) > countSnapshotRecords(sbSnap)) {
              global.setTimeout(function () {
                pushSnapshot(mergeAveriasSnapshots(sbSnap, localBefore), 2);
              }, 250);
            }

            if (hasJsonBinConfig()) {
              var remoteEmpty = !jsonBinSnap || isEmptySnapshot(jsonBinSnap);
              var localHas = localBefore && !isEmptySnapshot(localBefore);
              if (remoteEmpty && localHas) {
                var upload = mergeAveriasSnapshots(localBefore, merged);
                global.setTimeout(function () { pushSnapshot(upload, 2); }, 150);
              }
            }
          }
          return merged;
        });
      });
    }).finally(function () {
      pulling = false;
    });
  }

  function schedulePullBurst() {
    if (inLocalEditGrace() || pushing) return;
    var now = Date.now();
    if (now - lastBurstAt < 1200) return;
    lastBurstAt = now;
    pullAll();
    [80, 200, 500].forEach(function (ms) {
      global.setTimeout(function () { pullAll(); }, ms);
    });
  }

  function pushToServer(snap) {
    if (!canUseServerApi()) return Promise.resolve(false);
    return global.fetch(apiUrl('/api/data/averias'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap, source: 'client' })
    }).then(function (res) {
      return res.ok;
    }).catch(function () { return false; });
  }

  function pushToJsonBin(snap) {
    var jb = getJsonBinConfig();
    if (!jb) return Promise.resolve(false);
    var headers = jsonBinAuthHeaders(jb);
    headers['Content-Type'] = 'application/json';
    return global.fetch('https://api.jsonbin.io/v3/b/' + jb.binId, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(snap),
      mode: 'cors'
    }).then(function (res) {
      if (res.ok) {
        lastJsonBinOk = Date.now();
        return true;
      }
      lastJsonBinError = Date.now();
      return false;
    }).catch(function () {
      lastJsonBinError = Date.now();
      return false;
    });
  }

  function pushToFirebase(snap) {
    if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) return Promise.resolve(false);
    if (!global.PlatformFirebaseBridge) return Promise.resolve(false);
    var payload;
    try { payload = JSON.parse(JSON.stringify(snap || {})); } catch (e) { payload = snap; }
    return global.PlatformFirebaseBridge.ensureReady().then(function (adapter) {
      if (!adapter) return false;
      firebaseDb = adapter;
      return adapter.ref('averias/snapshot').set(payload).then(function (ok) { return !!ok; });
    }).catch(function () { return false; });
  }

  function pushSnapshot(snap, retries, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    if (opts.wait) {
      if (pushing) {
        return new Promise(function (resolve) {
          var tries = 0;
          (function poll() {
            if (!pushing) {
              pushSnapshotNow(snap, retries).then(resolve);
              return;
            }
            tries += 1;
            if (tries > 50) {
              resolve({ ok: false, reason: 'push-busy' });
              return;
            }
            global.setTimeout(poll, 120);
          })();
        });
      }
      clearTimeout(pendingPushTimer);
      pendingPushSnap = null;
      return pushSnapshotNow(snap, retries);
    }
    queuePushSnapshot(snap, retries);
    return Promise.resolve({ ok: true, queued: true });
  }

  function pushSnapshotNow(snap, retries) {
    if (!snap) return Promise.resolve({ ok: false, reason: 'empty' });
    if (pushing) {
      var best = pickBestPushSnapshot(snap);
      if (!pendingPushSnap || isBetterSnapshot(best, pendingPushSnap)) {
        pendingPushSnap = best;
      }
      clearTimeout(pendingPushTimer);
      pendingPushTimer = global.setTimeout(function () {
        var payload = pendingPushSnap;
        pendingPushSnap = null;
        if (payload) pushSnapshotNow(payload, retries);
      }, 120);
      return new Promise(function (resolve) {
        global.setTimeout(function () {
          resolve({ ok: true, queued: true });
        }, 150);
      });
    }
    pushing = true;
    retries = retries == null ? 3 : retries;

    return prepareSnapshotForPush(snap).then(function (ready) {
      snap = ready;
      if (isEmptySnapshot(snap)) {
        return { ok: false, reason: 'empty-local' };
      }

      function attempt(n) {
        if (hasSupabaseConfig() && global.PlatformSupabaseBridge.isPrimary()) {
          return pushToSupabase(snap).then(function (ok) {
            if (ok) {
              noteLocalSave(snap);
              try {
                global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
              } catch (e) { /* noop */ }
              broadcastSyncHint();
              notifyUpdated('push-ok');
              global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
              return { ok: true, cloud: true };
            }
            if (n < retries) {
              return new Promise(function (resolve) {
                global.setTimeout(function () { resolve(attempt(n + 1)); }, 120);
              });
            }
            return { ok: false, reason: 'supabase-push-failed' };
          });
        }
        if (hasFirebaseConfig() && !hasJsonBinConfig()) {
          return pushToFirebase(snap).then(function (ok) {
            if (ok) {
              noteLocalSave(snap);
              try {
                global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
                global.localStorage.setItem('averias_dc_incidences', JSON.stringify(snap.incidences || []));
                global.localStorage.setItem('averias_dc_damages', JSON.stringify(snap.damages || []));
                global.localStorage.setItem('averias_dc_securityIncidents', JSON.stringify(snap.securityIncidents || []));
                global.localStorage.setItem('averias_dc_audits5s', JSON.stringify(snap.audits5s || []));
                global.localStorage.setItem('averias_dc_despachoAudits', JSON.stringify(snap.despachoAudits || []));
                global.localStorage.setItem('averias_dc_equipmentInspections', JSON.stringify(snap.equipmentInspections || []));
                global.localStorage.setItem('averias_dc_equipmentRegistry', JSON.stringify(snap.equipmentRegistry || {}));
              } catch (e) { /* noop */ }
              global.setTimeout(function () { pullAll(); }, 2500);
              broadcastSyncHint();
              notifyUpdated('push-ok');
              global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
              return { ok: true, cloud: true };
            }
            if (n < retries) {
              return new Promise(function (resolve) {
                global.setTimeout(function () { resolve(attempt(n + 1)); }, 200);
              });
            }
            return { ok: false, reason: 'firebase-fail' };
          });
        }
        return Promise.all([
          pushToServer(snap),
          pushToCloudProxy(snap),
          pushToJsonBin(snap),
          pushToSupabase(snap),
          pushToFirebase(snap)
        ]).then(function (results) {
          var jsonBinOk = results[2];
          var ok = hasJsonBinConfig() ? !!jsonBinOk : results.some(Boolean);
          if (ok) {
            if (isLanHost()) {
              global.fetch('/api/publish-averias-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: snap })
              }).catch(function () { /* noop */ });
            }
            schedulePullBurst();
            broadcastSyncHint();
            notifyUpdated('push-ok');
            global.dispatchEvent(new CustomEvent('averias-sync-push', { detail: { ok: true } }));
            return { ok: true };
          }
          if (n < retries) {
            return new Promise(function (resolve) {
              global.setTimeout(function () { resolve(attempt(n + 1)); }, hasFirebaseConfig() && !hasJsonBinConfig() ? 120 : 400);
            });
          }
          return { ok: false, reason: hasJsonBinConfig() ? 'jsonbin-fail' : 'no-cloud' };
        });
      }

      if (hasJsonBinConfig() && isEmptySnapshot(snap)) {
        return pullFromJsonBin().then(function (remote) {
          if (remote && !isEmptySnapshot(remote)) {
            console.warn('[AveriasCloud] Push vacío bloqueado — la nube tiene reportes');
            applySnapshotToLocal(mergeAveriasSnapshots(remote, snap), false, 'jsonbin');
            return { ok: false, skipped: 'empty-would-wipe-remote' };
          }
          return attempt(0);
        }).catch(function () {
          return attempt(0);
        });
      }

      return attempt(0);
    }).finally(function () {
      pushing = false;
    });
  }

  function sseEndpoint() {
    var base = resolvePublicBase();
    if (base) return base + '/api/events';
    if (isLanHost()) return '/api/events';
    return '';
  }

  function startSSE() {
    var url = sseEndpoint();
    if (!url || !global.EventSource) return;
    if (eventSource) {
      try { eventSource.close(); } catch (e) { /* noop */ }
      eventSource = null;
    }
    clearTimeout(sseRetryTimer);
    try {
      eventSource = new global.EventSource(url);
      eventSource.addEventListener('update', function (ev) {
        var payload;
        try { payload = JSON.parse(ev.data); } catch (e) { return; }
        if (payload && payload.store === 'averias') pullAll();
      });
      eventSource.onerror = function () {
        try { eventSource.close(); } catch (e) { /* noop */ }
        eventSource = null;
        sseRetryTimer = global.setTimeout(startSSE, 3000);
      };
    } catch (e) {
      sseRetryTimer = global.setTimeout(startSSE, 3000);
    }
  }

  function startPolling() {
    clearInterval(pollSlowTimer);
    clearTimeout(pollTimer);
    function loop() {
      if (document.visibilityState === 'visible') {
        pullAll().finally(function () {
          pollTimer = global.setTimeout(loop, pollIntervalMs());
        });
      } else {
        pollTimer = global.setTimeout(loop, pollIntervalMs() * 2);
      }
    }
    pollTimer = global.setTimeout(loop, pollIntervalMs());
    pollSlowTimer = global.setInterval(function () {
      if (document.visibilityState === 'hidden') pullAll();
    }, 15000);
  }

  function isCloudConfigured() {
    return !!(
      hasSupabaseConfig() ||
      hasJsonBinConfig() ||
      hasFirebaseConfig() ||
      (resolvePublicBase() && serverReachable) ||
      isLanHost() ||
      isPublicHost()
    );
  }

  function probeCurrentServer() {
    if (isLanHost()) {
      return fetchJson('/api/health').then(function (h) {
        serverReachable = !!(h && h.ok);
        return serverReachable;
      }).catch(function () {
        serverReachable = false;
        return false;
      });
    }
    var base = resolvePublicBase();
    if (!base) {
      serverReachable = false;
      return Promise.resolve(false);
    }
    return probeServerBase(base).then(function (alive) {
      serverReachable = !!alive;
      if (!alive && siteConfig && siteConfig.publicSyncBaseUrl) {
        publicBase = '';
      }
      return serverReachable;
    });
  }

  function startSiteConfigRefresh() {
    clearInterval(siteConfigPollTimer);
    if (!isPublicHost()) return;
    siteConfigPollTimer = global.setInterval(function () {
      loadSiteConfig().then(function () {
        updateSyncUi();
        if (hasJsonBinConfig() || (resolvePublicBase() && serverReachable)) {
          pullAll();
        }
      });
    }, 45000);
  }

  function updateLiveIndicator(active) {
    var btn = global.document.getElementById('btnSyncAverias');
    var live = global.document.getElementById('avSyncLive');
    var on = !!active && isCloudConfigured();
    if (btn) btn.classList.toggle('sync-live', on);
    if (live) {
      live.hidden = !isCloudConfigured();
      live.classList.toggle('is-pulse', on);
    }
  }

  function updateSyncStatusUi() {
    var el = global.document.getElementById('avSyncStatus');
    if (!el || el.hidden) return;
    var ago = lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) : -1;
    if (isSupabasePrimary()) {
      el.className = 'av-sync-status-line av-sync-status-ok';
      el.textContent = 'EN VIVO — Supabase (solo nube, sin guardado local) · hace ' +
        (ago >= 0 ? ago + ' s' : '—');
      return;
    }
    if (hasFirebaseConfig()) {
      var ago = lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) : -1;
      var mode = global.PlatformFirebaseBridge && global.PlatformFirebaseBridge.getMode
        ? global.PlatformFirebaseBridge.getMode() : 'cloud';
      el.className = 'av-sync-status-line av-sync-status-ok';
      el.textContent = mode === 'rest'
        ? 'Sync en vivo (Firebase) · todos los celulares comparten reportes · hace ' + (ago >= 0 ? ago + ' s' : '—')
        : 'Sync automático · todos los dispositivos comparten datos · hace ' + (ago >= 0 ? ago + ' s' : '—');
      return;
    }
    var jb = getJsonBinConfig();
    if (!jb) {
      el.textContent = 'Conectando sync en la nube… recargue con Ctrl+F5 si tarda más de 5 s.';
      el.className = 'av-sync-status-line av-sync-status-warn';
      return;
    }
    var ago = lastPullAt ? Math.round((Date.now() - lastPullAt) / 1000) : -1;
    var recentErr = lastJsonBinError && (Date.now() - lastJsonBinError) < 15000;
    if (recentErr && ago > 15) {
      el.textContent = 'Problema de conexión con la nube. Compruebe internet y recargue (Ctrl+F5).';
      el.className = 'av-sync-status-line av-sync-status-err';
      return;
    }
    el.className = 'av-sync-status-line av-sync-status-ok';
    el.textContent = 'Sync automático · todos los dispositivos comparten datos · hace ' +
      (ago >= 0 ? ago + ' s' : '—');
  }

  function updateSyncUi() {
    var btn = global.document.getElementById('btnSyncAverias');
    if (btn) {
      var online = isCloudConfigured();
      btn.title = online
        ? 'En vivo — todos los dispositivos · actualización instantánea'
        : 'Pulse para sincronizar con la nube';
      btn.classList.toggle('cloud-active', online);
    }
    var banner = global.document.getElementById('avSyncBanner');
    if (banner) {
      banner.hidden = isCloudConfigured();
    }
    var activateBtn = global.document.getElementById('btnActivateCloud');
    if (activateBtn) {
      activateBtn.hidden = isCloudConfigured();
    }
    var live = global.document.getElementById('avSyncLive');
    if (live) {
      live.hidden = !isCloudConfigured();
    }
    updateSyncStatusUi();
  }

  function activateCloud(masterKey) {
    var key = String(masterKey || '').trim();
    if (!key) return Promise.reject(new Error('Master Key requerida'));

    var sharedBin = getJsonBinConfig();
    if (sharedBin && isPublicHost()) {
      return pullAll().then(function () {
        var local = getLocalSnapshot() || EMPTY;
        return pushSnapshot(local).then(function () {
          return {
            ok: true,
            binId: sharedBin.binId,
            shared: true,
            hint: 'Usando nube compartida del sistema. Todos los dispositivos sincronizados.'
          };
        });
      });
    }

    if (canUseServerApi()) {
      return global.fetch(apiUrl('/api/setup-averias-cloud'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterKey: key })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || 'No se pudo activar la nube');
        try {
          global.localStorage.removeItem(CLOUD_OVERRIDE_KEY);
        } catch (e) { /* noop */ }
        return loadSiteConfig().then(function () {
          updateSyncUi();
          return pullAll();
        }).then(function () {
          return data;
        });
      });
    }

    var payload = JSON.stringify(EMPTY);
    return global.fetch('https://api.jsonbin.io/v3/b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': key,
        'X-Bin-Name': 'Almacen-Central-001-Averias'
      },
      body: payload,
      mode: 'cors'
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.message) || 'Error JSONBin');
        var binId = body.metadata && body.metadata.id;
        if (!binId) throw new Error('JSONBin no devolvió binId');
        if (!isPublicHost()) {
          try {
            global.localStorage.setItem(CLOUD_OVERRIDE_KEY, JSON.stringify({ binId: binId, accessKey: key }));
          } catch (e) { /* noop */ }
        }
        siteConfig = applyCloudOverride(siteConfig || {});
        if (!siteConfig.averiasJsonBin || !siteConfig.averiasJsonBin.binId) {
          siteConfig.averiasJsonBin = { enabled: true, binId: binId, accessKey: key, keyType: 'master' };
        }
        siteConfig.pollSeconds = 1;
        siteConfig.realtime = true;
        updateSyncUi();
        return pullAll().then(function () {
          return {
            ok: true,
            binId: siteConfig.averiasJsonBin.binId || binId,
            localOnly: !isPublicHost(),
            hint: isPublicHost()
              ? 'Nube compartida activa para todos los dispositivos.'
              : 'Activo en este dispositivo. Ejecute SETUP-AVERIAS-CLOUD.bat en el PC servidor.'
          };
        });
      });
    });
  }

  function init() {
    initReady = loadSiteConfig().then(function () {
      return global.PlatformSupabase ? global.PlatformSupabase.init() : Promise.resolve(false);
    }).then(function () {
      if (isSupabasePrimary()) return false;
      return initFirebase();
    }).then(function () {
      initSupabase();
      if (isSupabasePrimary()) return null;
      return pullFirebaseInitial();
    }).then(function (remoteFirebase) {
      if (remoteFirebase && !isSupabasePrimary()) {
        applySnapshotToLocal(mergeAveriasSnapshots(getEffectiveLocalSnapshot(), remoteFirebase), true, 'firebase');
      }
      if (isSupabasePrimary()) return null;
      return pullPendingRecords();
    }).then(function (pendingPartial) {
      if (pendingPartial && !isSupabasePrimary()) {
        applySnapshotToLocal(mergeAveriasSnapshots(getEffectiveLocalSnapshot(), pendingPartial), true, 'firebase-pending');
      }
      return probeCurrentServer().then(function () {
        updateSyncUi();
        return tryPromoteLocalCloudConfig();
      });
    }).then(function () {
      var local = getLocalSnapshot();
      if (local) {
        lastAppliedContentSig = contentSignature(local);
        lastAppliedJson = JSON.stringify(local);
        lastRemoteUpdatedAt = String(local.updatedAt || '');
      }
      return pullAll();
    }).then(function () {
      return promoteLocalToCloudIfNeeded();
    }).then(function () {
      startPolling();
      startSSE();
      startSiteConfigRefresh();
      global.addEventListener('pageshow', function () {
        pullAll();
      }, { passive: true });
      global.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          pullAll();
          startSSE();
        }
      }, { passive: true });
      global.addEventListener('focus', function () { pullAll(); }, { passive: true });
      global.addEventListener('supabase-connection', function () {
        updateSyncUi();
      });
      global.addEventListener('firebase-connection', function () {
        updateSyncUi();
      });
      document.addEventListener('lan-ready', function () {
        publicBase = resolvePublicBase();
        probeCurrentServer().then(function () {
          pullAll();
          startSSE();
          updateSyncUi();
          tryPromoteLocalCloudConfig();
        });
      });
      document.addEventListener('lan-sync', function (ev) {
        if (ev.detail && ev.detail.store === 'averias') {
          pullAll();
        }
      });
      if (broadcast) {
        broadcast.onmessage = function (ev) {
          if (ev && ev.data && ev.data.type === 'averias-sync') {
            pullAll();
          }
        };
      }
      global.setInterval(function () {
        if (Date.now() - lastPullAt < 4000) updateLiveIndicator(true);
        else updateLiveIndicator(false);
      }, 800);
    });
    return initReady;
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  function wipeAll() {
    var snap = {
      version: 1,
      updatedAt: new Date().toISOString(),
      incidences: [],
      damages: [],
      securityIncidents: [],
      audits5s: [],
      despachoAudits: [],
      equipmentInspections: [],
      equipmentRegistry: {}
    };
    var keys = [
      SNAPSHOT_KEY,
      'averias_dc_incidences',
      'averias_dc_damages',
      'averias_dc_securityIncidents',
      'averias_dc_audits5s',
      'averias_dc_despachoAudits',
      'averias_dc_equipmentInspections',
      'averias_dc_equipmentRegistry',
      'averias_dc_audit_log'
    ];
    keys.forEach(function (k) {
      try { global.localStorage.removeItem(k); } catch (e) { /* noop */ }
    });
    try {
      global.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      global.localStorage.setItem('averias_dc_incidences', '[]');
      global.localStorage.setItem('averias_dc_damages', '[]');
      global.localStorage.setItem('averias_dc_securityIncidents', '[]');
      global.localStorage.setItem('averias_dc_audits5s', '[]');
      global.localStorage.setItem('averias_dc_despachoAudits', '[]');
      global.localStorage.setItem('averias_dc_equipmentInspections', '[]');
      global.localStorage.setItem('averias_dc_equipmentRegistry', '{}');
    } catch (e) { /* noop */ }
    lastAppliedJson = '';
    lastAppliedContentSig = '';
    lastRemoteUpdatedAt = '';
    if (global.PlatformAveriasUI && global.PlatformAveriasUI.applyRemoteSnapshot) {
      global.PlatformAveriasUI.applyRemoteSnapshot(snap, { silent: false });
    }
    pushing = true;
    return Promise.all([
      pushToServer(snap),
      pushToCloudProxy(snap),
      pushToJsonBin(snap),
      pushToFirebase(snap)
    ]).then(function (results) {
      var jsonBinOk = results[2];
      var ok = hasJsonBinConfig() ? !!jsonBinOk : results.some(Boolean);
      if (ok) {
        broadcastSyncHint();
        schedulePullBurst();
      }
      notifyUpdated('wipe');
      try {
        global.dispatchEvent(new CustomEvent('averias-web-wiped'));
      } catch (e) { /* noop */ }
      return { ok: ok, jsonBinOk: jsonBinOk };
    }).finally(function () {
      pushing = false;
    });
  }

  global.PlatformAveriasCloudSync = {
    mergeAveriasSnapshots: mergeAveriasSnapshots,
    contentSignature: contentSignature,
    countSnapshotRecords: countSnapshotRecords,
    beginLocalEdit: beginLocalEdit,
    shouldBlockStaleRemote: shouldBlockStaleRemote,
    inLocalEditGrace: inLocalEditGrace,
    isLiveCloudOnly: isLiveCloudOnly,
    isReportingLocked: isReportingLocked,
    setReportingLock: setReportingLock,
    isPushing: function () { return pushing; },
    publishReportLive: publishReportLive,
    noteLocalSave: noteLocalSave,
    pushPendingRecord: pushPendingRecord,
    publishChange: publishChange,
    pull: pullAll,
    push: pushSnapshot,
    wipeAll: wipeAll,
    isCloudConfigured: isCloudConfigured,
    activateCloud: activateCloud,
    getPublicBase: function () { return resolvePublicBase(); },
    getLastPullAt: function () { return lastPullAt; },
    schedulePullBurst: schedulePullBurst,
    ready: function () { return initReady || Promise.resolve(); }
  };
})(typeof window !== 'undefined' ? window : this);
