import type { EnvVariable, ParsedTemplate, DefaultValue, DirectiveType, ConditionDirective, RegexDirective } from './types.js';

const SECTION_HEADER_REGEX = /^#\s*---\s*(.+?)\s*---\s*$/;
const VARIABLE_REGEX = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
const SHELL_COMMAND_REGEX = /^`(.+)`$/;
const SECRET_DIRECTIVE_REGEX = /^<secret:(\d+)>$/;
const OPTIONS_DIRECTIVE_REGEX = /^<([^<>]+\|[^<>]+)>$/;
const DIRECTIVE_REGEX = /^<([a-z,:A-Z0-9_/\\^$.*+?{}[\]()|' -]+)>$/;
const IF_DIRECTIVE_REGEX = /^if:([A-Z_][A-Z0-9_]*)$/;

const VALID_DIRECTIVES: DirectiveType[] = ['required', 'url', 'email', 'port', 'number', 'boolean'];
const VALID_REGEX_FLAGS = ['i', 'm', 'u', 's'];

interface ParsedDirectives {
    directives: DirectiveType[];
    condition?: ConditionDirective;
    regex?: RegexDirective;
}

function findClosingSlash(str: string): number {
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '/' && (i === 0 || str[i - 1] !== '\\')) {
            return i;
        }
    }
    return -1;
}

function parseRegexDirective(regexStr: string): RegexDirective {
    if (!regexStr.startsWith('regex:/')) {
        throw new Error('Invalid regex directive format');
    }

    const afterPrefix = regexStr.slice(7);
    const patternEnd = findClosingSlash(afterPrefix);

    if (patternEnd === -1) {
        throw new Error('Invalid regex directive: missing closing /');
    }

    const pattern = afterPrefix.slice(0, patternEnd).replace(/\\\//g, '/');
    const remainder = afterPrefix.slice(patternEnd + 1);

    const colonIndex = remainder.indexOf(':');
    const flags = colonIndex === -1 ? remainder : remainder.slice(0, colonIndex);
    const errorMessage = colonIndex === -1 ? undefined : remainder.slice(colonIndex + 1);

    for (const flag of flags) {
        if (!VALID_REGEX_FLAGS.includes(flag)) {
            throw new Error(`Invalid regex flag: ${flag}`);
        }
    }

    try {
        new RegExp(pattern, flags);
    } catch (e) {
        throw new Error(`Invalid regex pattern: ${(e as Error).message}`);
    }

    return errorMessage !== undefined ? { pattern, flags, errorMessage } : { pattern, flags };
}

function extractRegexPart(directiveStr: string): { regex: RegexDirective | undefined; remaining: string } {
    const regexStart = directiveStr.indexOf('regex:/');
    if (regexStart === -1) {
        return { regex: undefined, remaining: directiveStr };
    }

    const afterRegex = directiveStr.slice(regexStart + 7);
    const patternEnd = findClosingSlash(afterRegex);

    if (patternEnd === -1) {
        throw new Error('Invalid regex directive: missing closing /');
    }

    const afterSlash = afterRegex.slice(patternEnd + 1);
    const colonIdx = afterSlash.indexOf(':');

    let regexEndOffset: number;
    if (colonIdx !== -1) {
        const commaAfterMsg = afterSlash.indexOf(',', colonIdx + 1);
        regexEndOffset = commaAfterMsg !== -1 ? commaAfterMsg : afterSlash.length;
    } else {
        const commaIdx = afterSlash.indexOf(',');
        regexEndOffset = commaIdx !== -1 ? commaIdx : afterSlash.length;
    }

    const regexEndPos = regexStart + 7 + patternEnd + 1 + regexEndOffset;
    const regex = parseRegexDirective(directiveStr.slice(regexStart, regexEndPos));

    const before = directiveStr.slice(0, regexStart);
    const after = directiveStr.slice(regexEndPos);
    const remaining = (before + after).replace(/^,+|,+$/g, '').replace(/,{2,}/g, ',');

    return { regex, remaining };
}

function parseDirectiveString(directiveStr: string): ParsedDirectives {
    // First extract regex if present (since it can contain commas)
    const { regex, remaining } = extractRegexPart(directiveStr);

    const directives: DirectiveType[] = [];
    let condition: ConditionDirective | undefined;

    if (remaining.trim() !== '') {
        const parts = remaining.split(',').map(p => p.trim()).filter(p => p !== '');

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
    }

    const result: ParsedDirectives = { directives };
    if (condition) {
        result.condition = condition;
    }
    if (regex) {
        result.regex = regex;
    }
    return result;
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
    regex?: RegexDirective;
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
        const result: ParsedValue = { directives: parsed.directives };
        if (parsed.condition) {
            result.condition = parsed.condition;
        }
        if (parsed.regex) {
            result.regex = parsed.regex;
        }
        return result;
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
            const { default: defaultValue, directives, condition, regex } = parseValue(rawValue);

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

            if (regex) {
                variable.regex = regex;
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

        definedVariables.set(variable.name, variable);
    }

    return errors;
}
