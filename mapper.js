'use strict';
// Turns a Claude Code hook payload into { mood, tool, verb, detail, hold }.
// Everything here is local; nothing is sent anywhere.
const VERBS = require('./verbs.json');
const pick = (m) => { const a = VERBS[m] || VERBS.idle; return a[Math.floor(Math.random() * a.length)]; };
const REDACT = process.env.AXO_REDACT === '1';
// Hostile hook payloads can carry Symbols or objects with broken coercion —
// never let them escape as a "mood" or throw out of mapEvent.
const str = (v) => { try { return String(v ?? '') } catch { return '' } };
const clip = (s, n = 60) => str(s).replace(/\s+/g, ' ').trim().slice(0, n);
const base = (p) => str(p).split(/[\\/]/).pop();

const BASH_RULES = [
  [/\b(rm|rmdir|unlink|trash)\b|\bdel\s|git\s+(clean|rm)\b|git\s+branch\s+-D/, 'delete'],
  [/\bgit\s+(revert|reset|restore|checkout\s+--|stash\s+pop)\b/, 'undo'],
  [/\bgit\s+(commit|push|add|stash|tag)\b/, 'save'],
  [/\b(pytest|jest|vitest|mocha|rspec|phpunit)\b|\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b/, 'test'],
  [/\b(eslint|prettier|ruff|black|flake8|pylint|rubocop|gofmt|clippy|lint|format)\b/, 'lint'],
  [/\b(npm|yarn|pnpm|bun)\s+(run\s+)?(build|compile)\b|\b(tsc|webpack|vite|rollup|esbuild|make|cmake|gradle|mvn)\b|\bcargo\s+build\b|\bgo\s+build\b|\bdocker\s+build\b/, 'build'],
  [/\b(grep|rg|ag|ack)\b/, 'grep'],
  [/\b(npm|pip|pip3|yarn|pnpm|bun)\s+(install|add|i)\b|\bbrew\s+install\b|\bapt(-get)?\s+install\b|\bcargo\s+add\b/, 'install'],
  [/\b(curl|wget)\b|\bgit\s+(clone|pull|fetch)\b/, 'fetch'],
  [/\b(ssh|scp|rsync|ping)\b/, 'swim'],
  [/\b(ls|find|fd|tree|locate|which|pwd)\b/, 'search'],
  [/\b(cat|head|tail|less|more)\b/, 'read'],
  [/\b(sleep|wait|watch)\b/, 'sleepy'],
  [/\bmv\b|\bgit\s+mv\b|\brename\b/, 'rename'],
  [/\b(mkdir|touch|cp|chmod|ln)\b/, 'save'],
];
// Null-prototype: a tool literally named "__proto__" or "constructor" must
// not resolve to Object.prototype and produce a non-string mood.
const TOOL_MOOD = Object.assign(Object.create(null), {
  Read: 'read', Grep: 'grep', Glob: 'search', Edit: 'stype', MultiEdit: 'stype', Write: 'type', NotebookEdit: 'type',
  WebFetch: 'fetch', WebSearch: 'swim', Task: 'wave', Agent: 'wave', TodoWrite: 'test', ExitPlanMode: 'happy', AskUserQuestion: 'thinking',
});
function moodForTool(tool, input) {
  tool = str(tool);
  if (tool === 'Shell') tool = 'Bash';   // OpenCode v2 renamed the bash tool
  if (tool === 'Bash') {
    const cmd = str((input && input.command) || '');
    for (const [re, m] of BASH_RULES) if (re.test(cmd)) return m;
    return 'run';
  }
  if (TOOL_MOOD[tool]) return TOOL_MOOD[tool];
  if (/^mcp__/.test(tool || '')) return 'swim';
  return 'thinking';
}
// ---- real results: read the tool's output and decide pass/fail
function textOf(r, seen) {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  if (typeof r !== 'object') return str(r);
  if (!seen) seen = new Set();
  if (seen.has(r)) return '';          // cyclic payloads used to blow the stack
  seen.add(r);
  let t = '';
  for (const k of ['stdout', 'stderr', 'output', 'content', 'text', 'error', 'message']) if (r[k] != null) t += textOf(r[k], seen) + '\n';
  return t;
}
const FAIL_CI = /(^|\W)[1-9]\d*\s+(failed|failing|failures?|errors?)\b|AssertionError|Traceback \(most recent|npm ERR!|error TS\d+|\bBuild failed\b|compilation failed|\u2716|\u2717|Exit code [1-9]/i;
const FAIL_CS = /\bFAIL(ED)?\b/;   // uppercase only, so "0 failed" is not a failure
function resultOf(resp) {
  const o = resp && typeof resp === 'object' && !Array.isArray(resp) ? resp : {};
  if (o.interrupted === true) return 'fail';
  const ec = o.exit_code ?? o.exitCode ?? o.returncode;
  if (typeof ec === 'number') return ec === 0 ? 'pass' : 'fail';
  const t = textOf(resp); return FAIL_CI.test(t) || FAIL_CS.test(t) ? 'fail' : 'pass';
}
function detailFor(tool, input) {
  if (REDACT || !input) return '';
  if (input.command) return clip(input.command);
  if (input.file_path) return base(input.file_path);
  if (input.notebook_path) return base(input.notebook_path);
  if (input.pattern) return clip(input.pattern);
  if (input.url) { try { return new URL(input.url).host; } catch { return ''; } }
  if (input.query) return clip(input.query);
  if (input.description) return clip(input.description);
  return '';
}
function mapEvent(p) {
  const ev = p && p.hook_event_name;
  const mk = (mood, tool, detail, hold) => { mood = str(mood); return { mood, tool: str(tool || mood), verb: pick(mood), detail: str(detail || ''), hold: hold || 0 }; };
  switch (ev) {
    case 'UserPromptSubmit': return mk('thinking', 'Prompt', '', 2500);
    case 'PreToolUse': {
      const t = str(p.tool_name || 'tool');
      return mk(moodForTool(t, p.tool_input), t, detailFor(t, p.tool_input), 0);
    }
    case 'PostToolUse': {
      if (str(p.tool_name) !== 'Bash') return null;
      const m = moodForTool('Bash', p.tool_input);
      if (m !== 'test' && m !== 'build') return null;
      const r = resultOf(p.tool_response), e = mk(m + (r === 'pass' ? 'pass' : 'fail'), 'Bash', detailFor('Bash', p.tool_input), 3500);
      e.result = r; return e;
    }
    case 'PostToolUseFailure': {
      if (str(p.tool_name) === 'Bash') { const m = moodForTool('Bash', p.tool_input); if (m === 'test' || m === 'build') { const e = mk(m + 'fail', 'Bash', detailFor('Bash', p.tool_input), 3500); e.result = 'fail'; return e; } }
      return mk('surprised', str(p.tool_name || 'tool'), '', 2500);
    }
    case 'Stop': return mk('happy', 'Done', '', 4000);
    case 'SubagentStop': return mk('dance', 'Agent', '', 2500);
    case 'Notification': return mk('surprised', 'Needs you', REDACT ? '' : clip(p.message, 60), 4000);
    case 'SessionStart': return mk('wave', 'Session', '', 3000);
    case 'SessionEnd': return mk('bye', 'Session', '', 3000);
    case 'PreCompact': return mk('sleepy', 'Compact', '', 3000);
    default: return null;   // PostToolUse etc.: keep the current scene
  }
}
module.exports = { resultOf, mapEvent, moodForTool, pick, VERBS };
