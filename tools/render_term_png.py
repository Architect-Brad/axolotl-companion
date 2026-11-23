#!/usr/bin/env python3
"""Render axo-term's real ANSI output into PNG screenshots.

Usage: python3 tools/render_term_png.py
Reads `node axo-term.js --once <mood> --frame <n>` and converts the
background-coloured spaces into pixel rows — no browser needed.
"""
import os
import re
import struct
import subprocess
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "previews")
W, H, SCALE = 22, 16, 10
BG = (29, 20, 24)  # dark showcase backdrop

ANSI = re.compile(r"\x1b\[([0-9;?]*)([a-zA-Z])")


def frame(mood, n):
    raw = subprocess.check_output(
        ["node", os.path.join(ROOT, "axo-term.js"), "--once", mood, "--frame", str(n)],
        cwd=ROOT,
        text=True,
    )
    grid = [[(*BG, 255)] * W for _ in range(H)]
    for y, line in enumerate(raw.split("\n")[:H]):
        color = None
        chars = []
        i = 0
        while i < len(line):
            m = ANSI.match(line, i)
            if m:
                p = m.group(1).split(";")
                if p[0] == "48" and len(p) >= 5:
                    color = tuple(int(v) for v in p[2:5])
                elif p[0] in ("49", "0"):
                    color = None
                i = m.end()
                continue
            chars.append((line[i], color))
            i += 1
        for x in range(min(W, len(chars) // 2)):
            c = chars[2 * x][1]
            if c:
                grid[y][x] = (*c, 255)
    return grid


def png(path, grid):
    o = [[p for p in row for _ in range(SCALE)] for row in grid for _ in range(SCALE)]
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    h, w = len(o), len(o[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in r) for r in o)
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    open(path, "wb").write(data)


def main():
    shots = [("idle", 0, "terminal-idle.png"), ("happy", 2, "terminal-happy.png"),
             ("testpass", 6, "terminal-testpass.png"), ("testfail", 3, "terminal-testfail.png"),
             ("sleepy", 0, "terminal-sleepy.png"), ("dance", 1, "terminal-dance.png")]
    grids = []
    for mood, n, name in shots:
        g = frame(mood, n)
        png(os.path.join(OUT, name), g)
        grids.append(g)
        print("wrote", name)
    # montage: 3 columns × 2 rows with a 1-cell gutter
    gap = 1
    montage = []
    for row in range(2):
        trio = grids[row * 3:row * 3 + 3]
        for y in range(H):
            line = []
            for g in trio:
                line.extend(g[y])
                line.extend([(*BG, 255)] * gap)
            montage.append(line)
        for _ in range(gap):
            montage.append([(*BG, 255)] * len(montage[0]))
    png(os.path.join(OUT, "terminal-showcase.png"), montage)
    print("wrote terminal-showcase.png")


if __name__ == "__main__":
    main()
