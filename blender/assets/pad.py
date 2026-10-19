"""PAD — orbital launch mount (OLM) on its apron, with flame trench (ASSETS_GUIDE §2, §4 PAD).

Run:  blender -b --factory-startup -P blender/assets/pad.py -- \
          --out build/models-raw/pad.glb --preview docs/assets/pad.png [--lod all]

Frame (Blender, Z-up): origin = mount center on the ground (= TOWER `SOCKET_Mount`); the tower
stands behind the mount at +Y (its origin at y = +26), the flame trench exits toward −Y (front).
Apron 120 × 120 × 0.5; mount table 30 × 30 on 6 legs; ring OD 18 / ID 9.5 with its top at 20 m.

Hierarchy (nodes with children are empties, geometry on leaves):
  PAD (root)
  ├─ PAD_Static                      apron, trench, deflector, legs, table, ring, piping, railings
  ├─ PAD_BQD      trans y 0 → −1.5 m booster quick-disconnect hood on the ring (+Y side)
  │   └─ PAD_BQDGeo
  ├─ PAD_Clamps   trans y −0.8 → 0 m hold-down clamps (retract into the ring at liftoff; cosmetic)
  │   └─ PAD_ClampsGeo
  └─ SOCKET_VehicleMount, SOCKET_FlameTrench, SOCKET_Deluge_01..04, SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.prims import add_railing  # noqa: E402
from lib.vehicle import add_annulus  # noqa: E402

ASSET = "PAD"
VERSION = 1

# --- Dimensions (m) ---------------------------------------------------------------------------
APRON_HALF = 60.0
APRON_TOP = 0.5
DECK_Z = 20.0  # ring top = vehicle mount plane (BOOSTER origin)
RING_OD, RING_ID = 18.0, 9.5
RING_H = 2.0
TABLE_HALF = 15.0
TABLE_Z0, TABLE_Z1 = 13.5, DECK_Z - RING_H
HOLE_HALF = 5.2  # square opening in the table under the ring bore
LEG_RADIUS = 12.0
LEG_SECTION = 3.0
TRENCH_W = 10.0
TRENCH_Y0, TRENCH_Y1 = 4.0, -48.0  # from under the mount out to the exit (front)
TRENCH_FLOOR = 0.05
TRENCH_WALL_H = 3.0
TRENCH_WALL_T = 1.5
BQD_Y = 4.75  # hood face against the booster skirt (radius 4.5)
CLAMPS = 20
CLAMP_R0, CLAMP_R1 = 4.6, 5.7
CLAMP_H = 1.6
BOOSTER_RADIUS = 4.5

TRI_BUDGETS = (15000, 5000, 1000)
REQUIRED_NODES = [
    "PAD_Static", "PAD_BQD", "PAD_BQDGeo", "PAD_Clamps", "PAD_ClampsGeo",
    "SOCKET_VehicleMount", "SOCKET_FlameTrench", "SOCKET_Deluge_01", "SOCKET_Deluge_02",
    "SOCKET_Deluge_03", "SOCKET_Deluge_04", "SOCKET_Label", "SOCKET_Focus",
]

METAL, CLAY, DARK, CONCRETE = "MAT_Metal", "MAT_Clay", "MAT_ClayDark", "MAT_Concrete"


def leg_positions():
    """6 legs on a hexagon; none on the ±Y axis so the trench (−Y) and the BQD side (+Y) stay open."""
    return [(LEG_RADIUS * math.cos(math.radians(a)), LEG_RADIUS * math.sin(math.radians(a)))
            for a in (0, 60, 120, 180, 240, 300)]


# --- Static -------------------------------------------------------------------------------------
def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 48, 24, 12)
    tw = TRENCH_W / 2
    # Apron slab (MAT_Concrete: reads as the paved lot, the mount stays MAT_Clay), split around the trench
    # strip (x ∈ ±tw, y ∈ [TRENCH_Y1, TRENCH_Y0]).
    A = APRON_HALF
    mb.box_minmax((-A, TRENCH_Y0, 0.0), (A, A, APRON_TOP), CONCRETE)
    mb.box_minmax((-A, -A, 0.0), (A, TRENCH_Y1, APRON_TOP), CONCRETE)
    mb.box_minmax((-A, TRENCH_Y1, 0.0), (-tw, TRENCH_Y0, APRON_TOP), CONCRETE)
    mb.box_minmax((tw, TRENCH_Y1, 0.0), (A, TRENCH_Y0, APRON_TOP), CONCRETE)
    # Trench: dark floor at grade between two berm walls (stays visible above any terrain at z = 0).
    floor = TRENCH_FLOOR
    mb.box_minmax((-tw, TRENCH_Y1, 0.0), (tw, TRENCH_Y0, floor), DARK, faces="top")
    for sx in (-1, 1):
        x0, x1 = sorted((sx * tw, sx * (tw + TRENCH_WALL_T)))
        mb.box_minmax((x0, TRENCH_Y1, APRON_TOP), (x1, -LEG_RADIUS + 2.0, TRENCH_WALL_H), CLAY,
                      faces="all" if lod < 2 else "sides")
    # Flame deflector under the bore: steel plate + wedge throwing the plume down the trench.
    mb.box_minmax((-7.0, -7.0, APRON_TOP), (7.0, 7.0, APRON_TOP + 0.8), DARK)
    if lod < 2:
        verts = [(-tw + 0.5, 6.0, APRON_TOP + 0.8), (tw - 0.5, 6.0, APRON_TOP + 0.8),
                 (tw - 0.5, 6.0, APRON_TOP + 4.0), (-tw + 0.5, 6.0, APRON_TOP + 4.0),
                 (-tw + 0.5, -6.0, APRON_TOP + 0.8), (tw - 0.5, -6.0, APRON_TOP + 0.8)]
        mb.add(verts, [(4, 5, 2, 3), (0, 3, 2, 1), (0, 4, 3), (1, 2, 5)], DARK)
    # Legs: tapered square columns with a footing.
    for x, y in leg_positions():
        mb.box((x, y, APRON_TOP + 0.6), (LEG_SECTION + 2.0, LEG_SECTION + 2.0, 1.2), CLAY)
        mb.box((x, y, (APRON_TOP + 1.2 + TABLE_Z0) / 2), (LEG_SECTION, LEG_SECTION, TABLE_Z0 - APRON_TOP - 1.2),
               CLAY, faces="sides")
        if lod == 0:
            # Diagonal knee brace toward the table.
            r = math.hypot(x, y)
            ux, uy = x / r, y / r
            mb.beam((x - ux * 1.4, y - uy * 1.4, TABLE_Z0 - 6.0), (x - ux * 5.0, y - uy * 5.0, TABLE_Z0),
                    0.9, METAL)
    # Table: 4 boxes around a square opening.
    T, H = TABLE_HALF, HOLE_HALF
    faces = "all" if lod < 2 else "sides"
    mb.box_minmax((-T, H, TABLE_Z0), (T, T, TABLE_Z1), CLAY, faces=faces)
    mb.box_minmax((-T, -T, TABLE_Z0), (T, -H, TABLE_Z1), CLAY, faces=faces)
    mb.box_minmax((-T, -H, TABLE_Z0), (-H, H, TABLE_Z1), CLAY, faces=faces)
    mb.box_minmax((H, -H, TABLE_Z0), (T, H, TABLE_Z1), CLAY, faces=faces)
    if lod < 2:
        # Dark band under the deck lip (shadow line).
        mb.box_minmax((-T - 0.3, -T - 0.3, TABLE_Z1 - 0.6), (T + 0.3, T + 0.3, TABLE_Z1), DARK, faces="sides")
    # Launch ring.
    add_annulus(mb, (0, 0, 0), RING_ID / 2, RING_OD / 2, TABLE_Z1, DECK_Z, seg, CLAY,
                bottom=False)
    if lod < 2:
        # Inner lip (dark) the booster skirt sits over.
        add_annulus(mb, (0, 0, 0), RING_ID / 2 - 0.25, RING_ID / 2, TABLE_Z1 - 1.0, DECK_Z - 0.2, seg, DARK,
                    top=True, bottom=True, outer=False)
    # Propellant / deluge piping from the tower side (+Y) up into the table.
    if lod < 2:
        pseg = pick(lod, 10, 6)
        for px in (-2.5, 2.5):
            mb.cylinder((px, A - 4.0, APRON_TOP + 1.0), 0.7, (A - 4.0) - T, pseg, METAL,
                        caps=(False, False), axis=(0, -1, 0))
            mb.cylinder((px, T, APRON_TOP + 1.0), 0.7, TABLE_Z0 - APRON_TOP - 1.0, pseg, METAL, caps=(False, True))
        for py in (A - 10.0, A - 24.0, T + 6.0):
            mb.box((0.0, py, APRON_TOP + 0.5), (7.0, 0.8, 1.0), DARK)
        # Deluge water tank beside the mount.
        mb.cylinder((-26.0, -8.0, APRON_TOP), 4.0, 12.0, pick(lod, 24, 12), CLAY, caps=(False, True))
        mb.cylinder((-26.0, -8.0, APRON_TOP), 4.2, 1.2, pick(lod, 24, 12), DARK, caps=(False, True))
    # Railing around the table deck.
    if lod == 0:
        e = T - 0.3
        add_railing(mb, [(-e, -e, TABLE_Z1), (e, -e, TABLE_Z1), (e, e, TABLE_Z1), (-e, e, TABLE_Z1),
                         (-e, -e, TABLE_Z1)], height=1.1, post_spacing=5.0, section=0.12, material=METAL)
        # Stair tower to the deck on the −X side.
        mb.box_minmax((-T - 5.0, 2.0, APRON_TOP), (-T - 1.0, 6.0, TABLE_Z1), METAL, faces="sides")
    return mb


# --- Moving parts -------------------------------------------------------------------------------
def build_bqd_geo(lod: int) -> MeshBuilder:
    """Hood in pivot-local space (pivot on the ring top at the hood face, +Y side)."""
    mb = MeshBuilder()
    mb.box_minmax((-1.6, 0.0, 0.0), (1.6, 2.8, 3.2), METAL)
    if lod < 2:
        mb.box_minmax((-1.1, 2.8, 0.0), (1.1, 4.0, 2.2), DARK)
        mb.cylinder((0.0, 4.0, 1.0), 0.45, 2.0, pick(lod, 8, 6), METAL, caps=(False, True), axis=(0, 1, 0))
    return mb


def clamp_angles():
    """20 clamps every 15°, leaving a ±30° gap around +Y for the BQD hood."""
    return [math.radians(120.0 + 7.5 + 15.0 * k) for k in range(CLAMPS)]


def build_clamps_geo(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    for a in clamp_angles():
        r0, r1 = CLAMP_R0, CLAMP_R1
        rc = (r0 + r1) / 2
        mb.box((rc * math.cos(a), rc * math.sin(a), CLAMP_H / 2), (r1 - r0, 0.7, CLAMP_H), DARK, rotation_z=a)
        if lod == 0:
            # Hook lip leaning over the skirt.
            rh = r0 + 0.2
            mb.box((rh * math.cos(a), rh * math.sin(a), CLAMP_H + 0.15), (0.6, 0.5, 0.3), DARK, rotation_z=a)
    return mb


# --- Assembly -----------------------------------------------------------------------------------
def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("PAD_Static", parent=top)

    bqd = pivot("PAD_BQD", (0.0, BQD_Y, DECK_Z), parent=top,
                anim=dict(kind="trans", axis="y", min=-1.5, max=0.0, rest=0.0, unit="m"))
    build_bqd_geo(lod).build("PAD_BQDGeo", parent=bqd)

    clamps = pivot("PAD_Clamps", (0.0, 0.0, DECK_Z), parent=top,
                   anim=dict(kind="trans", axis="y", min=-0.8, max=0.0, rest=0.0, unit="m"))
    build_clamps_geo(lod).build("PAD_ClampsGeo", parent=clamps)

    socket("VehicleMount", (0.0, 0.0, DECK_Z), parent=top)
    # Trench exit at the front; +Z (emission) along the trench toward −Y.
    socket("FlameTrench", (0.0, TRENCH_Y1, TRENCH_FLOOR + 1.0), rotation=(math.radians(90), 0, 0),
           parent=top)
    for k, a in enumerate((45, 135, 225, 315), start=1):
        r = (RING_OD / 2 + RING_ID / 2) / 2
        socket(f"Deluge_{k:02d}", (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), DECK_Z + 0.1),
               parent=top)
    socket("Label", (0.0, -TABLE_HALF, DECK_Z + 4.0), parent=top)
    socket("Focus", (0.0, 0.0, DECK_Z / 2), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3)
