/**
 * Nautilus Backend Sidecar
 * 
 * This is a Node.js process that handles all SSH/SFTP operations.
 * It runs a local HTTP server for communication with the Tauri frontend.
 */

import http, { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import fs from 'fs/promises';
import { connectionManager } from './features/connections';
import { SFTPClient, SSHClient, TerminalSession } from './features/terminal';
import { SystemMonitor } from './features/metrics';
import { snippetManager } from './features/snippets';
import logger from './shared/utils/logger';
import type {
    SSHConfig,
    ConnectionData,
    Connection,
    APIRequest,
    Handler,
    HandlerRegistry,
    MetricsUpdate
} from './shared/types';

// Active services
let activeSystemMonitor: SystemMonitor | null = null;
const activeTerminals = new Map<string, TerminalSession>();

// Event subscribers (for metrics and terminal data)
const eventSubscribers = new Map<string, ServerResponse[]>();

interface AuthArgs extends ConnectionData {
    id?: string;
    password?: string;
}

async function getAuthConfig(connData: AuthArgs, useRawPassword: boolean = false): Promise<SSHConfig> {
    const authConfig: SSHConfig = {
        host: connData.host,
        port: connData.port || 22,
        username: connData.user,
    };

    logger.info(`[Auth] Getting auth config for ${connData.host} - method: ${connData.authMethod}, id: ${connData.id}`);

    if (connData.authMethod === 'password') {
        const password = useRawPassword ? connData.password : (connData.id ? await connectionManager.getPassword(connData.id) : null);
        logger.info(`[Auth] Password auth - useRaw: ${useRawPassword}, hasId: ${!!connData.id}, hasPassword: ${!!password}`);
        if (password) {
            authConfig.password = password;
        } else {
            logger.warn(`[Auth] No password found for connection ${connData.id}`);
        }
    } else if (connData.authMethod === 'key' && connData.keyPath) {
        try {
            logger.info(`[Auth] Key auth - reading key from: ${connData.keyPath}`);
            authConfig.privateKey = await fs.readFile(connData.keyPath);
        } catch (error) {
            throw new Error(`Failed to read private key at ${connData.keyPath}`);
        }
    } else {
        logger.warn(`[Auth] No valid auth method configured - method: ${connData.authMethod}, keyPath: ${connData.keyPath}`);
    }

    return authConfig;
}

// Handler registry
const handlers: HandlerRegistry = {
    // Connection handlers
    'ssm:connections:list': async (): Promise<Connection[]> => {
        return await connectionManager.list();
    },

    'ssm:connections:add': async (args): Promise<Connection> => {
        return await connectionManager.add(args as unknown as ConnectionData);
    },

    'ssm:connections:update': async (args): Promise<Connection | null> => {
        const { id, data } = args as { id: string; data: Partial<ConnectionData> };
        return await connectionManager.update(id, data);
    },

    'ssm:connections:remove': async (args): Promise<boolean> => {
        const { id } = args as { id: string };
        return await connectionManager.remove(id);
    },

    'ssm:connections:setPassword': async (args): Promise<void> => {
        const { id, password } = args as { id: string; password: string };
        return await connectionManager.setPassword(id, password);
    },

    'ssm:connections:getPassword': async (args): Promise<string | null> => {
        const { id } = args as { id: string };
        return await connectionManager.getPassword(id);
    },

    // SSH handlers
    'ssm:ssh:test': async (args): Promise<{ success: boolean }> => {
        const connArgs = args as unknown as AuthArgs;
        const authConfig = await getAuthConfig(connArgs, true);
        if (connArgs.id && connArgs.authMethod === 'password' && !connArgs.password) {
            authConfig.password = await connectionManager.getPassword(connArgs.id) || undefined;
        }
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return { success: true };
        } finally {
            sftp.disconnect();
        }
    },

    // SFTP handlers
    'ssm:sftp:list': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.list(remotePath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:readFile': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.readFile(remotePath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:readFileAsBase64': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.readFile(remotePath, 'base64');
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:writeFile': async (args) => {
        const { connectionId, path: remotePath, content } = args as { connectionId: string; path: string; content: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.writeFile(remotePath, content);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:deleteFile': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.deleteFile(remotePath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:deleteDir': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.deleteDir(remotePath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:createDir': async (args) => {
        const { connectionId, path: remotePath } = args as { connectionId: string; path: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.createDir(remotePath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:rename': async (args) => {
        const { connectionId, oldPath, newPath } = args as { connectionId: string; oldPath: string; newPath: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            return await sftp.rename(oldPath, newPath);
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:downloadFile': async (args) => {
        const { connectionId, remotePath } = args as { connectionId: string; remotePath: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            const content = await sftp.readFile(remotePath, 'base64');
            return { success: true, content, filename: path.basename(remotePath) };
        } finally {
            sftp.disconnect();
        }
    },

    'ssm:sftp:uploadFile': async (args) => {
        const { connectionId, remoteDir, fileName, content } = args as {
            connectionId: string;
            remoteDir: string;
            fileName: string;
            content: string
        };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const sftp = new SFTPClient(authConfig);
        try {
            await sftp.connect();
            const buffer = Buffer.from(content, 'base64');
            const remotePath = path.posix.join(remoteDir, fileName);
            await sftp.writeFileBuffer(remotePath, buffer);
            return { success: true, fileName };
        } finally {
            sftp.disconnect();
        }
    },

    // Process handlers
    'ssm:process:list': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec("ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu");
            return result.stdout;
        } finally {
            ssh.end();
        }
    },

    'ssm:process:kill': async (args) => {
        const { connectionId, pid } = args as { connectionId: string; pid: string };
        const safePid = parseInt(pid, 10);
        if (isNaN(safePid)) throw new Error('PID inválido.');

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec(`kill -9 ${safePid}`);
            return result.stdout;
        } finally {
            ssh.end();
        }
    },

    // Cron handlers
    'ssm:cron:list': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec("crontab -l 2>/dev/null || echo ''");
            return result.stdout;
        } finally {
            ssh.end();
        }
    },

    'ssm:cron:save': async (args) => {
        const { connectionId, content } = args as { connectionId: string; content: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();

            const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    const command = parts.slice(5).join(' ');
                    const scriptMatch = command.match(/^(\/[^\s>&;]+)/);
                    if (scriptMatch) {
                        const scriptPath = scriptMatch[1];
                        if (!scriptPath.startsWith('/bin/') && !scriptPath.startsWith('/usr/bin/') && !scriptPath.startsWith('/sbin/')) {
                            try {
                                await ssh.exec(`chmod +x "${scriptPath}" 2>/dev/null || true`);
                            } catch {
                                // Ignore chmod errors
                            }
                        }
                    }
                }
            }

            const escapedContent = content.replace(/'/g, "'\\''");
            await ssh.exec(`echo '${escapedContent}' | crontab -`);
            return { success: true };
        } finally {
            ssh.end();
        }
    },

    'ssm:cron:readLog': async (args) => {
        const { connectionId, logPath } = args as { connectionId: string; logPath: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const safeLogPath = logPath.replace(/[;&|`$]/g, '');
            const result = await ssh.exec(`tail -n 200 "${safeLogPath}" 2>/dev/null || echo "(Arquivo de log não encontrado: ${safeLogPath})"`);
            return result.stdout;
        } finally {
            ssh.end();
        }
    },

    // Metrics handlers
    'ssm:metrics:start': async (args) => {
        const { connectionId } = args as { connectionId: string };
        if (activeSystemMonitor) {
            activeSystemMonitor.stopPolling();
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');

        const authConfig = await getAuthConfig(conn as AuthArgs);
        activeSystemMonitor = new SystemMonitor(
            conn as Connection,
            authConfig,
            (data: MetricsUpdate) => {
                broadcastEvent('ssm:metrics:update', data);
            }
        );
        activeSystemMonitor.connectAndStartPolling();
        return { success: true };
    },

    'ssm:metrics:stop': async () => {
        if (activeSystemMonitor) {
            activeSystemMonitor.stopPolling();
            activeSystemMonitor = null;
        }
        return { success: true };
    },

    // Terminal handlers
    'ssm:terminal:create': async (args) => {
        const { connectionId, terminalId } = args as { connectionId: string; terminalId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');

        const authConfig = await getAuthConfig(conn as AuthArgs);
        const session = new TerminalSession(
            authConfig,
            (data: string) => {
                broadcastEvent('ssm:terminal:data', { id: terminalId, data });
            },
            terminalId
        );

        activeTerminals.set(terminalId, session);
        session.start();
        return { success: true };
    },

    'ssm:terminal:stop': async (args) => {
        const { terminalId } = args as { terminalId: string };
        const service = activeTerminals.get(terminalId);
        if (service) {
            service.stop();
            activeTerminals.delete(terminalId);
        }
        return { success: true };
    },

    'ssm:terminal:write': async (args) => {
        const { terminalId, data } = args as { terminalId: string; data: string };
        const service = activeTerminals.get(terminalId);
        if (service) {
            service.write(data);
        }
        return { success: true };
    },

    'ssm:terminal:resize': async (args) => {
        const { terminalId, cols, rows } = args as { terminalId: string; cols: number; rows: number };
        const service = activeTerminals.get(terminalId);
        if (service) {
            service.resize(cols, rows);
        }
        return { success: true };
    },

    // Snippets handlers
    'ssm:snippets:list': async () => {
        return await snippetManager.list();
    },

    'ssm:snippets:add': async (args) => {
        return await snippetManager.add(args as { name: string; command: string });
    },

    'ssm:snippets:update': async (args) => {
        return await snippetManager.update(args as { id: string; name: string; command: string });
    },

    'ssm:snippets:remove': async (args) => {
        const { id } = args as { id: string };
        return await snippetManager.remove(id);
    },
};

// Event broadcasting for SSE
function broadcastEvent(channel: string, data: unknown): void {
    const subscribers = eventSubscribers.get('events') || [];
    const message = JSON.stringify({ channel, data });
    subscribers.forEach(res => {
        try {
            res.write(`data: ${message}\n\n`);
        } catch {
            // Connection closed
        }
    });
}

// HTTP Server
const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Server-Sent Events for streaming updates
    if (req.url === '/events' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const subscribers = eventSubscribers.get('events') || [];
        subscribers.push(res);
        eventSubscribers.set('events', subscribers);

        req.on('close', () => {
            const current = eventSubscribers.get('events') || [];
            const index = current.indexOf(res);
            if (index > -1) {
                current.splice(index, 1);
                eventSubscribers.set('events', current);
            }
        });

        // Keep alive
        const keepAlive = setInterval(() => {
            try {
                res.write(':keepalive\n\n');
            } catch {
                clearInterval(keepAlive);
            }
        }, 30000);

        return;
    }

    // API endpoint
    if (req.url === '/api' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => body += chunk.toString());
        req.on('end', async () => {
            try {
                const { channel, args } = JSON.parse(body) as APIRequest;
                logger.info(`API: Received '${channel}'`);

                const handler = handlers[channel];
                if (handler) {
                    try {
                        const result = await handler(args || {});
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, result }));
                        logger.info(`API: Success for '${channel}'`);
                    } catch (error) {
                        const err = error as Error;
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                        logger.error(`API: Error in '${channel}': ${err.message}`);
                    }
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: `Unknown channel: ${channel}` }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // Health check
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const PORT = parseInt(process.env.NAUTILUS_BACKEND_PORT || '45678', 10);

server.listen(PORT, '127.0.0.1', () => {
    logger.info(`Nautilus Backend running on http://127.0.0.1:${PORT}`);
    // Print port to stdout for Tauri to capture
    console.log(`PORT:${PORT}`);
});

// Handle process exit
process.on('SIGTERM', () => {
    logger.info('Backend received SIGTERM, shutting down...');
    cleanup();
});

process.on('SIGINT', () => {
    logger.info('Backend received SIGINT, shutting down...');
    cleanup();
});

function cleanup(): void {
    if (activeSystemMonitor) {
        activeSystemMonitor.stopPolling();
    }
    activeTerminals.forEach((service) => service.stop());
    server.close(() => {
        process.exit(0);
    });
}
