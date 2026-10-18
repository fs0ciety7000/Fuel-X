"""TANKER — cryogenic road tanker (RIME `LX` LOX / FEN `MX` LNG), ASSETS_GUIDE §2, §4 TANKER.

Run:  blender -b --factory-startup -P blender/assets/tanker.py -- --out build/models-raw/tanker.glb \
          --preview docs/assets/tanker.png

21 × 2.6 × 4.0 m: cab-over tractor (7 m) + vacuum-jacketed cryo semi-trailer (14 m), 5 axles. LX and
MX share this one GLB: real LOX and LNG semi-trailers are near-identical at game scale, so the variant
is a runtime label (call-sign prefix), not geometry — one InstancedMesh pool for the whole fleet.

Frame: faces −Y (cab front at y = −10.5), origin on the ground at the footprint centre at rest.
Hierarchy (nodes with children are empties, geometry on leaves; axles are linked duplicates):
  TANKER (root)
  ├─ TANKER_Tractor                       (identity)
  │   ├─ TANKER_TractorGeo                cab, chassis, fuel tanks, fifth-wheel plate
  │   ├─ TANKER_Steer    rot y ±35°       front axle centre (0, −9.3, 0.5)
  │   │   └─ TANKER_Axle_01  spin x      → TANKER_AxleGeo_01 (every axle: empty + shared-mesh leaf)
  │   └─ TANKER_Axle_02  spin x           drive axle (0, −5.4, 0.5)
  ├─ TANKER_Trailer      rot y ±70°       king pin on the fifth wheel (0, −5.9, 1.2)
  │   ├─ TANKER_TrailerGeo                tank, frame, landing gear, rear valve cabinet
  │   ├─ TANKER_Axle_03..05  spin x       y = 6.0 / 7.4 / 8.8 (world, at rest)
  │   └─ SOCKET_Hose                      rear valve cabinet outlet, +Z → +Y (aft)
  └─ SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import linked_copy, pivot, root, socket  # noqa: E402
from lib.shapes import add_frustum_box, add_wheel_set  # noqa: E402

ASSET = "TANKER"
VERSION = 1

FRONT, REAR = -10.5, 10.5
HALF_W = 1.3
WHEEL_R, TYRE_W, TRACK = 0.5, 0.3, 1.8
STEER_Y, DRIVE_Y = -9.3, -5.4
KINGPIN = Vector((0.0, -5.9, 1.2))
TRAILER_AXLES = (6.0, 7.4, 8.8)
TANK_R, TANK_Z = 1.2, 2.8  # top at 4.0
TANK_Y = (-6.8, 9.4)
STEER_DEG, TRAILER_DEG = 35.0, 70.0
SPIN = dict(kind="spin", axis="x", min=0.0, max=360.0, rest=0.0, unit="deg")

TRI_BUDGETS = (5000, 1200)
AXLES = [f"TANKER_Axle_{i:02d}" for i in range(1, 6)]
REQUIRED_NODES = ["TANKER_Tractor", "TANKER_TractorGeo", "TANKER_Steer", "TANKER_Trailer",
                  "TANKER_TrailerGeo", *AXLES, *(f"TANKER_AxleGeo_{i:02d}" for i in range(1, 6)),
                  "SOCKET_Hose", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK, GLASS = "MAT_Clay", "MAT_ClayDark", "MAT_Glass"


def build_tractor(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    cab_f, cab_b = FRONT + 0.1, -8.2
    # Chassis rails, bumper, cab, roof fairing.
    mb.box_minmax((-0.5, cab_f + 0.2, 0.75), (0.5, -4.5, 1.1), DARK)
    mb.box_minmax((-HALF_W, FRONT, 0.5), (HALF_W, cab_f + 0.15, 0.95), DARK)
    add_frustum_box(mb, (-HALF_W + 0.05, cab_f, 1.15), (HALF_W - 0.05, cab_b, 3.35), (0.08, 0.12, 0.0), CLAY)
    add_frustum_box(mb, (-HALF_W + 0.13, cab_f + 0.25, 3.35), (HALF_W - 0.13, cab_b + 0.1, 3.95),
                    (0.1, 0.9, 0.0), CLAY, faces="sides")
    # Glazing: windscreen on the (slightly raked) front, side windows on the doors.
    def front_y(z):  # cab front face is raked back 0.12 m over its height; glass sits 2 cm proud
        return cab_f + 0.12 * (z - 1.15) / 2.2 - 0.02

    mb.add([(-1.05, front_y(2.25), 2.25), (1.05, front_y(2.25), 2.25), (1.0, front_y(3.2), 3.2),
            (-1.0, front_y(3.2), 3.2)], [(0, 1, 2, 3)], GLASS)  # CCW seen from −Y → faces forward
    for s in (-1, 1):
        mb.box_minmax((s * 1.215 - 0.02, cab_f + 0.35, 2.3), (s * 1.215 + 0.02, cab_f + 1.3, 3.1), GLASS)
    mb.box_minmax((-0.9, cab_f - 0.03, 1.3), (0.9, cab_f + 0.02, 2.0), DARK)  # grille
    # Fuel tanks / battery boxes, exhaust stack, fifth-wheel plate, mudguards.
    for s in (-1, 1):
        xo, xi = s * 1.2, s * 0.55
        mb.box_minmax((min(xo, xi), -7.9, 0.55), (max(xo, xi), -6.6, 1.15), DARK)
        mb.box_minmax((min(s * 1.25, s * 0.6), DRIVE_Y - 0.65, 1.12), (max(s * 1.25, s * 0.6), DRIVE_Y + 0.65, 1.2),
                      DARK)  # mudguard over the drive axle
    mb.cylinder((0.95, cab_b - 0.25, 1.2), 0.11, 2.9, pick(lod, 8, 5), DARK, caps=(False, True))
    mb.box_minmax((-0.9, KINGPIN.y - 0.7, 1.1), (0.9, KINGPIN.y + 0.6, 1.2), DARK)
    return mb


def build_trailer(lod: int) -> MeshBuilder:
    """Trailer-local frame: origin at the king pin."""
    mb = MeshBuilder()
    k = KINGPIN
    seg = pick(lod, 16, 10)
    head = 0.45
    y0, y1 = TANK_Y[0] - k.y, TANK_Y[1] - k.y
    prof = [(0.0, y0), (TANK_R * 0.7, y0 + head * 0.29), (TANK_R, y0 + head), (TANK_R, y1 - head),
            (TANK_R * 0.7, y1 - head * 0.29), (0.0, y1)]
    m = Matrix.Translation((0, 0, TANK_Z - k.z)) @ Matrix.Rotation(-math.pi / 2, 4, "X")
    mb.revolve([(r, z) for r, z in prof], seg, CLAY, matrix=m, phase=math.pi / seg)
    # Frame rails + gooseneck, rear valve cabinet, bumper.
    mb.box_minmax((-0.55, -1.1, 0.0), (0.55, REAR - 0.3 - k.y, 0.45), DARK)
    mb.box_minmax((-1.2, 9.2 - k.y, 1.0 - k.z), (1.2, REAR - k.y, 2.7 - k.z), CLAY)
    mb.box_minmax((-1.25, REAR - 0.25 - k.y, 0.55 - k.z), (1.25, REAR - k.y, 0.85 - k.z), DARK)
    # Saddle supports between the frame and the tank.
    for y in (-0.6, 5.0, 11.0):
        mb.box_minmax((-0.9, y - 0.2, 0.4), (0.9, y + 0.2, TANK_Z - TANK_R * 0.55 - k.z), DARK)
    # Trailer mudguards over the three axles.
    for s in (-1, 1):
        xo, xi = s * HALF_W, s * 0.62
        mb.box_minmax((min(xo, xi), TRAILER_AXLES[0] - 0.7 - k.y, 1.05 - k.z),
                      (max(xo, xi), TRAILER_AXLES[-1] + 0.7 - k.y, 1.13 - k.z), DARK)
    if lod == 0:
        for y in (3.0, 8.0, 13.0):  # vacuum-jacket stiffener bands (trailer-local y)
            mb.revolve([(TANK_R + 0.04, y), (TANK_R + 0.04, y + 0.25)], seg, DARK, matrix=m, phase=math.pi / seg)
        for s in (-1, 1):  # landing gear and side hose tubes
            mb.beam((s * 0.9, 2.4, 0.2), (s * 0.9, 2.4, 0.3 - k.z), 0.16, DARK)
            mb.box((s * 0.9, 2.4, 0.3 - k.z - 0.04), (0.35, 0.35, 0.08), DARK)
            mb.cylinder((s * 1.08, 1.5, 0.45), 0.13, 8.5, 6, DARK, caps=(True, True), axis=(0, 1, 0))
        mb.box_minmax((-0.35, 9.0 - k.y, TANK_Z + TANK_R - 0.05 - k.z), (0.35, 9.6 - k.y, TANK_Z + TANK_R + 0.0 - k.z),
                      DARK, faces="top")
    return mb


def build_axle_mesh(lod: int):
    mb = MeshBuilder()
    add_wheel_set(mb, (0, 0, 0), WHEEL_R, TYRE_W if lod == 0 else TYRE_W * 2 + 0.04, TRACK, DARK,
                  segments=pick(lod, 12, 8), dual=(lod == 0), axle=0.16)
    obj = mb.build("TANKER_AxleMesh")
    bpy.context.scene.collection.objects.unlink(obj)
    return obj


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    tractor = pivot("TANKER_Tractor", (0.0, 0.0, 0.0), parent=top)
    build_tractor(lod).build("TANKER_TractorGeo", parent=tractor)
    axle = build_axle_mesh(lod)
    steer = pivot("TANKER_Steer", (0.0, STEER_Y, WHEEL_R), parent=tractor,
                  anim=dict(kind="rot", axis="y", min=-STEER_DEG, max=STEER_DEG, rest=0.0, unit="deg"))
    _axle(axle, AXLES[0], (0, 0, 0), steer)
    _axle(axle, AXLES[1], (0.0, DRIVE_Y, WHEEL_R), tractor)

    trailer = pivot("TANKER_Trailer", tuple(KINGPIN), parent=top,
                    anim=dict(kind="rot", axis="y", min=-TRAILER_DEG, max=TRAILER_DEG, rest=0.0, unit="deg"))
    build_trailer(lod).build("TANKER_TrailerGeo", parent=trailer)
    for name, y in zip(AXLES[2:], TRAILER_AXLES):
        _axle(axle, name, (0.0, y - KINGPIN.y, WHEEL_R - KINGPIN.z), trailer)
    # Hose outlet on the rear valve cabinet, +Z (Blender) → +Y (aft).
    socket("Hose", (0.0, REAR + 0.05 - KINGPIN.y, 1.5 - KINGPIN.z), rotation=(-math.pi / 2, 0, 0), parent=trailer)
    socket("Label", (0.0, 0.0, 4.0 + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 2.0), parent=top)


def _axle(src, name: str, location, parent):
    pv = pivot(name, location, parent=parent, anim=SPIN)
    linked_copy(src, name.replace("_Axle_", "_AxleGeo_"), (0, 0, 0), parent=pv)  # shared mesh → one InstancedMesh
    return pv


def preview_pose() -> None:
    """Preview only (after export): turning left, trailer articulated, front wheels steered."""
    bpy.data.objects["TANKER_Trailer"].rotation_euler.z = math.radians(-18)
    bpy.data.objects["TANKER_Steer"].rotation_euler.z = math.radians(20)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2, preview_pose=preview_pose)
