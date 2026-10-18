"""Reusable procedural primitives (ASSETS_GUIDE §6, §10).

`add_*` functions append to a MeshBuilder (merge-per-material, one draw call per material);
the convenience wrappers (`truss`, `tank_vertical`, …) build a standalone object.
Lower LODs are produced by parameters (segments, bays, `lod`), never by decimation.
"""

import math

import bpy
from mathutils import Matrix, Vector

from .mesh import MeshBuilder, frame_from_axis
from .nodes import pivot

FACE_NAMES = ("up-", "side+", "up+", "side-")  # faces between corners (0,1) (1,2) (2,3) (3,0)


# --------------------------------------------------------------------------------------------
# Truss / lattice
# --------------------------------------------------------------------------------------------
def add_truss(mb: MeshBuilder, start, end, width: float, depth: float, bays: int, section: float = 0.35,
              chord: float | None = None, bracing: str = "X", faces=4, material: str = "MAT_Metal",
              chord_material: str | None = None, lod: int = 0, horizontals: bool = True,
              up_hint=None, slab_material: str | None = None) -> None:
    """Straight box truss from `start` to `end` (centerline), cross-section width × depth.

    bracing: "X" (both diagonals), "Z" (Warren zig-zag), "none". faces: 4 | 2 (the two ±side
    faces) | iterable of FACE_NAMES. lod >= 2 → one solid slab box (silhouette only).
    Members are 4-sided, uncapped (8 tris each)."""
    a, b = Vector(start), Vector(end)
    d, side, up = frame_from_axis(b - a, up_hint)
    length = (b - a).length
    chord = chord if chord is not None else section * 1.6
    if lod >= 2:
        mb.beam(a, b, (width, depth), slab_material or material, caps=True, up_hint=up)
        return
    if faces == 4:
        faces = FACE_NAMES
    elif faces == 2:
        faces = ("side+", "side-")
    hw, hd = width / 2 - chord / 2, depth / 2 - chord / 2
    corner_off = [-side * hw - up * hd, side * hw - up * hd, side * hw + up * hd, -side * hw + up * hd]

    def corner(i, t):
        return a + d * (length * t) + corner_off[i]

    cm = chord_material or material
    for i in range(4):
        mb.beam(corner(i, 0.0), corner(i, 1.0), chord, cm, up_hint=up)
    for fname in faces:
        fi = FACE_NAMES.index(fname)
        i, j = fi, (fi + 1) % 4
        normal = (corner_off[i] + corner_off[j]).normalized()
        for k in range(bays + 1):
            t = k / bays
            if horizontals:
                mb.beam(corner(i, t), corner(j, t), section, material, up_hint=normal)
            if k == bays:
                break
            t1 = (k + 1) / bays
            if bracing == "X":
                mb.beam(corner(i, t), corner(j, t1), section, material, up_hint=normal)
                mb.beam(corner(j, t), corner(i, t1), section, material, up_hint=normal)
            elif bracing == "Z":
                if k % 2 == 0:
                    mb.beam(corner(i, t), corner(j, t1), section, material, up_hint=normal)
                else:
                    mb.beam(corner(j, t), corner(i, t1), section, material, up_hint=normal)


def truss(name: str, start, end, width: float, depth: float, bays: int, section: float = 0.35,
          bracing: str = "X", faces=4, material: str = "MAT_Metal", lod: int = 0, parent=None):
    mb = MeshBuilder()
    add_truss(mb, start, end, width, depth, bays, section=section, bracing=bracing, faces=faces,
              material=material, lod=lod)
    return mb.build(name, parent=parent)


# --------------------------------------------------------------------------------------------
# Tanks
# --------------------------------------------------------------------------------------------
def _ellipse_profile(radius: float, head: float, z0: float, steps: int, top: bool = True):
    """Quarter-ellipse (r, z) points from the equator (z0) to the pole."""
    pts = []
    for i in range(1, steps + 1):
        a = (math.pi / 2) * i / steps
        r = radius * math.cos(a)
        z = z0 + head * math.sin(a) * (1 if top else -1)
        pts.append((0.0 if i == steps else r, z))
    return pts


def add_tank_vertical(mb: MeshBuilder, base, radius: float, height: float, head: str = "ellipsoidal",
                      skirt: float = 2.0, segments: int = 24, ladder: bool = True,
                      material: str = "MAT_Clay", detail_material: str = "MAT_ClayDark") -> None:
    """Vertical cryo tank, total height `height` from its base, ellipsoidal (2:1) top head."""
    head_h = radius * (0.5 if head == "ellipsoidal" else 1.0)
    m = Matrix.Translation(Vector(base))
    body_top = height - head_h
    profile = [(radius, skirt), (radius, body_top)] + _ellipse_profile(radius, head_h, body_top, max(3, segments // 6))
    mb.revolve(profile, segments, material, matrix=m, cap_bottom=True)
    mb.revolve([(radius * 0.97, 0.0), (radius * 0.97, skirt + 0.01)], segments, detail_material, matrix=m)
    if ladder:
        x0 = Vector(base) + Vector((0, -radius - 0.45, 0))
        for dx in (-0.3, 0.3):
            mb.beam(x0 + Vector((dx, 0, 0)), x0 + Vector((dx, 0, body_top)), 0.08, detail_material)
        cage_r = 0.4
        mb.beam(x0 + Vector((0, -cage_r, 2.5)), x0 + Vector((0, -cage_r, body_top)), 0.08, detail_material)


def tank_vertical(name: str, radius: float, height: float, head: str = "ellipsoidal", skirt: float = 2.0,
                  segments: int = 24, ladder: bool = True, material: str = "MAT_Clay", parent=None):
    mb = MeshBuilder()
    add_tank_vertical(mb, (0, 0, 0), radius, height, head, skirt, segments, ladder, material)
    return mb.build(name, parent=parent)


def add_tank_horizontal(mb: MeshBuilder, base, radius: float, length: float, saddles: int = 2,
                        head: str = "ellipsoidal", segments: int = 20, material: str = "MAT_Clay",
                        detail_material: str = "MAT_ClayDark", clearance: float = 1.6) -> None:
    """Horizontal tank along X, centered on `base` (ground point); axis at z = clearance + radius."""
    head_h = radius * (0.5 if head == "ellipsoidal" else 1.0)
    half = length / 2 - head_h
    steps = max(3, segments // 6)
    profile = list(reversed([(r, -z) for r, z in _ellipse_profile(radius, head_h, half, steps)]))
    profile += [(radius, -half), (radius, half)] + _ellipse_profile(radius, head_h, half, steps)
    cz = clearance + radius
    m = Matrix.Translation(Vector(base) + Vector((0, 0, cz))) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    mb.revolve(profile, segments, material, matrix=m)
    for k in range(saddles):
        x = -half * 0.7 + (1.4 * half) * (k / max(1, saddles - 1))
        mb.box(Vector(base) + Vector((x, 0, (cz - radius * 0.5) / 2)), (0.8, radius * 1.6, cz - radius * 0.5),
               detail_material)


def tank_horizontal(name: str, radius: float, length: float, saddles: int = 2, head: str = "ellipsoidal",
                    segments: int = 20, parent=None):
    mb = MeshBuilder()
    add_tank_horizontal(mb, (0, 0, 0), radius, length, saddles, head, segments)
    return mb.build(name, parent=parent)


def add_tank_sphere(mb: MeshBuilder, base, radius: float, legs: int = 8, leg_height: float | None = None,
                    segments: int = 24, rings: int = 12, material: str = "MAT_Clay",
                    detail_material: str = "MAT_Metal") -> None:
    """Sphere on legs; `leg_height` = equator height (default 1.67 × radius − radius → top at 24 for r 9)."""
    eq = leg_height if leg_height is not None else radius * (24 / 9 - 1)
    profile = []
    for i in range(rings + 1):
        a = -math.pi / 2 + math.pi * i / rings
        r = radius * math.cos(a)
        profile.append((0.0 if i in (0, rings) else r, radius * math.sin(a)))
    c = Vector(base) + Vector((0, 0, eq))
    mb.revolve(profile, segments, material, matrix=Matrix.Translation(c))
    mb.revolve([(radius * 1.01, -0.4), (radius * 1.01, 0.4)], segments, detail_material,
               matrix=Matrix.Translation(c))
    for k in range(legs):
        t = 2 * math.pi * (k + 0.5) / legs
        p = Vector((math.cos(t) * radius, math.sin(t) * radius, 0))
        mb.beam(Vector(base) + p, c + p, 0.6, detail_material)


def tank_sphere(name: str, radius: float, legs: int = 8, leg_height: float | None = None,
                segments: int = 24, rings: int = 12, parent=None):
    mb = MeshBuilder()
    add_tank_sphere(mb, (0, 0, 0), radius, legs, leg_height, segments, rings)
    return mb.build(name, parent=parent)


# --------------------------------------------------------------------------------------------
# Wheels, railings, bells
# --------------------------------------------------------------------------------------------
def wheel_mesh(name: str, wheel_radius: float, wheel_width: float, track: float, wheels: int = 2,
               segments: int = 12, material: str = "MAT_ClayDark"):
    """Wheel set on an axle along X (origin = axle center). Reuse its data for linked copies."""
    mb = MeshBuilder()
    for k in range(wheels):
        x = -track / 2 + track * k / max(1, wheels - 1)
        mb.cylinder((x - wheel_width / 2, 0, 0), wheel_radius, wheel_width, segments, material, axis=(1, 0, 0))
    obj = mb.build(name)
    bpy.context.scene.collection.objects.unlink(obj)
    return obj


def wheel_bogie(name: str, wheel_name: str, location, wheel_radius: float, wheel_width: float, track: float,
                wheels: int = 2, segments: int = 12, parent=None, wheel_template=None, anim: dict | None = None):
    """Bogie pivot empty (king pin at `location`) + wheel leaf (axle below the pin).
    Returns (pivot, wheel). Pass `wheel_template` to share one mesh between bogies."""
    pv = pivot(name, location, parent=parent, anim=anim)
    src = wheel_template or wheel_mesh(f"{wheel_name}Mesh", wheel_radius, wheel_width, track, wheels, segments)
    wheel = bpy.data.objects.new(wheel_name, src.data)
    bpy.context.scene.collection.objects.link(wheel)
    wheel.parent = pv
    wheel.location = (0, 0, -(location[2] - wheel_radius))
    return pv, wheel


def add_railing(mb: MeshBuilder, points, height: float = 1.1, post_spacing: float = 2.0,
                section: float = 0.05, material: str = "MAT_Metal") -> None:
    pts = [Vector(p) for p in points]
    for p0, p1 in zip(pts, pts[1:]):
        seg = p1 - p0
        n = max(1, round(seg.length / post_spacing))
        for k in range(n + (1 if p1 is pts[-1] else 0)):
            p = p0 + seg * (k / n)
            mb.beam(p, p + Vector((0, 0, height)), section, material)
        for h in (height, height / 2):
            mb.beam(p0 + Vector((0, 0, h)), p1 + Vector((0, 0, h)), section, material)


def railing(name: str, points, height: float = 1.1, post_spacing: float = 2.0, section: float = 0.05, parent=None):
    mb = MeshBuilder()
    add_railing(mb, points, height, post_spacing, section)
    return mb.build(name, parent=parent)


def add_engine_bell(mb: MeshBuilder, throat, exit_radius: float, length: float, segments: int = 16,
                    material: str = "MAT_ClayDark") -> None:
    """Bell hanging down from `throat` (top) to the exit plane at throat.z − length."""
    steps = 4
    prof = []
    for i in range(steps + 1):
        t = i / steps
        r = exit_radius * (0.35 + 0.65 * (t ** 0.7))
        prof.append((r, -length * t))
    prof.reverse()
    mb.revolve(prof, segments, material, matrix=Matrix.Translation(Vector(throat)))


def engine_bell(name: str, exit_radius: float, length: float, segments: int = 16, parent=None):
    mb = MeshBuilder()
    add_engine_bell(mb, (0, 0, 0), exit_radius, length, segments)
    return mb.build(name, parent=parent)


# --------------------------------------------------------------------------------------------
# Shading
# --------------------------------------------------------------------------------------------
def bevel_soft(obj, width: float, segments: int = 2, angle_deg: float = 30) -> None:
    """Bevel primary forms + weighted normals (applied by the exporter, export_apply=True)."""
    bev = obj.modifiers.new("Bevel", "BEVEL")
    bev.width = width
    bev.segments = segments
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(angle_deg)
    bev.harden_normals = False
    obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL").keep_sharp = True


def shade(obj, angle_deg: float = 30) -> None:
    """shade_smooth_by_angle (4.1+ operator)."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
