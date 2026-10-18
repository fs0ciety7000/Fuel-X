"""Hulls and deckhouses for boats and vessels (task 4.6: BOAT_RANGE, VESSEL_RECOVERY).

New module on purpose: `prims.py` / `mesh.py` / `shapes.py` signatures are shared and stay frozen.
Frame: bow toward −Y (assets face −Y), origin on the **waterline** at mid-length, Z up. The hull is
lofted from cross-sections (stations) and continues `draft` metres below the waterline so a bobbing
hull never shows a gap at the point-cloud sea surface.
"""

import math

from mathutils import Vector

from .mesh import MeshBuilder


def _v(p) -> Vector:
    return p.copy() if isinstance(p, Vector) else Vector(p)


def newell_normal(pts) -> Vector:
    n = Vector((0.0, 0.0, 0.0))
    for a, b in zip(pts, pts[1:] + pts[:1]):
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def add_face_out(mb: MeshBuilder, pts, inside, material: str, smooth: bool = False) -> None:
    """Planar polygon wound so its normal points away from the `inside` reference point."""
    p = [_v(q) for q in pts]
    c = sum(p, Vector()) / len(p)
    if newell_normal(p).dot(c - _v(inside)) < 0:
        p.reverse()
    mb.add(p, [tuple(range(len(p)))], material, smooth=smooth)


def _taper(t: float, start: float, floor: float) -> float:
    """1 aft of `start`, elliptical taper to `floor` at the bow (t = 1)."""
    if t <= start:
        return 1.0
    u = (t - start) / (1.0 - start)
    return max(floor, math.sqrt(max(0.0, 1.0 - u * u)))


class Hull:
    """Parametric displacement hull. t = 0 at the transom (+Y), 1 at the stem (−Y)."""

    def __init__(self, length: float, beam: float, freeboard: float, sheer: float = 1.5, draft: float = 1.0,
                 deck_taper: float = 0.55, wl_taper: float = 0.42, rake: float = 2.5, bottom_ratio: float = 0.55,
                 transom_ratio: float = 0.92):
        self.length, self.beam, self.freeboard, self.sheer, self.draft = length, beam, freeboard, sheer, draft
        self.deck_taper, self.wl_taper, self.rake = deck_taper, wl_taper, rake
        self.bottom_ratio, self.transom_ratio = bottom_ratio, transom_ratio

    def y(self, t: float) -> float:
        return self.length / 2 - self.length * t

    def deck_z(self, t: float) -> float:
        return self.freeboard + self.sheer * max(0.0, (t - 0.4) / 0.6) ** 2

    def _aft(self, t: float) -> float:
        return self.transom_ratio + (1 - self.transom_ratio) * min(1.0, t / 0.25)

    def half_beam_deck(self, t: float) -> float:
        return self.beam / 2 * _taper(t, self.deck_taper, 0.02) * self._aft(t)

    def half_beam_wl(self, t: float) -> float:
        """Slightly narrower than the deck (flare), and fuller-bowed sections taper earlier."""
        return 0.96 * self.beam / 2 * _taper(t, self.wl_taper, 0.03) * self._aft(t)

    def stem_offset(self, t: float, depth: float) -> float:
        """Raked stem: the waterline / keel stations sit aft of the deck station near the bow."""
        return self.rake * depth * max(0.0, (t - 0.7) / 0.3) ** 2

    def section(self, t: float) -> list:
        """6 points R→L: deck edge R, waterline R, bilge R, bilge L, waterline L, deck edge L."""
        y, zd = self.y(t), self.deck_z(t)
        hd, hw = self.half_beam_deck(t), self.half_beam_wl(t)
        hb = hw * self.bottom_ratio
        yw = y + self.stem_offset(t, 1.0)
        yb = y + self.stem_offset(t, 1.6)
        return [Vector((-hd, y, zd)), Vector((-hw, yw, 0.0)), Vector((-hb, yb, -self.draft)),
                Vector((hb, yb, -self.draft)), Vector((hw, yw, 0.0)), Vector((hd, y, zd))]


def add_hull(mb: MeshBuilder, hull: Hull, stations, material: str, deck_material: str | None = None,
             boot_material: str | None = None, deck: bool = True) -> None:
    """Loft the hull through `stations` (t values, 0 → 1). One smooth skin (shared vertices), a flat
    deck, a transom and a tiny stem cap. `boot_material` paints the below-waterline band."""
    secs = [hull.section(t) for t in stations]
    n = len(secs)
    # Skin: strips (0-1) topsides R, (1-2) boot R, (2-3) bottom, (3-4) boot L, (4-5) topsides L.
    strips = {0: material, 1: boot_material or material, 2: boot_material or material, 3: boot_material or material,
              4: material}
    for k, mat in strips.items():
        verts, faces = [], []
        for s in secs:
            verts += [s[k], s[k + 1]]
        for i in range(n - 1):
            faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
        # Orientation from one face against the hull axis.
        mid = (n - 1) // 2
        a, b, c = (Vector(verts[i]) for i in faces[mid][:3])
        centre = (a + b + c) / 3
        inside = Vector((0.0, centre.y, (hull.freeboard - hull.draft) / 2))
        if (b - a).cross(c - a).dot(centre - inside) < 0:
            faces = [tuple(reversed(f)) for f in faces]
        mb.add(verts, faces, mat, smooth=True)
    if deck:
        dm = deck_material or material
        for i in range(n - 1):
            s0, s1 = secs[i], secs[i + 1]
            add_face_out(mb, [s0[0], s1[0], s1[5], s0[5]], (0.0, (s0[0].y + s1[0].y) / 2, -hull.draft), dm)
    transom = secs[0]
    add_face_out(mb, transom, (0.0, transom[0].y - 1.0, 0.0), material)
    stem = secs[-1]
    add_face_out(mb, stem, (0.0, stem[0].y + 1.0, 0.0), material)


def add_bulwark(mb: MeshBuilder, hull: Hull, t0: float, t1: float, height: float, material: str,
                steps: int = 4, thickness: float = 0.15) -> None:
    """Solid bulwark (raised hull side) along both deck edges between stations t0 and t1."""
    ts = [t0 + (t1 - t0) * i / steps for i in range(steps + 1)]
    for sx in (-1, 1):
        for a, b in zip(ts, ts[1:]):
            pa = Vector((sx * hull.half_beam_deck(a), hull.y(a), hull.deck_z(a)))
            pb = Vector((sx * hull.half_beam_deck(b), hull.y(b), hull.deck_z(b)))
            up = Vector((0, 0, height))
            inn = Vector((-sx * thickness, 0, 0))
            add_face_out(mb, [pa, pb, pb + up, pa + up], (0.0, (pa.y + pb.y) / 2, pa.z), material)  # outer
            add_face_out(mb, [pa + inn, pb + inn, pb + inn + up, pa + inn + up],
                         (sx * hull.beam, (pa.y + pb.y) / 2, pa.z), material)  # inner
            add_face_out(mb, [pa + up, pb + up, pb + up + inn, pa + up + inn],
                         (sx * (abs(pa.x) - thickness / 2), (pa.y + pb.y) / 2, pa.z), material)  # cap


def add_tier(mb: MeshBuilder, lo, hi, material: str, glass: str | None = None, band: tuple | None = None,
             overhang: float = 0.0, faces: str = "all") -> None:
    """Deckhouse tier: a box from `lo` to `hi`; optional window band (z0, z1 relative to lo.z), drawn
    as a glass box inset 0.1 m between a clay sill and a clay roof slab (`overhang` m wider)."""
    lo, hi = _v(lo), _v(hi)
    if glass and band:
        z0, z1 = lo.z + band[0], lo.z + band[1]
        mb.box_minmax(lo, (hi.x, hi.y, z0), material, faces=faces)
        mb.box_minmax((lo.x + 0.1, lo.y + 0.1, z0), (hi.x - 0.1, hi.y - 0.1, z1), glass, faces="sides")
        o = overhang
        mb.box_minmax((lo.x - o, lo.y - o, z1), (hi.x + o, hi.y + o, hi.z), material)
    else:
        mb.box_minmax(lo, hi, material, faces=faces)


def add_radar_array(mb: MeshBuilder, length: float, material: str, height: float = 0.35,
                    pedestal: float = 0.5) -> None:
    """Open-array radar in rotor-local space: pedestal on the axis, slotted bar along X."""
    mb.cylinder((0, 0, 0), 0.18, pedestal, 8, material)
    mb.box((0, 0, pedestal + height / 2), (length, 0.25, height), material)
    mb.box((0, 0.06, pedestal + 0.05), (0.5, 0.5, 0.1), material)
