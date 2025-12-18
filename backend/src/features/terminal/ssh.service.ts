import { Client } from 'ssh2';
import type { SSHConfig, SSHExecResult } from '../../shared/types';

export class SSHClient {
    public config: SSHConfig;
    private client: Client;

    constructor(connectionConfig: SSHConfig) {
        this.config = connectionConfig;
        this.client = new Client();
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client
                .on('ready', () => {
                    resolve();
                })
                .on('error', (err) => {
                    reject(err);
                })
                .connect(this.config);
        });
    }

    exec(command: string): Promise<SSHExecResult> {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';

            this.client.exec(command, (err, stream) => {
                if (err) return reject(err);

                stream
                    .on('close', (code: number) => {
                        if (code !== 0) {
                            return reject(new Error(`Command failed with code ${code}: ${stderr}`));
                        }
                        resolve({ stdout, stderr });
                    })
                    .on('data', (data: Buffer) => {
                        stdout += data.toString();
                    })
                    .stderr.on('data', (data: Buffer) => {
                        stderr += data.toString();
                    });
            });
        });
    }

    end(): void {
        this.client.end();
    }
}
