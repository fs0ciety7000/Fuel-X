"""TANK_H — horizontal cryogenic storage tank on two saddles, ASSETS_GUIDE §2, §4 TANK_H.

Run:  blender -b --factory-startup -P blender/assets/tank_h.py -- --out build/models-raw/tank_h.glb \
          --preview docs/assets/tank_h.png

22 m long (axis along X), Ø 3.6 m, top at 5.2 m: 2:1 ellipsoidal heads, two concrete saddles with
cradles, stiffener rings, a top walkway with guard rail and an end ladder, fill line down to a stub
facing −Y at mid-length, safety-valve vent on top near the +X end.

Instancing-ready (ASSETS_GUIDE §6): one leaf mesh `TANK_H_Body`, MAT_Clay shell + MAT_ClayDark details,
no animated parts, origin on the ground under the tank centre. Rows of these are an InstancedMesh.
  TANK_H (root) ├─ TANK_H_Body └─ SOCKET_Fill, SOCKET_Vent, SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Matrix, Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import root, socket  # noqa: E402
from lib.shapes import add_extrusion_x, add_ladder, add_polyline_beam  # noqa: E402

ASSET = "TANK_H"
VERSION = 1

LENGTH = 22.0
RADIUS = 1.8
TOP = 5.2
AXIS_Z = TOP - RADIUS  # 3.4
HEAD = RADIUS * 0.5
HALF = LENGTH / 2 - HEAD  # cylindrical half length
SADDLE_X = 6.6
STIFFENERS = (-3.3, 0.0, 3.3)
FILL = Vector((0.0, -RADIUS - 0.7, 0.8))
VENT = Vector((7.5, 0.0, TOP + 1.0))

TRI_BUDGETS = (1200, 300)
REQUIRED_NODES = ["TANK_H_Body", "SOCKET_Fill", "SOCKET_Vent", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK = "MAT_Clay", "MAT_ClayDark"


def _along_x(z: float = AXIS_Z) -> Matrix:
    """Local frame for surfaces of revolution about the tank axis (local +Z → world +X)."""
    return Matrix.Translation((0, 0, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")


def build_body(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 16, 10)
    steps = pick(lod, 3, 2)
    # Shell: pole → head → cylinder → head → pole (profile along local z = world x).
    prof = []
    for i in range(steps, 0, -1):
        a = (math.pi / 2) * i / steps
        prof.append((0.0 if i == steps else RADIUS * math.cos(a), -HALF - HEAD * math.sin(a)))
    prof += [(RADIUS, -HALF), (RADIUS, HALF)]
    for i in range(1, steps + 1):
        a = (math.pi / 2) * i / steps
        prof.append((0.0 if i == steps else RADIUS * math.cos(a), HALF + HEAD * math.sin(a)))
    mb.revolve(prof, seg, CLAY, matrix=_along_x(), phase=math.pi / seg)
    # Saddles: concrete pier + cradle wedge hugging the lower third of the shell.
    for sx in (-SADDLE_X, SADDLE_X):
        mb.box_minmax((sx - 0.5, -1.5, 0.0), (sx + 0.5, 1.5, 1.4), DARK)
        cradle = [(-1.5, 1.4), (1.5, 1.4), (1.5, AXIS_Z - 0.6), (1.05, AXIS_Z - 1.45), (0.0, AXIS_Z - RADIUS),
                  (-1.05, AXIS_Z - 1.45), (-1.5, AXIS_Z - 0.6)]
        add_extrusion_x(mb, cradle, sx - 0.35, sx + 0.35, DARK)
    # Fill line: from the shell bottom at mid-length down and out to a stub facing −Y.
    pipe = pick(lod, 0.28, 0.36)
    mb.beam(Vector((0.0, -0.9, AXIS_Z - RADIUS * 0.85)), Vector((0.0, -0.9, FILL.z)), pipe, DARK)
    mb.beam(Vector((0.0, -0.9 + pipe / 2, FILL.z)), FILL, pipe, DARK, caps=True)
    mb.box((FILL.x, FILL.y + 0.2, FILL.z), (0.6, 0.1, 0.6), DARK)  # flange
    # Safety-valve vent stack.
    mb.cylinder((VENT.x, 0.0, TOP - 0.25), 0.16, VENT.z - TOP + 0.25, pick(lod, 8, 6), DARK, caps=(False, True))
    if lod == 0:
        for x in STIFFENERS:
            mb.revolve([(RADIUS + 0.05, x - 0.15), (RADIUS + 0.05, x + 0.15)], seg, DARK, matrix=_along_x(),
                       phase=math.pi / seg)
        # Top walkway (grating strip) with a guard rail on the −Y side, ladder at the −X end.
        w0, w1 = -HALF + 0.5, HALF - 2.5
        mb.box_minmax((w0, -0.45, TOP), (w1, 0.45, TOP + 0.08), DARK, faces="top")
        posts = 6
        for k in range(posts + 1):
            x = w0 + (w1 - w0) * k / posts
            mb.beam((x, -0.45, TOP), (x, -0.45, TOP + 1.0), 0.06, DARK)
        add_polyline_beam(mb, [(w0, -0.45, TOP + 1.0), (w1, -0.45, TOP + 1.0)], 0.06, DARK)
        ex = -LENGTH / 2 - 0.35
        add_ladder(mb, (ex, 0.0, 0.0), TOP + 1.0, (-1, 0, 0), DARK, width=0.55, cage_from=2.4, hoop_step=1.4,
                   rail=0.07, cage_r=0.4)
        mb.box_minmax((ex - 0.1, -0.5, TOP - 0.05), (-HALF + 0.5, 0.5, TOP + 0.03), DARK, faces="top")
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_body(lod).build("TANK_H_Body", parent=top)
    socket("Fill", tuple(FILL), rotation=(math.pi / 2, 0, 0), parent=top)  # +Z → −Y
    socket("Vent", tuple(VENT), parent=top)
    socket("Label", (0.0, 0.0, TOP + 4.0), parent=top)
    socket("Focus", (0.0, 0.0, AXIS_Z), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2)
