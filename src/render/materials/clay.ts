// Token-driven replacements for the six GLB materials (ASSETS_GUIDE §5): one shared instance per `MAT_*` name
// across every asset → one shader program each. Colors only from tokens (DESIGN_SYSTEM §2.4).
import { tokens } from '@tokens/tokens';
import { Color, MeshStandardMaterial } from 'three';
import type { Material, Side } from 'three';

const w = tokens.world;

interface MatSpec {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  /** three default 1. */
  emissiveIntensity?: number;
}

// MAT_Metal: the contract's metallic 0.3 renders dark without an environment map (no env in the clay look);
// metalness 0 + lower roughness keeps the lattice in the clay family like the Cycles previews.
const SPECS: Record<string, MatSpec> = {
  MAT_Clay: { color: w.clayLight, roughness: 0.9, metalness: 0 },
  MAT_ClayDark: { color: w.clayDark, roughness: 0.9, metalness: 0 },
  MAT_Metal: { color: w.clayMetal, roughness: 0.6, metalness: 0 },
  MAT_Glass: { color: w.glass, roughness: 0.25, metalness: 0 },
  MAT_Accent: { color: w.exhaustGlow, roughness: 0.8, metalness: 0, emissive: w.exhaustGlow },
  // Pad apron / paving: same token as the terrain's *unlit* concrete lots, lit matte so shadows still land on it.
  // A faint self-lift in the same token (0.15) brings a sunlit up-facing slab level with the lot around it
  // (≈ 218 → 234 sRGB in phase5-home) instead of reading as a grey plate; shadows stay ~2× darker.
  MAT_Concrete: {
    color: w.padConcrete,
    roughness: 0.95,
    metalness: 0,
    emissive: w.padConcrete,
    emissiveIntensity: 0.15,
  },
};

const cache = new Map<string, MeshStandardMaterial>();

/** Shared token material for a GLB material name (+ side); unknown names fall back to MAT_Clay. */
export function clayMaterial(name: string, side: Side): Material {
  const key = `${name in SPECS ? name : 'MAT_Clay'}:${side}`;
  let m = cache.get(key);
  if (!m) {
    const spec = SPECS[name] ?? (SPECS.MAT_Clay as MatSpec);
    m = new MeshStandardMaterial({
      color: new Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
      side,
    });
    if (spec.emissive) m.emissive = new Color(spec.emissive);
    if (spec.emissiveIntensity !== undefined) m.emissiveIntensity = spec.emissiveIntensity;
    m.name = name;
    cache.set(key, m);
  }
  return m;
}
