import { Client, ClientChannel } from 'ssh2';
import logger from '../../shared/utils/logger';
import type { SSHConfig } from '../../shared/types';

export class TerminalSession {
    private client: Client;
    private sshConfig: SSHConfig;
    private onData: (data: string) => void;
    private terminalId: string;
    private stream: ClientChannel | null = null;

    private initialCommand?: string;
    private pendingSize: { cols: number; rows: number } | null = null;

    constructor(
        sshConfig: SSHConfig,
        onData: (data: string) => void,
        terminalId: string,
        initialCommand?: string,
        initialSize?: { cols: number; rows: number }
    ) {
        this.client = new Client();
        this.sshConfig = sshConfig;
        this.onData = onData;
        this.terminalId = terminalId;
        this.initialCommand = initialCommand;
        this.pendingSize = initialSize ?? null;
    }

    start(): void {
        this.client
            .on('ready', () => {
                logger.info(`[Terminal-${this.terminalId}] Conexão SSH pronta para ${this.sshConfig.host}.`);

                const ptyOptions = {
                    term: 'xterm-256color',
                    cols: this.pendingSize?.cols ?? 80,
                    rows: this.pendingSize?.rows ?? 24,
                };

                this.client.shell(ptyOptions, (err, stream) => {
                    if (err) {
                        logger.error(`[Terminal-${this.terminalId}] Erro ao iniciar o shell: ${err.message}`);
                        this.onData(Buffer.from(`\r\n\x1b[31mErro ao iniciar o shell: ${err.message}\x1b[0m\r\n`).toString('base64'));
                        return;
                    }

                    this.stream = stream;

                    stream
                        .on('close', () => {
                            logger.info(`[Terminal-${this.terminalId}] Stream do shell fechado para ${this.sshConfig.host}.`);
                            this.onData(Buffer.from(`\r\n\x1b[31m[Nautilus] Conexão encerrada pelo servidor ou perdida.\x1b[0m\r\n`).toString('base64'));
                            this.client.end();
                        })
                        .on('data', (data: Buffer) => {
                            this.onData(data.toString('base64'));
                        })
                        .stderr.on('data', (data: Buffer) => {
                            this.onData(data.toString('base64'));
                        });

                    // Aplica um resize solicitado antes do stream existir
                    if (this.pendingSize) {
                        stream.setWindow(this.pendingSize.rows, this.pendingSize.cols, 0, 0);
                        this.pendingSize = null;
                    }

                    if (this.initialCommand) {
                        stream.write(`${this.initialCommand}\n`);
                    }

                    logger.info(`[Terminal-${this.terminalId}] Shell iniciado com sucesso para ${this.sshConfig.host}.`);
                });
            })
            .on('error', (err) => {
                logger.error(`[Terminal-${this.terminalId}] Erro de conexão SSH: ${err.message}`);
                this.onData(Buffer.from(`\r\n\x1b[31mErro de conexão SSH: ${err.message}\x1b[0m\r\n`).toString('base64'));
            })
            .connect({
                keepaliveInterval: 15000,
                keepaliveCountMax: 3,
                readyTimeout: 20000,
                ...this.sshConfig
            });
    }

    write(data: string): void {
        if (this.stream) {
            // Data comes as base64 from frontend
            const decoded = Buffer.from(data, 'base64').toString();
            this.stream.write(decoded);
        } else {
            logger.warn(`[Terminal-${this.terminalId}] Tentativa de escrita em um stream nulo.`);
        }
    }

    resize(cols: number, rows: number): void {
        if (this.stream) {
            this.stream.setWindow(rows, cols, 0, 0);
        } else {
            // Stream ainda não está pronto: guarda para aplicar na abertura do shell
            this.pendingSize = { cols, rows };
        }
    }

    stop(): void {
        if (this.stream) {
            this.stream.end();
            logger.info(`[Terminal-${this.terminalId}] Enviado comando de finalização para o stream.`);
        }
        this.client.end();
        logger.info(`[Terminal-${this.terminalId}] Cliente SSH para ${this.sshConfig.host} finalizado.`);
    }
}
