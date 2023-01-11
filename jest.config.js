/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  testTimeout: 10_000,
  setupFilesAfterEnv: ['jest-extended/all'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['tmp'],
  collectCoverage: true,
  coverageReporters: ['text-summary'],
  testMatch: ['**/*.spec.ts', '!**/*.fixture.spec.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
}
