"""Preview renders (ASSETS_GUIDE §9): Cycles CPU, paper substrate, soft sun, auto-framed 3/4 view.

Call only **after** export_glb(): everything added here (ground, sun, camera, human) is preview-only.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

from . import REPO_ROOT
from .materials import preview_material, token_linear

# Shared with the game renderer (ARCHITECTURE / render SUN_DIR): elevation 40°, azimuth from rotation.
SUN_ROTATION_DEG = (50.0, 0.0, 35.0)
SUN_ENERGY = 2.2
SUN_ANGLE_DEG = 8.0
CAMERA_LENS_MM = 85.0
CAMERA_DIR = (1.0, -1.0, 0.8)
CAMERA_DISTANCE_FACTOR = 5.0
FILL_STRENGTH = 0.25
PREVIEW_PREFIX = "PREVIEW_"


def _setup_render(size: int, samples: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def _setup_world() -> None:
    """Camera rays see exactly the paper color; lighting uses paper at FILL_STRENGTH."""
    paper = token_linear("world", "background")
    world = bpy.data.worlds.new(PREVIEW_PREFIX + "Paper")
    world.use_nodes = True
    nt = world.node_tree
    seen = nt.nodes["Background"]
    seen.inputs["Color"].default_value = paper
    seen.inputs["Strength"].default_value = 1.0
    fill = nt.nodes.new("ShaderNodeBackground")
    fill.inputs["Color"].default_value = paper
    fill.inputs["Strength"].default_value = FILL_STRENGTH
    mix = nt.nodes.new("ShaderNodeMixShader")
    lp = nt.nodes.new("ShaderNodeLightPath")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(fill.outputs["Background"], mix.inputs[1])
    nt.links.new(seen.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], nt.nodes["World Output"].inputs["Surface"])
    bpy.context.scene.world = world


def asset_bounds(exclude_prefix: str = PREVIEW_PREFIX):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects
           if o.type == "MESH" and not o.name.startswith(exclude_prefix) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max((p - center).length for p in pts)
    return lo, hi, center, radius


HUMAN_HEIGHT = 1.8


def add_human(location, suffix: str = "") -> list:
    """1.8 m scale reference (ASSETS_GUIDE §1), preview-only: body cylinder + head, ink colour.
    `location` = (x, y) ground point. Returns the created objects."""
    mat = preview_material(PREVIEW_PREFIX + "Human", "color", "ink2", 0.9)
    out = []
    for name, (r, z0, z1) in {"Body": (0.22, 0.0, 1.5), "Head": (0.13, 1.54, HUMAN_HEIGHT)}.items():
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=r, depth=z1 - z0,
                                            location=(location[0], location[1], (z0 + z1) / 2))
        o = bpy.context.active_object
        o.name = PREVIEW_PREFIX + "Human" + name + suffix
        o.data.materials.append(mat)
        out.append(o)
    return out


def setup_stage(human_at=None):
    """Ground, sun, world, camera. Returns the camera object."""
    lo, hi, center, radius = asset_bounds()
    _setup_world()
    ground_size = max(500.0, radius * 12.0)
    bpy.ops.mesh.primitive_plane_add(size=ground_size, location=(center.x, center.y, 0.0))
    ground = bpy.context.active_object
    ground.name = PREVIEW_PREFIX + "Ground"
    ground.data.materials.append(preview_material(PREVIEW_PREFIX + "Ground", "world", "background", 1.0))
    # Shadow catcher: the ground shows exactly the camera-ray paper color, darkened only by shadows.
    ground.is_shadow_catcher = True
    if human_at is None:
        human_at = (hi.x + 2.0, lo.y - 2.0)
    add_human(human_at)

    sun_data = bpy.data.lights.new(PREVIEW_PREFIX + "Sun", "SUN")
    sun_data.energy = SUN_ENERGY
    sun_data.angle = math.radians(SUN_ANGLE_DEG)
    sun_data.color = token_linear("world", "sun")[:3]
    sun = bpy.data.objects.new(PREVIEW_PREFIX + "Sun", sun_data)
    sun.rotation_euler = tuple(math.radians(a) for a in SUN_ROTATION_DEG)
    bpy.context.scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new(PREVIEW_PREFIX + "Cam")
    cam_data.lens = CAMERA_LENS_MM
    cam_data.clip_end = max(1000.0, radius * 20)
    cam = bpy.data.objects.new(PREVIEW_PREFIX + "Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam, center, radius


def _aim(cam, center, radius, azimuth_offset: float = 0.0, margin: float = 0.86) -> None:
    """Point the camera along CAMERA_DIR (rotated by azimuth_offset) and pull back until the asset's
    bounding-box corners fit inside `margin` of the frame (falls back to 5 × radius as an upper cap)."""
    d = Vector(CAMERA_DIR).normalized()
    horiz = Vector((d.x, d.y)).length
    az = math.atan2(d.y, d.x) + azimuth_offset
    direction = Vector((math.cos(az) * horiz, math.sin(az) * horiz, d.z))
    rot = (-direction).to_track_quat("-Z", "Y")
    cam.rotation_euler = rot.to_euler()
    right, up, fwd = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0)), rot @ Vector((0, 0, -1))
    tan_half = math.tan(cam.data.angle / 2) * margin
    lo, hi, _, _ = asset_bounds()
    dist = 0.0
    for x in (lo.x, hi.x):
        for y in (lo.y, hi.y):
            for z in (lo.z, hi.z):
                q = Vector((x, y, z)) - center
                need = max(abs(q.dot(right)), abs(q.dot(up))) / tan_half - q.dot(fwd)
                dist = max(dist, need)
    cam.location = center + direction * min(dist, radius * CAMERA_DISTANCE_FACTOR)


def render_preview(path: str | None, size: int = 1024, samples: int = 32, turntable: int = 0,
                   turntable_dir: str | None = None, turntable_name: str | None = None,
                   turntable_size: int = 512) -> None:
    cam, center, radius = setup_stage()
    scene = bpy.context.scene
    if path:
        _setup_render(size, samples)
        _aim(cam, center, radius)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    if turntable > 0:
        out_dir = Path(turntable_dir) if turntable_dir else (Path(path).parent if path else REPO_ROOT / "docs" / "assets") / "turntable"
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = turntable_name or (Path(path).stem if path else "asset")
        _setup_render(turntable_size, max(8, samples // 2))
        for i in range(turntable):
            _aim(cam, center, radius, 2 * math.pi * i / turntable)
            scene.render.filepath = str(out_dir / f"{stem}_{i:02d}.png")
            bpy.ops.render.render(write_still=True)


def _descendant_meshes(root) -> list:
    out, stack = [], [root]
    while stack:
        o = stack.pop()
        if o.type == "MESH":
            out.append(o)
        stack.extend(o.children)
    return out


def _bounds_of(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _label(text: str, location, size: float):
    """Preview-only text standing in the YZ plane, readable from +X (the lineup camera)."""
    curve = bpy.data.curves.new(PREVIEW_PREFIX + "Label_" + text, "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "TOP"
    obj = bpy.data.objects.new(PREVIEW_PREFIX + "Label_" + text, curve)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0.0, math.radians(90))
    obj.data.materials.append(preview_material(PREVIEW_PREFIX + "Ink", "color", "ink", 1.0))
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _ortho_shot(y0: float, y1: float, z1: float, out: str, size: tuple, samples: int, z0: float) -> None:
    """Orthographic side view from +X (bows / fronts, −Y, to the left) framing y0…y1 × z0…z1."""
    scene = bpy.context.scene
    _setup_render(size[0], samples)
    scene.render.resolution_y = size[1]
    cam = scene.camera
    cam.data.type = "ORTHO"
    aspect = size[0] / size[1]
    width = max(y1 - y0, (z1 - z0) * aspect) * 1.04
    cam.data.ortho_scale = width
    cam.data.clip_start = 1.0
    cam.data.clip_end = 5000.0
    # Centre the content vertically when the row is wide (frame taller than the content).
    cam.location = (1000.0, (y0 + y1) / 2, (z0 + z1) / 2)
    cam.rotation_euler = Vector((-1.0, 0.0, 0.0)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)


def render_lineup(paths: list, out: str, detail_out: str | None = None, detail_from: int | None = None,
                  gap: float = 8.0, samples: int = 32, poses: dict | None = None) -> list:
    """All LOD0 assets in one row along +Y, orthographic side view from +X, 2048 × 1024 (ASSETS_GUIDE §9).
    `paths` = raw GLB paths in display order. Each asset gets a 1.8 m human just in front of its left
    (−Y) end and a name label below the ground line. `detail_out` re-frames the assets from index
    `detail_from` on (the small ones) at the same resolution. Returns [(root, lo, hi)] in metres."""
    poses = poses or {}
    rows = []
    cursor = 0.0
    for path in paths:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        new = [o for o in bpy.data.objects if o not in before]
        root = next(o for o in new if o.parent is None)
        for node, fn in poses.get(root.name, {}).items():
            fn(next(o for o in new if o.name.split(".")[0] == node))
        lo, hi = _bounds_of(_descendant_meshes(root))
        root.location.y += cursor - lo.y + 3.0  # 3 m in front of the asset for its human
        root.location.x -= (lo.x + hi.x) / 2
        lo2, hi2 = _bounds_of(_descendant_meshes(root))
        add_human((hi2.x + 1.0, lo2.y - 1.5), suffix="_" + root.name)
        rows.append((root.name, lo, hi, lo2.y, hi2.y))
        cursor = hi2.y + gap
        for o in new:
            o.select_set(False)
    _setup_world()
    sun_data = bpy.data.lights.new(PREVIEW_PREFIX + "Sun", "SUN")
    sun_data.energy = SUN_ENERGY
    sun_data.angle = math.radians(SUN_ANGLE_DEG)
    sun_data.color = token_linear("world", "sun")[:3]
    sun = bpy.data.objects.new(PREVIEW_PREFIX + "Sun", sun_data)
    sun.rotation_euler = tuple(math.radians(a) for a in SUN_ROTATION_DEG)
    bpy.context.scene.collection.objects.link(sun)
    cam = bpy.data.objects.new(PREVIEW_PREFIX + "Cam", bpy.data.cameras.new(PREVIEW_PREFIX + "Cam"))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    top = max(hi.z for _, _, hi, _, _ in rows)
    ground = bpy.data.objects.new(PREVIEW_PREFIX + "GroundLine", None)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, cursor / 2, -0.15))
    ground = bpy.context.active_object
    ground.name = PREVIEW_PREFIX + "GroundLine"
    ground.scale = (200.0, cursor + 20.0, 0.3)
    ground.data.materials.append(preview_material(PREVIEW_PREFIX + "GroundLine", "color", "ink4", 1.0))
    labels = []
    for name, lo, hi, y0, y1 in rows:
        labels.append(_label(name, (80.0, (y0 + y1) / 2, -2.0), max(2.0, top * 0.022)))
    z0 = -top * 0.09
    _ortho_shot(0.0, cursor - gap, top, out, (2048, 1024), samples, z0)
    if detail_out and detail_from is not None:
        sub = rows[detail_from:]
        dtop = max(hi.z for _, _, hi, _, _ in sub)
        for lab, (name, lo, hi, y0, y1) in zip(labels[detail_from:], sub):
            lab.data.size = max(0.6, dtop * 0.05)
            lab.location.z = -0.6
        for lab in labels[:detail_from]:
            lab.hide_render = True
        _ortho_shot(sub[0][3] - 3.0, sub[-1][4], dtop * 1.1, detail_out, (2048, 1024), samples, -dtop * 0.2)
    return [(n, lo, hi) for n, lo, hi, _, _ in rows]
