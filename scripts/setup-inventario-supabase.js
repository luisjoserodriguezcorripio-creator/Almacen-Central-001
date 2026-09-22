'use strict';

/**
 * Configura Supabase para Inventario RF en data/site-config.json
 * Uso: node scripts/setup-inventario-supabase.js URL ANON_KEY
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'data', 'site-config.json');

const url = String(process.argv[2] || '').trim();
const anonKey = String(process.argv[3] || '').trim();

if (!url || !anonKey) {
  console.error('Uso: node scripts/setup-inventario-supabase.js https://xxx.supabase.co eyJhbG...');
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  console.error('No se encontró data/site-config.json');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
cfg.supabase = {
  enabled: true,
  url: url,
  anonKey: anonKey,
  help: 'Inventario RF — ejecutar supabase/schema.sql en el proyecto Supabase'
};
cfg.updatedAt = new Date().toISOString();
fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log('OK — Supabase activado para TODA la web en site-config.json');
console.log('1. Ejecute supabase/schema.sql en SQL Editor de Supabase');
console.log('2. Abra cualquier portal y verifique ● EN VIVO (Supabase)');
console.log('3. Publique con git push (Ctrl+F5 en la web)');
