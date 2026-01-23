import * as p from '@clack/prompts';
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { parse, getVariables } from './parser.js';
import { validate } from './template-validator.js';
import { prompt } from './prompter.js';
import { generate, read, write } from './writer.js';
import { mergeTemplates } from './merger.js';

interface CliOptions {
    input: string[];
    output: string;
    defaults: boolean;
    overwrite: boolean;
    dryRun: boolean;
    quiet: boolean;
}

function collect(value: string, previous: string[]): string[] {
    return previous.concat([value]);
}

async function run(options: CliOptions): Promise<void> {
    try {
        if (!options.quiet) {
            p.intro('envfill');
        }

        // Default to .env.template if no inputs
        const inputs = options.input.length > 0 ? options.input : ['.env.template'];

        // Check all files exist upfront
        const missingFiles = inputs.filter(f => !existsSync(f));
        if (missingFiles.length > 0) {
            p.log.error(`Template file${missingFiles.length > 1 ? 's' : ''} not found: ${missingFiles.join(', ')}`);
            process.exit(1);
        }

        // Parse all templates and merge
        const templateInputs = inputs.map(file => ({
            template: parse(readFileSync(file, 'utf-8')),
            filename: file,
        }));
        const template = mergeTemplates(templateInputs);

        const errors = validate(template);
        if (errors.length > 0) {
            p.log.error('Template validation errors:');
            for (const error of errors) {
                p.log.error(`  ${error}`);
            }
            process.exit(1);
        }

        const variables = getVariables(template);
        if (variables.length === 0) {
            p.log.warn('No variables found in template');
            process.exit(0);
        }

        const existingValues = options.overwrite ? new Map<string, string>() : read(options.output);

        const result = await prompt(template, {
            useDefaults: options.defaults,
            existingValues,
            merge: !options.overwrite,
            quiet: options.quiet,
        });

        if (result === null) {
            process.exit(1);
        }

        const stats = result.stats;

        // Find extra variables (in existing .env but not in template)
        const templateNames = new Set(variables.map(v => v.name));
        const extraVariables: Array<{ name: string; value: string }> = [];
        for (const [name, value] of existingValues) {
            if (!templateNames.has(name)) {
                extraVariables.push({ name, value });
            }
        }

        // Build resolved values map
        const values = new Map(result.variables.map(v => [v.name, v.value]));
        const content = generate(template, values, extraVariables);

        if (options.dryRun) {
            if (!options.quiet) {
                p.log.step('Preview:');
            }
            console.log(content);
        } else {
            write(options.output, content);
            if (!options.quiet) {
                const parts: string[] = [];
                if (stats.prompted > 0) parts.push(`${stats.prompted} prompted`);
                if (stats.kept > 0) parts.push(`${stats.kept} kept`);
                if (stats.defaults > 0) parts.push(`${stats.defaults} defaults`);
                if (stats.generated > 0) parts.push(`${stats.generated} generated`);
                if (stats.skipped > 0) parts.push(`${stats.skipped} skipped`);
                if (extraVariables.length > 0) parts.push(`${extraVariables.length} extra`);
                const summary = parts.length > 0 ? ` (${parts.join(', ')})` : '';
                p.outro(`Wrote ${result.variables.length + extraVariables.length} variables to ${options.output}${summary}`);
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        p.log.error(message);
        process.exit(1);
    }
}

const program = new Command();

program
    .name('envfill')
    .description('Interactive CLI to populate .env files from templates')
    .version('1.0.0')
    .option('-i, --input <file>', 'Template file (can be repeated, later overrides earlier)', collect, [])
    .option('-o, --output <file>', 'Output file to write', '.env')
    .option('--defaults', 'Use all default values without prompting', false)
    .option('--overwrite', 'Re-prompt for all variables (ignore existing values)', false)
    .option('--dry-run', 'Preview output without writing to file', false)
    .option('-q, --quiet', 'Minimal output', false)
    .action(run);

program.parse();
