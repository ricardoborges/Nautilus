# Phase 2: Connectivity, SSH Port Forwarding (Tunnels) & Jump Host (Bastion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement SSH Port Forwarding (Tunnels) with Local/Remote modes and database persistence, and add Bastion / Jump Host (`ProxyJump`) support for connecting to servers in private subnets.

**Architecture:** Extend SQLite database with a `tunnels` table and `bastion_connection_id` column. In the backend, `SSHPoolManager` encapsulates multi-hop SSH routing via `ssh2`'s `sock: stream` parameter. A dedicated `TunnelService` manages local TCP listeners using Node.js `net.createServer()` and pipes TCP sockets to SSH `forwardOut` channels. In the frontend, `ConnectionModal` gains a Jump Host selector, and a new `TunnelManager` view in `ConnectionPane` provides 1-click presets and live status toggles.

**Tech Stack:** TypeScript, Node.js (`net`, `ssh2`), SQLite (`sql.js`), React 18, Ant Design 5, Vite, Tauri v2.

**Spec:** `docs/superpowers/specs/2026-09-14-phase-2-connectivity-tunnels-design.md`

## Global Constraints
- Preserve backward compatibility with all existing database backups (`.ndb` export/import).
- Safely handle local port conflicts (`EADDRINUSE`) with user-friendly error messages.
- Clean up all TCP listeners and streams upon connection close or application exit.
- Support both English (`en`) and Portuguese (`pt-BR`) locales.
- Backend TypeScript must pass `npm run typecheck` (`tsc --noEmit`).
- Frontend must pass `npm run build` (`vite build`).

---

### Task 1: Database Migration for Tunnels & Bastion

**Files:**
- Modify: `backend/src/shared/database/index.ts`
- Modify: `backend/src/features/connections/connection.model.ts`
- Modify: `backend/src/features/connections/connection.repository.ts`

**Interfaces:**
- Produces: Updated schema with `tunnels` table and `bastion_connection_id` column in `connections` table.

- [ ] **Step 1: Update schema and migrations in `backend/src/shared/database/index.ts`**

Add migration for `bastion_connection_id` and create table `tunnels`:
```typescript
// In createSchema(database: SqlJsDatabase):
try { database.run("ALTER TABLE connections ADD COLUMN bastion_connection_id TEXT DEFAULT NULL"); } catch {}

database.run(`
    CREATE TABLE IF NOT EXISTS tunnels (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tunnel_type TEXT NOT NULL DEFAULT 'local',
        local_host TEXT NOT NULL DEFAULT '127.0.0.1',
        local_port INTEGER NOT NULL,
        remote_host TEXT NOT NULL DEFAULT '127.0.0.1',
        remote_port INTEGER NOT NULL,
        auto_start INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);
```

- [ ] **Step 2: Update Connection model and repository**

Add `bastionConnectionId?: string` to `Connection` interface and SQL queries in `connection.repository.ts`.

- [ ] **Step 3: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add backend/src/shared/database/index.ts backend/src/features/connections/ && git commit -m "feat(db): add tunnels table and bastion_connection_id column"`

---

### Task 2: Bastion / Jump Host Routing in `SSHPoolManager`

**Files:**
- Modify: `backend/src/features/terminal/ssh-pool.service.ts`
- Modify: `backend/src/shared/types/index.ts`

**Interfaces:**
- Produces: `SSHPoolManager.acquire(connectionId, authConfig, bastionConfig?)` routing target SSH socket through bastion stream.

- [ ] **Step 1: Update `SSHConfig` and `SSHPoolManager`**

Support `bastion?: { host: string; port: number; client: Client }` or resolving bastion client dynamically:
```typescript
// In SSHPoolManager:
public async acquireWithBastion(
    connectionId: string,
    authConfig: SSHConfig,
    getBastionClient?: () => Promise<Client>
): Promise<Client>
```
When `getBastionClient` is provided:
1. Connect / retrieve `bastionClient`.
2. Call `bastionClient.forwardOut('127.0.0.1', 0, authConfig.host, authConfig.port)`.
3. Pass returned stream as `sock: stream` in `targetClient.connect({ ...authConfig, sock: stream })`.

- [ ] **Step 2: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

Run: `git add backend/src/features/terminal/ssh-pool.service.ts backend/src/shared/types/index.ts && git commit -m "feat(ssh): implement ProxyJump support in SSHPoolManager"`

---

### Task 3: Tunnel Backend Service & Handlers

**Files:**
- Create: `backend/src/features/tunnels/tunnel.service.ts`
- Create: `backend/src/features/tunnels/index.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Produces: `TunnelService` with `listTunnels`, `createTunnel`, `updateTunnel`, `deleteTunnel`, `startTunnel`, `stopTunnel`, `stopAll`.

- [ ] **Step 1: Create `backend/src/features/tunnels/tunnel.service.ts`**

Implement local TCP server listener (`net.createServer`) forwarding connections to `sshClient.forwardOut`:
```typescript
import net from 'net';
import crypto from 'crypto';
import { SSHPoolManager } from '../terminal/ssh-pool.service';
import { getDatabase } from '../../shared/database';
import type { SSHConfig } from '../../shared/types';

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

interface ActiveTunnelInstance {
    server: net.Server;
    activeSockets: Set<net.Socket>;
}

export class TunnelService {
    private pool = SSHPoolManager.getInstance();
    private activeTunnels = new Map<string, ActiveTunnelInstance>();
    private tunnelErrors = new Map<string, string>();

    // Database CRUD methods and start/stop methods
}
```

- [ ] **Step 2: Create `backend/src/features/tunnels/index.ts`**

Export `TunnelService` and types.

- [ ] **Step 3: Register `ssm:tunnels:*` handlers in `backend/src/index.ts`**

Add handlers for `ssm:tunnels:list`, `ssm:tunnels:create`, `ssm:tunnels:update`, `ssm:tunnels:delete`, `ssm:tunnels:start`, `ssm:tunnels:stop`. Add `tunnelService.stopAll()` in backend `cleanup()`.

- [ ] **Step 4: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/features/tunnels/ backend/src/index.ts && git commit -m "feat(backend): add TunnelService and handlers"`

---

### Task 4: Frontend Types & Tauri Bridge Integration

**Files:**
- Modify: `src/types.ts`
- Modify: `src/tauri-bridge.ts`

**Interfaces:**
- Produces: `TunnelConfig`, `TunnelRuntimeInfo` types and `SSMAPI` tunnel methods.

- [ ] **Step 1: Add types in `src/types.ts`**

Add `TunnelConfig`, `TunnelRuntimeInfo`, and `bastionConnectionId` in `Connection`. Add methods to `SSMAPI`.

- [ ] **Step 2: Add implementations in `src/tauri-bridge.ts`**

Implement `tunnelsList`, `tunnelsCreate`, `tunnelsUpdate`, `tunnelsDelete`, `tunnelsStart`, `tunnelsStop`.

- [ ] **Step 3: Typecheck frontend**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add src/types.ts src/tauri-bridge.ts && git commit -m "feat(bridge): add tunnel and bastion API to bridge"`

---

### Task 5: ConnectionModal Bastion Selection UI & Translations

**Files:**
- Modify: `src/components/modals/ConnectionModal.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add translations for Bastion in `en.json` and `pt-BR.json`**

Keys: `bastion_gateway`, `bastion_help`, `select_bastion`, `direct_connection`.

- [ ] **Step 2: Update `src/components/modals/ConnectionModal.tsx`**

Add a Select field under Advanced / SSH options allowing the user to select another saved SSH connection as Jump Host / Bastion (excluding the current connection being edited to prevent loops).

- [ ] **Step 3: Typecheck frontend**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add src/components/modals/ConnectionModal.tsx src/i18n/locales/ && git commit -m "feat(ui): add Jump Host / Bastion selector to ConnectionModal"`

---

### Task 6: TunnelManager Component & Presets Modal

**Files:**
- Create: `src/components/tunnels/TunnelManager.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Add translations for Tunnels in `en.json` and `pt-BR.json`**

Keys under `tunnels`: title, new_tunnel, active, inactive, preset_postgres, preset_mysql, preset_redis, preset_mongodb, preset_web, copy_string, open_browser, port_in_use.

- [ ] **Step 2: Create `src/components/tunnels/TunnelManager.tsx`**

Build component with:
- Stats cards (Active Tunnels, Configured Tunnels).
- Tunnel Table with active switch, type tag, endpoints (`127.0.0.1:localPort ➔ remoteHost:remotePort`), action buttons (copy connection string, open browser, edit, delete).
- "New Tunnel" modal with quick preset buttons (PostgreSQL, MySQL, Redis, MongoDB, Web).

- [ ] **Step 3: Typecheck frontend**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

Run: `git add src/components/tunnels/TunnelManager.tsx src/i18n/locales/ && git commit -m "feat(ui): add TunnelManager component and presets modal"`

---

### Task 7: Navigation & Tab Integration in `ConnectionPane`

**Files:**
- Modify: `src/components/connections/ConnectionPane.tsx`

- [ ] **Step 1: Add `tunnels` tab to `ConnectionPane.tsx`**

Add `tunnels` to `TabKey`, add `{ key: 'tunnels', icon: <SwapOutlined />, label: t('common.tunnels') }` to `menuItems`, and render `<TunnelManager connectionId={connectionId} />`.

- [ ] **Step 2: Typecheck frontend**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

Run: `git add src/components/connections/ConnectionPane.tsx && git commit -m "feat(nav): integrate Tunnels tab into ConnectionPane"`

---

### Task 8: Full End-to-End Build & Validation

**Files:**
- All modified and created files

- [ ] **Step 1: Backend Typecheck & Compilation**

Run: `cd backend && npm run typecheck && npm run build:ts`
Expected: 0 errors.

- [ ] **Step 2: Frontend Production Build**

Run: `npm run build`
Expected: Vite build succeeds with exit code 0.

- [ ] **Step 3: Clean Git Working Tree**

Run: `git status`
Expected: Working tree clean.
