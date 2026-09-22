'use strict';

const { execFile } = require('child_process');

function runGit(root, args) {
  return new Promise(function (resolve, reject) {
    execFile('git', args, { cwd: root, timeout: 120000, windowsHide: true }, function (err, stdout, stderr) {
      if (err) {
        var e = new Error(String(stderr || err.message || 'git failed'));
        e.code = err.code;
        e.stdout = stdout;
        e.stderr = stderr;
        return reject(e);
      }
      resolve(String(stdout || '').trim());
    });
  });
}

/**
 * Sube data/web-users.json a origin/main (asume que el archivo ya está escrito).
 */
function pushWebUsersGit(root) {
  return runGit(root, ['add', 'data/web-users.json']).then(function () {
    return runGit(root, ['commit', '-m', 'Actualizar usuarios web para acceso inmediato']).then(function () {
      return { committed: true };
    }).catch(function (err) {
      var msg = String(err.stderr || err.message || '');
      if (/nothing to commit|no changes added/i.test(msg)) {
        return { committed: false };
      }
      throw err;
    });
  }).then(function (commitResult) {
    return runGit(root, ['push', 'origin', 'main']).then(function () {
      return { committed: commitResult.committed, pushed: true };
    });
  });
}

module.exports = { pushWebUsersGit, runGit };
