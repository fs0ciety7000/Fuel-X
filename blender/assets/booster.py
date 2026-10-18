"""BOOSTER — B-09 class first stage, Ø 9 × 71 m, 33 engines, 4 grid fins, tower-catch pins
(ASSETS_GUIDE §2, §4 BOOSTER).

Run:  blender -b --factory-startup -P blender/assets/booster.py -- \
          --out build/models-raw/booster.glb --preview docs/assets/booster.png [--lod all]

Frame (Blender, Z-up): origin = center of the engine plane (bell exits), i.e. the bottom of the
vehicle; stands on PAD `SOCKET_VehicleMount` (z 20). Faces −Y; L = +X, R = −X.
Catch pins on ±X at z = 66: with the booster on the mount they sit at world z 86 = TOWER carriage
rest, exactly on `SOCKET_CatchPointL/R` (±5.4, mount, carriage z). Grid fins hinge at z = 68.4,
above the arms (arm tops are at the pin plane), so ±30° of fin travel never reaches the arms.

Hierarchy (nodes with children are empties, geometry on leaves):
  BOOSTER (root)
  ├─ BOOSTER_Static                       hull, skirt, chines, raceways, hot-stage ring, pins, 20 outer engines
  ├─ BOOSTER_EnginesGimbal   rot x ±8°    gimbal plane z 2.5 (pitch)
  │   └─ BOOSTER_EnginesGimbalYaw  rot z ±8°   (yaw, same point)
  │       ├─ BOOSTER_EnginesInner         13 inner engines
  │       └─ SOCKET_Engine_01..13         (fx_ring = inner)
  ├─ BOOSTER_GridFinMount_01..04         static empty on the hull at 45/135/225/315°, local +X radial
  │   └─ BOOSTER_GridFin_01..04  rot x ±30°   (identity rest rotation, axis = radial)
  │       └─ BOOSTER_GridFinGeo_01..04    (linked duplicates of one mesh)
  └─ SOCKET_Engine_14..33 (outer), SOCKET_Exhaust, SOCKET_CatchPinL/R, SOCKET_ShipMount,
     SOCKET_BQD, SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import linked_copy, pivot, root, socket  # noqa: E402
from lib.vehicle import add_band, add_bell, add_disc, add_grid_fin, engine_layout  # noqa: E402

ASSET = "BOOSTER"
VERSION = 1

# --- Dimensions (m) ---------------------------------------------------------------------------
R = 4.5
SKIRT_Z = 0.3  # bottom edge of the aft skirt (bells protrude below it to z 0)
HEATSHIELD_Z = 2.6
GIMBAL_Z = 2.5
BELL_LEN = 2.5
HULL_TOP = 69.0
HSR_TOP = 71.0  # hot-stage ring top = SHIP origin
PIN_Z = 66.0
PIN_X = 5.4  # = TOWER CATCH_X
GRIDFIN_Z = 68.4
GRIDFIN_SPAN, GRIDFIN_CHORD, GRIDFIN_DEPTH = 3.0, 6.0, 1.0
GIMBAL_DEG = 8.0
GRIDFIN_DEG = 30.0

# 3 center + 10 inner ring (gimballed, 13) + 20 outer ring (fixed) = 33.
ENGINE_RINGS = [
    (3, 0.85, math.pi / 2, "inner"),
    (10, 2.35, 0.0, "inner"),
    (20, 3.82, math.pi / 20, "outer"),
]
EXIT_R_INNER, EXIT_R_OUTER = 0.65, 0.58

TRI_BUDGETS = (20000, 6000, 1500)
ENGINE_SOCKETS = [f"SOCKET_Engine_{k:02d}" for k in range(1, 34)]
REQUIRED_NODES = [
    "BOOSTER_Static", "BOOSTER_EnginesGimbal", "BOOSTER_EnginesGimbalYaw", "BOOSTER_EnginesInner",
    *[f"BOOSTER_GridFin_{k:02d}" for k in range(1, 5)],
    "SOCKET_Exhaust", *ENGINE_SOCKETS, "SOCKET_CatchPinL", "SOCKET_CatchPinR", "SOCKET_ShipMount",
    "SOCKET_BQD", "SOCKET_Label", "SOCKET_Focus",
]

METAL, CLAY, DARK = "MAT_Metal", "MAT_Clay", "MAT_ClayDark"


def engines():
    return engine_layout(ENGINE_RINGS)


# --- Static -------------------------------------------------------------------------------------
def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg = pick(lod, 40, 20, 12)
    # Hull: one smooth wall from the skirt to the hot-stage ring.
    add_band(mb, R, SKIRT_Z, HULL_TOP, seg, CLAY)
    # Aft heat shield (seen from below between the bells) and forward bulkhead under the ring.
    add_disc(mb, (0, 0, HEATSHIELD_Z), R, seg, DARK, up=False)
    add_disc(mb, (0, 0, HULL_TOP), R, seg, DARK, up=True)
    if lod < 2:
        # Skirt band and weld/stiffener rings (slightly proud of the hull).
        add_band(mb, R + 0.04, SKIRT_Z, SKIRT_Z + 0.5, seg, DARK)
        for z in pick(lod, (8.0, 24.5, 46.0, 63.5), (24.5, 63.5)):
            add_band(mb, R + 0.03, z, z + 0.25, seg, DARK)
            mb.revolve([(R, z), (R + 0.03, z)], seg, DARK, smooth=False)
            mb.revolve([(R + 0.03, z + 0.25), (R, z + 0.25)], seg, DARK, smooth=False)
    # Hot-stage ring: dark vented band with slats.
    add_band(mb, R - 0.05, HULL_TOP, HSR_TOP, seg, DARK)
    mb.revolve([(R, HSR_TOP), (R - 0.6, HSR_TOP)], seg, METAL, smooth=False)
    if lod < 2:
        slats = pick(lod, 24, 12)
        for k in range(slats):
            a = 2 * math.pi * (k + 0.5) / slats
            c = (R * math.cos(a), R * math.sin(a), (HULL_TOP + HSR_TOP) / 2)
            mb.box(c, (0.25, 0.5, HSR_TOP - HULL_TOP), METAL, rotation_z=a)
    # Aft chines (4 short strakes at the skirt, between the grid fin azimuths).
    if lod < 2:
        for a_deg in (0, 90, 180, 270):
            a = math.radians(a_deg)
            ux, uy = math.cos(a), math.sin(a)
            verts = []
            for z, out in ((SKIRT_Z, 0.9), (SKIRT_Z + 7.0, 0.0)):
                for t in (-0.15, 0.15):
                    verts.append((ux * (R - 0.05) - uy * t, uy * (R - 0.05) + ux * t, z))
                    verts.append((ux * (R + out) - uy * t, uy * (R + out) + ux * t, z))
            # 0 in-a,1 out-a,2 in-b,3 out-b at bottom; 4..7 top (out collapses onto in)
            faces = [(0, 1, 5, 4), (3, 2, 6, 7), (1, 3, 7, 5), (0, 2, 3, 1)]
            mb.add(verts, faces, CLAY)
    # Raceways (cable trays) along ±Y.
    for sy in (1, -1):
        if lod >= 2:
            break
        y0, y1 = sorted((sy * (R - 0.25), sy * (R + 0.35)))
        mb.box_minmax((-0.35, y0, 4.0), (0.35, y1, HULL_TOP - 1.0), CLAY)
    # Catch pins (±X): the pin's lower face is the contact plane at PIN_Z.
    for sx in (1, -1):
        x0, x1 = sorted((sx * (R - 0.2), sx * (PIN_X + 0.7)))
        mb.box_minmax((x0, -0.5, PIN_Z), (x1, 0.5, PIN_Z + 0.9), METAL)
        if lod < 2:
            xa, xb = sorted((sx * (R - 0.1), sx * (R + 0.5)))
            mb.box_minmax((xa, -0.9, PIN_Z - 1.2), (xb, 0.9, PIN_Z + 1.6), CLAY)  # doubler plate
    # Grid fin hinge housings.
    if lod < 2:
        for k in range(4):
            a = math.radians(45 + 90 * k)
            rc = R + 0.25
            mb.box((rc * math.cos(a), rc * math.sin(a), GRIDFIN_Z), (0.6, 2.0, 2.4), DARK, rotation_z=a)
    # Outer 20 fixed engines.
    bseg = pick(lod, 14, 8, 6)
    steps = pick(lod, 4, 2, 1)
    for x, y, tag in engines():
        if tag == "outer":
            add_bell(mb, (x, y, 0.0), EXIT_R_OUTER, BELL_LEN, bseg, DARK, steps=steps)
    return mb


def build_inner_engines(lod: int) -> MeshBuilder:
    """13 gimballed engines in gimbal-local space (origin on the gimbal plane, z = GIMBAL_Z)."""
    mb = MeshBuilder()
    bseg = pick(lod, 14, 8, 6)
    steps = pick(lod, 4, 2, 1)
    for x, y, tag in engines():
        if tag == "inner":
            add_bell(mb, (x, y, -GIMBAL_Z), EXIT_R_INNER, BELL_LEN, bseg, DARK, steps=steps)
    return mb


def build_gridfin(lod: int):
    mb = MeshBuilder()
    add_grid_fin(mb, GRIDFIN_SPAN, GRIDFIN_CHORD, GRIDFIN_DEPTH, pick(lod, 6, 3, 1), 0, METAL,
                 frame=pick(lod, 0.22, 0.3, 0.3), web=0.1, root_gap=0.45, lattice=lod < 2)
    if lod < 2:
        mb.box_minmax((-0.1, -0.5, -0.35), (0.5, 0.5, 0.35), METAL)  # hinge knuckle (same material: 1 draw call per fin)
    return mb


# --- Assembly -----------------------------------------------------------------------------------
def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("BOOSTER_Static", parent=top)

    gim = pivot("BOOSTER_EnginesGimbal", (0.0, 0.0, GIMBAL_Z), parent=top,
                anim=dict(kind="rot", axis="x", min=-GIMBAL_DEG, max=GIMBAL_DEG, rest=0.0, unit="deg"))
    yaw = pivot("BOOSTER_EnginesGimbalYaw", (0.0, 0.0, 0.0), parent=gim,
                anim=dict(kind="rot", axis="z", min=-GIMBAL_DEG, max=GIMBAL_DEG, rest=0.0, unit="deg"))
    build_inner_engines(lod).build("BOOSTER_EnginesInner", parent=yaw)

    for k, (x, y, tag) in enumerate(engines(), start=1):
        down = (math.pi, 0.0, 0.0)  # exhaust sockets point down
        if tag == "inner":
            socket(f"Engine_{k:02d}", (x, y, -GIMBAL_Z), rotation=down, parent=yaw, extras={"fx_ring": tag})
        else:
            socket(f"Engine_{k:02d}", (x, y, 0.0), rotation=down, parent=top, extras={"fx_ring": tag})

    fin_mesh = build_gridfin(lod).build("BOOSTER_GridFinMesh")
    bpy.context.scene.collection.objects.unlink(fin_mesh)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        # Static mount carries the azimuth so the animated child has an identity rest rotation
        # (three applies `rotation.x` about the node's own axes only when its rest rotation is zero).
        mount = pivot(f"BOOSTER_GridFinMount_{k + 1:02d}", (R * math.cos(a), R * math.sin(a), GRIDFIN_Z),
                      rotation=(0.0, 0.0, a), parent=top)
        fin = pivot(f"BOOSTER_GridFin_{k + 1:02d}", (0.0, 0.0, 0.0), parent=mount,
                    anim=dict(kind="rot", axis="x", min=-GRIDFIN_DEG, max=GRIDFIN_DEG, rest=0.0, unit="deg"))
        linked_copy(fin_mesh, f"BOOSTER_GridFinGeo_{k + 1:02d}", (0, 0, 0), parent=fin)
    bpy.data.objects.remove(fin_mesh)

    socket("Exhaust", (0.0, 0.0, 0.0), rotation=(math.pi, 0.0, 0.0), parent=top)
    socket("CatchPinL", (PIN_X, 0.0, PIN_Z), parent=top)
    socket("CatchPinR", (-PIN_X, 0.0, PIN_Z), parent=top)
    socket("ShipMount", (0.0, 0.0, HSR_TOP), parent=top)
    # Booster quick-disconnect plate on the skirt, facing the pad BQD hood (+Y).
    socket("BQD", (0.0, R, 1.6), rotation=(math.radians(-90), 0.0, 0.0), parent=top)
    socket("Label", (0.0, 0.0, HSR_TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 35.0), parent=top)


def preview_pose() -> None:
    """Preview only (after export): fins at +20°."""
    objs = bpy.data.objects
    for k in range(1, 5):
        objs[f"BOOSTER_GridFin_{k:02d}"].rotation_euler.x = math.radians(20)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=3, preview_pose=preview_pose)
