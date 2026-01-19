import { describe, it, expect } from '@jest/globals';

// Note: The prompter module relies heavily on @clack/prompts which requires
// interactive terminal input. These tests verify the module structure.
// Integration tests should be done manually with a sample template.

describe('prompter module', () => {
    it('exports promptForVariables function', async () => {
        const prompter = await import('../src/prompter.js');
        expect(typeof prompter.promptForVariables).toBe('function');
    });
});
