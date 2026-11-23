#!/usr/bin/env node
'use strict';
// One-command installer for the Claude Code hooks (and optional status line). Safe by design:
// backs up first, merges instead of overwriting, refuses to touch invalid JSON, and uninstalls cleanly.
//   node setup.js install [--project] [--statusline] [--abs-node] [--dry-run]
//   node setup.js uninstall [--project] [--dry-run]
//   node setup.js status [--project]
// OpenCode: add --opencode (OpenCode only) or --all (both tools). --legacy-dir uses plugin/ instead of plugins/ for older OpenCode.
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const args = process.argv.slice(2), cmd = args[0] || 'help', has = (f) => args.includes(f);
const dir = __dirname, dry = has('--dry-run');
const settingsPath = has('--project') ? path.join(process.cwd(), '.claude', 'settings.json') : path.join(os.homedir(), '.claude', 'settings.json');
const nodeBin = has('--abs-node') ? '"' + process.execPath + '"' : 'node';
const q = (p) => '"' + p.replace(/"/g, '\\"') + '"';
const hookCmd = `${nodeBin} ${q(path.join(dir, 'hook.js'))}`, statusCmd = `${nodeBin} ${q(path.join(dir, 'axo-status.js'))}`;
const EVENTS = [['SessionStart', null], ['UserPromptSubmit', null], ['PreToolUse', '*'], ['PostToolUse', 'Bash'], ['PostToolUseFailure', '*'],
  ['SubagentStop', null], ['Notification', null], ['PreCompact', null], ['Stop', null], ['SessionEnd', null]];
// Match our own commands by their actual path, not by the folder name — the
// old /axolotl.../ regex broke install idempotence when the repo was renamed.
const oursHook = (c) => typeof c === 'string' && (c === hookCmd || c.includes(path.join(dir, 'hook.js')));
const oursStatus = (c) => typeof c === 'string' && (c === statusCmd || c.includes(path.join(dir, 'axo-status.js')));
const die = (m) => { console.error('\n' + m + '\n'); process.exit(1); };

// If settings.json is a symlink, write through it (update its target) instead
// of atomically replacing the link with a regular file.
function target() {
  try {
    if (!fs.lstatSync(settingsPath).isSymbolicLink()) return settingsPath;
    return fs.realpathSync(settingsPath);
  } catch (e) {
    if (e.code === 'ENOENT') return settingsPath;   // fresh install: nothing to resolve
    die(`${settingsPath} is a dangling or unreadable symlink (${e.message}).\nNothing was changed. Fix or remove the link, then run this again.`);
  }
}
function load() {
  let txt;
  try {
    if (!fs.existsSync(settingsPath)) return { s: {}, existed: false };
    txt = fs.readFileSync(settingsPath, 'utf8');                 // follows symlinks
  } catch (e) { die(`Could not read ${settingsPath} (${e.message}).\nNothing was changed. Fix or move it, then run this again.`); }
  if (!txt.trim()) return { s: {}, existed: true };
  try { const s = JSON.parse(txt); if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('not an object'); return { s, existed: true }; }
  catch (e) { die(`Could not parse ${settingsPath} (${e.message}).\nNothing was changed. Fix or move that file, then run this again.`); }
}
function save(s, existed) {
  if (dry) { console.log('\n(dry run: nothing written)'); return null; }
  const dest = target();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let backup = null;
  if (existed) {
    const t = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    backup = dest + '.axolotl-backup-' + t.slice(0, 8) + '-' + t.slice(8);
    const base = backup; for (let i = 1; fs.existsSync(backup); i++) backup = base + '-' + i;   // never overwrite an older backup
    fs.copyFileSync(dest, backup);
  }
  const tmp = dest + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n'); fs.renameSync(tmp, dest);
  return backup;
}
const hookList = (s, ev) => { const a = s.hooks && s.hooks[ev]; return Array.isArray(a) ? a : []; };

function install() {
  const { s, existed } = load();
  if (s.hooks != null && (typeof s.hooks !== 'object' || Array.isArray(s.hooks))) die(`"hooks" in ${settingsPath} is not an object. Nothing was changed.`);
  s.hooks = s.hooks || {}; const added = [], kept = [];
  for (const [ev, matcher] of EVENTS) {
    if (s.hooks[ev] != null && !Array.isArray(s.hooks[ev])) die(`hooks.${ev} in ${settingsPath} is not a list. Nothing was changed.`);
    const arr = s.hooks[ev] = s.hooks[ev] || [];
    if (arr.some((g) => g && Array.isArray(g.hooks) && g.hooks.some((h) => oursHook(h.command)))) { kept.push(ev); continue; }
    const g = { hooks: [{ type: 'command', command: hookCmd, timeout: 3 }] }; if (matcher) g.matcher = matcher; arr.push(g); added.push(ev);
  }
  let sl = '';
  if (has('--statusline')) {
    if (!s.statusLine || oursStatus(s.statusLine.command)) { s.statusLine = { type: 'command', command: statusCmd }; sl = 'status line: set'; }
    else sl = 'status line: left alone (you already have one; remove it first to use the axolotl)';
  }
  console.log(`Settings file: ${settingsPath}${existed ? '' : ' (will be created)'}`);
  console.log(added.length ? `Adding hooks for: ${added.join(', ')}` : 'Hooks were already installed.');
  if (kept.length && added.length) console.log(`Already present: ${kept.join(', ')}`);
  if (sl) console.log(sl);
  if (!added.length && !sl.endsWith('set')) { return; }
  const b = save(s, existed);
  if (b) console.log(`Backup: ${b}`);
  if (!dry) console.log('\nDone. Start a new Claude Code session (or run /hooks to check).\nThen: node server.js   and open http://127.0.0.1:4827');
}
function uninstall() {
  const { s, existed } = load();
  if (!existed) { console.log('No settings file, nothing to remove.'); return; }
  let removed = 0;
  if (s.hooks && typeof s.hooks === 'object') {
    for (const ev of Object.keys(s.hooks)) {
      if (!Array.isArray(s.hooks[ev])) continue;
      const keep = [];
      for (const g of s.hooks[ev]) {
        if (!g || !Array.isArray(g.hooks)) { keep.push(g); continue; }
        const rest = g.hooks.filter((h) => { const o = oursHook(h.command); if (o) removed++; return !o; });
        if (rest.length) keep.push({ ...g, hooks: rest });
      }
      if (keep.length) s.hooks[ev] = keep; else delete s.hooks[ev];
    }
    if (!Object.keys(s.hooks).length) delete s.hooks;
  }
  let sl = false;
  if (s.statusLine && oursStatus(s.statusLine.command)) { delete s.statusLine; sl = true; }
  console.log(`Settings file: ${settingsPath}`);
  console.log(`Removed ${removed} axolotl hook${removed === 1 ? '' : 's'}${sl ? ' and the status line' : ''}. Everything else was left alone.`);
  if (!removed && !sl) return;
  const b = save(s, true); if (b) console.log(`Backup: ${b}`);
}
function status() {
  const { s, existed } = load();
  const have = EVENTS.map(([ev]) => ev).filter((ev) => hookList(s, ev).some((g) => g && Array.isArray(g.hooks) && g.hooks.some((h) => oursHook(h.command))));
  console.log(`Settings file: ${settingsPath}${existed ? '' : ' (not found)'}`);
  console.log(`Hooks installed: ${have.length}/${EVENTS.length}${have.length ? ' (' + have.join(', ') + ')' : ''}`);
  console.log(`Status line: ${s.statusLine ? (oursStatus(s.statusLine.command) ? 'axolotl' : 'something else') : 'none'}`);
  const port = +process.env.AXO_PORT || 4827, sock = net.connect({ host: '127.0.0.1', port, timeout: 500 });
  sock.on('connect', () => { console.log(`Companion server: running on port ${port}`); sock.destroy(); });
  sock.on('error', () => console.log(`Companion server: not running (start it with: node server.js)`));
  sock.on('timeout', () => { console.log('Companion server: not responding'); sock.destroy(); });
}
// ---- OpenCode: one plugin file dropped into its plugin folder (auto-loaded on start)
const MARK = 'AXOLOTL-COMPANION-PLUGIN', pluginSrc = path.join(dir, 'opencode', 'axolotl.js');
const ocBase = has('--project') ? path.join(process.cwd(), '.opencode') : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opencode');
const ocDirs = ['plugins', 'plugin'].map((n) => path.join(ocBase, n));
const ocTarget = path.join(ocBase, has('--legacy-dir') ? 'plugin' : 'plugins', 'axolotl.js');
const isOurs = (f) => { try { return fs.readFileSync(f, 'utf8').includes(MARK); } catch { return false; } };
function ocInstall() {
  if (!fs.existsSync(pluginSrc)) die('opencode/axolotl.js is missing from this folder.');
  const src = fs.readFileSync(pluginSrc, 'utf8'), exists = fs.existsSync(ocTarget);
  if (exists && !isOurs(ocTarget)) die(`${ocTarget} already exists and is not the axolotl plugin.\nNothing was changed. Move it away first, or install somewhere else with --project.`);
  const same = exists && fs.readFileSync(ocTarget, 'utf8') === src;
  console.log(`OpenCode plugin: ${ocTarget}`);
  console.log(same ? 'Already installed and up to date.' : exists ? 'Updating the installed plugin.' : 'Installing the plugin.');
  if (same) return;
  if (dry) { console.log('\n(dry run: nothing written)'); return; }
  fs.mkdirSync(path.dirname(ocTarget), { recursive: true }); fs.writeFileSync(ocTarget, src);
  console.log('\nDone. Restart OpenCode, then: node server.js   and open http://127.0.0.1:4827');
}
function ocUninstall() {
  const found = ocDirs.map((d) => path.join(d, 'axolotl.js')).filter((f) => fs.existsSync(f) && isOurs(f));
  if (!found.length) { console.log(`OpenCode plugin: not installed under ${ocBase}`); return; }
  for (const f of found) { console.log(`Removing ${f}`); if (!dry) fs.unlinkSync(f); }
  if (dry) console.log('\n(dry run: nothing removed)');
}
function ocStatus() {
  const found = ocDirs.map((d) => path.join(d, 'axolotl.js')).filter((f) => fs.existsSync(f) && isOurs(f));
  console.log(`OpenCode plugin: ${found.length ? 'installed at ' + found.join(', ') : 'not installed'} (looked under ${ocBase})`);
  if (!has('--all')) serverStatus();
}
function serverStatus() {
  const port = +process.env.AXO_PORT || 4827, sock = net.connect({ host: '127.0.0.1', port, timeout: 500 });
  sock.on('connect', () => { console.log(`Companion server: running on port ${port}`); sock.destroy(); });
  sock.on('error', () => console.log('Companion server: not running (start it with: node server.js)'));
  sock.on('timeout', () => { console.log('Companion server: not responding'); sock.destroy(); });
}
const doOC = has('--opencode') || has('--all'), doCC = !has('--opencode') || has('--all');
const OC = { install: ocInstall, uninstall: ocUninstall, status: ocStatus }, CC = { install, uninstall, status };
if (OC[cmd] && CC[cmd]) { if (doOC) OC[cmd](); if (doCC) { if (doOC) console.log(''); CC[cmd](); } }
else console.log(`Axolotl companion setup\n\n  node setup.js install [--project] [--statusline] [--abs-node] [--dry-run]\n  node setup.js uninstall [--project] [--dry-run]\n  node setup.js status [--project]\n\n  --opencode    install into OpenCode (a plugin file) instead of Claude Code\n  --all         do both Claude Code and OpenCode\n  --legacy-dir  OpenCode plugin/ folder, for older OpenCode releases\n  --project     use ./.claude/settings.json instead of ~/.claude/settings.json\n  --statusline  also set the axolotl status line (only if you have none)\n  --abs-node    write the full path of this node binary into the hooks\n  --dry-run     show what would change, write nothing`);
