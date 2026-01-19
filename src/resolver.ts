import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { DefaultValue } from './types.js';

export interface ResolveResult {
    value: string;
    error?: string;
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

export function generateSecret(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
        const byte = bytes[i];
        if (byte !== undefined) {
            result += charset[byte % charset.length];
        }
    }

    return result;
}

export function resolveDefault(defaultValue: DefaultValue | undefined): ResolveResult {
    if (!defaultValue) {
        return { value: '' };
    }

    switch (defaultValue.type) {
    case 'static':
        return { value: defaultValue.value };

    case 'shell':
        return executeShellCommand(defaultValue.command);

    case 'secret':
        return { value: generateSecret(defaultValue.length) };

    case 'options':
        return { value: defaultValue.defaultChoice ?? defaultValue.choices[0] ?? '' };
    }
}
