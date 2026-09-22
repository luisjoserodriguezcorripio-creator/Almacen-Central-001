'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.join(__dirname, '..');
const siteConfigPath = path.join(rootDir, 'data', 'site-config.json');

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
          return reject(new Error((data && data.message) || raw || ('HTTP ' + res.statusCode)));
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function main() {
  if (!fs.existsSync(siteConfigPath)) {
    console.error('No site-config.json');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
  const src = cfg.despachoJsonBin && cfg.despachoJsonBin.binId
    ? cfg.despachoJsonBin
    : cfg.averiasJsonBin;
  if (!src || !src.accessKey) {
    console.error('Falta averiasJsonBin.accessKey en site-config');
    process.exit(1);
  }

  const empty = {
    module: 'despacho',
    version: 1,
    updatedAt: new Date().toISOString(),
    pedidos: [],
    liveShare: null,
    liveShareLista: null
  };

  const run = cfg.despachoJsonBin && cfg.despachoJsonBin.binId
    ? Promise.resolve({ metadata: { id: cfg.despachoJsonBin.binId } })
    : httpJson('POST', 'https://api.jsonbin.io/v3/b', {
      'Content-Type': 'application/json',
      'X-Master-Key': src.accessKey,
      'X-Bin-Name': 'Almacen-Central-001-Despacho'
    }, JSON.stringify(empty));

  run.then(function (body) {
    const binId = body.metadata && body.metadata.id;
    if (!binId) throw new Error('JSONBin no devolvió binId');
    cfg.despachoJsonBin = {
      enabled: true,
      binId: binId,
      accessKey: src.accessKey,
      keyType: src.keyType || 'master'
    };
    cfg.updatedAt = new Date().toISOString();
    fs.writeFileSync(siteConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log('OK despachoJsonBin.binId =', binId);
    return httpJson('PUT', 'https://api.jsonbin.io/v3/b/' + binId, {
      'Content-Type': 'application/json',
      'X-Master-Key': src.accessKey
    }, JSON.stringify(empty));
  }).catch(function (err) {
    console.error(err.message || err);
    process.exit(1);
  });
}

main();
