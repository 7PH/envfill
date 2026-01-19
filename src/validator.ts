import type { DirectiveType } from './types.js';

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export function validateUrl(value: string): ValidationResult {
    try {
        new URL(value);
        return { valid: true };
    } catch {
        return { valid: false, error: 'Please enter a valid URL (e.g., https://example.com)' };
    }
}

export function validateEmail(value: string): ValidationResult {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(value)) {
        return { valid: true };
    }
    return { valid: false, error: 'Please enter a valid email address' };
}

export function validatePort(value: string): ValidationResult {
    if (!/^\d+$/.test(value)) {
        return { valid: false, error: 'Please enter a valid port number (1-65535)' };
    }
    const port = parseInt(value, 10);
    if (port < 1 || port > 65535) {
        return { valid: false, error: 'Please enter a valid port number (1-65535)' };
    }
    return { valid: true };
}

export function validateNumber(value: string): ValidationResult {
    const num = parseFloat(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Please enter a valid number' };
    }
    return { valid: true };
}

export function normalizeBoolean(value: string): boolean | null {
    const normalized = value.toLowerCase().trim();
    if (['yes', 'true', '1', 'y'].includes(normalized)) {
        return true;
    }
    if (['no', 'false', '0', 'n'].includes(normalized)) {
        return false;
    }
    return null;
}

export function validateRequired(value: string): ValidationResult {
    if (value.trim() === '') {
        return { valid: false, error: 'This field is required' };
    }
    return { valid: true };
}

export function createValidator(directives: DirectiveType[]): (value: string) => ValidationResult {
    return (value: string): ValidationResult => {
        if (directives.includes('required')) {
            const requiredResult = validateRequired(value);
            if (!requiredResult.valid) {
                return requiredResult;
            }
        } else if (value.trim() === '') {
            return { valid: true };
        }

        if (directives.includes('url')) {
            const urlResult = validateUrl(value);
            if (!urlResult.valid) {
                return urlResult;
            }
        }

        if (directives.includes('email')) {
            const emailResult = validateEmail(value);
            if (!emailResult.valid) {
                return emailResult;
            }
        }

        if (directives.includes('port')) {
            const portResult = validatePort(value);
            if (!portResult.valid) {
                return portResult;
            }
        }

        if (directives.includes('number')) {
            const numberResult = validateNumber(value);
            if (!numberResult.valid) {
                return numberResult;
            }
        }

        return { valid: true };
    };
}
