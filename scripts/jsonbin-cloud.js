'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { readSecrets } = require('./ensure-averias-cloud.js');

function readSiteConfig(rootDir) {
  const fp = path.join(rootDir, 'data', 'site-config.json');
  if (!fs.existsSync(fp)) return {};
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function jsonBinAuthHeaders(creds, jb) {
  jb = jb || {};
  const key = creds.accessKey;
  if (jb.keyType === 'master' || jb.useMasterKey || /^\$2[ab]\$/.test(String(key || ''))) {
    return { 'X-Master-Key': key };
  }
  return { 'X-Access-Key': key };
}

function getJsonBinCredentialsFor(rootDir, field) {
  const cfg = readSiteConfig(rootDir);
  const jb = cfg[field] || {};
  if (jb.enabled && jb.binId && jb.accessKey) {
    return { binId: jb.binId, accessKey: jb.accessKey, jb: jb, source: 'site-config' };
  }
  return null;
}

function getJsonBinCredentials(rootDir) {
  const fromSite = getJsonBinCredentialsFor(rootDir, 'averiasJsonBin');
  if (fromSite) return fromSite;
  const cfg = readSiteConfig(rootDir);
  const jb = cfg.averiasJsonBin || {};
  if (jb.enabled && jb.binId && jb.accessKey) {
    return { binId: jb.binId, accessKey: jb.accessKey, jb: jb, source: 'site-config' };
  }
  const secrets = readSecrets(rootDir);
  if (secrets && secrets.jsonbinBinId && secrets.jsonbinAccessKey) {
    return {
      binId: secrets.jsonbinBinId,
      accessKey: secrets.jsonbinAccessKey,
      source: 'secrets'
    };
  }
  const masterKey = secrets && String(secrets.jsonbinMasterKey || secrets.masterKey || '').trim();
  if (masterKey && secrets && secrets.jsonbinBinId) {
    return { binId: secrets.jsonbinBinId, accessKey: masterKey, source: 'secrets-master' };
  }
  return null;
}

function httpJson(method, url, headers, body) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const opts = {
      method: method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: headers || {}
    };
    const req = https.request(opts, function (res) {
      let raw = '';
      res.on('data', function (c) { raw += c; });
      res.on('end', function () {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = { raw: raw }; }
        if (res.statusCode >= 400) {
          const err = new Error((data && data.message) || raw || ('HTTP ' + res.statusCode));
          err.statusCode = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function pullAveriasFromJsonBin(rootDir) {
  const creds = getJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(null);
  const headers = jsonBinAuthHeaders(creds, creds.jb);
  return httpJson('GET', 'https://api.jsonbin.io/v3/b/' + creds.binId + '/latest', headers).then(function (body) {
    return body && body.record ? body.record : null;
  });
}

function pushAveriasToJsonBin(rootDir, snap) {
  const creds = getJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(false);
  const payload = JSON.stringify(snap || {});
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }, jsonBinAuthHeaders(creds, creds.jb));
  return httpJson('PUT', 'https://api.jsonbin.io/v3/b/' + creds.binId, headers, payload).then(function () {
    return true;
  }).catch(function () {
    return false;
  });
}

function getDespachoJsonBinCredentials(rootDir) {
  return getJsonBinCredentialsFor(rootDir, 'despachoJsonBin');
}

function pullDespachoFromJsonBin(rootDir) {
  const creds = getDespachoJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(null);
  const headers = jsonBinAuthHeaders(creds, creds.jb);
  return httpJson('GET', 'https://api.jsonbin.io/v3/b/' + creds.binId + '/latest', headers).then(function (body) {
    return body && body.record ? body.record : null;
  }).catch(function () {
    return null;
  });
}

function pushDespachoToJsonBin(rootDir, data) {
  const creds = getDespachoJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(false);
  const payload = JSON.stringify(data || {});
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }, jsonBinAuthHeaders(creds, creds.jb));
  return httpJson('PUT', 'https://api.jsonbin.io/v3/b/' + creds.binId, headers, payload).then(function () {
    return true;
  }).catch(function () {
    return false;
  });
}

function getPlatformJsonBinCredentials(rootDir) {
  return getJsonBinCredentialsFor(rootDir, 'platformJsonBin');
}

function pullPlatformFromJsonBin(rootDir) {
  const creds = getPlatformJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(null);
  const headers = jsonBinAuthHeaders(creds, creds.jb);
  return httpJson('GET', 'https://api.jsonbin.io/v3/b/' + creds.binId + '/latest', headers).then(function (body) {
    return body && body.record ? body.record : null;
  }).catch(function () {
    return null;
  });
}

function pushPlatformToJsonBin(rootDir, data) {
  const creds = getPlatformJsonBinCredentials(rootDir);
  if (!creds) return Promise.resolve(false);
  const payload = JSON.stringify(data || {});
  const headers = Object.assign({
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }, jsonBinAuthHeaders(creds, creds.jb));
  return httpJson('PUT', 'https://api.jsonbin.io/v3/b/' + creds.binId, headers, payload).then(function () {
    return true;
  }).catch(function () {
    return false;
  });
}

module.exports = {
  getJsonBinCredentials,
  getDespachoJsonBinCredentials,
  getPlatformJsonBinCredentials,
  pullAveriasFromJsonBin,
  pushAveriasToJsonBin,
  pullDespachoFromJsonBin,
  pushDespachoToJsonBin,
  pullPlatformFromJsonBin,
  pushPlatformToJsonBin
};
