import { SSHPoolManager } from '../terminal/ssh-pool.service';
import type { SSHConfig } from '../../shared/types';
import logger from '../../shared/utils/logger';

export interface PackageUpdate {
    name: string;
    currentVersion: string;
    newVersion: string;
    repository?: string;
    isSecurity: boolean;
}

export interface PackageUpdatesResult {
    packageManager: string;
    totalUpdates: number;
    securityUpdates: number;
    rebootRequired: boolean;
    rebootPackages: string[];
    packages: PackageUpdate[];
}

export class PackagesService {
    private pool = SSHPoolManager.getInstance();

    public async detectPackageManager(connectionId: string, authConfig: SSHConfig): Promise<string> {
        try {
            const check = await this.pool.exec(
                connectionId,
                authConfig,
                'which apt-get 2>/dev/null || which dnf 2>/dev/null || which yum 2>/dev/null || which apk 2>/dev/null || which pacman 2>/dev/null'
            );
            const path = check.stdout.trim().toLowerCase();
            if (path.includes('apt-get')) return 'apt';
            if (path.includes('dnf')) return 'dnf';
            if (path.includes('yum')) return 'yum';
            if (path.includes('apk')) return 'apk';
            if (path.includes('pacman')) return 'pacman';
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }

    public async listUpdates(connectionId: string, authConfig: SSHConfig): Promise<PackageUpdatesResult> {
        const pm = await this.detectPackageManager(connectionId, authConfig);
        const packages: PackageUpdate[] = [];
        let securityCount = 0;
        let rebootRequired = false;
        let rebootPackages: string[] = [];

        // Check reboot requirement
        try {
            const rebootCheck = await this.pool.exec(
                connectionId,
                authConfig,
                'test -f /var/run/reboot-required && echo "YES" || echo "NO"'
            );
            if (rebootCheck.stdout.trim().startsWith('YES')) {
                rebootRequired = true;
                try {
                    const pkgs = await this.pool.exec(
                        connectionId,
                        authConfig,
                        'cat /var/run/reboot-required.pkgs 2>/dev/null || true'
                    );
                    rebootPackages = pkgs.stdout
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean);
                } catch {}
            }
        } catch {}

        if (pm === 'apt') {
            try {
                // Run apt list --upgradable
                const out = await this.pool.exec(
                    connectionId,
                    authConfig,
                    'apt list --upgradable 2>/dev/null'
                );

                const lines = out.stdout.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('Listing...')) continue;

                    // Example: openssh-server/jammy-updates,jammy-security 1:8.9p1-3ubuntu0.7 amd64 [upgradable from: 1:8.9p1-3ubuntu0.6]
                    const regex = /^([^/\s]+)\/([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+\[upgradable from:\s+([^\]]+)\]/i;
                    const match = trimmed.match(regex);
                    if (match) {
                        const name = match[1];
                        const repo = match[2];
                        const newVer = match[3];
                        const currVer = match[5];
                        const isSec = repo.toLowerCase().includes('security');

                        if (isSec) securityCount++;

                        packages.push({
                            name,
                            currentVersion: currVer,
                            newVersion: newVer,
                            repository: repo,
                            isSecurity: isSec,
                        });
                    }
                }
            } catch (err) {
                logger.warn(`Failed to list apt updates: ${(err as Error).message}`);
            }
        } else if (pm === 'dnf' || pm === 'yum') {
            try {
                const out = await this.pool.exec(
                    connectionId,
                    authConfig,
                    `${pm} check-update -q 2>/dev/null || true`
                );

                const lines = out.stdout.split('\n');
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        const nameArch = parts[0];
                        const newVer = parts[1];
                        const repo = parts[2];
                        const isSec = repo.toLowerCase().includes('security');
                        if (isSec) securityCount++;

                        packages.push({
                            name: nameArch.split('.')[0],
                            currentVersion: 'installed',
                            newVersion: newVer,
                            repository: repo,
                            isSecurity: isSec,
                        });
                    }
                }
            } catch (err) {
                logger.warn(`Failed to list ${pm} updates: ${(err as Error).message}`);
            }
        } else if (pm === 'apk') {
            try {
                const out = await this.pool.exec(
                    connectionId,
                    authConfig,
                    "apk version -v -l '<' 2>/dev/null || true"
                );
                const lines = out.stdout.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    // Format: package-1.0.0 < 1.0.1
                    const match = trimmed.match(/^([a-zA-Z0-9_-]+)-([0-9].*?)\s+<\s+(.*)$/);
                    if (match) {
                        packages.push({
                            name: match[1],
                            currentVersion: match[2],
                            newVersion: match[3],
                            isSecurity: false,
                        });
                    }
                }
            } catch (err) {
                logger.warn(`Failed to list apk updates: ${(err as Error).message}`);
            }
        }

        return {
            packageManager: pm,
            totalUpdates: packages.length,
            securityUpdates: securityCount,
            rebootRequired,
            rebootPackages,
            packages,
        };
    }

    public async refreshCache(connectionId: string, authConfig: SSHConfig): Promise<{ output: string }> {
        const pm = await this.detectPackageManager(connectionId, authConfig);
        let cmd = 'sudo apt-get update';
        if (pm === 'dnf') cmd = 'sudo dnf makecache';
        else if (pm === 'yum') cmd = 'sudo yum makecache';
        else if (pm === 'apk') cmd = 'sudo apk update';
        else if (pm === 'pacman') cmd = 'sudo pacman -Sy';

        try {
            const res = await this.pool.exec(connectionId, authConfig, cmd);
            return { output: res.stdout || res.stderr };
        } catch (err: any) {
            throw new Error(`Falha ao atualizar repositórios de pacotes: ${err.message}`);
        }
    }

    public async upgradePackages(
        connectionId: string,
        authConfig: SSHConfig,
        packageNames?: string[]
    ): Promise<{ output: string }> {
        const pm = await this.detectPackageManager(connectionId, authConfig);
        let cmd = '';

        if (pm === 'apt') {
            if (packageNames && packageNames.length > 0) {
                // Validate names
                const cleanNames = packageNames
                    .map((p) => p.trim())
                    .filter((p) => /^[a-zA-Z0-9_.+-]+$/.test(p));
                cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${cleanNames.join(' ')}`;
            } else {
                cmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y';
            }
        } else if (pm === 'dnf' || pm === 'yum') {
            if (packageNames && packageNames.length > 0) {
                const cleanNames = packageNames
                    .map((p) => p.trim())
                    .filter((p) => /^[a-zA-Z0-9_.+-]+$/.test(p));
                cmd = `sudo ${pm} upgrade -y ${cleanNames.join(' ')}`;
            } else {
                cmd = `sudo ${pm} upgrade -y`;
            }
        } else if (pm === 'apk') {
            cmd = 'sudo apk upgrade';
        } else if (pm === 'pacman') {
            cmd = 'sudo pacman -Syu --noconfirm';
        } else {
            throw new Error('Gerenciador de pacotes não suportado para atualização automatizada');
        }

        try {
            const res = await this.pool.exec(connectionId, authConfig, cmd);
            return { output: res.stdout || res.stderr };
        } catch (err: any) {
            throw new Error(`Falha ao atualizar pacotes: ${err.message}`);
        }
    }

    public async checkReboot(connectionId: string, authConfig: SSHConfig): Promise<{ rebootRequired: boolean; packages: string[] }> {
        try {
            const res = await this.pool.exec(
                connectionId,
                authConfig,
                'test -f /var/run/reboot-required && echo "YES" || echo "NO"'
            );
            if (res.stdout.trim().startsWith('YES')) {
                let packages: string[] = [];
                try {
                    const pkgs = await this.pool.exec(
                        connectionId,
                        authConfig,
                        'cat /var/run/reboot-required.pkgs 2>/dev/null || true'
                    );
                    packages = pkgs.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
                } catch {}
                return { rebootRequired: true, packages };
            }
            return { rebootRequired: false, packages: [] };
        } catch {
            return { rebootRequired: false, packages: [] };
        }
    }
}
