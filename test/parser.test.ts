import { parseTemplate, validateTemplate } from '../src/parser.js';

describe('parseTemplate', () => {
    describe('basic variable parsing', () => {
        it('parses a simple variable with static default', () => {
            const result = parseTemplate('PORT=3000');
            expect(result.variables).toHaveLength(1);
            expect(result.variables[0]).toEqual({
                name: 'PORT',
                lineNumber: 1,
                directives: [],
                default: { type: 'static', value: '3000' },
            });
        });

        it('parses a variable with no default', () => {
            const result = parseTemplate('API_KEY=');
            expect(result.variables).toHaveLength(1);
            expect(result.variables[0]).toEqual({
                name: 'API_KEY',
                lineNumber: 1,
                directives: [],
            });
        });

        it('parses a variable with description comment', () => {
            const result = parseTemplate('# Your API key\nAPI_KEY=');
            expect(result.variables).toHaveLength(1);
            expect(result.variables[0]).toEqual({
                name: 'API_KEY',
                lineNumber: 2,
                directives: [],
                description: 'Your API key',
            });
        });

        it('parses multi-line comments and joins them with newlines', () => {
            const result = parseTemplate('# First line of description\n# Second line of description\nAPI_KEY=');
            expect(result.variables).toHaveLength(1);
            expect(result.variables[0]).toEqual({
                name: 'API_KEY',
                lineNumber: 3,
                directives: [],
                description: 'First line of description\nSecond line of description',
            });
        });
    });

    describe('shell command parsing', () => {
        it('parses shell command default', () => {
            const result = parseTemplate('UID=`id -u`');
            expect(result.variables).toHaveLength(1);
            expect(result.variables[0]?.default).toEqual({
                type: 'shell',
                command: 'id -u',
            });
        });

        it('parses shell command with pipes', () => {
            const result = parseTemplate('GIT_BRANCH=`git branch --show-current`');
            expect(result.variables[0]?.default).toEqual({
                type: 'shell',
                command: 'git branch --show-current',
            });
        });
    });

    describe('directive parsing', () => {
        it('parses secret directive', () => {
            const result = parseTemplate('PASSWORD=<secret:32>');
            expect(result.variables[0]?.default).toEqual({
                type: 'secret',
                length: 32,
            });
        });

        it('parses secret directive with different lengths', () => {
            const result = parseTemplate('TOKEN=<secret:64>');
            expect(result.variables[0]?.default).toEqual({
                type: 'secret',
                length: 64,
            });
        });

        it('parses options directive', () => {
            const result = parseTemplate('ENV=<dev|staging|prod>');
            expect(result.variables[0]?.default).toEqual({
                type: 'options',
                choices: ['dev', 'staging', 'prod'],
                defaultChoice: undefined,
            });
        });

        it('parses options directive with default marked by *', () => {
            const result = parseTemplate('ENV=<dev|staging|*prod>');
            expect(result.variables[0]?.default).toEqual({
                type: 'options',
                choices: ['dev', 'staging', 'prod'],
                defaultChoice: 'prod',
            });
        });

        it('parses required directive', () => {
            const result = parseTemplate('URL=<required>');
            expect(result.variables[0]?.directives).toEqual(['required']);
            expect(result.variables[0]?.default).toBeUndefined();
        });

        it('parses url directive', () => {
            const result = parseTemplate('ENDPOINT=<url>');
            expect(result.variables[0]?.directives).toEqual(['url']);
        });

        it('parses email directive', () => {
            const result = parseTemplate('CONTACT=<email>');
            expect(result.variables[0]?.directives).toEqual(['email']);
        });

        it('parses port directive', () => {
            const result = parseTemplate('HTTP_PORT=<port>');
            expect(result.variables[0]?.directives).toEqual(['port']);
        });

        it('parses number directive', () => {
            const result = parseTemplate('COUNT=<number>');
            expect(result.variables[0]?.directives).toEqual(['number']);
        });

        it('parses boolean directive', () => {
            const result = parseTemplate('DEBUG=<boolean>');
            expect(result.variables[0]?.directives).toEqual(['boolean']);
        });

        it('parses combined directives', () => {
            const result = parseTemplate('URL=<required,url>');
            expect(result.variables[0]?.directives).toEqual(['required', 'url']);
        });

        it('parses required email directive', () => {
            const result = parseTemplate('EMAIL=<required,email>');
            expect(result.variables[0]?.directives).toEqual(['required', 'email']);
        });
    });

    describe('section parsing', () => {
        it('parses section headers', () => {
            const template = `# --- Database ---
DB_HOST=localhost

# --- Application ---
APP_PORT=3000`;

            const result = parseTemplate(template);
            expect(result.sections).toEqual(['Database', 'Application']);
            expect(result.variables[0]?.section).toBe('Database');
            expect(result.variables[1]?.section).toBe('Application');
        });

        it('handles section header with extra whitespace', () => {
            const result = parseTemplate('#   ---   My Section   ---  \nVAR=value');
            expect(result.sections).toEqual(['My Section']);
        });
    });

    describe('complex template parsing', () => {
        it('parses a full example template', () => {
            const template = `# --- Docker Configuration ---

# Your user ID for Docker containers
DOCKER_UID=\`id -u\`

# Your group ID for Docker containers
DOCKER_GID=\`id -g\`

# --- Database ---

# PostgreSQL database password
APP_DB_PASSWORD=<secret:32>

# Database port
APP_DB_PORT=5432

# --- Application ---

# Public URL for the application
PUBLIC_URL=<required,url>

# Contact email for the application
ADMIN_EMAIL=<required,email>

# Deployment environment
NODE_ENV=<development|staging|*production>

# Enable debug logging
DEBUG=<boolean>`;

            const result = parseTemplate(template);

            expect(result.sections).toEqual(['Docker Configuration', 'Database', 'Application']);
            expect(result.variables).toHaveLength(8);

            expect(result.variables[0]).toMatchObject({
                name: 'DOCKER_UID',
                description: 'Your user ID for Docker containers',
                section: 'Docker Configuration',
                default: { type: 'shell', command: 'id -u' },
            });

            expect(result.variables[2]).toMatchObject({
                name: 'APP_DB_PASSWORD',
                description: 'PostgreSQL database password',
                section: 'Database',
                default: { type: 'secret', length: 32 },
            });

            expect(result.variables[4]).toMatchObject({
                name: 'PUBLIC_URL',
                description: 'Public URL for the application',
                directives: ['required', 'url'],
            });

            expect(result.variables[6]).toMatchObject({
                name: 'NODE_ENV',
                default: {
                    type: 'options',
                    choices: ['development', 'staging', 'production'],
                    defaultChoice: 'production',
                },
            });
        });
    });

    describe('edge cases', () => {
        it('ignores empty lines', () => {
            const result = parseTemplate('\n\nPORT=3000\n\n');
            expect(result.variables).toHaveLength(1);
        });

        it('ignores blank comment lines', () => {
            const result = parseTemplate('#\nPORT=3000');
            expect(result.variables[0]?.description).toBeUndefined();
        });

        it('clears pending description after non-consecutive comment', () => {
            const result = parseTemplate('# First comment\n\n# Second comment\nVAR=value');
            expect(result.variables[0]?.description).toBe('Second comment');
        });

        it('handles variable names with underscores', () => {
            const result = parseTemplate('MY_LONG_VARIABLE_NAME=value');
            expect(result.variables[0]?.name).toBe('MY_LONG_VARIABLE_NAME');
        });

        it('handles variable names with numbers', () => {
            const result = parseTemplate('VAR2=value');
            expect(result.variables[0]?.name).toBe('VAR2');
        });
    });
});

describe('validateTemplate', () => {
    it('returns no errors for valid template', () => {
        const template = parseTemplate('URL=<required,url>\nPORT=3000');
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(0);
    });

    it('rejects boolean combined with other directives', () => {
        const template = parseTemplate('VAR=<boolean,required>');
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('boolean directive cannot be combined');
    });

    it('rejects url combined with email', () => {
        const template = parseTemplate('VAR=<url,email>');
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('url and email directives cannot be combined');
    });

    it('rejects port combined with number', () => {
        const template = parseTemplate('VAR=<port,number>');
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('redundant');
    });

    it('rejects options with validation directives', () => {
        const template = {
            variables: [{
                name: 'VAR',
                lineNumber: 1,
                default: { type: 'options' as const, choices: ['a', 'b'] },
                directives: ['url' as const],
            }],
            sections: [],
        };
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('options cannot be combined with validation directives');
    });

    it('allows options with required directive', () => {
        const template = {
            variables: [{
                name: 'VAR',
                lineNumber: 1,
                default: { type: 'options' as const, choices: ['a', 'b'] },
                directives: ['required' as const],
            }],
            sections: [],
        };
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(0);
    });

    it('rejects secret with directives', () => {
        const template = {
            variables: [{
                name: 'VAR',
                lineNumber: 1,
                default: { type: 'secret' as const, length: 32 },
                directives: ['required' as const],
            }],
            sections: [],
        };
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('secret cannot be combined with directives');
    });
});
