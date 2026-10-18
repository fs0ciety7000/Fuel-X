// Brutalist rules enforced mechanically (ADR 0005): colors only via var(--fx-*), no radius, shadows,
// gradients, translucency or filters. Generated token CSS is the only place literal values live.
const tokenOnly = ['/^var\\(--fx-/', '0'];

export default {
  ignoreFiles: ['src/tokens/generated/**', 'dist/**'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color-mix',
      'linear-gradient',
      'radial-gradient',
      'conic-gradient',
      'repeating-linear-gradient',
      'repeating-radial-gradient',
    ],
    'property-disallowed-list': ['box-shadow', 'text-shadow', 'backdrop-filter', 'filter', 'opacity'],
    'declaration-property-value-allowed-list': {
      'border-radius': ['0'],
      'font-size': ['/^var\\(--fx-/'],
      '/^(margin|padding|gap|row-gap|column-gap)/': tokenOnly,
    },
  },
  overrides: [
    {
      // The static noise overlay is the one sanctioned use of opacity.
      files: ['src/ui/global/noise.css'],
      rules: { 'property-disallowed-list': ['box-shadow', 'text-shadow', 'backdrop-filter', 'filter'] },
    },
  ],
};
