"""VAN — pad crew / shift / patrol van (`CV-`), ASSETS_GUIDE §2, §4 VAN.

Run:  blender -b --factory-startup -P blender/assets/van.py -- --out build/models-raw/van.glb \
          --preview docs/assets/van.png

6.0 × 2.1 × 2.7 m high-roof panel van: extruded side profile (sloped hood and windscreen), glazing,
bumpers, mirrors and wheels merged into one mesh. Variants (crew / shift / patrol) differ by label only.

Instancing-ready (ASSETS_GUIDE §6): one leaf mesh `VAN_Body`, two materials — MAT_Clay body and
MAT_Glass for everything dark (glass, tyres, bumpers; opaque neutral grey per §5), no animated parts
(wheels are not visible turning at game scale). Faces −Y; origin on the ground at the footprint centre.
  VAN (root) ├─ VAN_Body └─ SOCKET_Label, SOCKET_Focus
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import root, socket  # noqa: E402
from lib.shapes import add_extrusion_x, add_quad, add_wheel_set  # noqa: E402

ASSET = "VAN"
VERSION = 1

LENGTH, WIDTH, HEIGHT = 6.0, 2.1, 2.7
HALF_W = WIDTH / 2 - 0.04  # body sides; mirrors reach the full 2.1 m
SILL = 0.45
WHEEL_R, TYRE_W, TRACK = 0.36, 0.24, 1.72
AXLES_Y = (-1.85, 1.75)
# Side profile (y, z), counter-clockwise seen from +X: front is −Y (left in this view).
PROFILE = [(-3.0, SILL), (3.0, SILL), (3.0, HEIGHT - 0.05), (2.9, HEIGHT), (-1.7, HEIGHT), (-2.0, 2.3),
           (-2.6, 1.35), (-3.0, 1.12)]

TRI_BUDGETS = (1500, 400)
REQUIRED_NODES = ["VAN_Body", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK = "MAT_Clay", "MAT_Glass"


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def build_body(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    add_extrusion_x(mb, PROFILE, -HALF_W, HALF_W, CLAY)
    # Windscreen on the sloped face between profile points 5 and 6.
    a, b = PROFILE[5], PROFILE[6]
    n = Vector((0.0, -(a[1] - b[1]), (a[0] - b[0]))).normalized()  # outward normal of that edge
    n = n if n.y < 0 else -n
    lo, hi = _lerp(a, b, 0.92), _lerp(a, b, 0.08)
    add_quad(mb, [(-HALF_W + 0.1, lo[0], lo[1]), (HALF_W - 0.1, lo[0], lo[1]), (HALF_W - 0.12, hi[0], hi[1]),
                  (-HALF_W + 0.12, hi[0], hi[1])], n, DARK, offset=0.015)
    for s in (-1, 1):
        x = s * (HALF_W + 0.012)
        side = (s, 0, 0)
        add_quad(mb, [(x, -1.95, 1.45), (x, -1.0, 1.45), (x, -1.0, 2.3), (x, -1.75, 2.3)], side, DARK)  # door
        if lod == 0:
            add_quad(mb, [(x, -0.8, 1.6), (x, 0.9, 1.6), (x, 0.9, 2.3), (x, -0.8, 2.3)], side, DARK)  # crew row
            add_quad(mb, [(x, 1.1, 1.6), (x, 2.6, 1.6), (x, 2.6, 2.3), (x, 1.1, 2.3)], side, DARK)
            mb.box((s * (HALF_W + 0.09), -1.95, 1.75), (0.12, 0.08, 0.32), DARK)  # mirror
    add_quad(mb, [(-0.95, 3.012, 1.55), (0.95, 3.012, 1.55), (0.95, 3.012, 2.35), (-0.95, 3.012, 2.35)],
             (0, 1, 0), DARK)  # rear windows
    # Bumpers, grille, wheels.
    mb.box_minmax((-HALF_W, -3.06, SILL - 0.05), (HALF_W, -2.92, 0.8), DARK, faces="all" if lod == 0 else "sides")
    mb.box_minmax((-HALF_W, 2.94, SILL - 0.05), (HALF_W, 3.06, 0.7), DARK, faces="all" if lod == 0 else "sides")
    add_quad(mb, [(-0.7, -3.0, 0.85), (0.7, -3.0, 0.85), (0.7, -2.88, 1.08), (-0.7, -2.88, 1.08)],
             (0, -1, 0.4), DARK, offset=0.01)
    for y in AXLES_Y:
        add_wheel_set(mb, (0.0, y, WHEEL_R), WHEEL_R, TYRE_W, TRACK, DARK, segments=pick(lod, 12, 6))
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_body(lod).build("VAN_Body", parent=top)
    socket("Label", (0.0, 0.0, HEIGHT + 2.5), parent=top)
    socket("Focus", (0.0, 0.0, 1.4), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2)
