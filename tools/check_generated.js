'use strict';
// Fail if generated artifacts drift from their canonical sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p));
const run = (script, out) => execFileSync(process.execPath, [path.join(root, script), out], { cwd: root, stdio: 'pipe' });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-generated-'));
try {
  // 1. Canonical sprite JSON regenerates byte-identically.
  const sprites = path.join(tmp, 'sprites.json');
  run('tools/gen_sprites.js', sprites);
  assert.ok(read('src/sprites.json').equals(fs.readFileSync(sprites)), 'src/sprites.json is stale — run npm run gen:sprites');
  console.log('  ok   sprites.json matches generator');

  // 2. TUI part regenerates byte-identically from sprites.json.
  const tui = path.join(tmp, 'tui.tsx');
  run('tools/gen_tui.js', tui);
  assert.ok(read('src/tui.tsx').equals(fs.readFileSync(tui)), 'src/tui.tsx is stale — run npm run gen:tui');
  console.log('  ok   tui.tsx matches generator');

  // 3. Page grid still matches the canonical grid (no silent art drift).
  const page = read('index.html').toString('utf8');
  const term = read('axo-term.js').toString('utf8');
  const pageGrid = JSON.parse(page.match(/const g=(\[[\s\S]*?\]);/)[1]);
  const termGrid = JSON.parse(term.match(/const GRID = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  assert.deepEqual(pageGrid, termGrid, 'index.html grid drifted from axo-term.js GRID');
  console.log('  ok   page grid matches terminal grid');

  // 4. TUI data assertions: every mood has 13x5 half-block frames + 120 phases.
  const src = read('src/tui.tsx').toString('utf8');
  const AXO = JSON.parse(src.match(/const AXO = (\{[\s\S]*?\});\n\nimport/)[1]);
  for (const [mood, data] of Object.entries(AXO)) {
    assert.equal(data.w, 13, `${mood}: width`);
    assert.equal(data.rows, 5, `${mood}: rows`);
    assert.equal(data.sequence.length, 120, `${mood}: phases`);
    for (const f of data.frames) {
      assert.equal(f.lines.length, 5, `${mood}: line count`);
      for (const line of f.lines) {
        const width = line.reduce((n, s) => n + [...s[2]].length, 0);
        assert.equal(width, 13, `${mood}: line width`);
        for (const s of line) {
          assert.equal(s.length, 3, `${mood}: span shape`);
          assert.ok(s[0] === null || /^#[0-9a-f]{6}$/i.test(s[0]), `${mood}: fg`);
          assert.ok(s[1] === null || /^#[0-9a-f]{6}$/i.test(s[1]), `${mood}: bg`);
        }
      }
    }
  }
  console.log(`  ok   ${Object.keys(AXO).length} moods, all frames 13x5 with 120 phases`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
