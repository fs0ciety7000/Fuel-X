"""Structural primitives for machines and buildings (task 4.6: CRANE, BLDG_HIGHBAY, HANGAR_TENT).

New module on purpose: `prims.py` / `mesh.py` / `shapes.py` signatures are shared and stay frozen.
Every `add_*` appends to a `MeshBuilder` (one primitive per material, deterministic order).
"""

import math

from mathutils import Vector

from .mesh import MeshBuilder, frame_from_axis


def _v(p) -> Vector:
    return p.copy() if isinstance(p, Vector) else Vector(p)


def add_tapered_truss(mb: MeshBuilder, start, end, size0: tuple, size1: tuple, bays: int, section: float,
                      chord: float, material: str, bracing: str = "X", up_hint=None, lod: int = 0) -> None:
    """Box truss whose cross-section (width, depth) varies linearly from `size0` at `start` to `size1`
    at `end` (crane boom foot / tip sections). bracing "X" | "Z"; lod >= 2 → solid tapered slab."""
    a, b = _v(start), _v(end)
    d, side, up = frame_from_axis(b - a, up_hint)
    length = (b - a).length
    signs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

    def corner(i, t):
        w = size0[0] + (size1[0] - size0[0]) * t
        h = size0[1] + (size1[1] - size0[1]) * t
        sx, sy = signs[i]
        return a + d * (length * t) + side * (sx * (w / 2 - chord / 2)) + up * (sy * (h / 2 - chord / 2))

    if lod >= 2:
        v = [corner(i, 0.0) for i in range(4)] + [corner(i, 1.0) for i in range(4)]
        faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (3, 2, 1, 0), (4, 5, 6, 7)]
        # Orientation: ring (−s−u, s−u, s+u, −s+u) runs CCW about d only if side × up = d.
        if side.cross(up).dot(d) < 0:
            faces = [tuple(reversed(f)) for f in faces]
        mb.add(v, faces, material)
        return
    for i in range(4):
        mb.beam(corner(i, 0.0), corner(i, 1.0), chord, material, up_hint=up)
    for fi in range(4):
        ci, cj = fi, (fi + 1) % 4
        normal = (corner(ci, 0.5) + corner(cj, 0.5)) / 2 - (a + b) / 2
        for k in range(bays + 1):
            t = k / bays
            mb.beam(corner(ci, t), corner(cj, t), section, material, up_hint=normal)
            if k == bays:
                break
            t1 = (k + 1) / bays
            if bracing == "X":
                mb.beam(corner(ci, t), corner(cj, t1), section, material, up_hint=normal)
                mb.beam(corner(cj, t), corner(ci, t1), section, material, up_hint=normal)
            elif (k + fi) % 2 == 0:
                mb.beam(corner(ci, t), corner(cj, t1), section, material, up_hint=normal)
            else:
                mb.beam(corner(cj, t), corner(ci, t1), section, material, up_hint=normal)


def stadium_profile(length: float, height: float, z0: float, segments: int) -> list:
    """Side profile (y, z) of a crawler track / rounded slab, counter-clockwise seen from +X:
    straight bottom and top, semicircular ends of diameter `height`, centred on y = 0."""
    r = height / 2
    hy = length / 2 - r
    zc = z0 + r
    pts = []
    for i in range(segments + 1):  # rear (+Y) end: bottom → top
        a = -math.pi / 2 + math.pi * i / segments
        pts.append((hy + r * math.cos(a), zc + r * math.sin(a)))
    for i in range(segments + 1):  # front (−Y) end: top → bottom
        a = math.pi / 2 + math.pi * i / segments
        pts.append((-hy + r * math.cos(a), zc + r * math.sin(a)))
    return pts


def add_vault(mb: MeshBuilder, half_width: float, height: float, y0: float, y1: float, segments: int,
              material: str, wall: float = 0.0, smooth: bool = True) -> None:
    """Barrel vault along Y (tent hangar): semi-elliptical arch of half-width × height over vertical
    side walls `wall` m tall, from y0 to y1. Open ends (add gables separately)."""
    pts = arch_points(half_width, height, segments, wall)
    verts = [(x, y0, z) for x, z in pts] + [(x, y1, z) for x, z in pts]
    n = len(pts)
    # Arch runs +X → −X over the top; (i, i+1, i+1', i') with y0 < y1 faces outward.
    faces = [(i, n + i, n + i + 1, i + 1) for i in range(n - 1)]
    mb.add(verts, faces, material, smooth=smooth)


def arch_points(half_width: float, height: float, segments: int, wall: float = 0.0) -> list:
    """(x, z) points of a semi-elliptical arch from (+hw, 0) over the top to (−hw, 0)."""
    pts = [(half_width, 0.0)] if wall > 0 else []
    rise = height - wall
    for i in range(segments + 1):
        a = math.pi * i / segments
        pts.append((half_width * math.cos(a), wall + rise * math.sin(a)))
    if wall > 0:
        pts.append((-half_width, 0.0))
    return pts


def add_arch_rib(mb: MeshBuilder, half_width: float, height: float, y: float, segments: int, material: str,
                 depth: float = 0.4, proud: float = 0.25, wall: float = 0.0) -> None:
    """Structural rib standing `proud` m outside a vault at station y: a band (outer face + 2 sides)."""
    outer = arch_points(half_width + proud, height + proud, segments, wall)
    inner = arch_points(half_width, height, segments, wall)
    y0, y1 = y - depth / 2, y + depth / 2
    n = len(outer)
    v = ([(x, y0, z) for x, z in outer] + [(x, y1, z) for x, z in outer]
         + [(x, y0, z) for x, z in inner] + [(x, y1, z) for x, z in inner])
    faces = []
    for i in range(n - 1):
        faces.append((i, n + i, n + i + 1, i + 1))  # outer face
        faces.append((2 * n + i, i, i + 1, 2 * n + i + 1))  # −Y side
        faces.append((n + i, 3 * n + i, 3 * n + i + 1, n + i + 1))  # +Y side
    mb.add(v, faces, material)


def add_ribbed_wall(mb: MeshBuilder, p0, p1, z0: float, z1: float, outward, spacing: float, material: str,
                    rib: tuple = (0.6, 0.5), skip: tuple | None = None) -> None:
    """Vertical pilaster ribs on a straight façade from p0 to p1 (ground points), standing out along
    `outward`. `skip` = (a, b) fraction range along the wall left free (door openings)."""
    a, b = _v(p0), _v(p1)
    out = _v(outward).normalized()
    length = (b - a).length
    n = max(1, round(length / spacing))
    for k in range(1, n):
        f = k / n
        if skip and skip[0] <= f <= skip[1]:
            continue
        p = a + (b - a) * f + out * (rib[1] / 2)
        ang = math.atan2(out.y, out.x)
        mb.box((p.x, p.y, (z0 + z1) / 2), (rib[1], rib[0], z1 - z0), material, rotation_z=ang)
