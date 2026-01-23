// =============================================================================
// Parser types - output of parse()
// =============================================================================

/** Validation directives: <required>, <url>, etc. */
export type DirectiveType = 'required' | 'url' | 'email' | 'port' | 'number' | 'boolean';

/** Auto-generated secret: <secret:32> */
export interface SecretDirective {
    type: 'secret';
    length: number;
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

/** A single variable from the template */
export interface EnvVariable {
    name: string;
    description?: string;
    default?: DefaultValue;
    directives: DirectiveType[];
    condition?: ConditionDirective;
    regex?: RegexDirective;
    section?: string;
    lineNumber: number;
}

/** Output of parse() */
export interface ParsedTemplate {
    variables: EnvVariable[];
    sections: string[];
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
