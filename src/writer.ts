import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { ResolvedVariable } from './types.js';

// Exported for use in generateFromTemplate
export function escapeValue(value: string): string {
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

    for (const variable of variables) {
        // Section header with blank line after
        if (variable.section && variable.section !== currentSection) {
            if (currentSection !== undefined) {
                // Previous variable already added a blank line
            }
            currentSection = variable.section;
            lines.push(`# --- ${currentSection} ---`);
            lines.push('');  // blank line after section header
        }

        // Description comment(s) directly above variable
        if (variable.description) {
            for (const line of variable.description.split('\n')) {
                lines.push(`# ${line}`);
            }
        }

        // Variable line
        const escapedValue = escapeValue(variable.value);
        lines.push(`${variable.name}=${escapedValue}`);

        // Blank line after each variable
        lines.push('');
    }

    // Remove trailing blank line, then add final newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines.join('\n') + '\n';
}

/**
 * Generate .env content by replacing values in the original template.
 * Preserves all comments, whitespace, and formatting.
 */
export function generateFromTemplate(
    templateContent: string,
    values: Map<string, string>,
    extraVariables?: Array<{ name: string; value: string }>
): string {
    const lines = templateContent.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (match && match[1]) {
            const name = match[1];
            const resolvedValue = values.get(name);
            if (resolvedValue !== undefined) {
                result.push(`${name}=${escapeValue(resolvedValue)}`);
                continue;
            }
        }
        result.push(line);
    }

    // Append extra variables not in template
    if (extraVariables?.length) {
        result.push('');
        result.push('# --- Extra (not in template) ---');
        for (const v of extraVariables) {
            result.push(`${v.name}=${escapeValue(v.value)}`);
        }
    }

    return result.join('\n');
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
