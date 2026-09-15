# Phase 3 Design Spec: Security & OS Maintenance

## Overview
Phase 3 extends Nautilus into an active server security operations and maintenance center. It introduces two major feature suites:
1. **Firewall & Intrusion Defense (`SecurityManager`):**
   - **UFW (Uncomplicated Firewall):** Active/Inactive state, default policies (inbound/outbound), numbered rules list (ALLOW, DENY, REJECT), rule insertion with port presets (SSH, HTTP, HTTPS, DBs), and rule deletion.
   - **Fail2ban:** Daemon detection, active jail inspection (e.g. `sshd`, `nginx-http-auth`), banned IP listing per jail, manual ban, and 1-click unban.
   - Graceful detection of uninstalled tools with installation instructions.
2. **OS Package Updates & Security Patches (`PackageManager`):**
   - Multi-distro package manager detection (`apt`, `dnf`/`yum`, `apk`, `pacman`).
   - Summary cards: Total upgradable packages, security advisories/CVEs, regular updates.
   - List of upgradable packages with current version, candidate version, repository, and security flags.
   - Operations: cache refresh (`apt update` / `dnf check-update`), upgrade all or selected packages, and reboot-required indicator (`/var/run/reboot-required` or `needs-restarting -r`).

---

## 1. Architecture & Data Flow

### 1.1 Backend Architecture
```
Frontend (React) 
   │
   ▼ HTTP RPC (Tauri Bridge)
Backend Index (`backend/src/index.ts`)
   │
   ├── SecurityService (`backend/src/features/security/`)
   │      ├── UfwService: Executes `ufw status numbered`, `ufw allow ...`, `ufw delete ...` via SSHPoolManager
   │      └── Fail2banService: Executes `fail2ban-client status <jail>`, `unbanip`, `banip` via SSHPoolManager
   │
   └── PackagesService (`backend/src/features/security/packages.service.ts`)
          ├── Distro Detector: Checks `/etc/os-release` or commands to identify `apt`, `dnf`, `apk`, `pacman`
          ├── Cache Refresher: Runs package index update
          ├── Upgrade Inspector: Parses pending upgrades and flags security updates
          └── Reboot Detector: Checks `/var/run/reboot-required` or `needs-restarting -r`
```

### 1.2 Parsing Logic & Commands
- **UFW Status:**
  `which ufw && sudo ufw status verbose` or `sudo ufw status numbered`
  Parses:
  - Status: `active` or `inactive`
  - Default: `incoming: deny`, `outgoing: allow`, `routed: disabled`
  - Rules: `[ 1] 22/tcp ALLOW IN Anywhere (SSH)`
    Fields: `number`, `to`, `action`, `direction`, `from`, `comment`, `isV6`
- **Fail2ban Status:**
  `which fail2ban-client && sudo fail2ban-client status`
  Extracts jail list: `Jail list: sshd, recidive, nginx-http-auth`
  For each jail: `sudo fail2ban-client status <jail>`
  Parses: `Currently banned: 3`, `Banned IP list: 198.51.100.1 203.0.113.5 ...`
- **APT (Debian/Ubuntu):**
  - List upgradable: `apt list --upgradable 2>/dev/null`
  - Parse line: `nginx/jammy-updates 1.18.0-6ubuntu14.4 amd64 [upgradable from: 1.18.0-6ubuntu14.3]`
  - Security classification: Check if source contains `-security` or `debian-security`.
  - Reboot required: `test -f /var/run/reboot-required && cat /var/run/reboot-required.pkgs || echo "NO"`
- **DNF / YUM (RHEL/Fedora):**
  - Upgradable: `dnf check-update -q`
  - Security count: `dnf updateinfo -q --security summary`
- **APK (Alpine):**
  - `apk version -v -l '<'`
- **Pacman (Arch):**
  - `checkupdates`

---

## 2. API Specifications

### 2.1 Sidecar Handlers
- `ssm:security:ufw:status`: returns `{ installed: boolean; active: boolean; defaultIncoming?: string; defaultOutgoing?: string; rules: UfwRule[] }`
- `ssm:security:ufw:toggle`: `{ action: 'enable' | 'disable' | 'reload' }` -> `{ success: boolean }`
- `ssm:security:ufw:addRule`: `{ port: string; proto: 'tcp' | 'udp' | 'any'; action: 'allow' | 'deny' | 'reject'; from?: string; comment?: string }` -> `{ success: boolean }`
- `ssm:security:ufw:deleteRule`: `{ ruleNumber: number }` -> `{ success: boolean }`
- `ssm:security:fail2ban:status`: returns `{ installed: boolean; running: boolean; jails: Fail2banJail[] }`
- `ssm:security:fail2ban:unban`: `{ jail: string; ip: string }` -> `{ success: boolean }`
- `ssm:security:fail2ban:ban`: `{ jail: string; ip: string }` -> `{ success: boolean }`
- `ssm:packages:list`: returns `{ packageManager: string; totalUpdates: number; securityUpdates: number; rebootRequired: boolean; rebootPackages: string[]; packages: PackageUpdate[] }`
- `ssm:packages:refresh`: returns `{ success: boolean; output: string }`
- `ssm:packages:upgrade`: `{ packageNames?: string[] }` -> returns `{ success: boolean; output: string }`

---

## 3. UI/UX Design

### 3.1 Security Panel (`SecurityManager.tsx`)
- Tab 1: **Firewall (UFW)**
  - Top status bar: Status Switch (Active / Inactive), Policies tag (Incoming: Drop, Outgoing: Accept), Reload button.
  - Action buttons: Add Rule modal with port presets (SSH 22, HTTP 80, HTTPS 443, MySQL 3306, PostgreSQL 5432, Redis 6379, DNS 53).
  - Rules Table: Index `#`, Action badge (ALLOW green, DENY red, REJECT orange), Destination/Port, Protocol (TCP/UDP/Any), Source IP, Comment, Delete icon.
- Tab 2: **Intrusion Defense (Fail2ban)**
  - Active Jails summary pills with ban counts.
  - Banned IPs Table: IP Address, Jail Name, Quick Unban button.
  - Manual Ban button.

### 3.2 OS Packages & Updates Panel (`PackageManager.tsx`)
- System Alert: "⚠️ System reboot required to complete updates" (when `/var/run/reboot-required` exists).
- Metric Cards: Total Available Updates, Critical Security Updates (red/orange), Regular Updates, Package Manager in use (e.g. APT on Ubuntu 22.04).
- Actions: "Refresh Cache" (`apt update`), "Upgrade All", "Upgrade Selected".
- Upgradable Packages Table: Name, Current Version, Candidate Version, Repository / Security badge, Checkbox selection.
- Upgrade Execution Drawer/Modal: Shows stdout stream with completion status.

---

## 4. Internationalization
Full translations in `en.json` and `pt-BR.json` for:
- `security` (UFW, rules, fail2ban, jails, unban)
- `packages` (updates, security updates, reboot required, upgrade)
