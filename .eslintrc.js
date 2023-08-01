module.exports = {
  extends: '@exodus',
  overrides: [
    {
      files: ['*.{ts,tsx}'],
      extends: [
        '@exodus',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/typescript',
        'prettier',
      ],
      settings: {
        'import/parsers': {
          '@typescript-eslint/parser': ['.ts'],
        },
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
      plugins: ['@typescript-eslint'],
      rules: {
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-array-reduce': 'off',
        'unicorn/no-array-callback-reference': 'off',
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/catch-error-name': 'off',
        'unicorn/no-process-exit': 'off',
        'unicorn/number-literal-case': 'off',
        'import/no-unresolved': 'off',
        'no-console': 'error',
        'no-useless-constructor': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-unnecessary-condition': [
          'error',
          { allowConstantLoopConditions: true },
        ],
        '@typescript-eslint/no-extra-non-null-assertion': 'off',
        'no-use-before-define': 'off',
        '@typescript-eslint/no-use-before-define': [
          'error',
          { functions: false, classes: false, variables: false },
        ],
      },
      parser: '@typescript-eslint/parser',
    },
    {
      files: ['*.{spec,test}.{ts,tsx}', '**/utils/testing.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
}
