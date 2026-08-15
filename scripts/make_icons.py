#!/usr/bin/env python3
"""Generate PWA icons for Period Tracker.

Rounds of rose gradient + white teardrop, rendered at 4x supersampling.
Standard icons get a rounded-rect silhouette; maskable icons are full-bleed
with the mark inside the 60% safe zone.
"""
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

TOP = (244, 63, 94)     # rose-500
BOTTOM = (190, 18, 60)  # rose-700
WHITE = (255, 255, 255)


def gradient(size):
    img = Image.new("RGB", (size, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        c = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        for x in range(size):
            img.putpixel((x, y), c)
    return img


def droplet_points(size, cx, cy, r):
    """Teardrop = bottom circle union tangent lines to an apex above it."""
    apex_y = cy - r * 2.05
    d = cy - apex_y
    gamma = math.acos(r / d)
    theta0 = math.atan2(apex_y - cy, 0.0)  # straight up = -pi/2 in image coords
    t1 = theta0 - gamma
    t2 = theta0 + gamma
    pts = [(cx, apex_y)]
    # arc from t2 clockwise (through the bottom) to t1 + 2pi
    steps = 140
    for i in range(steps + 1):
        a = t2 + (2 * math.pi - 2 * gamma) * i / steps
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def render(size, maskable):
    ss = 4
    S = size * ss
    img = gradient(S).convert("RGBA")
    overlay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if not maskable:
        # rounded-rect transparent background: mask the gradient itself
        radius = int(S * 0.22)
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=radius, fill=255)
        img.putalpha(mask)

    if maskable:
        cx, cy, r = S / 2, S * 0.56, S * 0.30  # keep mark inside 60% safe zone
    else:
        cx, cy, r = S / 2, S * 0.55, S * 0.36

    draw.polygon(droplet_points(S, cx, cy, r), fill=WHITE + (255,))
    # small soft highlight inside the droplet
    hx, hy, hr = cx - r * 0.42, cy - r * 0.18, r * 0.22
    draw.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=(253, 164, 175, 150))

    img = Image.alpha_composite(img, overlay)
    return img.resize((size, size), Image.LANCZOS)


def main():
    jobs = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("apple-touch-icon.png", 180, False),
        ("icon-maskable-192.png", 192, True),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, maskable in jobs:
        render(size, maskable).save(os.path.join(OUT, name))
        print("wrote", name)


if __name__ == "__main__":
    main()
