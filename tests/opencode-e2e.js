'use strict';
// End to end with the REAL OpenCode CLI (needs `opencode` on your PATH): fake model -> OpenCode -> plugin -> companion.
//   node tests/opencode-e2e.js          (not part of `npm test` because it needs OpenCode installed)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn, spawnSync } = require('child_process'), { test, done } = require('./harness'), startModel = require('./lib/mock-model');
const ROOT = path.join(__dirname, '..'), MODEL_PORT = 4591, AXO_PORT = 4897;
const v = spawnSync('opencode', ['--version'], { encoding: 'utf8' });
if (v.error || v.status) { console.log('opencode-e2e skipped: `opencode` is not on your PATH'); process.exit(0); }
console.log('OpenCode ' + v.stdout.trim() + ' (real CLI, fake model)');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-oc-home-')), proj = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-oc-proj-'));
const debugFile = path.join(proj, 'sent.jsonl');
const script = [['bash', { command: 'echo hello', description: 'greet' }],
  ['bash', { command: `sh -c 'echo "1 failed"; exit 1' # pytest`, description: 'failing tests' }],
  ['bash', { command: 'echo ok # pytest', description: 'passing tests' }],
  ['bash', { command: 'echo built # npm run build', description: 'build' }],
  ['read', { filePath: path.join(proj, 'opencode.json') }],
  ['read', { filePath: path.join(proj, 'missing.txt') }],
  ['glob', { pattern: '*.json' }]];
fs.writeFileSync(path.join(proj, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json', autoupdate: false,
  provider: { mock: { npm: '@ai-sdk/openai-compatible', name: 'Mock', options: { baseURL: `http://127.0.0.1:${MODEL_PORT}/v1`, apiKey: 'x' }, models: { mock: { name: 'Mock', tool_call: true, limit: { context: 32000, output: 4000 } } } } },
  model: 'mock/mock', permission: { bash: 'allow', edit: 'allow', read: 'allow', glob: 'allow', grep: 'allow' } }, null, 2));
const env = { ...process.env, PWD: proj, HOME: home, USERPROFILE: home, AXO_PORT: String(AXO_PORT), AXO_DEBUG: debugFile, OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', CI: '1' };
(async () => {
  const model = await startModel(MODEL_PORT, script), companion = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const moods = [];
  http.get({ host: '127.0.0.1', port: AXO_PORT, path: '/events' }, (res) => { res.setEncoding('utf8'); let b = ''; res.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\n\n')) >= 0) { const m = b.slice(0, i); b = b.slice(i + 2); if (m.startsWith('data: ')) moods.push(JSON.parse(m.slice(6))); } }); });
  let out = '';
  try {
    await test('setup.js installs the plugin into the project', () => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'setup.js'), 'install', '--opencode', '--project'], { cwd: proj, env, encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr); assert.ok(fs.existsSync(path.join(proj, '.opencode', 'plugins', 'axolotl.js')));
    });
    await test('OpenCode runs the whole session', async () => {
      // must be async: the fake model lives in this process and has to keep answering while OpenCode runs
      out = await new Promise((resolve) => {
        // stdin must be closed (and PWD must name the project folder: OpenCode trusts it), or `run` waits for input
        const c = spawn('opencode', ['run', 'please do the things'].concat(process.env.AXO_E2E_LOGS ? ['--print-logs', '--log-level', 'DEBUG'] : []), { cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); let buf = '';
        c.stdout.on('data', (d) => { buf += d; }); c.stderr.on('data', (d) => { buf += d; });
        const t = setTimeout(() => { c.kill(); resolve(buf + '\n[timed out]'); }, 170000);
        c.on('close', () => { clearTimeout(t); resolve(buf); });
      });
      assert.match(out, /All done\./, out.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').slice(-600));
    });
    await new Promise((r) => setTimeout(r, 1000));
    const seq = moods.slice(1).map((m) => m.mood);
    console.log('       scenes the companion received: ' + seq.join(' > '));
    await test('prompt and tool scenes arrive in order', () => {
      const want = ['thinking', 'run', 'test', 'testfail', 'test', 'testpass', 'build', 'buildpass', 'read', 'read', 'surprised', 'search', 'happy'];
      let i = 0; for (const m of seq) if (m === want[i]) i++; assert.strictEqual(i, want.length, 'expected (in order) ' + want.join(' > ') + '\nsaw ' + seq.join(' > '));
    });
    await test('a failing command is reported as a failed test, a passing one as passed', () => { assert.ok(seq.includes('testfail') && seq.includes('testpass')); });
    await test('a tool that errors shows as surprised', () => assert.ok(seq.includes('surprised')));
    await test('nothing is reported twice', () => {
      const sent = fs.readFileSync(debugFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const pre = sent.filter((s) => s.hook_event_name === 'PreToolUse').length;
      assert.strictEqual(pre, script.length, `expected ${script.length} PreToolUse, got ${pre}`);
      assert.strictEqual(sent.filter((s) => s.hook_event_name === 'Stop').length, 1, 'one Stop');
      assert.strictEqual(sent.filter((s) => s.hook_event_name === 'UserPromptSubmit').length, 1, 'one prompt');
    });
    await test('setup.js uninstall removes it again', () => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'setup.js'), 'uninstall', '--opencode', '--project'], { cwd: proj, env, encoding: 'utf8' });
      assert.strictEqual(r.status, 0); assert.ok(!fs.existsSync(path.join(proj, '.opencode', 'plugins', 'axolotl.js')));
    });
  } finally { companion.kill(); model.close(); }
  done();
})();
