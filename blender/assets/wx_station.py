"""WX_STATION — VANE ground weather station (`WX-`), ASSETS_GUIDE §2, §4 WX_STATION.

Run:  blender -b --factory-startup -P blender/assets/wx_station.py -- \
          --out build/models-raw/wx_station.glb --preview docs/assets/wx_station.png

3 × 3 × 10 m: concrete pad, square lattice mast, instrument enclosure, solar panel facing −Y (south in
the site frame), cross arm at 9.3 m carrying a cup anemometer (L, +X) and a wind vane (R, −X).

Frame: faces −Y, origin on the ground at the pad centre.
  WX_STATION (root)
  ├─ WX_STATION_Static                     pad, mast, enclosure, solar panel, cross arm, lightning rod
  ├─ WX_STATION_Anemometer   spin y        cup rotor axis (+1.2, 0, 9.55) → WX_STATION_AnemometerGeo
  ├─ WX_STATION_Vane         rot y 0–360°  vane axis (−1.2, 0, 9.55) → WX_STATION_VaneGeo
  └─ SOCKET_Label, SOCKET_Focus
Vane convention: at 0° the arrow head points along local −Y (glTF +Z) and the tail fin trails toward +Y.
A vane points INTO the wind, so render sets rotation = heading the wind blows FROM (three: rotation about
+Y, counter-clockwise seen from above).
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import pivot, root, socket  # noqa: E402
from lib.prims import add_truss  # noqa: E402
from lib.shapes import add_quad  # noqa: E402

ASSET = "WX_STATION"
VERSION = 1

PAD = 3.0
MAST_W = 0.45
ARM_Z = 9.3
ARM_X = 1.2
ROTOR_Z = ARM_Z + 0.25
TOP = 10.0

TRI_BUDGETS = (1000, 300)
REQUIRED_NODES = ["WX_STATION_Static", "WX_STATION_Anemometer", "WX_STATION_AnemometerGeo", "WX_STATION_Vane",
                  "WX_STATION_VaneGeo", "SOCKET_Label", "SOCKET_Focus"]
CLAY, METAL = "MAT_Clay", "MAT_Metal"


def build_static(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    mb.box_minmax((-PAD / 2, -PAD / 2, 0.0), (PAD / 2, PAD / 2, 0.2), CLAY, faces="all" if lod == 0 else "sides")
    add_truss(mb, (0, 0, 0.2), (0, 0, ARM_Z), MAST_W, MAST_W, bays=pick(lod, 6, 1), section=0.04, chord=0.07,
              bracing="Z", material=METAL, lod=2 * lod)
    # Instrument enclosure on the front of the mast and the solar panel above it, tilted to −Y.
    mb.box_minmax((-0.35, -0.75, 1.1), (0.35, -MAST_W / 2, 1.95), CLAY)
    tilt = math.radians(50)
    c = Vector((0.0, -0.75, 3.0))
    n = Vector((0.0, -math.sin(tilt), math.cos(tilt)))  # panel normal: up and toward −Y
    d = Vector((0.0, math.cos(tilt), math.sin(tilt))) * 0.45  # half extent along the slope (⊥ n)
    corners = [c - Vector((0.5, 0, 0)) - d, c + Vector((0.5, 0, 0)) - d, c + Vector((0.5, 0, 0)) + d,
               c - Vector((0.5, 0, 0)) + d]
    add_quad(mb, corners, n, METAL)
    add_quad(mb, corners, -n, METAL, offset=0.03)  # back of the panel
    mb.beam((0, -MAST_W / 2, 3.0), c + n * 0.02, 0.06, METAL)
    # Cross arm, rotor posts, lightning rod.
    mb.box_minmax((-ARM_X - 0.1, -0.05, ARM_Z - 0.05), (ARM_X + 0.1, 0.05, ARM_Z + 0.05), METAL)
    for sx in (-1, 1):
        mb.cylinder((sx * ARM_X, 0, ARM_Z), 0.03, ROTOR_Z - ARM_Z, 6, METAL, caps=(False, False))
    mb.cylinder((0, 0, ARM_Z), 0.025, TOP - ARM_Z, 6, METAL, caps=(False, True))
    if lod == 0:
        mb.box_minmax((-0.25, MAST_W / 2, 0.7), (0.25, MAST_W / 2 + 0.3, 1.3), CLAY)  # battery box
        mb.beam((0.0, -0.55, 1.1), (0.0, -0.55, 0.2), 0.05, METAL)  # cable conduit
    return mb


def build_anemometer(lod: int) -> MeshBuilder:
    """Rotor-local: hub on the axis, three arms with cups (cups open in the same rotational sense)."""
    mb = MeshBuilder()
    mb.cylinder((0, 0, 0), 0.05, 0.12, 6, METAL)
    for k in range(3):
        a = 2 * math.pi * k / 3
        mb.beam((0, 0, 0.06), (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.06), 0.025, METAL)
        tip = Vector((math.cos(a) * 0.38, math.sin(a) * 0.38, 0.06))
        t = Vector((-math.sin(a), math.cos(a), 0.0))
        mb.cylinder(tip - t * 0.06, 0.075, 0.12, pick(lod, 8, 5), METAL, axis=t, caps=(True, False))
    return mb


def build_vane(lod: int) -> MeshBuilder:
    """Vane-local: axis at the origin; arrow head toward −Y, tail fin toward +Y."""
    mb = MeshBuilder()
    mb.cylinder((0, 0, 0), 0.04, 0.12, 6, METAL)
    mb.beam((0, -0.45, 0.06), (0, 0.55, 0.06), 0.035, METAL)
    head = [(0.0, -0.62, 0.06), (0.09, -0.42, 0.06), (-0.09, -0.42, 0.06)]
    add_quad(mb, head, (0, 0, 1), METAL, offset=0.005)  # arrow head, both faces
    add_quad(mb, head, (0, 0, -1), METAL, offset=0.005)
    fin = [(0.0, 0.3, -0.05), (0.0, 0.72, -0.05), (0.0, 0.72, 0.3), (0.0, 0.45, 0.2)]
    add_quad(mb, fin, (1, 0, 0), METAL, offset=0.01)
    add_quad(mb, fin, (-1, 0, 0), METAL, offset=0.01)
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_static(lod).build("WX_STATION_Static", parent=top)
    anem = pivot("WX_STATION_Anemometer", (ARM_X, 0.0, ROTOR_Z), parent=top,
                 anim=dict(kind="spin", axis="y", min=0.0, max=360.0, rest=0.0, unit="deg"))
    build_anemometer(lod).build("WX_STATION_AnemometerGeo", parent=anem)
    vane = pivot("WX_STATION_Vane", (-ARM_X, 0.0, ROTOR_Z), parent=top,
                 anim=dict(kind="rot", axis="y", min=0.0, max=360.0, rest=0.0, unit="deg"))
    build_vane(lod).build("WX_STATION_VaneGeo", parent=vane)
    socket("Label", (0.0, 0.0, TOP + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, 5.0), parent=top)


def preview_pose() -> None:
    import bpy

    bpy.data.objects["WX_STATION_Vane"].rotation_euler.z = math.radians(35)
    bpy.data.objects["WX_STATION_Anemometer"].rotation_euler.z = math.radians(20)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2, preview_pose=preview_pose)
