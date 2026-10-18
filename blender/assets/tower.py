"""TOWER — launch & catch tower with chopstick catch arms (ASSETS_GUIDE §2, §4 TOWER).

Run:  blender -b --factory-startup -P blender/assets/tower.py -- \
          --out build/models-raw/tower.glb --preview docs/assets/tower.png [--lod all] [--turntable 12]

Frame (Blender, Z-up): faces −Y (the launch mount is at y = −26), L = +X, R = −X.
Square lattice 13 × 13 m from 0 to 135 m, gantry + lightning mast to 146 m.

Hierarchy (nodes with children are empties, geometry on leaves):
  TOWER (root)
  ├─ TOWER_Static                       lattice, podium, gantry, mast, rails, QD bracket (merged)
  ├─ TOWER_Carriage   trans y 25→135 m  (empty on the front-face center at carriage height)
  │   ├─ TOWER_CarriageGeo
  │   ├─ TOWER_ArmL   rot y 0→+40°      hinge (+6.5, −6.5) → TOWER_ArmLGeo, SOCKET_CatchPointL
  │   └─ TOWER_ArmR   rot y 0→−40°      hinge (−6.5, −6.5) → TOWER_ArmRGeo, SOCKET_CatchPointR
  ├─ TOWER_QDArm      rot y 0→90°       hinge outboard of the R front corner, h = 100 m
  │   ├─ TOWER_QDArmGeo
  │   └─ SOCKET_ShipQD
  └─ SOCKET_Mount, SOCKET_Label, SOCKET_Focus, SOCKET_CatchFocus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.prims import add_truss  # noqa: E402

ASSET = "TOWER"
VERSION = 1

# --- Dimensions (m) ---------------------------------------------------------------------------
HALF = 6.5  # half width of the square lattice
LATTICE_TOP = 135.0
TIP = 146.0
MOUNT_Y = -26.0
CARRIAGE_MIN, CARRIAGE_MAX, CARRIAGE_REST = 25.0, 135.0, 86.0
ARM_OPEN_DEG = 40.0
ARM_LENGTH = 36.0
ARM_GAP = 9.6  # closed, parallel arms: inner faces at x = ±4.8
ARM_WIDTH = 3.0
ARM_DEPTH_ROOT, ARM_DEPTH_TIP = 7.0, 3.0
CATCH_X = 5.4  # world |x| where the booster pins rest on the rails
QD_HEIGHT = 100.0
QD_HINGE = (-11.0, -7.5)  # outboard of the R front corner, clear of the carriage and arm sweep
SHIP_RADIUS = 4.5

# QD arm geometry: engaged (90°) it points at the ship hull; stowed (0°) it is swung 90° clockwise.
_to_ship = Vector((0.0 - QD_HINGE[0], MOUNT_Y - QD_HINGE[1], 0.0))
QD_TIP_ENGAGED = Vector((0.0, MOUNT_Y, 0.0)) - _to_ship.normalized() * SHIP_RADIUS
QD_VEC_ENGAGED = QD_TIP_ENGAGED - Vector((QD_HINGE[0], QD_HINGE[1], 0.0))
QD_LENGTH = QD_VEC_ENGAGED.length
QD_STOWED_ANGLE = math.atan2(QD_VEC_ENGAGED.y, QD_VEC_ENGAGED.x) - math.pi / 2

TRI_BUDGETS = (40000, 12000, 3000)
REQUIRED_NODES = [
    "TOWER_Static", "TOWER_Carriage", "TOWER_CarriageGeo", "TOWER_ArmL", "TOWER_ArmR",
    "TOWER_ArmLGeo", "TOWER_ArmRGeo", "TOWER_QDArm", "TOWER_QDArmGeo",
    "SOCKET_CatchPointL", "SOCKET_CatchPointR", "SOCKET_ShipQD", "SOCKET_Mount",
    "SOCKET_Label", "SOCKET_Focus", "SOCKET_CatchFocus",
]

METAL, CLAY, DARK = "MAT_Metal", "MAT_Clay", "MAT_ClayDark"


# --- Static structure ---------------------------------------------------------------------------
def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 16, 8, 6)
    # Podium the legs stand on.
    mb.box_minmax((-8.5, -8.5, 0.0), (8.5, 8.5, 5.0), CLAY, faces="sides" if lod else "all")
    if lod:
        mb.box_minmax((-8.5, -8.5, 4.99), (8.5, 8.5, 5.0), CLAY, faces="top")
    # Main lattice: 4 heavy chords, square-ish X panels on every face.
    add_truss(mb, (0, 0, 5.0), (0, 0, LATTICE_TOP), 2 * HALF, 2 * HALF,
              bays=pick(lod, 15, 10, 1), panels=1, section=pick(lod, 0.7, 0.8, 0.8),
              chord=pick(lod, 1.4, 1.4, 1.4), bracing="X", material=METAL, lod=lod)
    # Interior floors (read as bands through the lattice) and the elevator core.
    if lod < 2:
        for z in (32.0, 59.0, 113.0):
            mb.box_minmax((-HALF + 0.8, -HALF + 0.8, z), (HALF - 0.8, HALF - 0.8, z + 0.4), DARK)
        mb.box_minmax((-5.2, 1.8, 5.0), (-1.4, 5.6, LATTICE_TOP), CLAY, faces="sides")
    # Carriage rails on the front corner legs.
    for sx in (-1, 1):
        mb.box_minmax((sx * HALF - 0.45, -HALF - 1.0, CARRIAGE_MIN - 6.0),
                      (sx * HALF + 0.45, -HALF - 0.3, LATTICE_TOP + 1.0), DARK, faces="sides")
    # Gantry deck and the hoist house on top.
    mb.box_minmax((-8.0, -8.0, LATTICE_TOP), (8.0, 8.0, LATTICE_TOP + 1.2), CLAY)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.beam((sx * 5.5, sy * 5.5, LATTICE_TOP + 1.2), (sx * 5.5, sy * 5.5, 141.0), 0.8, METAL)
    mb.box_minmax((-6.5, -7.5, 141.0), (6.5, 6.5, 142.6), CLAY)
    mb.box_minmax((-3.0, -9.5, 139.0), (3.0, -6.0, 141.0), DARK)  # hoist trolley over the front
    mb.cylinder((3.5, 3.5, 142.6), 0.35, TIP - 142.6, seg if lod < 2 else 4, METAL, caps=(False, True))
    # Utility pipe run on the back-L leg.
    if lod < 2:
        mb.cylinder((HALF - 1.0, HALF + 1.0, 0.0), 0.6, LATTICE_TOP, pick(lod, 8, 6), METAL, caps=(False, True))
    # QD arm bracket from the R side face out to the hinge.
    hx, hy = QD_HINGE
    mb.box_minmax((hx - 1.0, hy - 1.0, QD_HEIGHT - 3.0), (-HALF, hy + 1.0, QD_HEIGHT - 1.6), CLAY)
    mb.beam((hx, hy, QD_HEIGHT - 3.0), (-HALF, hy, QD_HEIGHT - 9.0), 0.6, METAL)
    mb.cylinder((hx, hy, QD_HEIGHT - 2.0), 0.9, 3.5, seg, DARK)
    return mb


# --- Carriage -----------------------------------------------------------------------------------
def build_carriage_geo(lod: int) -> MeshBuilder:
    """Collar around the tower, local frame: origin on the front-face center (tower y ∈ [0, 13])."""
    mb = MeshBuilder()
    t, z0, z1 = 1.6, -5.5, 0.6
    o = HALF + t
    mb.box_minmax((-o, -t, z0), (o, 0.0, z1), CLAY)  # front
    mb.box_minmax((-o, 2 * HALF, z0), (o, 2 * HALF + t, z1), CLAY)  # back
    for sx in (-1, 1):
        lo, hi = sorted((sx * HALF, sx * o))
        mb.box_minmax((lo, 0.0, z0), (hi, 2 * HALF, z1), CLAY)
    if lod < 2:
        mb.box_minmax((-4.0, 2 * HALF + t, -3.5), (4.0, 2 * HALF + t + 2.0, 0.6), CLAY)  # winch house
    return mb


# --- Catch arms ---------------------------------------------------------------------------------
def build_arm_geo(side: int, lod: int) -> MeshBuilder:
    """Arm in hinge-local frame. side = +1 (L, +X hinge) or −1 (R). Points −Y when closed."""
    mb = MeshBuilder()
    xi = side * ((ARM_GAP / 2) - HALF)  # inner edge (toward the booster), local
    xo = xi + side * ARM_WIDTH
    y0, y1 = -1.8, -ARM_LENGTH
    top = -0.5

    def depth(y):
        u = (y - y0) / (y1 - y0)
        return ARM_DEPTH_ROOT + (ARM_DEPTH_TIP - ARM_DEPTH_ROOT) * u

    if lod >= 2:
        n = 2
    else:
        n = pick(lod, 9, 5)
    ys = [y0 + (y1 - y0) * k / n for k in range(n + 1)]
    c = 0.5 if lod == 0 else 0.6

    def corners(y):
        d = depth(y)
        inset = c / 2
        return [Vector((xi + side * inset, y, top - inset)), Vector((xo - side * inset, y, top - inset)),
                Vector((xo - side * inset, y, top - d + inset)), Vector((xi + side * inset, y, top - d + inset))]

    if lod >= 2:
        # Solid tapered beam (two boxes) — silhouette only.
        for ya, yb in zip(ys, ys[1:]):
            d = (depth(ya) + depth(yb)) / 2
            lo_x, hi_x = sorted((xi, xo))
            mb.box_minmax((lo_x, yb, top - d), (hi_x, ya, top), METAL)
    else:
        chords = [[corners(y)[i] for y in (y0, y1)] for i in range(4)]
        for a, b in chords:
            mb.beam(a, b, 0.7, METAL)
        for k, y in enumerate(ys):
            cs = corners(y)
            for i in range(4):
                mb.beam(cs[i], cs[(i + 1) % 4], 0.35, METAL)
            if k == n:
                break
            nx = corners(ys[k + 1])
            # side faces (inner 0-3, outer 1-2): X bracing; top/bottom: zig-zag
            for i, j in ((0, 3), (1, 2)):
                mb.beam(cs[i], nx[j], 0.3, METAL)
                if lod == 0:
                    mb.beam(cs[j], nx[i], 0.3, METAL)
            if k % 2 == 0:
                mb.beam(cs[0], nx[1], 0.3, METAL)
                mb.beam(cs[3], nx[2], 0.3, METAL)
            else:
                mb.beam(cs[1], nx[0], 0.3, METAL)
                mb.beam(cs[2], nx[3], 0.3, METAL)
    # Solid outer web (reads as a heavy beam from far away, like the reference chopsticks).
    if lod < 2:
        t = 0.35
        xa, xb = xo - side * c, xo - side * (c + t)
        verts, faces = [], []
        for k, y in enumerate((y0, y1)):
            d = depth(y)
            verts += [(xa, y, top), (xa, y, top - d), (xb, y, top - d), (xb, y, top)]
        faces = [(0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2), (0, 1, 2, 3), (4, 7, 6, 5)]
        if side < 0:
            faces = [tuple(reversed(f)) for f in faces]
        mb.add(verts, faces, METAL)
    # Catch rail on the inner top edge (where the booster pins land) and the hinge knuckle.
    rail_lo, rail_hi = sorted((xi, xi + side * 1.4))
    mb.box_minmax((rail_lo, -ARM_LENGTH + 0.5, top), (rail_hi, -6.0, 0.0), DARK)
    lo_x, hi_x = sorted((xi, xo))
    mb.box_minmax((lo_x, -2.6, top - ARM_DEPTH_ROOT - 0.4), (hi_x, -0.8, top + 0.3), DARK)
    mb.cylinder((0.0, 0.0, -6.8), 1.1, 7.8, pick(lod, 16, 8, 6), DARK)
    return mb


# --- QD arm -------------------------------------------------------------------------------------
def build_qd_geo(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    a = QD_STOWED_ANGLE
    u = Vector((math.cos(a), math.sin(a), 0.0))
    start, end = u * 0.8, u * (QD_LENGTH - 1.6)
    add_truss(mb, start + Vector((0, 0, 0.0)), end, 2.4, 2.8, bays=pick(lod, 6, 3, 1),
              section=pick(lod, 0.28, 0.4, 0.4), chord=0.5, bracing="Z", material=METAL, lod=lod)
    hood_c = u * (QD_LENGTH - 0.8)
    mb.box(hood_c, (2.2, 3.2, 3.4), METAL, rotation_z=a)
    return mb


# --- Assembly -----------------------------------------------------------------------------------
def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("TOWER_Static", parent=top)

    carriage = pivot("TOWER_Carriage", (0.0, -HALF, CARRIAGE_REST), parent=top,
                     anim=dict(kind="trans", axis="y", min=CARRIAGE_MIN, max=CARRIAGE_MAX,
                               rest=CARRIAGE_REST, unit="m"))
    build_carriage_geo(lod).build("TOWER_CarriageGeo", parent=carriage)

    for side, tag in ((1, "L"), (-1, "R")):
        arm = pivot(f"TOWER_Arm{tag}", (side * HALF, 0.0, 0.0), parent=carriage,
                    anim=dict(kind="rot", axis="y", min=min(0.0, side * ARM_OPEN_DEG),
                              max=max(0.0, side * ARM_OPEN_DEG), rest=0.0, unit="deg"))
        build_arm_geo(side, lod).build(f"TOWER_Arm{tag}Geo", parent=arm)
        socket(f"CatchPoint{tag}", (side * (CATCH_X - HALF), MOUNT_Y + HALF, 0.0), parent=arm)

    qd = pivot("TOWER_QDArm", (QD_HINGE[0], QD_HINGE[1], QD_HEIGHT), parent=top,
               anim=dict(kind="rot", axis="y", min=0.0, max=90.0, rest=0.0, unit="deg"))
    build_qd_geo(lod).build("TOWER_QDArmGeo", parent=qd)
    a = QD_STOWED_ANGLE
    tip = Vector((math.cos(a), math.sin(a), 0.0)) * QD_LENGTH
    # Socket +Z = attach direction (along the arm, into the ship's QD plate).
    socket("ShipQD", tip, rotation=tip.to_track_quat("Z", "Y").to_euler(), parent=qd)

    socket("Mount", (0.0, MOUNT_Y, 0.0), parent=top)
    socket("Label", (0.0, 0.0, TIP + 4.0), parent=top)
    socket("Focus", (0.0, -HALF, 70.0), parent=top)
    socket("CatchFocus", (0.0, MOUNT_Y, CARRIAGE_REST), parent=top)


def preview_pose() -> None:
    """Preview only (after export): arms open 25°, QD arm engaged."""
    objs = bpy.data.objects
    objs["TOWER_ArmL"].rotation_euler.z = math.radians(25)
    objs["TOWER_ArmR"].rotation_euler.z = math.radians(-25)
    objs["TOWER_QDArm"].rotation_euler.z = math.radians(90)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3, preview_pose=preview_pose)
