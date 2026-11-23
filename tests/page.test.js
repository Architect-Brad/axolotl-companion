'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch { console.log('page tests skipped: run "npm install" first (needs jsdom)'); process.exit(0); }
const { test, done } = require('./harness');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(url = 'http://127.0.0.1:4827/') {
  const errs = []; let es = null;
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
    w.addEventListener('error', (e) => errs.push(e.message));
    w.EventSource = class { constructor() { es = this; setTimeout(() => this.onopen && this.onopen(), 5); } close() {} };
  } });
  return { w: dom.window, d: dom.window.document, errs, es: () => es };
}
const hud = (d) => d.getElementById('hud').textContent.replace(/\s+/g, ' ');
const accBtn = (d, t) => [...d.querySelectorAll('#accb button')].find((b) => b.textContent.startsWith(t));
console.log('page (headless, no real browser)');
(async () => {
  const P = boot(); await sleep(300);
  await test('every mood button renders without errors', async () => {
    const btns = [...P.d.querySelectorAll('#bar button')].filter((b) => b.id !== 'sb');
    assert.ok(btns.length >= 30, 'only ' + btns.length + ' moods');
    for (const b of btns) { b.click(); await sleep(80); }
    assert.deepStrictEqual(P.errs, []);
  });
  await test('pass/fail result scenes draw their props', async () => {
    for (const m of ['testpass', 'testfail', 'buildpass', 'buildfail']) { P.w.eval(`draw('${m}')`); await sleep(350); assert.ok(P.d.getElementById('fg').children.length > 6, m); }
  });
  await test('Collection counts discoveries and replays them', async () => {
    const c = accBtn(P.d, 'Collection'); assert.match(c.textContent, /Collection \d+\/\d+/);
    c.click(); await sleep(100); const o = P.d.getElementById('coll'); assert.ok(o);
    const item = [...o.querySelectorAll('button')].find((b) => b.textContent === 'Fetch'); item.click(); await sleep(200);
    assert.strictEqual(P.w.eval('mood'), 'fetch'); assert.ok(!P.d.getElementById('coll'));
  });
  await test('task box understands phrases', async () => {
    P.d.getElementById('sb').click(); await sleep(150);
    const phrases = [['delete old files', 'delete'], ['grep for errors', 'grep'], ['git commit', 'save'], ['git revert last commit', 'undo'], ['run the tests', 'test'], ['build it', 'build'],
      ['the tests failed', 'testfail'], ['tests passed', 'testpass'], ['build failed', 'buildfail'], ['build passed', 'buildpass'], ['install the deps', 'install'], ['rename the file', 'rename'],
      ['download the report', 'fetch'], ['find a file', 'search'], ['read the logs', 'read'], ['lint the code', 'lint'], ['Reed-reading', 'read'], ['toe-dipping', 'test']];
    for (const [t, m] of phrases) { P.d.getElementById('ti').value = t; P.d.getElementById('tg').click(); await sleep(90); assert.strictEqual(P.w.eval('mood'), m, `"${t}"`); }
  });
  await test('joke commands answer in the HUD', async () => {
    for (const [t, rx] of [['excuse', /./], ['fortune', /./], ['eulogy final.js', /final\.js/], ['exorcism', /Cowd has left/]]) {
      P.d.getElementById('ti').value = t; P.d.getElementById('tg').click(); await sleep(150); assert.match(hud(P.d), rx, t);
    }
  });
  await test('tombstone appears on the delete scene', () => { P.w.eval('delName="old.js"'); assert.match(P.w.eval('delFg(6)'), /R\.I\.P\./); assert.doesNotMatch(P.w.eval('delFg(2)'), /R\.I\.P\./); });
  await test('Cowd has all his moods', () => {
    for (const m of ['angry', 'smug', 'charge', 'dead', 'sulk', 'blink', 'wink', 'proud', 'confused', 'ghost']) { P.w.eval(`setCow('${m}')`); assert.ok(P.d.getElementById('cowin').children.length > 40, m); }
  });
  await test('story: three spares unlock the cafe, banishing haunts', async () => {
    P.w.eval('rematch()'); await sleep(200);
    P.w.eval('setEp(13)'); await sleep(200); assert.ok(P.d.getElementById('choice'), 'choice buttons');
    P.w.eval('choose("spare")'); await sleep(150); assert.strictEqual(P.w.eval('ep'), 20);
    P.w.eval('choose("spare")'); await sleep(150); assert.strictEqual(P.w.eval('ep'), 20);
    P.w.eval('choose("spare")'); await sleep(150); assert.strictEqual(P.w.eval('ep'), 30); assert.match(hud(P.d), /Caf/);
    P.w.eval('choose("banish")'); await sleep(150); assert.strictEqual(P.w.eval('ep'), 21); assert.strictEqual(P.w.eval('haunted'), true);
    assert.ok(P.w.eval('STORY.size') >= 4);
    assert.deepStrictEqual(P.errs, []);
  });
  await test('live mode: events queue behind the dwell time and results show', async () => {
    const L = boot(); await sleep(300); L.d.getElementById('livebtn').click(); await sleep(2000);
    const send = (o) => L.es().onmessage({ data: JSON.stringify(o) });
    send({ mood: 'testfail', tool: 'Bash', verb: 'Pond-panicking', detail: 'npm test', hold: 1500 }); await sleep(100);
    assert.strictEqual(L.w.eval('mood'), 'testfail'); assert.match(hud(L.d), /Pond-panicking/);
    send({ mood: 'grep', tool: 'Grep', verb: 'Line-lurking', detail: 'TODO', hold: 0 }); await sleep(700);
    assert.strictEqual(L.w.eval('mood'), 'testfail', 'must wait out the hold');
    await sleep(1500); assert.strictEqual(L.w.eval('mood'), 'grep', 'queued event shows afterwards');
    assert.deepStrictEqual(L.errs, []);
  });
  await test('Live button exists only on a local address', async () => {
    const H = boot('https://example.com/'); await sleep(250); assert.ok(!H.d.getElementById('livebtn')); assert.deepStrictEqual(H.errs, []);
  });
  for (const [date, want] of [['2026-12-31', 'hat+scarf'], ['2026-07-15', 'shades'], ['2026-03-10', 'none'], ['2026-11-18', 'hat'], ['2026-01-15', 'scarf']])
    await test(`seasonal outfit on ${date}: ${want}`, async () => {
      const S = boot('http://x.test/?date=' + date); await sleep(250);
      const e = S.w.eval('EFF()'); assert.strictEqual([e.hat && 'hat', e.scarf && 'scarf', e.shades && 'shades'].filter(Boolean).join('+') || 'none', want); assert.deepStrictEqual(S.errs, []);
    });
  done();
})();
