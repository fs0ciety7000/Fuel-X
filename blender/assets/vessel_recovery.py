"""VESSEL_RECOVERY — GRAPPLE recovery vessel (`RV-1`), ASSETS_GUIDE §2, §4 BOAT_RANGE / VESSEL_RECOVERY.

Run:  blender -b --factory-startup -P blender/assets/vessel_recovery.py -- \
          --out build/models-raw/vessel_recovery.glb --preview docs/assets/vessel_recovery.png

72 × 16 m, 24 m above the waterline: offshore support vessel. Raised forecastle and a four-tier
superstructure forward (bridge with wrap-around glazing and wings, mast with radar, twin exhaust
stacks), aft cargo deck 30 × 14 m behind bulwarks (landing-frame cargo goes on SOCKET_Deck), a stern
A-frame and a knuckle deck crane on the L (+X) side.

Frame: bow toward −Y, origin on the **waterline** at mid-length, L = +X.
  VESSEL_RECOVERY (root)
  ├─ VESSEL_RECOVERY_Static                    hull, superstructure, mast, stacks, bulwarks, A-frame
  ├─ VESSEL_RECOVERY_Radar       spin y        radar axis on the mast → VESSEL_RECOVERY_RadarGeo
  ├─ VESSEL_RECOVERY_DeckCrane   rot y ±150°   slew axis on the pedestal top → VESSEL_RECOVERY_DeckCraneGeo
  │                                            (rest 0° = jib stowed toward the stern, +Y)
  └─ SOCKET_Wake (stern, WL, +Z aft) · SOCKET_Bow (stem, WL, +Z forward) · SOCKET_Deck (cargo deck
     centre, +Z up) · SOCKET_Label · SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.marine import Hull, add_bulwark, add_hull, add_radar_array, add_tier  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.prims import add_truss  # noqa: E402

ASSET = "VESSEL_RECOVERY"
VERSION = 1

LENGTH, BEAM = 72.0, 16.0
HULL = Hull(LENGTH, BEAM, freeboard=4.5, sheer=3.0, draft=1.5, deck_taper=0.72, wl_taper=0.6, rake=4.0,
            transom_ratio=0.97)
DECK_Z = HULL.freeboard
CARGO = (4.0, 34.0)  # cargo deck y range (30 × 14 m usable inside the bulwarks)
MAST_Y = -18.0
RADAR_AT = (0.0, MAST_Y, 22.6)
TOP = 24.0
CRANE_AT = (5.2, -1.5, 10.5)
CRANE_JIB = 17.0
SLEW = 150.0

TRI_BUDGETS = (15000, 4000, 1000)
REQUIRED_NODES = ["VESSEL_RECOVERY_Static", "VESSEL_RECOVERY_Radar", "VESSEL_RECOVERY_RadarGeo",
                  "VESSEL_RECOVERY_DeckCrane", "VESSEL_RECOVERY_DeckCraneGeo", "SOCKET_Wake", "SOCKET_Bow",
                  "SOCKET_Deck", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK, METAL, GLASS = "MAT_Clay", "MAT_ClayDark", "MAT_Metal", "MAT_Glass"


def t_at(y: float) -> float:
    return (LENGTH / 2 - y) / LENGTH


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    stations = pick(lod, [0.0, 0.1, 0.25, 0.4, 0.5, 0.58, 0.65, 0.72, 0.78, 0.84, 0.89, 0.93, 0.965, 1.0],
                    [0.0, 0.4, 0.6, 0.75, 0.87, 0.95, 1.0], [0.0, 0.5, 0.8, 1.0])
    add_hull(mb, HULL, stations, CLAY, boot_material=METAL)
    if lod < 2:
        add_bulwark(mb, HULL, 0.0, t_at(CARGO[0] - 1.0), 1.2, CLAY, steps=pick(lod, 4, 1))  # cargo deck
        add_bulwark(mb, HULL, 0.8, 0.985, 1.4, CLAY, steps=pick(lod, 5, 2))  # forecastle
    # Superstructure tiers (bow side = −Y). Tier floors follow the sheer: base sits on the deck.
    zb = HULL.deck_z(t_at(-6.0)) - 0.2
    z1, z2, z3, z4 = DECK_Z + 4.5, DECK_Z + 7.5, DECK_Z + 10.5, DECK_Z + 14.0
    full = "all" if lod == 0 else "sides"
    add_tier(mb, (-7.2, -24.0, zb), (7.2, -6.0, z1), CLAY, faces=full)
    if lod < 2:
        add_tier(mb, (-7.0, -23.5, z1), (7.0, -8.0, z2), CLAY, glass=GLASS, band=(1.2, 2.2))
        add_tier(mb, (-6.4, -23.0, z2), (6.4, -10.0, z3), CLAY, glass=GLASS, band=(1.2, 2.2))
        # Bridge with wings (wider than the house), wrap-around glazing, overhanging roof.
        add_tier(mb, (-8.0, -23.5, z3), (8.0, -16.0, z4), CLAY, glass=GLASS, band=(1.0, 2.8), overhang=0.4)
    else:
        mb.box_minmax((-7.0, -23.5, z1), (7.0, -10.0, z3), CLAY)
        mb.box_minmax((-8.0, -23.5, z3), (8.0, -16.0, z4), GLASS)
    # Mast: lattice tower on the bridge roof with a yard; radar on top, antenna to 24 m.
    roof = z4
    add_truss(mb, (0, MAST_Y, roof), (0, MAST_Y, RADAR_AT[2]), 1.2, 1.2, bays=pick(lod, 3, 1, 1), section=0.08,
              chord=0.16, bracing="Z", material=METAL, lod=2 if lod >= 1 else 0)
    mb.box((0.0, MAST_Y, RADAR_AT[2] - 1.2), (6.0, 0.25, 0.25), METAL)
    mb.cylinder((0.0, MAST_Y + 1.5, roof), 0.08, TOP - roof, 6, METAL, caps=(False, True))
    # Twin exhaust stacks aft of the bridge.
    for sx in (-1, 1):
        mb.box_minmax((sx * 4.0 - 1.0, -14.0, z3), (sx * 4.0 + 1.0, -11.0, z4 + 1.5), CLAY)
        if lod == 0:
            mb.box_minmax((sx * 4.0 - 0.8, -13.8, z4 + 1.5), (sx * 4.0 + 0.8, -11.2, z4 + 1.9), DARK)
    if lod < 2:
        # Crane pedestal (L side, just aft of the house).
        mb.cylinder((CRANE_AT[0], CRANE_AT[1], DECK_Z), 1.1, CRANE_AT[2] - DECK_Z, pick(lod, 16, 8), METAL,
                    caps=(False, True))
        # Stern A-frame (recovery gantry), legs on the quarters, leaning aft.
        y0, y1 = 31.5, 34.5
        for sx in (-1, 1):
            mb.beam((sx * 6.0, y0, DECK_Z), (sx * 4.5, y1, DECK_Z + 11.0), 0.8, METAL)
        mb.beam((-4.9, y1, DECK_Z + 10.6), (4.9, y1, DECK_Z + 10.6), (0.9, 1.0), METAL)
        mb.box((0.0, y1 + 0.4, DECK_Z + 9.4), (1.0, 0.8, 1.6), DARK)  # sheave block
    if lod == 0:
        # Cargo deck grid (timber sheathing seams) and tie-down rails, a deck store forward of it.
        for k in range(1, 6):
            y = CARGO[0] + (CARGO[1] - CARGO[0]) * k / 6
            mb.box((0.0, y, DECK_Z + 0.02), (13.6, 0.12, 0.04), DARK, faces="top")
        for sx in (-1, 1):
            mb.box((sx * 6.5, (CARGO[0] + CARGO[1]) / 2, DECK_Z + 0.04), (0.2, CARGO[1] - CARGO[0], 0.08), DARK,
                   faces="top")
        mb.box_minmax((-7.0, -5.0, DECK_Z), (-1.0, -1.0, DECK_Z + 3.0), CLAY)
        # Bow anchor pockets and bollards.
        for sx in (-1, 1):
            p = Vector((sx * HULL.half_beam_deck(0.9), HULL.y(0.9), HULL.deck_z(0.9) - 1.2))
            mb.box(p + Vector((-sx * 0.1, 0, 0)), (0.4, 1.4, 1.2), DARK)
            for y in (6.0, 20.0, 30.0):
                mb.cylinder((sx * 6.0, y, DECK_Z), 0.3, 0.7, 6, METAL)
    return mb


def build_radar(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    add_radar_array(mb, 4.2, METAL, height=0.4, pedestal=0.5)
    del lod
    return mb


def build_crane(lod: int) -> MeshBuilder:
    """Crane-local: slew axis at the origin (pedestal top). Jib stowed toward +Y at rest."""
    mb = MeshBuilder()
    mb.cylinder((0, 0, 0), 1.2, 0.6, pick(lod, 16, 8, 6), CLAY)
    mb.box_minmax((-1.9, -1.6, 0.6), (-0.3, 0.6, 3.0), CLAY)  # operator cab (L of the jib)
    mb.box_minmax((0.3, -1.4, 0.6), (1.6, 0.4, 2.2), CLAY)  # winch house
    # Main jib (box section) rising 12° toward the stern, knuckle jib folded down at its tip.
    a = math.radians(12.0)
    root_p = Vector((0.0, 0.2, 1.4))
    tip = root_p + Vector((0.0, math.cos(a), math.sin(a))) * CRANE_JIB
    mb.beam(root_p, tip, (0.9, 1.1), METAL, caps=True)
    knuckle = tip + Vector((0.0, 2.5, -2.8))
    mb.beam(tip, knuckle, (0.7, 0.8), METAL, caps=True)
    mb.beam((0.0, 0.2, 0.6), root_p + Vector((0.0, 4.0, 0.2)), (0.6, 0.6), METAL)  # luffing ram
    if lod == 0:
        mb.box(knuckle + Vector((0, 0, -0.6)), (0.8, 0.8, 1.0), CLAY)  # hook block
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("VESSEL_RECOVERY_Static", parent=top)
    radar = pivot("VESSEL_RECOVERY_Radar", RADAR_AT, parent=top,
                  anim=dict(kind="spin", axis="y", min=0.0, max=360.0, rest=0.0, unit="deg"))
    build_radar(lod).build("VESSEL_RECOVERY_RadarGeo", parent=radar)
    crane = pivot("VESSEL_RECOVERY_DeckCrane", CRANE_AT, parent=top,
                  anim=dict(kind="rot", axis="y", min=-SLEW, max=SLEW, rest=0.0, unit="deg"))
    build_crane(lod).build("VESSEL_RECOVERY_DeckCraneGeo", parent=crane)
    socket("Wake", (0.0, LENGTH / 2, 0.0), rotation=(-math.pi / 2, 0.0, 0.0), parent=top)
    socket("Bow", (0.0, -LENGTH / 2 + HULL.stem_offset(1.0, 1.0), 0.0), rotation=(math.pi / 2, 0.0, 0.0),
           parent=top)
    socket("Deck", (0.0, (CARGO[0] + CARGO[1]) / 2, DECK_Z), parent=top)
    socket("Label", (0.0, 0.0, TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 9.0), parent=top)


def preview_pose() -> None:
    import bpy

    bpy.data.objects["VESSEL_RECOVERY_Radar"].rotation_euler.z = math.radians(30)
    bpy.data.objects["VESSEL_RECOVERY_DeckCrane"].rotation_euler.z = math.radians(-35)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3, preview_pose=preview_pose)
