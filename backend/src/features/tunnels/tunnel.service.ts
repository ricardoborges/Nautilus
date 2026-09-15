import net from 'net';
import crypto from 'crypto';
import { SSHPoolManager } from '../terminal/ssh-pool.service';
import { getDatabase, saveDatabase, query, queryOne } from '../../shared/database';
import type { BindParams } from 'sql.js';
import type { SSHConfig } from '../../shared/types';
import logger from '../../shared/utils/logger';

export interface TunnelConfig {
    id: string;
    connectionId: string;
    name: string;
    tunnelType: 'local' | 'remote';
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    autoStart: boolean;
    createdAt?: string;
}

export interface TunnelRuntimeInfo extends TunnelConfig {
    status: 'active' | 'inactive' | 'error';
    error?: string;
    activeConnections: number;
}

interface TunnelRow {
    id: string;
    connection_id: string;
    name: string;
    tunnel_type: string;
    local_host: string;
    local_port: number;
    remote_host: string;
    remote_port: number;
    auto_start: number;
    created_at: string;
}

interface ActiveTunnelInstance {
    config: TunnelConfig;
    server: net.Server;
    activeSockets: Set<net.Socket>;
}

function rowToConfig(row: TunnelRow): TunnelConfig {
    return {
        id: row.id,
        connectionId: row.connection_id,
        name: row.name,
        tunnelType: row.tunnel_type as 'local' | 'remote',
        localHost: row.local_host || '127.0.0.1',
        localPort: row.local_port,
        remoteHost: row.remote_host || '127.0.0.1',
        remotePort: row.remote_port,
        autoStart: Boolean(row.auto_start),
        createdAt: row.created_at,
    };
}

export class TunnelService {
    private pool = SSHPoolManager.getInstance();
    private activeTunnels = new Map<string, ActiveTunnelInstance>();
    private tunnelErrors = new Map<string, string>();

    public async listTunnels(connectionId: string): Promise<TunnelRuntimeInfo[]> {
        const rows = query<TunnelRow>(
            'SELECT * FROM tunnels WHERE connection_id = ? ORDER BY created_at DESC',
            [connectionId]
        );

        return rows.map((row) => {
            const config = rowToConfig(row);
            const active = this.activeTunnels.get(config.id);
            const error = this.tunnelErrors.get(config.id);

            let status: 'active' | 'inactive' | 'error' = 'inactive';
            if (active) status = 'active';
            else if (error) status = 'error';

            return {
                ...config,
                status,
                error: error || undefined,
                activeConnections: active ? active.activeSockets.size : 0,
            };
        });
    }

    public async getTunnel(id: string): Promise<TunnelConfig | null> {
        const row = queryOne<TunnelRow>('SELECT * FROM tunnels WHERE id = ?', [id]);
        return row ? rowToConfig(row) : null;
    }

    public async createTunnel(data: Omit<TunnelConfig, 'id'>): Promise<TunnelConfig> {
        const db = getDatabase();
        const id = crypto.randomUUID();

        const params: BindParams = [
            id,
            data.connectionId,
            data.name,
            data.tunnelType || 'local',
            data.localHost || '127.0.0.1',
            data.localPort,
            data.remoteHost || '127.0.0.1',
            data.remotePort,
            data.autoStart ? 1 : 0,
        ];

        db.run(`
            INSERT INTO tunnels (
                id, connection_id, name, tunnel_type,
                local_host, local_port, remote_host, remote_port, auto_start
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, params);

        saveDatabase();

        const created = queryOne<TunnelRow>('SELECT * FROM tunnels WHERE id = ?', [id]);
        if (!created) throw new Error('Failed to create tunnel');
        return rowToConfig(created);
    }

    public async updateTunnel(id: string, data: Partial<TunnelConfig>): Promise<void> {
        const existing = queryOne<TunnelRow>('SELECT * FROM tunnels WHERE id = ?', [id]);
        if (!existing) throw new Error('Tunnel not found');

        const wasActive = this.activeTunnels.has(id);
        if (wasActive) {
            await this.stopTunnel(id);
        }

        const db = getDatabase();
        const current = rowToConfig(existing);

        const params: BindParams = [
            data.name ?? current.name,
            data.tunnelType ?? current.tunnelType,
            data.localHost ?? current.localHost,
            data.localPort ?? current.localPort,
            data.remoteHost ?? current.remoteHost,
            data.remotePort ?? current.remotePort,
            data.autoStart !== undefined ? (data.autoStart ? 1 : 0) : (current.autoStart ? 1 : 0),
            id,
        ];

        db.run(`
            UPDATE tunnels SET
                name = ?,
                tunnel_type = ?,
                local_host = ?,
                local_port = ?,
                remote_host = ?,
                remote_port = ?,
                auto_start = ?
            WHERE id = ?
        `, params);

        saveDatabase();
    }

    public async deleteTunnel(id: string): Promise<void> {
        await this.stopTunnel(id);

        const db = getDatabase();
        db.run('DELETE FROM tunnels WHERE id = ?', [id]);
        saveDatabase();
    }

    public async startTunnel(id: string, authConfig: SSHConfig): Promise<void> {
        if (this.activeTunnels.has(id)) {
            return; // Already running
        }

        const row = queryOne<TunnelRow>('SELECT * FROM tunnels WHERE id = ?', [id]);
        if (!row) throw new Error('Tunnel not found');
        const config = rowToConfig(row);

        this.tunnelErrors.delete(id);

        if (config.tunnelType === 'local') {
            return new Promise<void>((resolve, reject) => {
                const activeSockets = new Set<net.Socket>();
                const server = net.createServer(async (socket) => {
                    activeSockets.add(socket);

                    socket.on('close', () => {
                        activeSockets.delete(socket);
                    });

                    socket.on('error', (err) => {
                        logger.warn(`[Tunnel:${config.name}] Client socket error:`, err);
                        activeSockets.delete(socket);
                    });

                    try {
                        const sshClient = await this.pool.acquire(config.connectionId, authConfig);
                        sshClient.forwardOut(
                            '127.0.0.1',
                            socket.remotePort || 0,
                            config.remoteHost,
                            config.remotePort,
                            (err, stream) => {
                                if (err) {
                                    logger.error(`[Tunnel:${config.name}] SSH forwardOut error:`, err);
                                    socket.destroy();
                                    return;
                                }

                                socket.pipe(stream).pipe(socket);

                                stream.on('close', () => socket.destroy());
                                socket.on('close', () => stream.close());
                            }
                        );
                    } catch (err) {
                        logger.error(`[Tunnel:${config.name}] Failed to get SSH client:`, err);
                        socket.destroy();
                    }
                });

                server.on('error', (err: any) => {
                    let errorMessage = err.message || 'Error starting tunnel';
                    if (err.code === 'EADDRINUSE') {
                        errorMessage = `Port ${config.localPort} is already in use on your machine.`;
                    }
                    this.tunnelErrors.set(id, errorMessage);
                    this.activeTunnels.delete(id);
                    logger.error(`[Tunnel:${config.name}] Server error:`, errorMessage);
                    reject(new Error(errorMessage));
                });

                server.listen(config.localPort, config.localHost, () => {
                    logger.info(`[Tunnel:${config.name}] Listening on ${config.localHost}:${config.localPort} -> ${config.remoteHost}:${config.remotePort}`);
                    this.activeTunnels.set(id, { config, server, activeSockets });
                    resolve();
                });
            });
        } else {
            // Remote port forwarding: sshClient.forwardIn
            const sshClient = await this.pool.acquire(config.connectionId, authConfig);
            return new Promise<void>((resolve, reject) => {
                sshClient.forwardIn(config.remoteHost, config.remotePort, (err) => {
                    if (err) {
                        this.tunnelErrors.set(id, err.message);
                        return reject(err);
                    }
                    resolve();
                });
            });
        }
    }

    public async stopTunnel(id: string): Promise<void> {
        this.tunnelErrors.delete(id);
        const active = this.activeTunnels.get(id);
        if (!active) return;

        // Close all active socket connections
        for (const socket of active.activeSockets) {
            try {
                socket.destroy();
            } catch {}
        }
        active.activeSockets.clear();

        // Close server listener
        await new Promise<void>((resolve) => {
            active.server.close(() => resolve());
        });

        this.activeTunnels.delete(id);
        logger.info(`[Tunnel:${active.config.name}] Stopped.`);
    }

    public stopAll(connectionId?: string): void {
        for (const [id, instance] of this.activeTunnels) {
            if (!connectionId || instance.config.connectionId === connectionId) {
                for (const socket of instance.activeSockets) {
                    try {
                        socket.destroy();
                    } catch {}
                }
                instance.activeSockets.clear();
                try {
                    instance.server.close();
                } catch {}
                this.activeTunnels.delete(id);
            }
        }
    }
}
