"""GLB export with the ASSETS_GUIDE §7 option set (verified on Blender 4.5.14 LTS)."""

from pathlib import Path

import bpy


def export_glb(path: str, vertex_color: bool = False) -> None:
    """Export the whole visible scene. Call **before** adding preview-only objects."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE" if vertex_color else "NONE",
        export_attributes=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        export_gpu_instances=False,
        export_hierarchy_flatten_objs=False,
        use_selection=False,
        use_visible=True,
    )
