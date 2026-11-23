'use strict';
// Unit tests for the OpenCode plugin using a fake OpenCode (no OpenCode install needed).
const assert = require('assert'), http = require('http'), path = require('path'), { pathToFileURL } = require('url');
const { test, done } = require('./harness'), { mapEvent } = require('../mapper');
const PLUGIN = pathToFileURL(path.join(__dirname, '..', 'opencode', 'axolotl.js')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let got = [], n = 0;
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { got.push(JSON.parse(b)); } catch {} res.writeHead(204); res.end(); }); });
const fresh = async () => { n++; return (await import(PLUGIN + '?v=' + n)).default; };      // a new copy of the plugin, like a reload
// Wait for fire-and-forget POSTs to actually land (cold localhost fetch can
// take ~300ms), then take a stable snapshot — a fixed sleep leaked events into
// the next test and made this suite fail ~2 runs out of 3.
const take = async () => {
  await sleep(350);                  // cold localhost fetch can take ~286ms here
  const deadline = Date.now() + 1000;
  let last = -1, stable = 0;
  while (Date.now() < deadline) {
    await sleep(25);
    stable = (got.length && got.length === last) ? stable + 1 : 0;
    if (stable >= 3) break;
    last = got.length;
  }
  const g = got; got = []; return g;
};
console.log('OpenCode plugin (fake OpenCode)');
srv.listen(0, '127.0.0.1', async () => {
  process.env.AXO_PORT = String(srv.address().port);
  let P = await fresh(), H = await P.server();
  await test('server() returns the three hooks', () => assert.deepStrictEqual(Object.keys(H).sort(), ['event', 'tool.execute.after', 'tool.execute.before']));
  await test('before-hook -> PreToolUse, with OpenCode names translated', async () => {
    await H['tool.execute.before']({ tool: 'bash', callID: 'c1' }, { args: { command: 'npm test', description: 'x' } });
    await H['tool.execute.before']({ tool: 'read', callID: 'c2' }, { args: { filePath: '/a/b.ts' } });
    await H['tool.execute.before']({ tool: 'context7_lookup', callID: 'c3' }, { args: {} });
    const g = await take();
    assert.deepStrictEqual(g.map((x) => x.tool_name), ['Bash', 'Read', 'mcp__context7_lookup']);
    assert.strictEqual(g[0].tool_input.command, 'npm test'); assert.strictEqual(g[1].tool_input.file_path, '/a/b.ts');
  });
  await test('after-hook on Bash carries the exit code; other tools stay quiet', async () => {
    await H['tool.execute.after']({ tool: 'bash', callID: 'c1' }, { output: '1 failed', metadata: { exit: 1 } });
    await H['tool.execute.after']({ tool: 'read', callID: 'c2' }, { output: 'text', metadata: {} });
    const g = await take(); assert.strictEqual(g.length, 1); assert.strictEqual(g[0].hook_event_name, 'PostToolUse');
    assert.strictEqual(g[0].tool_response.exit_code, 1); assert.strictEqual(g[0].tool_input.command, 'npm test', 'args remembered from the before-hook');
  });
  await test('events: each OpenCode event becomes the right companion event', async () => {
    const ev = (type, properties) => H.event({ event: { type, properties } });
    await ev('session.created', { info: { id: 's1' } }); await ev('session.created', { info: { id: 's1' } });
    await ev('message.updated', { info: { id: 'm1', role: 'user' } }); await ev('message.updated', { info: { id: 'm1', role: 'user' } }); await ev('message.updated', { info: { id: 'm2', role: 'assistant' } });
    await ev('message.part.updated', { part: { id: 'p1', type: 'tool', tool: 'read', state: { status: 'running', input: {} } } });
    await ev('message.part.updated', { part: { id: 'p1', type: 'tool', tool: 'read', state: { status: 'error', input: { filePath: '/x' }, error: 'nope' } } });
    await ev('message.part.updated', { part: { id: 'p1', type: 'tool', tool: 'read', state: { status: 'error', input: { filePath: '/x' } } } });
    await ev('session.idle', { sessionID: 's1' }); await ev('session.error', {}); await ev('permission.asked', { permission: 'external_directory' }); await ev('session.compacted', {});
    await ev('plugin.added', {}); await ev('catalog.updated', {}); await ev('session.status', { status: { type: 'busy' } });
    const names = (await take()).map((x) => x.hook_event_name);
    assert.deepStrictEqual(names, ['SessionStart', 'UserPromptSubmit', 'PostToolUseFailure', 'Stop', 'PostToolUseFailure', 'Notification', 'PreCompact']);
  });
  await test('what it sends maps to the right scenes', async () => {
    await H['tool.execute.before']({ tool: 'bash', callID: 'd1' }, { args: { command: 'pytest -q' } });
    await H['tool.execute.after']({ tool: 'bash', callID: 'd1' }, { output: '=== 2 failed ===', metadata: { exit: 1 } });
    await H['tool.execute.before']({ tool: 'webfetch', callID: 'd2' }, { args: { url: 'https://a.dev/x' } });
    await H.event({ event: { type: 'session.idle', properties: {} } });
    assert.deepStrictEqual((await take()).map((x) => mapEvent(x).mood), ['test', 'testfail', 'fetch', 'happy']);
  });
  await test('a runtime whose setup() has no hook API does not block server()', async () => {
    const P2 = await fresh(); await P2.setup({ options: {}, agent: {}, catalog: {} });
    const H2 = await P2.server(); assert.ok(H2['tool.execute.before'], 'server() must still activate');
  });
  await test('a runtime with the newer hook API registers hooks; server() then stays inert', async () => {
    const P3 = await fresh(), reg = {}; let sub = null;
    await P3.setup({ tool: { hook: async (name, fn) => { reg[name] = fn; } }, event: { subscribe: () => ({ async *[Symbol.asyncIterator]() { yield { type: 'session.idle', properties: {} }; await new Promise(() => {}); } }) } });
    assert.ok(reg['execute.before'] && reg['execute.after']);
    await reg['execute.before']({ tool: 'bash', callID: 'v1', input: { command: 'go test ./...' } });
    await reg['execute.after']({ tool: 'bash', callID: 'v1', status: 'completed', result: { output: 'ok', metadata: { exit: 0 } } });
    await reg['execute.after']({ tool: 'read', callID: 'v2', status: 'error', input: { filePath: '/z' } });
    const g = await take(); const kinds = g.map((x) => x.hook_event_name);
    assert.ok(kinds.includes('PreToolUse') && kinds.includes('PostToolUse') && kinds.includes('PostToolUseFailure') && kinds.includes('Stop'), kinds.join());
    assert.deepStrictEqual(await P3.server(), {}, 'no duplicate reporting');
  });
  await test('default + named export together do not double-report', async () => {
    const m = await import(PLUGIN + '?v=' + (++n)); const a = await m.default.server(), b = await m.AxolotlPlugin();
    assert.ok(a['tool.execute.before']); assert.deepStrictEqual(b, {});
  });
  await test('after a reload only the newest copy reports', async () => {
    const Pa = await fresh(), Ha = await Pa.server(), Pb = await fresh(), Hb = await Pb.server();
    await take(); await Ha['tool.execute.before']({ tool: 'bash', callID: 'r1' }, { args: { command: 'ls' } }); assert.strictEqual((await take()).length, 0, 'old copy must be silent');
    await Hb['tool.execute.before']({ tool: 'bash', callID: 'r2' }, { args: { command: 'ls' } }); assert.strictEqual((await take()).length, 1);
  });
  await test('companion not running: no errors, no slowdown', async () => {
    srv.close(); await sleep(50);
    const Pd = await fresh(), Hd = await Pd.server(); const t0 = Date.now();
    for (let i = 0; i < 20; i++) await Hd['tool.execute.before']({ tool: 'bash', callID: 'x' + i }, { args: { command: 'ls' } });
    assert.ok(Date.now() - t0 < 500, 'hooks must return immediately');
    await sleep(100);
  });
  done();
});
