# v1.3.0 — canonical sprites, half-block TUI, configurable placement 🦎

This is the architectural rebuild prompted by the deep dissection of the SVG → terminal → TUI pipeline. No more patching symptoms in a lossy downsampler.

## Highlights

- **One canonical sprite source** — `src/sprites.json` holds unique RGB frames plus a 120-phase sequence for all 29 moods, generated from `axo-term.js`. The page grid is checked against the same source on every `npm test`, so art can no longer drift silently.
- **Half-block TUI rendering** — two source pixel rows are packed into one terminal row using `▀`/`▄` with per-cell `fg`/`bg`. The sprite keeps its aspect ratio, uses **consecutive** rows (no more floating gills), and renders as one fixed-geometry `<text width={13} height={5} wrapMode="none" flexShrink={0}>` instead of dozens of shrinkable nodes.
- **Correct animation timing** — the TUI uses the canonical 120-phase sequence, so gill bob, eye blink and prop animations keep their original timing.
- **Configurable placement** — the TUI sprite can live in `sidebar.footer` (default), `session.composer.top` (above the input), or both. Configure with `options.placements` in `cli.json`. `/pet` now opens from a keymap command without a global `p` binding that could fire while typing.
- **Drift guard in tests** — `npm test` regenerates `sprites.json` and `tui.tsx` into a temp dir and fails if either committed artifact is stale, and asserts every TUI frame is 13×5 with 120 phases.

## Upgrade notes

- No changes to the server part, page, or GIF/MP4 assets.
- TUI placement options are read from `cli.json`, not `opencode.jsonc`.
- If you had custom plugin options in `opencode.jsonc`, they still feed the server part as before.

## Install

```sh
opencode plugin add github:Architect-Brad/axolotl-companion
```

See [SHOWCASE.md](SHOWCASE.md) for GIFs, screenshots and sprite sheets.

MIT licensed. Local only. No telemetry. 🦎
