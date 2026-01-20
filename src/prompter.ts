import * as p from '@clack/prompts';
import type { EnvVariable, ResolvedVariable, PrompterStats, PrompterResult } from './types.js';
import { resolveDefault } from './resolver.js';
import { createValidator, normalizeBoolean } from './validator.js';

export interface PrompterOptions {
    useDefaults: boolean;
    existingValues: Map<string, string>;
    merge: boolean;
    quiet: boolean;
}

function isUserCancelled(value: unknown): value is symbol {
    return p.isCancel(value);
}

function createResolvedVariable(name: string, value: string, section: string | undefined): ResolvedVariable {
    if (section !== undefined) {
        return { name, value, section };
    }
    return { name, value };
}

function evaluateCondition(
    condition: { variable: string },
    resolvedValues: Map<string, string>
): boolean {
    const conditionValue = resolvedValues.get(condition.variable);
    if (conditionValue === undefined) {
        return true;
    }
    const normalized = normalizeBoolean(conditionValue);
    return normalized === true;
}

export async function promptForVariables(
    variables: EnvVariable[],
    options: PrompterOptions
): Promise<PrompterResult | null> {
    const results: ResolvedVariable[] = [];
    const resolvedValues = new Map<string, string>();
    const stats: PrompterStats = { prompted: 0, defaults: 0, kept: 0, generated: 0, skipped: 0 };
    let currentSection: string | undefined;

    for (const variable of variables) {
        if (options.merge && options.existingValues.has(variable.name)) {
            const existingValue = options.existingValues.get(variable.name);
            if (existingValue !== undefined) {
                results.push(createResolvedVariable(variable.name, existingValue, variable.section));
                resolvedValues.set(variable.name, existingValue);
                stats.kept++;
                continue;
            }
        }

        if (variable.condition && !evaluateCondition(variable.condition, resolvedValues)) {
            results.push(createResolvedVariable(variable.name, '', variable.section));
            resolvedValues.set(variable.name, '');
            stats.skipped++;
            continue;
        }

        if (variable.section && variable.section !== currentSection) {
            currentSection = variable.section;
            if (!options.quiet) {
                p.log.step(`\n${currentSection}`);
            }
        }

        const resolved = resolveDefault(variable.default);

        if (variable.default?.type === 'secret') {
            if (!options.quiet) {
                const description = variable.description ?? variable.name;
                p.log.info(`${description}: Generated ${variable.default.length}-char secret`);
            }
            results.push(createResolvedVariable(variable.name, resolved.value, variable.section));
            resolvedValues.set(variable.name, resolved.value);
            stats.generated++;
            continue;
        }

        if (options.useDefaults) {
            if (variable.directives.includes('required') && resolved.value === '') {
                p.log.error(`${variable.name} is required but has no default value`);
                return null;
            }
            results.push(createResolvedVariable(variable.name, resolved.value, variable.section));
            resolvedValues.set(variable.name, resolved.value);
            stats.defaults++;
            continue;
        }

        const value = await promptForVariable(variable, resolved.value, resolved.error);

        if (isUserCancelled(value)) {
            p.cancel('Operation cancelled');
            return null;
        }

        results.push(createResolvedVariable(variable.name, value, variable.section));
        resolvedValues.set(variable.name, value);
        stats.prompted++;
    }

    return { variables: results, stats };
}

async function promptForVariable(
    variable: EnvVariable,
    defaultValue: string,
    resolveError?: string
): Promise<string | symbol> {
    let message = variable.description ?? variable.name;

    // Add bar prefix to continuation lines so they render with clack's sidebar
    if (message.includes('\n')) {
        message = message.replace(/\n/g, '\n│  ');
    }

    if (resolveError) {
        p.log.warn(`${variable.name}: ${resolveError}`);
    }

    if (variable.directives.includes('boolean')) {
        const result = await p.confirm({
            message,
            initialValue: defaultValue === 'true' || defaultValue === '1' || defaultValue === 'yes',
        });

        if (isUserCancelled(result)) {
            return result;
        }

        return result ? 'true' : 'false';
    }

    if (variable.default?.type === 'options') {
        const optionsDefault = variable.default;
        const result = await p.select({
            message,
            options: optionsDefault.choices.map(choice => ({
                value: choice,
                label: choice,
            })),
            initialValue: optionsDefault.defaultChoice ?? optionsDefault.choices[0],
        });

        if (isUserCancelled(result)) {
            return result;
        }

        return result as string;
    }

    const validator = createValidator(variable.directives);

    const textOptions: Parameters<typeof p.text>[0] = {
        message,
        validate: (value) => {
            const validation = validator(value);
            if (!validation.valid) {
                return validation.error;
            }
            return undefined;
        },
    };

    if (defaultValue) {
        textOptions.placeholder = defaultValue;
        textOptions.defaultValue = defaultValue;
    }

    const result = await p.text(textOptions);

    if (isUserCancelled(result)) {
        return result;
    }

    return result ?? '';
}
