import { Client, ClientChannel } from 'ssh2';
import logger from '../../shared/utils/logger';
import type { SSHConfig } from '../../shared/types';

export class TerminalSession {
    private client: Client;
    private sshConfig: SSHConfig;
    private onData: (data: string) => void;
    private terminalId: string;
    private stream: ClientChannel | null = null;

    constructor(sshConfig: SSHConfig, onData: (data: string) => void, terminalId: string) {
        this.client = new Client();
        this.sshConfig = sshConfig;
        this.onData = onData;
        this.terminalId = terminalId;
    }

    start(): void {
        this.client
            .on('ready', () => {
                logger.info(`[Terminal-${this.terminalId}] Conexão SSH pronta para ${this.sshConfig.host}.`);

                this.client.shell((err, stream) => {
                    if (err) {
                        logger.error(`[Terminal-${this.terminalId}] Erro ao iniciar o shell: ${err.message}`);
                        this.onData(Buffer.from(`\r\n\x1b[31mErro ao iniciar o shell: ${err.message}\x1b[0m\r\n`).toString('base64'));
                        return;
                    }

                    this.stream = stream;

                    stream
                        .on('close', () => {
                            logger.info(`[Terminal-${this.terminalId}] Stream do shell fechado para ${this.sshConfig.host}.`);
                            this.client.end();
                        })
                        .on('data', (data: Buffer) => {
                            this.onData(data.toString('base64'));
                        })
                        .stderr.on('data', (data: Buffer) => {
                            this.onData(data.toString('base64'));
                        });

                    logger.info(`[Terminal-${this.terminalId}] Shell iniciado com sucesso para ${this.sshConfig.host}.`);
                });
            })
            .on('error', (err) => {
                logger.error(`[Terminal-${this.terminalId}] Erro de conexão SSH: ${err.message}`);
                this.onData(Buffer.from(`\r\n\x1b[31mErro de conexão SSH: ${err.message}\x1b[0m\r\n`).toString('base64'));
            })
            .connect(this.sshConfig);
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
