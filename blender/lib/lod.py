"""Parameter-driven LODs + the standard asset `main()` (export each LOD, then preview LOD0).

LODs come from the same build function with lower parameters (ASSETS_GUIDE §6) — never decimation.
"""

import sys
from pathlib import Path

from . import check_blender_version
from .cli import parse_args
from .export import export_glb
from .materials import materials_from_tokens
from .nodes import reset_scene
from .preview import render_preview
from .validate import validate


def pick(lod: int, *values):
    """pick(lod, lod0_value, lod1_value, lod2_value) — missing levels reuse the last value."""
    return values[min(lod, len(values) - 1)]


def lod_path(out: str, lod: int) -> str:
    p = Path(out)
    return str(p) if lod == 0 else str(p.with_name(f"{p.stem}_lod{lod}{p.suffix}"))


def run_asset(asset: str, build, required_nodes: list, tri_budgets: tuple, lods: int = 3,
              preview_pose=None) -> None:
    """Standard entry point. `build(lod)` builds the scene (materials already exist).
    `preview_pose()` may move animated nodes after the LOD0 export, for the preview only."""
    check_blender_version()
    args = parse_args()
    levels = list(range(lods)) if args.lod == "all" else [int(args.lod)]
    # LOD0 last so the preview renders the full-detail scene that is still loaded.
    for lod in sorted(levels, reverse=True):
        reset_scene()
        materials_from_tokens(args.tokens)
        build(lod)
        tris = validate(asset, required_nodes, tri_budgets[lod])
        out = lod_path(args.out, lod)
        export_glb(out)
        print(f"[fx-asset] {asset} lod{lod}: {tris} tris -> {out}", file=sys.stderr)
    if (args.preview or args.turntable) and 0 in levels:
        if preview_pose:
            preview_pose()
        render_preview(args.preview, samples=args.samples, turntable=args.turntable,
                       turntable_dir=args.turntable_dir, turntable_name=Path(args.out).stem)
