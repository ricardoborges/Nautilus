/**
 * SSH Host Key Verification
 *
 * Implements Trust On First Use (TOFU) host key pinning, backed by the
 * `known_hosts` table. Without this, ssh2 accepts ANY host key silently,
 * which lets a network attacker impersonate the server and capture the
 * password sent during authentication.
 */

import crypto from 'crypto';
import { query, queryOne, runAndSave } from '../../shared/database';

export interface KnownHost {
    host: string;
    port: number;
    fingerprint: string;
    createdAt: string;
}

interface KnownHostRow {
    host: string;
    port: number;
    fingerprint: string;
    created_at: string;
}

/**
 * OpenSSH-style fingerprint: base64 SHA-256 of the public key blob, unpadded.
 */
export function fingerprintOf(key: Buffer): string {
    const digest = crypto.createHash('sha256').update(key).digest('base64');
    return `SHA256:${digest.replace(/=+$/, '')}`;
}

export function listKnownHosts(): KnownHost[] {
    const rows = query<KnownHostRow>('SELECT * FROM known_hosts ORDER BY host, port');
    return rows.map(row => ({
        host: row.host,
        port: row.port,
        fingerprint: row.fingerprint,
        createdAt: row.created_at,
    }));
}

export function forgetKnownHost(host: string, port: number): boolean {
    const existing = queryOne<KnownHostRow>(
        'SELECT * FROM known_hosts WHERE host = ? AND port = ?',
        [host, port]
    );
    if (!existing) return false;

    runAndSave('DELETE FROM known_hosts WHERE host = ? AND port = ?', [host, port]);
    return true;
}

export function isKnownHost(host: string, port: number): boolean {
    return queryOne<KnownHostRow>(
        'SELECT * FROM known_hosts WHERE host = ? AND port = ?',
        [host, port || 22]
    ) !== null;
}

export function trustHost(host: string, port: number, fingerprint: string): void {
    runAndSave(
        'INSERT OR REPLACE INTO known_hosts (host, port, fingerprint) VALUES (?, ?, ?)',
        [host, port || 22, fingerprint]
    );
}

export interface HostKeyPromptRequest {
    host: string;
    port: number;
    fingerprint: string;
}

export interface HostKeyPromptResult {
    accepted: boolean;
    /** Why it was not accepted, when that is not simply "the user said no". */
    reason?: string;
}

/**
 * Asks the user to confirm an unknown host key.
 * Installed by the API layer, which relays the question to the UI.
 */
export type HostKeyPromptHandler = (request: HostKeyPromptRequest) => Promise<HostKeyPromptResult>;

let promptHandler: HostKeyPromptHandler | null = null;

export function setHostKeyPromptHandler(handler: HostKeyPromptHandler | null): void {
    promptHandler = handler;
}

/** How long the handshake may take, excluding time spent waiting on the user. */
export const HANDSHAKE_TIMEOUT_MS = 20000;

/**
 * Per-connection host key verifier.
 *
 * ssh2 only tells the caller that the handshake failed, so the mismatch
 * details are kept on `error` for the connect() wrapper to surface.
 */
export class HostKeyVerifier {
    public error: string | null = null;

    private host: string;
    private port: number;
    private known: boolean;
    private timer: NodeJS.Timeout | null = null;
    private onTimeout: ((err: Error) => void) | null = null;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port || 22;
        this.known = isKnownHost(this.host, this.port);
    }

    /**
     * Value for ssh2's `readyTimeout`. For an unknown host the handshake pauses
     * while the user decides, so ssh2's own timer is disabled and the handshake
     * is timed here instead - see armTimeout().
     */
    get readyTimeout(): number {
        return this.known ? HANDSHAKE_TIMEOUT_MS : 0;
    }

    /**
     * Times the handshake for unknown hosts, pausing while the user is being
     * asked. Returns a disarm function to call once connected or failed.
     */
    armTimeout(onTimeout: (err: Error) => void): () => void {
        if (this.known) return () => {};

        this.onTimeout = onTimeout;
        this.startTimer();
        return () => this.clearTimer();
    }

    private startTimer(): void {
        this.clearTimer();
        if (!this.onTimeout) return;
        const fire = this.onTimeout;
        this.timer = setTimeout(() => fire(new Error('Timed out while waiting for handshake')), HANDSHAKE_TIMEOUT_MS);
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    verify = (key: Buffer, done: (valid: boolean) => void): void => {
        // The server answered, so the handshake is not stalled; the clock
        // restarts once the user has decided.
        this.clearTimer();

        void (async () => {
            try {
                const presented = fingerprintOf(key);
                const known = queryOne<KnownHostRow>(
                    'SELECT * FROM known_hosts WHERE host = ? AND port = ?',
                    [this.host, this.port]
                );

                if (known) {
                    if (known.fingerprint === presented) {
                        this.startTimer();
                        done(true);
                        return;
                    }

                    this.error =
                        `A chave do host mudou para ${this.host}:${this.port} — conexão recusada.\n` +
                        `Esperada: ${known.fingerprint}\n` +
                        `Recebida: ${presented}\n` +
                        `Isso pode ser um ataque man-in-the-middle. Se o servidor foi reinstalado ` +
                        `ou teve as chaves rotacionadas, remova o host confiado em Configurações e conecte novamente.`;
                    done(false);
                    return;
                }

                // Unknown host: never trust it silently, ask the user first.
                if (!promptHandler) {
                    this.error =
                        `Chave desconhecida para ${this.host}:${this.port} (${presented}) e não há ` +
                        `interface disponível para confirmá-la. Conexão recusada.`;
                    done(false);
                    return;
                }

                const decision = await promptHandler({
                    host: this.host,
                    port: this.port,
                    fingerprint: presented,
                });

                if (!decision.accepted) {
                    this.error = decision.reason
                        ?? `Chave do host ${this.host}:${this.port} (${presented}) não foi confirmada. ` +
                           `Conexão recusada.`;
                    done(false);
                    return;
                }

                trustHost(this.host, this.port, presented);
                this.known = true;
                this.startTimer();
                done(true);
            } catch (err) {
                this.error = `Falha ao verificar a chave do host: ${(err as Error).message}`;
                done(false);
            }
        })();
    };

    /** Wraps a connection error, preferring the host key reason when present. */
    wrapError(err: Error): Error {
        this.clearTimer();
        return this.error ? new Error(this.error) : err;
    }
}
