/** @type {import('jest').Config} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
            },
        ],
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
    coverageDirectory: 'coverage',
    extensionsToTreatAsEsm: ['.ts'],
};
