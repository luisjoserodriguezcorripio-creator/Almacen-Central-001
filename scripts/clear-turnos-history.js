'use strict';

/**
 * Borra todo el historial de turnos en Supabase (web_snapshots module=turnos)
 * Uso: node scripts/clear-turnos-history.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'data', 'site-config.json');

if (!fs.existsSync(configPath)) {
  console.error('No se encontró data/site-config.json');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const sb = cfg.supabase || {};
const url = String(sb.url || '').replace(/\/+$/, '');
const key = String(sb.anonKey || '').trim();

if (!url || !key) {
  console.error('Supabase no configurado en site-config.json');
  process.exit(1);
}

function todayKeyRD() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date());
}

async function pullCurrent() {
  const res = await fetch(
    url + '/rest/v1/web_snapshots?module=eq.turnos&select=data',
    {
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key
      }
    }
  );
  if (!res.ok) {
    throw new Error('Pull falló: HTTP ' + res.status);
  }
  const rows = await res.json();
  return rows && rows[0] && rows[0].data ? rows[0].data : null;
}

async function pushEmpty() {
  const today = todayKeyRD();
  const payload = {
    module: 'turnos',
    data: {
      counter: 0,
      entries: [],
      operatingDay: today,
      dashboardDay: today,
      autoResetDashboard: true,
      updatedAt: new Date().toISOString()
    },
    updated_at: new Date().toISOString()
  };
  const res = await fetch(url + '/rest/v1/web_snapshots', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Push falló: HTTP ' + res.status + ' — ' + text);
  }
}

(async function main() {
  try {
    const before = await pullCurrent();
    const count = before && before.entries ? before.entries.length : 0;
    console.log('Registros actuales:', count);
    await pushEmpty();
    const after = await pullCurrent();
    const left = after && after.entries ? after.entries.length : 0;
    console.log('OK — historial borrado. Registros restantes:', left);
    console.log('Contador:', after && after.counter);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
