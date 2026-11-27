'use strict';
const { test, done } = require('./harness');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

(async () => {
  await test('generated artifacts match canonical sources (no drift)', async () => {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'check_generated.js')], { stdio: 'inherit' });
  });
  done();
})();
