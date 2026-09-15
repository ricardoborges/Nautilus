import { SSHPoolManager } from '../terminal/ssh-pool.service';
import type { SSHConfig } from '../../shared/types';
import logger from '../../shared/utils/logger';

export interface UfwRule {
    number: number;
    to: string;
    action: 'ALLOW' | 'DENY' | 'REJECT' | 'LIMIT';
    direction: 'IN' | 'OUT';
    from: string;
    comment?: string;
    isV6?: boolean;
}

export interface UfwStatus {
    installed: boolean;
    active: boolean;
    defaultIncoming?: string;
    defaultOutgoing?: string;
    rules: UfwRule[];
}

export interface AddUfwRuleOptions {
    port: string;
    proto?: 'tcp' | 'udp' | 'any';
    action: 'allow' | 'deny' | 'reject' | 'limit';
    from?: string;
    comment?: string;
}

const PORT_REGEX = /^[a-zA-Z0-9_-]+(:[0-9]+)?(\/[a-zA-Z0-9]+)?$/;
const IP_REGEX = /^[0-9a-fA-F:./]+$/;

export class UfwService {
    private pool = SSHPoolManager.getInstance();

    public async getStatus(connectionId: string, authConfig: SSHConfig): Promise<UfwStatus> {
        // Check if ufw is installed
        try {
            const check = await this.pool.exec(
                connectionId,
                authConfig,
                'which ufw 2>/dev/null || command -v ufw 2>/dev/null'
            );
            if (!check.stdout.trim()) {
                return { installed: false, active: false, rules: [] };
            }
        } catch {
            return { installed: false, active: false, rules: [] };
        }

        let active = false;
        let defaultIncoming = 'deny';
        let defaultOutgoing = 'allow';
        const rules: UfwRule[] = [];

        try {
            // Check general status & default policies
            const verboseOutput = await this.pool.exec(connectionId, authConfig, 'sudo ufw status verbose 2>/dev/null');
            const verboseText = verboseOutput.stdout;

            if (verboseText.includes('Status: active')) {
                active = true;
            }

            const defaultMatch = verboseText.match(/Default:\s+([a-zA-Z]+)\s+\(incoming\),\s+([a-zA-Z]+)\s+\(outgoing\)/i);
            if (defaultMatch) {
                defaultIncoming = defaultMatch[1].toLowerCase();
                defaultOutgoing = defaultMatch[2].toLowerCase();
            }

            if (active) {
                // Fetch numbered rules
                const numberedOutput = await this.pool.exec(connectionId, authConfig, 'sudo ufw status numbered 2>/dev/null');
                const lines = numberedOutput.stdout.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    // Example: [ 1] 22/tcp ALLOW IN Anywhere # SSH
                    const match = trimmed.match(/^\[\s*(\d+)\]\s+(.*?)\s+(ALLOW IN|DENY IN|REJECT IN|LIMIT IN|ALLOW OUT|DENY OUT|REJECT OUT|LIMIT OUT|ALLOW|DENY|REJECT|LIMIT)\s+(.*?)(?:\s+#\s+(.*))?$/i);
                    if (match) {
                        const ruleNum = parseInt(match[1], 10);
                        const rawTo = match[2].trim();
                        const actionFull = match[3].trim().toUpperCase();
                        const rawFrom = match[4].trim();
                        const comment = match[5]?.trim();

                        const actionParts = actionFull.split(/\s+/);
                        const action = actionParts[0] as 'ALLOW' | 'DENY' | 'REJECT' | 'LIMIT';
                        const direction = (actionParts[1] || 'IN') as 'IN' | 'OUT';

                        const isV6 = rawTo.includes('(v6)') || rawFrom.includes('(v6)');
                        const cleanTo = rawTo.replace(/\(v6\)/gi, '').trim();
                        const cleanFrom = rawFrom.replace(/\(v6\)/gi, '').trim();

                        rules.push({
                            number: ruleNum,
                            to: cleanTo,
                            action,
                            direction,
                            from: cleanFrom,
                            comment,
                            isV6,
                        });
                    }
                }
            }
        } catch (err) {
            logger.warn(`Failed to inspect UFW status for connection ${connectionId}: ${(err as Error).message}`);
        }

        return {
            installed: true,
            active,
            defaultIncoming,
            defaultOutgoing,
            rules,
        };
    }

    public async toggleUfw(
        connectionId: string,
        authConfig: SSHConfig,
        action: 'enable' | 'disable' | 'reload'
    ): Promise<void> {
        let cmd = 'sudo ufw reload';
        if (action === 'enable') {
            cmd = 'echo "y" | sudo ufw enable';
        } else if (action === 'disable') {
            cmd = 'sudo ufw disable';
        }

        try {
            await this.pool.exec(connectionId, authConfig, cmd);
        } catch (err: any) {
            throw new Error(`Falha ao executar ${action} no UFW: ${err.message}`);
        }
    }

    public async addRule(
        connectionId: string,
        authConfig: SSHConfig,
        options: AddUfwRuleOptions
    ): Promise<void> {
        const port = options.port.trim();
        if (!PORT_REGEX.test(port)) {
            throw new Error('Porta ou serviço inválido');
        }

        const action = options.action.toLowerCase();
        if (!['allow', 'deny', 'reject', 'limit'].includes(action)) {
            throw new Error('Ação inválida');
        }

        let cmd = `sudo ufw ${action}`;

        const proto = options.proto && options.proto !== 'any' ? options.proto : undefined;
        const from = options.from?.trim();
        if (from) {
            if (!IP_REGEX.test(from) && from !== 'any') {
                throw new Error('IP ou faixa de origem inválida');
            }
            cmd += ` from ${from} to any port ${port}`;
            if (proto) {
                cmd += ` proto ${proto}`;
            }
        } else {
            let portSpec = port;
            if (proto && !portSpec.includes('/')) {
                portSpec += `/${proto}`;
            }
            cmd += ` ${portSpec}`;
        }

        if (options.comment?.trim()) {
            const cleanComment = options.comment.replace(/['"\\]/g, '').trim();
            if (cleanComment) {
                cmd += ` comment '${cleanComment}'`;
            }
        }

        try {
            await this.pool.exec(connectionId, authConfig, cmd);
        } catch (err: any) {
            throw new Error(`Falha ao adicionar regra no UFW: ${err.message}`);
        }
    }

    public async deleteRule(
        connectionId: string,
        authConfig: SSHConfig,
        ruleNumber: number
    ): Promise<void> {
        if (!Number.isInteger(ruleNumber) || ruleNumber < 1) {
            throw new Error('Número de regra inválido');
        }

        const cmd = `echo "y" | sudo ufw delete ${ruleNumber}`;
        try {
            await this.pool.exec(connectionId, authConfig, cmd);
        } catch (err: any) {
            throw new Error(`Falha ao excluir regra ${ruleNumber}: ${err.message}`);
        }
    }
}
