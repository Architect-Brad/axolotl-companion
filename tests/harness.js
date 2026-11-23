'use strict';
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.message || e).split('\n').join('\n       ')); }
}
function done() { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
module.exports = { test, done };
