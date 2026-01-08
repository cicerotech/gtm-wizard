#!/usr/bin/env python3
"""Create Eudia logo - slightly larger, LEFT-ALIGNED"""

from PIL import Image
import os

# Use the HIGH-RES source from assets
source = "/Users/keiganpesenti/revops_weekly_update/gtm-brain/assets/eudia-logo.jpg"
dest = "/Users/keiganpesenti/Desktop/Eudia_Logo_Left_Aligned.jpg"

img = Image.open(source)
print(f"Source size: {img.size[0]}x{img.size[1]} pixels")

# Target canvas: slightly larger than before
canvas_width = 700
canvas_height = 140

# Make logo bigger - height of 130 (leaving small padding)
target_height = 130
ratio = target_height / img.size[1]
logo_width = int(img.size[0] * ratio)
logo_height = int(img.size[1] * ratio)

print(f"Logo size: {logo_width}x{logo_height}")

# Resize logo with high quality
resized = img.resize((logo_width, logo_height), Image.LANCZOS)

# Create WHITE canvas and paste logo LEFT-ALIGNED (with small padding)
canvas = Image.new('RGB', (canvas_width, canvas_height), (255, 255, 255))
x_offset = 10  # Small left padding (LEFT ALIGNED)
y_offset = (canvas_height - logo_height) // 2  # Vertically centered
canvas.paste(resized, (x_offset, y_offset))

# Save high quality
canvas.save(dest, "JPEG", quality=95, optimize=True)

file_size = os.path.getsize(dest)
print(f"Canvas size: {canvas_width}x{canvas_height} pixels")
print(f"Logo position: LEFT-ALIGNED with {x_offset}px padding")
print(f"File size: {file_size / 1024:.1f} KB")
print(f"\nSaved to: {dest}")
