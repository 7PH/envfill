import { execSync, spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CLI_PATH = resolve(__dirname, '../../dist/cli.js');
export const FIXTURES = resolve(__dirname, 'fixtures');

// Pass through NODE_V8_COVERAGE for c8 subprocess coverage collection
const baseEnv = { ...process.env, FORCE_COLOR: '0' };

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class TestContext {
    public dir: string;

    constructor() {
        this.dir = mkdtempSync(join(tmpdir(), 'envfill-e2e-'));
    }

    cleanup(): void {
        if (this.dir && existsSync(this.dir)) {
            rmSync(this.dir, { recursive: true, force: true });
        }
    }

    copyFixture(name: string): string {
        const src = join(FIXTURES, name);
        const dest = join(this.dir, name);
        copyFileSync(src, dest);
        return dest;
    }

    readEnvFile(filename = '.env'): Map<string, string> {
        const content = readFileSync(join(this.dir, filename), 'utf-8');
        const vars = new Map<string, string>();

        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;

            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;

            const name = trimmed.slice(0, eqIndex);
            let value = trimmed.slice(eqIndex + 1);

            // Handle quoted values
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            vars.set(name, value);
        }

        return vars;
    }

    runCli(args: string[]): RunResult {
        try {
            const stdout = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
                cwd: this.dir,
                encoding: 'utf-8',
                env: baseEnv,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            return { stdout, stderr: '', exitCode: 0 };
        } catch (error) {
            const execError = error as { stdout?: string; stderr?: string; status?: number };
            return {
                stdout: execError.stdout ?? '',
                stderr: execError.stderr ?? '',
                exitCode: execError.status ?? 1,
            };
        }
    }

    runCliInteractive(args: string[], inputs: string[]): Promise<RunResult> {
        return new Promise((resolve) => {
            const child: ChildProcess = spawn('node', [CLI_PATH, ...args], {
                cwd: this.dir,
                env: baseEnv,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            // Write inputs with delays to allow prompts to appear
            // Use carriage return (\r) as @clack/prompts expects this for submit
            let inputIndex = 0;
            const writeNextInput = () => {
                if (inputIndex < inputs.length && child.stdin) {
                    child.stdin.write(inputs[inputIndex] + '\r');
                    inputIndex++;
                    setTimeout(writeNextInput, 150);
                } else {
                    child.stdin?.end();
                }
            };

            // Start writing inputs after initial delay for first prompt to render
            setTimeout(writeNextInput, 200);

            child.on('close', (code) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode: code ?? 0,
                });
            });
        });
    }
}
