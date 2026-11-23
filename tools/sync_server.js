'use strict';
// Keep the package's server part in sync with the installed plugin source.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'opencode', 'axolotl.js');
const dst = path.join(__dirname, '..', 'src', 'server.ts');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log(`synced ${path.relative(process.cwd(), dst)} from opencode/axolotl.js`);
