# Phase 1: Core SysAdmin & High-Performance SSH Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement SSH connection pooling and session multiplexing in the backend, add a Systemd Service Manager tab, and add a Centralized Log Viewer tab in the Nautilus desktop application.

**Architecture:** Maintain pooled SSH clients per connectionId in backend memory with auto-reconnect and channel multiplexing for low-latency command execution. Build dedicated modular backend services for Systemd management and log streaming (via existing SSE infrastructure). In the frontend, add 'services' and 'logs' views in ConnectionPane using Ant Design Pro components.

**Tech Stack:** TypeScript, Node.js (ssh2, Express SSE), React 18, Ant Design 5 / ProComponents, Vite, Tauri v2.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-1-core-sysadmin-design.md`

## Global Constraints
- Do not introduce breaking changes to existing features (Docker, Terminal, SFTP, Env, Cron, Processes).
- Enforce strict input validation on service and log targets to prevent shell injection.
- Support both English (`en`) and Portuguese (`pt-BR`) i18n locales.
- Backend TypeScript must pass `npm run typecheck` (`tsc --noEmit` in `backend/`).
- Frontend must pass `npm run build` (`vite build`).

---

### Task 1: SSH Connection Pool & Session Multiplexer

**Files:**
- Create: `backend/src/features/terminal/ssh-pool.service.ts`
- Modify: `backend/src/features/terminal/index.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces: `SSHPoolManager` class with `acquire(connectionId: string, authConfig: SSHConfig): Promise<Client>`, `exec(connectionId: string, authConfig: SSHConfig, command: string): Promise<{ stdout: string; stderr: string }>`, `close(connectionId: string): void`.

- [ ] **Step 1: Create `backend/src/features/terminal/ssh-pool.service.ts`**

Implement connection pooling with keepalive and automatic recovery:
```typescript
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

    public async acquire(connectionId: string, authConfig: SSHConfig): Promise<Client> {
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

        const connectPromise = new Promise<Client>((resolve, reject) => {
            const disarm = verifier.armTimeout((err) => {
                client.end();
                this.pool.delete(connectionId);
                reject(err);
            });

            client
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
                    keepaliveInterval: 15000,
                    keepaliveCountMax: 3,
                    ...authConfig,
                    readyTimeout: verifier.readyTimeout,
                    hostVerifier: verifier.verify
                });
        });

        this.pool.set(connectionId, {
            client,
            authConfig,
            isConnecting: true,
            connectPromise,
            lastUsed: Date.now()
        });

        return connectPromise;
    }

    public async exec(connectionId: string, authConfig: SSHConfig, command: string): Promise<SSHExecResult> {
        let client: Client;
        try {
            client = await this.acquire(connectionId, authConfig);
        } catch (err) {
            throw err;
        }

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
            // If connection was dropped, clear from pool and retry once
            const isConnectionDrop = err?.message?.includes('Channel open failure') || 
                                     err?.message?.includes('Not connected') ||
                                     err?.message?.includes('closed');
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
```

- [ ] **Step 2: Export pool in `backend/src/features/terminal/index.ts`**

Add `export * from './ssh-pool.service';`.

- [ ] **Step 3: Integrate `SSHPoolManager` into `backend/src/index.ts`**

Import `SSHPoolManager` and replace individual `new SSHClient(authConfig)` in Docker handlers (`ssm:docker:check`, `ssm:docker:list`, etc.) with `SSHPoolManager.getInstance().exec(connectionId, authConfig, command)`. Add cleanup on connection disconnect and app shutdown.

- [ ] **Step 4: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

Run: `git add backend/src/features/terminal/ssh-pool.service.ts backend/src/features/terminal/index.ts backend/src/index.ts && git commit -m "feat(backend): implement SSH connection pool and session multiplexer"`

---

### Task 2: Systemd Services Backend Service & Handlers

**Files:**
- Create: `backend/src/features/services/services.service.ts`
- Create: `backend/src/features/services/index.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces:
  - `listServices(connectionId: string, authConfig: SSHConfig): Promise<{ supported: boolean; services: SystemdService[] }>`
  - `actionService(connectionId: string, authConfig: SSHConfig, serviceName: string, action: ServiceAction): Promise<void>`
  - `getServiceStatus(connectionId: string, authConfig: SSHConfig, serviceName: string): Promise<string>`

- [ ] **Step 1: Create `backend/src/features/services/services.service.ts`**

Implement unit parsing and validation:
```typescript
import { SSHPoolManager } from '../terminal/ssh-pool.service';
import type { SSHConfig } from '../../shared/types';

export interface SystemdService {
    name: string;
    description: string;
    loadState: string;
    activeState: string;
    subState: string;
    enabledState?: string;
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';

const SERVICE_NAME_REGEX = /^[a-zA-Z0-9_@.-]+$/;

export class ServicesService {
    private pool = SSHPoolManager.getInstance();

    public async listServices(connectionId: string, authConfig: SSHConfig): Promise<{ supported: boolean; services: SystemdService[] }> {
        // Check if systemctl is available
        try {
            const check = await this.pool.exec(connectionId, authConfig, 'which systemctl 2>/dev/null || command -v systemctl');
            if (!check.stdout.trim()) {
                return { supported: false, services: [] };
            }
        } catch {
            return { supported: false, services: [] };
        }

        // List active and inactive units
        const unitsOutput = await this.pool.exec(
            connectionId,
            authConfig,
            'systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null'
        );

        // Fetch enabled state in batch
        let enabledMap = new Map<string, string>();
        try {
            const filesOutput = await this.pool.exec(
                connectionId,
                authConfig,
                'systemctl list-unit-files --type=service --no-legend --no-pager 2>/dev/null'
            );
            for (const line of filesOutput.stdout.split('\n')) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    enabledMap.set(parts[0], parts[1]);
                }
            }
        } catch {}

        const services: SystemdService[] = [];
        for (const line of unitsOutput.stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Format: UNIT LOAD ACTIVE SUB DESCRIPTION...
            // Note: unit names may contain dots and dashes (e.g. nginx.service, systemd-journald.service)
            // Sometimes a bullet (●) is prepended for failed units
            const cleanLine = trimmed.replace(/^[●*]\s*/, '');
            const match = cleanLine.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
            if (match) {
                const [, name, loadState, activeState, subState, description] = match;
                if (name.endsWith('.service')) {
                    services.push({
                        name,
                        description: description || '',
                        loadState,
                        activeState,
                        subState,
                        enabledState: enabledMap.get(name) || 'unknown'
                    });
                }
            }
        }

        return { supported: true, services };
    }

    public async actionService(
        connectionId: string,
        authConfig: SSHConfig,
        serviceName: string,
        action: ServiceAction
    ): Promise<void> {
        if (!SERVICE_NAME_REGEX.test(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }
        const validActions: ServiceAction[] = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
        if (!validActions.includes(action)) {
            throw new Error(`Invalid action: ${action}`);
        }

        // Try with sudo, fallback to direct systemctl
        await this.pool.exec(
            connectionId,
            authConfig,
            `sudo systemctl ${action} "${serviceName}" 2>&1 || systemctl ${action} "${serviceName}"`
        );
    }

    public async getServiceStatus(connectionId: string, authConfig: SSHConfig, serviceName: string): Promise<string> {
        if (!SERVICE_NAME_REGEX.test(serviceName)) {
            throw new Error(`Invalid service name: ${serviceName}`);
        }
        try {
            const result = await this.pool.exec(
                connectionId,
                authConfig,
                `systemctl status "${serviceName}" --no-pager -l 2>&1 || true`
            );
            return result.stdout;
        } catch (err: any) {
            return err.message || 'Error fetching status';
        }
    }
}
```

- [ ] **Step 2: Create `backend/src/features/services/index.ts`**

Export `ServicesService` and types.

- [ ] **Step 3: Register `ssm:services:*` handlers in `backend/src/index.ts`**

```typescript
const servicesService = new ServicesService();

// In apiHandlers map:
'ssm:services:list': async (args) => {
    const { connectionId } = args as { connectionId: string };
    const conn = await connectionManager.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn as AuthArgs);
    return servicesService.listServices(connectionId, authConfig);
},

'ssm:services:action': async (args) => {
    const { connectionId, serviceName, action } = args as { connectionId: string; serviceName: string; action: ServiceAction };
    const conn = await connectionManager.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn as AuthArgs);
    await servicesService.actionService(connectionId, authConfig, serviceName, action);
    return { success: true };
},

'ssm:services:status': async (args) => {
    const { connectionId, serviceName } = args as { connectionId: string; serviceName: string };
    const conn = await connectionManager.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn as AuthArgs);
    const status = await servicesService.getServiceStatus(connectionId, authConfig, serviceName);
    return { status };
},
```

- [ ] **Step 4: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/features/services/ backend/src/index.ts && git commit -m "feat(backend): add Systemd service manager handlers"`

---

### Task 3: Central Logs Backend Service & Streaming Handlers

**Files:**
- Create: `backend/src/features/logs/logs.service.ts`
- Create: `backend/src/features/logs/index.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces:
  - `readLogs(connectionId: string, authConfig: SSHConfig, options: ReadLogsOptions): Promise<{ lines: string[] }>`
  - `listFiles(connectionId: string, authConfig: SSHConfig): Promise<string[]>`
  - `startStream(connectionId: string, authConfig: SSHConfig, streamId: string, options: StreamLogsOptions, onData: (chunk: string) => void): Promise<void>`
  - `stopStream(streamId: string): void`

- [ ] **Step 1: Create `backend/src/features/logs/logs.service.ts`**

```typescript
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
            cmd = `journalctl ${serviceArg} ${sinceArg} ${priorityArg} -n ${Math.min(lines, 1000)} --no-pager -o short-iso 2>&1`;
        } else {
            cmd = `tail -n ${Math.min(lines, 1000)} "${target}" 2>&1`;
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
}
```

- [ ] **Step 2: Create `backend/src/features/logs/index.ts`**

Export `LogsService` and interfaces.

- [ ] **Step 3: Register `ssm:logs:*` handlers in `backend/src/index.ts`**

Add handlers for `ssm:logs:read`, `ssm:logs:listFiles`, `ssm:logs:stream:start`, `ssm:logs:stream:stop`. Wire `onData` in `startStream` to emit SSE events via `broadcastEvent('ssm:logs:stream:data', { streamId, chunk })`.

- [ ] **Step 4: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/features/logs/ backend/src/index.ts && git commit -m "feat(backend): add Central Logs service and streaming handlers"`

---

### Task 4: Frontend Types & Tauri Bridge Integration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/tauri-bridge.ts`

**Interfaces:**
- Produces: Updated `SSMAPI` with `servicesList`, `servicesAction`, `servicesStatus`, `logsRead`, `logsListFiles`, `logsStreamStart`, `logsStreamStop`, `onLogsStreamData`.

- [ ] **Step 1: Add types in `src/types.ts`**

```typescript
export interface SystemdService {
    name: string;
    description: string;
    loadState: string;
    activeState: string;
    subState: string;
    enabledState?: string;
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';

export interface ReadLogsOptions {
    source: 'journal' | 'file';
    target: string;
    lines?: number;
    since?: string;
    priority?: string;
}

export interface LogStreamDataPayload {
    streamId: string;
    chunk: string;
}
```

Add these methods to the `SSMAPI` interface.

- [ ] **Step 2: Implement methods in `src/tauri-bridge.ts`**

Implement `servicesList`, `servicesAction`, `servicesStatus`, `logsRead`, `logsListFiles`, `logsStreamStart`, `logsStreamStop`, and `onLogsStreamData(callback)`.

- [ ] **Step 3: Typecheck frontend**

Run: `npm run build`
Expected: PASS with no errors.

- [ ] **Step 4: Commit**

Run: `git add src/types.ts src/tauri-bridge.ts && git commit -m "feat(bridge): expose Systemd services and logs API in Tauri bridge"`

---

### Task 5: Systemd Service Manager Component & Translations

**Files:**
- Create: `src/components/services/ServiceManager.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add translations for Services in `src/i18n/locales/en.json` and `pt-BR.json`**

Keys under `services`:
- `title`: "System Services" / "Serviços do Sistema"
- `not_supported`: "Systemd is not available on this server" / "Systemd não está disponível neste servidor"
- `active`: "Active" / "Ativos"
- `failed`: "Failed" / "Com Falha"
- `inactive`: "Inactive" / "Inativos"
- `restart`: "Restart" / "Reiniciar"
- `start`: "Start" / "Iniciar"
- `stop`: "Stop" / "Parar"
- `enable`: "Enable" / "Habilitar"
- `disable`: "Disable" / "Desabilitar"
- `details`: "Details" / "Detalhes"
- `view_logs`: "View Logs" / "Ver Logs"
- `search_placeholder`: "Search services by name or description..." / "Buscar serviços por nome ou descrição..."

- [ ] **Step 2: Create `src/components/services/ServiceManager.tsx`**

Build the React component with Ant Design:
- Header with stats cards (Total, Active, Failed, Inactive).
- Search input and status segmented filter (`all | active | failed | inactive`).
- Ant Design Table with pagination, status badges, action buttons with popconfirms.
- Drawer to inspect full `systemctl status` output with a button to navigate to the Log Viewer.

- [ ] **Step 3: Typecheck frontend**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add src/components/services/ServiceManager.tsx src/i18n/locales/ && git commit -m "feat(ui): add Systemd ServiceManager component and translations"`

---

### Task 6: Central Log Viewer Component & Translations

**Files:**
- Create: `src/components/logs/LogManager.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add translations for Logs in `src/i18n/locales/en.json` and `pt-BR.json`**

Keys under `logs`:
- `title`: "System Logs" / "Logs do Sistema"
- `journal`: "Journald (Services)" / "Journald (Serviços)"
- `files`: "Log Files (/var/log)" / "Arquivos de Log (/var/log)"
- `select_service`: "Select a service..." / "Selecione um serviço..."
- `select_file`: "Select a log file..." / "Selecione um arquivo de log..."
- `priority`: "Priority" / "Prioridade"
- `all_priorities`: "All Priorities" / "Todas as Prioridades"
- `errors_only`: "Errors Only (err..emerg)" / "Apenas Erros (err..emerg)"
- `warnings_plus`: "Warnings & Errors" / "Avisos e Erros"
- `time_range`: "Period" / "Período"
- `live_stream`: "Live Stream" / "Transmissão ao Vivo"
- `autoscroll`: "Auto-scroll" / "Rolagem Automática"
- `clear`: "Clear" / "Limpar"
- `copy`: "Copy" / "Copiar"
- `download`: "Download" / "Baixar"

- [ ] **Step 2: Create `src/components/logs/LogManager.tsx`**

Build the React component:
- Top toolbar with Segmented toggle (`journal` / `file`), target Select dropdown with search, priority Select, time range Select, and Live Stream switch.
- Action icons: Copy to clipboard, Clear console, Download `.txt`.
- Console viewer: Dark terminal styling, monospace font, auto-scroll when stream is active, and regex highlight matching.
- Clean stream cleanup via `logsStreamStop` when the component unmounts or target changes.

- [ ] **Step 3: Typecheck frontend**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add src/components/logs/LogManager.tsx src/i18n/locales/ && git commit -m "feat(ui): add Central LogManager component and translations"`

---

### Task 7: Layout & Navigation Integration in `ConnectionPane`

**Files:**
- Modify: `src/components/connections/ConnectionPane.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add tab keys and labels to `ConnectionPane.tsx`**

Add:
- `services`: `<ClusterOutlined />` -> `t('common.services')`
- `logs`: `<ProfileOutlined />` -> `t('common.logs')`

Integrate `ServiceManager` and `LogManager` in the tab rendering container with conditional rendering and state preservation.

- [ ] **Step 2: Test navigation and build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

Run: `git add src/components/connections/ConnectionPane.tsx src/i18n/locales/ && git commit -m "feat(nav): integrate Services and Logs tabs in ConnectionPane"`

---

### Task 8: Full End-to-End Build & Validation

**Files:**
- All modified and created files

- [ ] **Step 1: Run Backend Typecheck**

Run: `cd backend && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2: Build Backend Dist**

Run: `cd backend && npm run build:ts`
Expected: Clean compilation to `backend/dist/`.

- [ ] **Step 3: Run Frontend Build**

Run: `npm run build`
Expected: Vite build completes cleanly into `dist/`.

- [ ] **Step 4: Verify git status and commit any remaining changes**

Run: `git status`
Expected: Clean working tree.
