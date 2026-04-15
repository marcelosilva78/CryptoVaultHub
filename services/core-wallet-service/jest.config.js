module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }],
  },
  transformIgnorePatterns: ['generated/prisma-client'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^\\.\\./generated/prisma-client$': '<rootDir>/__mocks__/prisma-client.ts',
    '^@cvh/posthog(.*)$': '<rootDir>/../../../packages/posthog/src$1',
    '^@cvh/types(.*)$': '<rootDir>/../../../packages/types/src$1',
    '^@cvh/config(.*)$': '<rootDir>/../../../packages/config/src$1',
    '^@cvh/utils(.*)$': '<rootDir>/../../../packages/utils/src$1',
    '^@cvh/job-client(.*)$': '<rootDir>/../../../packages/job-client/src$1',
    '^@cvh/api-client(.*)$': '<rootDir>/../../../packages/api-client/src$1',
  },
};
