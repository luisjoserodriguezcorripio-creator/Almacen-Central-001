'use strict';

const fs = require('fs');
const path = require('path');

function emptyData() {
  return {
    module: 'despacho',
    version: 1,
    updatedAt: new Date().toISOString(),
    pedidos: [],
    liveShare: null,
    liveShareLista: null
  };
}

function normalizeData(data) {
  const base = emptyData();
  if (!data || typeof data !== 'object') return base;
  return {
    module: 'despacho',
    version: 1,
    updatedAt: data.updatedAt || new Date().toISOString(),
    pedidos: Array.isArray(data.pedidos) ? data.pedidos : [],
    liveShare: data.liveShare && data.liveShare.active ? data.liveShare : null,
    liveShareLista: data.liveShareLista && data.liveShareLista.active ? data.liveShareLista : null
  };
}

function writeDespachoFile(rootDir, data) {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const payload = normalizeData(data);
  payload.updatedAt = new Date().toISOString();
  const fp = path.join(dataDir, 'despacho.json');
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return { file: fp, payload: payload };
}

function readDespachoFile(rootDir) {
  const fp = path.join(rootDir, 'data', 'despacho.json');
  if (!fs.existsSync(fp)) return emptyData();
  try {
    return normalizeData(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (e) {
    return emptyData();
  }
}

module.exports = {
  emptyData: emptyData,
  normalizeData: normalizeData,
  writeDespachoFile: writeDespachoFile,
  readDespachoFile: readDespachoFile
};
