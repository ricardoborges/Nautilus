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

        // List units (services)
        let unitsStdout = '';
        try {
            const unitsOutput = await this.pool.exec(
                connectionId,
                authConfig,
                'systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null'
            );
            unitsStdout = unitsOutput.stdout;
        } catch (err: any) {
            return { supported: false, services: [] };
        }

        // Fetch enabled/disabled states in batch
        const enabledMap = new Map<string, string>();
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
        for (const line of unitsStdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Format: UNIT LOAD ACTIVE SUB DESCRIPTION...
            // e.g. "nginx.service loaded active running A high performance web server"
            // e.g. "● cron.service loaded failed failed Regular background program processing daemon"
            const cleanLine = trimmed.replace(/^[●*]\s*/, '');
            const match = cleanLine.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
            if (match) {
                const [, name, loadState, activeState, subState, description] = match;
                if (name.endsWith('.service')) {
                    services.push({
                        name,
                        description: (description || '').trim(),
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

        // Run with sudo, falling back to direct systemctl
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
            return err.message || 'Error fetching service status';
        }
    }
}
