export type DirectiveType = 'required' | 'url' | 'email' | 'port' | 'number' | 'boolean';

export interface SecretDirective {
    type: 'secret';
    length: number;
}

export interface OptionsDirective {
    type: 'options';
    choices: string[];
    defaultChoice?: string;
}

export interface ShellDefault {
    type: 'shell';
    command: string;
}

export interface StaticDefault {
    type: 'static';
    value: string;
}

export type DefaultValue = ShellDefault | StaticDefault | SecretDirective | OptionsDirective;

export interface ConditionDirective {
    variable: string;
}

export interface EnvVariable {
    name: string;
    description?: string;
    default?: DefaultValue;
    directives: DirectiveType[];
    condition?: ConditionDirective;
    section?: string;
    lineNumber: number;
}

export interface ParsedTemplate {
    variables: EnvVariable[];
    sections: string[];
}

export interface ResolvedVariable {
    name: string;
    value: string;
    section?: string;
}

export interface EnvfillOptions {
    input: string;
    output: string;
    defaults: boolean;
    merge: boolean;
    dryRun: boolean;
    quiet: boolean;
}

export interface PrompterStats {
    prompted: number;
    defaults: number;
    kept: number;
    generated: number;
    skipped: number;
}

export interface PrompterResult {
    variables: ResolvedVariable[];
    stats: PrompterStats;
}
