import { SSHPoolManager } from '../terminal/ssh-pool.service';
import type { SSHConfig } from '../../shared/types';
import logger from '../../shared/utils/logger';

export interface Fail2banJail {
    name: string;
    currentlyFailed: number;
    totalFailed: number;
    currentlyBanned: number;
    totalBanned: number;
    bannedIpList: string[];
}

export interface Fail2banStatus {
    installed: boolean;
    running: boolean;
    jails: Fail2banJail[];
}

const JAIL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const IP_REGEX = /^[0-9a-fA-F:.]+$/;

export class Fail2banService {
    private pool = SSHPoolManager.getInstance();

    public async getStatus(connectionId: string, authConfig: SSHConfig): Promise<Fail2banStatus> {
        // Check if fail2ban-client is installed
        try {
            const check = await this.pool.exec(
                connectionId,
                authConfig,
                'which fail2ban-client 2>/dev/null || command -v fail2ban-client 2>/dev/null'
            );
            if (!check.stdout.trim()) {
                return { installed: false, running: false, jails: [] };
            }
        } catch {
            return { installed: false, running: false, jails: [] };
        }

        try {
            const mainStatus = await this.pool.exec(
                connectionId,
                authConfig,
                'sudo fail2ban-client status 2>/dev/null'
            );

            if (!mainStatus.stdout.includes('Jail list:')) {
                return { installed: true, running: false, jails: [] };
            }

            // Parse Jail list
            const jailMatch = mainStatus.stdout.match(/Jail list:\s*(.+)$/m);
            if (!jailMatch || !jailMatch[1].trim()) {
                return { installed: true, running: true, jails: [] };
            }

            const rawJails = jailMatch[1]
                .split(',')
                .map((j) => j.trim())
                .filter(Boolean);

            const jails: Fail2banJail[] = [];

            for (const jailName of rawJails) {
                if (!JAIL_NAME_REGEX.test(jailName)) continue;

                try {
                    const jailOutput = await this.pool.exec(
                        connectionId,
                        authConfig,
                        `sudo fail2ban-client status ${jailName} 2>/dev/null`
                    );

                    const text = jailOutput.stdout;

                    const currFailedMatch = text.match(/Currently failed:\s*(\d+)/i);
                    const totalFailedMatch = text.match(/Total failed:\s*(\d+)/i);
                    const currBannedMatch = text.match(/Currently banned:\s*(\d+)/i);
                    const totalBannedMatch = text.match(/Total banned:\s*(\d+)/i);
                    const bannedIpMatch = text.match(/Banned IP list:\s*(.+)$/im);

                    const currentlyFailed = currFailedMatch ? parseInt(currFailedMatch[1], 10) : 0;
                    const totalFailed = totalFailedMatch ? parseInt(totalFailedMatch[1], 10) : 0;
                    const currentlyBanned = currBannedMatch ? parseInt(currBannedMatch[1], 10) : 0;
                    const totalBanned = totalBannedMatch ? parseInt(totalBannedMatch[1], 10) : 0;

                    let bannedIpList: string[] = [];
                    if (bannedIpMatch && bannedIpMatch[1].trim()) {
                        bannedIpList = bannedIpMatch[1]
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean);
                    }

                    jails.push({
                        name: jailName,
                        currentlyFailed,
                        totalFailed,
                        currentlyBanned,
                        totalBanned,
                        bannedIpList,
                    });
                } catch (err) {
                    logger.warn(`Failed to inspect jail ${jailName}: ${(err as Error).message}`);
                }
            }

            return {
                installed: true,
                running: true,
                jails,
            };
        } catch (err) {
            logger.warn(`Failed to query fail2ban for connection ${connectionId}: ${(err as Error).message}`);
            return { installed: true, running: false, jails: [] };
        }
    }

    public async unbanIp(
        connectionId: string,
        authConfig: SSHConfig,
        jail: string,
        ip: string
    ): Promise<void> {
        if (!JAIL_NAME_REGEX.test(jail)) {
            throw new Error('Nome da jail inválido');
        }
        if (!IP_REGEX.test(ip)) {
            throw new Error('Endereço IP inválido');
        }

        const cmd = `sudo fail2ban-client set ${jail} unbanip ${ip}`;
        try {
            await this.pool.exec(connectionId, authConfig, cmd);
        } catch (err: any) {
            throw new Error(`Falha ao desbanir IP ${ip} da jail ${jail}: ${err.message}`);
        }
    }

    public async banIp(
        connectionId: string,
        authConfig: SSHConfig,
        jail: string,
        ip: string
    ): Promise<void> {
        if (!JAIL_NAME_REGEX.test(jail)) {
            throw new Error('Nome da jail inválido');
        }
        if (!IP_REGEX.test(ip)) {
            throw new Error('Endereço IP inválido');
        }

        const cmd = `sudo fail2ban-client set ${jail} banip ${ip}`;
        try {
            await this.pool.exec(connectionId, authConfig, cmd);
        } catch (err: any) {
            throw new Error(`Falha ao banir IP ${ip} na jail ${jail}: ${err.message}`);
        }
    }
}
