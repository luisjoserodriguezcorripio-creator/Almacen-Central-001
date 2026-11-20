/**
 * Importa agenda-actividades-editar.xlsx → data/agenda-seed.json + data/agenda-personas.json
 * Uso: node scripts/import-agenda-excel.js [ruta-xlsx]
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const defaultXlsx = path.join(
  process.env.USERPROFILE || '',
  'OneDrive - Grupo Corripio',
  '01. Almacén Central',
  '16. Iniciativas',
  'Web Portal',
  'agenda-actividades-editar.xlsx'
);
const xlsxPath = process.argv[2] || defaultXlsx;

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

if (!fs.existsSync(xlsxPath)) {
  console.error('No se encontró el Excel:', xlsxPath);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath);
const personasRows = XLSX.utils.sheet_to_json(wb.Sheets['Personas por puesto'] || {}, { defval: '' });
const actRows = XLSX.utils.sheet_to_json(wb.Sheets.Actividades || {}, { defval: '' });

// Mapa puesto_base → label preferido
const labelByPuesto = {};
personasRows.forEach(function (r) {
  const puesto = String(r.puesto || '').trim();
  const label = String(r.puesto_nombre || '').trim();
  if (puesto && label) labelByPuesto[puesto] = label;
});
actRows.forEach(function (r) {
  const puesto = String(r.puesto || '').trim();
  const label = String(r.puesto_nombre || '').trim();
  if (puesto && label && !labelByPuesto[puesto]) labelByPuesto[puesto] = label;
});

// Personas: si hay filas en Personas por puesto con nombre, esas mandan;
// si no, se infieren de Actividades.
let people = personasRows
  .map(function (r) {
    return {
      puestoBase: String(r.puesto || '').trim(),
      puestoNombre: String(r.puesto_nombre || labelByPuesto[String(r.puesto || '').trim()] || '').trim(),
      nombrePersona: String(r.nombre_persona || '').trim()
    };
  })
  .filter(function (p) { return p.puestoBase && p.nombrePersona; });

if (!people.length) {
  const seen = {};
  actRows.forEach(function (r) {
    const puestoBase = String(r.puesto || '').trim();
    const nombrePersona = String(r.nombre_persona || '').trim();
    if (!puestoBase || !nombrePersona) return;
    const key = puestoBase + '|' + nombrePersona.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    people.push({
      puestoBase: puestoBase,
      puestoNombre: String(r.puesto_nombre || labelByPuesto[puestoBase] || puestoBase).trim(),
      nombrePersona: nombrePersona
    });
  });
}

// Si un puesto tiene actividades pero ninguna persona, crear slot genérico del puesto
const puestosConPersona = {};
people.forEach(function (p) { puestosConPersona[p.puestoBase] = true; });
Object.keys(labelByPuesto).forEach(function (puestoBase) {
  const hasActs = actRows.some(function (r) { return String(r.puesto || '').trim() === puestoBase; });
  if (hasActs && !puestosConPersona[puestoBase]) {
    people.push({
      puestoBase: puestoBase,
      puestoNombre: labelByPuesto[puestoBase],
      nombrePersona: ''
    });
  }
});

const puestos = people.map(function (p) {
  const personSlug = p.nombrePersona ? slugify(p.nombrePersona) : 'puesto';
  const id = p.nombrePersona ? (p.puestoBase + '__' + personSlug) : p.puestoBase;
  const label = p.nombrePersona
    ? (p.puestoNombre + ' · ' + p.nombrePersona)
    : p.puestoNombre;
  const short = p.nombrePersona ? shortName(p.nombrePersona) : (p.puestoNombre || p.puestoBase).slice(0, 18);
  return {
    id: id,
    label: label,
    short: short,
    puestoBase: p.puestoBase,
    puestoNombre: p.puestoNombre,
    nombrePersona: p.nombrePersona
  };
});

function resolvePuestoId(puestoBase, nombrePersona) {
  const name = String(nombrePersona || '').trim().toLowerCase();
  const matches = puestos.filter(function (p) { return p.puestoBase === puestoBase; });
  if (!matches.length) return null;
  if (name) {
    const hit = matches.find(function (p) {
      return String(p.nombrePersona || '').trim().toLowerCase() === name;
    });
    if (hit) return hit.id;
  }
  // Si solo hay una persona en ese puesto, usarla
  if (matches.length === 1) return matches[0].id;
  return null;
}

const templates = [];
const usedIds = {};
actRows.forEach(function (r, idx) {
  const puestoBase = String(r.puesto || '').trim();
  const actividad = String(r.actividad || '').trim();
  if (!puestoBase || !actividad) return;
  const nombrePersona = String(r.nombre_persona || '').trim();
  const puestoId = resolvePuestoId(puestoBase, nombrePersona);
  if (!puestoId) {
    console.warn('Sin persona para actividad', puestoBase, nombrePersona || '(vacío)', actividad.slice(0, 40));
    return;
  }
  let id = String(r.id || '').trim();
  // Si el id viejo era del puesto base y ahora hay persona, regenerar id único por persona
  if (!id || (nombrePersona && id.indexOf('__') < 0 && !id.startsWith(puestoId))) {
    id = puestoId + '-' + (Number(r.numero) || (idx + 1));
  }
  // Evitar colisiones si Cesar y Anthony heredan mismos ids base
  if (usedIds[id]) {
    id = puestoId + '-' + (Number(r.numero) || (idx + 1)) + '-' + slugify(nombrePersona || 'x').slice(0, 8);
  }
  usedIds[id] = true;
  templates.push({
    id: id,
    puesto: puestoId,
    numero: Number(r.numero) || 0,
    frecuencia: String(r.frecuencia || 'DIARIA').trim().toUpperCase(),
    actividad: actividad,
    minutos: Math.max(Number(r.minutos) || 0, 0),
    nombrePersona: nombrePersona || null,
    puestoBase: puestoBase
  });
});

templates.sort(function (a, b) {
  if (a.puesto !== b.puesto) return a.puesto.localeCompare(b.puesto);
  return (a.numero || 0) - (b.numero || 0);
});

const seed = {
  version: 2,
  updatedAt: new Date().toISOString(),
  source: path.basename(xlsxPath),
  puestos: puestos,
  templates: templates.map(function (t) {
    return {
      id: t.id,
      puesto: t.puesto,
      numero: t.numero,
      frecuencia: t.frecuencia,
      actividad: t.actividad,
      minutos: t.minutos
    };
  })
};

const personasOut = {
  version: 1,
  updatedAt: seed.updatedAt,
  puestos: puestos
};

fs.writeFileSync(path.join(root, 'data', 'agenda-seed.json'), JSON.stringify(seed, null, 2), 'utf8');
fs.writeFileSync(path.join(root, 'data', 'agenda-personas.json'), JSON.stringify(personasOut, null, 2), 'utf8');
fs.copyFileSync(xlsxPath, path.join(root, 'data', 'agenda-actividades-editar.xlsx'));

console.log('Excel:', xlsxPath);
console.log('Puestos/personas:', puestos.length);
puestos.forEach(function (p) {
  console.log(' -', p.id, '|', p.label);
});
console.log('Actividades:', templates.length);
const byPuesto = {};
templates.forEach(function (t) {
  byPuesto[t.puesto] = (byPuesto[t.puesto] || 0) + 1;
});
Object.keys(byPuesto).forEach(function (k) {
  console.log('   ', k, byPuesto[k]);
});
