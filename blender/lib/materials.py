"""Shared MAT_* materials, colors read from the design-token export (ASSETS_GUIDE §5).

No hex literal lives in asset scripts: colors come from `tokens.json` (`world.*` entries carry
both `srgb` and pre-computed `linear` triplets). Roughness / metallic are material-contract values.
"""

import json
from pathlib import Path

import bpy

from . import TOKENS_PATH

# material name -> (token group, token key, roughness, metallic)
MATERIAL_TOKENS = {
    "MAT_Clay": ("world", "clayLight", 0.9, 0.0),
    "MAT_ClayDark": ("world", "clayDark", 0.9, 0.0),
    "MAT_Metal": ("world", "clayMetal", 0.6, 0.3),
    "MAT_Glass": ("world", "glass", 0.25, 0.0),
    "MAT_Accent": ("color", "accent", 0.8, 0.0),
    # Ground-level concrete (pad apron, lots): lighter than MAT_Clay so slabs read as paving, not structure.
    "MAT_Concrete": ("world", "padConcrete", 0.95, 0.0),
}
MATERIAL_NAMES = tuple(MATERIAL_TOKENS)

_tokens_cache: dict = {}


def load_tokens(tokens_path=None) -> dict:
    path = Path(tokens_path) if tokens_path else TOKENS_PATH
    key = str(path)
    if key not in _tokens_cache:
        _tokens_cache[key] = json.loads(path.read_text(encoding="utf-8"))
    return _tokens_cache[key]


def hex_to_linear(hex_color: str) -> tuple:
    h = hex_color.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (lin[0], lin[1], lin[2], 1.0)


def token_linear(group: str, key: str, tokens_path=None) -> tuple:
    """RGBA linear color of a token (uses the exported `linear` triplet)."""
    entry = load_tokens(tokens_path)[group][key]
    r, g, b = entry["linear"]
    return (float(r), float(g), float(b), 1.0)


def _principled(mat):
    mat.use_nodes = True
    return mat.node_tree.nodes["Principled BSDF"]


def materials_from_tokens(tokens_path=None) -> dict:
    """Create (or reuse) the six shared materials. Returns {name: Material}."""
    mats = {}
    for name, (group, key, rough, metal) in MATERIAL_TOKENS.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        bsdf = _principled(mat)
        color = token_linear(group, key, tokens_path)
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        mat.diffuse_color = color
        mats[name] = mat
    return mats


def preview_material(name: str, group: str, key: str, roughness: float = 1.0, tokens_path=None):
    """Preview-only material (ground, human) — never exported."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    bsdf = _principled(mat)
    bsdf.inputs["Base Color"].default_value = token_linear(group, key, tokens_path)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat
