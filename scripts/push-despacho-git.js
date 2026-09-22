'use strict';

const { runGit } = require('./push-web-users-git.js');

function pushDespachoGit(root) {
  return runGit(root, ['add', 'data/despacho.json']).then(function () {
    return runGit(root, ['commit', '-m', 'Actualizar despacho en tiempo real (cloud sync)']).then(function () {
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

module.exports = { pushDespachoGit };
