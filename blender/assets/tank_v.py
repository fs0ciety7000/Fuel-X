"""TANK_V — vertical cryogenic farm tank (LOX / CH4), ASSETS_GUIDE §2, §4 TANK_V.

Run:  blender -b --factory-startup -P blender/assets/tank_v.py -- --out build/models-raw/tank_v.glb \
          --preview docs/assets/tank_v.png

Ø 6 × 28 m: plinth, 2 m skirt, cylindrical shell, 2:1 ellipsoidal head, two stiffener rings, top guard
rail, caged ladder on the front (−Y), fill line down to a stub facing −Y, vent stack on the crown.

Instancing-ready (ASSETS_GUIDE §6): one leaf mesh `TANK_V_Body`, two materials (MAT_Clay shell,
MAT_ClayDark details), no animated parts, origin at the plinth centre on the ground.
  TANK_V (root) ├─ TANK_V_Body └─ SOCKET_Fill, SOCKET_Vent, SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import root, socket  # noqa: E402
from lib.shapes import add_band, add_ladder, add_ring_railing  # noqa: E402

ASSET = "TANK_V"
VERSION = 1

RADIUS = 3.0
HEIGHT = 28.0  # crown of the head (vent stack adds 1.2 m)
SKIRT = 2.0
PLINTH = 0.3
HEAD = RADIUS * 0.5  # 2:1 ellipsoidal
BODY_TOP = HEIGHT - HEAD
STIFFENERS = (9.5, 18.0)
FILL = Vector((1.4, -RADIUS - 0.55, 0.9))  # fill line foot (pipe centre), stub runs to −Y
FILL_END_Y = -RADIUS - 1.6
VENT_TOP = HEIGHT + 1.2

TRI_BUDGETS = (1500, 400)
REQUIRED_NODES = ["TANK_V_Body", "SOCKET_Fill", "SOCKET_Vent", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK = "MAT_Clay", "MAT_ClayDark"


def build_body(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 24, 12)
    steps = pick(lod, 4, 2)
    # Plinth + skirt.
    mb.revolve([(RADIUS + 0.4, 0.0), (RADIUS + 0.4, PLINTH)], pick(lod, 12, 8), DARK, smooth=False, cap_top=True)
    add_band(mb, (0, 0, 0), RADIUS * 0.96, PLINTH, SKIRT + 0.02, seg, DARK)
    # Shell + head (one surface of revolution, pole at the crown).
    prof = [(RADIUS, SKIRT), (RADIUS, BODY_TOP)]
    for i in range(1, steps + 1):
        a = (math.pi / 2) * i / steps
        prof.append((0.0 if i == steps else RADIUS * math.cos(a), BODY_TOP + HEAD * math.sin(a)))
    mb.revolve(prof, seg, CLAY, phase=math.pi / seg)
    # Fill line: ground stub to −Y, riser up the front-right of the shell into the head.
    pipe = pick(lod, 0.32, 0.4)
    mb.beam(Vector((FILL.x, FILL_END_Y, FILL.z)), FILL, pipe, DARK, caps=True)
    mb.beam(FILL - Vector((0, 0, pipe / 2)), Vector((FILL.x, FILL.y, BODY_TOP)), pipe * 0.8, DARK)
    mb.beam(Vector((FILL.x, FILL.y, BODY_TOP - pipe * 0.4)),
            Vector((FILL.x * 0.75, -RADIUS * 0.72, BODY_TOP + HEAD * 0.55)), pipe * 0.8, DARK)  # into the head
    mb.box((FILL.x, FILL_END_Y + 0.25, FILL.z), (0.7, 0.1, 0.7), DARK)  # flange
    # Vent stack on the crown.
    mb.cylinder((0, 0, HEIGHT - 0.3), 0.22, VENT_TOP - HEIGHT + 0.3, pick(lod, 8, 6), DARK, caps=(False, True))
    if lod == 0:
        for z in STIFFENERS:
            add_band(mb, (0, 0, 0), RADIUS + 0.06, z, z + 0.3, seg, DARK, smooth=True)
        # Crown guard rail on the head shoulder and the caged ladder on the front face.
        rail_z = BODY_TOP + HEAD * 0.42
        rail_r = RADIUS * math.cos(math.asin(0.42)) - 0.1
        add_ring_railing(mb, (0, 0, 0), rail_r, rail_z, 12, DARK, height=1.0, section=0.07, posts=6)
        add_ladder(mb, (-0.9, -RADIUS - 0.3, PLINTH), rail_z + 0.4, (0, -1, 0), DARK, rail=0.09)
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_body(lod).build("TANK_V_Body", parent=top)
    socket("Fill", (FILL.x, FILL_END_Y, FILL.z), rotation=(math.pi / 2, 0, 0), parent=top)  # +Z → −Y
    socket("Vent", (0.0, 0.0, VENT_TOP), parent=top)
    socket("Label", (0.0, 0.0, VENT_TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, HEIGHT / 2), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2)
