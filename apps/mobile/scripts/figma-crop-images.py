# Fallback while the Figma API is rate-limited: crop each image fill out of the 2x screen render,
# using the node's exact bounds. Writes .figma/images/<imageRef>.png (largest occurrence wins).
# Overlapping text/badges in the design are baked into the crop; replace with originals from a
# manual SVG export when available. Usage (from apps/mobile): python scripts/figma-crop-images.py
import json, os, glob
from PIL import Image

OUT = ".figma"
os.makedirs(f"{OUT}/images", exist_ok=True)
best = {}  # ref -> (area, png, box)

for path in glob.glob(f"{OUT}/*/*.json"):
    png = path[:-5] + ".png"
    if not os.path.exists(png):
        continue
    root = json.load(open(path, encoding="utf-8"))
    ox, oy = root["absoluteBoundingBox"]["x"], root["absoluteBoundingBox"]["y"]

    def walk(n):
        if n.get("visible") is False:
            return
        for f in n.get("fills", []) or []:
            if f.get("type") == "IMAGE" and f.get("imageRef") and f.get("visible", True):
                b = n["absoluteBoundingBox"]
                box = (round((b["x"] - ox) * 2), round((b["y"] - oy) * 2), round((b["x"] - ox + b["width"]) * 2), round((b["y"] - oy + b["height"]) * 2))
                area = b["width"] * b["height"]
                if area > best.get(f["imageRef"], (0,))[0]:
                    best[f["imageRef"]] = (area, png, box)
        for c in n.get("children", []) or []:
            walk(c)

    walk(root)

for ref, (_, png, box) in best.items():
    im = Image.open(png)
    x0, y0, x1, y1 = box
    box = (max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1))
    if box[2] - box[0] < 4 or box[3] - box[1] < 4:
        continue
    im.crop(box).convert("RGB").save(f"{OUT}/images/{ref}.jpg", quality=88)
print(f"cropped {len(best)} images")
