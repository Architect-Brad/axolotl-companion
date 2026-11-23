#!/usr/bin/env node
'use strict';
// Claude Code status line: a tiny axolotl face that follows what the companion last saw.
const fs = require('fs'), os = require('os'), path = require('path');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let j = {}; try { j = JSON.parse(input); } catch {}
  let s = { mood: 'idle', verb: 'Puddle-pottering', tool: '' };
  try { s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.axolotl', 'state.json'), 'utf8')); } catch {}
  const age = Date.now() - (s.ts || 0);
  let mood = s.mood;
  if (age > 120000) mood = 'sleepy'; else if (age > 15000 && !['happy', 'sleepy', 'bye'].includes(mood)) mood = 'idle';
  const blink = Math.floor(Date.now() / 1000) % 6 === 0;
  const e = blink ? '-' : '•';
  const F = {
    thinking: `(${e}_${e})…`, type: `(${e}ᴗ${e})⌨`, stype: `(${e}ᴗ${e})⌨`, read: `(${e}ᴗ${e})📖`.replace('📖', '≡'), search: `(${e}ᴥ${e})⌕`, grep: `(${e}ᴥ${e})⌕`,
    delete: `(${e}‸${e})✂`.replace('✂', '×'), save: `(${e}ᴗ${e})▣`, test: `(${e}ᴗ${e})✓`, build: `(${e}‸${e})⚒`, lint: `(${e}ᴗ${e})~`,
    swim: `(${e}ᴥ${e})≈`, happy: '(^ᴗ^)♪', surprised: '(°o°)!', sleepy: '(-ᴗ-) z', wave: `(${e}ᴗ${e})/`, bye: `(${e}ᴗ${e})/`, dance: '(^ᴗ^)♫',
  };
  const face = F[mood] || `(${e}ᴥ${e})`;
  const pink = '\x1b[38;2;244;166;184m', dim = '\x1b[2m', off = '\x1b[0m';
  const parts = [`${pink}Ψ${face}Ψ${off} ${s.verb || ''}`.trim()];
  if (s.tool && mood !== 'idle' && mood !== 'sleepy') parts.push(`${dim}${s.tool}${off}`);
  if (j.model && j.model.display_name) parts.push(`${dim}${j.model.display_name}${off}`);
  process.stdout.write(parts.join(' · ') + '\n');
});
setTimeout(() => process.exit(0), 1500).unref();
