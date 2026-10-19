// Linked-duplicate groups inside one asset (wrapper `instanced`, ASSETS_GUIDE §7 "Instanced draw calls") drawn as
// one InstancedMesh per group and primitive: the 16 transporter wheel pairs + 16 bogie housings (32 nodes → 2 draw
// calls) and the 5 tanker axles (→ 1). The named nodes keep animating as plain Object3Ds; only the leaf meshes are
// hidden and their transforms copied into the instance matrices after the rig moved the pivots.
import { InstancedMesh, Matrix4, Mesh } from 'three';
import type { Object3D } from 'three';

interface Part {
  nodes: Object3D[];
  /** Primitive meshes of the template node (the node itself, or its primitive children when multi-material). */
  meshes: { im: InstancedMesh; local: Matrix4 | null }[];
}

const tmp = new Matrix4();
const rel = new Matrix4();

/** Matrix of `node` relative to `root` from the local matrices (no matrixWorld dependency). */
function relativeMatrix(node: Object3D, root: Object3D, out: Matrix4): Matrix4 {
  node.updateMatrix();
  out.copy(node.matrix);
  let p = node.parent;
  while (p && p !== root) {
    p.updateMatrix();
    out.premultiply(p.matrix);
    p = p.parent;
  }
  return out;
}

export class InstancedParts {
  private readonly parts: Part[] = [];
  private bounded = false;

  constructor(
    private readonly root: Object3D,
    groups: readonly (readonly string[])[],
    castShadow: boolean,
  ) {
    for (const names of groups) {
      const nodes = names.map((n) => root.getObjectByName(n)).filter((o): o is Object3D => o !== undefined);
      const template = nodes[0];
      if (!template || nodes.length < 2) continue;
      const prims: Mesh[] =
        template instanceof Mesh ? [template] : template.children.filter((c): c is Mesh => c instanceof Mesh);
      if (prims.length === 0) continue;
      const meshes = prims.map((m) => {
        const im = new InstancedMesh(m.geometry, m.material, nodes.length);
        im.name = `${template.name}_Instanced`;
        im.castShadow = castShadow;
        im.receiveShadow = true;
        root.add(im);
        return { im, local: m === template ? null : m.matrix.clone() };
      });
      for (const n of nodes) n.visible = false;
      this.parts.push({ nodes, meshes });
    }
  }

  get groups(): number {
    return this.parts.length;
  }

  /** Copies the (just animated) node transforms into the instance matrices. */
  update(): void {
    for (const part of this.parts) {
      for (let i = 0; i < part.nodes.length; i++) {
        const node = part.nodes[i];
        if (!node) continue;
        relativeMatrix(node, this.root, rel);
        for (const { im, local } of part.meshes) {
          im.setMatrixAt(i, local ? tmp.multiplyMatrices(rel, local) : rel);
        }
      }
      for (const { im } of part.meshes) im.instanceMatrix.needsUpdate = true;
    }
    if (!this.bounded) {
      // Instances only turn in place relative to the asset root: one bounding sphere for culling is enough.
      for (const part of this.parts) for (const { im } of part.meshes) im.computeBoundingSphere();
      this.bounded = true;
    }
  }
}
