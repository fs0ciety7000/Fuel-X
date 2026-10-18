"""MeshBuilder: accumulate geometry from plain lists, one object per material set.

Why not operators: `bpy.ops.mesh.primitive_*` + `join` is slow for hundreds of truss members
and depends on context state. Building vertex/face lists directly is fast, order-stable
(deterministic GLB bytes) and produces exactly one glTF primitive per material.
"""

import math

import bpy
from mathutils import Matrix, Vector


def _v(p) -> Vector:
    return p.copy() if isinstance(p, Vector) else Vector(p)


def frame_from_axis(direction, up_hint=None):
    """Orthonormal (d, side, up) frame with d along `direction`."""
    d = _v(direction).normalized()
    up = _v(up_hint) if up_hint is not None else (Vector((0, 0, 1)) if abs(d.z) < 0.99 else Vector((1, 0, 0)))
    side = d.cross(up)
    if side.length < 1e-6:
        side = d.cross(Vector((0, 1, 0)))
    side.normalize()
    up2 = side.cross(d).normalized()
    return d, side, up2


class MeshBuilder:
    """Collects vertices and faces; `build()` makes one mesh object (one primitive per material)."""

    def __init__(self):
        self.verts: list = []
        self.faces: list = []
        self.face_mat: list = []
        self.face_smooth: list = []
        self.mat_names: list = []

    # -- bookkeeping -------------------------------------------------------------------------
    def _mat(self, name: str) -> int:
        if name not in self.mat_names:
            self.mat_names.append(name)
        return self.mat_names.index(name)

    @property
    def triangles(self) -> int:
        return sum(len(f) - 2 for f in self.faces)

    def add(self, verts, faces, material: str, smooth: bool = False, matrix: Matrix | None = None) -> None:
        base = len(self.verts)
        mi = self._mat(material)
        for p in verts:
            v = _v(p)
            if matrix is not None:
                v = matrix @ v
            self.verts.append((v.x, v.y, v.z))
        for f in faces:
            self.faces.append(tuple(base + i for i in f))
            self.face_mat.append(mi)
            self.face_smooth.append(smooth)

    def extend(self, other: "MeshBuilder", matrix: Matrix | None = None) -> None:
        for mi in sorted(set(other.face_mat)):
            name = other.mat_names[mi]
            idx = [i for i, m in enumerate(other.face_mat) if m == mi]
            used = sorted({v for i in idx for v in other.faces[i]})
            remap = {v: n for n, v in enumerate(used)}
            faces = [tuple(remap[v] for v in other.faces[i]) for i in idx]
            smooth = [other.face_smooth[i] for i in idx]
            base_face = len(self.faces)
            self.add([other.verts[v] for v in used], faces, name, False, matrix)
            for k, s in enumerate(smooth):
                self.face_smooth[base_face + k] = s

    # -- primitives --------------------------------------------------------------------------
    def box(self, center, size, material: str, rotation_z: float = 0.0, faces: str = "all") -> None:
        """Axis-aligned (optionally Z-rotated) box. faces: 'all' or 'sides' (no top/bottom)."""
        sx, sy, sz = (s / 2 for s in size)
        c = _v(center)
        m = Matrix.Translation(c) @ Matrix.Rotation(rotation_z, 4, "Z")
        v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
             (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
        f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        if faces == "all":
            f += [(3, 2, 1, 0), (4, 5, 6, 7)]
        elif faces == "top":
            f += [(4, 5, 6, 7)]
        self.add(v, f, material, matrix=m)

    def box_minmax(self, lo, hi, material: str, faces: str = "all") -> None:
        lo, hi = _v(lo), _v(hi)
        self.box((lo + hi) / 2, hi - lo, material, faces=faces)

    def beam(self, p0, p1, section, material: str, caps: bool = False, up_hint=None) -> None:
        """Square/rectangular member from p0 to p1 (centerline). section = w or (w, h)."""
        a, b = _v(p0), _v(p1)
        if (b - a).length < 1e-6:
            return
        w, h = (section, section) if isinstance(section, (int, float)) else section
        _, side, up = frame_from_axis(b - a, up_hint)
        s, u = side * (w / 2), up * (h / 2)
        ring = [-s - u, -s + u, s + u, s - u]  # CCW around the axis → outward faces (three FrontSide)
        verts = [a + r for r in ring] + [b + r for r in ring]
        faces = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        if caps:
            faces += [(3, 2, 1, 0), (4, 5, 6, 7)]
        self.add(verts, faces, material)

    def revolve(self, profile, segments: int, material: str, smooth: bool = True,
                matrix: Matrix | None = None, cap_bottom: bool = False, cap_top: bool = False,
                phase: float = 0.0) -> None:
        """Surface of revolution about local +Z. profile = [(radius, z), …] bottom → top.
        Points with radius 0 become poles (triangle fans)."""
        verts: list = []
        faces: list = []
        rings: list = []
        for r, z in profile:
            if r <= 1e-9:
                rings.append([len(verts)])
                verts.append((0.0, 0.0, z))
            else:
                idx = []
                for i in range(segments):
                    t = phase + 2 * math.pi * i / segments
                    idx.append(len(verts))
                    verts.append((r * math.cos(t), r * math.sin(t), z))
                rings.append(idx)
        for ra, rb in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                if len(ra) == 1 and len(rb) == 1:
                    continue
                if len(ra) == 1:
                    faces.append((ra[0], rb[j], rb[i]))  # bottom pole fan, outward
                elif len(rb) == 1:
                    faces.append((ra[i], ra[j], rb[0]))
                else:
                    faces.append((ra[i], ra[j], rb[j], rb[i]))
        self.add(verts, faces, material, smooth=smooth, matrix=matrix)
        caps = []
        if cap_bottom and len(rings[0]) > 1:
            caps.append(tuple(reversed(rings[0])))
        if cap_top and len(rings[-1]) > 1:
            caps.append(tuple(rings[-1]))
        if caps:
            self.add([verts[i] for c in caps for i in c],
                     _cap_faces(caps), material, smooth=False, matrix=matrix)

    def cylinder(self, base, radius: float, height: float, segments: int, material: str,
                 caps=(True, True), smooth: bool = True, axis=(0, 0, 1)) -> None:
        d, side, up = frame_from_axis(axis)
        # (up, side, d) is right-handed ((side, up, d) is a mirror and turned every face inward).
        m = Matrix.Translation(_v(base)) @ Matrix((
            (up.x, side.x, d.x, 0), (up.y, side.y, d.y, 0), (up.z, side.z, d.z, 0), (0, 0, 0, 1)))
        self.revolve([(radius, 0.0), (radius, height)], segments, material, smooth, m,
                     cap_bottom=caps[0], cap_top=caps[1])

    # -- output ------------------------------------------------------------------------------
    def build(self, name: str, parent=None, collection=None):
        """Create the mesh object (mesh data name = object name). Location = parent-local origin."""
        if not self.faces:
            raise ValueError(f"MeshBuilder '{name}' is empty")
        # Reorder faces by material so each primitive is contiguous (stable sort keeps order).
        order = sorted(range(len(self.faces)), key=lambda i: self.face_mat[i])
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], [self.faces[i] for i in order])
        me.validate(clean_customdata=False)
        for mat_name in self.mat_names:
            mat = bpy.data.materials.get(mat_name)
            if mat is None:
                raise KeyError(f"material {mat_name} missing — call materials_from_tokens() first")
            me.materials.append(mat)
        me.polygons.foreach_set("material_index", [self.face_mat[i] for i in order])
        me.polygons.foreach_set("use_smooth", [self.face_smooth[i] for i in order])
        me.update()
        obj = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        if parent is not None:
            obj.parent = parent
        return obj


def _cap_faces(caps):
    faces, base = [], 0
    for c in caps:
        faces.append(tuple(range(base, base + len(c))))
        base += len(c)
    return faces
