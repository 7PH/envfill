import type { ParsedTemplate, EnvVariable } from './types.js';
import { getVariables } from './parser.js';
import { INTERPOLATION_PATTERN } from './resolver.js';

function extractInterpolationRefs(variable: EnvVariable): string[] {
    if (variable.default?.type !== 'static') return [];
    const pattern = new RegExp(INTERPOLATION_PATTERN.source, 'g');
    const refs: string[] = [];
    let match;
    while ((match = pattern.exec(variable.default.value)) !== null) {
        const ref = match[1];
        if (ref) {
            refs.push(ref);
        }
    }
    return refs;
}

/**
 * Validate a parsed template for semantic errors.
 * @param template - Parsed template from parse()
 * @returns Array of error messages (empty if valid)
 */
export function validate(template: ParsedTemplate): string[] {
    const errors: string[] = [];
    const variables = getVariables(template);
    const definedVariables = new Map<string, EnvVariable>();

    for (const variable of variables) {
        if (variable.directives.includes('boolean') && variable.directives.length > 1) {
            errors.push(
                `Line ${variable.lineNumber}: ${variable.name} - boolean directive cannot be combined with other directives`
            );
        }

        if (variable.directives.includes('url') && variable.directives.includes('email')) {
            errors.push(
                `Line ${variable.lineNumber}: ${variable.name} - url and email directives cannot be combined`
            );
        }

        if (variable.directives.includes('port') && variable.directives.includes('number')) {
            errors.push(
                `Line ${variable.lineNumber}: ${variable.name} - port and number directives are redundant`
            );
        }

        if (variable.default?.type === 'options' && variable.directives.length > 0) {
            const nonRequiredDirectives = variable.directives.filter(d => d !== 'required');
            if (nonRequiredDirectives.length > 0) {
                errors.push(
                    `Line ${variable.lineNumber}: ${variable.name} - options cannot be combined with validation directives`
                );
            }
        }

        if (variable.default?.type === 'secret' && variable.directives.length > 0) {
            errors.push(
                `Line ${variable.lineNumber}: ${variable.name} - secret cannot be combined with directives`
            );
        }

        if (variable.regex) {
            const conflictingDirectives = variable.directives.filter(
                d => ['url', 'email', 'port', 'number', 'boolean'].includes(d)
            );
            if (conflictingDirectives.length > 0) {
                errors.push(
                    `Line ${variable.lineNumber}: ${variable.name} - regex cannot be combined with ${conflictingDirectives.join(', ')} directives`
                );
            }
        }

        if (variable.condition) {
            const conditionVar = definedVariables.get(variable.condition.variable);
            if (!conditionVar) {
                errors.push(
                    `Line ${variable.lineNumber}: ${variable.name} - condition variable '${variable.condition.variable}' must be defined before this variable`
                );
            } else if (!conditionVar.directives.includes('boolean')) {
                errors.push(
                    `Line ${variable.lineNumber}: ${variable.name} - condition variable '${variable.condition.variable}' should have <boolean> directive`
                );
            }
        }

        const refs = extractInterpolationRefs(variable);
        for (const ref of refs) {
            if (ref === variable.name) {
                errors.push(`Line ${variable.lineNumber}: ${variable.name} - cannot reference itself`);
            } else if (!definedVariables.has(ref)) {
                errors.push(`Line ${variable.lineNumber}: ${variable.name} - references undefined variable '${ref}'`);
            }
        }

        definedVariables.set(variable.name, variable);
    }

    return errors;
}
