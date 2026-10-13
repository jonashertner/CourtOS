"""Render the CourtOS case-folder PNG icons used by the Word manifest.

Run:  python3 scripts/render_icons.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parent.parent / "web"

for size in (16, 32, 64, 80, 128):
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.1, fill=(25, 25, 25, 255))
    lw = max(1, int(s * 0.0625))
    for y, x2 in [(0.297, 0.578), (0.453, 0.719), (0.609, 0.719), (0.766, 0.563)]:
        d.rectangle([s * 0.281, s * y - lw / 2, s * x2, s * y + lw / 2], fill=(255, 255, 255, 255))
    r = s * 0.075
    cx, cy = s * 0.719, s * 0.297
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(143, 123, 181, 255))
    img.resize((size, size), Image.LANCZOS).save(WEB / f"icon-{size}.png")
