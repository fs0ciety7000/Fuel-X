import { describe, expect, it } from 'vitest';
import { tokens } from '@tokens/tokens';

// WCAG 2.x contrast for the text/background pairs DESIGN_SYSTEM §2.2 allows.
const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const { color } = tokens;

describe('design tokens', () => {
  it.each([
    ['ink', color.ink, ['paper', 'paper2', 'paper3', 'accentTint', 'accent']],
    ['ink2', color.ink2, ['paper', 'paper2', 'paper3', 'accentTint']],
    ['ink3', color.ink3, ['paper', 'paper2', 'paper3', 'accentTint']],
    ['accentText', color.accentText, ['paper', 'paper2', 'accentTint']],
  ] as const)('%s meets AA (4.5:1) on its allowed backgrounds', (_name, fg, backgrounds) => {
    for (const bg of backgrounds) expect(contrast(fg, color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the accent fill is ink', () => {
    expect(color.onAccent).toBe(color.ink);
  });

  it('uses only the accent family (accent, accent-text, accent-tint) as saturated colors', () => {
    const saturated = new Set(
      [...Object.values(color), ...Object.values(tokens.world)].filter((hex) => {
        const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return Math.max(...channels) - Math.min(...channels) > 40;
      }),
    );
    expect([...saturated].sort()).toEqual([color.accent, color.accentText, color.accentTint].sort());
  });

  it('keeps the brutalist invariants', () => {
    expect(tokens.radius).toBe('0');
    expect(tokens.shadow).toBe('none');
  });
});
