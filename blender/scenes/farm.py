"""Composite scale review: a small tank farm + tanker + transporter + van + weather station (task 4.5).

Run (after `npm run asset -- tank_v tank_h tank_sphere tanker transporter van wx_station`):
  blender -b --factory-startup -P blender/scenes/farm.py -- --out docs/assets/_farm.png [--samples 32]

Imports the **raw exported GLBs** (build/models-raw/, the optimized ones are meshopt-compressed, which the
Blender importer cannot read) so the review shows exactly what the exporter wrote, then lays the farm
out like the reference frames (tight cluster of verticals, a sphere, parallel rows of horizontals) and
renders with the standard preview stage (paper, sun, 85 mm camera, 1.8 m human). Preview-only: no export.
"""

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402

from lib import REPO_ROOT  # noqa: E402
from lib.nodes import reset_scene  # noqa: E402
from lib.preview import _aim, _setup_render, setup_stage  # noqa: E402

RAW = REPO_ROOT / "build" / "models-raw"

# (asset file, root name, (x, y), heading deg (rotation about +Z), pose {node: (attr, value)})
LAYOUT = [
    *[("tank_v", "TANK_V", (x, y), 0.0, {}) for x in (-34.0, -25.0, -16.0) for y in (14.0, 23.0)],
    ("tank_sphere", "TANK_SPHERE", (4.0, 22.0), 0.0, {}),
    *[("tank_h", "TANK_H", (-25.0, y), 0.0, {}) for y in (-4.0, -10.0, -16.0, -22.0)],
    ("tanker", "TANKER", (8.0, -6.0), 90.0, {"TANKER_Trailer": ("rz", -15.0), "TANKER_Steer": ("rz", -10.0)}),
    ("transporter", "TRANSPORTER", (34.0, 14.0), 0.0, {"TRANSPORTER_Deck": ("dz", 0.6)}),
    ("van", "VAN", (10.0, -20.0), 90.0, {}),
    ("van", "VAN", (10.0, -24.0), 90.0, {}),
    ("wx_station", "WX_STATION", (30.0, -18.0), 0.0, {"WX_STATION_Vane": ("rz", 40.0)}),
]


def place(file: str, root_name: str, xy, heading: float, pose: dict) -> None:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(RAW / f"{file}.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    by_base = {o.name.split(".")[0]: o for o in new}
    root = by_base[root_name]
    root.location = (xy[0], xy[1], 0.0)
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0.0, 0.0, math.radians(heading))
    for node, (kind, value) in pose.items():
        o = by_base[node]
        o.rotation_mode = "XYZ"
        if kind == "rz":
            o.rotation_euler.z += math.radians(value)
        elif kind == "dz":
            o.location.z += value
    for o in new:  # importer may leave empties/meshes selected; keep materials as exported
        o.select_set(False)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(REPO_ROOT / "docs" / "assets" / "_farm.png"))
    p.add_argument("--samples", type=int, default=32)
    args = p.parse_args(argv)
    reset_scene()
    for entry in LAYOUT:
        place(*entry)
    cam, center, radius = setup_stage(human_at=(14.0, -14.0))
    _setup_render(1024, args.samples)
    _aim(cam, center, radius, margin=0.92)
    bpy.context.scene.render.filepath = args.out
    bpy.ops.render.render(write_still=True)


main()
