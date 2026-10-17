"""Render the PNG app icons (same car mark as icons/icon.svg). Run: npm run icons"""
from PIL import Image, ImageDraw

ACCENT = (226, 72, 12, 255)
WHITE = (255, 255, 255, 255)


def draw(size, maskable=False, rounded=True):
    s = 4  # supersample for smooth edges
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, W, W], fill=ACCENT)
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=W * 0.25, fill=ACCENT)
    # 24-unit glyph from the header mark, centred; maskable keeps it in the 80% safe zone
    span = W * (0.62 if maskable else 0.78)
    u = span / 24
    ox = (W - span) / 2
    oy = (W - span) / 2 - u * 1.5
    P = lambda x, y: (ox + x * u, oy + y * u)
    lw = max(1, round(2.2 * u))
    d.line([P(3, 15.5), P(21, 15.5)], fill=WHITE, width=lw)
    d.line([P(5, 15.5), P(7, 10.5), P(15.5, 10.5), P(18.5, 15.5)], fill=WHITE, width=lw, joint="curve")
    for x, y in [(3, 15.5), (21, 15.5), (5, 15.5), (7, 10.5), (15.5, 10.5), (18.5, 15.5)]:
        cx, cy = P(x, y)
        d.ellipse([cx - lw / 2, cy - lw / 2, cx + lw / 2, cy + lw / 2], fill=WHITE)
    for x in (8, 16.5):
        cx, cy = P(x, 17)
        d.ellipse([cx - 2 * u, cy - 2 * u, cx + 2 * u, cy + 2 * u], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


draw(192).save("public/icons/icon-192.png")
draw(512).save("public/icons/icon-512.png")
draw(512, maskable=True).save("public/icons/icon-maskable-512.png")
draw(180, rounded=False).save("public/icons/apple-touch-icon.png")
draw(32).save("public/favicon.ico", sizes=[(32, 32)])
print("icons written")
