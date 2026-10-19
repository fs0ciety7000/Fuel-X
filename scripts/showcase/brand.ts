// Ink variants of the studio marks for the showcase colophon (CLAUDE.md rule 5: one accent; the source SVGs default
// to lime/gold through `var(--logo-tN, #hex)` fallbacks). Colors come from the token source, so the generated files
// in public/showcase/brand/ never hold hand-picked values. Run: `npx tsx scripts/showcase/brand.ts`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../../src/tokens/tokens';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const c = tokens.color;

/** Per mark: tone slot → token color. */
const MARKS: Record<string, Record<string, string>> = {
  interactive: { t1: c.ink, t2: c.ink3 },
  'cardor-emblem': { t1: c.ink },
  'cardor-monogram': { t1: c.ink, t2: c.paper, t3: c.accent },
};

const out = resolve(root, 'public/showcase/brand');
mkdirSync(out, { recursive: true });
for (const [name, tones] of Object.entries(MARKS)) {
  let svg = readFileSync(resolve(root, `public/brand/${name}.svg`), 'utf8');
  svg = svg.replace(/var\(--logo-(t\d), (#[0-9A-Fa-f]{3,8})\)/g, (_m, slot: string, fallback: string) => {
    const tone = tones[slot];
    if (!tone) throw new Error(`${name}: no token for ${slot} (${fallback})`);
    return tone;
  });
  writeFileSync(resolve(out, `${name}.svg`), svg);
  console.log(`brand: ${name}.svg`);
}
