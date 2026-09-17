import { Client, ClientChannel } from 'ssh2';
import { HostKeyVerifier } from '../connections/hostkey.service';
import logger from '../../shared/utils/logger';
import type { SSHConfig } from '../../shared/types';

export class TerminalSession {
    private client: Client;
    private sshConfig: SSHConfig;
    private onData: (data: string) => void;
    private terminalId: string;
    private stream: ClientChannel | null = null;
    private isClosed = false;

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
        const verifier = new HostKeyVerifier(this.sshConfig.host, this.sshConfig.port);
        const disarm = verifier.armTimeout((err) => {
            logger.error(`[Terminal-${this.terminalId}] ${err.message}`);
            this.handleDisconnect(err.message);
        });

        this.client
            .on('connect', () => {
                logger.info(`[Terminal-${this.terminalId}] Socket TCP conectado a ${this.sshConfig.host}:${this.sshConfig.port}. Configurando TCP keepalive.`);
                const sock = (this.client as any)._sock;
                if (sock && typeof sock.setKeepAlive === 'function') {
                    sock.setKeepAlive(true, 10000);
                }
                if (typeof this.client.setNoDelay === 'function') {
                    this.client.setNoDelay(true);
                }
            })
            .on('ready', () => {
                disarm();
                logger.info(`[Terminal-${this.terminalId}] Conexão SSH pronta para ${this.sshConfig.host}.`);

                const ptyOptions = {
                    term: 'xterm-256color',
                    cols: this.pendingSize?.cols ?? 80,
                    rows: this.pendingSize?.rows ?? 24,
                };

                this.client.shell(ptyOptions, (err, stream) => {
                    if (err) {
                        logger.error(`[Terminal-${this.terminalId}] Erro ao iniciar o shell: ${err.message}`);
                        this.handleDisconnect(`Erro ao iniciar o shell: ${err.message}`);
                        return;
                    }

                    this.stream = stream;

                    stream
                        .on('close', () => {
                            logger.info(`[Terminal-${this.terminalId}] Stream do shell fechado para ${this.sshConfig.host}.`);
                            this.handleDisconnect('Sessão encerrada');
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
                disarm();
                const reason = verifier.wrapError(err).message;
                logger.error(`[Terminal-${this.terminalId}] Erro de conexão SSH: ${reason}`);
                this.handleDisconnect(reason);
            })
            .on('end', () => {
                disarm();
                logger.info(`[Terminal-${this.terminalId}] Conexão SSH finalizada (end).`);
                this.handleDisconnect('Conexão encerrada pelo servidor');
            })
            .on('close', () => {
                disarm();
                logger.info(`[Terminal-${this.terminalId}] Conexão SSH fechada (close).`);
                this.handleDisconnect('Conexão fechada');
            })
            .on('timeout', () => {
                disarm();
                logger.warn(`[Terminal-${this.terminalId}] Timeout de conexão SSH.`);
                this.handleDisconnect('Tempo limite de conexão excedido');
            })
            .connect({
                ...this.sshConfig,
                keepaliveInterval: 10000,
                keepaliveCountMax: 6,
                readyTimeout: verifier.readyTimeout,
                hostVerifier: verifier.verify
            });
    }

    private handleDisconnect(reason?: string): void {
        if (this.isClosed) return;
        this.isClosed = true;

        if (this.stream) {
            try {
                this.stream.removeAllListeners();
                this.stream.destroy();
            } catch {
                // ignore
            }
            this.stream = null;
        }

        const msg = reason 
            ? `\r\n\x1b[31m[Nautilus] Conexão SSH encerrada: ${reason}.\x1b[0m\r\n`
            : `\r\n\x1b[31m[Nautilus] Conexão SSH encerrada pelo servidor ou perdida.\x1b[0m\r\n`;

        this.onData(Buffer.from(msg).toString('base64'));

        try {
            this.client.removeAllListeners();
            this.client.end();
        } catch {
            // ignore
        }
    }

    write(data: string): void {
        if (this.isClosed || !this.stream || !this.stream.writable) {
            logger.warn(`[Terminal-${this.terminalId}] Tentativa de escrita em sessão encerrada ou stream indisponível.`);
            this.onData(Buffer.from(`\r\n\x1b[33m[Nautilus] Terminal desconectado. Não é possível enviar comandos.\x1b[0m\r\n`).toString('base64'));
            return;
        }
        // Data comes as base64 from frontend
        const decoded = Buffer.from(data, 'base64').toString();
        this.stream.write(decoded);
    }

    resize(cols: number, rows: number): void {
        if (this.stream && this.stream.writable) {
            this.stream.setWindow(rows, cols, 0, 0);
        } else {
            // Stream ainda não está pronto: guarda para aplicar na abertura do shell
            this.pendingSize = { cols, rows };
        }
    }

    stop(): void {
        this.isClosed = true;
        if (this.stream) {
            try {
                this.stream.removeAllListeners();
                this.stream.destroy();
            } catch {}
            this.stream = null;
            logger.info(`[Terminal-${this.terminalId}] Stream finalizado.`);
        }
        try {
            this.client.removeAllListeners();
            this.client.end();
        } catch {}
        logger.info(`[Terminal-${this.terminalId}] Cliente SSH para ${this.sshConfig.host} finalizado.`);
    }
}
