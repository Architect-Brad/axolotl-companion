'use strict';
// Canonical sprite source: unique RGB frames + a 120-phase sequence per mood.
// Everything else (terminal pane, TUI) is generated from this file.
const fs = require('fs'), path = require('path');
const A = require('../axo-term.js');
const pkg = require('../package.json');

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const PHASES = 120;
const moods = {};

for (const name of Object.keys(A.MOODS)) {
  const frames = [], index = new Map(), sequence = [];
  for (let phase = 0; phase < PHASES; phase++) {
    const grid = A.frame(name, phase).map((row) => row.map((c) => (c ? hex(c) : null)));
    const key = JSON.stringify(grid);
    let id = index.get(key);
    if (id === undefined) { id = frames.length; index.set(key, id); frames.push(grid); }
    sequence.push(id);
  }
  moods[name] = { frames, sequence };
}

const out = {
  meta: { version: pkg.version, width: A.CWd, height: A.CHd, phases: PHASES, source: 'axo-term.js' },
  palette: Object.fromEntries(Object.entries(A.C).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, hex(v)])),
  moods,
};

const dest = process.argv[2] || path.join(__dirname, '..', 'src', 'sprites.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out) + '\n');
const total = Object.values(moods).reduce((n, m) => n + m.frames.length, 0);
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB, ${Object.keys(moods).length} moods, ${total} unique frames)`);
