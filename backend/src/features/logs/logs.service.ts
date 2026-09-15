import { Client } from 'ssh2';
import { SSHPoolManager } from '../terminal/ssh-pool.service';
import type { SSHConfig } from '../../shared/types';

export interface ReadLogsOptions {
    source: 'journal' | 'file';
    target: string;
    lines?: number;
    since?: string;
    priority?: string;
}

export interface StreamLogsOptions {
    source: 'journal' | 'file';
    target: string;
}

const TARGET_REGEX = /^[a-zA-Z0-9_@.\-/]+$/;

export class LogsService {
    private pool = SSHPoolManager.getInstance();
    private activeStreams = new Map<string, { close: () => void }>();

    public async readLogs(connectionId: string, authConfig: SSHConfig, options: ReadLogsOptions): Promise<{ lines: string[] }> {
        const { source, target, lines = 200, since, priority } = options;
        if (!TARGET_REGEX.test(target)) {
            throw new Error(`Invalid target name or path: ${target}`);
        }

        let cmd: string;
        if (source === 'journal') {
            const serviceArg = target !== 'all' ? `-u "${target}"` : '';
            const sinceArg = since ? `--since "${since}"` : '';
            const priorityArg = priority ? `-p "${priority}"` : '';
            cmd = `journalctl ${serviceArg} ${sinceArg} ${priorityArg} -n ${Math.min(lines, 2000)} --no-pager -o short-iso 2>&1`;
        } else {
            cmd = `tail -n ${Math.min(lines, 2000)} "${target}" 2>&1`;
        }

        const result = await this.pool.exec(connectionId, authConfig, cmd);
        const linesArr = result.stdout.split('\n').filter(l => l.length > 0);
        return { lines: linesArr };
    }

    public async listFiles(connectionId: string, authConfig: SSHConfig): Promise<string[]> {
        const cmd = 'find /var/log -maxdepth 2 -type f ! -name "*.gz" ! -name "*.old" ! -name "*.[0-9]" 2>/dev/null | sort';
        try {
            const result = await this.pool.exec(connectionId, authConfig, cmd);
            return result.stdout.split('\n').map(s => s.trim()).filter(Boolean);
        } catch {
            return [];
        }
    }

    public async startStream(
        connectionId: string,
        authConfig: SSHConfig,
        streamId: string,
        options: StreamLogsOptions,
        onData: (chunk: string) => void
    ): Promise<void> {
        this.stopStream(streamId);

        const { source, target } = options;
        if (!TARGET_REGEX.test(target)) {
            throw new Error(`Invalid target: ${target}`);
        }

        const client: Client = await this.pool.acquire(connectionId, authConfig);

        let cmd: string;
        if (source === 'journal') {
            const serviceArg = target !== 'all' ? `-u "${target}"` : '';
            cmd = `journalctl ${serviceArg} -f -n 50 --no-pager -o short-iso`;
        } else {
            cmd = `tail -f -n 50 "${target}"`;
        }

        return new Promise((resolve, reject) => {
            client.exec(cmd, (err, stream) => {
                if (err) return reject(err);

                stream.on('data', (data: Buffer) => {
                    onData(data.toString());
                });

                const cleanup = () => {
                    try {
                        stream.close();
                    } catch {}
                    this.activeStreams.delete(streamId);
                };

                stream.on('close', cleanup);
                stream.on('end', cleanup);

                this.activeStreams.set(streamId, { close: cleanup });
                resolve();
            });
        });
    }

    public stopStream(streamId: string): void {
        const active = this.activeStreams.get(streamId);
        if (active) {
            active.close();
            this.activeStreams.delete(streamId);
        }
    }

    public stopAll(): void {
        for (const [id, stream] of this.activeStreams) {
            try {
                stream.close();
            } catch {}
        }
        this.activeStreams.clear();
    }
}
