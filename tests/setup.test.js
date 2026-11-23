'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process'), { test, done } = require('./harness');
const SETUP = path.join(__dirname, '..', 'setup.js');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-home-')), proj = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-proj-'));
const file = path.join(home, '.claude', 'settings.json');
const run = (args, cwd) => spawnSync(process.execPath, [SETUP, ...args], { env: { ...process.env, HOME: home, USERPROFILE: home }, cwd: cwd || proj, encoding: 'utf8' });
const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
const original = { model: 'opus', permissions: { allow: ['Bash(ls:*)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/my-audit.sh' }] }] }, statusLine: { type: 'command', command: '~/mine/status.sh' } };
const reset = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(original, null, 2)); };
const backups = () => fs.readdirSync(path.dirname(file)).filter((f) => f.includes('axolotl-backup'));
console.log('setup.js (in a throwaway home folder)');
(async () => {
  reset();
  await test('dry run changes nothing', () => { const b = fs.readFileSync(file, 'utf8'); const r = run(['install', '--dry-run']); assert.strictEqual(r.status, 0); assert.strictEqual(fs.readFileSync(file, 'utf8'), b); assert.strictEqual(backups().length, 0); });
  await test('install merges and keeps everything else', () => {
    const r = run(['install', '--statusline']); assert.strictEqual(r.status, 0, r.stderr);
    const s = read();
    assert.strictEqual(s.model, 'opus'); assert.deepStrictEqual(s.permissions, original.permissions);
    assert.strictEqual(s.hooks.PreToolUse[0].hooks[0].command, '/usr/local/bin/my-audit.sh');
    assert.strictEqual(s.hooks.PreToolUse.length, 2);
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd']) assert.ok(s.hooks[ev], 'missing ' + ev);
    assert.strictEqual(s.hooks.PostToolUse[0].matcher, 'Bash');
    assert.strictEqual(s.statusLine.command, '~/mine/status.sh', "must not replace the user's status line");
    assert.strictEqual(backups().length, 1);
  });
  await test('install is idempotent', () => { run(['install']); assert.strictEqual(read().hooks.PreToolUse.length, 2); assert.strictEqual(backups().length, 1); });
  await test('status reports 10/10', () => assert.match(run(['status']).stdout, /Hooks installed: 10\/10/));
  await test('uninstall restores the original exactly', () => { const r = run(['uninstall']); assert.strictEqual(r.status, 0); assert.deepStrictEqual(read(), original); });
  await test('backups are never overwritten (same-second install + uninstall)', () => {
    run(['install']); run(['uninstall']); run(['install']); run(['uninstall']);
    const bs = backups(), contents = bs.map((b) => fs.readFileSync(path.join(path.dirname(file), b), 'utf8'));
    assert.ok(bs.length >= 4, 'expected one backup per change, got ' + bs.length);
    assert.ok(contents.includes(JSON.stringify(original, null, 2)), 'the original must survive in a backup');
  });
  await test('invalid JSON is refused and left untouched', () => {
    fs.writeFileSync(file, '{ "hooks": '); const before = fs.readFileSync(file, 'utf8');
    const r = run(['install']); assert.notStrictEqual(r.status, 0); assert.match(r.stderr, /Nothing was changed/); assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
  });
  await test('a hooks entry of the wrong shape is refused', () => {
    fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: 'nope' } })); const r = run(['install']); assert.notStrictEqual(r.status, 0);
  });
  await test('fresh machine: file is created, status line set when none exists', () => {
    fs.rmSync(path.join(home, '.claude'), { recursive: true, force: true });
    const r = run(['install', '--statusline']); assert.strictEqual(r.status, 0, r.stderr);
    const s = read(); assert.ok(/axo-status/.test(s.statusLine.command)); assert.strictEqual(Object.keys(s.hooks).length, 10);
  });
  await test('uninstall leaves an empty settings object behind, not junk', () => { run(['uninstall']); assert.deepStrictEqual(read(), {}); });
  await test('--project writes to ./.claude/settings.json in the working folder', () => {
    const r = run(['install', '--project'], proj); assert.strictEqual(r.status, 0);
    assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8')).hooks).length, 10);
  });
  done();
})();
