#!/usr/bin/env python3
"""
STSA Icon Generator (Python + PIL)
Creates PWA icons: navy bg + burnt-orange star + white STSA text
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

NAVY = (26, 58, 82)       # #1a3a52
ORANGE = (192, 86, 33)    # #c05621
WHITE = (255, 255, 255)
ICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'icons')

def star_points(cx, cy, outer_r, inner_r, num_points=5):
    """Return polygon points for a star."""
    points = []
    for i in range(num_points * 2):
        r = outer_r if i % 2 == 0 else inner_r
        angle = math.pi * i / num_points - math.pi / 2
        x = cx + math.cos(angle) * r
        y = cy + math.sin(angle) * r
        points.append((x, y))
    return points

def rounded_rect_mask(size, corner_radius, pad):
    """Create a rounded rectangle mask for the background."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    x0, y0 = pad, pad
    x1, y1 = size - pad, size - pad
    draw.rounded_rectangle([x0, y0, x1, y1], radius=corner_radius, fill=255)
    return mask

def generate_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(size * 0.04)
    corner = int(size * 0.22)

    # Background: navy blue rounded square
    x0, y0 = pad, pad
    x1, y1 = size - pad, size - pad
    draw.rounded_rectangle([x0, y0, x1, y1], radius=corner, fill=NAVY + (255,))

    # Star: centered with slight upward bias
    cx = size / 2
    star_cy = size * 0.42
    outer_r = size * 0.27
    inner_r = size * 0.115

    pts = star_points(cx, star_cy, outer_r, inner_r)
    # Shadow first (dark semi-transparent polygon offset slightly)
    shadow_pts = [(x + size*0.015, y + size*0.02) for x, y in pts]
    draw.polygon(shadow_pts, fill=(0, 0, 0, 60))
    # Actual orange star
    draw.polygon(pts, fill=ORANGE + (255,))

    # "STSA" text — white, bold, below star
    font_size = int(size * 0.185)
    try:
        # Try to use a bold system font
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
    except OSError:
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', font_size)
        except OSError:
            font = ImageFont.load_default()

    text = 'STSA'
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (size - text_w) / 2 - bbox[0]
    text_y = size * 0.745 - text_h / 2 - bbox[1]
    draw.text((text_x, text_y), text, font=font, fill=WHITE + (255,))

    # Small "EVENTS" subtitle for larger sizes
    if size >= 192:
        sub_size = int(size * 0.065)
        try:
            sub_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', sub_size)
        except OSError:
            try:
                sub_font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', sub_size)
            except OSError:
                sub_font = None

        if sub_font:
            sub_text = 'EVENTS'
            sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
            sub_w = sub_bbox[2] - sub_bbox[0]
            sub_x = (size - sub_w) / 2 - sub_bbox[0]
            sub_y = text_y + text_h + int(size * 0.015)
            draw.text((sub_x, sub_y), sub_text, font=sub_font, fill=(255, 255, 255, 140))

    return img

def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    sizes = [(192, 'icon-192.png'), (512, 'icon-512.png'), (180, 'icon-180.png'), (32, 'favicon.png')]
    for size, filename in sizes:
        img = generate_icon(size)
        out_path = os.path.join(ICONS_DIR, filename)
        img.save(out_path, 'PNG')
        print(f'✅ Generated {filename} ({size}x{size})')
    print('\n🎉 All icons generated in icons/')

if __name__ == '__main__':
    main()
