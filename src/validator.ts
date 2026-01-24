import type { EnvVariable, RegexDirective, IntegerDirective, ValidationResult } from './types.js';

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

export function validateRegex(value: string, regex: RegexDirective): ValidationResult {
    const re = new RegExp(regex.pattern, regex.flags);
    if (re.test(value)) {
        return { valid: true };
    }
    const patternStr = `/${regex.pattern}/${regex.flags}`;
    const error = regex.errorMessage
        ? `${regex.errorMessage} (${patternStr})`
        : `Value does not match pattern: ${patternStr}`;
    return { valid: false, error };
}

export function validateInteger(value: string, directive: IntegerDirective): ValidationResult {
    if (!/^-?\d+$/.test(value)) {
        return { valid: false, error: 'Please enter a valid integer' };
    }
    const num = parseInt(value, 10);
    if (directive.min !== undefined && num < directive.min) {
        return { valid: false, error: `Value must be at least ${directive.min}` };
    }
    if (directive.max !== undefined && num > directive.max) {
        return { valid: false, error: `Value must be at most ${directive.max}` };
    }
    return { valid: true };
}

export function createValidator(variable: EnvVariable): (value: string) => ValidationResult {
    return (value: string): ValidationResult => {
        if (variable.directives.includes('required')) {
            const requiredResult = validateRequired(value);
            if (!requiredResult.valid) {
                return requiredResult;
            }
        } else if (value.trim() === '') {
            return { valid: true };
        }

        if (variable.directives.includes('url')) {
            const urlResult = validateUrl(value);
            if (!urlResult.valid) {
                return urlResult;
            }
        }

        if (variable.directives.includes('email')) {
            const emailResult = validateEmail(value);
            if (!emailResult.valid) {
                return emailResult;
            }
        }

        if (variable.directives.includes('port')) {
            const portResult = validatePort(value);
            if (!portResult.valid) {
                return portResult;
            }
        }

        if (variable.directives.includes('number')) {
            const numberResult = validateNumber(value);
            if (!numberResult.valid) {
                return numberResult;
            }
        }

        if (variable.integer) {
            const integerResult = validateInteger(value, variable.integer);
            if (!integerResult.valid) {
                return integerResult;
            }
        }

        if (variable.regex) {
            const regexResult = validateRegex(value, variable.regex);
            if (!regexResult.valid) {
                return regexResult;
            }
        }

        return { valid: true };
    };
}
