'use strict';

const fs = require('fs');
const path = require('path');

function emptyPlatformSnapshot() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    operaciones: null,
    productividad: null,
    facturas: null
  };
}

function normalizePlatformSnapshot(data) {
  const base = emptyPlatformSnapshot();
  if (!data || typeof data !== 'object') return base;
  return {
    version: 1,
    updatedAt: data.updatedAt || new Date().toISOString(),
    operaciones: data.operaciones && typeof data.operaciones === 'object' ? data.operaciones : null,
    productividad: data.productividad && typeof data.productividad === 'object' ? data.productividad : null,
    facturas: data.facturas && typeof data.facturas === 'object' ? data.facturas : null
  };
}

function writePlatformFile(rootDir, snapshot) {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const payload = normalizePlatformSnapshot(snapshot);
  payload.updatedAt = new Date().toISOString();
  const fp = path.join(dataDir, 'platform.json');
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return { file: fp, payload: payload };
}

function readPlatformFile(rootDir) {
  const fp = path.join(rootDir, 'data', 'platform.json');
  if (!fs.existsSync(fp)) return emptyPlatformSnapshot();
  try {
    return normalizePlatformSnapshot(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (e) {
    return emptyPlatformSnapshot();
  }
}

module.exports = {
  emptyPlatformSnapshot: emptyPlatformSnapshot,
  normalizePlatformSnapshot: normalizePlatformSnapshot,
  writePlatformFile: writePlatformFile,
  readPlatformFile: readPlatformFile
};
