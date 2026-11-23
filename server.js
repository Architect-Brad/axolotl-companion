#!/usr/bin/env node
'use strict';
// Local-only companion: receives Claude Code hook events, serves the axolotl page and a live event stream.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { mapEvent } = require('./mapper');
const PORT = +process.env.AXO_PORT || 4827, HOST = '127.0.0.1';
const clients = new Set();
let last = { mood: 'idle', tool: 'idle', verb: 'Puddle-pottering', detail: '', hold: 0, ts: Date.now() };
const stateDir = path.join(os.homedir(), '.axolotl');
const stateFile = path.join(stateDir, 'state.json');
try { fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 }); } catch {}
const save = () => {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(last), { mode: 0o600 });
    fs.chmodSync(stateFile, 0o600);   // tighten files created by older versions too
  } catch {}
};
const broadcast = (o) => { const s = 'data: ' + JSON.stringify(o) + '\n\n'; for (const r of clients) r.write(s); };
const file = (res, name, type) => {
  fs.readFile(path.join(__dirname, name), (e, buf) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(buf);
  });
};
const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') { res.writeHead(403); return res.end(); }  // guards against DNS rebinding
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) return file(res, 'index.html', 'text/html; charset=utf-8');
  if (req.method === 'GET' && url === '/verbs.json') return file(res, 'verbs.json', 'application/json');
  if (req.method === 'GET' && url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n'); res.write('data: ' + JSON.stringify(last) + '\n\n');
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (req.method === 'POST' && url === '/event') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { const ev = mapEvent(JSON.parse(body)); if (ev) { last = { ...ev, ts: Date.now() }; save(); broadcast(last); } } catch {}
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(404); res.end();
});
setInterval(() => { for (const r of clients) r.write(': keep-alive\n\n'); }, 15000).unref();
server.listen(PORT, HOST, () => {
  console.log('Axolotl companion running on http://' + HOST + ':' + PORT);
  console.log('Open that address in a browser, and/or run:  node axo-term.js');
  if (process.env.AXO_REDACT === '1') console.log('Detail text is redacted (AXO_REDACT=1).');
  if (process.argv.includes('--term')) {
    // Host the terminal pane in this process: one Node runtime instead of two.
    const { startTerm } = require('./axo-term');
    console.log('Embedded terminal pane active (one process).');
    startTerm({ server: `http://${HOST}:${PORT}` });
  }
});
