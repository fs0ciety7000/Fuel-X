"""Stack alignment check + composite preview (task 4.4): TOWER + PAD + BOOSTER + SHIP on LC-1.

Run:  blender -b --factory-startup --python-exit-code 1 -P blender/lib/composite.py -- \
          --out docs/assets/_stack.png [--detail build/stack_detail.png] [--samples 32]

Builds each asset from its own script (LOD0, rest pose), then places them only through sockets,
exactly like the renderer will (src/data/site-lc1.ts: OLM-1 at the origin, TOWER-1 26 m behind it):
  PAD origin = site origin;  TOWER origin = PAD origin − TOWER SOCKET_Mount (local)
  BOOSTER origin = PAD SOCKET_VehicleMount;  SHIP origin = BOOSTER SOCKET_ShipMount
and fails (exit 1) unless the interface sockets coincide:
  TOWER SOCKET_CatchPointL/R (carriage at rest, arms closed) == BOOSTER SOCKET_CatchPinL/R
  TOWER SOCKET_ShipQD (QD arm at 90°) == SHIP SOCKET_QD, attach directions opposed
  SHIP SOCKET_LiftPinL/R == TOWER catch points with the carriage at its max travel
Preview-only: nothing here is exported.
"""

import argparse
import importlib.util
import math
import sys
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import REPO_ROOT, check_blender_version  # noqa: E402
from lib.materials import materials_from_tokens  # noqa: E402
from lib.nodes import reset_scene  # noqa: E402
from lib.preview import _setup_render, render_preview, setup_stage  # noqa: E402

TOL = 1e-3


def _load(asset_file: str):
    path = REPO_ROOT / "blender" / "assets" / f"{asset_file}.py"
    spec = importlib.util.spec_from_file_location(f"fx_asset_{asset_file}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _build(mod) -> dict:
    """Build LOD0 into the current scene; return {socket_name: object} for this asset (renamed
    `<ASSET>__SOCKET_x` so the next asset's identical socket names do not collide)."""
    before = set(bpy.data.objects)
    mod.build(0)
    new = [o for o in bpy.data.objects if o not in before]
    socks = {}
    for o in new:
        if o.name.startswith("SOCKET_"):
            n = o.name.split(".")[0]
            o.name = f"{mod.ASSET}__{n}"
            socks[n] = o
    socks["_root"] = bpy.data.objects[mod.ASSET]
    return socks


def _w(obj) -> Vector:
    bpy.context.view_layer.update()
    return obj.matrix_world.translation.copy()


def _wz(obj) -> Vector:
    """World direction of the socket's local +Z (attach / emission direction)."""
    bpy.context.view_layer.update()
    return (obj.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()


def assemble():
    reset_scene()
    materials_from_tokens()
    mods = {k: _load(k) for k in ("pad", "tower", "booster", "ship")}
    s = {k: _build(m) for k, m in mods.items()}
    pad, tower, booster, ship = s["pad"], s["tower"], s["booster"], s["ship"]
    pad["_root"].location = (0.0, 0.0, 0.0)
    tower["_root"].location = -tower["SOCKET_Mount"].location  # SOCKET_Mount is a direct child of the root
    bpy.context.view_layer.update()
    booster["_root"].location = _w(pad["SOCKET_VehicleMount"])
    bpy.context.view_layer.update()
    ship["_root"].location = _w(booster["SOCKET_ShipMount"])
    bpy.context.view_layer.update()
    return mods, s


def check(mods, s) -> list:
    tower, booster, ship = s["tower"], s["booster"], s["ship"]
    objs = bpy.data.objects
    errors, report = [], []

    def same(label, a, b):
        d = (a - b).length
        report.append(f"{label}: {tuple(round(v, 3) for v in a)} vs {tuple(round(v, 3) for v in b)}  Δ {d:.4f} m")
        if d > TOL:
            errors.append(f"{label} off by {d:.3f} m")

    # Catch: carriage at rest (86 m), arms closed.
    for side in ("L", "R"):
        same(f"catch {side}", _w(tower[f"SOCKET_CatchPoint{side}"]), _w(booster[f"SOCKET_CatchPin{side}"]))
    # QD: arm engaged (90° about three +Y = Blender +Z).
    qd = objs["TOWER_QDArm"]
    rest = qd.rotation_euler.z
    qd.rotation_euler.z = math.radians(90.0)
    same("QD", _w(tower["SOCKET_ShipQD"]), _w(ship["SOCKET_QD"]))
    dot = _wz(tower["SOCKET_ShipQD"]).dot(_wz(ship["SOCKET_QD"]))
    report.append(f"QD attach directions dot = {dot:.4f} (want −1)")
    if dot > -0.999:
        errors.append(f"QD sockets not opposed (dot {dot:.3f})")
    qd.rotation_euler.z = rest
    # Ship lift: carriage at its max travel puts the catch points on the ship's lift pins.
    car = objs["TOWER_Carriage"]
    z_rest = car.location.z
    car.location.z = mods["tower"].CARRIAGE_MAX
    for side in ("L", "R"):
        same(f"lift {side} (carriage {mods['tower'].CARRIAGE_MAX:g} m)", _w(tower[f"SOCKET_CatchPoint{side}"]),
             _w(ship[f"SOCKET_LiftPin{side}"]))
    car.location.z = z_rest
    bpy.context.view_layer.update()
    top = _w(ship["_root"]).z + mods["ship"].TOP
    report.append(f"stack top {top:.1f} m vs tower tip {mods['tower'].TIP:g} m")
    if top >= mods["tower"].TIP:
        errors.append("stack taller than the tower tip")
    for line in report:
        print(f"[fx-stack] {line}", file=sys.stderr)
    return errors


def main() -> None:
    check_blender_version()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(REPO_ROOT / "docs" / "assets" / "_stack.png"))
    p.add_argument("--detail", help="optional close-up of the catch / QD zone (review only)")
    p.add_argument("--samples", type=int, default=32)
    a = p.parse_args(argv)
    mods, s = assemble()
    errors = check(mods, s)
    if errors:
        raise RuntimeError("stack alignment: " + "; ".join(errors))
    print("[fx-stack] alignment OK", file=sys.stderr)
    # Preview pose: QD arm engaged, arms closed around the booster pins.
    bpy.data.objects["TOWER_QDArm"].rotation_euler.z = math.radians(90.0)
    render_preview(a.out, samples=a.samples)
    if a.detail:
        cam = bpy.context.scene.camera
        target = Vector((0.0, 0.0, 95.0))
        d = Vector((1.0, -1.3, 0.35)).normalized()
        cam.location = target + d * 120.0
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        _setup_render(1024, a.samples)
        bpy.context.scene.render.filepath = a.detail
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

__all__ = ["assemble", "check", "setup_stage"]
