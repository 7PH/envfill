import {
    validateUrl,
    validateEmail,
    validatePort,
    validateNumber,
    normalizeBoolean,
    validateRequired,
    createValidator,
} from '../src/validator.js';

describe('validateUrl', () => {
    it('accepts valid HTTPS URL', () => {
        expect(validateUrl('https://example.com').valid).toBe(true);
    });

    it('accepts valid HTTP URL', () => {
        expect(validateUrl('http://localhost:3000').valid).toBe(true);
    });

    it('accepts URL with path', () => {
        expect(validateUrl('https://example.com/path/to/resource').valid).toBe(true);
    });

    it('accepts URL with query params', () => {
        expect(validateUrl('https://example.com?foo=bar').valid).toBe(true);
    });

    it('rejects invalid URL', () => {
        const result = validateUrl('not-a-url');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('rejects empty string', () => {
        expect(validateUrl('').valid).toBe(false);
    });

    it('rejects URL without protocol', () => {
        expect(validateUrl('example.com').valid).toBe(false);
    });
});

describe('validateEmail', () => {
    it('accepts valid email', () => {
        expect(validateEmail('test@example.com').valid).toBe(true);
    });

    it('accepts email with subdomain', () => {
        expect(validateEmail('user@mail.example.com').valid).toBe(true);
    });

    it('accepts email with plus', () => {
        expect(validateEmail('user+tag@example.com').valid).toBe(true);
    });

    it('rejects email without @', () => {
        expect(validateEmail('userexample.com').valid).toBe(false);
    });

    it('rejects email without domain', () => {
        expect(validateEmail('user@').valid).toBe(false);
    });

    it('rejects email without TLD', () => {
        expect(validateEmail('user@example').valid).toBe(false);
    });

    it('rejects empty string', () => {
        expect(validateEmail('').valid).toBe(false);
    });
});

describe('validatePort', () => {
    it('accepts valid port', () => {
        expect(validatePort('3000').valid).toBe(true);
    });

    it('accepts port 1', () => {
        expect(validatePort('1').valid).toBe(true);
    });

    it('accepts port 65535', () => {
        expect(validatePort('65535').valid).toBe(true);
    });

    it('rejects port 0', () => {
        expect(validatePort('0').valid).toBe(false);
    });

    it('rejects port above 65535', () => {
        expect(validatePort('65536').valid).toBe(false);
    });

    it('rejects non-numeric port', () => {
        expect(validatePort('abc').valid).toBe(false);
    });

    it('rejects negative port', () => {
        expect(validatePort('-1').valid).toBe(false);
    });

    it('rejects decimal port', () => {
        expect(validatePort('3000.5').valid).toBe(false);
    });
});

describe('validateNumber', () => {
    it('accepts integer', () => {
        expect(validateNumber('42').valid).toBe(true);
    });

    it('accepts decimal', () => {
        expect(validateNumber('3.14').valid).toBe(true);
    });

    it('accepts negative number', () => {
        expect(validateNumber('-10').valid).toBe(true);
    });

    it('accepts zero', () => {
        expect(validateNumber('0').valid).toBe(true);
    });

    it('rejects non-numeric string', () => {
        expect(validateNumber('abc').valid).toBe(false);
    });

    it('rejects empty string', () => {
        expect(validateNumber('').valid).toBe(false);
    });
});

describe('normalizeBoolean', () => {
    it('returns true for "yes"', () => {
        expect(normalizeBoolean('yes')).toBe(true);
    });

    it('returns true for "YES"', () => {
        expect(normalizeBoolean('YES')).toBe(true);
    });

    it('returns true for "true"', () => {
        expect(normalizeBoolean('true')).toBe(true);
    });

    it('returns true for "1"', () => {
        expect(normalizeBoolean('1')).toBe(true);
    });

    it('returns true for "y"', () => {
        expect(normalizeBoolean('y')).toBe(true);
    });

    it('returns false for "no"', () => {
        expect(normalizeBoolean('no')).toBe(false);
    });

    it('returns false for "false"', () => {
        expect(normalizeBoolean('false')).toBe(false);
    });

    it('returns false for "0"', () => {
        expect(normalizeBoolean('0')).toBe(false);
    });

    it('returns false for "n"', () => {
        expect(normalizeBoolean('n')).toBe(false);
    });

    it('returns null for invalid input', () => {
        expect(normalizeBoolean('maybe')).toBe(null);
    });

    it('handles whitespace', () => {
        expect(normalizeBoolean('  yes  ')).toBe(true);
    });
});

describe('validateRequired', () => {
    it('accepts non-empty string', () => {
        expect(validateRequired('value').valid).toBe(true);
    });

    it('rejects empty string', () => {
        expect(validateRequired('').valid).toBe(false);
    });

    it('rejects whitespace-only string', () => {
        expect(validateRequired('   ').valid).toBe(false);
    });
});

describe('createValidator', () => {
    it('creates validator that checks required', () => {
        const validate = createValidator(['required']);
        expect(validate('').valid).toBe(false);
        expect(validate('value').valid).toBe(true);
    });

    it('creates validator that checks URL', () => {
        const validate = createValidator(['url']);
        expect(validate('not-a-url').valid).toBe(false);
        expect(validate('https://example.com').valid).toBe(true);
    });

    it('creates validator that allows empty when not required', () => {
        const validate = createValidator(['url']);
        expect(validate('').valid).toBe(true);
    });

    it('creates validator with combined directives', () => {
        const validate = createValidator(['required', 'url']);
        expect(validate('').valid).toBe(false);
        expect(validate('not-a-url').valid).toBe(false);
        expect(validate('https://example.com').valid).toBe(true);
    });

    it('creates validator for email', () => {
        const validate = createValidator(['required', 'email']);
        expect(validate('').valid).toBe(false);
        expect(validate('not-an-email').valid).toBe(false);
        expect(validate('test@example.com').valid).toBe(true);
    });

    it('creates validator for port', () => {
        const validate = createValidator(['port']);
        expect(validate('abc').valid).toBe(false);
        expect(validate('3000').valid).toBe(true);
    });

    it('creates validator for number', () => {
        const validate = createValidator(['number']);
        expect(validate('abc').valid).toBe(false);
        expect(validate('42').valid).toBe(true);
    });

    it('returns valid for empty directives', () => {
        const validate = createValidator([]);
        expect(validate('anything').valid).toBe(true);
        expect(validate('').valid).toBe(true);
    });
});
