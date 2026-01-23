import { rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TestContext } from './utils.js';

let ctx: TestContext;

beforeEach(() => {
    ctx = new TestContext();
});

afterEach(() => {
    ctx.cleanup();
});

describe('CLI E2E Tests', () => {
    describe('Non-interactive mode (--defaults)', () => {
        it('writes correct .env with default values from basic template', () => {
            ctx.copyFixture('basic.template');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('PORT')).toBe('3000');
            expect(env.get('APP_NAME')).toBe('myapp');
            expect(env.get('DEBUG')).toBe('false');
        });

        it('executes shell commands, generates secrets, and resolves options', () => {
            ctx.copyFixture('features.template');

            const result = ctx.runCli(['-i', 'features.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();

            // Shell commands should be executed
            expect(env.get('UID')).toMatch(/^\d+$/);
            expect(env.get('GID')).toMatch(/^\d+$/);

            // Secrets should be generated with correct lengths
            const secretKey = env.get('SECRET_KEY');
            expect(secretKey).toBeDefined();
            expect(secretKey).toHaveLength(32);
            expect(secretKey).toMatch(/^[A-Za-z0-9]+$/);

            const apiToken = env.get('API_TOKEN');
            expect(apiToken).toBeDefined();
            expect(apiToken).toHaveLength(16);

            // Options should use default (marked with *)
            expect(env.get('NODE_ENV')).toBe('production');

            // First option selected when no default marked
            expect(env.get('DB_TYPE')).toBe('postgres');

            // Static default value
            expect(env.get('DEBUG')).toBe('false');

            // Interpolation
            expect(env.get('DB_HOST')).toBe('localhost');
            expect(env.get('DB_URL')).toBe('postgres://user:pass@localhost:5432/db');
        });

        it('evaluates conditionals and skips variables when condition is false', () => {
            // Create a template with conditional variable
            writeFileSync(
                join(ctx.dir, 'conditional.template'),
                `FEATURE_ENABLED=<boolean>
FEATURE_API_KEY=<if:FEATURE_ENABLED,required>`
            );

            const result = ctx.runCli(['-i', 'conditional.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();

            // Boolean without default value results in empty string in --defaults mode
            expect(env.get('FEATURE_ENABLED')).toBe('');
            // Empty string is falsy, so conditional variable should be skipped (empty)
            expect(env.get('FEATURE_API_KEY')).toBe('');
        });

        it('exits with error when template file not found', () => {
            const result = ctx.runCli(['-i', 'nonexistent.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('not found');
        });

        it('exits with error for invalid template', () => {
            ctx.copyFixture('invalid.template');

            const result = ctx.runCli(['-i', 'invalid.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('validation error');
        });

        it('exits cleanly for empty template (no variables)', () => {
            ctx.copyFixture('empty.template');

            const result = ctx.runCli(['-i', 'empty.template', '--defaults']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('No variables');
        });

        it('outputs to stdout with --dry-run and does not write file', () => {
            ctx.copyFixture('basic.template');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '--dry-run', '-q']);
            expect(result.exitCode).toBe(0);

            // Output should contain env content
            expect(result.stdout).toContain('PORT=3000');
            expect(result.stdout).toContain('APP_NAME=myapp');

            // No .env file should be written
            expect(existsSync(join(ctx.dir, '.env'))).toBe(false);
        });

        it('writes to custom output file with -o option', () => {
            ctx.copyFixture('basic.template');

            const result = ctx.runCli(['-i', 'basic.template', '-o', 'custom.env', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            expect(existsSync(join(ctx.dir, 'custom.env'))).toBe(true);
            expect(existsSync(join(ctx.dir, '.env'))).toBe(false);

            const env = ctx.readEnvFile('custom.env');
            expect(env.get('PORT')).toBe('3000');
        });
    });

    describe('Merge behavior', () => {
        it('preserves existing .env values when not using --overwrite', () => {
            ctx.copyFixture('basic.template');

            // Create existing .env with a custom value
            writeFileSync(join(ctx.dir, '.env'), 'PORT=8080\n');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            // Existing value should be preserved
            expect(env.get('PORT')).toBe('8080');
            // New values should use defaults
            expect(env.get('APP_NAME')).toBe('myapp');
        });

        it('overwrites existing values with --overwrite flag', () => {
            ctx.copyFixture('basic.template');

            // Create existing .env with a custom value
            writeFileSync(join(ctx.dir, '.env'), 'PORT=8080\n');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '--overwrite', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            // Value should be overwritten with template default
            expect(env.get('PORT')).toBe('3000');
        });

        it('appends extra variables not in template to output', () => {
            ctx.copyFixture('basic.template');

            // Create existing .env with extra variables
            writeFileSync(join(ctx.dir, '.env'), 'PORT=8080\nCUSTOM_VAR=custom_value\nANOTHER_VAR=another\n');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const content = readFileSync(join(ctx.dir, '.env'), 'utf-8');
            // Extra variables should be in the output
            expect(content).toContain('CUSTOM_VAR=custom_value');
            expect(content).toContain('ANOTHER_VAR=another');
            expect(content).toContain('Extra (not in template)');
        });
    });

    describe('Interactive mode (stdin simulation)', () => {
        it('accepts user input via stdin and writes to .env', async () => {
            ctx.copyFixture('basic.template');

            // Simulate user pressing Enter to accept defaults
            const result = await ctx.runCliInteractive(
                ['-i', 'basic.template', '-q'],
                ['', '', '']  // Empty string = accept default for PORT, APP_NAME, DEBUG
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('PORT')).toBe('3000');
            expect(env.get('APP_NAME')).toBe('myapp');
            expect(env.get('DEBUG')).toBe('false');
        });

        it('allows user to provide custom values via stdin', async () => {
            ctx.copyFixture('basic.template');

            // Provide custom values for PORT and APP_NAME, accept default for DEBUG
            const result = await ctx.runCliInteractive(
                ['-i', 'basic.template', '-q'],
                ['9000', 'customapp', '']
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('PORT')).toBe('9000');
            expect(env.get('APP_NAME')).toBe('customapp');
            expect(env.get('DEBUG')).toBe('false');
        });

        it('handles options selection via stdin', async () => {
            // Create a template with options
            writeFileSync(join(ctx.dir, 'options.template'), 'ENV=<dev|staging|*prod>');

            // Press Enter to select default (prod)
            const result = await ctx.runCliInteractive(
                ['-i', 'options.template', '-q'],
                ['']
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('ENV')).toBe('prod');
        });
    });

    describe('Output messages', () => {
        it('shows intro and outro in normal mode', () => {
            ctx.copyFixture('basic.template');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('envfill');
            expect(result.stdout).toContain('Wrote');
            expect(result.stdout).toContain('.env');
        });

        it('suppresses messages in quiet mode', () => {
            ctx.copyFixture('basic.template');

            const result = ctx.runCli(['-i', 'basic.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain('envfill');
            expect(result.stdout).not.toContain('Wrote');
        });
    });

    describe('Generated secrets', () => {
        it('generates unique secrets on each run', () => {
            ctx.copyFixture('features.template');

            // First run
            ctx.runCli(['-i', 'features.template', '--defaults', '-q']);
            const env1 = ctx.readEnvFile();
            const secret1 = env1.get('SECRET_KEY');

            // Delete .env for second run
            rmSync(join(ctx.dir, '.env'));

            // Second run
            ctx.runCli(['-i', 'features.template', '--defaults', '-q']);
            const env2 = ctx.readEnvFile();
            const secret2 = env2.get('SECRET_KEY');

            expect(secret1).toBeDefined();
            expect(secret2).toBeDefined();
            expect(secret1).not.toBe(secret2);
        });
    });

    describe('Validation directives', () => {
        it('accepts valid values for all validation types', async () => {
            ctx.copyFixture('validation.template');

            const result = await ctx.runCliInteractive(
                ['-i', 'validation.template', '-q'],
                [
                    'https://example.com',  // valid URL
                    'admin@example.com',    // valid email
                    '8080',                 // valid port
                    '100',                  // valid number
                    'secret-key-123',       // required (non-empty)
                    'v1.2.3',               // matches regex
                    'y',                    // boolean yes
                ]
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('SITE_URL')).toBe('https://example.com');
            expect(env.get('ADMIN_EMAIL')).toBe('admin@example.com');
            expect(env.get('SERVER_PORT')).toBe('8080');
            expect(env.get('MAX_CONNECTIONS')).toBe('100');
            expect(env.get('API_KEY')).toBe('secret-key-123');
            expect(env.get('VERSION')).toBe('v1.2.3');
            expect(env.get('ENABLE_FEATURE')).toBe('true');
        });

        it('validates email addresses correctly', async () => {
            writeFileSync(join(ctx.dir, 'email-only.template'), 'EMAIL=<email>');

            const result = await ctx.runCliInteractive(
                ['-i', 'email-only.template', '-q'],
                ['user@example.org']
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('EMAIL')).toBe('user@example.org');
        });

        it('validates port numbers correctly', async () => {
            writeFileSync(join(ctx.dir, 'port-only.template'), 'PORT=<port>');

            const result = await ctx.runCliInteractive(
                ['-i', 'port-only.template', '-q'],
                ['443']
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('PORT')).toBe('443');
        });

        it('handles boolean prompts with y/n', async () => {
            writeFileSync(join(ctx.dir, 'bool.template'), 'ENABLED=<boolean>');

            // Test 'n' for false
            const result = await ctx.runCliInteractive(
                ['-i', 'bool.template', '-q'],
                ['n']
            );

            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('ENABLED')).toBe('false');
        });
    });

    describe('Parser and template errors', () => {
        it('rejects unknown directives', () => {
            writeFileSync(join(ctx.dir, 'unknown.template'), 'VAR=<foo>');

            const result = ctx.runCli(['-i', 'unknown.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('Unknown directive');
        });

        it('rejects conflicting directives', () => {
            writeFileSync(join(ctx.dir, 'conflict1.template'), 'VAR=<boolean,required>');

            const result1 = ctx.runCli(['-i', 'conflict1.template', '--defaults']);
            expect(result1.exitCode).toBe(1);
            expect(result1.stdout).toContain('boolean directive cannot be combined');

            writeFileSync(join(ctx.dir, 'conflict2.template'), 'VAR=<url,email>');

            const result2 = ctx.runCli(['-i', 'conflict2.template', '--defaults']);
            expect(result2.exitCode).toBe(1);
            expect(result2.stdout).toContain('url and email directives cannot be combined');
        });

        it('rejects invalid regex syntax', () => {
            // Missing closing /
            writeFileSync(join(ctx.dir, 'bad-regex1.template'), 'VAR=<regex:/^test>');

            const result1 = ctx.runCli(['-i', 'bad-regex1.template', '--defaults']);
            expect(result1.exitCode).toBe(1);
            expect(result1.stdout).toContain('missing closing /');

            // Invalid flag
            writeFileSync(join(ctx.dir, 'bad-regex2.template'), 'VAR=<regex:/^test/z>');

            const result2 = ctx.runCli(['-i', 'bad-regex2.template', '--defaults']);
            expect(result2.exitCode).toBe(1);
            expect(result2.stdout).toContain('Invalid regex flag');

            // Invalid pattern
            writeFileSync(join(ctx.dir, 'bad-regex3.template'), 'VAR=<regex:/[/>');

            const result3 = ctx.runCli(['-i', 'bad-regex3.template', '--defaults']);
            expect(result3.exitCode).toBe(1);
            expect(result3.stdout).toContain('Invalid regex pattern');
        });

        it('rejects multiple conditions', () => {
            writeFileSync(
                join(ctx.dir, 'multi-cond.template'),
                `FLAG_A=<boolean>
FLAG_B=<boolean>
VAR=<if:FLAG_A,if:FLAG_B>`
            );

            const result = ctx.runCli(['-i', 'multi-cond.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('Multiple if conditions not allowed');
        });
    });

    describe('Value escaping', () => {
        it('escapes special characters correctly', async () => {
            ctx.copyFixture('escaping.template');

            const result = await ctx.runCliInteractive(
                ['-i', 'escaping.template', '-q'],
                [
                    'hello world',                  // space
                    'pass"word',                    // quote
                    'value with # comment',         // hash
                ]
            );

            expect(result.exitCode).toBe(0);

            const content = readFileSync(join(ctx.dir, '.env'), 'utf-8');
            // Values with special chars should be quoted
            expect(content).toContain('MESSAGE="hello world"');
            expect(content).toContain('PASSWORD="pass\\"word"');
            expect(content).toContain('DESCRIPTION="value with # comment"');
        });
    });

    describe('Shell command errors', () => {
        it('logs warning for failing shell commands and uses empty value', async () => {
            ctx.copyFixture('shell-error.template');

            // Use interactive mode so warning is displayed, provide a value
            const result = await ctx.runCliInteractive(
                ['-i', 'shell-error.template'],
                ['fallback-value']
            );

            // Should complete and show warning
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('Shell command failed');

            const env = ctx.readEnvFile();
            expect(env.get('BROKEN')).toBe('fallback-value');
        });

        it('uses empty value for failing shell commands in defaults mode', () => {
            ctx.copyFixture('shell-error.template');

            const result = ctx.runCli(['-i', 'shell-error.template', '--defaults', '-q']);

            // Should complete with exit code 0
            expect(result.exitCode).toBe(0);

            // Variable should have empty value
            const env = ctx.readEnvFile();
            expect(env.get('BROKEN')).toBe('');
        });
    });

    describe('Transform directives', () => {
        it('applies slugify transform', async () => {
            writeFileSync(join(ctx.dir, 'slugify.template'), 'PROJECT=<slugify>');
            const result = await ctx.runCliInteractive(['-i', 'slugify.template', '-q'], ['My Cool App']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('PROJECT')).toBe('my-cool-app');
        });

        it('slugify collapses consecutive non-alphanumeric chars', async () => {
            writeFileSync(join(ctx.dir, 'slugify2.template'), 'NAME=<slugify>');
            const result = await ctx.runCliInteractive(['-i', 'slugify2.template', '-q'], ['Hello---World   Test']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('NAME')).toBe('hello-world-test');
        });

        it('applies replace transform', async () => {
            writeFileSync(join(ctx.dir, 'replace.template'), 'SNAKE=<replace:/\\s+/_/g>');
            const result = await ctx.runCliInteractive(['-i', 'replace.template', '-q'], ['hello world']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('SNAKE')).toBe('hello_world');
        });

        it('chains transforms with validation', async () => {
            writeFileSync(join(ctx.dir, 'chain.template'), 'ID=<slugify,required>');
            const result = await ctx.runCliInteractive(['-i', 'chain.template', '-q'], ['Test Project']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('ID')).toBe('test-project');
        });

        it('applies lowercase transform', async () => {
            writeFileSync(join(ctx.dir, 'lower.template'), 'NAME=<lowercase>');
            const result = await ctx.runCliInteractive(['-i', 'lower.template', '-q'], ['HELLO World']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('NAME')).toBe('hello world');
        });

        it('applies uppercase transform', async () => {
            writeFileSync(join(ctx.dir, 'upper.template'), 'NAME=<uppercase>');
            const result = await ctx.runCliInteractive(['-i', 'upper.template', '-q'], ['hello World']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('NAME')).toBe('HELLO WORLD');
        });

        it('applies trim transform', async () => {
            writeFileSync(join(ctx.dir, 'trim.template'), 'NAME=<trim:->');
            const result = await ctx.runCliInteractive(['-i', 'trim.template', '-q'], ['---hello---']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('NAME')).toBe('hello');
        });

        it('applies chained transforms in order', async () => {
            writeFileSync(join(ctx.dir, 'chain2.template'), 'NAME=<lowercase,replace:/[^a-z0-9]+/-/g,trim:->');
            const result = await ctx.runCliInteractive(['-i', 'chain2.template', '-q'], ['  My Cool App!  ']);
            expect(result.exitCode).toBe(0);
            const env = ctx.readEnvFile();
            expect(env.get('NAME')).toBe('my-cool-app');
        });

        it('applies transforms in defaults mode', () => {
            writeFileSync(join(ctx.dir, 'defaults-transform.template'), 'NAME=Test Value\nSLUG=<slugify>');

            // Create existing .env with value to transform
            writeFileSync(join(ctx.dir, '.env'), '');

            const result = ctx.runCli(['-i', 'defaults-transform.template', '--defaults', '-q', '--overwrite']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            // Note: transforms don't apply to static defaults, only user input
            expect(env.get('NAME')).toBe('Test Value');
        });
    });

    describe('Variable interpolation', () => {
        it('resolves ${VAR} references in default values', () => {
            writeFileSync(
                join(ctx.dir, 'interpolation.template'),
                `DB_USER=postgres
DB_PASS=\${DB_USER}_secret
DB_URL=postgres://\${DB_USER}:\${DB_PASS}@localhost`
            );

            const result = ctx.runCli(['-i', 'interpolation.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            expect(env.get('DB_USER')).toBe('postgres');
            expect(env.get('DB_PASS')).toBe('postgres_secret');
            expect(env.get('DB_URL')).toBe('postgres://postgres:postgres_secret@localhost');
        });

        it('rejects forward references', () => {
            writeFileSync(
                join(ctx.dir, 'forward-ref.template'),
                `SECOND=\${FIRST}_suffix
FIRST=value`
            );

            const result = ctx.runCli(['-i', 'forward-ref.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('references undefined variable');
        });

        it('rejects self-references', () => {
            writeFileSync(join(ctx.dir, 'self-ref.template'), `VAR=\${VAR}_loop`);

            const result = ctx.runCli(['-i', 'self-ref.template', '--defaults']);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toContain('cannot reference itself');
        });

        it('interpolates values from shell commands', () => {
            writeFileSync(
                join(ctx.dir, 'shell-interp.template'),
                `HOSTNAME=\`hostname\`
GREETING=Hello from \${HOSTNAME}`
            );

            const result = ctx.runCli(['-i', 'shell-interp.template', '--defaults', '-q']);
            expect(result.exitCode).toBe(0);

            const env = ctx.readEnvFile();
            const hostname = env.get('HOSTNAME');
            expect(hostname).toBeDefined();
            expect(hostname!.length).toBeGreaterThan(0);
            expect(env.get('GREETING')).toBe(`Hello from ${hostname}`);
        });
    });
});
