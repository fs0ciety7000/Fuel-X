"""BOAT_RANGE — PICKET range safety boat (`PK-03`, `PK-04`; also the intruder `UNK-01`), ASSETS_GUIDE §2, §4.

Run:  blender -b --factory-startup -P blender/assets/boat_range.py -- \
          --out build/models-raw/boat_range.glb --preview docs/assets/boat_range.png

26 × 6.5 m, 9 m above the waterline: patrol-boat hull with raked bow and sheer, two-tier deckhouse
forward of midships (wheelhouse with a wrap-around window band), mast with an open-array radar, open
aft deck with rails and a rescue boat. UNK-01 reuses this GLB (the variant is the call-sign label).

Frame: bow toward −Y, origin on the **waterline** at mid-length, L = +X.
  BOAT_RANGE (root)
  ├─ BOAT_RANGE_Static                 hull, deckhouse, mast, rails, rescue boat
  ├─ BOAT_RANGE_Radar     spin y       radar axis (0, −1.2, 8.3) → BOAT_RANGE_RadarGeo
  └─ SOCKET_Wake (stern, WL, +Z aft) · SOCKET_Bow (stem, WL, +Z forward) · SOCKET_Label · SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Matrix  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.marine import Hull, add_bulwark, add_hull, add_radar_array, add_tier  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.prims import add_railing  # noqa: E402

ASSET = "BOAT_RANGE"
VERSION = 1

LENGTH, BEAM = 26.0, 6.5
HULL = Hull(LENGTH, BEAM, freeboard=1.8, sheer=1.2, draft=0.8, deck_taper=0.5, wl_taper=0.4, rake=1.5,
            transom_ratio=0.9)
RADAR_AT = (0.0, -1.2, 8.3)
TOP = 9.0

TRI_BUDGETS = (4000, 1000)
REQUIRED_NODES = ["BOAT_RANGE_Static", "BOAT_RANGE_Radar", "BOAT_RANGE_RadarGeo", "SOCKET_Wake", "SOCKET_Bow",
                  "SOCKET_Label", "SOCKET_Focus"]
CLAY, METAL, GLASS = "MAT_Clay", "MAT_Metal", "MAT_Glass"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    stations = pick(lod, [0.0, 0.15, 0.3, 0.45, 0.52, 0.6, 0.67, 0.74, 0.8, 0.85, 0.9, 0.94, 0.97, 1.0],
                    [0.0, 0.4, 0.62, 0.8, 0.92, 1.0])
    add_hull(mb, HULL, stations, CLAY, boot_material=METAL)
    if lod == 0:
        add_bulwark(mb, HULL, 0.62, 0.97, 0.6, CLAY, steps=5)
    # Deckhouse: lower cabin + wheelhouse (window band) + roof.
    d = HULL.deck_z(0.5)
    add_tier(mb, (-2.3, -6.0, d - 0.1), (2.3, 3.0, d + 2.3), CLAY, faces="all" if lod == 0 else "sides")
    add_tier(mb, (-2.0, -5.0, d + 2.3), (2.0, 1.0, d + 4.9), CLAY, glass=GLASS, band=(0.8, 2.0), overhang=0.25)
    # Mast: pole + yard on the wheelhouse roof, radar on top.
    roof = d + 4.9
    mb.box((0.0, RADAR_AT[1], (roof + RADAR_AT[2]) / 2), (0.35, 0.35, RADAR_AT[2] - roof), METAL)
    mb.box((0.0, RADAR_AT[1], RADAR_AT[2] - 0.6), (2.6, 0.15, 0.15), METAL)
    if lod == 0:
        for sx in (-1, 1):  # whip antennas
            mb.beam((sx * 1.2, RADAR_AT[1], RADAR_AT[2] - 0.6), (sx * 1.2, RADAR_AT[1], TOP), 0.05, METAL)
        mb.box((0.0, -4.0, roof + 0.3), (1.2, 0.8, 0.6), METAL)  # searchlight / sensor turret
        # Aft deck rails and a rescue boat on chocks.
        y0, y1 = 3.2, LENGTH / 2 - 0.3
        hb = HULL.half_beam_deck(0.05) - 0.2
        for sx in (-1, 1):
            add_railing(mb, [(sx * hb, y0, HULL.deck_z(0.3)), (sx * hb, y1, HULL.deck_z(0.0))], height=1.0,
                        post_spacing=2.5, section=0.06)
        add_railing(mb, [(-hb, y1, HULL.deck_z(0.0)), (hb, y1, HULL.deck_z(0.0))], height=1.0, post_spacing=2.5,
                    section=0.06)
        rib = MeshBuilder()  # rescue boat: a small hull on chocks, console amidships
        add_hull(rib, Hull(4.8, 2.0, freeboard=0.55, sheer=0.25, draft=0.25, rake=0.4), [0.0, 0.5, 0.75, 0.9, 1.0],
                 METAL, deck_material=CLAY)
        rib.box((0.0, 0.3, 0.75), (0.8, 0.6, 0.45), CLAY)
        mb.extend(rib, Matrix.Translation((0.0, 8.0, HULL.freeboard + 0.45)))
        for y in (6.9, 9.1):
            mb.box((0.0, y, HULL.freeboard + 0.1), (1.6, 0.3, 0.2), METAL)
        for y in (-9.5, 11.5):  # bollards
            for sx in (-1, 1):
                mb.cylinder((sx * 1.4, y, HULL.deck_z(HULL_T(y))), 0.18, 0.45, 6, METAL)
    return mb


def HULL_T(y: float) -> float:  # noqa: N802 - inverse of Hull.y
    return (LENGTH / 2 - y) / LENGTH


def build_radar(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    add_radar_array(mb, 2.4, METAL, height=0.3, pedestal=0.35)
    del lod
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("BOAT_RANGE_Static", parent=top)
    radar = pivot("BOAT_RANGE_Radar", RADAR_AT, parent=top,
                  anim=dict(kind="spin", axis="y", min=0.0, max=360.0, rest=0.0, unit="deg"))
    build_radar(lod).build("BOAT_RANGE_RadarGeo", parent=radar)
    stern_y = LENGTH / 2
    bow_y = -LENGTH / 2 + HULL.stem_offset(1.0, 1.0)
    socket("Wake", (0.0, stern_y, 0.0), rotation=(-math.pi / 2, 0.0, 0.0), parent=top)
    socket("Bow", (0.0, bow_y, 0.0), rotation=(math.pi / 2, 0.0, 0.0), parent=top)
    socket("Label", (0.0, 0.0, TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 3.5), parent=top)


def preview_pose() -> None:
    import bpy

    bpy.data.objects["BOAT_RANGE_Radar"].rotation_euler.z = math.radians(30)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2, preview_pose=preview_pose)
