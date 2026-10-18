"""BLDG_HIGHBAY — high bay (`HB-1`), ASSETS_GUIDE §2, §4 BLDG_HIGHBAY.

Run:  blender -b --factory-startup -P blender/assets/bldg_highbay.py -- \
          --out build/models-raw/bldg_highbay.glb --preview docs/assets/bldg_highbay.png

32 × 32 m footprint, 85 m tall (81 m slab + roof crane house). Clad slab with vertical pilaster ribs
every 4 m; door opening 18 × 60 m on the −Y face with a dark recess (MAT_ClayDark, the only dark part:
the reference bays read all light), closed by two bi-parting clay sliding leaves running on a
header track in front of the façade (a 60 m vertical-lift door cannot retract inside an 85 m
building; see ASSETS_GUIDE §4 as built).

Frame: door faces −Y, origin on the ground at the footprint centre, L = +X.
  BLDG_HIGHBAY (root)
  ├─ BLDG_HIGHBAY_Static                    slab, ribs, recess, header track, roof house
  ├─ BLDG_HIGHBAY_DoorL   trans x 0…9.5 m   leaf covering x 0…9 (L, +X), slides to +X → …DoorLGeo
  ├─ BLDG_HIGHBAY_DoorR   trans x −9.5…0 m  leaf covering x −9…0 (R, −X), slides to −X → …DoorRGeo
  └─ SOCKET_DoorOut (ground, 8 m outside the door) · SOCKET_Label · SOCKET_Focus
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.lod import pick, run_asset  # noqa: E402
from lib.marine import add_face_out  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.structures import add_ribbed_wall  # noqa: E402

ASSET = "BLDG_HIGHBAY"
VERSION = 1

HALF = 16.0
SLAB_H = 81.0
TOP = 85.0
DOOR_W, DOOR_H = 18.0, 60.0
RECESS = 3.0
LEAF_T = 0.6
LEAF_Y = -HALF - 0.6 - LEAF_T / 2  # in front of the 0.5 m ribs
SLIDE = 9.5

TRI_BUDGETS = (3000, 800)
REQUIRED_NODES = ["BLDG_HIGHBAY_Static", "BLDG_HIGHBAY_DoorL", "BLDG_HIGHBAY_DoorLGeo", "BLDG_HIGHBAY_DoorR",
                  "BLDG_HIGHBAY_DoorRGeo", "SOCKET_DoorOut", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK = "MAT_Clay", "MAT_ClayDark"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    h, dw = HALF, DOOR_W / 2
    inside = (0.0, 0.0, SLAB_H / 2)
    # Slab: back and side walls, roof; the front wall is three panels around the door opening.
    add_face_out(mb, [(-h, h, 0), (h, h, 0), (h, h, SLAB_H), (-h, h, SLAB_H)], inside, CLAY)
    for sx in (-1, 1):
        add_face_out(mb, [(sx * h, -h, 0), (sx * h, h, 0), (sx * h, h, SLAB_H), (sx * h, -h, SLAB_H)], inside, CLAY)
        add_face_out(mb, [(sx * h, -h, 0), (sx * dw, -h, 0), (sx * dw, -h, SLAB_H), (sx * h, -h, SLAB_H)], inside,
                     CLAY)
    add_face_out(mb, [(-dw, -h, DOOR_H), (dw, -h, DOOR_H), (dw, -h, SLAB_H), (-dw, -h, SLAB_H)], inside, CLAY)
    add_face_out(mb, [(-h, -h, SLAB_H), (h, -h, SLAB_H), (h, h, SLAB_H), (-h, h, SLAB_H)], inside, CLAY)
    # Door recess (dark interior seen when the leaves open): back wall, jambs, soffit.
    yb = -h + RECESS
    add_face_out(mb, [(-dw, yb, 0), (dw, yb, 0), (dw, yb, DOOR_H), (-dw, yb, DOOR_H)], (0, h, 0), DARK)
    for sx in (-1, 1):
        add_face_out(mb, [(sx * dw, -h, 0), (sx * dw, yb, 0), (sx * dw, yb, DOOR_H), (sx * dw, -h, DOOR_H)],
                     (sx * h, -h, 0), DARK)
    add_face_out(mb, [(-dw, -h, DOOR_H), (dw, -h, DOOR_H), (dw, yb, DOOR_H), (-dw, yb, DOOR_H)],
                 (0, -h, DOOR_H + 5), DARK)
    if lod == 0:
        # Pilaster ribs every 4 m on every face (front: not across the door opening), parapet band.
        for p0, p1, out, skip in (((-h, -h), (h, -h), (0, -1, 0), (0.2, 0.8)), ((h, -h), (h, h), (1, 0, 0), None),
                                  ((h, h), (-h, h), (0, 1, 0), None), ((-h, h), (-h, -h), (-1, 0, 0), None)):
            add_ribbed_wall(mb, (*p0, 0), (*p1, 0), 0.0, SLAB_H + 0.8, out, 4.0, CLAY, rib=(0.6, 0.5), skip=skip)
        # Front ribs above the door, from the header to the parapet.
        for k in range(-2, 3):
            mb.box((k * 4.0, -h - 0.25, (DOOR_H + 1.6 + SLAB_H + 0.8) / 2), (0.6, 0.5, SLAB_H + 0.8 - DOOR_H - 1.6),
                   CLAY)
        for sx in (-1, 1):  # corner piers
            for sy in (-1, 1):
                mb.box((sx * (h - 0.3), sy * (h - 0.3), (SLAB_H + 1.0) / 2), (1.4, 1.4, SLAB_H + 1.0), CLAY)
        mb.box_minmax((-h, -h, SLAB_H), (h, -h + 0.4, SLAB_H + 1.0), CLAY, faces="sides")  # parapets
        mb.box_minmax((-h, h - 0.4, SLAB_H), (h, h, SLAB_H + 1.0), CLAY, faces="sides")
        mb.box_minmax((-h, -h, SLAB_H), (-h + 0.4, h, SLAB_H + 1.0), CLAY, faces="sides")
        mb.box_minmax((h - 0.4, -h, SLAB_H), (h, h, SLAB_H + 1.0), CLAY, faces="sides")
    # Header track the leaves hang from (spans the slide travel), roof crane house.
    mb.box_minmax((-DOOR_W - 1.0, LEAF_Y - 0.6, DOOR_H), (DOOR_W + 1.0, -h, DOOR_H + 1.6), CLAY)
    mb.box_minmax((-9.0, -8.0, SLAB_H), (9.0, 10.0, TOP), CLAY, faces="all" if lod == 0 else "sides")
    return mb


def build_leaf(lod: int, sx: int) -> MeshBuilder:
    """Leaf-local: origin at the leaf's inner edge (door centreline) on the ground; extends toward sx·X."""
    mb = MeshBuilder()
    x0, x1 = sorted((0.0, sx * DOOR_W / 2))
    mb.box_minmax((x0, -LEAF_T / 2, 0.0), (x1, LEAF_T / 2, DOOR_H), CLAY, faces="all" if lod == 0 else "sides")
    if lod == 0:  # horizontal panel stiffeners
        for k in range(1, pick(lod, 10, 1)):
            z = DOOR_H * k / 10
            mb.box_minmax((x0 + 0.2, -LEAF_T / 2 - 0.15, z - 0.2), (x1 - 0.2, -LEAF_T / 2, z + 0.2), CLAY,
                          faces="sides")
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("BLDG_HIGHBAY_Static", parent=top)
    for side, sx, rng in (("L", 1, (0.0, SLIDE)), ("R", -1, (-SLIDE, 0.0))):
        door = pivot(f"BLDG_HIGHBAY_Door{side}", (0.0, LEAF_Y, 0.0), parent=top,
                     anim=dict(kind="trans", axis="x", min=rng[0], max=rng[1], rest=0.0, unit="m"))
        build_leaf(lod, sx).build(f"BLDG_HIGHBAY_Door{side}Geo", parent=door)
    socket("DoorOut", (0.0, -HALF - 8.0, 0.0), parent=top)
    socket("Label", (0.0, 0.0, TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 40.0), parent=top)


def preview_pose() -> None:
    import bpy

    bpy.data.objects["BLDG_HIGHBAY_DoorL"].location.x = 6.0
    bpy.data.objects["BLDG_HIGHBAY_DoorR"].location.x = -6.0


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2, preview_pose=preview_pose)
