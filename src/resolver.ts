import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { DefaultValue, ResolveResult } from './types.js';

/** Pattern for ${VAR} variable interpolation references */
export const INTERPOLATION_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

/** Charset presets for secret generation */
const CHARSET_PRESETS: Record<string, string> = {
    alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    num: '0123456789',
    hex: '0123456789abcdef',
    HEX: '0123456789ABCDEF',
    special: '!@#$%^&*()-_=+',
};

function expandCharset(charsetStr: string | undefined): string {
    if (!charsetStr) return CHARSET_PRESETS['alnum']!;

    const parts = charsetStr.split('+');
    let result = '';

    for (const part of parts) {
        const preset = CHARSET_PRESETS[part];
        if (!preset) {
            throw new Error(`Unknown charset preset: ${part}`);
        }
        result += preset;
    }

    // Remove duplicates while preserving order
    return [...new Set(result)].join('');
}

export function executeShellCommand(command: string): ResolveResult {
    try {
        const output = execSync(command, {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { value: output.trim() };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { value: '', error: `Shell command failed: ${message}` };
    }
}

export function generateSecret(length: number, charset?: string): string {
    const chars = expandCharset(charset);
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
        const byte = bytes[i];
        if (byte !== undefined) {
            result += chars[byte % chars.length];
        }
    }

    return result;
}

/**
 * Resolve a default value to its actual string.
 * Executes shell commands, generates secrets, extracts options.
 */
export function resolve(defaultValue: DefaultValue | undefined): ResolveResult {
    if (!defaultValue) {
        return { value: '' };
    }

    switch (defaultValue.type) {
    case 'static':
        return { value: defaultValue.value };

    case 'shell':
        return executeShellCommand(defaultValue.command);

    case 'secret':
        return { value: generateSecret(defaultValue.length, defaultValue.charset) };

    case 'options':
        return { value: defaultValue.defaultChoice ?? defaultValue.choices[0] ?? '' };
    }
}

/**
 * Replace ${VAR} references with their resolved values.
 */
export function interpolate(
    value: string,
    resolvedValues: Map<string, string>
): ResolveResult {
    const pattern = new RegExp(INTERPOLATION_PATTERN.source, 'g');
    let result = value;
    let match;

    while ((match = pattern.exec(value)) !== null) {
        const varName = match[1];
        if (!varName) continue;
        const resolved = resolvedValues.get(varName);
        if (resolved === undefined) {
            return { value: '', error: `Undefined variable: ${varName}` };
        }
        result = result.replace(match[0], resolved);
    }

    return { value: result };
}
