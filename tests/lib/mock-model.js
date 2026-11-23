'use strict';
// A tiny OpenAI-compatible streaming "model": it asks for each tool in `script` in turn, then says it is done.
const http = require('http');
const sse = (res, o) => res.write('data: ' + JSON.stringify(o) + '\n\n');
const chunk = (delta, fin, extra) => ({ id: 'c1', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'mock', choices: [{ index: 0, delta, finish_reason: fin || null }], ...(extra || {}) });
module.exports = function start(port, script) {
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      if (!req.url.includes('chat/completions')) { res.writeHead(404); return res.end('{}'); }
      let j = {}; try { j = JSON.parse(body); } catch {}
      const msgs = j.messages || [], last = msgs[msgs.length - 1] || {}, hasTools = (j.tools || []).length > 0;
      const done = msgs.filter((m) => m.role === 'tool').length, usage = { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      if (hasTools && done < script.length && last.role !== 'assistant') {
        const [name, args] = script[done];
        sse(res, chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_' + done, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }));
        sse(res, chunk({}, 'tool_calls', usage));
      } else { sse(res, chunk({ role: 'assistant', content: hasTools ? 'All done.' : 'Mock title' })); sse(res, chunk({}, 'stop', usage)); }
      res.write('data: [DONE]\n\n'); res.end();
    });
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
};
