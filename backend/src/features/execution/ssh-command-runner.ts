import { SSHClient } from '../terminal/ssh.service';
import type { SSHConfig } from '../../shared/types';
import type { CommandRunner, CommandResult, CommandRunnerOptions } from './command-runner.interface';

export class SSHCommandRunner implements CommandRunner {
    private sshConfig: SSHConfig;
    private sshClient: SSHClient | null = null;

    constructor(sshConfig: SSHConfig) {
        this.sshConfig = sshConfig;
    }

    async exec(command: string, options?: CommandRunnerOptions): Promise<CommandResult> {
        const client = new SSHClient(this.sshConfig);
        try {
            await client.connect();
            const result = await client.exec(command);
            return {
                stdout: result.stdout,
                stderr: result.stderr,
                code: 0,
            };
        } catch (err: any) {
            return {
                stdout: err.stdout || '',
                stderr: err.message || String(err),
                code: err.code || 1,
            };
        } finally {
            client.end();
        }
    }
}
