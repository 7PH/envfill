// =============================================================================
// Parser types - output of parse()
// =============================================================================

/** Validation directives: <required>, <url>, etc. */
export type DirectiveType = 'required' | 'url' | 'email' | 'port' | 'number' | 'boolean';

/** Auto-generated secret: <secret:32> or <secret:32:hex> */
export interface SecretDirective {
    type: 'secret';
    length: number;
    charset?: string;
}

/** Selection from choices: <a|b|*c> */
export interface OptionsDirective {
    type: 'options';
    choices: string[];
    defaultChoice?: string;
}

/** Shell command default: `command` */
export interface ShellDefault {
    type: 'shell';
    command: string;
}

/** Static string default: KEY=value */
export interface StaticDefault {
    type: 'static';
    value: string;
}

export type DefaultValue = ShellDefault | StaticDefault | SecretDirective | OptionsDirective;

/** Conditional: <if:VAR> */
export interface ConditionDirective {
    variable: string;
}

/** Custom validation: <regex:/pattern/flags:error> */
export interface RegexDirective {
    pattern: string;
    flags: string;
    errorMessage?: string;
}

/** Integer range validation: <integer:min:max> */
export interface IntegerDirective {
    min?: number;  // undefined = no minimum
    max?: number;  // undefined = no maximum
}

// =============================================================================
// Transform types
// =============================================================================

/** Replace transform: <replace:/pattern/replacement/flags> */
export interface ReplaceTransform {
    type: 'replace';
    pattern: string;
    replacement: string;
    flags: string;
}

/** Trim transform: <trim:chars> */
export interface TrimTransform {
    type: 'trim';
    chars: string;
}

/** Simple transform: <lowercase>, <uppercase>, <slugify> */
export interface SimpleTransform {
    type: 'lowercase' | 'uppercase' | 'slugify';
}

export type Transform = SimpleTransform | ReplaceTransform | TrimTransform;

/** A single variable from the template */
export interface EnvVariable {
    name: string;
    description?: string;
    default?: DefaultValue;
    directives: DirectiveType[];
    condition?: ConditionDirective;
    regex?: RegexDirective;
    integer?: IntegerDirective;
    transforms?: Transform[];
    section?: string;
    lineNumber: number;
}

// =============================================================================
// Block-based AST node types
// =============================================================================

/** Consecutive blank lines */
export interface WhitespaceNode {
    type: 'whitespace';
    count: number;
}

/** Section header: # --- Name --- */
export interface SectionNode {
    type: 'section';
    name: string;
    line: string;
}

/** Variable block with optional preceding description comments */
export interface VariableNode {
    type: 'variable';
    lines: string[];
    variable: EnvVariable;
}

/** Standalone comments or unrecognized lines */
export interface ContentNode {
    type: 'content';
    lines: string[];
}

export type TemplateNode = WhitespaceNode | SectionNode | VariableNode | ContentNode;

/** Output of parse() */
export interface ParsedTemplate {
    nodes: TemplateNode[];
}

// =============================================================================
// Resolver types - output of resolve() and interpolate()
// =============================================================================

export interface ResolveResult {
    value: string;
    error?: string;
}

// =============================================================================
// Prompter types - output of prompt()
// =============================================================================

/** A variable with its final resolved value */
export interface ResolvedVariable {
    name: string;
    value: string;
    section?: string;
    description?: string;
}

export interface PrompterStats {
    prompted: number;
    defaults: number;
    kept: number;
    generated: number;
    skipped: number;
}

/** Output of prompt() */
export interface PrompterResult {
    variables: ResolvedVariable[];
    stats: PrompterStats;
}

// =============================================================================
// CLI and validation
// =============================================================================

/** CLI arguments */
export interface EnvfillOptions {
    input: string;
    output: string;
    defaults: boolean;
    merge: boolean;
    dryRun: boolean;
    quiet: boolean;
}

/** Output of validator functions */
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
