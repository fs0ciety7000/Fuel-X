"""SHIP — S-21 class upper stage, Ø 9 × 52 m, 4 flaps, 3 sea-level + 3 vacuum engines
(ASSETS_GUIDE §2, §4 SHIP).

Run:  blender -b --factory-startup -P blender/assets/ship.py -- \
          --out build/models-raw/ship.glb --preview docs/assets/ship.png [--lod all]

Frame (Blender, Z-up): origin = center of the engine plane (bell exits) = bottom of the vehicle;
stacks on BOOSTER `SOCKET_ShipMount` (z 71 → world 91 on the mount). Faces −Y: the heat shield
(MAT_Clay, like the hull — see build_static) covers the −Y half (belly), flap hinges sit on the ±X tile line; L = +X, R = −X.
`SOCKET_QD` is on the leeward hull facing the TOWER QD hinge (−11, −7.5) relative to the tower,
i.e. direction (−11, 18.5) from the ship axis, at z = 9 (tower QD height 100 − 91).
Lift pins on ±X at z = 44: on the stack they sit at world 135 = TOWER carriage max.

Hierarchy (nodes with children are empties, geometry on leaves):
  SHIP (root)
  ├─ SHIP_Static                      hull, nose, heat shield, lift pins, QD plate, 3 vac engines
  ├─ SHIP_EnginesGimbal  rot x ±12°   gimbal plane z 2.4 (pitch)
  │   └─ SHIP_EnginesGimbalYaw  rot z ±12°
  │       ├─ SHIP_EnginesSL           3 sea-level engines
  │       └─ SOCKET_Engine_01..03     (fx_ring = inner)
  ├─ SHIP_FlapMountFL/FR/AL/AR        static empties on the hinge line (fore ones tilted along the nose)
  │   └─ SHIP_FlapFL/FR/AL/AR  rot y  0° folded (along +Y, leeward) → ±90° deployed (radial);
  │       │                    L = negative, R = positive (like TOWER_ArmL/R), rest ±45°
  │       └─ SHIP_FlapFLGeo …
  └─ SOCKET_Engine_04..06 (vac, fx_ring = outer), SOCKET_Exhaust, SOCKET_LiftPinL/R, SOCKET_QD,
     SOCKET_Label, SOCKET_Focus
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
from lib.vehicle import add_bell, add_disc, add_flap, add_revolve_arc, engine_layout, nose_profile, nose_radius  # noqa: E402,E501

ASSET = "SHIP"
VERSION = 1

# --- Dimensions (m) ---------------------------------------------------------------------------
R = 4.5
NOSE_Z0, NOSE_LEN = 37.0, 15.0  # cylinder 0 → 37, nose to 52
TOP = NOSE_Z0 + NOSE_LEN
AFT_BULKHEAD_Z = 3.7
GIMBAL_Z = 2.4
SL_EXIT_R, SL_LEN = 0.65, 2.4
VAC_EXIT_R, VAC_LEN = 1.15, 3.6
GIMBAL_DEG = 12.0
PIN_Z, PIN_X = 44.0, 5.4  # = TOWER CATCH_X; carriage 135 m on the stack
QD_Z = 9.0  # TOWER QD_HEIGHT (100) − ship base on the stack (20 + 71)
QD_DIR = Vector((-11.0, 18.5, 0.0)).normalized()  # ship axis → tower QD hinge (TOWER frame)
HINGE_OFF = 0.3  # flap hinge axis stands this far off the hull
AFT_FLAP = dict(z0=1.5, root=10.0, tip=7.0, span=4.0)
FORE_FLAP = dict(z0=45.2, z1=51.0, tip=4.0, span=3.0)
FLAP_THICK = 0.35

ENGINE_RINGS = [
    (3, 1.3, math.pi / 2, "inner"),   # sea level, gimballed: 90°, 210°, 330°
    (3, 3.25, math.pi / 6, "outer"),  # vacuum, fixed: 30°, 150°, 270°
]

TRI_BUDGETS = (15000, 5000, 1000)
FLAPS = ("FL", "FR", "AL", "AR")
REQUIRED_NODES = [
    "SHIP_Static", "SHIP_EnginesGimbal", "SHIP_EnginesGimbalYaw", "SHIP_EnginesSL",
    *[f"SHIP_Flap{f}" for f in FLAPS], *[f"SHIP_Flap{f}Geo" for f in FLAPS],
    "SOCKET_Exhaust", *[f"SOCKET_Engine_{k:02d}" for k in range(1, 7)], "SOCKET_LiftPinL", "SOCKET_LiftPinR",
    "SOCKET_QD", "SOCKET_Label", "SOCKET_Focus",
]

METAL, CLAY, DARK = "MAT_Metal", "MAT_Clay", "MAT_ClayDark"


def engines():
    return engine_layout(ENGINE_RINGS)


def hull_profile(lod: int):
    prof = [(R, 0.0), (R, NOSE_Z0)]
    return prof + nose_profile(R, NOSE_Z0, NOSE_LEN, pick(lod, 14, 7, 4))[1:]


def fore_hinge():
    """(bottom, top) hinge points (r, z) on the nose surface, offset by HINGE_OFF."""
    z0, z1 = FORE_FLAP["z0"], FORE_FLAP["z1"]
    r0 = nose_radius(R, NOSE_Z0, NOSE_LEN, z0) + HINGE_OFF
    r1 = nose_radius(R, NOSE_Z0, NOSE_LEN, z1) + HINGE_OFF
    return (r0, z0), (r1, z1)


# --- Static -------------------------------------------------------------------------------------
def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    half = pick(lod, 20, 10, 6)  # segments per half hull
    prof = hull_profile(lod)
    # Leeward half (+Y, angles 0 → π) and belly half (−Y, π → 2π, heat shield). Both MAT_Clay: the
    # reference reads the whole stack as one light clay; the tile line is marked by the dark hinge
    # fairings (a dark belly faced the default camera and made the ship read as a different object).
    add_revolve_arc(mb, prof, 0.0, math.pi, half, CLAY)
    add_revolve_arc(mb, prof, math.pi, 2 * math.pi, half, CLAY)
    add_disc(mb, (0, 0, AFT_BULKHEAD_Z), R, 2 * half, DARK, up=False)
    if lod < 2:
        # Skirt lip and a couple of weld rings on the leeward side.
        add_revolve_arc(mb, [(R + 0.04, 0.0), (R + 0.04, 0.4)], 0.0, 2 * math.pi, 2 * half, DARK)
        for z in pick(lod, (14.0, 27.0), (27.0,)):
            add_revolve_arc(mb, [(R + 0.03, z), (R + 0.03, z + 0.2)], 0.0, math.pi, half, DARK)
        # Hinge fairings along the tile line (±X) for the aft flaps.
        for sx in (1, -1):
            x0, x1 = sorted((sx * (R - 0.1), sx * (R + HINGE_OFF)))
            mb.box_minmax((x0, -0.35, AFT_FLAP["z0"] - 0.5), (x1, 0.35, AFT_FLAP["z0"] + AFT_FLAP["root"] + 0.5),
                          DARK)
        # Fore hinge fairings follow the nose line.
        (r0, z0), (r1, z1) = fore_hinge()
        for sx in (1, -1):
            mb.beam((sx * (r0 - 0.15), 0, z0 - 0.4), (sx * (r1 - 0.15), 0, z1 + 0.3), (0.5, 0.6), DARK)
    # Lift pins (±X), lower face at PIN_Z.
    rp = nose_radius(R, NOSE_Z0, NOSE_LEN, PIN_Z)
    for sx in (1, -1):
        x0, x1 = sorted((sx * (rp - 0.3), sx * (PIN_X + 0.6)))
        mb.box_minmax((x0, -0.45, PIN_Z), (x1, 0.45, PIN_Z + 0.85), METAL)
    # QD plate on the leeward hull, facing the tower QD arm.
    a = math.atan2(QD_DIR.y, QD_DIR.x)
    c = QD_DIR * R
    mb.box((c.x, c.y, QD_Z), (0.3, 2.2, 3.0), DARK, rotation_z=a)
    if lod < 2:
        cc = QD_DIR * (R + 0.05)
        mb.box((cc.x, cc.y, QD_Z + 3.5), (0.25, 0.8, 4.0), CLAY, rotation_z=a)  # umbilical cover
    # Vacuum engines (fixed).
    bseg = pick(lod, 18, 10, 6)
    steps = pick(lod, 5, 3, 1)
    for x, y, tag in engines():
        if tag == "outer":
            add_bell(mb, (x, y, 0.0), VAC_EXIT_R, VAC_LEN, bseg, DARK, steps=steps, throat_ratio=0.3)
    return mb


def build_sl_engines(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    bseg = pick(lod, 14, 8, 6)
    steps = pick(lod, 4, 2, 1)
    for x, y, tag in engines():
        if tag == "inner":
            add_bell(mb, (x, y, -GIMBAL_Z), SL_EXIT_R, SL_LEN, bseg, DARK, steps=steps,
                     powerhead=AFT_BULKHEAD_Z - GIMBAL_Z - 0.05 if lod < 2 else 0.0)
    return mb


def build_flap_geo(fore: bool) -> MeshBuilder:
    mb = MeshBuilder()
    if fore:
        (r0, z0), (r1, z1) = fore_hinge()
        root_len = math.hypot(r1 - r0, z1 - z0)
        add_flap(mb, root_len, FORE_FLAP["tip"], FORE_FLAP["span"], FLAP_THICK, CLAY, sweep=0.4)
    else:
        add_flap(mb, AFT_FLAP["root"], AFT_FLAP["tip"], AFT_FLAP["span"], FLAP_THICK, CLAY, sweep=-0.6)
    return mb


# --- Assembly -----------------------------------------------------------------------------------
def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("SHIP_Static", parent=top)

    gim = pivot("SHIP_EnginesGimbal", (0.0, 0.0, GIMBAL_Z), parent=top,
                anim=dict(kind="rot", axis="x", min=-GIMBAL_DEG, max=GIMBAL_DEG, rest=0.0, unit="deg"))
    yaw = pivot("SHIP_EnginesGimbalYaw", (0.0, 0.0, 0.0), parent=gim,
                anim=dict(kind="rot", axis="z", min=-GIMBAL_DEG, max=GIMBAL_DEG, rest=0.0, unit="deg"))
    build_sl_engines(lod).build("SHIP_EnginesSL", parent=yaw)
    down = (math.pi, 0.0, 0.0)
    for k, (x, y, tag) in enumerate(engines(), start=1):
        if tag == "inner":
            socket(f"Engine_{k:02d}", (x, y, -GIMBAL_Z), rotation=down, parent=yaw, extras={"fx_ring": tag})
        else:
            socket(f"Engine_{k:02d}", (x, y, 0.0), rotation=down, parent=top, extras={"fx_ring": tag})

    (r0, z0), (r1, z1) = fore_hinge()
    tilt = math.atan2(r0 - r1, z1 - z0)  # top of the fore hinge leans toward the axis
    for name in FLAPS:
        fore, side = name[0] == "F", (1 if name[1] == "L" else -1)
        if fore:
            loc, rot = (side * r0, 0.0, z0), (0.0, -side * tilt, 0.0)
        else:
            loc, rot = (side * (R + HINGE_OFF), 0.0, AFT_FLAP["z0"]), (0.0, 0.0, 0.0)
        mount = pivot(f"SHIP_FlapMount{name}", loc, rotation=rot, parent=top)
        lo, hi = (-90.0, 0.0) if side > 0 else (0.0, 90.0)
        flap = pivot(f"SHIP_Flap{name}", (0.0, 0.0, 0.0), parent=mount,
                     anim=dict(kind="rot", axis="y", min=lo, max=hi, rest=side * -45.0, unit="deg"))
        flap.rotation_euler.z = math.radians(side * -45.0)  # export at rest (45°)
        build_flap_geo(fore).build(f"SHIP_Flap{name}Geo", parent=flap)

    socket("Exhaust", (0.0, 0.0, 0.0), rotation=down, parent=top)
    socket("LiftPinL", (PIN_X, 0.0, PIN_Z), parent=top)
    socket("LiftPinR", (-PIN_X, 0.0, PIN_Z), parent=top)
    # On the hull radius, exactly where TOWER SOCKET_ShipQD lands when the QD arm is at 90°.
    q = QD_DIR * R
    socket("QD", (q.x, q.y, QD_Z), rotation=QD_DIR.to_track_quat("Z", "Y").to_euler(), parent=top)
    socket("Label", (0.0, 0.0, TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 26.0), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3)
