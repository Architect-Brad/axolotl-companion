# v1.2.1 — TUI sprite polish 🦎

This patch fixes the OpenCode TUI sidebar sprite: per-pixel truecolor spans and distinct
glyphs (eyes, glints, gills, mouth) replace the old per-row coloring that flattened the face.
The canvas is cropped to the visible art (12×15) so it fits narrow sidebars and phones.

## v1.2.0 — first public release 🦎

The axolotl is now a complete OpenCode plugin package: server part, TUI part, terminal pane,
web companion, and a generated sprite pipeline.

## Highlights

- **OpenCode v2 plugin package** — `opencode plugin add github:Architect-Brad/axolotl-companion`
  installs both the server part (event forwarding) and TUI part (sidebar sprite + `/pet` panel).
- **34 moods / 38 agent-aware scenes** with pass/fail reactions, four colour morphs, seasonal
  outfits, a collection, a story, and in-page GIF export.
- **Embedded terminal pane** — `node server.js --term` hosts the pane in the server process:
  ~15 MB RSS / 1.2% CPU idle instead of two Node runtimes (~57–72 MB).
- **Claude Code support** — safe hook installer with backups, dry-run, status and uninstall.
- **Generated sprite data** — the TUI part is generated from `axo-term.js`, so the page, terminal
  pane and sidebar cannot drift apart.
- **Brutally tested** — 90+ unit tests, a real-CLI e2e against OpenCode v2.3.0, dual-decoder GIF
  verification, and 232 terminal renders across moods/morphs/modes.

## Install

```sh
opencode plugin add github:Architect-Brad/axolotl-companion
node server.js --term      # optional: companion page + terminal pane in one process
```

Open http://127.0.0.1:4827 and press **Live**.

## Media

- [Showcase page](https://github.com/Architect-Brad/axolotl-companion/blob/master/SHOWCASE.md)
- GIFs: `axolotl.gif`, `axolotl-tools.gif`, `axolotl-side.gif`
- MP4s: `axolotl.mp4`, `axolotl-tools.mp4`, `axolotl-side.mp4`
- Sprite sheets and terminal screenshots in `exports/` and `previews/`

MIT licensed. Local only. No telemetry. 🦎
