#!/usr/bin/env node
'use strict';
// Claude Code hook: forwards the event JSON (stdin) to the local companion. Prints nothing, always exits 0.
const http = require('http');
const PORT = +process.env.AXO_PORT || 4827;
let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { body += d; });
process.stdin.on('end', () => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/event', method: 'POST', timeout: 400,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => { r.resume(); r.on('end', () => process.exit(0)); });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
  setTimeout(() => process.exit(0), 600).unref();
});
setTimeout(() => process.exit(0), 1500).unref();
