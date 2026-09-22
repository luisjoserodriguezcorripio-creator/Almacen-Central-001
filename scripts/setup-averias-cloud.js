'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { runGit } = require('./push-web-users-git.js');

function pushSiteConfigGit(root) {
  return runGit(root, ['add', 'data/site-config.json']).then(function () {
    return runGit(root, ['commit', '-m', 'Activar sincronizacion cloud de reportes (JSONBin)']).then(function () {
      return { committed: true };
    }).catch(function (err) {
      var msg = String(err.stderr || err.message || '');
      if (/nothing to commit|no changes added/i.test(msg)) {
        return { committed: false };
      }
      throw err;
    });
  }).then(function (commitResult) {
    return runGit(root, ['push', 'origin', 'main']).then(function () {
      return { committed: commitResult.committed, pushed: true };
    });
  });
}

function emptySnapshot() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    incidences: [],
    damages: [],
    securityIncidents: [],
    audits5s: [],
    equipmentInspections: [],
    equipmentRegistry: {}
  };
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

function setupAveriasCloud(rootDir, masterKey, options) {
  options = options || {};
  const binName = options.binName || 'Almacen-Central-001-Averias';
  const key = String(masterKey || '').trim();
  if (!key) return Promise.reject(new Error('Master Key requerida'));

  const siteConfigPath = path.join(rootDir, 'data', 'site-config.json');
  if (!fs.existsSync(siteConfigPath)) {
    return Promise.reject(new Error('No se encontró data/site-config.json'));
  }

  const payload = JSON.stringify(emptySnapshot());
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-Master-Key': key,
    'X-Bin-Name': binName
  };

  return httpJson('POST', 'https://api.jsonbin.io/v3/b', headers, payload).then(function (create) {
    const binId = create && create.metadata && create.metadata.id;
    if (!binId) throw new Error('JSONBin no devolvió binId');

    const cfg = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
    cfg.averiasJsonBin = {
      enabled: true,
      binId: binId,
      accessKey: key,
      keyType: 'master'
    };
    cfg.pollSeconds = 2;
    cfg.realtime = true;
    cfg.updatedAt = new Date().toISOString();
    fs.writeFileSync(siteConfigPath, JSON.stringify(cfg, null, 2), 'utf8');

    return pushSiteConfigGit(rootDir).then(function (gitResult) {
      return {
        ok: true,
        binId: binId,
        siteConfigPath: siteConfigPath,
        git: gitResult,
        webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/site-config.json'
      };
    }).catch(function (gitErr) {
      return {
        ok: true,
        binId: binId,
        siteConfigPath: siteConfigPath,
        git: null,
        gitError: String(gitErr.stderr || gitErr.message || gitErr),
        webUrl: 'https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/data/site-config.json'
      };
    });
  });
}

module.exports = { setupAveriasCloud, emptySnapshot, pushSiteConfigGit };
