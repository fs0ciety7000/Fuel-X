"""Fuel-X shared Blender helpers (docs/ASSETS_GUIDE.md §10).

Asset scripts run with `blender -b --factory-startup -P blender/assets/<asset>.py -- ...`
and import this package after `sys.path.insert(0, <repo>/blender)`.

Everything here is deterministic: no randomness, no timestamps, geometry built from
plain Python lists (`MeshBuilder`) instead of operators where possible, so re-running a
script exports a byte-identical GLB.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TOKENS_PATH = REPO_ROOT / "src" / "tokens" / "generated" / "tokens.json"
BLENDER_MAJOR_MINOR = (4, 5)


def check_blender_version() -> None:
    import bpy

    if tuple(bpy.app.version[:2]) != BLENDER_MAJOR_MINOR:
        raise RuntimeError(f"Fuel-X assets need Blender 4.5 LTS, got {bpy.app.version_string}")
