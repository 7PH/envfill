import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { ParsedTemplate } from './types.js';

export function escapeValue(value: string): string {
    if (value === '') {
        return '';
    }

    if (value.includes('\n') || value.includes('"') || value.includes("'") || value.includes(' ') || value.includes('#') || value.includes('$')) {
        const escaped = value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$');
        return `"${escaped}"`;
    }

    return value;
}

/**
 * Generate .env content from a parsed template and resolved values.
 * Preserves exact formatting through the block-based AST.
 */
export function generate(
    template: ParsedTemplate,
    values: Map<string, string>,
    extraVariables?: Array<{ name: string; value: string }>
): string {
    const output: string[] = [];

    for (const node of template.nodes) {
        switch (node.type) {
        case 'whitespace':
            for (let i = 0; i < node.count; i++) {
                output.push('');
            }
            break;

        case 'section':
            output.push(node.line);
            break;

        case 'content':
            output.push(...node.lines);
            break;

        case 'variable': {
            // Output description lines (all lines except the last)
            output.push(...node.lines.slice(0, -1));
            // Output variable with resolved value
            const value = values.get(node.variable.name) ?? '';
            output.push(`${node.variable.name}=${escapeValue(value)}`);
            break;
        }
        }
    }

    // Append extra variables from existing .env
    if (extraVariables?.length) {
        output.push('');
        output.push('# --- Extra (not in template) ---');
        for (const v of extraVariables) {
            output.push(`${v.name}=${escapeValue(v.value)}`);
        }
    }

    return output.join('\n');
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

            value = value.replace(/\\"/g, '"').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');

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
