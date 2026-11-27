'use strict';
// Generate the TUI part from canonical src/sprites.json — one source of truth.
// Two source pixel rows are packed into each terminal row using ▀/▄ with
// per-cell fg+bg, so the sprite keeps its aspect ratio in a 5-row footer.
const fs = require('fs'), path = require('path');
const SPRITES = require('../src/sprites.json');
const VERSION = require('../package.json').version;

const W = 13, LINES = 5;
const AXO = {};

for (const [name, data] of Object.entries(SPRITES.moods)) {
  // Union crop across every unique frame so props can't shift the sprite.
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (const grid of data.frames) for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) { minX = minY = 0; maxX = W - 1; maxY = 9; }
  minY = Math.max(minY, 2);
  maxY = Math.min(maxY, minY + 9);                 // 10 source rows -> 5 output lines
  if (maxY - minY < 9) maxY = minY + 9;
  if (maxX - minX > W - 1) maxX = minX + W - 1;

  const frames = [], index = new Map(), sequence = [];
  for (const sourceId of data.sequence) {
    const grid = data.frames[sourceId];
    const lines = [];
    for (let y = minY; y <= maxY; y += 2) {
      const spans = [];
      let cur = null, text = '';
      for (let x = minX; x <= maxX; x++) {
        const top = grid[y][x], bot = grid[y + 1] ? grid[y + 1][x] : null;
        let ch, fg, bg;
        if (top && bot) { ch = '▀'; fg = top; bg = bot; }
        else if (top) { ch = '▀'; fg = top; bg = null; }
        else if (bot) { ch = '▄'; fg = bot; bg = null; }
        else { ch = ' '; fg = null; bg = null; }
        const key = JSON.stringify([fg, bg, ch]);
        if (key !== cur) { if (text.length) { const [f, b] = JSON.parse(cur); spans.push([f, b, text]); } cur = key; text = ''; }
        text += ch;
      }
      if (text.length) { const [f, b] = JSON.parse(cur); spans.push([f, b, text]); }
      lines.push(spans);
    }
    const key = JSON.stringify(lines);
    let id = index.get(key);
    if (id === undefined) { id = frames.length; index.set(key, id); frames.push({ lines }); }
    sequence.push(id);
  }
  AXO[name] = { w: W, rows: LINES, frames, sequence };
}

const body = `
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show, For } from "solid-js"

const TICK = 250
const QUIET_IDLE = 8_000
const SLEEP_AFTER = 60_000
const BUSY = new Set(["happy", "surprised", "testpass", "testfail", "buildpass", "buildfail"])
const SLOTS = new Set(["sidebar.footer", "session.composer.top"])

export default Plugin.define({
  id: "axolotl.tui",
  setup(context) {
    const [mood, setMood] = createSignal("idle")
    const [tick, setTick] = createSignal(0)
    const [last, setLast] = createSignal(Date.now())
    const [pets, setPets] = createSignal(0)
    context.ui.toast.show({ title: "Axolotl", message: "v${VERSION} loaded 🦎", variant: "success", duration: 3000 })

    const timers = new Set()
    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); fn() }, ms)
      timers.add(t); return t
    }
    const react = (m, hold) => {
      setLast(Date.now()); setMood(m)
      if (hold) later(() => setMood("idle"), hold)
    }

    const stopEvents = context.data.listen(({ details }) => {
      const t = String(details?.type ?? "")
      if (t.includes("execution.succeeded")) return react("happy", 4000)
      if (t.includes("execution.failed") || t.includes("error")) return react("surprised", 2500)
      if (t.includes("tool") || t.startsWith("session.") || t.includes("message")) {
        setLast(Date.now())
        if (mood() === "sleepy" || mood() === "idle") setMood("thinking")
      }
    })

    let n = 0
    const stopClock = setInterval(() => {
      n++; setTick(n)
      if (BUSY.has(mood())) return
      const quiet = Date.now() - last()
      if (quiet > SLEEP_AFTER) setMood("sleepy")
      else if (quiet > QUIET_IDLE) setMood("idle")
      else if (mood() === "idle") setMood("thinking")
    }, TICK)

    const frame = () => {
      const m = AXO[mood()] || AXO.idle
      return m.frames[m.sequence[tick() % m.sequence.length] || 0]
    }
    const Sprite = () => {
      const f = frame()
      return (
        <text width={f.w} height={f.rows} wrapMode="none" flexShrink={0} selectable={false}>
          <For each={f.lines}>{(line, i) => (
            <>
              <For each={line}>{([fg, bg, s]) => (
                <span fg={fg ?? undefined} bg={bg ?? undefined}>{s}</span>
              )}</For>
              {i() < f.lines.length - 1 ? "\\n" : ""}
            </>
          )}</For>
        </text>
      )
    }

    // Configure in cli.json: { "plugins": [{ "package": "...", "options": { "placements": ["sidebar.footer", "session.composer.top"] } }] }
    const raw = context.options?.placements
    const wanted = new Set(Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : ["sidebar.footer"])
    const disposers = []
    for (const slot of wanted) {
      if (!SLOTS.has(slot)) continue
      disposers.push(context.ui.slot({ append: slot, render: () => <Sprite /> }))
    }

    const Axo = () => {
      context.keymap.layer(() => ({
        commands: [{
          id: "axolotl.pet.press",
          title: "Pet Axolotl",
          run: () => {
            setPets((p) => p + 1); react("happy", 1200)
            context.ui.toast.show({ message: "gill-giggles 🦎", variant: "success", duration: 1500 })
          },
        }],
      }))
      return (
        <box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <text fg="#f4a6b8">AXOLOTL — press Enter to pet</text>
          <Sprite />
          <text fg="#9a938a">pets: {pets()}</text>
        </box>
      )
    }
    disposers.push(context.ui.slot({
      append: "session.panel",
      render: (panel) => <Show when={panel.name === "axolotl.pet"}><Axo /></Show>,
    }))
    disposers.push(context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [{
            id: "axolotl.pet",
            title: "Pet Axolotl",
            group: "Axolotl",
            slash: { name: "pet", aliases: ["axolotl"] },
            run: () => context.ui.panel.open("axolotl.pet"),
          }],
        }))
        return null
      },
    }))

    return () => {
      stopEvents(); clearInterval(stopClock)
      for (const t of timers) clearTimeout(t)
      for (const dispose of disposers) dispose()
    }
  },
})
`;

const out = process.argv[2] || path.join(__dirname, '..', 'src', 'tui.tsx');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `// GENERATED by tools/gen_tui.js from src/sprites.json — do not edit.\nconst AXO = ${JSON.stringify(AXO)};\n${body}`);
const count = Object.values(AXO).reduce((n, m) => n + m.frames.length, 0);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB, ${Object.keys(AXO).length} moods, ${count} unique TUI frames)`);
