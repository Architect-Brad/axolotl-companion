'use strict';
const assert = require('assert'), { mapEvent } = require('../mapper'), { test, done } = require('./harness');
const bash = (command, ev = 'PreToolUse', extra = {}) => mapEvent({ hook_event_name: ev, tool_name: 'Bash', tool_input: { command }, ...extra });
console.log('mapper: commands -> scenes');
(async () => {
  const rules = [['rm -rf dist', 'delete'], ['git commit -m x', 'save'], ['git stash', 'save'], ['git revert HEAD', 'undo'], ['git reset --hard', 'undo'], ['git stash pop', 'undo'],
    ['npm test', 'test'], ['pytest -q', 'test'], ['go test ./...', 'test'], ['eslint src', 'lint'], ['npm run build', 'build'], ['tsc', 'build'], ['rg TODO', 'grep'],
    ['ls -la', 'search'], ['cat a.txt', 'read'], ['curl https://x.dev', 'fetch'], ['git clone https://g/x', 'fetch'], ['npm install lodash', 'install'], ['pip install requests', 'install'],
    ['ssh me@host', 'swim'], ['mv a b', 'rename'], ['mkdir out', 'save'], ['sleep 5', 'sleepy'], ['echo hi', 'run']];
  for (const [cmd, mood] of rules) await test(`${cmd}  ->  ${mood}`, () => assert.strictEqual(bash(cmd).mood, mood));
  const tool = (t, input = {}) => mapEvent({ hook_event_name: 'PreToolUse', tool_name: t, tool_input: input });
  for (const [t, mood] of [['Read', 'read'], ['Grep', 'grep'], ['Glob', 'search'], ['Edit', 'stype'], ['Write', 'type'], ['WebFetch', 'fetch'], ['WebSearch', 'swim'], ['Task', 'wave'], ['TodoWrite', 'test'], ['mcp__x__y', 'swim'], ['Mystery', 'thinking']])
    await test(`tool ${t} -> ${mood}`, () => assert.strictEqual(tool(t).mood, mood));
  console.log('mapper: other events');
  await test('prompt -> thinking', () => assert.strictEqual(mapEvent({ hook_event_name: 'UserPromptSubmit' }).mood, 'thinking'));
  await test('Stop -> happy, held 4s', () => { const e = mapEvent({ hook_event_name: 'Stop' }); assert.strictEqual(e.mood, 'happy'); assert.strictEqual(e.hold, 4000); });
  await test('unknown events are ignored', () => assert.strictEqual(mapEvent({ hook_event_name: 'Whatever' }), null));
  await test('garbage input does not throw', () => assert.strictEqual(mapEvent(null), null));
  await test('detail: file name only, command clipped', () => {
    assert.strictEqual(tool('Edit', { file_path: '/a/b/c.ts' }).detail, 'c.ts');
    assert.ok(bash('x'.repeat(200)).detail.length <= 60);
  });
  console.log('mapper: real pass/fail');
  const post = (cmd, resp, ev = 'PostToolUse') => bash(cmd, ev, { tool_response: resp });
  const results = [['npm test', { stdout: 'Tests: 42 passed, 42 total' }, 'testpass'], ['npm test', { stdout: 'Tests: 1 failed, 41 passed' }, 'testfail'], ['pytest', { stdout: '=== 7 passed, 0 failed ===' }, 'testpass'],
    ['pytest', { stdout: 'FAILED tests/a.py' }, 'testfail'], ['go test', { exit_code: 1 }, 'testfail'], ['go test', { exit_code: 0 }, 'testpass'], ['npm run build', 'built in 2s', 'buildpass'],
    ['tsc', { stdout: 'error TS2304: Cannot find name' }, 'buildfail'], ['tsc', { stdout: 'Found 0 errors.' }, 'buildpass'], ['make', { interrupted: true }, 'buildfail']];
  for (const [cmd, resp, mood] of results) await test(`${cmd} ${JSON.stringify(resp).slice(0, 36)} -> ${mood}`, () => assert.strictEqual(post(cmd, resp).mood, mood));
  await test('failure hook on a test run -> testfail', () => assert.strictEqual(post('jest', null, 'PostToolUseFailure').mood, 'testfail'));
  await test('failure hook on another tool -> surprised', () => assert.strictEqual(post('echo hi', null, 'PostToolUseFailure').mood, 'surprised'));
  await test('plain command results are ignored', () => assert.strictEqual(post('echo hi', { stdout: 'hi' }), null));
  await test('every mood the mapper can emit has verbs', () => {
    const V = require('../verbs.json');
    for (const m of ['thinking', 'type', 'stype', 'read', 'search', 'grep', 'delete', 'save', 'test', 'build', 'lint', 'swim', 'fetch', 'install', 'rename', 'undo', 'wave', 'surprised', 'happy', 'sleepy', 'idle', 'dance', 'run', 'bye', 'testpass', 'testfail', 'buildpass', 'buildfail'])
      assert.ok(V[m] && V[m].length >= 3, 'no verbs for ' + m);
  });
  done();
})();
