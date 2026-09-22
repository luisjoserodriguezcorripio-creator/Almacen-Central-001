'use strict';

const fs = require('fs');
const path = require('path');

function emptySnapshot() {
  return {
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
}

function normalizeSnapshot(data) {
  const base = emptySnapshot();
  if (!data || typeof data !== 'object') return base;
  return {
    version: 1,
    updatedAt: data.updatedAt || new Date().toISOString(),
    incidences: Array.isArray(data.incidences) ? data.incidences : [],
    damages: Array.isArray(data.damages) ? data.damages : [],
    securityIncidents: Array.isArray(data.securityIncidents) ? data.securityIncidents : [],
    audits5s: Array.isArray(data.audits5s) ? data.audits5s : [],
    despachoAudits: Array.isArray(data.despachoAudits) ? data.despachoAudits : [],
    equipmentInspections: Array.isArray(data.equipmentInspections) ? data.equipmentInspections : [],
    equipmentRegistry: data.equipmentRegistry && typeof data.equipmentRegistry === 'object' ? data.equipmentRegistry : {}
  };
}

function writeAveriasFile(rootDir, snapshot) {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const payload = normalizeSnapshot(snapshot);
  payload.updatedAt = new Date().toISOString();
  const fp = path.join(dataDir, 'averias.json');
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return { file: fp, payload: payload };
}

function readAveriasFile(rootDir) {
  const fp = path.join(rootDir, 'data', 'averias.json');
  if (!fs.existsSync(fp)) return emptySnapshot();
  try {
    return normalizeSnapshot(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch (e) {
    return emptySnapshot();
  }
}

module.exports = {
  emptySnapshot: emptySnapshot,
  normalizeSnapshot: normalizeSnapshot,
  writeAveriasFile: writeAveriasFile,
  readAveriasFile: readAveriasFile
};
