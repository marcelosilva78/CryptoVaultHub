module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@nestjs/schedule$': '<rootDir>/__mocks__/@nestjs/schedule.ts',
    '^\\.\\./generated/prisma-client/runtime/library$':
      '<rootDir>/__mocks__/prisma-runtime.ts',
    '^\\.\\./generated/prisma-client$': '<rootDir>/__mocks__/prisma-client.ts',
  },
};
