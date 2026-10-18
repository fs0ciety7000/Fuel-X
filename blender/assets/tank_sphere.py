"""TANK_SPHERE — spherical storage tank (LN2) on 8 legs, ASSETS_GUIDE §2, §4 TANK_SPHERE.

Run:  blender -b --factory-startup -P blender/assets/tank_sphere.py -- \
          --out build/models-raw/tank_sphere.glb --preview docs/assets/tank_sphere.png

Ø 18 m sphere, equator at 15 m, crown at 24 m: 8 columns tangent at the equator with X bracing
between them, equatorial ring girder, a helical stair round the legs up to an equator landing and a
meridian stair over the upper hemisphere to a crown platform with a guard rail; fill line from the
bottom nozzle out to a stub facing −Y, vent on the crown.

Instancing-ready (ASSETS_GUIDE §6): one leaf mesh `TANK_SPHERE_Body`, MAT_Clay shell + MAT_Metal
structure, no animated parts, origin on the ground under the sphere centre.
  TANK_SPHERE (root) ├─ TANK_SPHERE_Body └─ SOCKET_Fill, SOCKET_Vent, SOCKET_Label, SOCKET_Focus
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mathutils import Matrix, Vector  # noqa: E402

from lib.lod import pick, run_asset  # noqa: E402
from lib.mesh import MeshBuilder  # noqa: E402
from lib.nodes import root, socket  # noqa: E402
from lib.shapes import add_band, add_polyline_beam, add_ring_railing  # noqa: E402

ASSET = "TANK_SPHERE"
VERSION = 1

RADIUS = 9.0
EQUATOR = 15.0
TOP = EQUATOR + RADIUS  # 24
LEGS = 8
LEG = 0.7
BRACE_TOP = 10.0
STAIR_R = (10.0, 11.0)  # helical stair inner / outer stringer radius
STAIR_A = (math.radians(-160), math.radians(-60))  # start (ground) → landing (equator), CCW from +X
FILL = Vector((0.0, -RADIUS - 1.5, 0.8))
VENT = Vector((0.0, 0.0, TOP + 1.2))

TRI_BUDGETS = (2500, 600)
REQUIRED_NODES = ["TANK_SPHERE_Body", "SOCKET_Fill", "SOCKET_Vent", "SOCKET_Label", "SOCKET_Focus"]
CLAY, METAL = "MAT_Clay", "MAT_Metal"


def _polar(r: float, a: float, z: float) -> Vector:
    return Vector((r * math.cos(a), r * math.sin(a), z))


def build_body(lod: int) -> MeshBuilder:
    mb = MeshBuilder()
    seg, rings = pick(lod, 24, 12), pick(lod, 12, 6)
    c = Matrix.Translation((0, 0, EQUATOR))
    prof = []
    for i in range(rings + 1):
        a = -math.pi / 2 + math.pi * i / rings
        prof.append((0.0 if i in (0, rings) else RADIUS * math.cos(a), RADIUS * math.sin(a)))
    mb.revolve(prof, seg, CLAY, matrix=c, phase=math.pi / seg)
    add_band(mb, (0, 0, EQUATOR - 0.45), RADIUS + 0.12, 0.0, 0.9, seg, METAL)  # equatorial girder
    # Columns tangent to the equator, with footings, and X bracing between neighbours.
    leg_a = [2 * math.pi * (k + 0.5) / LEGS for k in range(LEGS)]
    for a in leg_a:
        p = _polar(RADIUS + LEG / 2, a, 0.0)
        mb.beam(p, p + Vector((0, 0, EQUATOR)), LEG, METAL)
        if lod == 0:
            mb.box(p + Vector((0, 0, 0.2)), (1.4, 1.4, 0.4), METAL)
    if lod == 0:
        for k in range(LEGS):
            a0, a1 = leg_a[k], leg_a[(k + 1) % LEGS]
            r = RADIUS + LEG / 2
            mb.beam(_polar(r, a0, 0.6), _polar(r, a1, BRACE_TOP), 0.25, METAL)
            mb.beam(_polar(r, a1, 0.6), _polar(r, a0, BRACE_TOP), 0.25, METAL)
            mb.beam(_polar(r, a0, BRACE_TOP), _polar(r, a1, BRACE_TOP), 0.3, METAL)
    # Helical stair round the legs: two stringers + outer hand rail + a few treads.
    n = pick(lod, 8, 4)
    for r in STAIR_R:
        pts = [_polar(r, STAIR_A[0] + (STAIR_A[1] - STAIR_A[0]) * i / n, EQUATOR * i / n) for i in range(n + 1)]
        add_polyline_beam(mb, pts, 0.18 if lod == 0 else 0.3, METAL)
    if lod == 0:
        rail = [_polar(STAIR_R[1], STAIR_A[0] + (STAIR_A[1] - STAIR_A[0]) * i / n, EQUATOR * i / n + 1.0)
                for i in range(n + 1)]
        add_polyline_beam(mb, rail, 0.07, METAL)
        for i in range(n + 1):
            a = STAIR_A[0] + (STAIR_A[1] - STAIR_A[0]) * i / n
            z = EQUATOR * i / n
            mb.beam(_polar(STAIR_R[0], a, z), _polar(STAIR_R[1], a, z), 0.14, METAL)
            mb.beam(_polar(STAIR_R[1], a, z), _polar(STAIR_R[1], a, z + 1.0), 0.07, METAL)
        for i in range(1, n):  # stair supports down to the ground
            a = STAIR_A[0] + (STAIR_A[1] - STAIR_A[0]) * i / n
            mb.beam(_polar(10.5, a, 0.0), _polar(10.5, a, EQUATOR * i / n), 0.2, METAL)
    # Landing at the equator, then the meridian stair over the upper hemisphere to the crown platform.
    la = STAIR_A[1]
    land_c = _polar((RADIUS + STAIR_R[1]) / 2 + 0.2, la, EQUATOR)
    mb.box(land_c - Vector((0, 0, 0.08)), (2.4, 2.4, 0.16), METAL, rotation_z=la)
    m = pick(lod, 7, 3)
    tang = Vector((-math.sin(la), math.cos(la), 0.0))
    for off in ((-0.5, 0.0), (0.5, 0.0), (0.5, 1.0)) if lod == 0 else ((0.0, 0.0),):
        pts = []
        for i in range(m + 1):
            phi = math.radians(8 + 72 * i / m)  # elevation above the equator
            radial = Vector((math.cos(la) * math.cos(phi), math.sin(la) * math.cos(phi), math.sin(phi)))
            pts.append(Vector((0, 0, EQUATOR)) + radial * (RADIUS + 0.35 + off[1]) + tang * off[0])
        add_polyline_beam(mb, pts, 0.16 if off[1] == 0 else 0.07, METAL)
    mb.revolve([(2.6, TOP - 0.55), (2.6, TOP - 0.4)], pick(lod, 12, 8), METAL, smooth=False,
               cap_top=True)  # crown platform
    if lod == 0:
        add_ring_railing(mb, (0, 0, 0), 2.6, TOP - 0.4, 12, METAL, height=1.0, section=0.07, posts=6)
    # Fill line from the bottom nozzle to a stub facing −Y; vent on the crown.
    pipe = pick(lod, 0.35, 0.45)
    bottom = EQUATOR - RADIUS
    mb.beam(Vector((0, 0, bottom + 0.3)), Vector((0, 0, FILL.z)), pipe, METAL)
    mb.beam(Vector((0, pipe / 2, FILL.z)), FILL, pipe, METAL, caps=True)
    mb.box((FILL.x, FILL.y + 0.25, FILL.z), (0.8, 0.1, 0.8), METAL)  # flange
    mb.cylinder((0, 0, TOP - 0.5), 0.25, VENT.z - TOP + 0.5, pick(lod, 8, 6), METAL, caps=(False, True))
    return mb


def build(lod: int) -> None:
    top = root(ASSET, VERSION, lod)
    build_body(lod).build("TANK_SPHERE_Body", parent=top)
    socket("Fill", tuple(FILL), rotation=(math.pi / 2, 0, 0), parent=top)  # +Z → −Y
    socket("Vent", tuple(VENT), parent=top)
    socket("Label", (0.0, 0.0, VENT.z + 3.0), parent=top)
    socket("Focus", (0.0, 0.0, EQUATOR), parent=top)


if __name__ == "__main__":
    run_asset(ASSET, build, REQUIRED_NODES, TRI_BUDGETS, lods=2)
