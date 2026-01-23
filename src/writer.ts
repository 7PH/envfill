import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { ResolvedVariable } from './types.js';

function escapeValue(value: string): string {
    if (value === '') {
        return '';
    }

    if (value.includes('\n') || value.includes('"') || value.includes("'") || value.includes(' ') || value.includes('#')) {
        const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escaped}"`;
    }

    return value;
}

/**
 * Generate .env file content from resolved variables.
 */
export function generate(variables: ResolvedVariable[]): string {
    const lines: string[] = [];
    let currentSection: string | undefined;
    let hasOutputtedAny = false;

    for (const variable of variables) {
        if (variable.section && variable.section !== currentSection) {
            if (hasOutputtedAny) {
                lines.push('');
            }
            currentSection = variable.section;
            lines.push(`# --- ${currentSection} ---`);
        }

        const escapedValue = escapeValue(variable.value);
        lines.push(`${variable.name}=${escapedValue}`);
        hasOutputtedAny = true;
    }

    return lines.join('\n') + '\n';
}

export function read(filePath: string): Map<string, string> {
    const values = new Map<string, string>();

    if (!existsSync(filePath)) {
        return values;
    }

    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            const equalsIndex = trimmed.indexOf('=');
            if (equalsIndex === -1) {
                continue;
            }

            const name = trimmed.slice(0, equalsIndex);
            let value = trimmed.slice(equalsIndex + 1);

            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            value = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

            values.set(name, value);
        }
    } catch {
        // File doesn't exist or can't be read
    }

    return values;
}

export function write(filePath: string, content: string): void {
    try {
        writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to write env file "${filePath}": ${message}`);
    }
}
