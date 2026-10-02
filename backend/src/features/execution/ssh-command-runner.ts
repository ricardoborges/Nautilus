import { SSHClient } from '../terminal/ssh.service';
import type { SSHConfig } from '../../shared/types';
import type { CommandRunner, CommandResult, CommandRunnerOptions } from './command-runner.interface';

export class SSHCommandRunner implements CommandRunner {
    private sshConfig: SSHConfig;
    private client: SSHClient | null = null;

    constructor(sshConfig: SSHConfig) {
        this.sshConfig = sshConfig;
    }

    private async ensureConnected(): Promise<SSHClient> {
        if (!this.client) {
            this.client = new SSHClient(this.sshConfig);
            await this.client.connect();
        }
        return this.client;
    }

    async exec(command: string, options?: CommandRunnerOptions): Promise<CommandResult> {
        try {
            const client = await this.ensureConnected();
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
        }
    }

    dispose(): void {
        if (this.client) {
            try {
                this.client.end();
            } catch {
                // ignore
            }
            this.client = null;
        }
    }
}
