import { Client } from 'ssh2';
import { HostKeyVerifier } from '../connections/hostkey.service';
import type { SSHConfig, SSHExecResult } from '../../shared/types';

interface PooledEntry {
    client: Client;
    authConfig: SSHConfig;
    isConnecting: boolean;
    connectPromise?: Promise<Client>;
    lastUsed: number;
}

export class SSHPoolManager {
    private static instance: SSHPoolManager;
    private pool = new Map<string, PooledEntry>();

    public static getInstance(): SSHPoolManager {
        if (!SSHPoolManager.instance) {
            SSHPoolManager.instance = new SSHPoolManager();
        }
        return SSHPoolManager.instance;
    }

    public async openBastionStream(bastionClient: Client, targetHost: string, targetPort: number): Promise<any> {
        return new Promise((resolve, reject) => {
            bastionClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
                if (err) return reject(err);
                resolve(stream);
            });
        });
    }

    public async acquire(
        connectionId: string,
        authConfig: SSHConfig,
        getBastionStream?: () => Promise<any>
    ): Promise<Client> {
        const existing = this.pool.get(connectionId);
        if (existing) {
            existing.lastUsed = Date.now();
            if (existing.isConnecting && existing.connectPromise) {
                return existing.connectPromise;
            }
            return existing.client;
        }

        const client = new Client();
        const verifier = new HostKeyVerifier(authConfig.host, authConfig.port);

        const connectPromise = (async () => {
            let sockStream: any = undefined;
            if (getBastionStream) {
                sockStream = await getBastionStream();
            }

            return new Promise<Client>((resolve, reject) => {
                const disarm = verifier.armTimeout((err) => {
                    client.end();
                    this.pool.delete(connectionId);
                    reject(err);
                });

                client
                    .on('connect', () => {
                        const sock = (client as any)._sock;
                        if (sock && typeof sock.setKeepAlive === 'function') {
                            sock.setKeepAlive(true, 10000);
                        }
                        if (typeof client.setNoDelay === 'function') {
                            client.setNoDelay(true);
                        }
                    })
                    .on('ready', () => {
                        disarm();
                        const entry = this.pool.get(connectionId);
                        if (entry) {
                            entry.isConnecting = false;
                            entry.connectPromise = undefined;
                        }
                        resolve(client);
                    })
                    .on('error', (err) => {
                        disarm();
                        this.pool.delete(connectionId);
                        reject(verifier.wrapError(err));
                    })
                    .on('close', () => {
                        this.pool.delete(connectionId);
                    })
                    .on('end', () => {
                        this.pool.delete(connectionId);
                    })
                    .connect({
                        ...authConfig,
                        keepaliveInterval: 10000,
                        keepaliveCountMax: 6,
                        sock: sockStream || (authConfig as any).sock,
                        readyTimeout: verifier.readyTimeout,
                        hostVerifier: verifier.verify
                    });
            });
        })();

        this.pool.set(connectionId, {
            client,
            authConfig,
            isConnecting: true,
            connectPromise,
            lastUsed: Date.now()
        });

        return connectPromise;
    }

    public async exec(
        connectionId: string,
        authConfig: SSHConfig,
        command: string,
        getBastionStream?: () => Promise<any>
    ): Promise<SSHExecResult> {
        const client = await this.acquire(connectionId, authConfig, getBastionStream);

        const runCommand = (sshClient: Client): Promise<SSHExecResult> => {
            return new Promise((resolve, reject) => {
                let stdout = '';
                let stderr = '';

                sshClient.exec(command, (err, stream) => {
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
        };

        try {
            return await runCommand(client);
        } catch (err: any) {
            // If connection dropped, clear from pool and retry once
            const isConnectionDrop = err?.message?.includes('Channel open failure') || 
                                     err?.message?.includes('Not connected') ||
                                     err?.message?.includes('closed') ||
                                     err?.level === 'client-timeout';
            if (isConnectionDrop) {
                this.close(connectionId);
                const reconnectedClient = await this.acquire(connectionId, authConfig);
                return await runCommand(reconnectedClient);
            }
            throw err;
        }
    }

    public close(connectionId: string): void {
        const entry = this.pool.get(connectionId);
        if (entry) {
            try {
                entry.client.end();
            } catch {}
            this.pool.delete(connectionId);
        }
    }

    public closeAll(): void {
        for (const [id] of this.pool) {
            this.close(id);
        }
    }
}
