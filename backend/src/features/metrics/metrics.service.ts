import { SSHClient } from '../terminal/ssh.service';
import logger from '../../shared/utils/logger';
import type { Connection, SSHConfig, MetricsUpdate, MetricsData, MemoryInfo, DiskInfo, SystemInfo, NetworkInfo, ServiceStatus, SSHExecResult } from '../../shared/types';

interface NetStats {
    bytesIn: number;
    bytesOut: number;
}

export class SystemMonitor {
    private connection: Connection;
    private sshClient: SSHClient;
    private onUpdate: (data: MetricsUpdate) => void;
    private interval: NodeJS.Timeout | null = null;
    private lastNetStats: NetStats | null = null;
    private lastNetStatsTimestamp: number | null = null;

    constructor(connection: Connection, sshConfig: SSHConfig, onUpdate: (data: MetricsUpdate) => void) {
        this.connection = connection;
        this.sshClient = new SSHClient(sshConfig);
        this.onUpdate = onUpdate;
    }

    async connectAndStartPolling(intervalMs: number = 5000): Promise<void> {
        try {
            await this.sshClient.connect();
            logger.info(`[Metrics] Conectado a ${this.sshClient.config.host} para polling de métricas.`);

            this.fetchAndEmitMetrics(); // Fetch immediately on start
            this.interval = setInterval(() => this.fetchAndEmitMetrics(), intervalMs);
        } catch (error) {
            const err = error as Error;
            logger.error(`[Metrics] Falha ao conectar para polling: ${err.message}`);
            this.emitError(err);
        }
    }

    async fetchAndEmitMetrics(): Promise<void> {
        try {
            const commands = {
                uptime: "uptime",
                memory: "free -m",
                disk: "df -h /",
                cpu: "top -b -n 1 | grep '^%Cpu' | awk '{print $2+$4}'",
                system: "uname -srmo && cat /etc/os-release | grep PRETTY_NAME | cut -d '\"' -f 2 && lscpu | grep 'Model name:' | sed 's/Model name:[[:space:]]*//'",
                network: "cat /proc/net/dev"
            };

            const services = this.connection.monitoredServices || [];
            const serviceCommands = services.map(s => `systemctl is-active ${s.trim()}`);
            const servicePromises = serviceCommands.map(cmd =>
                this.sshClient.exec(cmd).catch(() => ({ stdout: 'failed', stderr: '' }))
            );

            const [uptime, memory, disk, cpu, system, network, ...serviceResults] = await Promise.all([
                this.sshClient.exec(commands.uptime),
                this.sshClient.exec(commands.memory),
                this.sshClient.exec(commands.disk),
                this.sshClient.exec(commands.cpu),
                this.sshClient.exec(commands.system),
                this.sshClient.exec(commands.network),
                ...servicePromises
            ]);

            const metrics: MetricsData = {
                uptime: uptime.stdout.trim(),
                memory: this.parseMemory(memory.stdout),
                disk: this.parseDisk(disk.stdout),
                cpu: parseFloat(cpu.stdout.trim()).toFixed(1),
                system: this.parseSystem(system.stdout),
                network: this.parseNetwork(network.stdout),
                services: services.map((name, i): ServiceStatus => ({
                    name,
                    status: serviceResults[i].stdout.trim()
                }))
            };

            this.emitSuccess(metrics);
        } catch (error) {
            const err = error as Error;
            logger.error(`[Metrics] Erro ao buscar métricas: ${err.message}`);
            this.emitError(err);
            this.stopPolling();
        }
    }

    private parseMemory(freeOutput: string): MemoryInfo {
        const lines = freeOutput.split('\n');
        const memLine = lines[1].split(/\s+/);
        return {
            total: parseInt(memLine[1], 10),
            used: parseInt(memLine[2], 10),
            free: parseInt(memLine[3], 10)
        };
    }

    private parseDisk(dfOutput: string): DiskInfo {
        const lines = dfOutput.split('\n');
        const diskLine = lines[1].split(/\s+/);
        return {
            total: diskLine[1],
            used: diskLine[2],
            available: diskLine[3],
            percent: diskLine[4]
        };
    }

    private parseSystem(systemOutput: string): SystemInfo {
        const lines = systemOutput.trim().split('\n');
        const parts = lines[0].split(' ').filter(Boolean);
        return {
            kernel: parts[0] || 'N/A',
            arch: parts[1] || 'N/A',
            os: lines[1] || 'N/A',
            cpu: lines[2] || 'N/A'
        };
    }

    private parseNetwork(netOutput: string): NetworkInfo {
        const lines = netOutput.trim().split('\n');
        const interfaceLine = lines.find(line => /^\s*(eth|enp|ens)\d/.test(line));
        if (!interfaceLine) return { in: '0.0', out: '0.0' };

        const parts = interfaceLine.trim().split(/\s+/);
        const bytesIn = parseInt(parts[1], 10);
        const bytesOut = parseInt(parts[9], 10);
        const now = Date.now();

        if (!this.lastNetStats || !this.lastNetStatsTimestamp) {
            this.lastNetStats = { bytesIn, bytesOut };
            this.lastNetStatsTimestamp = now;
            return { in: '0.0', out: '0.0' };
        }

        const timeDiffSeconds = (now - this.lastNetStatsTimestamp) / 1000;
        const inRate = ((bytesIn - this.lastNetStats.bytesIn) / timeDiffSeconds / 1024).toFixed(1);
        const outRate = ((bytesOut - this.lastNetStats.bytesOut) / timeDiffSeconds / 1024).toFixed(1);

        this.lastNetStats = { bytesIn, bytesOut };
        this.lastNetStatsTimestamp = now;

        return {
            in: parseFloat(inRate) >= 0 ? inRate : '0.0',
            out: parseFloat(outRate) >= 0 ? outRate : '0.0'
        };
    }

    private emitSuccess(data: MetricsData): void {
        this.onUpdate({ status: 'success', data });
    }

    private emitError(error: Error): void {
        this.onUpdate({ status: 'error', message: error.message });
    }

    stopPolling(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.sshClient.end();
            logger.info(`[Metrics] Polling interrompido para ${this.sshClient.config.host}.`);
        }
    }
}
