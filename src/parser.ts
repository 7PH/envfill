import type { EnvVariable, ParsedTemplate, DefaultValue, DirectiveType, ConditionDirective, RegexDirective, Transform } from './types.js';

const SECTION_HEADER_REGEX = /^#\s*---\s*(.+?)\s*---\s*$/;
const VARIABLE_REGEX = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
const SHELL_COMMAND_REGEX = /^`(.+)`$/;
const SECRET_DIRECTIVE_REGEX = /^<secret:(\d+)>$/;
const OPTIONS_DIRECTIVE_REGEX = /^<([^<>]+\|[^<>]+)>$/;
const DIRECTIVE_REGEX = /^<([a-z,:A-Z0-9_/\\^$.*+?{}[\]()|' -]+)>$/;
const IF_DIRECTIVE_REGEX = /^if:([A-Z_][A-Z0-9_]*)$/;

const VALID_DIRECTIVES: DirectiveType[] = ['required', 'url', 'email', 'port', 'number', 'boolean'];
const VALID_REGEX_FLAGS = ['i', 'm', 'u', 's'];
const VALID_REPLACE_FLAGS = ['g', 'i'];
const SIMPLE_TRANSFORMS = ['lowercase', 'uppercase', 'slugify'] as const;

interface ParsedDirectives {
    directives: DirectiveType[];
    condition?: ConditionDirective;
    regex?: RegexDirective;
    transforms?: Transform[];
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

function parseReplaceTransform(replaceStr: string): Transform {
    // Format: replace:/pattern/replacement/flags
    if (!replaceStr.startsWith('replace:/')) {
        throw new Error('Invalid replace directive format');
    }

    const afterPrefix = replaceStr.slice(9); // after "replace:/"
    const patternEnd = findClosingSlash(afterPrefix);

    if (patternEnd === -1) {
        throw new Error('Invalid replace directive: missing closing / after pattern');
    }

    const pattern = afterPrefix.slice(0, patternEnd).replace(/\\\//g, '/');
    const afterPattern = afterPrefix.slice(patternEnd + 1);

    const replacementEnd = findClosingSlash(afterPattern);

    if (replacementEnd === -1) {
        throw new Error('Invalid replace directive: missing closing / after replacement');
    }

    const replacement = afterPattern.slice(0, replacementEnd).replace(/\\\//g, '/');
    const flags = afterPattern.slice(replacementEnd + 1);

    for (const flag of flags) {
        if (!VALID_REPLACE_FLAGS.includes(flag)) {
            throw new Error(`Invalid replace flag: ${flag}`);
        }
    }

    try {
        new RegExp(pattern, flags);
    } catch (e) {
        throw new Error(`Invalid replace pattern: ${(e as Error).message}`);
    }

    return { type: 'replace', pattern, replacement, flags };
}

function parseTrimTransform(trimStr: string): Transform {
    // Format: trim:chars
    if (!trimStr.startsWith('trim:')) {
        throw new Error('Invalid trim directive format');
    }

    const chars = trimStr.slice(5);
    if (chars === '') {
        throw new Error('Trim directive requires characters to trim');
    }

    return { type: 'trim', chars };
}

function parseDirectiveString(directiveStr: string): ParsedDirectives {
    const transforms: Transform[] = [];
    const directives: DirectiveType[] = [];
    let condition: ConditionDirective | undefined;
    let regex: RegexDirective | undefined;

    // Parse directives sequentially to preserve transform order
    let i = 0;
    while (i < directiveStr.length) {
        // Skip leading commas and whitespace
        while (i < directiveStr.length && (directiveStr[i] === ',' || directiveStr[i] === ' ')) {
            i++;
        }
        if (i >= directiveStr.length) break;

        // Check for replace:/.../.../flags
        if (directiveStr.slice(i).startsWith('replace:/')) {
            const startPos = i;
            i += 9; // skip "replace:/"

            // Find end of pattern
            const patternEnd = findClosingSlash(directiveStr.slice(i));
            if (patternEnd === -1) {
                throw new Error('Invalid replace directive: missing closing / after pattern');
            }
            i += patternEnd + 1; // skip pattern and closing /

            // Find end of replacement
            const replacementEnd = findClosingSlash(directiveStr.slice(i));
            if (replacementEnd === -1) {
                throw new Error('Invalid replace directive: missing closing / after replacement');
            }
            i += replacementEnd + 1; // skip replacement and closing /

            // Read flags until comma or end
            while (i < directiveStr.length && directiveStr[i] !== ',') {
                i++;
            }

            transforms.push(parseReplaceTransform(directiveStr.slice(startPos, i)));
            continue;
        }

        // Check for regex:/pattern/flags:error
        if (directiveStr.slice(i).startsWith('regex:/')) {
            const startPos = i;
            i += 7; // skip "regex:/"

            // Find end of pattern
            const patternEnd = findClosingSlash(directiveStr.slice(i));
            if (patternEnd === -1) {
                throw new Error('Invalid regex directive: missing closing /');
            }
            i += patternEnd + 1; // skip pattern and closing /

            // Read flags and optional error message
            const colonIdx = directiveStr.indexOf(':', i);
            const commaIdx = directiveStr.indexOf(',', i);

            if (colonIdx !== -1 && (commaIdx === -1 || colonIdx < commaIdx)) {
                // Has error message, find the next comma after the error message
                const commaAfterMsg = directiveStr.indexOf(',', colonIdx + 1);
                i = commaAfterMsg !== -1 ? commaAfterMsg : directiveStr.length;
            } else {
                // No error message, just flags
                i = commaIdx !== -1 ? commaIdx : directiveStr.length;
            }

            regex = parseRegexDirective(directiveStr.slice(startPos, i));
            continue;
        }

        // Find end of current part (next comma)
        const commaIdx = directiveStr.indexOf(',', i);
        const partEnd = commaIdx !== -1 ? commaIdx : directiveStr.length;
        const part = directiveStr.slice(i, partEnd).trim();
        i = partEnd;

        if (part === '') continue;

        // Match different directive types
        const ifMatch = IF_DIRECTIVE_REGEX.exec(part);
        if (ifMatch?.[1]) {
            if (condition) {
                throw new Error('Multiple if conditions not allowed');
            }
            condition = { variable: ifMatch[1] };
        } else if (VALID_DIRECTIVES.includes(part as DirectiveType)) {
            directives.push(part as DirectiveType);
        } else if (SIMPLE_TRANSFORMS.includes(part as typeof SIMPLE_TRANSFORMS[number])) {
            transforms.push({ type: part as 'lowercase' | 'uppercase' | 'slugify' });
        } else if (part.startsWith('trim:')) {
            transforms.push(parseTrimTransform(part));
        } else {
            throw new Error(`Unknown directive: ${part}`);
        }
    }

    const result: ParsedDirectives = { directives };
    if (condition) {
        result.condition = condition;
    }
    if (regex) {
        result.regex = regex;
    }
    if (transforms.length > 0) {
        result.transforms = transforms;
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
    transforms?: Transform[];
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
        if (parsed.transforms) {
            result.transforms = parsed.transforms;
        }
        return result;
    }

    return {
        default: { type: 'static', value: trimmedValue },
        directives: [],
    };
}

/**
 * Parse a .env.template file into a structured template.
 * @param content - Raw template file content
 * @returns Parsed template with variables and sections
 */
export function parse(content: string): ParsedTemplate {
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
            const { default: defaultValue, directives, condition, regex, transforms } = parseValue(rawValue);

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

            if (transforms) {
                variable.transforms = transforms;
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
