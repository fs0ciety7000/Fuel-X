"""Scale review: every exported LOD0 asset side by side with a 1.8 m human each (task 4.7).

Run (after `npm run assets`, which leaves the raw GLBs in build/models-raw/):
  blender -b --factory-startup --python-exit-code 1 -P blender/scenes/lineup.py -- \
      --out docs/assets/_lineup.png [--detail docs/assets/_lineup_small.png] [--samples 32]

Imports the **raw exported GLBs** (the optimized ones are meshopt-compressed, which the Blender importer
cannot read), lays them out in one row along +Y (fronts, −Y, to the left) and renders an orthographic side
view from +X, 2048 × 1024 (ASSETS_GUIDE §9). `--detail` re-frames the small assets (boat → WX station)
at the same resolution so the human and the vans stay readable. Prints each asset's bounds for the
§2 dimension check. Preview-only: nothing is exported.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib import REPO_ROOT, check_blender_version  # noqa: E402
from lib.nodes import reset_scene  # noqa: E402
from lib.preview import render_lineup  # noqa: E402

RAW = REPO_ROOT / "build" / "models-raw"
# Display order: hero structures and vehicles, yard, vessels, farm, then the small assets (detail view).
ORDER = ["tower", "pad", "booster", "ship", "crane", "bldg_highbay", "hangar_tent", "vessel_recovery",
         "tank_sphere", "tank_v", "tank_h", "boat_range", "tanker", "transporter", "van", "wx_station"]
DETAIL_FROM = ORDER.index("boat_range")


def _cable(o) -> None:
    o.scale.z = 30.0  # CRANE_CableGeo: render scales the unit cable to the hook drop (rest −30 m)


POSES = {"CRANE": {"CRANE_CableGeo": _cable}}


def main() -> None:
    check_blender_version()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(REPO_ROOT / "docs" / "assets" / "_lineup.png"))
    p.add_argument("--detail", help="optional close-up of the small assets")
    p.add_argument("--samples", type=int, default=32)
    a = p.parse_args(argv)
    missing = [n for n in ORDER if not (RAW / f"{n}.glb").exists()]
    if missing:
        raise RuntimeError(f"lineup: build these first (npm run asset -- …): {missing}")
    reset_scene()
    rows = render_lineup([RAW / f"{n}.glb" for n in ORDER], a.out, detail_out=a.detail, detail_from=DETAIL_FROM,
                         samples=a.samples, poses=POSES)
    for name, lo, hi in rows:
        size = hi - lo
        print(f"[fx-lineup] {name:16s} L(y) {size.y:7.1f}  W(x) {size.x:7.1f}  H(z) {hi.z:7.1f}  "
              f"(z from {lo.z:+.1f})", file=sys.stderr)


main()
