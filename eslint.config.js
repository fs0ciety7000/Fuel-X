// Module boundaries (ARCHITECTURE §2) are enforced with typescript-eslint's no-restricted-imports:
// it matches both path aliases and relative paths, and allows `import type` where the matrix permits it.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const mod = (name) => [`@${name}/*`, `**/${name}/**`];

const restrict = (...groups) => [
  'error',
  {
    patterns: groups.map(([group, message, allowTypeImports = false]) => ({ group, message, allowTypeImports })),
  },
];

const SIM_RUNTIME = 'Runtime imports from src/sim are only allowed in src/app (use `import type`).';

export default tseslint.config(
  {
    ignores: ['dist/', 'build/', 'coverage/', 'test-results/', 'playwright-report/', 'src/tokens/generated/'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // --- Boundary matrix -------------------------------------------------------------------------
  {
    files: ['src/sim/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrict(
        [
          [...mod('app'), ...mod('bridge'), ...mod('render'), ...mod('ui'), ...mod('tokens')],
          'src/sim may only import src/sim and src/data.',
        ],
        [
          [
            'three',
            'three/*',
            '@react-three/*',
            'react',
            'react-dom',
            'react/*',
            'zustand',
            'zustand/*',
            'postprocessing',
          ],
          'src/sim is pure TS.',
        ],
      ),
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the injected seeded RNG.' },
        { object: 'Date', property: 'now', message: 'Use the injected sim clock.' },
        { object: 'performance', property: 'now', message: 'Use the injected sim clock.' },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
          'localStorage',
          'indexedDB',
        ].map((name) => ({ name, message: 'src/sim has no DOM, timers or wall clock.' })),
      ],
    },
  },
  {
    files: ['src/data/**', 'src/tokens/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrict([
        [
          ...mod('app'),
          ...mod('bridge'),
          ...mod('render'),
          ...mod('ui'),
          ...mod('sim'),
          ...mod('data'),
          ...mod('tokens'),
        ],
        'src/data and src/tokens import nothing from other modules.',
      ]),
    },
  },
  {
    files: ['src/bridge/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrict(
        [[...mod('app'), ...mod('render'), ...mod('ui')], 'src/bridge may only import zustand and sim types.'],
        [mod('sim'), SIM_RUNTIME, true],
        [['three', 'three/*', '@react-three/*', 'react', 'react-dom'], 'src/bridge has no rendering or React.'],
      ),
    },
  },
  {
    files: ['src/render/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrict(
        [[...mod('app'), ...mod('ui')], 'src/render may not import src/ui or src/app.'],
        [[...mod('sim'), '!@sim/math/*', '!**/sim/math/**'], SIM_RUNTIME, true],
      ),
    },
  },
  {
    files: ['src/ui/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrict(
        [[...mod('app'), ...mod('render')], 'src/ui may not import src/render or src/app.'],
        [mod('sim'), SIM_RUNTIME, true],
        [['three', 'three/*', '@react-three/*', 'postprocessing'], 'src/ui has no three.js.'],
      ),
    },
  },
  {
    files: ['src/**'],
    ignores: ['src/render/systems/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useFrame']",
          message: 'Only src/render/systems/** may call useFrame (ARCHITECTURE §2).',
        },
      ],
    },
  },
  {
    files: ['scripts/**', '*.config.{js,ts}', 'tests/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
