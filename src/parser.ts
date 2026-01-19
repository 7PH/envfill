import type { EnvVariable, ParsedTemplate, DefaultValue, DirectiveType } from './types.js';

const SECTION_HEADER_REGEX = /^#\s*---\s*(.+?)\s*---\s*$/;
const VARIABLE_REGEX = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
const SHELL_COMMAND_REGEX = /^`(.+)`$/;
const SECRET_DIRECTIVE_REGEX = /^<secret:(\d+)>$/;
const OPTIONS_DIRECTIVE_REGEX = /^<([^<>]+\|[^<>]+)>$/;
const SIMPLE_DIRECTIVE_REGEX = /^<([a-z,]+)>$/;

const VALID_DIRECTIVES: DirectiveType[] = ['required', 'url', 'email', 'port', 'number', 'boolean'];

function parseDirectiveString(directiveStr: string): DirectiveType[] {
    const parts = directiveStr.split(',').map(p => p.trim());
    const directives: DirectiveType[] = [];

    for (const part of parts) {
        if (VALID_DIRECTIVES.includes(part as DirectiveType)) {
            directives.push(part as DirectiveType);
        } else {
            throw new Error(`Unknown directive: ${part}`);
        }
    }

    return directives;
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

function parseValue(value: string): { default?: DefaultValue; directives: DirectiveType[] } {
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

    const simpleDirectiveMatch = SIMPLE_DIRECTIVE_REGEX.exec(trimmedValue);
    if (simpleDirectiveMatch?.[1]) {
        const directives = parseDirectiveString(simpleDirectiveMatch[1]);
        return { directives };
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
            const { default: defaultValue, directives } = parseValue(rawValue);

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
    }

    return errors;
}
