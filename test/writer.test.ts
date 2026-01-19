import { describe, it, expect } from '@jest/globals';
import { generateEnvContent } from '../src/writer.js';
import type { ResolvedVariable } from '../src/types.js';

describe('generateEnvContent', () => {
    it('generates simple variable', () => {
        const variables: ResolvedVariable[] = [
            { name: 'PORT', value: '3000' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('PORT=3000\n');
    });

    it('generates multiple variables', () => {
        const variables: ResolvedVariable[] = [
            { name: 'PORT', value: '3000' },
            { name: 'HOST', value: 'localhost' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('PORT=3000\nHOST=localhost\n');
    });

    it('handles empty value', () => {
        const variables: ResolvedVariable[] = [
            { name: 'EMPTY', value: '' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('EMPTY=\n');
    });

    it('escapes values with spaces', () => {
        const variables: ResolvedVariable[] = [
            { name: 'MESSAGE', value: 'hello world' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('MESSAGE="hello world"\n');
    });

    it('escapes values with quotes', () => {
        const variables: ResolvedVariable[] = [
            { name: 'MESSAGE', value: 'say "hello"' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('MESSAGE="say \\"hello\\""\n');
    });

    it('escapes values with hashes', () => {
        const variables: ResolvedVariable[] = [
            { name: 'COLOR', value: '#ff0000' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('COLOR="#ff0000"\n');
    });

    it('escapes values with newlines', () => {
        const variables: ResolvedVariable[] = [
            { name: 'MULTILINE', value: 'line1\nline2' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('MULTILINE="line1\nline2"\n');
    });

    it('includes section headers', () => {
        const variables: ResolvedVariable[] = [
            { name: 'DB_HOST', value: 'localhost', section: 'Database' },
            { name: 'DB_PORT', value: '5432', section: 'Database' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('# --- Database ---\nDB_HOST=localhost\nDB_PORT=5432\n');
    });

    it('separates different sections', () => {
        const variables: ResolvedVariable[] = [
            { name: 'DB_HOST', value: 'localhost', section: 'Database' },
            { name: 'APP_PORT', value: '3000', section: 'Application' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe(
            '# --- Database ---\nDB_HOST=localhost\n\n# --- Application ---\nAPP_PORT=3000\n'
        );
    });

    it('handles variables without sections mixed with sectioned', () => {
        const variables: ResolvedVariable[] = [
            { name: 'GLOBAL', value: 'value' },
            { name: 'DB_HOST', value: 'localhost', section: 'Database' },
        ];

        const result = generateEnvContent(variables);
        expect(result).toBe('GLOBAL=value\n\n# --- Database ---\nDB_HOST=localhost\n');
    });
});
