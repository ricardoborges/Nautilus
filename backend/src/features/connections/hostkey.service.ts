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

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port || 22;
    }

    verify = (key: Buffer, done: (valid: boolean) => void): void => {
        try {
            const presented = fingerprintOf(key);
            const known = queryOne<KnownHostRow>(
                'SELECT * FROM known_hosts WHERE host = ? AND port = ?',
                [this.host, this.port]
            );

            if (!known) {
                // Trust On First Use: pin whatever the server presents now
                runAndSave(
                    'INSERT INTO known_hosts (host, port, fingerprint) VALUES (?, ?, ?)',
                    [this.host, this.port, presented]
                );
                done(true);
                return;
            }

            if (known.fingerprint === presented) {
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
        } catch (err) {
            this.error = `Falha ao verificar a chave do host: ${(err as Error).message}`;
            done(false);
        }
    };

    /** Wraps a connection error, preferring the host key reason when present. */
    wrapError(err: Error): Error {
        return this.error ? new Error(this.error) : err;
    }
}
