/**
 * Database Migration Utilities
 * 
 * Handles migration from JSON files to SQLite database.
 */

import path from 'path';
import fs from 'fs';
import { getDatabase, saveDatabase, query } from './index';
import type { ConnectionData, SnippetData } from '../types';

const APP_DATA_DIR = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'Nautilus'
);

const OLD_CONNECTIONS_FILE = path.join(APP_DATA_DIR, 'connections.json');
const OLD_SNIPPETS_FILE = path.join(APP_DATA_DIR, 'snippets.json');

/**
 * Helper to convert value to SQL-safe type
 */
function toSqlValue(value: unknown): string | number | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    if (typeof value === 'number') {
        return value;
    }
    return String(value);
}

/**
 * Migrate connections from JSON file to SQLite database
 */
export function migrateConnectionsFromJson(): void {
    // Check if JSON file exists
    if (!fs.existsSync(OLD_CONNECTIONS_FILE)) {
        console.log('[Migration] No JSON connections file found, skipping migration');
        return;
    }

    const db = getDatabase();

    // Check if we already have connections in the database
    const result = query<{ count: number }>('SELECT COUNT(*) as count FROM connections');

    if (result.length > 0 && result[0].count > 0) {
        console.log('[Migration] Database already has connections, skipping migration');
        return;
    }

    try {
        // Read JSON file
        const jsonData = fs.readFileSync(OLD_CONNECTIONS_FILE, 'utf-8');
        const connections = JSON.parse(jsonData) as ConnectionData[];

        if (!Array.isArray(connections) || connections.length === 0) {
            console.log('[Migration] No connections found in JSON file');
            return;
        }

        console.log(`[Migration] Found ${connections.length} connections to migrate`);

        // Insert each connection
        for (const conn of connections) {
            const id = toSqlValue(conn.id);
            const name = toSqlValue(conn.name);
            const description = toSqlValue(conn.description);
            const host = toSqlValue(conn.host);
            const port = conn.port ?? (conn.connectionType === 'rdp' ? 3389 : 22);
            const user = toSqlValue(conn.user);
            const connectionType = toSqlValue(conn.connectionType ?? 'ssh');
            const authMethod = toSqlValue(conn.authMethod ?? 'key');
            const keyPath = toSqlValue(conn.keyPath);
            const lastSeen = toSqlValue(conn.lastSeen);
            const monitoredServices = JSON.stringify(conn.monitoredServices ?? []);
            const autoConnect = conn.autoConnect ? 1 : 0;
            const rdpAuthMethod = toSqlValue(conn.rdpAuthMethod);
            const domain = toSqlValue(conn.domain);

            db.run(`
                INSERT INTO connections (
                    id, name, description, host, port, user,
                    connection_type, auth_method, key_path, last_seen,
                    monitored_services, auto_connect, rdp_auth_method, domain
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, name, description, host, port, user, connectionType, authMethod, keyPath, lastSeen, monitoredServices, autoConnect, rdpAuthMethod, domain]);
        }

        // Save after all inserts
        saveDatabase();

        console.log(`[Migration] Successfully migrated ${connections.length} connections to SQLite`);

        // Rename old file as backup
        const backupFile = OLD_CONNECTIONS_FILE + '.backup';
        fs.renameSync(OLD_CONNECTIONS_FILE, backupFile);
        console.log(`[Migration] Old JSON file backed up to ${backupFile}`);

    } catch (error) {
        console.error('[Migration] Error migrating connections:', error);
    }
}

/**
 * Migrate snippets from JSON file to SQLite database
 */
export function migrateSnippetsFromJson(): void {
    // Check if JSON file exists
    if (!fs.existsSync(OLD_SNIPPETS_FILE)) {
        console.log('[Migration] No JSON snippets file found, skipping migration');
        return;
    }

    const db = getDatabase();

    // Check if we already have snippets in the database
    const result = query<{ count: number }>('SELECT COUNT(*) as count FROM snippets');

    if (result.length > 0 && result[0].count > 0) {
        console.log('[Migration] Database already has snippets, skipping migration');
        return;
    }

    try {
        // Read JSON file
        const jsonData = fs.readFileSync(OLD_SNIPPETS_FILE, 'utf-8');
        const snippets = JSON.parse(jsonData) as SnippetData[];

        if (!Array.isArray(snippets) || snippets.length === 0) {
            console.log('[Migration] No snippets found in JSON file');
            return;
        }

        console.log(`[Migration] Found ${snippets.length} snippets to migrate`);

        // Insert each snippet
        for (const snippet of snippets) {
            const id = toSqlValue(snippet.id);
            const name = toSqlValue(snippet.name);
            const command = toSqlValue(snippet.command);

            db.run(`
                INSERT INTO snippets (id, name, command)
                VALUES (?, ?, ?)
            `, [id, name, command]);
        }

        // Save after all inserts
        saveDatabase();

        console.log(`[Migration] Successfully migrated ${snippets.length} snippets to SQLite`);

        // Rename old file as backup
        const backupFile = OLD_SNIPPETS_FILE + '.backup';
        fs.renameSync(OLD_SNIPPETS_FILE, backupFile);
        console.log(`[Migration] Old JSON file backed up to ${backupFile}`);

    } catch (error) {
        console.error('[Migration] Error migrating snippets:', error);
    }
}
