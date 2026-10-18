"""Launch-vehicle and launch-mount primitives (task 4.4: PAD, BOOSTER, SHIP).

New module on purpose: `prims.py` / `mesh.py` signatures are shared and stay frozen.
Every `add_*` appends to a `MeshBuilder` (one primitive per material, deterministic order).
Flat faces and curved walls are emitted as separate surfaces so smooth shading never
averages normals across a hard 90° edge.
"""

import math

from mathutils import Matrix, Vector

from .mesh import MeshBuilder


def _v(p) -> Vector:
    return p.copy() if isinstance(p, Vector) else Vector(p)


# --------------------------------------------------------------------------------------------
# Solids of revolution
# --------------------------------------------------------------------------------------------
def add_annulus(mb: MeshBuilder, center, r_in: float, r_out: float, z0: float, z1: float, segments: int,
                material: str, top: bool = True, bottom: bool = True, inner: bool = True,
                outer: bool = True) -> None:
    """Thick ring (washer) about local +Z at `center`, from z0 to z1 (relative to center)."""
    m = Matrix.Translation(_v(center))
    if outer:
        mb.revolve([(r_out, z0), (r_out, z1)], segments, material, smooth=True, matrix=m)
    if top:
        mb.revolve([(r_out, z1), (r_in, z1)], segments, material, smooth=False, matrix=m)
    if inner:
        mb.revolve([(r_in, z1), (r_in, z0)], segments, material, smooth=True, matrix=m)
    if bottom:
        mb.revolve([(r_in, z0), (r_out, z0)], segments, material, smooth=False, matrix=m)


def add_disc(mb: MeshBuilder, center, radius: float, segments: int, material: str, up: bool = True) -> None:
    """Flat disc (triangle fan) facing +Z (or −Z with up=False)."""
    m = Matrix.Translation(_v(center))
    prof = [(radius, 0.0), (0.0, 0.0)] if up else [(0.0, 0.0), (radius, 0.0)]
    mb.revolve(prof, segments, material, smooth=False, matrix=m)


def add_band(mb: MeshBuilder, radius: float, z0: float, z1: float, segments: int, material: str,
             center=(0, 0, 0)) -> None:
    """Open cylindrical band (no caps): stiffener rings, skirts, hull sections."""
    mb.revolve([(radius, z0), (radius, z1)], segments, material, smooth=True,
               matrix=Matrix.Translation(_v(center)))


def nose_profile(radius: float, z0: float, length: float, steps: int, p: float = 1.8, q: float = 0.6) -> list:
    """Blunted power-series nose (r, z) from the shoulder (z0, radius) to the tip pole.
    r(t) = R · (1 − t^p)^q, t = (z − z0) / length."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        r = radius * (1.0 - t ** p) ** q if i < steps else 0.0
        pts.append((r, z0 + length * t))
    return pts


def nose_radius(radius: float, z0: float, length: float, z: float, p: float = 1.8, q: float = 0.6) -> float:
    t = min(1.0, max(0.0, (z - z0) / length))
    return radius * (1.0 - t ** p) ** q


# --------------------------------------------------------------------------------------------
# Engines
# --------------------------------------------------------------------------------------------
def engine_layout(rings) -> list:
    """rings = [(count, radius, phase_rad, tag), …] → [(x, y, tag), …] in ring order, CCW from +X."""
    out = []
    for count, radius, phase, tag in rings:
        for k in range(count):
            a = phase + 2 * math.pi * k / count
            out.append((radius * math.cos(a), radius * math.sin(a), tag))
    return out


def add_bell(mb: MeshBuilder, exit_center, exit_radius: float, length: float, segments: int, material: str,
             steps: int = 4, throat_ratio: float = 0.38, powerhead: float = 0.0) -> None:
    """Engine bell standing on its exit plane at `exit_center` (throat at +length), plus an optional
    powerhead cylinder of height `powerhead` above the throat."""
    prof = []
    for i in range(steps + 1):
        t = i / steps  # 0 = exit, 1 = throat
        r = exit_radius * (throat_ratio + (1 - throat_ratio) * (1 - t) ** 1.6)
        prof.append((r, length * t))
    if powerhead > 0:
        rp = exit_radius * throat_ratio * 1.25
        prof += [(rp, length), (rp, length + powerhead), (0.0, length + powerhead)]
    mb.revolve(prof, segments, material, smooth=True, matrix=Matrix.Translation(_v(exit_center)))


# --------------------------------------------------------------------------------------------
# Aero surfaces
# --------------------------------------------------------------------------------------------
def add_grid_fin(mb: MeshBuilder, span: float, chord: float, depth: float, cells_span: int, cells_chord: int,
                 material: str, frame: float = 0.25, web: float = 0.08, root_gap: float = 0.4,
                 lattice: bool = True) -> None:
    """Grid fin in hinge-local space: span along +X (radial, starts at `root_gap`), chord along Y
    (centered), lattice plane horizontal (depth along Z, centered). Diagonal lattice like the real ones."""
    x0, x1 = root_gap, root_gap + span
    hy, hz = chord / 2, depth / 2
    f = frame
    # Frame: 4 boxes.
    mb.box_minmax((x0, -hy, -hz), (x1, -hy + f, hz), material)
    mb.box_minmax((x0, hy - f, -hz), (x1, hy, hz), material)
    mb.box_minmax((x0, -hy + f, -hz), (x0 + f, hy - f, hz), material)
    mb.box_minmax((x1 - f, -hy + f, -hz), (x1, hy - f, hz), material)
    if not lattice:
        # Solid plate (silhouette only, far LODs).
        mb.box_minmax((x0 + f, -hy + f, -hz * 0.3), (x1 - f, hy - f, hz * 0.3), material)
        return
    # Diagonal lattice webs: thin vertical plates at ±45° inside the frame.
    ix0, ix1, iy0, iy1 = x0 + f, x1 - f, -hy + f, hy - f
    w, h = ix1 - ix0, iy1 - iy0
    pitch = w / cells_span
    n = int(math.ceil((w + h) / pitch))

    def clip(p, d):
        """Clip the line p + s·d to the inner rectangle; return segment ends or None."""
        lo, hi = -1e9, 1e9
        for pc, dc, a, b in ((p.x, d.x, ix0, ix1), (p.y, d.y, iy0, iy1)):
            if abs(dc) < 1e-9:
                if pc < a or pc > b:
                    return None
                continue
            s0, s1 = sorted(((a - pc) / dc, (b - pc) / dc))
            lo, hi = max(lo, s0), min(hi, s1)
        if hi - lo < 1e-3:
            return None
        return p + d * lo, p + d * hi

    for sgn in (1, -1):
        d = Vector((1.0, sgn * 1.0, 0.0)).normalized()
        for k in range(1, n):
            # Lines x − sgn·y = const, spaced by `pitch` along X.
            # Family x − sgn·y = c, c from ix0 − sgn·(iy1 | iy0); the line crosses y = 0 at x = c.
            c = ix0 - (iy1 if sgn > 0 else -iy0) + k * pitch
            p = Vector((c, 0.0, 0.0))
            seg = clip(p, d)
            if seg is None:
                continue
            a, b = seg
            mb.beam(a, b, (web, depth * 0.96), material, up_hint=(0, 0, 1))
    del cells_chord  # pitch is derived from the span cell count (square diagonal cells)


def add_flap(mb: MeshBuilder, root: float, tip: float, span: float, thickness: float, material: str,
             gap: float = 0.25, sweep: float = 0.0) -> None:
    """Trapezoid flap in hinge-local space: hinge line along local +Z from 0 to `root`, the flap
    surface extends along local +Y (folded/stowed direction) to `span`; tip edge length `tip`,
    centered on the root (+ `sweep` shift along Z). Thickness along X (centered)."""
    t = thickness / 2
    zc = root / 2 + sweep
    outline = [(gap, 0.0), (span, zc - tip / 2), (span, zc + tip / 2), (gap, root)]
    verts = [(-t, y, z) for y, z in outline] + [(t, y, z) for y, z in outline]
    faces = [(3, 2, 1, 0), (4, 5, 6, 7)]  # −X face, +X face
    for i in range(4):
        j = (i + 1) % 4
        faces.append((i, j, j + 4, i + 4))
    mb.add(verts, faces, material)


def add_revolve_arc(mb: MeshBuilder, profile, a0: float, a1: float, segments: int, material: str,
                    smooth: bool = True, center=(0, 0, 0)) -> None:
    """Partial surface of revolution about local +Z from angle a0 to a1 (radians, CCW from +X).
    profile = [(r, z), …] bottom → top; r = 0 points become poles. `segments` spans the arc."""
    c = _v(center)
    verts: list = []
    rings: list = []
    for r, z in profile:
        if r <= 1e-9:
            rings.append([len(verts)])
            verts.append((c.x, c.y, c.z + z))
            continue
        idx = []
        for i in range(segments + 1):
            t = a0 + (a1 - a0) * i / segments
            idx.append(len(verts))
            verts.append((c.x + r * math.cos(t), c.y + r * math.sin(t), c.z + z))
        rings.append(idx)
    faces = []
    for ra, rb in zip(rings, rings[1:]):
        for i in range(segments):
            if len(ra) == 1 and len(rb) == 1:
                continue
            if len(ra) == 1:
                faces.append((ra[0], rb[i], rb[i + 1]))
            elif len(rb) == 1:
                faces.append((ra[i], ra[i + 1], rb[0]))
            else:
                faces.append((ra[i], ra[i + 1], rb[i + 1], rb[i]))
    mb.add(verts, faces, material, smooth=smooth)
