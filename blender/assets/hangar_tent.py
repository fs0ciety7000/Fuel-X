"""HANGAR_TENT — tent hangar (`TH-1`), ASSETS_GUIDE §2, §4 HANGAR_TENT.

Run:  blender -b --factory-startup -P blender/assets/hangar_tent.py -- \
          --out build/models-raw/hangar_tent.glb --preview docs/assets/hangar_tent.png

45 m long (Y) × 30 m wide × 18 m tall barrel-vault membrane hangar on a 1.5 m kerb wall, portal
ribs every 5 m standing proud of the membrane, flat gables, a dark door panel 16 × 12 m on the −Y
gable. No animated door (ASSETS_GUIDE §4: only high bay / mega bay doors move).

Frame: door gable faces −Y, origin on the ground at the footprint centre.
  HANGAR_TENT (root)
  ├─ HANGAR_TENT_Static     membrane, ribs, gables, door panel
  └─ SOCKET_DoorOut (ground, 8 m outside the door) · SOCKET_Label · SOCKET_Focus
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.lod import pick, run_asset  # noqa: E402
from lib.marine import add_face_out  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import root, socket  # noqa: E402
from lib.shapes import add_quad  # noqa: E402
from lib.structures import add_arch_rib, add_vault, arch_points  # noqa: E402

ASSET = "HANGAR_TENT"
VERSION = 1

LENGTH, HALF_W, HEIGHT, WALL = 45.0, 15.0, 18.0, 1.5
DOOR_W, DOOR_H = 16.0, 12.0
RIB_STEP = 5.0

TRI_BUDGETS = (2000, 600)
REQUIRED_NODES = ["HANGAR_TENT_Static", "SOCKET_DoorOut", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK = "MAT_Clay", "MAT_ClayDark"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 20, 10)
    y0, y1 = -LENGTH / 2, LENGTH / 2
    add_vault(mb, HALF_W, HEIGHT, y0, y1, seg, CLAY, wall=WALL)
    gable = [(x, z) for x, z in arch_points(HALF_W, HEIGHT, seg, WALL)]
    for y, d in ((y0, -1), (y1, 1)):
        add_face_out(mb, [(x, y, z) for x, z in gable], (0.0, y - d, HEIGHT / 2), CLAY)
    # Portal ribs (end ribs frame the gables).
    n = round(LENGTH / RIB_STEP)
    ribs = range(n + 1) if lod == 0 else (0, n)
    for k in ribs:
        y = y0 + LENGTH * k / n
        y = min(max(y, y0 + 0.2), y1 - 0.2)
        add_arch_rib(mb, HALF_W, HEIGHT, y, seg, CLAY, depth=0.4, proud=0.3, wall=WALL)
    # Door panel on the front gable, kerb band along the base.
    add_quad(mb, [(-DOOR_W / 2, y0, 0.0), (DOOR_W / 2, y0, 0.0), (DOOR_W / 2, y0, DOOR_H), (-DOOR_W / 2, y0, DOOR_H)],
             (0, -1, 0), DARK, offset=0.05)
    if lod == 0:
        for sx in (-1, 1):
            mb.box_minmax((sx * HALF_W - 0.25, y0, 0.0), (sx * HALF_W + 0.25, y1, WALL), DARK, faces="sides")
        mb.box_minmax((-DOOR_W / 2 - 0.4, y0 - 0.35, DOOR_H), (DOOR_W / 2 + 0.4, y0, DOOR_H + 0.5), DARK)  # lintel
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("HANGAR_TENT_Static", parent=top)
    socket("DoorOut", (0.0, -LENGTH / 2 - 8.0, 0.0), parent=top)
    socket("Label", (0.0, 0.0, HEIGHT + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 8.0), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2)
