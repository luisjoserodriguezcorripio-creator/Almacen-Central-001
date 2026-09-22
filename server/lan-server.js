'use strict';
/**
 * Servidor WMS — Red local (LAN)
 * - Escucha en 0.0.0.0 (todos los dispositivos del WiFi)
 * - Sirve archivos estáticos (HTML, CSS, JS)
 * - API REST para datos compartidos
 * - SSE (/api/events) para sincronización en tiempo real
 *
 * Uso: node server/lan-server.js
 *      node server/lan-server.js --port 8080
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const webUsersExport = require('../scripts/export-web-users.js');
const { pushWebUsersGit } = require('../scripts/push-web-users-git.js');
const averiasExport = require('../scripts/export-averias.js');
const despachoExport = require('../scripts/export-despacho.js');
const platformExport = require('../scripts/export-platform.js');
const { pushAveriasGit } = require('../scripts/push-averias-git.js');
const { pushDespachoGit } = require('../scripts/push-despacho-git.js');
const { pushPlatformGit } = require('../scripts/push-platform-git.js');
const { setupAveriasCloud } = require('../scripts/setup-averias-cloud.js');
const { ensureAveriasCloud } = require('../scripts/ensure-averias-cloud.js');
const jsonbinCloud = require('../scripts/jsonbin-cloud.js');
const { pushSiteConfigGit } = require('../scripts/setup-averias-cloud.js');

var averiasGitPushTimer = null;
var despachoGitPushTimer = null;
var platformGitPushTimer = null;

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const PORT = parseInt(process.env.PORT || argValue('--port', '8080'), 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Nombres de almacén en disco ↔ claves localStorage del cliente */
const STORES = {
  operaciones: { file: 'operaciones.json', lsKey: 'almacen_platform_data_operaciones' },
  productividad: { file: 'productividad.json', lsKey: 'almacen_platform_data_productividad' },
  facturas: { file: 'facturas.json', lsKey: 'almacen_platform_data_facturas' },
  despacho: { file: 'despacho.json', lsKey: 'almacen_platform_data_despacho' },
  config: { file: 'config.json', lsKey: 'almacen_platform_config' },
  users: { file: 'users.json', lsKey: 'almacen_users' },
  areas: { file: 'areas.json', lsKey: 'almacen_areas' },
  logs: { file: 'logs.json', lsKey: 'almacen_logs' },
  accessRequests: { file: 'access-requests.json', lsKey: 'almacen_access_requests' },
  averias: { file: 'averias.json', lsKey: 'averias_dc_snapshot' }
};
let clientCounter = 0;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSyncSecrets() {
  const fp = path.join(DATA_DIR, 'sync-secrets.local.json');
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    return {};
  }
}

function verifyTurnstileToken(token, remoteIp) {
  return new Promise(function (resolve) {
    const secrets = loadSyncSecrets();
    const secret = process.env.TURNSTILE_SECRET_KEY || secrets.turnstileSecretKey || '';
    if (!secret) {
      resolve({ ok: true, skipped: true });
      return;
    }
    if (!token) {
      resolve({ ok: false, error: 'Token de verificación humana requerido.' });
      return;
    }
    const body = new URLSearchParams({
      secret: secret,
      response: token,
      remoteip: remoteIp || ''
    }).toString();
    const req = https.request({
      hostname: 'challenges.cloudflare.com',
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        try {
          const j = JSON.parse(data);
          resolve(j.success ? { ok: true } : { ok: false, error: 'Verificación humana rechazada.' });
        } catch (e) {
          resolve({ ok: false, error: 'Respuesta de verificación inválida.' });
        }
      });
    });
    req.on('error', function () {
      resolve({ ok: false, error: 'No se pudo validar con Turnstile.' });
    });
    req.write(body);
    req.end();
  });
}

function getLanAddresses() {
  const ips = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ name: name, address: net.address });
      }
    });
  });
  return ips;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function storePath(name) {
  const meta = STORES[name];
  if (!meta) return null;
  return path.join(DATA_DIR, meta.file);
}

function readStore(name) {
  const fp = storePath(name);
  if (!fp || !fs.existsSync(fp)) return null;
  try {
    const stat = fs.statSync(fp);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return { data: data, mtime: stat.mtimeMs, size: stat.size };
  } catch (e) {
    return null;
  }
}

function writeStore(name, data) {
  ensureDataDir();
  const fp = storePath(name);
  if (!fp) throw new Error('Store desconocido: ' + name);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(fp, json, 'utf8');
  if (name === 'users' && Array.isArray(data)) {
    try {
      webUsersExport.writeWebUsersFile(ROOT, data);
    } catch (e) {
      console.warn('[LAN] No se pudo exportar web-users.json:', e.message);
    }
  }
  if (name === 'averias') {
    try {
      averiasExport.writeAveriasFile(ROOT, data);
      scheduleAveriasGitPush();
    } catch (e) {
      console.warn('[LAN] No se pudo exportar averias.json:', e.message);
    }
  }
  if (name === 'despacho') {
    try {
      despachoExport.writeDespachoFile(ROOT, data);
      scheduleDespachoGitPush();
    } catch (e) {
      console.warn('[LAN] No se pudo exportar despacho.json:', e.message);
    }
  }
  if (name === 'operaciones' || name === 'productividad' || name === 'facturas') {
    try {
      schedulePlatformExport();
    } catch (e) {
      console.warn('[LAN] No se pudo exportar platform.json:', e.message);
    }
  }
  const stat = fs.statSync(fp);
  return { mtime: stat.mtimeMs, size: stat.size };
}

function scheduleAveriasGitPush() {
  clearTimeout(averiasGitPushTimer);
  averiasGitPushTimer = setTimeout(function () {
    pushAveriasGit(ROOT).then(function (r) {
      if (r && r.pushed) console.log('[LAN] Reportes publicados a GitHub (data/averias.json)');
    }).catch(function (e) {
      console.warn('[LAN] Git push averias omitido:', String(e.stderr || e.message || e));
    });
  }, 3000);
}

function scheduleDespachoGitPush() {
  clearTimeout(despachoGitPushTimer);
  despachoGitPushTimer = setTimeout(function () {
    pushDespachoGit(ROOT).then(function (r) {
      if (r && r.pushed) console.log('[LAN] Despacho publicado a GitHub (data/despacho.json)');
    }).catch(function (e) {
      console.warn('[LAN] Git push despacho omitido:', String(e.stderr || e.message || e));
    });
  }, 2000);
}

function schedulePlatformExport() {
  clearTimeout(platformGitPushTimer);
  platformGitPushTimer = setTimeout(function () {
    var snap = platformExport.emptyPlatformSnapshot();
    ['operaciones', 'productividad', 'facturas'].forEach(function (name) {
      var row = readStore(name);
      if (row && row.data) snap[name] = row.data;
    });
    platformExport.writePlatformFile(ROOT, snap);
    pushPlatformGit(ROOT).then(function (r) {
      if (r && r.pushed) console.log('[LAN] WMS publicado a GitHub (data/platform.json)');
    }).catch(function (e) {
      console.warn('[LAN] Git push platform omitido:', String(e.stderr || e.message || e));
    });
  }, 2500);
}

function broadcast(event, payload) {
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  sseClients.forEach(function (client) {
    try { client.res.write(msg); }
    catch (e) { sseClients.delete(client); }
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, obj) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, status, text) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function serveStatic(reqPath, res) {
  let urlPath = reqPath.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const rel = urlPath.replace(/^\//, '').replace(/\//g, path.sep);
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    sendText(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

function handleApi(req, res, url) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/health') {
    const ips = getLanAddresses();
    return sendJson(res, 200, {
      ok: true,
      service: 'wms-lan',
      version: 1,
      port: PORT,
      host: HOST,
      ips: ips,
      urls: ips.map(function (i) {
        return 'http://' + i.address + ':' + PORT;
      }),
      clients: sseClients.size,
      stores: Object.keys(STORES),
      relay: true
    });
  }

  if (req.method === 'POST' && p === '/api/verify-human') {
    return readBody(req).then(function (body) {
      const token = body && body.token;
      const ip = req.socket && req.socket.remoteAddress;
      return verifyTurnstileToken(token, ip).then(function (result) {
        sendJson(res, result.ok ? 200 : 403, result);
      });
    }).catch(function (err) {
      sendJson(res, 400, { ok: false, error: err.message || 'Solicitud inválida' });
    });
  }

  if (req.method === 'GET' && p === '/api/relay/discover') {
    const ips = getLanAddresses();
    const suggested = ips.map(function (i) {
      return 'http://' + i.address + ':' + PORT;
    });
    suggested.unshift('http://localhost:' + PORT);
    return sendJson(res, 200, {
      ok: true,
      suggested: suggested,
      hostname: os.hostname()
    });
  }

  if (req.method === 'GET' && p === '/api/data') {
    const out = {};
    Object.keys(STORES).forEach(function (name) {
      const row = readStore(name);
      out[name] = row ? { data: row.data, mtime: row.mtime, size: row.size } : null;
    });
    return sendJson(res, 200, { ok: true, stores: out });
  }

  if (req.method === 'GET' && p.startsWith('/api/data/')) {
    const name = p.slice('/api/data/'.length);
    if (!STORES[name]) return sendJson(res, 404, { ok: false, error: 'Store no encontrado' });
    const row = readStore(name);
    if (!row) return sendJson(res, 200, { ok: true, store: name, data: null, mtime: 0 });
    return sendJson(res, 200, {
      ok: true,
      store: name,
      lsKey: STORES[name].lsKey,
      data: row.data,
      mtime: row.mtime
    });
  }

  if (req.method === 'PUT' && p.startsWith('/api/data/')) {
    const name = p.slice('/api/data/'.length);
    if (!STORES[name]) return sendJson(res, 404, { ok: false, error: 'Store no encontrado' });
    return readBody(req).then(function (body) {
      if (!body || body.data === undefined) {
        return sendJson(res, 400, { ok: false, error: 'Falta campo data' });
      }
      const meta = writeStore(name, body.data);
      const payload = {
        store: name,
        lsKey: STORES[name].lsKey,
        mtime: meta.mtime,
        at: new Date().toISOString(),
        source: (body.source || 'client')
      };
      broadcast('update', payload);
      return sendJson(res, 200, { ok: true, store: name, mtime: meta.mtime });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/publish-web-users') {
    return readBody(req).then(function (body) {
      var users = body && Array.isArray(body.users) ? body.users : null;
      if (!users) {
        const row = readStore('users');
        users = row && row.data ? row.data : webUsersExport.readUsersFile(ROOT);
      }
      if (Array.isArray(users) && users.length) {
        try { writeStore('users', users); } catch (e) { /* noop */ }
      }
      const exported = webUsersExport.writeWebUsersFile(ROOT, users || []);
      return sendJson(res, 200, {
        ok: true,
        count: exported.payload.users.length,
        updatedAt: exported.payload.updatedAt,
        file: 'data/web-users.json'
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/publish-web-users-live') {
    return readBody(req).then(function (body) {
      var users = body && Array.isArray(body.users) ? body.users : null;
      if (!users) {
        const row = readStore('users');
        users = row && row.data ? row.data : webUsersExport.readUsersFile(ROOT);
      }
      if (Array.isArray(users) && users.length) {
        try { writeStore('users', users); } catch (e) { /* noop */ }
      }
      const exported = webUsersExport.writeWebUsersFile(ROOT, users || []);
      return pushWebUsersGit(ROOT).then(function (gitResult) {
        return sendJson(res, 200, {
          ok: true,
          live: true,
          count: exported.payload.users.length,
          updatedAt: exported.payload.updatedAt,
          committed: !!gitResult.committed,
          pushed: !!gitResult.pushed,
          file: 'data/web-users.json',
          webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/'
        });
      }).catch(function (gitErr) {
        return sendJson(res, 200, {
          ok: true,
          live: false,
          count: exported.payload.users.length,
          updatedAt: exported.payload.updatedAt,
          file: 'data/web-users.json',
          gitError: String(gitErr.stderr || gitErr.message || gitErr),
          hint: 'Archivo exportado en disco. Revisa git push o ejecuta publicar-usuarios-web.ps1'
        });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'GET' && p === '/api/cloud/status') {
    const creds = jsonbinCloud.getJsonBinCredentials(ROOT);
    const cfg = fs.existsSync(path.join(ROOT, 'data', 'site-config.json'))
      ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site-config.json'), 'utf8'))
      : {};
    return sendJson(res, 200, {
      ok: true,
      jsonbin: !!(creds && creds.binId),
      publicSyncBaseUrl: cfg.publicSyncBaseUrl || '',
      realtime: cfg.realtime !== false,
      pollSeconds: cfg.pollSeconds || 2
    });
  }

  if (req.method === 'GET' && p === '/api/cloud/averias') {
    return jsonbinCloud.pullAveriasFromJsonBin(ROOT).then(function (remote) {
      if (remote) return sendJson(res, 200, { ok: true, data: remote, source: 'jsonbin' });
      const row = readStore('averias');
      const local = row && row.data ? row.data : averiasExport.readAveriasFile(ROOT);
      return sendJson(res, 200, { ok: true, data: local || averiasExport.emptySnapshot(), source: 'local' });
    }).catch(function (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    });
  }

  if (req.method === 'PUT' && p === '/api/cloud/averias') {
    return readBody(req).then(function (body) {
      var snap = body && body.data ? body.data : null;
      if (!snap) return sendJson(res, 400, { ok: false, error: 'data requerida' });
      snap.updatedAt = new Date().toISOString();
      try { writeStore('averias', snap); } catch (e) { /* noop */ }
      averiasExport.writeAveriasFile(ROOT, snap);
      scheduleAveriasGitPush();
      return jsonbinCloud.pushAveriasToJsonBin(ROOT, snap).then(function (pushed) {
        broadcast('update', { store: 'averias', at: snap.updatedAt, source: 'cloud' });
        return sendJson(res, 200, { ok: true, updatedAt: snap.updatedAt, jsonbin: !!pushed });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'GET' && p === '/api/cloud/despacho') {
    return jsonbinCloud.pullDespachoFromJsonBin(ROOT).then(function (remote) {
      if (remote) return sendJson(res, 200, { ok: true, data: remote, source: 'jsonbin' });
      const row = readStore('despacho');
      const local = row && row.data ? row.data : despachoExport.readDespachoFile(ROOT);
      return sendJson(res, 200, { ok: true, data: local || despachoExport.emptyData(), source: 'local' });
    }).catch(function (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    });
  }

  if (req.method === 'PUT' && p === '/api/cloud/despacho') {
    return readBody(req).then(function (body) {
      var data = body && body.data ? body.data : null;
      if (!data) return sendJson(res, 400, { ok: false, error: 'data requerida' });
      data.updatedAt = new Date().toISOString();
      try { writeStore('despacho', data); } catch (e) { /* noop */ }
      despachoExport.writeDespachoFile(ROOT, data);
      scheduleDespachoGitPush();
      return jsonbinCloud.pushDespachoToJsonBin(ROOT, data).then(function (pushed) {
        broadcast('update', { store: 'despacho', at: data.updatedAt, source: 'cloud' });
        return sendJson(res, 200, { ok: true, updatedAt: data.updatedAt, jsonbin: !!pushed });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/publish-despacho-live') {
    return readBody(req).then(function (body) {
      var data = body && body.data ? body.data : null;
      if (!data) {
        const row = readStore('despacho');
        data = row && row.data ? row.data : despachoExport.readDespachoFile(ROOT);
      }
      if (!data) return sendJson(res, 400, { ok: false, error: 'Sin datos de despacho' });
      despachoExport.writeDespachoFile(ROOT, data);
      return pushDespachoGit(ROOT).then(function (gitResult) {
        return sendJson(res, 200, {
          ok: true,
          live: true,
          updatedAt: data.updatedAt,
          committed: !!gitResult.committed,
          pushed: !!gitResult.pushed,
          file: 'data/despacho.json',
          webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/despacho.json'
        });
      }).catch(function (gitErr) {
        return sendJson(res, 200, {
          ok: true,
          live: false,
          updatedAt: data.updatedAt,
          file: 'data/despacho.json',
          gitError: String(gitErr.stderr || gitErr.message || gitErr)
        });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'GET' && p === '/api/cloud/platform') {
    return jsonbinCloud.pullPlatformFromJsonBin(ROOT).then(function (remote) {
      if (remote) return sendJson(res, 200, { ok: true, data: remote, source: 'jsonbin' });
      var snap = platformExport.readPlatformFile(ROOT);
      ['operaciones', 'productividad', 'facturas'].forEach(function (name) {
        var row = readStore(name);
        if (row && row.data) snap[name] = row.data;
      });
      return sendJson(res, 200, { ok: true, data: snap, source: 'local' });
    }).catch(function (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    });
  }

  if (req.method === 'PUT' && p === '/api/cloud/platform') {
    return readBody(req).then(function (body) {
      var snap = body && body.data ? body.data : null;
      if (!snap) return sendJson(res, 400, { ok: false, error: 'data requerida' });
      snap.updatedAt = new Date().toISOString();
      ['operaciones', 'productividad', 'facturas'].forEach(function (name) {
        if (snap[name]) {
          try { writeStore(name, snap[name]); } catch (e) { /* noop */ }
        }
      });
      platformExport.writePlatformFile(ROOT, snap);
      schedulePlatformExport();
      return jsonbinCloud.pushPlatformToJsonBin(ROOT, snap).then(function (pushed) {
        return sendJson(res, 200, { ok: true, updatedAt: snap.updatedAt, jsonbin: !!pushed });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/register-jsonbin-config') {
    return readBody(req).then(function (body) {
      var binId = body && body.binId ? String(body.binId).trim() : '';
      var accessKey = body && body.accessKey ? String(body.accessKey).trim() : '';
      if (!binId || !accessKey) {
        return sendJson(res, 400, { ok: false, error: 'binId y accessKey requeridos' });
      }
      const siteConfigPath = path.join(ROOT, 'data', 'site-config.json');
      const cfg = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
      cfg.averiasJsonBin = { enabled: true, binId: binId, accessKey: accessKey };
      cfg.pollSeconds = 2;
      cfg.realtime = true;
      cfg.updatedAt = new Date().toISOString();
      fs.writeFileSync(siteConfigPath, JSON.stringify(cfg, null, 2), 'utf8');
      return pushSiteConfigGit(ROOT).then(function (gitResult) {
        return sendJson(res, 200, {
          ok: true,
          binId: binId,
          pushed: !!gitResult.pushed,
          webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/site-config.json'
        });
      }).catch(function (gitErr) {
        return sendJson(res, 200, {
          ok: true,
          binId: binId,
          pushed: false,
          gitError: String(gitErr.stderr || gitErr.message || gitErr)
        });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/setup-averias-cloud') {
    return readBody(req).then(function (body) {
      var masterKey = body && body.masterKey ? String(body.masterKey).trim() : '';
      if (!masterKey) {
        return sendJson(res, 400, { ok: false, error: 'masterKey requerida' });
      }
      return setupAveriasCloud(ROOT, masterKey).then(function (result) {
        return sendJson(res, 200, {
          ok: true,
          binId: result.binId,
          pushed: !!(result.git && result.git.pushed),
          gitError: result.gitError || null,
          webUrl: result.webUrl
        });
      }).catch(function (e) {
        return sendJson(res, 500, { ok: false, error: e.message || String(e) });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'POST' && p === '/api/publish-averias-live') {
    return readBody(req).then(function (body) {
      var snap = body && body.data ? body.data : null;
      if (!snap) {
        const row = readStore('averias');
        snap = row && row.data ? row.data : averiasExport.readAveriasFile(ROOT);
      }
      if (snap) {
        try { writeStore('averias', snap); } catch (e) { /* noop */ }
      }
      const exported = averiasExport.writeAveriasFile(ROOT, snap || averiasExport.emptySnapshot());
      return pushAveriasGit(ROOT).then(function (gitResult) {
        return sendJson(res, 200, {
          ok: true,
          live: true,
          updatedAt: exported.payload.updatedAt,
          committed: !!gitResult.committed,
          pushed: !!gitResult.pushed,
          file: 'data/averias.json',
          webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/averias.json'
        });
      }).catch(function (gitErr) {
        return sendJson(res, 200, {
          ok: true,
          live: false,
          updatedAt: exported.payload.updatedAt,
          file: 'data/averias.json',
          gitError: String(gitErr.stderr || gitErr.message || gitErr)
        });
      });
    }).catch(function (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    });
  }

  if (req.method === 'GET' && p === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    const client = { id: ++clientCounter, res: res };
    sseClients.add(client);
    const ping = setInterval(function () {
      try { res.write(': ping\n\n'); }
      catch (e) { clearInterval(ping); sseClients.delete(client); }
    }, 25000);
    req.on('close', function () {
      clearInterval(ping);
      sseClients.delete(client);
    });
    return;
  }

  if (req.method === 'GET' && p === '/api/info') {
    const ips = getLanAddresses();
    return sendJson(res, 200, {
      ok: true,
      hostname: os.hostname(),
      port: PORT,
      lan: ips,
      dataDir: DATA_DIR,
      instructions: {
        wms: ips.length ? 'http://' + ips[0].address + ':' + PORT + '/index.html' : null,
        despacho: ips.length ? 'http://' + ips[0].address + ':' + PORT + '/despacho.html' : null
      }
    });
  }

  sendJson(res, 404, { ok: false, error: 'Ruta API no encontrada' });
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) {
    const result = handleApi(req, res, url);
    if (result && typeof result.then === 'function') {
      result.catch(function (e) {
        sendJson(res, 500, { ok: false, error: e.message });
      });
    }
    return;
  }
  serveStatic(url.pathname, res);
});

ensureDataDir();

ensureAveriasCloud(ROOT).then(function (result) {
  if (result && result.binId && !result.skipped) {
    console.log('[Cloud] Sincronizacion JSONBin lista — bin', result.binId);
  } else if (result && result.reason === 'no-master-key') {
    console.log('[Cloud] Sin JSONBin — ejecute SETUP-AVERIAS-CLOUD.bat o cree data/sync-secrets.local.json');
  }
}).catch(function (e) {
  console.warn('[Cloud] Auto-config omitida:', e.message || e);
});

server.listen(PORT, HOST, function () {
  const ips = getLanAddresses();
  console.log('');
  console.log('========================================');
  console.log('  Almacén Central 001 — Servidor LAN');
  console.log('========================================');
  console.log('Escuchando en: ' + HOST + ':' + PORT);
  console.log('');
  console.log('En ESTE equipo:');
  console.log('  WMS:      http://localhost:' + PORT + '/index.html');
  console.log('  Despacho: http://localhost:' + PORT + '/despacho.html');
  console.log('  Pantalla externa: http://localhost:' + PORT + '/despacho-pantalla.html');
  console.log('');
  if (ips.length) {
    console.log('Desde OTROS dispositivos (mismo WiFi):');
    ips.forEach(function (net) {
      console.log('  [' + net.name + '] http://' + net.address + ':' + PORT + '/index.html');
      console.log('           http://' + net.address + ':' + PORT + '/despacho.html');
      console.log('  Pantalla:  http://' + net.address + ':' + PORT + '/despacho-pantalla.html');
    });
  } else {
    console.log('No se detectó IP LAN. Revisa la conexión WiFi.');
  }
  console.log('');
  console.log('Datos compartidos en: ' + DATA_DIR);
  console.log('API salud: http://localhost:' + PORT + '/api/health');
  console.log('Tiempo real: SSE /api/events');
  console.log('Detener: Ctrl+C');
  console.log('========================================');
  console.log('');
});
