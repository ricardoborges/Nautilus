import { Client } from 'ssh2';
import { HostKeyVerifier } from '../connections/hostkey.service';
import type { SSHConfig, SSHExecResult } from '../../shared/types';

export class SSHClient {
    public config: SSHConfig;
    private client: Client;

    constructor(connectionConfig: SSHConfig) {
        this.config = connectionConfig;
        this.client = new Client();
    }

    connect(): Promise<void> {
        const verifier = new HostKeyVerifier(this.config.host, this.config.port);

        return new Promise((resolve, reject) => {
            this.client
                .on('ready', () => {
                    resolve();
                })
                .on('error', (err) => {
                    reject(verifier.wrapError(err));
                })
                .connect({
                    keepaliveInterval: 15000,
                    keepaliveCountMax: 3,
                    readyTimeout: 20000,
                    ...this.config,
                    hostVerifier: verifier.verify
                });
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
