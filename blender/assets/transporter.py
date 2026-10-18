"""TRANSPORTER — MULE self-propelled modular transporter (SPMT), ASSETS_GUIDE §2, §4 TRANSPORTER.

Run:  blender -b --factory-startup -P blender/assets/transporter.py -- \
          --out build/models-raw/transporter.glb --preview docs/assets/transporter.png

Deck 16 m (Y) × 14 m (X), top at 1.6 m, on 2 lines × 8 independently steered bogies; power pack on
the rear (+Y) end; a 3 m launch-vehicle stand (ring girder Ø 9.2 m on 8 columns) carries a booster
or ship vertically: their origin (engine plane) goes on SOCKET_Cargo, the bells sit inside the ring.

Frame: faces −Y, L = +X. Origin on the ground at the deck centre.
Hierarchy (nodes with children are empties; bogie frames and wheels are linked duplicates):
  TRANSPORTER (root)
  ├─ TRANSPORTER_Static                       module frames, power pack
  ├─ TRANSPORTER_Deck        trans y 0→0.6 m  (deck top centre, z = 1.6 at rest)
  │   ├─ TRANSPORTER_DeckGeo                  load platform, end beams, stand
  │   └─ SOCKET_Cargo                         stand top centre (z = 4.6 at rest)
  └─ TRANSPORTER_Bogie_01..16  rot y ±90°     king pin (x = ±5.4, y = −7…7 step 2, z = 1.0);
      │                                       01–08 = L line (+X) front→rear, 09–16 = R line (−X)
      ├─ TRANSPORTER_BogieGeo_NN              suspension housing (shared mesh)
      └─ TRANSPORTER_Wheel_NN  spin x         axle (z = 0.45) → TRANSPORTER_WheelGeo_NN (shared mesh,
                                              2 × dual tyres = one wheel pair)
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
from lib.nodes import linked_copy, pivot, root, socket  # noqa: E402
from lib.shapes import add_wheel_set  # noqa: E402

ASSET = "TRANSPORTER"
VERSION = 1

DECK_L, DECK_W, DECK_TOP = 16.0, 14.0, 1.6
DECK_T = 0.3  # platform thickness
LIFT = 0.6
LINES_X = (5.4, -5.4)  # L, R — near the deck edges so the wheel rows read from the side
BOGIE_Y = [-7.0 + 2.0 * i for i in range(8)]
KINGPIN_Z = 1.0
FRAME_W, FRAME_TOP = 2.4, DECK_TOP - DECK_T  # module frames under the platform
WHEEL_R, TYRE_W, PAIR_TRACK = 0.45, 0.3, 1.0
STAND_H = 3.0
RING_R = (3.9, 4.6)
STEER_DEG = 90.0
N = len(LINES_X) * len(BOGIE_Y)
SPIN = dict(kind="spin", axis="x", min=0.0, max=360.0, rest=0.0, unit="deg")

TRI_BUDGETS = (8000, 2000)
BOGIES = [f"TRANSPORTER_Bogie_{i:02d}" for i in range(1, N + 1)]
WHEELS = [f"TRANSPORTER_Wheel_{i:02d}" for i in range(1, N + 1)]
REQUIRED_NODES = ["TRANSPORTER_Static", "TRANSPORTER_Deck", "TRANSPORTER_DeckGeo", *BOGIES, *WHEELS,
                  *(f"TRANSPORTER_BogieGeo_{i:02d}" for i in range(1, N + 1)),
                  *(f"TRANSPORTER_WheelGeo_{i:02d}" for i in range(1, N + 1)),
                  "SOCKET_Cargo", "SOCKET_Label", "SOCKET_Focus"]
CLAY, DARK, METAL = "MAT_Clay", "MAT_ClayDark", "MAT_Metal"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    for x in LINES_X:  # module frames: one per line, king pins hang below them
        mb.box_minmax((x - FRAME_W / 2, -DECK_L / 2 + 0.3, KINGPIN_Z), (x + FRAME_W / 2, DECK_L / 2 - 0.3, FRAME_TOP),
                      DARK, faces="all" if lod == 0 else "sides")
    mb.box_minmax((-LINES_X[0] + FRAME_W / 2, -0.6, KINGPIN_Z + 0.1), (LINES_X[0] - FRAME_W / 2, 0.6, FRAME_TOP),
                  DARK, faces="sides")  # cross tie between the lines
    # Power pack unit on the rear end (engine, hydraulics), with radiator and exhaust.
    y0, y1 = DECK_L / 2 - 0.1, DECK_L / 2 + 1.6
    mb.box_minmax((-2.2, y0, 0.55), (2.2, y1, 2.7), CLAY)
    mb.box_minmax((-1.6, y1, 1.1), (1.6, y1 + 0.05, 2.4), DARK)  # radiator grille
    mb.box_minmax((-2.2, y0, 0.45), (2.2, y1, 0.55), DARK)
    if lod == 0:
        mb.cylinder((1.6, y0 + 0.5, 2.7), 0.1, 0.9, 6, DARK, caps=(False, True))
        mb.box_minmax((-2.0, y0 + 0.2, 2.7), (-0.6, y0 + 1.2, 3.0), DARK)  # control cabinet / beacon
    return mb


def build_deck(lod: int) -> MeshBuilder:
    """Deck-local frame: origin at the deck top centre."""
    mb = MeshBuilder()
    hx, hy = DECK_W / 2, DECK_L / 2
    mb.box_minmax((-hx, -hy, -DECK_T), (hx, hy, 0.0), CLAY)
    for sy in (-1, 1):  # end beams (front/rear) hide the cross tie; the wheel rows stay visible on the sides
        lo, hi = sorted((sy * hy, sy * (hy - 0.15)))
        mb.box_minmax((-hx + 0.6, lo, -DECK_T - 0.35), (hx - 0.6, hi, -DECK_T), CLAY, faces="sides")
    # Launch-vehicle stand: 8 columns, ring girder (annulus with inner/outer walls), K bracing.
    seg = pick(lod, 24, 12)
    r0, r1 = RING_R
    ring_h = 0.45
    z0 = STAND_H - ring_h
    mb.revolve([(r0, z0), (r1, z0), (r1, STAND_H), (r0, STAND_H), (r0, z0)], seg, METAL, smooth=False,
               phase=math.pi / seg)
    cols = 8
    rc = (r0 + r1) / 2
    for k in range(cols):
        a = 2 * math.pi * (k + 0.5) / cols
        p = Vector((rc * math.cos(a), rc * math.sin(a), 0.0))
        mb.box(p + Vector((0, 0, z0 / 2)), (0.6, 0.6, z0), METAL, rotation_z=a)
        mb.box(p + Vector((0, 0, 0.06)), (1.2, 1.2, 0.12), METAL, rotation_z=a)  # base plate
        if lod == 0:
            a2 = 2 * math.pi * (k + 1.5) / cols
            q = Vector((rc * math.cos(a2), rc * math.sin(a2), 0.0))
            mid = (p + q) / 2
            mb.beam(p + Vector((0, 0, 0.3)), mid + Vector((0, 0, z0 - 0.05)), 0.22, METAL)
            mb.beam(q + Vector((0, 0, 0.3)), mid + Vector((0, 0, z0 - 0.05)), 0.22, METAL)
    if lod == 0:
        for k in range(4):  # hold-down clamps on the ring
            a = 2 * math.pi * k / 4
            mb.box((rc * math.cos(a), rc * math.sin(a), STAND_H + 0.2), (0.8, 0.8, 0.4), DARK, rotation_z=a)
        for sx in (-1, 1):  # tie-down rails along the deck edges
            mb.box_minmax((sx * (hx - 0.9) - 0.15, -hy + 0.6, 0.0), (sx * (hx - 0.9) + 0.15, hy - 0.6, 0.12), DARK,
                          faces="top")
    return mb


def build_bogie_mesh(lod: int):
    """Suspension housing in king-pin-local coordinates (hangs from z 0 to just above the axle)."""
    mb = MeshBuilder()
    axle_z = WHEEL_R - KINGPIN_Z
    mb.box_minmax((-0.32, -0.3, axle_z + 0.15), (0.32, 0.3, 0.0), METAL, faces="sides" if lod else "all")
    mb.box_minmax((-0.55, -0.42, -0.12), (0.55, 0.42, 0.0), METAL)  # turntable plate under the frame
    if lod == 0:
        mb.beam((0, -0.25, axle_z + 0.15), (0, -0.25 - 0.35, axle_z + 0.05), 0.18, METAL)  # trailing arm
    obj = mb.build("TRANSPORTER_BogieMesh")
    bpy.context.scene.collection.objects.unlink(obj)
    return obj


def build_wheel_mesh(lod: int):
    mb = MeshBuilder()
    if lod == 0:
        add_wheel_set(mb, (0, 0, 0), WHEEL_R, TYRE_W, PAIR_TRACK, DARK, segments=12, dual=True, axle=0.18)
    else:
        add_wheel_set(mb, (0, 0, 0), WHEEL_R, 2 * TYRE_W + 0.04, PAIR_TRACK, DARK, segments=8, axle=0.2)
    obj = mb.build("TRANSPORTER_WheelMesh")
    bpy.context.scene.collection.objects.unlink(obj)
    return obj


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("TRANSPORTER_Static", parent=top)
    deck = pivot("TRANSPORTER_Deck", (0.0, 0.0, DECK_TOP), parent=top,
                 anim=dict(kind="trans", axis="y", min=0.0, max=LIFT, rest=0.0, unit="m"))
    build_deck(lod).build("TRANSPORTER_DeckGeo", parent=deck)
    socket("Cargo", (0.0, 0.0, STAND_H), parent=deck)

    bogie_mesh, wheel_mesh = build_bogie_mesh(lod), build_wheel_mesh(lod)
    i = 0
    for x in LINES_X:
        for y in BOGIE_Y:
            i += 1
            bogie = pivot(BOGIES[i - 1], (x, y, KINGPIN_Z), parent=top,
                          anim=dict(kind="rot", axis="y", min=-STEER_DEG, max=STEER_DEG, rest=0.0, unit="deg"))
            linked_copy(bogie_mesh, f"TRANSPORTER_BogieGeo_{i:02d}", (0, 0, 0), parent=bogie)
            wheel = pivot(WHEELS[i - 1], (0.0, 0.0, WHEEL_R - KINGPIN_Z), parent=bogie, anim=SPIN)
            linked_copy(wheel_mesh, f"TRANSPORTER_WheelGeo_{i:02d}", (0, 0, 0), parent=wheel)

    socket("Label", (0.0, 0.0, DECK_TOP + STAND_H + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 2.5), parent=top)


def preview_pose() -> None:
    """Preview only (after export): deck lifted, bogies in a carousel (pivot-in-place) steer pattern."""
    objs = bpy.data.objects
    objs["TRANSPORTER_Deck"].location.z = DECK_TOP + LIFT
    for name in BOGIES:
        b = objs[name]
        # Tangent to the circle around the deck centre: wheel axle (local X) points at the centre.
        b.rotation_euler.z = math.atan(b.location.y / b.location.x)  # within the ±90° steer range


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2, preview_pose=preview_pose)
