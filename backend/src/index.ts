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
import { initializeDatabase, closeDatabase, exportDatabase, importDatabase } from './shared/database';
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

    // Database handlers
    'ssm:database:export': async () => {
        return { data: exportDatabase() };
    },

    'ssm:database:import': async (args) => {
        const { data } = args as { data: string };
        await importDatabase(data);
        return { success: true };
    },

    // Docker handlers
    'ssm:docker:check': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();

            // Check if docker command exists
            const versionResult = await ssh.exec('docker --version 2>/dev/null');
            if (versionResult.stdout && versionResult.stdout.includes('Docker version')) {
                const versionMatch = versionResult.stdout.match(/Docker version ([^,]+)/);

                // Try to get containers count
                let containersCount = 0;
                try {
                    const infoResult = await ssh.exec('docker info --format "{{.Containers}}" 2>/dev/null');
                    containersCount = parseInt(infoResult.stdout.trim()) || 0;
                } catch {
                    // Ignore - user may not have permission to run docker info
                }

                return {
                    available: true,
                    version: versionMatch ? versionMatch[1] : 'unknown',
                    containers: containersCount,
                };
            }
            return { available: false };
        } catch {
            return { available: false };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:list': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            // List all containers with extended format including labels for stack detection
            const result = await ssh.exec('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}|{{.Label \\"com.docker.compose.project\\"}}"');
            const containerLines = result.stdout.trim().split('\n').filter(line => line.trim());

            // Get IP addresses for all containers using docker inspect
            const ipResult = await ssh.exec('docker inspect --format "{{.Name}}|{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" $(docker ps -aq 2>/dev/null) 2>/dev/null || echo ""');
            const ipMap = new Map<string, string>();
            if (ipResult.stdout.trim()) {
                ipResult.stdout.trim().split('\n').filter(line => line.trim()).forEach(line => {
                    const [name, ip] = line.split('|');
                    if (name) {
                        // Remove leading slash from container name
                        ipMap.set(name.replace(/^\//, ''), ip || '');
                    }
                });
            }

            const containers = containerLines.map(line => {
                const [id, name, image, status, state, ports, created, stack] = line.split('|');
                return {
                    id: id || '',
                    name: name || '',
                    image: image || '',
                    status: status || '',
                    state: state || 'unknown',
                    ports: ports || '',
                    created: created || '',
                    stack: stack || '',
                    ipAddress: ipMap.get(name) || '',
                };
            });
            return containers;
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:action': async (args) => {
        const { connectionId, containerId, action } = args as {
            connectionId: string;
            containerId: string;
            action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause' | 'kill';
        };

        // Validate action
        const validActions = ['start', 'stop', 'restart', 'remove', 'pause', 'unpause', 'kill'];
        if (!validActions.includes(action)) {
            throw new Error('Ação inválida');
        }

        // Validate container ID/name (alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerId)) {
            throw new Error('ID de container inválido');
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const dockerAction = action === 'remove' ? 'rm -f' : action;
            const result = await ssh.exec(`docker ${dockerAction} ${containerId}`);
            if (result.stderr && !result.stdout) {
                throw new Error(result.stderr);
            }
            return { success: true };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:images': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            // List all images with formatted output
            const result = await ssh.exec('docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"');
            const images = result.stdout.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [id, repository, tag, size, created] = line.split('|');
                    return {
                        id: id || '',
                        repository: repository || '',
                        tag: tag || '',
                        size: size || '',
                        created: created || '',
                    };
                });
            return images;
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:imageAction': async (args) => {
        const { connectionId, imageId, action } = args as {
            connectionId: string;
            imageId: string;
            action: 'remove';
        };

        // Validate action
        if (action !== 'remove') {
            throw new Error('Ação inválida');
        }

        // Validate image ID (alphanumeric and colons for tags)
        if (!/^[a-zA-Z0-9:._\-/]+$/.test(imageId)) {
            throw new Error('ID de imagem inválido');
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec(`docker rmi ${imageId}`);
            if (result.stderr && !result.stdout) {
                throw new Error(result.stderr);
            }
            return { success: true };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:logs': async (args) => {
        const { connectionId, containerId, tail = 200 } = args as {
            connectionId: string;
            containerId: string;
            tail?: number;
        };

        // Validate container ID/name (alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerId)) {
            throw new Error('ID de container inválido');
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec(`docker logs --tail ${tail} --timestamps ${containerId} 2>&1`);
            return result.stdout || result.stderr || '';
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:volumes': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            // Get volume list with details including creation time
            const result = await ssh.exec('docker volume ls -q');
            const volumeNames = result.stdout.trim().split('\n').filter(name => name.trim());

            if (volumeNames.length === 0) {
                return [];
            }

            // Get detailed info for each volume using docker volume inspect
            const inspectResult = await ssh.exec(`docker volume inspect ${volumeNames.join(' ')} --format "{{.Name}}|{{.Driver}}|{{.Mountpoint}}|{{.CreatedAt}}" 2>/dev/null || echo ""`);

            // Get volume sizes using docker system df -v
            let volumeSizes: Record<string, string> = {};
            try {
                const dfResult = await ssh.exec('docker system df -v --format "{{json .}}" 2>/dev/null | grep -A1000 "Volumes" || echo ""');
                // Parse volume sizes from docker system df output
                // Try alternative command that gives us volume sizes directly
                const sizeResult = await ssh.exec('docker system df -v 2>/dev/null | grep -E "^[a-f0-9]{12,}" || echo ""');
                const sizeLines = sizeResult.stdout.trim().split('\n').filter(line => line.trim());
                for (const line of sizeLines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        // Format: VOLUME NAME   LINKS   SIZE
                        const volName = parts[0];
                        const size = parts[parts.length - 1];
                        volumeSizes[volName] = size;
                    }
                }
            } catch {
                // Ignore size errors - we'll just not show sizes
            }

            const volumes = inspectResult.stdout.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [name, driver, mountpoint, created] = line.split('|');
                    // Format created date (2025-12-15T17:08:25-03:00 -> 2025-12-15 17:08:25)
                    let formattedCreated = created || '';
                    const dateMatch = formattedCreated.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
                    if (dateMatch) {
                        formattedCreated = `${dateMatch[1]} ${dateMatch[2]}`;
                    }

                    // Get size - try exact match first, then partial match
                    let size = volumeSizes[name] || '';
                    if (!size) {
                        // Try partial match for truncated volume names
                        const shortName = name?.substring(0, 12);
                        for (const [volName, volSize] of Object.entries(volumeSizes)) {
                            if (volName.startsWith(shortName) || name?.startsWith(volName)) {
                                size = volSize;
                                break;
                            }
                        }
                    }

                    return {
                        name: name || '',
                        driver: driver || '',
                        mountpoint: mountpoint || '',
                        created: formattedCreated,
                        size: size || '-',
                    };
                });
            return volumes;
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:volumeAction': async (args) => {
        const { connectionId, volumeName, action } = args as {
            connectionId: string;
            volumeName: string;
            action: 'remove';
        };

        // Validate action
        if (action !== 'remove') {
            throw new Error('Ação inválida');
        }

        // Validate volume name (alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(volumeName)) {
            throw new Error('Nome de volume inválido');
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec(`docker volume rm ${volumeName}`);
            if (result.stderr && !result.stdout) {
                throw new Error(result.stderr);
            }
            return { success: true };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:networks': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            // Get network IDs
            const listResult = await ssh.exec('docker network ls -q');
            const networkIds = listResult.stdout.trim().split('\n').filter(id => id.trim());

            if (networkIds.length === 0) {
                return [];
            }

            // Get detailed info using docker network inspect with JSON format
            const inspectResult = await ssh.exec(`docker network inspect ${networkIds.join(' ')} 2>/dev/null || echo "[]"`);

            try {
                const networksData = JSON.parse(inspectResult.stdout.trim()) as Array<{
                    Id: string;
                    Name: string;
                    Driver: string;
                    Scope: string;
                    Attachable: boolean;
                    Labels: Record<string, string>;
                    IPAM: {
                        Driver: string;
                        Config: Array<{ Subnet?: string; Gateway?: string }>;
                    };
                }>;

                const networks = networksData.map(net => {
                    // Check if it's a system network (bridge, host, none)
                    const isSystem = ['bridge', 'host', 'none'].includes(net.Name);

                    // Get stack name from labels
                    const stack = net.Labels?.['com.docker.compose.project'] || '';

                    // Get IPAM config
                    const ipamConfig = net.IPAM?.Config?.[0] || {};

                    return {
                        id: net.Id?.substring(0, 12) || '',
                        name: net.Name || '',
                        driver: net.Driver || '',
                        scope: net.Scope || '',
                        attachable: net.Attachable || false,
                        internal: false,
                        ipamDriver: net.IPAM?.Driver || 'default',
                        subnet: ipamConfig.Subnet || '',
                        gateway: ipamConfig.Gateway || '',
                        stack: stack,
                        isSystem: isSystem,
                    };
                });

                return networks;
            } catch {
                // Fallback to simple format if JSON parsing fails
                const simpleResult = await ssh.exec('docker network ls --format "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}"');
                return simpleResult.stdout.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const [id, name, driver, scope] = line.split('|');
                        const isSystem = ['bridge', 'host', 'none'].includes(name);
                        return {
                            id: id || '',
                            name: name || '',
                            driver: driver || '',
                            scope: scope || '',
                            attachable: false,
                            internal: false,
                            ipamDriver: 'default',
                            subnet: '',
                            gateway: '',
                            stack: '',
                            isSystem: isSystem,
                        };
                    });
            }
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:networkAction': async (args) => {
        const { connectionId, networkId, action } = args as {
            connectionId: string;
            networkId: string;
            action: 'remove';
        };

        // Validate action
        if (action !== 'remove') {
            throw new Error('Ação inválida');
        }

        // Validate network ID/name (alphanumeric, hyphens, underscores, dots)
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(networkId)) {
            throw new Error('ID de rede inválido');
        }

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();
            const result = await ssh.exec(`docker network rm ${networkId}`);
            if (result.stderr && !result.stdout) {
                throw new Error(result.stderr);
            }
            return { success: true };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:stacks': async (args) => {
        const { connectionId } = args as { connectionId: string };
        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Conexão não encontrada');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();

            // Get all unique compose project names from containers
            const containersResult = await ssh.exec('docker ps -a --format "{{.Labels}}" 2>/dev/null || echo ""');
            const projectsMap = new Map<string, { name: string; created: string }>();

            const lines = containersResult.stdout.trim().split('\n').filter(line => line.trim());

            for (const line of lines) {
                // Parse labels to find com.docker.compose.project
                const projectMatch = line.match(/com\.docker\.compose\.project=([^,]+)/);
                if (projectMatch) {
                    const projectName = projectMatch[1];
                    if (!projectsMap.has(projectName)) {
                        // Get the creation time of the oldest container in the stack
                        const createdResult = await ssh.exec(
                            `docker ps -a --filter "label=com.docker.compose.project=${projectName}" --format "{{.CreatedAt}}" | head -1 2>/dev/null || echo ""`
                        );
                        const createdAt = createdResult.stdout.trim() || '';
                        projectsMap.set(projectName, {
                            name: projectName,
                            created: createdAt,
                        });
                    }
                }
            }

            // Convert map to array
            const stacks = Array.from(projectsMap.values()).map(stack => ({
                name: stack.name,
                type: 'Compose',
                control: 'Limited',
                created: stack.created,
            }));

            return stacks;
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:deployStack': async (args) => {
        const { connectionId, stackName, composeContent, stacksDirectory } = args as {
            connectionId: string;
            stackName: string;
            composeContent: string;
            stacksDirectory: string;
        };

        // Validate stack name (alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(stackName)) {
            throw new Error('Invalid stack name. Use alphanumeric characters, hyphens, and underscores only.');
        }

        // Use provided directory or default
        const baseDir = stacksDirectory || '/tmp/nautilus-stacks';

        const conn = await connectionManager.get(connectionId);
        if (!conn) throw new Error('Connection not found');
        const authConfig = await getAuthConfig(conn as AuthArgs);
        const ssh = new SSHClient(authConfig);
        try {
            await ssh.connect();

            // Create the stack directory
            const stackDir = `${baseDir}/${stackName}`;
            await ssh.exec(`mkdir -p "${stackDir}"`);

            // Write the docker-compose.yml file using heredoc
            await ssh.exec(`cat > "${stackDir}/docker-compose.yml" << 'NAUTILUS_EOF'
${composeContent}
NAUTILUS_EOF`);

            // Try docker compose (plugin) first, fall back to docker-compose (standalone)
            // This ensures compatibility with both old and new Docker installations
            const composeCmd = `cd "${stackDir}" && (docker compose -p "${stackName}" up -d 2>&1 || docker-compose -p "${stackName}" up -d 2>&1)`;
            const result = await ssh.exec(composeCmd);

            // Check for errors in output
            const output = result.stdout || result.stderr || '';
            if (output.toLowerCase().includes('error') && !output.toLowerCase().includes('pulling') && !output.toLowerCase().includes('created') && !output.toLowerCase().includes('started')) {
                throw new Error(output);
            }

            return { success: true, output: result.stdout };
        } finally {
            ssh.end();
        }
    },

    'ssm:docker:convertRun': async (args) => {
        const { connectionId, dockerRunCommand } = args as {
            connectionId: string;
            dockerRunCommand: string;
        };

        // Validate that it's a docker run command
        const trimmed = dockerRunCommand.trim().toLowerCase();
        if (!trimmed.startsWith('docker run') && !trimmed.startsWith('docker container run')) {
            throw new Error('Invalid docker run command');
        }

        try {
            // Use composerize to convert docker run to compose
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const composerize = require('composerize');
            const composeYaml = composerize(dockerRunCommand);
            return composeYaml;
        } catch (error) {
            const err = error as Error;
            throw new Error(`Failed to convert docker run command: ${err.message}`);
        }
    },

    // RDP handlers - using native Windows mstsc.exe
    // Note: node-rdpjs doesn't support NLA (Network Level Authentication)
    // which is required on modern Windows servers, so we use mstsc.exe instead
    'ssm:rdp:connect': async (args) => {
        const { connectionId, host, port, username, password, domain, useWindowsAuth } = args as {
            connectionId: string;
            host: string;
            port: number;
            username: string;
            password?: string;
            domain?: string;
            useWindowsAuth: boolean;
        };

        // Validate host
        if (!host || !/^[a-zA-Z0-9.\-_]+$/.test(host)) {
            throw new Error('Invalid host');
        }

        const { spawn } = require('child_process');
        const portStr = port && port !== 3389 ? `:${port}` : '';
        const server = `${host}${portStr}`;

        // Store credentials using cmdkey if not using Windows Auth
        if (!useWindowsAuth && username && password) {
            const targetName = `TERMSRV/${host}`;
            const fullUsername = domain ? `${domain}\\${username}` : username;

            // Delete any existing credential first
            try {
                await new Promise<void>((resolve) => {
                    const delProc = spawn('cmdkey', ['/delete', targetName], { shell: true });
                    delProc.on('close', () => resolve());
                });
            } catch {
                // Ignore errors - credential might not exist
            }

            // Add new credential
            await new Promise<void>((resolve, reject) => {
                const addProc = spawn('cmdkey', [
                    '/generic', targetName,
                    '/user', fullUsername,
                    '/pass', password
                ], { shell: true });

                addProc.on('close', (code: number) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error('Failed to store RDP credentials'));
                    }
                });
            });
        }

        // Launch mstsc.exe
        const mstscProcess = spawn('mstsc', ['/v:' + server], {
            detached: true,
            stdio: 'ignore'
        });
        mstscProcess.unref();

        // Store session info
        const rdpSessions = (global as any).rdpSessions || new Map();
        rdpSessions.set(connectionId, { host, process: mstscProcess });
        (global as any).rdpSessions = rdpSessions;

        logger.info(`[RDP] Launched mstsc.exe for ${server}`);

        return { success: true, embedded: false };
    },

    'ssm:rdp:disconnect': async (args) => {
        const { connectionId } = args as { connectionId: string };

        const rdpSessions = (global as any).rdpSessions as Map<string, { host: string; process?: any }> | undefined;
        if (rdpSessions && rdpSessions.has(connectionId)) {
            const session = rdpSessions.get(connectionId);
            if (session) {
                // Clean up stored credentials
                try {
                    const { spawn } = require('child_process');
                    const targetName = `TERMSRV/${session.host}`;
                    const delProc = spawn('cmdkey', ['/delete', targetName], { shell: true });
                    await new Promise<void>((resolve) => {
                        delProc.on('close', () => resolve());
                    });
                    logger.info(`[RDP] Cleaned up credentials for ${session.host}`);
                } catch {
                    // Ignore errors
                }
                rdpSessions.delete(connectionId);
            }
        }

        return { success: true };
    },

    'ssm:rdp:mouse': async (args) => {
        const { connectionId, x, y, button, isPressed } = args as {
            connectionId: string;
            x: number;
            y: number;
            button: number;
            isPressed: boolean;
        };

        const rdpSessions = (global as any).rdpSessions as Map<string, { client?: any }> | undefined;
        if (rdpSessions && rdpSessions.has(connectionId)) {
            const session = rdpSessions.get(connectionId);
            if (session?.client) {
                try {
                    session.client.sendPointerEvent(x, y, button, isPressed);
                } catch (err) {
                    logger.error(`[RDP] Error sending mouse event: ${err}`);
                }
            }
        }

        return { success: true };
    },

    'ssm:rdp:keyboard': async (args) => {
        const { connectionId, scanCode, isPressed, isExtended } = args as {
            connectionId: string;
            scanCode: number;
            isPressed: boolean;
            isExtended: boolean;
        };

        const rdpSessions = (global as any).rdpSessions as Map<string, { client?: any }> | undefined;
        if (rdpSessions && rdpSessions.has(connectionId)) {
            const session = rdpSessions.get(connectionId);
            if (session?.client) {
                try {
                    session.client.sendKeyEventScancode(scanCode, isPressed, isExtended);
                } catch (err) {
                    logger.error(`[RDP] Error sending keyboard event: ${err}`);
                }
            }
        }

        return { success: true };
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

// Start the server after database initialization
async function startServer(): Promise<void> {
    try {
        // Initialize SQLite database
        await initializeDatabase();
        logger.info('Database initialized successfully');

        server.listen(PORT, '127.0.0.1', () => {
            logger.info(`Nautilus Backend running on http://127.0.0.1:${PORT}`);
            // Print port to stdout for Tauri to capture
            console.log(`PORT:${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

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
    closeDatabase();
    server.close(() => {
        process.exit(0);
    });
}

// Start the application
startServer();
