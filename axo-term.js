#!/usr/bin/env node
'use strict';
// Terminal axolotl: truecolor pixel art that follows Claude Code through the local companion (server.js).
//   node axo-term.js                 live, follows the companion on 127.0.0.1:4827
//   node axo-term.js --demo          cycles through moods without a server
//   node axo-term.js --small         half-block mode for tight panes
//   node axo-term.js --color golden  leucistic | wild | golden | melanoid
//   node axo-term.js --once happy    print one frame and exit   (--frame N picks the frame)
const http = require('http');
let VERBS = {}; try { VERBS = require('./verbs.json'); } catch {}
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
let SERVER = String(opt('--server', 'http://127.0.0.1:4827'));
const SMALL = args.includes('--small'), DEMO = args.includes('--demo');
const ONCE = opt('--once', null), FRAME = +opt('--frame', 0) || 0;
const PALS = {
  leucistic: { P: [244, 166, 184], D: [217, 98, 127], B: [238, 124, 148], M: [158, 58, 85], T: [232, 100, 127], E: [43, 43, 43] },
  wild: { P: [122, 106, 79], D: [78, 70, 54], B: [95, 83, 64], M: [43, 43, 43], T: [176, 90, 90], E: [27, 27, 27] },
  golden: { P: [242, 198, 90], D: [227, 155, 46], B: [232, 176, 64], M: [154, 91, 30], T: [232, 120, 90], E: [122, 43, 43] },
  melanoid: { P: [58, 53, 68], D: [36, 31, 46], B: [46, 41, 56], M: [201, 191, 214], T: [138, 90, 122], E: [237, 230, 214] },
};
const pal = PALS[opt('--color', 'leucistic')] || PALS.leucistic;
const C = { ...pal, W: [255, 255, 255], A: [242, 177, 52], H: [232, 71, 95], G: [138, 143, 156], K: [91, 95, 107], k: [201, 204, 210],
  paper: [244, 241, 232], green: [76, 175, 80], blue: [58, 110, 165], wood: [168, 121, 74], tan: [200, 163, 90], dark: [31, 36, 48], glass: [190, 225, 255], clip: [232, 220, 200], cover: [200, 86, 122], brown: [107, 74, 58] };
const CWd = 22, CHd = 16, SX = 2, SY = 2;
const GRID = ['.D.D......D.D.', 'DD.PPPPPPPP.DD', '.DPPPPPPPPPPD.', '..PPPPPPPPPP..', '..PPPPPPPPPP..', '..PPPPPPPPPP..', '..PBPPPPPPBP..', '..PPPPPPPPPP..', '..PPPPPPPPPP..', '...PPPPPPPP...', '..PP.PPPP.PP..', '..PP......PP..', '..PP......PP..'];
const L = [[4, 4, 'E'], [5, 4, 'E'], [4, 5, 'E'], [5, 5, 'W'], [8, 4, 'E'], [9, 4, 'E'], [8, 5, 'E'], [9, 5, 'W']];
const ARC = [[5, 4, 'E'], [4, 5, 'E'], [8, 4, 'E'], [9, 5, 'E']];
const RE = [[4, 3, 'E'], [4, 4, 'E'], [5, 4, 'E'], [5, 5, 'E'], [9, 3, 'E'], [9, 4, 'E'], [8, 4, 'E'], [8, 5, 'E']];
const LOOKDOWN = [[4, 4, 'W'], [4, 5, 'E'], [5, 5, 'E'], [8, 4, 'W'], [8, 5, 'E'], [9, 5, 'E']];
const LOOKSIDE = [[4, 4, 'W'], [5, 4, 'E'], [4, 5, 'W'], [5, 5, 'E'], [8, 4, 'W'], [9, 4, 'E'], [8, 5, 'W'], [9, 5, 'E']];
const UPE = [[4, 3, 'E'], [5, 3, 'E'], [4, 4, 'E'], [5, 4, 'W'], [8, 3, 'E'], [9, 3, 'E'], [8, 4, 'E'], [9, 4, 'W']];
const SLEEP = [[4, 5, 'E'], [5, 5, 'E'], [8, 5, 'E'], [9, 5, 'E']];
const WIDE = [[4, 4, 'W'], [5, 4, 'E'], [4, 5, 'E'], [5, 5, 'E'], [8, 4, 'W'], [9, 4, 'E'], [8, 5, 'E'], [9, 5, 'E']];
const BLINK = [[4, 4, 'P'], [5, 4, 'P'], [4, 5, 'M'], [5, 5, 'M'], [8, 4, 'P'], [9, 4, 'P'], [8, 5, 'M'], [9, 5, 'M']];
const SM = [[6, 7, 'M'], [7, 7, 'M']];
const SMILE = [[5, 7, 'M'], [6, 7, 'M'], [7, 7, 'M'], [8, 7, 'M']];
const OPEN = [[5, 7, 'M'], [6, 7, 'M'], [7, 7, 'M'], [8, 7, 'M'], [6, 8, 'T'], [7, 8, 'T']];
const OH = [[6, 7, 'M'], [7, 7, 'M'], [6, 8, 'M'], [7, 8, 'M']];
const RL = [[1, 7], [1, 8], [1, 9]], RR = [[12, 7], [12, 8], [12, 9]];
const UL = [[1, 7], [1, 6], [1, 5], [1, 4], [1, 3]], UR = [[12, 7], [12, 6], [12, 5], [12, 4], [12, 3]];
const NONE = [];
// Each mood: eyes, mouth, arms (left/right, may depend on frame n), bob, sway, props(n, box)
const MOODS = {
  idle: { e: (n) => (n % 24 >= 21 ? BLINK : L), m: SM, bob: (n) => (n % 8 >= 4 ? 1 : 0) },
  happy: { e: ARC, m: OPEN, bob: (n) => -[0, 1, 2, 1][n % 4], spark: true },
  surprised: { e: WIDE, m: OH, sway: (n) => (n % 2 ? 1 : 0), bang: true },
  sleepy: { e: SLEEP, m: [[7, 7, 'M']], bob: (n) => (n % 12 >= 6 ? 1 : 0), zzz: true },
  love: { e: ARC, m: SM, hearts: true, bob: (n) => (n % 8 >= 4 ? 1 : 0) },
  dance: { e: ARC, m: OPEN, sway: (n) => [-1, 0, 1, 0][n % 4], bob: (n) => -(n % 2), al: (n) => (n % 2 ? UL : RL), ar: (n) => (n % 2 ? RR : UR) },
  jump: { e: ARC, m: OPEN, bob: (n) => -[0, 2, 3, 2][n % 4], al: UL, ar: UR, spark: true },
  wave: { e: L, m: SMILE, ar: (n) => (n % 2 ? [[12, 7], [12, 6], [12, 5], [13, 4], [13, 3]] : UR) },
  bye: { e: ARC, m: SM, al: (n) => (n % 2 ? [[1, 7], [1, 6], [1, 5], [0, 4], [0, 3]] : UL) },
  thinking: { e: UPE, m: [[7, 7, 'M'], [8, 7, 'M']], ar: [[12, 9], [12, 8], [12, 7], [11, 7]], bubble: true },
  type: { e: L, m: SM, al: NONE, ar: NONE, prop: 'laptop' },
  read: { e: LOOKDOWN, m: [[7, 7, 'M']], al: NONE, ar: NONE, prop: 'book' },
  search: { e: LOOKSIDE, m: SM, ar: UR, prop: 'lens' },
  grep: { e: LOOKDOWN, m: SM, al: NONE, ar: NONE, prop: 'panel' },
  delete: { e: RE, m: SM, ar: (n) => { const m = n % 8; return m <= 1 ? UR : m === 2 ? [[12, 7], [12, 6], [12, 5]] : RR; }, prop: 'bin' },
  save: { e: ARC, m: SM, ar: UR, prop: 'floppy' },
  test: { e: L, m: SM, al: NONE, ar: NONE, prop: 'clip' },
  build: { e: RE, m: SM, ar: (n) => (n % 4 < 2 ? UR : NONE), prop: 'anvil' },
  lint: { e: ARC, m: SM, al: NONE, ar: NONE, prop: 'broom' },
  coffee: { e: ARC, m: SM, ar: NONE, prop: 'mug' },
  install: { e: L, m: SM, al: NONE, ar: NONE, prop: 'box' },
  rename: { e: LOOKSIDE, m: SM, al: NONE, ar: NONE, prop: 'tags' },
  undo: { e: WIDE, m: OH, ar: UR, prop: 'rewind' },
  fetch: { e: L, m: SM, ar: (n) => (n % 2 ? UR : RR), prop: 'well' },
  testpass: { e: ARC, m: OPEN, al: NONE, ar: NONE, prop: 'clip', state: 'pass' },
  testfail: { e: WIDE, m: OH, al: NONE, ar: NONE, prop: 'clip', state: 'fail', sway: (n) => (n % 2 ? 1 : 0) },
  buildpass: { e: ARC, m: OPEN, al: NONE, ar: NONE, prop: 'anvil', state: 'pass' },
  buildfail: { e: WIDE, m: OH, al: NONE, ar: NONE, prop: 'anvil', state: 'fail', sway: (n) => (n % 2 ? 1 : 0) },
  eat: { e: L, m: (n) => (n % 8 >= 2 && n % 8 <= 4 ? OH : SM), al: NONE, ar: NONE, prop: 'berry' },
};
const FALL = { stype: 'type', sdance: 'dance', run: 'dance', moon: 'dance', walk: 'idle', swim: 'idle', hop: 'jump', sneak: 'thinking', seat: 'eat', rival: 'surprised' };
const moodOf = (m) => MOODS[m] ? m : (FALL[m] || 'idle');
const val = (v, n) => (typeof v === 'function' ? v(n) : v);

// Animation phases repeat on short cycles (2,3,4,6,8,10,12,24 frames).
// Cache the canvas per phase for the CURRENT mood only: bounded to <=120
// frames and reset when the mood changes, so memory stays tiny and every
// repeated tick costs a Map lookup instead of rebuilding the whole sprite.
const PHASES = 120;
let cachedMood = null, phaseCache = new Map();
function cachedFrame(moodName, n) {
  if (moodName !== cachedMood) { cachedMood = moodName; phaseCache = new Map(); }
  const ph = n % PHASES;
  let f = phaseCache.get(ph);
  if (!f) { f = frame(moodName, ph); f.paint = null; phaseCache.set(ph, f); }
  return f;
}

function frame(moodName, n) {
  const mood = MOODS[moodOf(moodName)];
  const cv = Array.from({ length: CHd }, () => Array(CWd).fill(null));
  const put = (x, y, col) => { x += SX; y += SY; if (x >= 0 && x < CWd && y >= 0 && y < CHd && col) cv[y][x] = col; };
  const box = (x, y, w, h, col) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, C[col] || col); };
  const dy = val(mood.bob, n) || 0, dx = val(mood.sway, n) || 0;
  const ov = new Map();
  for (const [x, y, k] of val(mood.m, n)) ov.set(x + ',' + y, k);
  for (const [x, y, k] of val(mood.e, n)) ov.set(x + ',' + y, k);
  GRID.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    let oy = 0;
    if (ch === 'D') oy = ((x < 7) === (n % 2 === 0)) ? -1 : 0;
    put(x + dx, y + dy + oy, C[ov.get(x + ',' + y) || ch]);
  }));
  for (const [key, k] of ov) { const [x, y] = key.split(',').map(Number); if (GRID[y][x] === '.') put(x + dx, y + dy, C[k]); }
  const arm = (cells) => cells.forEach(([x, y]) => put(x + dx, y + dy, C.B));
  arm(val(mood.al, n) || RL); arm(val(mood.ar, n) || RR);
  const m8 = n % 8, m4 = n % 4, m6 = n % 6, m10 = n % 10, m12 = n % 12;
  switch (mood.prop) {
    case 'laptop': box(4, 9, 6, 2, 'G'); put(7, 9, C.P); box(3, 11, 8, 1, 'K'); for (let i = 0; i < 7; i++) put(4 + i, 11, (n + i) % 5 === 0 ? C.A : C.k);
      put(5, 10 + (n % 2), C.B); put(8, 10 + ((n + 1) % 2), C.B); break;
    case 'book': box(3, 11, 8, 1, 'cover'); box(4, 8, 3, 3, 'paper'); box(7, 8, 3, 3, [237, 231, 220]); if (m8 > 5) box(7, 8, 2, 3, 'paper'); put(3, 9, C.B); put(10, 9, C.B); break;
    case 'lens': { const o = Math.round(Math.sin(n * 0.9)); box(14 + o, 1, 2, 2, 'glass'); put(13 + o, 3, C.G); break; }
    case 'panel': { const row = Math.floor((n % 8) / 2); box(3, 9, 8, 4, 'dark'); const W = [5, 3, 6, 2];
      for (let i = 0; i < 4; i++) { const on = i === 1 || i === 3; for (let j = 0; j < W[i]; j++) put(4 + j, 9 + i, on && i <= row ? C.A : C.k); }
      put(4 + (n % 2) * 4, 9 + row, C.glass); put(3, 10, C.B); put(10, 10, C.B); break; }
    case 'bin': { const lid = (m8 >= 3 && m8 <= 5) ? -1 : 0; box(15, 9, 3, 4, 'G'); put(16, 10, C.K); put(16, 11, C.K); box(14, 8 + lid, 4, 1, 'K');
      const F = [[14, 1], [15, 0], [15, 3], [15, 6]][m8]; if (F) { box(F[0], F[1], 2, 2, 'paper'); put(F[0] + 1, F[1], C.k); }
      if (m8 === 4 || m8 === 5) { put(15, 7 - (m8 - 4), C.k); put(17, 6 - (m8 - 4), C.k); } break; }
    case 'floppy': box(13, 1, 2, 2, 'blue'); put(13, 1, C.paper); put(14, 2, C.k);
      for (let i = 0; i < Math.min(3, Math.ceil((m8 + 1) / 3)); i++) put(15 + i, 3, C.green);
      if (m8 >= 6) { put(15, 5, C.green); put(16, 6, C.green); put(17, 5, C.green); put(18, 4, C.green); } break;
    case 'clip': { box(3, 8, 8, 5, 'clip'); box(6, 7, 2, 1, 'G');
      for (let i = 0; i < 4; i++) { const st = mood.state, mm = st === 'pass' ? 11 : st === 'fail' ? 7 : m12, ok = mm > i * 2 + 1; put(4, 9 + i, st === 'fail' && i === 3 ? C.H : ok ? C.green : C.W); for (let j = 0; j < [4, 3, 4, 3][i]; j++) put(6 + j, 9 + i, C.k); }
      if ((mood.state === 'pass' ? 11 : mood.state === 'fail' ? 0 : m12) >= 10) [[2, 7], [11, 7], [2, 11], [12, 10]].forEach(([x, y], i) => put(x, y, i % 2 ? C.A : C.H)); break; }
    case 'anvil': { box(4, 10, 6, 1, 'K'); box(6, 11, 2, 1, 'K'); box(5, 12, 4, 1, [68, 73, 85]);
      if (mood.state === 'pass') { box(10, 10, 2, 1, 'wood'); box(12, 9, 2, 2, 'G'); [[12, 6], [13, 7], [14, 6], [15, 5]].forEach(([x, y]) => put(x, y, C.green)); [[4, 9], [9, 9]].forEach(([x, y], i) => { if ((n + i) % 3) put(x, y - ((n + i) % 3), C.A); }); break; }
      if (mood.state === 'fail') { box(10, 11, 2, 1, 'wood'); box(12, 11, 2, 1, 'G'); [[6, 8 - (n % 3)], [8, 7 - (n % 4)], [7, 6 - (n % 3)]].forEach(([x, y]) => put(x, y, C.k)); [[4, 9], [9, 9]].forEach(([x, y], i) => { if ((n + i) % 2) put(x, y, C.H); }); break; }
      if (m4 < 2) { box(12, 1, 2, 1, 'G'); box(13, 2, 1, 3, 'wood'); } else { box(6, 9, 2, 1, 'G'); box(7, 5, 1, 4, 'wood');
        [[4, 9], [9, 9], [5, 8], [8, 8]].forEach(([x, y], i) => put(x + (m4 === 3 ? (i % 2 ? 1 : -1) : 0), y - (m4 === 3 ? 1 : 0), i % 2 ? C.A : C.H)); } break; }
    case 'broom': { const o = [-2, -1, 0, 1, 0, -1][m6]; box(6 + o, 6, 1, 5, 'wood'); box(5 + o, 11, 3, 2, 'tan'); put(6 + o, 5, C.B);
      for (let i = 0; i < 4; i++) put(4 + ((n * 2 + i * 3) % 10), 12, C.k); break; }
    case 'mug': box(14, 8, 2, 2, 'paper'); box(14, 8, 2, 1, 'brown'); put(16, 9, C.paper); put(13, 9, C.B);
      put(14 + (n % 2), 7 - (n % 3 === 0 ? 1 : 0), C.k); put(15 - (n % 2), 6, C.k); break;
    case 'box': { box(3, 10, 8, 3, 'tan'); box(3, 10, 8, 1, [168, 132, 63]); box(7, 10, 1, 3, [168, 132, 63]);
      if (m8 < 2) box(2, 9, 10, 1, [216, 181, 106]); else [[2, 9], [2, 8], [11, 9], [11, 8]].forEach(([x, y]) => put(x, y, [216, 181, 106]));
      if (m8 >= 3 && m8 <= 6) { const y = [10, 8, 6, 4][m8 - 3]; box(6, y, 2, 2, [108, 142, 191]); put(6, y, C.W); if (m8 >= 5) { put(5, y - 1, C.A); put(8, y - 1, C.A); } }
      if (m8 >= 6) [[12, 5], [13, 6], [14, 5], [15, 4]].forEach(([x, y]) => put(x, y, C.green));
      put(2, 11, C.B); put(11, 11, C.B); break; }
    case 'tags': { const Ax = [1, 1, 3, 6, 9, 9, 9, 9][m8], Ay = [10, 10, 8, 7, 10, 10, 10, 10][m8], Bx = [9, 9, 7, 4, 1, 1, 1, 1][m8], By = [10, 10, 9, 8, 10, 10, 10, 10][m8];
      box(Ax, Ay, 4, 2, 'paper'); box(Ax, Ay, 4, 1, [232, 100, 127]); box(Bx, By, 4, 2, 'paper'); box(Bx, By, 4, 1, [58, 110, 165]);
      if (m8 >= 5) [[0, 8], [12, 8], [6, 6]].forEach(([x, y], i) => put(x, y, i % 2 ? C.A : C.H)); break; }
    case 'rewind': { const RING = [[2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1], [0, -2], [1, -1]]; const gap = (8 - m8) % 8;
      RING.forEach(([x, y], i) => { if (i !== gap && i !== (gap + 1) % 8) put(13 + x, 1 + y, C.A); });
      put(0, 8 + (n % 2), C.k); put(0, 10 - (n % 2), C.k); break; }
    case 'well': { const by = [10, 9, 8, 7, 6, 6, 7, 8][m8]; box(15, 9, 3, 4, 'G'); [6, 7, 8].forEach((y) => { put(15, y, C.wood); put(17, y, C.wood); });
      box(14, 5, 5, 1, 'wood'); for (let y = 6; y < by; y++) put(16, y, [216, 201, 168]); put(16, by, m8 >= 3 && m8 <= 6 ? [106, 169, 224] : C.wood); break; }
    case 'berry': { const bx = 13 - Math.min(m8, 6); if (m8 <= 5) { put(bx, 8, C.H); put(bx, 7, [76, 175, 80]); } break; }
  }
  if (mood.bubble) { box(10, -2, 4, 2, 'W'); for (let i = 0; i < 3; i++) if (n % 4 >= i) put(10 + i, -1, C.K); put(9, 0, C.W); put(8, 1, C.W); }
  if (mood.spark) [[-1, 2], [14, 4], [-1, 7], [14, 9]].forEach(([x, y], i) => { if ((n + i) % 4 < 2) { put(x, y, C.A); } });
  if (mood.bang) [-1, 14].forEach((x) => [3, 4, 5, 7].forEach((y) => put(x, y, C.A)));
  if (mood.hearts) [2, 6, 10].forEach((x, i) => { const y = -1 + ((n + i * 2) % 4); put(x, y, C.H); put(x + 1, y, C.H); put(x, y + 1, C.H); put(x + 1, y + 1, C.H); });
  if (mood.zzz) [[11, 0, 2], [12, -1, 3], [13, -2, 3]].forEach(([x, y, s], i) => { if (((n + i * 4) % 12) < 8) for (let j = 0; j < s; j++) { put(x + j, y, C.D); } });
  return cv;
}

const fg = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`, bg = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
function paint(cv) {
  let out = '';
  if (!SMALL) {
    for (let y = 0; y < CHd; y++) {
      let prev = null, line = '';
      for (let x = 0; x < CWd; x++) { const c = cv[y][x]; if (c !== prev) { line += c ? bg(c) : '\x1b[49m'; prev = c; } line += '  '; }
      out += line + '\x1b[0m\n';
    }
  } else {
    for (let y = 0; y < CHd; y += 2) {
      let line = '';
      for (let x = 0; x < CWd; x++) {
        const t = cv[y][x], b = cv[y + 1] ? cv[y + 1][x] : null;
        if (!t && !b) line += '\x1b[0m ';
        else if (t && !b) line += '\x1b[49m' + fg(t) + '▀';
        else if (!t && b) line += '\x1b[49m' + fg(b) + '▄';
        else line += fg(t) + bg(b) + '▀';
      }
      out += line + '\x1b[0m\n';
    }
  }
  return out;
}
const pick = (m) => { const a = VERBS[m] || VERBS.idle || ['Puddle-pottering']; return a[Math.floor(Math.random() * a.length)]; };
const label = (s) => {
  const cols = (process.stdout.columns || 60) - 1;
  const txt = `${s.verb}${s.tool ? ' [' + s.tool + ']' : ''}${s.detail ? ' ' + s.detail : ''}`.slice(0, cols);
  return `\x1b[38;2;244;166;184m${txt}\x1b[0m`;
};

if (ONCE) {
  process.stdout.write(paint(frame(String(ONCE), FRAME)) + label({ verb: pick(moodOf(String(ONCE))), tool: String(ONCE), detail: '' }) + '\n');
  process.exit(0);
}

let st = { mood: 'idle', verb: pick('idle'), tool: '', detail: '', hold: 0 }, shownAt = Date.now(), pend = null, n = 0, note = '';
let lastText = null;   // skip terminal writes when the full screen is unchanged
const show = (o) => { st = { mood: o.mood, verb: o.verb || pick(o.mood), tool: o.tool || '', detail: o.detail || '', hold: o.hold || 0 }; shownAt = Date.now(); n = 0; };
const onEvt = (o) => { if (!o || !o.mood) return; if (Date.now() - shownAt >= Math.max(1500, st.hold)) { show(o); pend = null; } else pend = o; };
function connect() {
  if (DEMO) return;
  let req;
  try {
    const u = new URL('/events', SERVER);
    req = http.get({ host: u.hostname, port: u.port || 80, path: u.pathname, headers: { Accept: 'text/event-stream' } }, (res) => {
      note = ''; res.setEncoding('utf8'); let buf = '';
      res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const m = buf.slice(0, i); buf = buf.slice(i + 2); if (m.startsWith('data: ')) { try { onEvt(JSON.parse(m.slice(6))); } catch {} } } });
      res.on('end', () => { note = 'companion stopped, retrying...'; setTimeout(connect, 2000); });
    });
    req.on('error', () => { note = 'waiting for the companion (node server.js)...'; setTimeout(connect, 2000); });
  } catch { note = 'bad --server address'; }
}
const demoList = ['idle', 'thinking', 'type', 'read', 'grep', 'delete', 'save', 'test', 'build', 'lint', 'install', 'rename', 'undo', 'fetch', 'coffee', 'dance', 'happy', 'sleepy'];
let demoI = 0, demoAt = 0;
const out = (s) => process.stdout.write(s);
const cleanup = () => { out('\x1b[?25h\x1b[?1049l'); process.exit(0); };

function tick() {
  const now = Date.now();
  if (DEMO && now - demoAt > 4000) { demoAt = now; const m = demoList[demoI++ % demoList.length]; show({ mood: m, tool: m, verb: pick(m), detail: '', hold: 0 }); }
  if (pend && now - shownAt >= Math.max(1500, st.hold)) { show(pend); pend = null; }
  const idle = now - shownAt;
  if (!DEMO && idle > 60000 && st.mood !== 'sleepy') show({ mood: 'sleepy', tool: '', verb: pick('sleepy') });
  else if (!DEMO && idle > 8000 && !['idle', 'sleepy', 'happy'].includes(st.mood) && !pend) show({ mood: 'idle', tool: '', verb: pick('idle') });
  n++;
  const f = cachedFrame(st.mood, n);
  if (!f.paint) f.paint = paint(f);                 // ANSI for a frame is immutable
  const text = '\x1b[H' + f.paint + label(st) + '\x1b[K\n' + (note ? '\x1b[2m' + note + '\x1b[0m' : '') + '\x1b[K\x1b[J';
  if (text !== lastText) { out(text); lastText = text; }
}

// Embedded mode: the companion server can host the pane in its own process,
// saving an entire Node runtime (~45 MB RSS). Standalone mode still works.
function startTerm(opts = {}) {
  if (opts.server) SERVER = opts.server;
  out('\x1b[?1049h\x1b[?25l');
  process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
  connect();
  return setInterval(tick, 250);
}
module.exports = { startTerm, frame, moodOf, MOODS, CWd, CHd, C };

if (require.main === module) startTerm();
