// AXOLOTL-COMPANION-PLUGIN
// Forwards OpenCode activity to the local axolotl companion (node server.js, default port 4827).
// Nothing leaves your machine. Remove this file (or run: node setup.js uninstall --opencode) to turn it off.
// Set AXO_PORT to use another port, AXO_DEBUG=/path/to/file to log every event it sends.
import { appendFileSync } from 'node:fs'

const PORT = (typeof process !== 'undefined' && process.env && process.env.AXO_PORT) || '4827'
const ENDPOINT = `http://127.0.0.1:${PORT}/event`
const DEBUG = typeof process !== 'undefined' && process.env && process.env.AXO_DEBUG
const TOKEN = Symbol('axolotl')            // when OpenCode reloads plugins, the newest copy wins
let activated = false, mutedUntil = 0

const live = () => globalThis.__axolotlActive === TOKEN
function post(payload) {
  if (!live()) return
  if (DEBUG) { try { appendFileSync(DEBUG, JSON.stringify(payload) + '\n') } catch {} }
  if (Date.now() < mutedUntil) return       // companion not running: stay quiet for a few seconds
  try {
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(500) : undefined })
      .catch(() => { mutedUntil = Date.now() + 3000 })
  } catch { mutedUntil = Date.now() + 3000 }
}
function activate() { if (activated) return false; activated = true; globalThis.__axolotlActive = TOKEN; return true }

// OpenCode tool names -> the names the companion's rules already know
const NAMES = { bash: 'Bash', shell: 'Bash', read: 'Read', edit: 'Edit', multiedit: 'Edit', patch: 'Edit', apply_patch: 'Edit', write: 'Write', glob: 'Glob', list: 'Glob', ls: 'Glob',
  grep: 'Grep', webfetch: 'WebFetch', websearch: 'WebSearch', codesearch: 'WebSearch', task: 'Task', todowrite: 'TodoWrite', todoread: 'TodoWrite',
  question: 'AskUserQuestion', skill: 'Read' }
function toolName(t) {
  const k = String(t || '').toLowerCase()
  if (NAMES[k]) return NAMES[k]
  return /[_-]/.test(k) ? 'mcp__' + k : (k ? k[0].toUpperCase() + k.slice(1) : 'tool')   // MCP tools look like server_tool
}
function norm(a) {
  const o = { ...(a && typeof a === 'object' ? a : {}) }
  if (o.filePath && !o.file_path) o.file_path = o.filePath
  if (typeof o.path === 'string' && !o.file_path) o.file_path = o.path
  return o
}
const textOf = (r) => (typeof r === 'string' ? r : r && typeof r === 'object' ? String(r.output ?? r.text ?? r.stdout ?? '') : '')

const seenUser = new Set(), seenFail = new Set(), seenSession = new Set()
const keep = (s) => { if (s.size > 500) s.delete(s.values().next().value) }

function onEvent(ev) {
  const t = ev && ev.type, p = (ev && (ev.properties || ev.data)) || {}
  switch (t) {
    case 'session.created': {
      const id = (p.info && p.info.id) || p.sessionID
      if (id && !seenSession.has(id)) { seenSession.add(id); keep(seenSession); post({ hook_event_name: 'SessionStart' }) }
      break
    }
    case 'message.updated': {
      const i = p.info
      if (i && i.role === 'user' && i.id && !seenUser.has(i.id)) { seenUser.add(i.id); keep(seenUser); post({ hook_event_name: 'UserPromptSubmit' }) }
      break
    }
    case 'session.inbox.enqueued': {          // v2 replaces message.updated for user prompts
      const i = p.item
      if (i && i.type === 'user' && p.inboxID && !seenUser.has(p.inboxID)) { seenUser.add(p.inboxID); keep(seenUser); post({ hook_event_name: 'UserPromptSubmit' }) }
      break
    }
    case 'message.part.updated': {      // tools that throw never reach the after-hook, so catch them here
      const part = p.part
      if (part && part.type === 'tool' && part.state && part.state.status === 'error' && part.id && !seenFail.has(part.id)) {
        seenFail.add(part.id); keep(seenFail)
        post({ hook_event_name: 'PostToolUseFailure', tool_name: toolName(part.tool), tool_input: norm(part.state.input) })
      }
      break
    }
    case 'session.idle': case 'session.execution.succeeded': case 'session.execution.failed': post({ hook_event_name: 'Stop' }); break
    case 'session.error': post({ hook_event_name: 'PostToolUseFailure', tool_name: 'Error', tool_input: {} }); break
    case 'permission.asked': case 'permission.updated':
      post({ hook_event_name: 'Notification', message: String(p.permission || p.title || p.type || 'permission needed').slice(0, 60) }); break
    case 'session.compacted': post({ hook_event_name: 'PreCompact' }); break
  }
}

const argsByCall = new Map()
function v1Hooks() {
  return {
    'tool.execute.before': async (input, output) => {
      const args = norm(output && output.args)
      if (input && input.callID) { argsByCall.set(input.callID, args); if (argsByCall.size > 200) argsByCall.delete(argsByCall.keys().next().value) }
      post({ hook_event_name: 'PreToolUse', tool_name: toolName(input && input.tool), tool_input: args })
    },
    'tool.execute.after': async (input, output) => {
      const name = toolName(input && input.tool)
      const args = (input && input.args) ? norm(input.args) : argsByCall.get(input && input.callID) || {}
      if (input && input.callID) argsByCall.delete(input.callID)
      if (name !== 'Bash') return            // only builds and tests care about the result
      const m = (output && output.metadata) || {}
      post({ hook_event_name: 'PostToolUse', tool_name: name, tool_input: args,
        tool_response: { stdout: textOf(output && output.output), exit_code: typeof m.exit === 'number' ? m.exit : undefined } })
    },
    event: async ({ event }) => onEvent(event),
  }
}

// One default export that speaks both plugin generations. OpenCode 1.19 calls server(); a runtime with the
// newer hook API calls setup(). Whichever has real hooks activates; the other stays inert (no duplicate events).
export default {
  id: 'axolotl',
  async server() { return activate() ? v1Hooks() : {} },
  async setup(ctx) {
    try {
      if (!ctx || !ctx.tool || typeof ctx.tool.hook !== 'function' || !activate()) return
      const calls = new Map()
      await ctx.tool.hook('execute.before', async (e) => {
        const args = norm(e && e.input); if (e && e.callID) calls.set(e.callID, args)
        post({ hook_event_name: 'PreToolUse', tool_name: toolName(e && e.tool), tool_input: args })
      })
      await ctx.tool.hook('execute.after', async (e) => {
        const name = toolName(e && e.tool), args = norm((e && e.input) || (e && e.callID && calls.get(e.callID)))
        if (e && e.callID) calls.delete(e.callID)
        if (e && e.status === 'error') { post({ hook_event_name: 'PostToolUseFailure', tool_name: name, tool_input: args }); return }
        if (name !== 'Bash') return
        const r = (e && e.result) || {}, meta = r.metadata || {}
        post({ hook_event_name: 'PostToolUse', tool_name: name, tool_input: args,
          tool_response: { stdout: textOf(r), exit_code: typeof meta.exit === 'number' ? meta.exit : (typeof r.exit === 'number' ? r.exit : undefined) } })
      })
      if (ctx.event && typeof ctx.event.subscribe === 'function') {
        ;(async () => { for await (const ev of ctx.event.subscribe({})) onEvent(ev) })().catch(() => {})
      }
    } catch {}
  },
}
// Older OpenCode releases load named function exports instead of a default object.
export const AxolotlPlugin = async () => (activate() ? v1Hooks() : {})
