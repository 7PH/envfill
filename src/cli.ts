import * as p from '@clack/prompts';
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { parseTemplate, validateTemplate } from './parser.js';
import { promptForVariables } from './prompter.js';
import { generateEnvContent, readExistingEnv, writeEnvFile } from './writer.js';

const program = new Command();

program
    .name('envfill')
    .description('Interactive CLI to populate .env files from templates')
    .version('1.0.0')
    .option('-i, --input <file>', 'Template file to read', '.env.template')
    .option('-o, --output <file>', 'Output file to write', '.env')
    .option('--defaults', 'Use all default values without prompting', false)
    .option('--overwrite', 'Re-prompt for all variables (ignore existing values)', false)
    .option('--dry-run', 'Preview output without writing to file', false)
    .option('-q, --quiet', 'Minimal output', false)
    .action(async (options: {
        input: string;
        output: string;
        defaults: boolean;
        overwrite: boolean;
        dryRun: boolean;
        quiet: boolean;
    }) => {
        try {
            if (!options.quiet) {
                p.intro('envfill');
            }

            if (!existsSync(options.input)) {
                p.log.error(`Template file not found: ${options.input}`);
                process.exit(1);
            }

            const templateContent = readFileSync(options.input, 'utf-8');
            const template = parseTemplate(templateContent);

            const errors = validateTemplate(template);
            if (errors.length > 0) {
                p.log.error('Template validation errors:');
                for (const error of errors) {
                    p.log.error(`  ${error}`);
                }
                process.exit(1);
            }

            if (template.variables.length === 0) {
                p.log.warn('No variables found in template');
                process.exit(0);
            }

            const existingValues = options.overwrite ? new Map<string, string>() : readExistingEnv(options.output);

            const result = await promptForVariables(template.variables, {
                useDefaults: options.defaults,
                existingValues,
                merge: !options.overwrite,
                quiet: options.quiet,
            });

            if (result === null) {
                process.exit(1);
            }

            const stats = result.stats;
            let content = generateEnvContent(result.variables);

            // Find and append extraneous variables (in existing .env but not in template)
            const templateNames = new Set(template.variables.map(v => v.name));
            const extraVariables: Array<{ name: string; value: string }> = [];
            for (const [name, value] of existingValues) {
                if (!templateNames.has(name)) {
                    extraVariables.push({ name, value });
                }
            }
            if (extraVariables.length > 0) {
                content += '\n# --- Extra (not in template) ---\n';
                for (const { name, value } of extraVariables) {
                    content += `${name}=${value}\n`;
                }
            }

            if (options.dryRun) {
                if (!options.quiet) {
                    p.log.step('Preview:');
                }
                console.log(content);
            } else {
                writeEnvFile(options.output, content);
                if (!options.quiet) {
                    const parts: string[] = [];
                    if (stats.prompted > 0) parts.push(`${stats.prompted} prompted`);
                    if (stats.kept > 0) parts.push(`${stats.kept} kept`);
                    if (stats.defaults > 0) parts.push(`${stats.defaults} defaults`);
                    if (stats.generated > 0) parts.push(`${stats.generated} generated`);
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
    });

program.parse();
