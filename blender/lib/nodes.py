"""Scene, root, pivots, sockets (ASSETS_GUIDE §3–§4).

Convention: `location` / `rotation` passed to `pivot`, `socket`, `linked_copy` are in the
**parent's local space** (Blender Z-up); parenting uses an identity parent-inverse so the
glTF node translation equals what the script wrote. `parent_keep` is the world-preserving
alternative.
"""

import bpy
from mathutils import Matrix

ANIM_KEYS = ("kind", "axis", "min", "max", "rest", "unit")
ANIM_KINDS = ("rot", "trans", "spin")


def reset_scene() -> None:
    """Empty factory scene (no default cube/camera/light), all orphan data purged."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def _link(obj, parent, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
    return obj


def set_extras(obj, extras: dict | None) -> None:
    for k, v in (extras or {}).items():
        obj[k] = v


def root(asset: str, version: int = 1, lod: int = 0):
    """The single root empty `<ASSET>` at the origin (extras fx_asset, fx_version, fx_lod)."""
    e = bpy.data.objects.new(asset, None)
    e.empty_display_type = "ARROWS"
    _link(e, None)
    set_extras(e, {"fx_asset": asset, "fx_version": int(version), "fx_lod": int(lod)})
    return e


def anim_extras(kind: str, axis: str, vmin: float, vmax: float, rest: float, unit: str) -> dict:
    """fx_* extras. Axis and ranges are in three (Y-up) local space (ASSETS_GUIDE §3)."""
    if kind not in ANIM_KINDS or axis not in ("x", "y", "z") or unit not in ("deg", "m"):
        raise ValueError(f"bad anim spec {kind} {axis} {unit}")
    return {"fx_anim": kind, "fx_axis": axis, "fx_min": float(vmin), "fx_max": float(vmax),
            "fx_rest": float(rest), "fx_unit": unit}


def pivot(name: str, location, rotation=(0, 0, 0), parent=None, anim: dict | None = None):
    """Empty that is a joint / group. `anim` = dict(kind, axis, min, max, rest, unit)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.location = location
    e.rotation_euler = rotation
    _link(e, parent)
    if anim:
        set_extras(e, anim_extras(*(anim[k] for k in ANIM_KEYS)))
    return e


def socket(name: str, location, rotation=(0, 0, 0), parent=None, extras: dict | None = None):
    """Attachment empty `SOCKET_<name>`; local +Z (Blender) = emission / attach direction."""
    full = name if name.startswith("SOCKET_") else f"SOCKET_{name}"
    e = bpy.data.objects.new(full, None)
    e.empty_display_type = "SINGLE_ARROW"
    e.empty_display_size = 2.0
    e.location = location
    e.rotation_euler = rotation
    _link(e, parent)
    set_extras(e, extras)
    return e


def parent_keep(child, parent) -> None:
    """Parent without moving the child (world transform preserved)."""
    bpy.context.view_layer.update()
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_world = world


def linked_copy(src, name: str, location, rotation=(0, 0, 0), parent=None):
    """Linked duplicate (shared mesh data → one glTF mesh)."""
    obj = bpy.data.objects.new(name, src.data)
    obj.location = location
    obj.rotation_euler = rotation
    return _link(obj, parent)


def merge_static(objs: list, name: str):
    """Join mesh objects into one (one primitive per material). Prefer MeshBuilder.extend."""
    objs = [o for o in objs if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


def apply_transforms(objs) -> None:
    """transform_apply rot+scale on meshes that carry them (pivots keep their rotation)."""
    targets = [o for o in objs if o.type == "MESH" and (tuple(o.scale) != (1, 1, 1) or any(o.rotation_euler))]
    if not targets:
        return
    bpy.ops.object.select_all(action="DESELECT")
    for o in targets:
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
