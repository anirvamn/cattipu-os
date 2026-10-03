"""Turns the spot's 25 fps frames into a README-sized GIF teaser.

    python scripts/promo/frames-to-gif.py <frames dir> <out.gif> [first frame] [last frame]

Every third frame (about 8 fps, 120 ms per frame: a choppy, period-true
frame rate), 400x300, a 64-colour adaptive palette per frame, so the GIF
stays small enough to sit in a README. A GIF has no sound; the MP4 keeps
the full 25 fps and the soundtrack. Called by render-ad.mjs; needs Pillow.
"""
import os
import sys

from PIL import Image

frames_dir, out = sys.argv[1], sys.argv[2]
names = sorted(n for n in os.listdir(frames_dir) if n.endswith((".png", ".jpg")))
first = int(sys.argv[3]) if len(sys.argv) > 3 else 0
last = int(sys.argv[4]) if len(sys.argv) > 4 else len(names)
names = names[first:last:3]
frames = [
    Image.open(os.path.join(frames_dir, n)).convert("RGB").resize((400, 300), Image.LANCZOS).quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    for n in names
]
frames[0].save(out, save_all=True, append_images=frames[1:], duration=120, loop=0, optimize=True, disposal=1)
print(f"gif {out} ({len(frames)} frames, {os.path.getsize(out) / 1e6:.1f} MB)")
