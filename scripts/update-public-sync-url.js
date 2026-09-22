'use strict';

const fs = require('fs');
const path = require('path');
const { runGit } = require('./push-web-users-git.js');

function updatePublicSyncUrl(rootDir, publicUrl) {
  rootDir = rootDir || path.resolve(__dirname, '..');
  const url = String(publicUrl || '').trim().replace(/\/+$/, '');
  if (!url) return Promise.reject(new Error('URL pública vacía'));

  const fp = path.join(rootDir, 'data', 'site-config.json');
  const cfg = JSON.parse(fs.readFileSync(fp, 'utf8'));
  cfg.publicSyncBaseUrl = url;
  cfg.pollSeconds = 2;
  cfg.realtime = true;
  cfg.updatedAt = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(cfg, null, 2), 'utf8');

  return runGit(rootDir, ['add', 'data/site-config.json']).then(function () {
    return runGit(rootDir, ['commit', '-m', 'Actualizar URL publica de sincronizacion en tiempo real']).then(function () {
      return { committed: true };
    }).catch(function (err) {
      var msg = String(err.stderr || err.message || '');
      if (/nothing to commit|no changes added/i.test(msg)) return { committed: false };
      throw err;
    });
  }).then(function (commitResult) {
    return runGit(rootDir, ['push', 'origin', 'main']).then(function () {
      return { committed: commitResult.committed, pushed: true, url: url };
    });
  }).catch(function (gitErr) {
    return {
      committed: true,
      pushed: false,
      url: url,
      gitError: String(gitErr.stderr || gitErr.message || gitErr)
    };
  });
}

module.exports = { updatePublicSyncUrl };
