# Design Doc: Phase 2 - Connectivity, SSH Port Forwarding (Tunnels) & Jump Host (Bastion)

**Date:** 2026-09-14  
**Status:** Approved  
**Author:** Antigravity Team & Ricardo Borges  
**Target Milestone:** Nautilus v2.2.0  

---

## 1. Overview & Context

In real-world DevOps and SysAdmin workflows, many database servers (PostgreSQL, MySQL, Redis, MongoDB) and internal services reside in private cloud subnets (e.g. AWS VPC, private networks) without public IPs. They can only be accessed through an SSH Jump Host (Bastion) or through SSH Port Forwarding (tunnels).

### Goals
1. **SSH Jump Host (`ProxyJump`):** Allow any server connection to specify another saved Nautilus connection as its Bastion / Jump Host, routing the SSH transport transparently over an encrypted channel.
2. **SSH Port Forwarding (Tunnels Manager):** Allow users to configure, persist, and control Local and Remote port forwarding tunnels with 1-click presets (PostgreSQL, MySQL, Redis, MongoDB, Web) and live status indicators.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Nautilus Desktop UI                    │
│   ┌───────────────────────┐       ┌──────────────────────┐  │
│   │   TunnelManager.tsx   │       │ ConnectionModal.tsx  │  │
│   └───────────┬───────────┘       └───────────┬──────────┘  │
│               │                               │             │
│               ▼                               ▼             │
│   ┌──────────────────────────────────────────────────────┐  │
│   │                   tauri-bridge.ts                    │  │
│   └───────────────────────────┬──────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────┘
                                │ HTTP / JSON
┌───────────────────────────────┼─────────────────────────────┐
│                               ▼                             │
│                      Backend Sidecar                        │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   TunnelService                     │   │
│   │      - Manages local TCP servers (net.createServer) │   │
│   │      - Pipes client sockets to ssh.forwardOut()     │   │
│   │      - Tracks active client counts & statuses       │   │
│   └───────────┬─────────────────────────┬───────────────┘   │
│               │                         │                   │
│               ▼                         ▼                   │
│   ┌───────────────────────┐   ┌─────────────────────────┐   │
│   │    SSHPoolManager     │   │     SQLite Database     │   │
│   │ - Bastion forwarding  │   │  - connections table    │   │
│   │ - Direct connections  │   │  - tunnels table        │   │
│   └───────────────────────┘   └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Specification

### 3.1 Database Schema Migrations (`backend/src/shared/database/index.ts`)

1. **Connections Table Migration:**
   Add `bastion_connection_id`:
   ```sql
   ALTER TABLE connections ADD COLUMN bastion_connection_id TEXT DEFAULT NULL;
   ```

2. **Tunnels Table Creation:**
   ```sql
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
   );
   ```

---

### 3.2 Backend: Bastion / Jump Host Implementation (`SSHPoolManager`)

When `connection.bastionConnectionId` is present:
1. Lookup the bastion connection config from `connectionManager`.
2. Acquire/establish the bastion SSH client: `const bastionClient = await this.acquire(bastionConnId, bastionAuthConfig)`.
3. Open an outbound tunnel channel to the target host and port:
   ```typescript
   const stream = await new Promise<ClientChannel>((resolve, reject) => {
       bastionClient.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
           if (err) return reject(err);
           resolve(stream);
       });
   });
   ```
4. Connect the target SSH client passing `{ sock: stream, ...targetAuthConfig }`.
5. Cycle detection: Reject if `targetConn.id === bastionConnId` or if circular bastion chains are detected.

---

### 3.3 Backend: Tunnel Service (`backend/src/features/tunnels/tunnel.service.ts`)

#### Models:
```typescript
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
```

#### Operations:
- `listTunnels(connectionId: string): Promise<TunnelRuntimeInfo[]>`
- `createTunnel(config: Omit<TunnelConfig, 'id'>): Promise<TunnelConfig>`
- `updateTunnel(id: string, config: Partial<TunnelConfig>): Promise<void>`
- `deleteTunnel(id: string): Promise<void>`
- `startTunnel(id: string): Promise<void>`
  - For `local` tunnel:
    - Creates a `net.createServer()` listening on `localHost:localPort`.
    - Handles `EADDRINUSE` gracefully with a clear error: `"Port <localPort> is already in use locally"`.
    - On incoming TCP socket: acquires pooled SSH client for `connectionId`, calls `forwardOut('127.0.0.1', socket.remotePort, remoteHost, remotePort)`, and pipes streams bidirectionally: `socket.pipe(channel).pipe(socket)`.
- `stopTunnel(id: string): Promise<void>`
  - Closes the TCP listener and terminates active socket pipes.
- `stopAll(connectionId?: string): void`
  - Shuts down listeners during connection unmount or app shutdown.

---

### 3.4 Frontend Components

#### 1. `src/components/tunnels/TunnelManager.tsx`
- Navigation: Added to `ConnectionPane.tsx` sidebar menu with icon `<SwapOutlined />` and key `'tunnels'`.
- UI Features:
  - Header with summary: Active Tunnels, Total Configured.
  - Table / Card view listing tunnels with status badge (Active/Inactive), Type tag, and Endpoint description (`127.0.0.1:5432 ➔ remote:5432`).
  - Active toggle switch to turn tunnel on/off.
  - Quick copy connection string button: `localhost:<port>`.
  - "New Tunnel" modal with 1-click presets:
    - PostgreSQL (`5432 ➔ 5432`)
    - MySQL (`3306 ➔ 3306`)
    - Redis (`6379 ➔ 6379`)
    - MongoDB (`27017 ➔ 27017`)
    - Web / HTTP (`8080 ➔ 80`)
    - Custom port configuration

#### 2. `src/components/modals/ConnectionModal.tsx`
- Adds a **"Connect via Jump Host / Bastion"** selector.
- Lists all other saved SSH connections in Nautilus.
- Saves `bastionConnectionId` in the connection record.

---

## 4. Verification & Testing Plan

1. **Database Migration:**
   - Verify SQLite schema upgrades smoothly without altering existing connections.
   - Verify export/import (`.ndb`) includes the new `tunnels` table and `bastion_connection_id`.
2. **Local Port Forwarding:**
   - Test starting a local TCP listener on port 5432.
   - Test connecting a client socket and verify bidirectional forwarding.
   - Test port conflict handling (`EADDRINUSE`).
3. **Bastion Jump Host:**
   - Test connecting via `sock: stream` through a simulated or real jump host.
   - Test circular jump host detection.
4. **Build & Typecheck:**
   - Backend `npm run typecheck` (`tsc --noEmit`).
   - Frontend `npm run build` (`vite build`).
