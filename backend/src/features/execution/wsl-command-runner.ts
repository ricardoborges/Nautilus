import { execFile } from 'child_process';
import type { CommandRunner, CommandResult, CommandRunnerOptions } from './command-runner.interface';
import logger from '../../shared/utils/logger';

export function buildWslArgs(distro: string, command: string, user?: string): string[] {
    const args = ['-d', distro];
    if (user) {
        args.push('-u', user);
    }
    args.push('--', 'sh', '-c', command);
    return args;
}

export function decodeWslBuffer(buf?: Buffer | null): string {
    if (!buf || buf.length === 0) return '';
    // Detect UTF-16LE: check if alternating bytes are 0
    const isUtf16Le = buf.length >= 2 && (buf[1] === 0 || buf[0] === 0);
    const decoded = isUtf16Le ? buf.toString('utf16le') : buf.toString('utf8');
    return decoded.replace(/\0/g, '').replace(/\r\n/g, '\n').trim();
}

export class WSLCommandRunner implements CommandRunner {
    private distro: string;
    private user?: string;

    constructor(distro: string, user?: string) {
        this.distro = distro;
        this.user = user;
    }

    async exec(command: string, options?: CommandRunnerOptions): Promise<CommandResult> {
        const timeoutMs = options?.timeout ?? 30000;
        const args = buildWslArgs(this.distro, command, this.user);

        return new Promise<CommandResult>((resolve, reject) => {
            execFile(
                'wsl.exe',
                args,
                { encoding: 'buffer', timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
                (error, stdout, stderr) => {
                    const outStr = decodeWslBuffer(stdout);
                    const errStr = decodeWslBuffer(stderr);
                    const exitCode = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;

                    if (error && !outStr && errStr) {
                        logger.warn(`[WSLCommandRunner] Command failed on distro ${this.distro}: ${errStr}`);
                    }

                    resolve({
                        stdout: outStr,
                        stderr: errStr,
                        code: exitCode,
                    });
                }
            );
        });
    }
}
