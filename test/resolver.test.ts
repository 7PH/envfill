import { executeShellCommand, generateSecret, resolveDefault } from '../src/resolver.js';

describe('executeShellCommand', () => {
    it('executes a simple command', () => {
        const result = executeShellCommand('echo "hello"');
        expect(result.value).toBe('hello');
        expect(result.error).toBeUndefined();
    });

    it('trims whitespace from output', () => {
        const result = executeShellCommand('echo "  hello  "');
        expect(result.value).toBe('hello');
    });

    it('handles commands with pipes', () => {
        const result = executeShellCommand('echo "abc" | tr "a" "x"');
        expect(result.value).toBe('xbc');
    });

    it('returns error for invalid command', () => {
        const result = executeShellCommand('nonexistent_command_12345');
        expect(result.error).toBeDefined();
        expect(result.value).toBe('');
    });

    it('executes id -u command', () => {
        const result = executeShellCommand('id -u');
        expect(result.error).toBeUndefined();
        expect(result.value).toMatch(/^\d+$/);
    });

    it('executes id -g command', () => {
        const result = executeShellCommand('id -g');
        expect(result.error).toBeUndefined();
        expect(result.value).toMatch(/^\d+$/);
    });
});

describe('generateSecret', () => {
    it('generates a secret of the specified length', () => {
        const secret = generateSecret(32);
        expect(secret).toHaveLength(32);
    });

    it('generates different secrets each time', () => {
        const secret1 = generateSecret(32);
        const secret2 = generateSecret(32);
        expect(secret1).not.toBe(secret2);
    });

    it('only contains alphanumeric characters', () => {
        const secret = generateSecret(100);
        expect(secret).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('generates secrets of various lengths', () => {
        expect(generateSecret(8)).toHaveLength(8);
        expect(generateSecret(16)).toHaveLength(16);
        expect(generateSecret(64)).toHaveLength(64);
    });
});

describe('resolveDefault', () => {
    it('returns empty string for undefined', () => {
        const result = resolveDefault(undefined);
        expect(result.value).toBe('');
    });

    it('resolves static default', () => {
        const result = resolveDefault({ type: 'static', value: '3000' });
        expect(result.value).toBe('3000');
    });

    it('resolves shell command default', () => {
        const result = resolveDefault({ type: 'shell', command: 'echo "test"' });
        expect(result.value).toBe('test');
    });

    it('resolves secret default', () => {
        const result = resolveDefault({ type: 'secret', length: 32 });
        expect(result.value).toHaveLength(32);
        expect(result.value).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('resolves options default with marked choice', () => {
        const result = resolveDefault({
            type: 'options',
            choices: ['dev', 'staging', 'prod'],
            defaultChoice: 'prod',
        });
        expect(result.value).toBe('prod');
    });

    it('resolves options default without marked choice (first option)', () => {
        const result = resolveDefault({
            type: 'options',
            choices: ['dev', 'staging', 'prod'],
        });
        expect(result.value).toBe('dev');
    });

    it('handles shell command errors gracefully', () => {
        const result = resolveDefault({ type: 'shell', command: 'nonexistent_cmd_xyz' });
        expect(result.error).toBeDefined();
        expect(result.value).toBe('');
    });
});
