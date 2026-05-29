/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@eiscord/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e.spec.ts'],
  testTimeout: 30000,
  transform: {
    '^.+\\.ts$': '<rootDir>/jest.transformer.cjs',
  },
};
