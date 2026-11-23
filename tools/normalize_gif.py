#!/usr/bin/env python3
"""Normalize a GIF to one uniform frame delay.

Variable per-frame delays (e.g. 12cs mixed with 24cs) make some ffmpeg output
timebases round frames onto duplicate DTS values, which can drop frames on
conversion. This rewriter keeps the exact same timing by DUPLICATING frames
that held longer: every frame then occupies one equal time slot.

Usage: python3 tools/normalize_gif.py exports/axolotl-tools2.gif [out.gif]
"""
import math
import os
import struct
import sys

sys.path.insert(0, "/root/fun/cowd")
from verify_gif import parse_gif                    # our independent decoder
import cowd                                         # our LZW encoder


def write_uniform(path, frames, w, h, palette, unit):
    out = bytearray(b"GIF89a")
    out += struct.pack("<HHBBB", w, h, 0xF7, 0, 0)  # 256-entry global palette
    for i in range(256):
        r, g, b = palette[i] if i < len(palette) else (0, 0, 0)
        out += bytes((r, g, b))
    out += b"\x21\xFF\x0bNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever

    for frame in frames:
        out += b"\x21\xF9\x04\x08" + struct.pack("<H", unit) + b"\x00\x00"  # GCE
        out += b"\x2C" + struct.pack("<HHHHB", 0, 0, w, h, 0) + b"\x08"
        data = cowd.lzw_encode(frame["idx"], 8)
        for i in range(0, len(data), 255):
            block = data[i:i + 255]
            out += bytes((len(block),)) + block
        out += b"\x00"
    out += b"\x3B"
    open(path, "wb").write(out)


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    w, h, frames = parse_gif(src)
    delays = [f["delay"] for f in frames]
    unit = math.gcd(*delays) or min(delays)
    expanded = []
    for f in frames:
        for _ in range(f["delay"] // unit):
            expanded.append(dict(f))   # independent copy: idx gets remapped below
    # Each frame may carry its own local palette; merge into one global table.
    used = []
    seen = set()
    for f in frames:
        for idx in f["idx"]:
            color = tuple(f["pal"][idx])
            if color not in seen:
                seen.add(color)
                used.append(color)
    if len(used) > 256:
        raise SystemExit(f"{len(used)} distinct colors — cannot fit a 256-color GIF")
    gpal = used + [(0, 0, 0)] * (256 - len(used))
    gidx = {color: i for i, color in enumerate(used)}
    for f in expanded:
        f["idx"] = bytes(gidx[tuple(f["pal"][i])] for i in f["idx"])
    write_uniform(dst, expanded, w, h, gpal, unit)
    print(f"{src}: {len(frames)} frames, delays {sorted(set(delays))}cs "
          f"-> {dst}: {len(expanded)} frames @ {unit}cs ({os.path.getsize(dst)}B)")


if __name__ == "__main__":
    main()
