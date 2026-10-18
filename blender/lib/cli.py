"""Command-line arguments shared by every asset script (after Blender's `--`)."""

import argparse
import sys


def parse_args(argv=None) -> argparse.Namespace:
    if argv is None:
        argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(description="Fuel-X asset build")
    p.add_argument("--out", required=True, help="LOD0 GLB path; LODs go next to it as <name>_lod1.glb …")
    p.add_argument("--preview", help="preview PNG path (1024², Cycles CPU)")
    p.add_argument("--lod", default="all", choices=["0", "1", "2", "all"], help="which LOD(s) to export")
    p.add_argument("--turntable", type=int, default=0, help="number of turntable frames (0 = none)")
    p.add_argument("--turntable-dir", help="turntable output dir (default: <preview dir>/turntable)")
    p.add_argument("--samples", type=int, default=32, help="Cycles samples for the preview")
    p.add_argument("--tokens", help="tokens.json path (default: src/tokens/generated/tokens.json)")
    return p.parse_args(argv)
