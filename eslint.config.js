import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        React: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        Image: 'readonly',
        self: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-misused-promises': [
        'warn',
        { checksVoidReturn: { attributes: true, arguments: false, properties: false } },
      ],
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-empty': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    // Tools must build their chrome from the shared primitives, so a tool can't
    // quietly reintroduce its own button or select styling. Expressed with the
    // built-in no-restricted-syntax rather than react/forbid-elements, because
    // eslint-plugin-react isn't a dependency here and AGENTS.md says to reach
    // for what's already available before adding one.
    //
    // Exemptions are per-line `eslint-disable-next-line no-restricted-syntax`
    // comments with a stated reason. The class-string half of the same contract
    // (type scale, icon scale, focus rings, colour tokens) is enforced by
    // scripts/lint-design-system.mjs, which `bun run lint` chains after ESLint —
    // see documentation/DESIGN_SYSTEM.md § Enforcement.
    files: ['src/tools/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            'Use the shared Button from @/components/shared/Button. If no variant fits, keep the raw <button> and add an eslint-disable-next-line with the reason.',
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message:
            'Use the shared Select from @/components/shared/Select. If it genuinely does not fit, add an eslint-disable-next-line with the reason.',
        },
        {
          // Text-entry inputs only. checkbox/radio/file/color/range are native
          // controls with no shared equivalent — they're exempted by type here
          // rather than by fourteen disable comments that would say the same
          // thing fourteen times.
          //
          // Without this, a tool can hand-roll a field that looks close enough
          // to the shared Input to pass review while quietly dropping the focus
          // ring, which is what happened to ImageTool's dimension fields and to
          // the snippet title before they were migrated.
          selector:
            'JSXOpeningElement[name.name="input"]:not(:has(JSXAttribute[name.name="type"][value.value=/^(checkbox|radio|file|color|range)$/]))',
          message:
            'Use the shared Input (boxed), InlineInput (chrome-less) or SearchInput from @/components/shared. If none fits, add an eslint-disable-next-line with the reason.',
        },
      ],
    },
  },
  {
    // The shell gets the text-input guard but not the button/select ones.
    //
    // Not an oversight: the shell holds ~45 raw buttons that are genuinely bespoke — the window
    // controls, the tab strip, the sidebar rows — and turning them all into disable comments would
    // say nothing. Text fields are the opposite case. There are only a handful, none of them
    // bespoke, and every hand-rolled one so far has shipped without a focus indicator: the sidebar
    // filter tinted its border instead of drawing a ring, and the note title and tag entry had
    // `outline-none` with nothing put back. That is invisible in review and invisible in a
    // screenshot, which is exactly what a lint rule is for.
    files: ['src/components/shell/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXOpeningElement[name.name="input"]:not(:has(JSXAttribute[name.name="type"][value.value=/^(checkbox|radio|file|color|range)$/]))',
          message:
            'Use the shared Input (boxed), InlineInput (chrome-less) or SearchInput from @/components/shared. If none fits, add an eslint-disable-next-line with the reason.',
        },
      ],
    },
  },
  {
    ignores: [
      'dist/',
      'node_modules/',
      'src-tauri/',
      '*.config.js',
      '*.config.ts',
      'src/__mocks__/',
      '**/*.js',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
]
