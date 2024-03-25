module.exports = {
  extends: '@exodus/eslint-config/javascript',
  overrides: [
    {
      files: ['*.graphql'],
      parserOptions: {
        schema: './tools/schemas/github.graphql',
        operations: ['./src/**/*.ts']
      },
      extends: ['plugin:@graphql-eslint/operations-recommended'],
      rules: {
        '@graphql-eslint/executable-definitions': 'off',
        '@graphql-eslint/require-id-when-available': 'off',
      }
    },
    {
      files: ['*.{ts,tsx}'],
      processor: '@graphql-eslint/graphql',
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
