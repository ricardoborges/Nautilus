/**
 * Connection Repository
 * 
 * Handles all database operations for connections using SQLite (sql.js).
 */

import { getDatabase, saveDatabase, query, queryOne, BindParams } from '../../shared/database';
import type { ConnectionData, Connection } from '../../shared/types';

interface ConnectionRow {
    id: string;
    name: string;
    description: string | null;
    host: string;
    port: number;
    user: string;
    connection_type: string;
    auth_method: string;
    key_path: string | null;
    last_seen: string | null;
    monitored_services: string;
    auto_connect: number;
    rdp_auth_method: string | null;
    domain: string | null;
    created_at: string;
    updated_at: string;
}

function rowToConnection(row: ConnectionRow): Connection {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        host: row.host,
        port: row.port,
        user: row.user,
        connectionType: row.connection_type as 'ssh' | 'rdp',
        authMethod: row.auth_method as 'password' | 'key',
        keyPath: row.key_path,
        lastSeen: row.last_seen,
        monitoredServices: JSON.parse(row.monitored_services || '[]'),
        autoConnect: Boolean(row.auto_connect),
        rdpAuthMethod: row.rdp_auth_method as 'credentials' | 'windows_auth' | undefined,
        domain: row.domain ?? undefined,
    };
}

export class ConnectionRepository {
    /**
     * Get all connections
     */
    findAll(): Connection[] {
        const rows = query<ConnectionRow>('SELECT * FROM connections ORDER BY name');
        return rows.map(rowToConnection);
    }

    /**
     * Get a connection by ID
     */
    findById(id: string): Connection | null {
        const row = queryOne<ConnectionRow>('SELECT * FROM connections WHERE id = ?', [id]);
        return row ? rowToConnection(row) : null;
    }

    /**
     * Create a new connection
     */
    create(data: ConnectionData & { id: string }): Connection {
        const db = getDatabase();

        const params: BindParams = [
            data.id,
            data.name,
            data.description ?? null,
            data.host,
            data.port ?? (data.connectionType === 'rdp' ? 3389 : 22),
            data.user,
            data.connectionType ?? 'ssh',
            data.authMethod ?? 'key',
            data.keyPath ?? null,
            data.lastSeen ?? null,
            JSON.stringify(data.monitoredServices ?? []),
            data.autoConnect ? 1 : 0,
            data.rdpAuthMethod ?? null,
            data.domain ?? null,
        ];

        db.run(`
            INSERT INTO connections (
                id, name, description, host, port, user,
                connection_type, auth_method, key_path, last_seen,
                monitored_services, auto_connect, rdp_auth_method, domain
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, params);

        saveDatabase();
        return this.findById(data.id)!;
    }

    /**
     * Update an existing connection
     */
    update(id: string, data: Partial<ConnectionData>): Connection | null {
        const existing = this.findById(id);
        if (!existing) return null;

        const db = getDatabase();

        const params: BindParams = [
            data.name ?? existing.name,
            data.description ?? existing.description ?? null,
            data.host ?? existing.host,
            data.port ?? existing.port,
            data.user ?? existing.user,
            data.connectionType ?? existing.connectionType,
            data.authMethod ?? existing.authMethod,
            data.keyPath ?? existing.keyPath,
            data.lastSeen ?? existing.lastSeen,
            JSON.stringify(data.monitoredServices ?? existing.monitoredServices),
            (data.autoConnect ?? existing.autoConnect) ? 1 : 0,
            data.rdpAuthMethod ?? existing.rdpAuthMethod ?? null,
            data.domain ?? existing.domain ?? null,
            id,
        ];

        db.run(`
            UPDATE connections SET
                name = ?,
                description = ?,
                host = ?,
                port = ?,
                user = ?,
                connection_type = ?,
                auth_method = ?,
                key_path = ?,
                last_seen = ?,
                monitored_services = ?,
                auto_connect = ?,
                rdp_auth_method = ?,
                domain = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, params);

        saveDatabase();
        return this.findById(id);
    }

    /**
     * Delete a connection
     */
    delete(id: string): boolean {
        const db = getDatabase();
        const existing = this.findById(id);
        if (!existing) return false;

        db.run('DELETE FROM connections WHERE id = ?', [id]);
        saveDatabase();
        return true;
    }

    /**
     * Check if a connection exists
     */
    exists(id: string): boolean {
        const result = queryOne<{ count: number }>('SELECT 1 as count FROM connections WHERE id = ?', [id]);
        return result !== null;
    }

    /**
     * Count all connections
     */
    count(): number {
        const result = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM connections');
        return result?.count ?? 0;
    }
}

export const connectionRepository = new ConnectionRepository();
