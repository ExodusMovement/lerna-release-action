module.exports = {
  extends: '@exodus/eslint-config/javascript',
  overrides: [
    {
      files: ['*.{ts,tsx}'],
      extends: '@exodus/eslint-config/typescript',
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
      rules: {
        'unicorn/prefer-top-level-await': 'off',
        'import/no-extraneous-dependencies': [
          'error',
          { devDependencies: ['src/utils/testing.ts', '**/*.spec.ts'] },
        ],
      },
    },
    {
      files: ['*.{spec,test}.{ts,tsx}', '**/utils/testing.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}
