// Single source of truth for design tokens (docs/DESIGN_SYSTEM.md §2, ADR 0005).
// `npm run tokens` generates src/tokens/generated/{tokens.css,tokens.json} from this file.
// Consumed by: HUD (CSS vars), render code (import { tokens }), Blender (tokens.json).

const svg = (body: string, size: number): string =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`,
  )}")`;

const color = {
  paper: '#F4F4F0',
  paper2: '#EAE8E3',
  paper3: '#DEDCD5',
  ink: '#0A0A0A',
  ink2: '#3D3D3A',
  ink3: '#5E5E59',
  ink4: '#8C8C86',
  ink5: '#BDBCB5',
  accent: '#FF5A1F',
  accentText: '#B23B0B',
  accentTint: '#FFE1D2',
  onAccent: '#0A0A0A',
  focus: '#0A0A0A',
} as const;

export const tokens = {
  color,
  pattern: {
    hazard: svg(
      `<path d='M-2 2l4-4M0 8L8 0M6 10l4-4' stroke='${color.accent}' stroke-width='2.83'/>` +
        `<path d='M-2 6l8-8M2 10l8-8' stroke='${color.ink}' stroke-width='2.83'/>`,
      8,
    ),
    hatch: svg(
      `<rect width='4' height='4' fill='${color.paper}'/><path d='M-1 1l2-2M0 4l4-4M3 5l2-2' stroke='${color.ink5}' stroke-width='1'/>`,
      4,
    ),
    noise: svg(
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/>` +
        `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0'/></filter><rect width='256' height='256' filter='url(#n)'/>`,
      256,
    ),
  },
  world: {
    background: color.paper,
    haze: color.paper,
    clayLight: '#E6E4DE',
    clayDark: '#9A9993',
    clayMetal: '#C9C8C2',
    glass: color.ink3,
    shadowTint: color.ink5,
    sun: '#FBFBF8',
    seaBase: '#D9D8D2',
    seaPoints: '#FBFBF8',
    groundBase: '#E3E1DB',
    groundPoints: '#C4C3BC',
    padConcrete: '#EFEEE9',
    exhaustCore: color.accentTint,
    exhaustGlow: color.accent,
    steam: '#FBFBF8',
    selectionRing: color.accent,
    zoneRecovery: color.accent,
    zoneHazard: color.accent,
    guide: color.ink4,
  },
  font: {
    micro: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    macro: '"Inter Tight", "Inter", "Archivo Black", "Helvetica Neue", Arial, sans-serif',
  },
  type: {
    tick: { size: '10px', leading: 1.2, tracking: '0.08em', weight: 400 },
    label: { size: '11px', leading: 1.3, tracking: '0.08em', weight: 500 },
    body: { size: '12px', leading: 1.35, tracking: '0.05em', weight: 400 },
    strong: { size: '13px', leading: 1.3, tracking: '0.05em', weight: 700 },
    title: { size: '14px', leading: 1.25, tracking: '0.05em', weight: 700 },
    value: { size: '22px', leading: 1.0, tracking: '0.02em', weight: 500 },
    macroClock: { size: 'clamp(2rem, 2.6vw, 3.5rem)', leading: 0.9, tracking: '-0.03em', weight: 900 },
    macroCallsign: { size: 'clamp(1.75rem, 2vw, 2.75rem)', leading: 0.9, tracking: '-0.04em', weight: 900 },
    macroStamp: { size: 'clamp(4rem, 9vw, 11rem)', leading: 0.85, tracking: '-0.05em', weight: 900 },
    // Showcase site (docs/SHOWCASE.md): reading copy and two extra macro steps; the HUD never uses these.
    lede: { size: 'clamp(14px, 1.05vw, 17px)', leading: 1.5, tracking: '0.02em', weight: 400 },
    macroHero: { size: 'clamp(5.5rem, 19vw, 21rem)', leading: 0.8, tracking: '-0.065em', weight: 900 },
    macroSection: { size: 'clamp(2.75rem, 6.5vw, 7rem)', leading: 0.86, tracking: '-0.05em', weight: 900 },
  },
  space: ['0', '2px', '4px', '8px', '12px', '16px', '24px', '32px', '48px'],
  size: {
    hudGutter: '16px',
    row: '32px',
    control: '32px',
    topbar: '40px',
    glyph: '12px',
    glyphLg: '16px',
    hitMin: '24px',
    // HUD primitives (DESIGN_SYSTEM §2.6, task 6.2).
    sparkW: '120px',
    sparkH: '20px',
    segment: '16px',
    bar: '6px',
    deadline: '8px',
    tag: '20px',
    popover: '280px',
    toast: '400px',
    dialog: '480px',
    debrief: '880px',
    tile: '160px',
    // Showcase site: reading measure and the sticky stage height on phones.
    measure: '62ch',
    stagePhone: '46svh',
    ctaWide: '18rem',
    labelColumn: '11rem',
    codeColumn: '4rem',
    map: '22rem',
    mapPhone: '16rem',
  },
  radius: '0',
  shadow: 'none',
  rule: {
    hair: '1px',
    frame: `1px solid ${color.ink}`,
    heavy: `2px solid ${color.ink}`,
    warn: `2px solid ${color.accent}`,
    band: '4px',
  },
  focus: { ring: `2px solid ${color.focus}`, offset: '2px' },
  z: {
    world: 0,
    worldLabels: 10,
    hud: 20,
    popover: 30,
    toast: 40,
    dialog: 50,
    stamp: 60,
    noise: 70,
  },
  motion: {
    dur: {
      instant: '0ms',
      snap: '80ms',
      fast: '120ms',
      base: '200ms',
      stamp: '640ms',
      camera: '700ms',
      blink: '2000ms',
    },
    ease: { mech: 'cubic-bezier(0.2, 0, 0, 1)', linear: 'linear', step: 'steps(3, end)' },
  },
  viewport: { minWidth: 1280, minHeight: 720, compactWidth: 1600, compactHeight: 900, wideWidth: 2560 },
} as const;

export type Tokens = typeof tokens;
