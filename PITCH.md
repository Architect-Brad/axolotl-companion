# Pitch — Axolotl Companion: a community mascot plugin for OpenCode 🦎

> Goal: **showcase**, not a core feature request. Two prior "built-in mascot" issues
> (#16557, #26745) were closed as not planned; the plugin system is the supported path.

## Where to post (recommended order)

1. **GitHub Discussion** — `anomalyco/opencode` has Discussions disabled, so we opened issue #65746 upstream and seeded our own [Show and tell](https://github.com/Architect-Brad/axolotl-companion/discussions/1) thread.
2. **r/opencode** (Reddit) — `[Showcase] I built a pixel axolotl that follows my coding agent`.
3. **Hacker News** — Show HN: Axolotl Companion — a 15 MB pixel companion for OpenCode and Claude Code.
4. Only after there is traction: open/ revive a **docs plugin-listing PR** so others can discover it.

Do **not** file another "make this the official mascot" feature request. Same idea was
closed twice upstream; the pitch is "here is a working plugin, try it".

## Short post (GitHub / Reddit)

**Title:** `[SHOWCASE] Axolotl Companion — a pixel axolotl that follows your coding agent (OpenCode + Claude Code)`

**Body:**

---

I built a tiny pixel axolotl that reacts to what my coding agent is doing. It started as
a web toy and is now a real plugin package for OpenCode v2 (server + TUI parts) and a
Claude Code hook.

- **34 moods**, including pass/fail reactions: green checks on passing tests, a snapped
  hammer and smoke on failures, sleeping after 60s of quiet.
- **38 agent-aware scenes** — read, grep, edit, test, build, lint, install, delete,
  web fetch, commit, and more. Commands map to scenes via 177 pond-themed verbs.
- **Three faces**: web page (GIF export, collection, seasonal outfits), a truecolor
  terminal pane, and an OpenCode TUI sidebar sprite + `/pet` panel.
- **Brutally small**: run the page and pane in one process with `node server.js --term` —
  **15 MB RSS / 1.2% CPU** idle. The plugin itself uses ~5 MB heap and ~2 µs/event.
- **Actually tested**: 90+ unit tests plus an end-to-end test that drives the real
  OpenCode CLI with a fake model. Exported GIFs are verified by two independent
  decoders (our own LZW implementation + ffmpeg).

Install: `opencode plugin add github:Architect-Brad/axolotl-companion` (or add the repo to
`plugins` in `opencode.jsonc`), then start `node server.js` and open
<http://127.0.0.1:4827>.

No core changes, no telemetry, localhost only, every asset MIT. Happy to answer questions!

*moo — wait, gill-giggle.* 🦎

---

## HN title options

- Show HN: Axolotl Companion – a 15 MB pixel buddy that reacts to your coding agent
- Show HN: I taught an axolotl to follow Claude Code and OpenCode

## Media to attach

- [Showcase page](SHOWCASE.md) — all GIFs, screenshots, sprite sheets and terminal captures
- `exports/axolotl.gif` — GitHub renders GIFs inline
- `exports/axolotl-tools.gif` — tool reactions
- `exports/axolotl-side.gif` — side-profile animations
- `previews/terminal-showcase.png` — six terminal moods captured from the real ANSI renderer
- `exports/axolotl-front-sheet.png` — all front moods at a glance

## Pre-post checklist

- [ ] Push the repo to GitHub under the account you want credited
- [ ] Drag in at least one GIF + the terminal screenshot
- [ ] Confirm the `opencode plugin add` command works from a clean machine
- [ ] Post, then stay around for the first hour to answer questions

## Why not "official mascot"?

- #16557 (built-in mascot editor) — closed as not planned
- #26745 (built-in buddy system) — closed as not planned
- `opencode-buddy` and `skwid138/opencode-tui` already occupy the plugin space
- The docs explicitly support `opencode plugin add github:...` and `./tui` package parts

Official branding is a maintainer decision earned through adoption. This post is the
first step: people installing and *using* the plugin.
