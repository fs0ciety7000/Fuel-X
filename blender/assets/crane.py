"""CRANE — DERRICK crawler crane (`CR-77`), ASSETS_GUIDE §2, §4 CRANE.

Run:  blender -b --factory-startup -P blender/assets/crane.py -- \
          --out build/models-raw/crane.glb --preview docs/assets/crane.png

Two crawler tracks 12 m long on a 10 m overall width, carbody with slew ring at z 3, a 14 m upper
body (cab front-L, machinery house, rear counterweight, boom-hoist gantry) and a 96 m lattice boom
(tapered foot and tip sections) that luffs 20°–85° about its foot. The hook hangs plumb from the tip.

Frame: faces −Y (boom over the front at slew 0), origin on the ground at the slew axis, L = +X.
  CRANE (root)
  ├─ CRANE_Static                                tracks, carbody
  └─ CRANE_Upper        rot y −180…180°, rest 0  slew ring (0, 0, 3)
      ├─ CRANE_UpperGeo                          house, cab, counterweight, gantry
      └─ CRANE_BoomMount                         static, boom foot (0, −3.2, 1.6), rotated 180° about Z
          └─ CRANE_Boom     rot x 20…85°, rest 70  luff angle above horizontal (positive = up)
              ├─ CRANE_BoomGeo                   lattice along local +Y (96 m)
              ├─ SOCKET_BoomTip                  boom-tip sheave (0, 96, 0)
              └─ CRANE_Cable  rot x −85…−20°, rest −70   at the tip; **always set to −Boom angle** so the
                  │                                     cable hangs plumb (counter-rotates the luff)
                  ├─ CRANE_CableGeo              unit cable: 1 m along local −Y (three); render scales
                  │                              its y by the hook drop (= −CRANE_Hook.position.y)
                  ├─ SOCKET_Label                3 m above the tip, stays above it at any luff
                  └─ CRANE_Hook   trans y −90…−2 m, rest −30 (three local y; negative = below the tip)
                      ├─ CRANE_HookGeo           hook block
                      └─ SOCKET_Hook             under the block, +Z down (load attach direction)
  SOCKET_Focus (root, z 20)
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.lod import pick, run_asset  # noqa: E402
from lib.marine import add_tier  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.shapes import add_extrusion_x  # noqa: E402
from lib.structures import add_tapered_truss, stadium_profile  # noqa: E402

ASSET = "CRANE"
VERSION = 1

TRACK_L, TRACK_W, TRACK_H, GAUGE = 12.0, 2.0, 1.6, 8.0  # outer width = GAUGE + TRACK_W = 10 m
SLEW_Z = 3.0
FOOT = (0.0, -3.2, 1.6)  # boom foot in upper-local space
BOOM_L = 96.0
LUFF = (20.0, 85.0, 70.0)  # min, max, rest (deg above horizontal)
HOOK = (-90.0, -2.0, -30.0)
FOOT_SEC, MAIN_SEC, TIP_SEC = (1.4, 1.2), (3.0, 2.6), (1.4, 1.4)

TRI_BUDGETS = (20000, 6000, 1500)
REQUIRED_NODES = ["CRANE_Static", "CRANE_Upper", "CRANE_UpperGeo", "CRANE_BoomMount", "CRANE_Boom", "CRANE_BoomGeo",
                  "CRANE_Cable", "CRANE_CableGeo", "CRANE_Hook", "CRANE_HookGeo", "SOCKET_Hook", "SOCKET_BoomTip",
                  "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK, METAL, GLASS = "MAT_Clay", "MAT_ClayDark", "MAT_Metal", "MAT_Glass"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    prof = stadium_profile(TRACK_L, TRACK_H, 0.0, pick(lod, 6, 3, 2))
    for sx in (-1, 1):
        x = sx * GAUGE / 2
        add_extrusion_x(mb, prof, x - TRACK_W / 2, x + TRACK_W / 2, DARK)
        if lod == 0:  # side frame plate (lighter) over the track links
            mb.box_minmax((x + sx * TRACK_W / 2 - (0.06 if sx > 0 else -0.06) - 0.03, -TRACK_L / 2 + 1.2, 0.45),
                          (x + sx * TRACK_W / 2 + (0.03 if sx > 0 else -0.03), TRACK_L / 2 - 1.2, 1.2), CLAY)
    # Carbody between the tracks, slew ring on top.
    mb.box_minmax((-GAUGE / 2 + TRACK_W / 2, -2.6, 0.7), (GAUGE / 2 - TRACK_W / 2, 2.6, 2.4), CLAY)
    mb.box_minmax((-GAUGE / 2, -1.2, 0.9), (GAUGE / 2, 1.2, 2.1), CLAY, faces="sides")  # axles to the tracks
    mb.cylinder((0, 0, 2.4), 2.4, SLEW_Z - 2.4, pick(lod, 24, 12, 8), DARK, caps=(False, True))
    return mb


def build_upper(lod: int) -> MeshBuilder:
    """Upper-local: slew axis at the origin (z = 3 world)."""
    mb = MeshBuilder()
    full = "all" if lod == 0 else "sides"
    mb.box_minmax((-3.0, -3.0, 0.0), (3.0, 8.5, 0.6), CLAY, faces=full)  # revolving frame
    mb.box_minmax((-2.6, -0.5, 0.6), (2.6, 7.0, 3.6), CLAY)  # machinery house
    mb.box_minmax((-3.2, 7.0, 0.4), (3.2, 10.5, 4.4), CLAY)  # counterweight
    # Operator cab front-L with a glass band.
    if lod < 2:
        add_tier(mb, (2.0, -4.6, 0.6), (3.6, -1.0, 3.4), CLAY, glass=GLASS, band=(1.2, 2.4), faces=full)
    else:
        mb.box_minmax((2.0, -4.6, 0.6), (3.6, -1.0, 3.4), CLAY)
    # Boom-hoist gantry (A-frame) and foot lugs.
    for sx in (-1, 1):
        mb.beam((sx * 2.2, 0.5, 3.6), (sx * 1.2, 4.5, 8.5), 0.5, CLAY)
        mb.beam((sx * 2.2, 6.5, 3.6), (sx * 1.2, 4.5, 8.5), 0.5, CLAY)
        mb.box((sx * 1.6, FOOT[1], FOOT[2] - 0.4), (0.5, 1.6, 2.0), CLAY)
    mb.beam((-1.4, 4.5, 8.5), (1.4, 4.5, 8.5), 0.6, CLAY)
    return mb


def build_boom(lod: int) -> MeshBuilder:
    """Boom-local: foot pin at the origin, boom along +Y, lattice depth along Z."""
    mb = MeshBuilder()
    sec, chord = pick(lod, 0.12, 0.16, 0.2), pick(lod, 0.28, 0.32, 0.4)
    brace = pick(lod, "X", "Z", "Z")
    l_foot, l_tip = 9.0, 7.0
    lo = 2 if lod >= 2 else 0
    add_tapered_truss(mb, (0, 0, 0), (0, l_foot, 0), FOOT_SEC, MAIN_SEC, pick(lod, 3, 2, 1), sec, chord, METAL,
                      bracing=brace, up_hint=(0, 0, 1), lod=lo)
    add_tapered_truss(mb, (0, l_foot, 0), (0, BOOM_L - l_tip, 0), MAIN_SEC, MAIN_SEC, pick(lod, 27, 12, 1), sec,
                      chord, METAL, bracing=brace, up_hint=(0, 0, 1), lod=lo)
    add_tapered_truss(mb, (0, BOOM_L - l_tip, 0), (0, BOOM_L, 0), MAIN_SEC, TIP_SEC, pick(lod, 2, 1, 1), sec, chord,
                      METAL, bracing=brace, up_hint=(0, 0, 1), lod=lo)
    mb.box((0, BOOM_L + 0.3, 0.2), (1.2, 1.6, 1.4), METAL)  # tip sheave head
    return mb


def build_cable() -> MeshBuilder:
    mb = MeshBuilder()
    mb.beam((0, 0, 0), (0, 0, -1.0), 0.12, DARK)
    return mb


def build_hook(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    mb.box((0, 0, -0.6), (0.9, 0.6, 1.2), DARK)  # block
    if lod < 2:
        mb.beam((0, 0, -1.2), (0, 0, -1.7), 0.2, DARK)
        mb.box((0, 0.15, -1.85), (0.2, 0.5, 0.3), DARK)  # hook
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("CRANE_Static", parent=top)
    upper = pivot("CRANE_Upper", (0.0, 0.0, SLEW_Z), parent=top,
                  anim=dict(kind="rot", axis="y", min=-180.0, max=180.0, rest=0.0, unit="deg"))
    build_upper(lod).build("CRANE_UpperGeo", parent=upper)
    mount = pivot("CRANE_BoomMount", FOOT, rotation=(0.0, 0.0, math.pi), parent=upper)
    boom = pivot("CRANE_Boom", (0.0, 0.0, 0.0), rotation=(math.radians(LUFF[2]), 0.0, 0.0), parent=mount,
                 anim=dict(kind="rot", axis="x", min=LUFF[0], max=LUFF[1], rest=LUFF[2], unit="deg"))
    build_boom(lod).build("CRANE_BoomGeo", parent=boom)
    socket("BoomTip", (0.0, BOOM_L, 0.0), parent=boom)
    cable = pivot("CRANE_Cable", (0.0, BOOM_L, 0.0), rotation=(-math.radians(LUFF[2]), 0.0, 0.0), parent=boom,
                  anim=dict(kind="rot", axis="x", min=-LUFF[1], max=-LUFF[0], rest=-LUFF[2], unit="deg"))
    build_cable().build("CRANE_CableGeo", parent=cable)
    socket("Label", (0.0, 0.0, 3.0), parent=cable)
    hook = pivot("CRANE_Hook", (0.0, 0.0, HOOK[2]), parent=cable,
                 anim=dict(kind="trans", axis="y", min=HOOK[0], max=HOOK[1], rest=HOOK[2], unit="m"))
    build_hook(lod).build("CRANE_HookGeo", parent=hook)
    socket("Hook", (0.0, 0.0, -2.0), rotation=(math.pi, 0.0, 0.0), parent=hook)
    socket("Focus", (0.0, 0.0, 20.0), parent=top)


def preview_pose() -> None:
    """Preview only: cable stretched to the hook (render scales CableGeo the same way)."""
    import bpy

    bpy.data.objects["CRANE_CableGeo"].scale.z = -HOOK[2]
    bpy.data.objects["CRANE_Upper"].rotation_euler.z = math.radians(-20)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3, preview_pose=preview_pose)
