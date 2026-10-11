/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { 
      target: 'ES2019',
      module: 'CommonJS',
      esModuleInterop: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      resolveJsonModule: true,
      moduleResolution: 'node'
    } }],
  },
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: false,
};
