"""Fuel-X asset template — copy to blender/assets/<asset>.py.

Run:
  blender -b --factory-startup -P blender/assets/<asset>.py -- \
      --out public/models/<asset>.glb --preview docs/assets/<asset>.png

Conventions (see docs/ASSETS_GUIDE.md): 1 BU = 1 m, Z-up, origin at ground
contact, meshes named <ASSET>_<Part>, attachment empties named SOCKET_<Name>,
shared materials MAT_*. Move reusable helpers to blender/lib/ once they exist.
"""

import argparse
import math
import sys

import bpy
from mathutils import Vector

ASSET = "TANK"  # prefix for node names

# Token colors (linear-ish sRGB approximations of docs/DESIGN_SYSTEM.md tokens)
PAPER = "#F4F4F0"
MATERIALS = {
    "MAT_Clay": ("#E9E8E3", 0.9, 0.0),
    "MAT_ClayDark": ("#B9B8B2", 0.9, 0.0),
    "MAT_Metal": ("#CFCFCB", 0.6, 0.6),
    "MAT_Glass": ("#9DA3A6", 0.2, 0.0),
    "MAT_Accent": ("#FF5A1F", 0.8, 0.0),
}

# Parameters
RADIUS = 3.0
HEIGHT = 18.0


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--preview")
    return p.parse_args(argv)


def hex_to_linear(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def make_materials():
    mats = {}
    for name, (color, rough, metal) in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = hex_to_linear(color)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        mats[name] = m
    return mats


def parent_keep(child, parent):
    """Parent without moving the child (world transform preserved)."""
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def socket(name, location, parent=None):
    e = bpy.data.objects.new(f"SOCKET_{name}", None)
    e.empty_display_type = "PLAIN_AXES"
    e.location = location
    bpy.context.collection.objects.link(e)
    if parent:
        bpy.context.view_layer.update()
        parent_keep(e, parent)
    return e


def build(mats):
    # Root empty: nodes with children must be empties (meshopt inserts unnamed
    # nodes under meshes that have children). Geometry lives only on leaves.
    root = bpy.data.objects.new(f"{ASSET}_Root", None)
    bpy.context.collection.objects.link(root)

    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=RADIUS, depth=HEIGHT, location=(0, 0, HEIGHT / 2))
    body = bpy.context.active_object
    body.name = f"{ASSET}_Body"
    body.data.materials.append(mats["MAT_Clay"])
    bpy.ops.object.shade_smooth()

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=12, radius=RADIUS, location=(0, 0, HEIGHT))
    cap = bpy.context.active_object
    cap.name = f"{ASSET}_Cap"
    cap.scale.z = 0.35
    cap.data.materials.append(mats["MAT_ClayDark"])
    bpy.ops.object.shade_smooth()

    bpy.context.view_layer.update()
    for o in (body, cap):
        parent_keep(o, root)
    socket("Label", (0, 0, HEIGHT + RADIUS * 0.5), parent=root)
    return [body, cap]


def finalize(objs):
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        use_selection=False,
    )


def render_preview(path):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"

    # Camera rays see the exact paper color; lighting uses a dimmer fill
    world = bpy.data.worlds.new("Paper")
    world.use_nodes = True
    nt = world.node_tree
    seen = nt.nodes["Background"]
    seen.inputs["Color"].default_value = hex_to_linear(PAPER)
    fill = nt.nodes.new("ShaderNodeBackground")
    fill.inputs["Color"].default_value = hex_to_linear(PAPER)
    fill.inputs["Strength"].default_value = 0.25
    mix = nt.nodes.new("ShaderNodeMixShader")
    light_path = nt.nodes.new("ShaderNodeLightPath")
    nt.links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(fill.outputs["Background"], mix.inputs[1])
    nt.links.new(seen.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], nt.nodes["World Output"].inputs["Surface"])
    scene.world = world

    # Ground catching the shadow, same paper tone
    bpy.ops.mesh.primitive_plane_add(size=500)
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("Preview_Ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_to_linear(PAPER)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    ground.data.materials.append(gm)

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(8)  # soft shadows
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)

    # Auto-frame: 3/4 elevated view on the bounds of all meshes except the ground
    pts = [o.matrix_world @ Vector(c) for o in scene.objects if o.type == "MESH" and o != ground for c in o.bound_box]
    center = sum(pts, Vector()) / len(pts)
    size = max((p - center).length for p in pts)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 85
    cam = bpy.data.objects.new("Cam", cam_data)
    direction = Vector((1.0, -1.0, 0.8)).normalized()
    cam.location = center + direction * size * 5.0
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = make_materials()
    objs = build(mats)
    finalize(objs)
    export_glb(args.out)  # export before adding preview-only objects
    if args.preview:
        render_preview(args.preview)


main()
