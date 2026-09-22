'use strict';

const fs = require('fs');
const path = require('path');
const { setupAveriasCloud } = require('./setup-averias-cloud.js');

function readSecrets(rootDir) {
  const candidates = [
    path.join(rootDir, 'data', 'sync-secrets.local.json'),
    path.join(rootDir, 'scripts', 'sync-secrets.local.json')
  ];
  for (let i = 0; i < candidates.length; i++) {
    const fp = candidates[i];
    if (!fs.existsSync(fp)) continue;
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      console.warn('[Cloud] No se pudo leer', fp, e.message);
    }
  }
  const envKey = String(process.env.JSONBIN_MASTER_KEY || process.env.JSONBIN_KEY || '').trim();
  if (envKey) return { jsonbinMasterKey: envKey };
  return null;
}

function isCloudEnabled(rootDir) {
  const fp = path.join(rootDir, 'data', 'site-config.json');
  if (!fs.existsSync(fp)) return false;
  try {
    const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const jb = cfg && cfg.averiasJsonBin;
    if (jb && jb.enabled && jb.binId && jb.accessKey) return true;
    const fb = cfg && cfg.firebase;
    if (fb && fb.enabled && fb.databaseURL) return true;
    if (String(cfg.publicSyncBaseUrl || '').trim()) return true;
  } catch (e) { /* noop */ }
  return false;
}

function ensureAveriasCloud(rootDir, options) {
  options = options || {};
  rootDir = rootDir || path.resolve(__dirname, '..');
  if (isCloudEnabled(rootDir) && !options.force) {
    return Promise.resolve({ ok: true, skipped: true, reason: 'already-configured' });
  }
  const secrets = readSecrets(rootDir);
  const masterKey = secrets && String(secrets.jsonbinMasterKey || secrets.masterKey || '').trim();
  if (!masterKey) {
    return Promise.resolve({
      ok: false,
      skipped: true,
      reason: 'no-master-key',
      hint: 'Cree data/sync-secrets.local.json con { "jsonbinMasterKey": "SU-CLAVE" } o use SETUP-AVERIAS-CLOUD.bat'
    });
  }
  return setupAveriasCloud(rootDir, masterKey, options).then(function (result) {
    console.log('[Cloud] JSONBin activo — bin', result.binId);
    if (result.git && result.git.pushed) {
      console.log('[Cloud] site-config.json publicado en GitHub');
    } else if (result.gitError) {
      console.warn('[Cloud] Git push pendiente:', result.gitError);
    }
    return result;
  });
}

if (require.main === module) {
  ensureAveriasCloud(process.cwd()).then(function (r) {
    if (r.skipped && r.reason === 'no-master-key') {
      console.log(r.hint);
      process.exit(0);
    }
    if (!r.ok && !r.skipped) process.exit(1);
  }).catch(function (e) {
    console.error(e.message || e);
    process.exit(1);
  });
}

module.exports = { ensureAveriasCloud, readSecrets, isCloudEnabled };
