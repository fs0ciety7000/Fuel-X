"""Showcase plates: WebP copies of the Blender preview renders (docs/assets/*.png, ASSETS_GUIDE §8) for the hardware
catalogue and the stage fallback. The renders already sit on the paper substrate. Re-run after `npm run assets`:
    python3 -I scripts/showcase/plates.py
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "assets"
OUT = ROOT / "public" / "showcase" / "plates"

# asset -> edge length (px). Catalogue plates are shown ≤ 320 css px wide (2× ≈ 480 is enough for most DPRs).
PLATES = {name: 480 for name in [
    "tower", "pad", "booster", "ship", "transporter", "crane", "tanker",
    "tank_v", "tank_sphere", "boat_range", "vessel_recovery", "wx_station",
]}
PLATES["_stack"] = 720  # stage fallback / LCP-safe still


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, edge in PLATES.items():
        im = Image.open(SRC / f"{name}.png").convert("RGB")
        im = im.resize((edge, edge), Image.LANCZOS)
        dst = OUT / f"{name}.webp"
        im.save(dst, "WEBP", quality=78, method=6)
        total += dst.stat().st_size
        print(f"plates: {dst.name} {dst.stat().st_size // 1024} KB")
    print(f"plates: total {total // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
