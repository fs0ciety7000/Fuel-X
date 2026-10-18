import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Proves the module boundary matrix (ARCHITECTURE §2) is enforced by `npm run lint`.
const eslint = new ESLint();

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('module boundaries', () => {
  it('rejects render/ui imports and three.js from src/sim', async () => {
    const ids = await ruleIds(
      'src/sim/fixture.ts',
      "import { x } from '@render/scene';\nimport * as T from 'three';\nexport const y = [x, T];\n",
    );
    expect(ids.filter((id) => id === '@typescript-eslint/no-restricted-imports')).toHaveLength(2);
  });

  it('rejects wall clock and Math.random in src/sim', async () => {
    const ids = await ruleIds(
      'src/sim/fixture.ts',
      'export const a = Math.random() + Date.now() + performance.now();\n',
    );
    expect(ids.filter((id) => id === 'no-restricted-properties')).toHaveLength(3);
  });

  it('allows type-only sim imports in src/ui but rejects runtime ones', async () => {
    const typeOnly = await ruleIds(
      'src/ui/fixture.ts',
      "import type { World } from '@sim/types';\nexport type W = World;\n",
    );
    expect(typeOnly).not.toContain('@typescript-eslint/no-restricted-imports');
    const runtime = await ruleIds('src/ui/fixture.ts', "import { step } from '@sim/step';\nexport const s = step;\n");
    expect(runtime).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('rejects src/ui importing src/render', async () => {
    const ids = await ruleIds('src/ui/fixture.ts', "import { Scene } from '@render/Scene';\nexport const s = Scene;\n");
    expect(ids).toContain('@typescript-eslint/no-restricted-imports');
  });

  it('allows src/app to import everything', async () => {
    const ids = await ruleIds(
      'src/app/fixture.ts',
      "import { step } from '@sim/step';\nimport { Scene } from '@render/Scene';\nexport const s = [step, Scene];\n",
    );
    expect(ids).not.toContain('@typescript-eslint/no-restricted-imports');
  });
});
