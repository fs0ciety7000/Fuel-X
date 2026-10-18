"""Extra MeshBuilder primitives for tanks, vehicles and small props (task 4.5).

New module on purpose: `prims.py` signatures are shared with other asset scripts and stay frozen.
Every function appends to a `MeshBuilder` (one primitive per material, deterministic vertex order).
"""

import math

from mathutils import Matrix, Vector

from .mesh import MeshBuilder


def _v(p) -> Vector:
    return p.copy() if isinstance(p, Vector) else Vector(p)


# --------------------------------------------------------------------------------------------
# Rings, arcs, ladders
# --------------------------------------------------------------------------------------------
def arc_points(center, radius: float, a0: float, a1: float, segments: int, z: float | None = None) -> list:
    """Points on a horizontal arc (angles in radians, counter-clockwise from +X)."""
    c = _v(center)
    zz = c.z if z is None else z
    return [Vector((c.x + radius * math.cos(a0 + (a1 - a0) * i / segments),
                    c.y + radius * math.sin(a0 + (a1 - a0) * i / segments), zz)) for i in range(segments + 1)]


def add_polyline_beam(mb: MeshBuilder, points, section: float, material: str, closed: bool = False) -> None:
    pts = list(points)
    if closed:
        pts = pts + [pts[0]]
    for a, b in zip(pts, pts[1:]):
        mb.beam(a, b, section, material)


def add_band(mb: MeshBuilder, center, radius: float, z0: float, z1: float, segments: int, material: str,
             smooth: bool = True) -> None:
    """Open cylindrical band (no caps) — stiffener rings, skirts, collars."""
    mb.revolve([(radius, z0), (radius, z1)], segments, material, smooth=smooth,
               matrix=Matrix.Translation(_v(center)))


def add_ring_railing(mb: MeshBuilder, center, radius: float, z: float, segments: int, material: str,
                     height: float = 1.1, section: float = 0.06, posts: int | None = None,
                     a0: float = 0.0, a1: float = 2 * math.pi) -> None:
    """Circular (or arc) guard rail: top rail + posts, no mid rail (reads at game scale)."""
    closed = abs((a1 - a0) - 2 * math.pi) < 1e-6
    top = arc_points(center, radius, a0, a1, segments, z + height)
    add_polyline_beam(mb, top[:-1] if closed else top, section, material, closed=closed)
    n = posts if posts is not None else segments
    for p in arc_points(center, radius, a0, a1, n, z)[: n if closed else n + 1]:
        mb.beam(p, p + Vector((0, 0, height)), section, material)


def add_ladder(mb: MeshBuilder, foot, top_z: float, outward, material: str, width: float = 0.6,
               cage_from: float = 2.5, hoop_step: float = 3.0, rail: float = 0.08, cage_r: float = 0.45) -> None:
    """Fixed ladder with a safety cage. `foot` = ladder centre at the bottom, `outward` = horizontal unit
    vector pointing away from the wall. Rungs are omitted (invisible at game scale); hoops are 3-segment
    U shapes every `hoop_step`, two cage bars on the outside."""
    f = _v(foot)
    out = _v(outward).normalized()
    side = Vector((0, 0, 1)).cross(out).normalized()
    for s in (-1, 1):
        mb.beam(f + side * (s * width / 2), f + side * (s * width / 2) + Vector((0, 0, top_z - f.z)), rail, material)
    if cage_from >= top_z:
        return
    z = f.z + cage_from
    hw, depth = width / 2, cage_r * 1.6
    hoop_pts = [-side * hw, -side * (hw + 0.1) + out * depth, side * (hw + 0.1) + out * depth, side * hw]
    while z <= top_z + 1e-6:
        add_polyline_beam(mb, [f + p + Vector((0, 0, z - f.z)) for p in hoop_pts], rail * 0.8, material)
        z += hoop_step
    for p in hoop_pts[1:3]:
        mb.beam(f + p + Vector((0, 0, cage_from)), f + p + Vector((0, 0, top_z - f.z)), rail * 0.8, material)


# --------------------------------------------------------------------------------------------
# Extrusions (vehicle bodies)
# --------------------------------------------------------------------------------------------
def add_extrusion_x(mb: MeshBuilder, profile, x0: float, x1: float, material: str, caps: bool = True,
                    smooth: bool = False) -> None:
    """Extrude a 2D side profile [(y, z), …] (counter-clockwise seen from +X) along X from x0 to x1.
    Caps are single n-gons (the exporter triangulates them)."""
    n = len(profile)
    verts = [(x0, y, z) for y, z in profile] + [(x1, y, z) for y, z in profile]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    # CCW profile seen from +X: winding (i, i+1, i+1', i') gives outward normals (0, dz, −dy).
    if caps:
        faces.append(tuple(range(n - 1, -1, -1)))  # x0 cap faces −X
        faces.append(tuple(range(n, 2 * n)))  # x1 cap faces +X
    mb.add(verts, faces, material, smooth=smooth)


def add_frustum_box(mb: MeshBuilder, lo, hi, top_inset: tuple, material: str, faces: str = "all") -> None:
    """Box whose top face is inset by (dx, dy_front, dy_back) — cab roofs, hoods, chamfered housings."""
    (x0, y0, z0), (x1, y1, z1) = _v(lo), _v(hi)
    dx, dyf, dyb = top_inset
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0 + dx, y0 + dyf, z1), (x1 - dx, y0 + dyf, z1), (x1 - dx, y1 - dyb, z1), (x0 + dx, y1 - dyb, z1)]
    f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 6, 7)]
    if faces == "all":
        f.append((3, 2, 1, 0))
    mb.add(v, f, material)


# --------------------------------------------------------------------------------------------
# Wheels
# --------------------------------------------------------------------------------------------
def add_wheel_set(mb: MeshBuilder, center, radius: float, width: float, track: float, material: str,
                  segments: int = 12, dual: bool = False, gap: float = 0.04, hub_material: str | None = None,
                  axle: float | None = None) -> None:
    """Wheels on an axle along X centred on `center`. `track` = distance between wheel centres
    (dual: centre of each dual pair). Tyres are capped cylinders; optional axle beam between them."""
    c = _v(center)
    for s in (-1, 1):
        offsets = (-(width + gap) / 2, (width + gap) / 2) if dual else (0.0,)
        for o in offsets:
            x = c.x + s * track / 2 + o
            mb.cylinder((x - width / 2, c.y, c.z), radius, width, segments, material, axis=(1, 0, 0))
        if hub_material:
            xo = c.x + s * (track / 2 + (width + gap if dual else width / 2) + 0.01)
            mb.cylinder((xo - 0.02 * s, c.y, c.z), radius * 0.45, 0.02, max(6, segments // 2), hub_material,
                        caps=(False, True) if s > 0 else (True, False), axis=(1, 0, 0))
    if axle:
        mb.beam(c + Vector((-track / 2, 0, 0)), c + Vector((track / 2, 0, 0)), axle, hub_material or material)


def add_quad(mb: MeshBuilder, pts, facing, material: str, offset: float = 0.0) -> None:
    """Planar polygon whose winding is chosen so its normal points along `facing` (three FrontSide),
    optionally pushed `offset` metres along it (decals: windows, grilles)."""
    p = [_v(q) for q in pts]
    f = _v(facing).normalized()
    n = (p[1] - p[0]).cross(p[2] - p[0])
    if n.dot(f) < 0:
        p.reverse()
    mb.add([q + f * offset for q in p], [tuple(range(len(p)))], material)
