import type { ParsedTemplate, TemplateNode, SectionNode } from './types.js';

export interface TemplateInput {
    template: ParsedTemplate;
    filename: string;
}

function createFileSection(filename: string): SectionNode {
    return {
        type: 'section',
        name: filename,
        line: `# --- ${filename} ---`,
    };
}

/**
 * Merge templates: first is base, rest are additive overrides.
 * Each file gets a section header with its filename.
 * - Existing variables: Override replaces base variable in-place
 * - New variables: Appended under the override file's section
 */
export function mergeTemplates(inputs: TemplateInput[]): ParsedTemplate {
    if (inputs.length === 0) return { nodes: [] };

    const first = inputs[0]!;
    if (inputs.length === 1) {
        // Single template: return as-is, no file section needed
        return first.template;
    }

    // Phase 1: Build base with file section header and index it
    const nodes: TemplateNode[] = [
        createFileSection(first.filename),
        { type: 'whitespace', count: 1 },
        ...first.template.nodes,
    ];
    const varIndex = new Map<string, number>();

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]!;
        if (node.type === 'variable') {
            varIndex.set(node.variable.name, i);
        }
    }

    // Phase 2: Apply overrides
    for (let t = 1; t < inputs.length; t++) {
        const { template, filename } = inputs[t]!;
        const pendingNodes: TemplateNode[] = [];

        for (const node of template.nodes) {
            if (node.type === 'variable') {
                const name = node.variable.name;
                const existingIndex = varIndex.get(name);
                if (existingIndex !== undefined) {
                    // Replace in-place
                    nodes[existingIndex] = node;
                } else {
                    // New variable - track where it will be placed
                    // +3 accounts for: whitespace + section header + whitespace before pendingNodes
                    const newIndex = nodes.length + 3 + pendingNodes.length;
                    pendingNodes.push(node);
                    varIndex.set(name, newIndex);
                }
            }
            // Ignore sections/whitespace/content from override files - we use file sections instead
        }

        // Append new nodes under file section
        if (pendingNodes.length > 0) {
            nodes.push(
                { type: 'whitespace', count: 1 },
                createFileSection(filename),
                { type: 'whitespace', count: 1 },
                ...pendingNodes,
            );
        }
    }

    return { nodes };
}
