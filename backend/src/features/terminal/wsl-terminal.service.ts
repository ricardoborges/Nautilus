import { spawn, ChildProcess } from 'child_process';
import logger from '../../shared/utils/logger';

export interface ITerminalSession {
    start(): void;
    stop(): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
}

export class WSLTerminalSession implements ITerminalSession {
    private proc: ChildProcess | null = null;
    private onData: (data: string) => void;
    private terminalId: string;
    private distro?: string;
    private user?: string;
    private initialCommand?: string;
    private isClosed = false;

    constructor(
        onData: (data: string) => void,
        terminalId: string,
        distro?: string,
        user?: string,
        initialCommand?: string
    ) {
        this.onData = onData;
        this.terminalId = terminalId;
        this.distro = distro;
        this.user = user;
        this.initialCommand = initialCommand;
    }

    start(): void {
        const args: string[] = [];
        if (this.distro) {
            args.push('-d', this.distro);
        }
        if (this.user) {
            args.push('-u', this.user);
        }
        // Launch custom command or interactive bash / fallback to interactive sh
        const cmd = this.initialCommand || 'if command -v bash >/dev/null 2>&1; then exec bash -i; else exec sh -i; fi';
        args.push('--', 'sh', '-c', cmd);

        try {
            logger.info(`[WSL-Terminal-${this.terminalId}] Iniciando processo WSL interativo: wsl.exe ${args.join(' ')}`);
            this.proc = spawn('wsl.exe', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });

            this.proc.stdout?.on('data', (data: Buffer) => {
                this.onData(data.toString('base64'));
            });

            this.proc.stderr?.on('data', (data: Buffer) => {
                this.onData(data.toString('base64'));
            });

            this.proc.on('close', (code) => {
                if (this.isClosed) return;
                this.isClosed = true;
                const msg = `\r\n\x1b[33m[Nautilus] Sessão WSL finalizada (código ${code ?? 0}).\x1b[0m\r\n`;
                this.onData(Buffer.from(msg).toString('base64'));
            });

            this.proc.on('error', (err) => {
                if (this.isClosed) return;
                this.isClosed = true;
                logger.error(`[WSL-Terminal-${this.terminalId}] Erro ao iniciar processo WSL: ${err.message}`);
                const msg = `\r\n\x1b[31m[Nautilus] Falha ao iniciar WSL: ${err.message}.\x1b[0m\r\n`;
                this.onData(Buffer.from(msg).toString('base64'));
            });
        } catch (err) {
            this.isClosed = true;
            const msg = `\r\n\x1b[31m[Nautilus] Erro ao instanciar processo WSL: ${(err as Error).message}.\x1b[0m\r\n`;
            this.onData(Buffer.from(msg).toString('base64'));
        }
    }

    write(data: string): void {
        if (this.isClosed || !this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
            return;
        }
        try {
            const decoded = Buffer.from(data, 'base64').toString();
            this.proc.stdin.write(decoded);
        } catch (e) {
            logger.error(`[WSL-Terminal-${this.terminalId}] Erro ao escrever no stdin: ${(e as Error).message}`);
        }
    }

    resize(_cols: number, _rows: number): void {
        // Sem suporte a resize de PTY nativo sem node-pty
    }

    stop(): void {
        if (this.isClosed) return;
        this.isClosed = true;
        if (this.proc) {
            try {
                this.proc.kill();
            } catch {
                // ignore
            }
            this.proc = null;
        }
    }
}
