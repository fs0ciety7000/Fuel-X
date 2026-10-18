"""In-Blender sanity checks before export (the authoritative check is scripts/assets/contract.ts)."""

import re

import bpy

from .materials import MATERIAL_NAMES

NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


class AssetValidationError(RuntimeError):
    pass


def scene_triangles() -> int:
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        me = obj.evaluated_get(deps).to_mesh()
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        obj.evaluated_get(deps).to_mesh_clear()
    return tris


def validate(asset: str, required_nodes: list, tri_budget: int, max_materials: int = 5,
             allow_accent: bool = False) -> int:
    """Fails on missing nodes, bad names, foreign materials, over-budget tris, unapplied scale,
    meshes with children, more than one root. Returns the triangle count."""
    errors = []
    objs = list(bpy.context.scene.objects)
    names = {o.name for o in objs}
    roots = [o for o in objs if o.parent is None]
    if [o.name for o in roots] != [asset]:
        errors.append(f"expected exactly one root '{asset}', got {sorted(o.name for o in roots)}")
    for n in required_nodes:
        if n not in names:
            errors.append(f"missing node {n}")
    used = set()
    for o in objs:
        if not NAME_RE.match(o.name):
            errors.append(f"bad node name '{o.name}'")
        if o.type == "MESH":
            if o.children:
                errors.append(f"mesh '{o.name}' has children (must be an empty)")
            if o.data.name != o.name and o.data.users == 1:
                errors.append(f"mesh data '{o.data.name}' != object '{o.name}'")
            if tuple(round(s, 6) for s in o.scale) != (1.0, 1.0, 1.0):
                errors.append(f"unapplied scale on '{o.name}'")
            if o.name != asset and not o.name.startswith(asset + "_"):
                errors.append(f"mesh '{o.name}' lacks the '{asset}_' prefix")
            for slot in o.material_slots:
                if slot.material:
                    used.add(slot.material.name)
        elif o.type == "EMPTY" and o.name != asset and not (o.name.startswith(asset + "_") or o.name.startswith("SOCKET_")):
            errors.append(f"empty '{o.name}' is neither '{asset}_*' nor 'SOCKET_*'")
    foreign = sorted(used - set(MATERIAL_NAMES))
    if foreign:
        errors.append(f"foreign materials {foreign}")
    if not allow_accent and "MAT_Accent" in used:
        errors.append("MAT_Accent used on a model (ASSETS_GUIDE §5)")
    if len(used) > max_materials:
        errors.append(f"{len(used)} materials > {max_materials}")
    tris = scene_triangles()
    if tris > tri_budget:
        errors.append(f"{tris} tris > budget {tri_budget}")
    if errors:
        raise AssetValidationError(f"{asset}: " + "; ".join(errors))
    return tris
