import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        cli: 'src/cli.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    shims: true,
    banner: ({ format }) => {
        if (format === 'esm') {
            return {
                js: '#!/usr/bin/env node',
            };
        }
        return {};
    },
});
