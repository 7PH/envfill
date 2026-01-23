import type { Transform } from './types.js';

/**
 * Apply a sequence of transforms to a value.
 * Transforms are applied left-to-right in order.
 */
export function applyTransforms(value: string, transforms: Transform[]): string {
    let result = value;

    for (const transform of transforms) {
        switch (transform.type) {
            case 'lowercase':
                result = result.toLowerCase();
                break;

            case 'uppercase':
                result = result.toUpperCase();
                break;

            case 'replace': {
                const regex = new RegExp(transform.pattern, transform.flags);
                result = result.replace(regex, transform.replacement);
                break;
            }

            case 'trim': {
                const chars = transform.chars;
                const escapedChars = chars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const trimRegex = new RegExp(`^[${escapedChars}]+|[${escapedChars}]+$`, 'g');
                result = result.replace(trimRegex, '');
                break;
            }

            case 'slugify':
                // Equivalent to: <lowercase,replace:/[^a-z0-9]+/-/g,trim:->
                result = result.toLowerCase();
                result = result.replace(/[^a-z0-9]+/g, '-');
                result = result.replace(/^-+|-+$/g, '');
                break;
        }
    }

    return result;
}
