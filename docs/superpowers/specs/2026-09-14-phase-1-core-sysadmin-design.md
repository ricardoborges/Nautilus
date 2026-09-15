# Design Doc: Phase 1 - Core SysAdmin & High-Performance SSH Pool

**Date:** 2026-09-14  
**Status:** Approved  
**Author:** Antigravity Team & Ricardo Borges  
**Target Milestone:** Nautilus v2.1.0  

---

## 1. Overview & Context

Nautilus is a desktop application (built with Tauri, React 18, Ant Design Pro, and a Node.js sidecar) designed for managing Linux servers over SSH. It provides metrics, terminal tabs, an SFTP file manager, process management, crontab management, `.env` file management, and a Portainer-style Docker dashboard.

### Problems Addressed
1. **SSH Connection Latency Overhead:** Every remote command execution (Docker inspect, process listing, cron reading, environment discovery) creates a new `SSHClient`, performs TCP handshake, SSH protocol exchange, host key verification, and credentials authentication, runs the command, and closes the connection (`ssh.end()`). This creates a 500ms–1500ms delay per interaction.
2. **Missing Systemd Service Management:** Users cannot inspect, start, stop, restart, or enable/disable systemd services on remote servers without opening a terminal and running manual commands.
3. **No Centralized Log Viewer:** There is no tool within Nautilus to stream `journalctl` logs or inspect traditional log files in `/var/log`, forcing users to use terminal tailing.

### Goals
- Implement an **SSH Connection Pool & Session Multiplexer** in the backend sidecar that reuses active SSH client connections per `connectionId`.
- Add a **Systemd Services Manager** tab in the connection UI allowing users to list, filter, search, start, stop, restart, and enable/disable services, as well as view detailed service status.
- Add a **Central Log Viewer** tab supporting both real-time streaming of `journalctl` (by service or system-wide) and inspection of log files (`/var/log/*`) via Server-Sent Events (SSE).

---

## 2. Architecture & Components

```
┌────────────────────────────────────────────────────────────┐
│                       React Frontend                       │
│  ┌───────────────────────┐       ┌──────────────────────┐  │
│  │   ServiceManager.tsx  │       │    LogManager.tsx    │  │
│  └───────────┬───────────┘       └───────────┬──────────┘  │
│              │                               │             │
│              ▼                               ▼             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                     tauri-bridge.ts                  │  │
│  │       (HTTP POST /api  +  SSE /events listener)      │  │
│  └───────────────────────────┬──────────────────────────┘  │
└──────────────────────────────┼─────────────────────────────┘
                               │ Local HTTP / SSE (Port 45678)
┌──────────────────────────────┼─────────────────────────────┐
│                              ▼                             │
│                     Node.js Sidecar API                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 SSHPoolManager (Singleton)           │  │
│  │     - Keeps active Client per connectionId           │  │
│  │     - Multiplexes exec channels                      │  │
│  │     - Handles keepalive (15s) and auto-reconnection  │  │
│  └───────────┬───────────────────────────────┬──────────┘  │
│              │                               │             │
│              ▼                               ▼             │
│  ┌───────────────────────┐       ┌──────────────────────┐  │
│  │  ServicesService.ts   │       │     LogsService.ts   │  │
│  │  (systemctl actions)  │       │ (journalctl & files) │  │
│  └───────────────────────┘       └──────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Specification

### 3.1 Backend: SSH Connection Pool (`backend/src/features/terminal/ssh-pool.service.ts`)

#### Responsibilities:
- Manage pooled `Client` (from `ssh2`) instances indexed by `connectionId`.
- Provide `acquire(connectionId: string): Promise<Client>` which returns a ready-to-use client or establishes a new connection if none is active or if the existing client was disconnected.
- Provide `exec(connectionId: string, command: string): Promise<{ stdout: string; stderr: string }>` using a channel multiplexed over the pooled connection.
- Attach listeners to handle connection drops (`'close'`, `'error'`) and remove dead clients from the pool.
- Send SSH keepalives every 15 seconds (`keepaliveInterval: 15000, keepaliveCountMax: 3`).
- Provide `close(connectionId: string): void` to cleanly disconnect when a connection is closed in the frontend.

#### Error Handling:
- If a pooled client fails during `exec`, discard the client and attempt a single reconnect and retry before rejecting with an error.

---

### 3.2 Backend: Systemd Services (`backend/src/features/services/services.service.ts`)

#### Data Models:
```typescript
export interface SystemdService {
    name: string;          // e.g. "nginx.service"
    description: string;   // e.g. "A high performance web server"
    loadState: string;     // "loaded" | "not-found"
    activeState: string;   // "active" | "inactive" | "failed"
    subState: string;      // "running" | "exited" | "dead"
    enabledState?: string; // "enabled" | "disabled" | "static" | "masked"
}

export type ServiceAction = 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable';
```

#### API Endpoints (invoked via `ssm:services:*`):
1. `ssm:services:list`:
   - Runs `systemctl list-units --type=service --all --no-legend --no-pager --plain` and `systemctl list-unit-files --type=service --no-legend --no-pager`.
   - Parses stdout into `SystemdService[]`.
   - If `systemctl` is not found, returns `{ supported: false, services: [] }`.
2. `ssm:services:action`:
   - Arguments: `{ connectionId: string, serviceName: string, action: ServiceAction }`.
   - Sanitizes `serviceName` against a strict regex `^[a-zA-Z0-9_@.-]+$`.
   - Executes `sudo systemctl <action> <serviceName>`.
3. `ssm:services:status`:
   - Arguments: `{ connectionId: string, serviceName: string }`.
   - Executes `systemctl status <serviceName> --no-pager -l`.
   - Returns full status text and basic parsed metadata (PID, active status, memory).

---

### 3.3 Backend: Central Log Viewer (`backend/src/features/logs/logs.service.ts`)

#### API Endpoints (invoked via `ssm:logs:*`):
1. `ssm:logs:read`:
   - Arguments:
     - `connectionId: string`
     - `source: 'journal' | 'file'`
     - `target: string` (service name like `nginx.service` or file path like `/var/log/syslog`)
     - `lines?: number` (default: 200)
     - `since?: string` (e.g., "1 hour ago", "today")
     - `priority?: string` (e.g., "err", "warning")
   - Executes:
     - For journal: `journalctl -u <target> -n <lines> --no-pager -o short-iso` (with `--since` and `-p` if provided).
     - For file: `tail -n <lines> <target>`.
   - Returns `{ lines: string[] }`.
2. `ssm:logs:stream:start`:
   - Arguments: `{ connectionId: string, streamId: string, source: 'journal' | 'file', target: string }`.
   - Opens an SSH channel executing `journalctl -u <target> -f --no-pager -o short-iso` or `tail -f <target>`.
   - Listens on `stream.stdout` and emits SSE event `ssm:logs:stream:data` with `{ streamId, chunk: string }`.
   - Tracks active streams in a map keyed by `streamId`.
3. `ssm:logs:stream:stop`:
   - Arguments: `{ streamId: string }`.
   - Kills the active SSH channel and removes stream from map.
4. `ssm:logs:list-files`:
   - Arguments: `{ connectionId: string }`.
   - Executes `find /var/log -maxdepth 2 -type f ! -name "*.gz" ! -name "*.old" ! -name "*.[0-9]" 2>/dev/null | sort`.
   - Returns list of available log files.

---

### 3.4 Frontend Components

#### 1. `src/components/services/ServiceManager.tsx`
- Navigation: Added to `ConnectionPane.tsx` sidebar menu with icon `<ClusterOutlined />` and key `'services'`.
- UI Features:
  - Header with summary badges: Total Services, Active, Failed (alert badge), Inactive.
  - Search input with instant client-side filtering by name and description.
  - Radio/Segmented filter: All | Active | Failed | Inactive.
  - Table columns: Service Name, Status badge, Sub-state tag, Enabled on boot, Actions.
  - Action buttons:
    - Quick Restart (popconfirm).
    - Start / Stop toggle.
    - Enable / Disable on boot.
    - View Details Drawer (shows full `systemctl status` output + direct button "View in Logs").

#### 2. `src/components/logs/LogManager.tsx`
- Navigation: Added to `ConnectionPane.tsx` sidebar menu with icon `<ProfileOutlined />` and key `'logs'`.
- UI Features:
  - Source selector: Segmented toggle between **Journald (Services)** and **Log Files (`/var/log`)**.
  - Dropdown selector with search (auto-populated with systemd services or common log files).
  - Priority selector: All levels, Error/Critical (`emerg..err`), Warning+ (`emerg..warning`), Notice/Info.
  - Time range selector: Last 1 hour, Last 24 hours, Today, All time.
  - Live Stream toggle button (Play/Pause stream) with Auto-scroll lock toggle.
  - Text search filter with highlight matching.
  - Console viewer: Monospace font, dark theme, timestamp coloring, level badges.
  - Utility toolbar: Copy to clipboard, Clear buffer, Download `.log` file.

#### 3. Navigation Updates in `ConnectionPane.tsx`:
New tab order:
- `Dashboard`
- `Terminal`
- `Files`
- `Env`
- `Services` (NEW)
- `Logs` (NEW)
- `Processes`
- `Cron`
- `Docker`

#### 4. Internationalization (`src/i18n/`):
- Translation keys added for English (`en`) and Portuguese (`pt-BR`) covering all labels, badges, alerts, actions, and empty states.

---

## 4. Verification & Testing Plan

1. **SSH Connection Pool:**
   - Verify that sequential calls to `ssm:docker:check` and `ssm:services:list` execute over the existing pooled connection.
   - Measure time-to-first-byte reduction (expected drop from ~1200ms to <100ms).
   - Test reconnection when connection is dropped.
2. **Systemd Services:**
   - Test listing services on a standard systemd machine.
   - Test start/stop/restart/reload actions.
   - Test non-systemd fallback behavior.
3. **Log Manager:**
   - Test static reading of journald logs with priority filters.
   - Test real-time SSE streaming and graceful stop on tab change.
   - Test `/var/log` file discovery and reading.
4. **Build & Type Check:**
   - Frontend: `npm run build` (Vite + TypeScript compilation).
   - Backend: `npm run build` (tsc compilation in `backend/`).
