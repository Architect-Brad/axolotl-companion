'use strict';
const { spawnSync } = require('child_process'), path = require('path');
let bad = 0;
for (const f of ['mapper.test.js', 'setup.test.js', 'opencode.test.js', 'page.test.js', 'generated.test.js']) {
  console.log('\n=== ' + f + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status) bad++;
}
console.log(bad ? `\n${bad} test file(s) failed` : '\nAll test files passed');
process.exit(bad ? 1 : 0);
