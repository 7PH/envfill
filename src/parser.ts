import type { EnvVariable, ParsedTemplate, DefaultValue, DirectiveType, ConditionDirective } from './types.js';

const SECTION_HEADER_REGEX = /^#\s*---\s*(.+?)\s*---\s*$/;
const VARIABLE_REGEX = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
const SHELL_COMMAND_REGEX = /^`(.+)`$/;
const SECRET_DIRECTIVE_REGEX = /^<secret:(\d+)>$/;
const OPTIONS_DIRECTIVE_REGEX = /^<([^<>]+\|[^<>]+)>$/;
const DIRECTIVE_REGEX = /^<([a-z,:A-Z0-9_]+)>$/;
const IF_DIRECTIVE_REGEX = /^if:([A-Z_][A-Z0-9_]*)$/;

const VALID_DIRECTIVES: DirectiveType[] = ['required', 'url', 'email', 'port', 'number', 'boolean'];

interface ParsedDirectives {
    directives: DirectiveType[];
    condition?: ConditionDirective;
}

function parseDirectiveString(directiveStr: string): ParsedDirectives {
    const parts = directiveStr.split(',').map(p => p.trim());
    const directives: DirectiveType[] = [];
    let condition: ConditionDirective | undefined;

    for (const part of parts) {
        const ifMatch = IF_DIRECTIVE_REGEX.exec(part);
        if (ifMatch?.[1]) {
            if (condition) {
                throw new Error('Multiple if conditions not allowed');
            }
            condition = { variable: ifMatch[1] };
        } else if (VALID_DIRECTIVES.includes(part as DirectiveType)) {
            directives.push(part as DirectiveType);
        } else {
            throw new Error(`Unknown directive: ${part}`);
        }
    }

    if (condition) {
        return { directives, condition };
    }
    return { directives };
}

function parseOptions(optionsStr: string): { choices: string[]; defaultChoice: string | undefined } {
    const parts = optionsStr.split('|').map(p => p.trim());
    const choices: string[] = [];
    let defaultChoice: string | undefined;

    for (const part of parts) {
        if (part.startsWith('*')) {
            const choice = part.slice(1);
            choices.push(choice);
            defaultChoice = choice;
        } else {
            choices.push(part);
        }
    }

    return { choices, defaultChoice };
}

interface ParsedValue {
    default?: DefaultValue;
    directives: DirectiveType[];
    condition?: ConditionDirective;
}

function parseValue(value: string): ParsedValue {
    const trimmedValue = value.trim();

    if (trimmedValue === '') {
        return { directives: [] };
    }

    const shellMatch = SHELL_COMMAND_REGEX.exec(trimmedValue);
    if (shellMatch?.[1]) {
        return {
            default: { type: 'shell', command: shellMatch[1] },
            directives: [],
        };
    }

    const secretMatch = SECRET_DIRECTIVE_REGEX.exec(trimmedValue);
    if (secretMatch?.[1]) {
        return {
            default: { type: 'secret', length: parseInt(secretMatch[1], 10) },
            directives: [],
        };
    }

    const optionsMatch = OPTIONS_DIRECTIVE_REGEX.exec(trimmedValue);
    if (optionsMatch?.[1]) {
        const { choices, defaultChoice } = parseOptions(optionsMatch[1]);
        if (defaultChoice !== undefined) {
            return {
                default: { type: 'options', choices, defaultChoice },
                directives: [],
            };
        }
        return {
            default: { type: 'options', choices },
            directives: [],
        };
    }

    const directiveMatch = DIRECTIVE_REGEX.exec(trimmedValue);
    if (directiveMatch?.[1]) {
        const parsed = parseDirectiveString(directiveMatch[1]);
        if (parsed.condition) {
            return { directives: parsed.directives, condition: parsed.condition };
        }
        return { directives: parsed.directives };
    }

    return {
        default: { type: 'static', value: trimmedValue },
        directives: [],
    };
}

export function parseTemplate(content: string): ParsedTemplate {
    const lines = content.split('\n');
    const variables: EnvVariable[] = [];
    const sections: string[] = [];

    let currentSection: string | undefined;
    let pendingDescription: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        if (line === undefined) continue;

        const trimmedLine = line.trim();

        if (trimmedLine === '' || trimmedLine === '#') {
            pendingDescription = [];
            continue;
        }

        const sectionMatch = SECTION_HEADER_REGEX.exec(trimmedLine);
        if (sectionMatch?.[1]) {
            currentSection = sectionMatch[1];
            if (!sections.includes(currentSection)) {
                sections.push(currentSection);
            }
            pendingDescription = [];
            continue;
        }

        if (trimmedLine.startsWith('#') && !SECTION_HEADER_REGEX.test(trimmedLine)) {
            pendingDescription.push(trimmedLine.slice(1).trim());
            continue;
        }

        const variableMatch = VARIABLE_REGEX.exec(trimmedLine);
        if (variableMatch?.[1] !== undefined && variableMatch[2] !== undefined) {
            const name = variableMatch[1];
            const rawValue = variableMatch[2];
            const { default: defaultValue, directives, condition } = parseValue(rawValue);

            const variable: EnvVariable = {
                name,
                lineNumber,
                directives,
            };

            if (pendingDescription.length > 0) {
                variable.description = pendingDescription.join('\n');
            }

            if (defaultValue) {
                variable.default = defaultValue;
            }

            if (condition) {
                variable.condition = condition;
            }

            if (currentSection) {
                variable.section = currentSection;
            }

            variables.push(variable);
            pendingDescription = [];
        }
    }

    return { variables, sections };
}

export function validateTemplate(template: ParsedTemplate): string[] {
    const errors: string[] = [];
    const definedVariables = new Map<string, EnvVariable>();

    for (const variable of template.variables) {
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

        definedVariables.set(variable.name, variable);
    }

    return errors;
}
