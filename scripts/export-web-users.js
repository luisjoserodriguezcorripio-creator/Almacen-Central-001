'use strict';

const fs = require('fs');
const path = require('path');

const PRIMARY_ADMIN_USERNAME = 'luisjose';

function isPrimaryAdminUser(user) {
  if (!user) return false;
  if (user.isPrimaryAdmin) return true;
  return String(user.username || '').toLowerCase() === PRIMARY_ADMIN_USERNAME.toLowerCase();
}

function exportStaffUsers(users) {
  var seen = Object.create(null);
  var out = [];
  (Array.isArray(users) ? users : []).filter(function (u) {
    return u && u.active !== false && !isPrimaryAdminUser(u);
  }).forEach(function (u) {
    var key = String(u.username || '').toLowerCase().trim();
    if (!key || seen[key]) return;
    seen[key] = 1;
    out.push({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      passwordHash: u.passwordHash,
      areas: u.areas || [],
      active: u.active !== false,
      extraPermissions: u.extraPermissions || []
    });
  });
  return out;
}

function buildWebUsersPayload(users) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    users: exportStaffUsers(users)
  };
}

function writeWebUsersFile(rootDir, users) {
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const payload = buildWebUsersPayload(users);
  const fp = path.join(dataDir, 'web-users.json');
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return { file: fp, payload: payload };
}

function readUsersFile(rootDir) {
  const fp = path.join(rootDir, 'data', 'users.json');
  if (!fs.existsSync(fp)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const users = readUsersFile(root);
  const result = writeWebUsersFile(root, users);
  console.log('Exportados ' + result.payload.users.length + ' usuario(s) -> ' + result.file);
}

module.exports = {
  PRIMARY_ADMIN_USERNAME: PRIMARY_ADMIN_USERNAME,
  exportStaffUsers: exportStaffUsers,
  buildWebUsersPayload: buildWebUsersPayload,
  writeWebUsersFile: writeWebUsersFile,
  readUsersFile: readUsersFile
};
