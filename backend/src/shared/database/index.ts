/**
 * SQLite Database Module
 * 
 * Provides database initialization and access for the application.
 * Uses sql.js (WebAssembly SQLite) which works well with pkg bundling.
 */

import initSqlJs, { Database as SqlJsDatabase, BindParams } from 'sql.js';
import path from 'path';
import fs from 'fs';

const APP_DATA_DIR = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'Nautilus'
);

const DB_FILE = path.join(APP_DATA_DIR, 'nautilus.db');

// Ensure the directory exists
if (!fs.existsSync(APP_DATA_DIR)) {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Database instance (will be initialized async)
let db: SqlJsDatabase | null = null;
let dbInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Save database to file
 */
function saveDatabase(): void {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_FILE, buffer);
    }
}

/**
 * Initialize all database tables
 */
export async function initializeDatabase(): Promise<void> {
    if (dbInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const SQL = await initSqlJs();

        // Load existing database or create new one
        if (fs.existsSync(DB_FILE)) {
            const buffer = fs.readFileSync(DB_FILE);
            db = new SQL.Database(buffer);
            console.log('[Database] Loaded existing SQLite database from:', DB_FILE);
        } else {
            db = new SQL.Database();
            console.log('[Database] Created new SQLite database at:', DB_FILE);
        }

        // Create connections table
        db.run(`
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                user TEXT NOT NULL,
                connection_type TEXT NOT NULL DEFAULT 'ssh',
                auth_method TEXT NOT NULL DEFAULT 'key',
                key_path TEXT,
                last_seen TEXT,
                monitored_services TEXT DEFAULT '[]',
                auto_connect INTEGER DEFAULT 0,
                rdp_auth_method TEXT,
                domain TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create snippets table (for future migration)
        db.run(`
            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                command TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Save after creating tables
        saveDatabase();

        dbInitialized = true;

        // Run migrations
        const { migrateConnectionsFromJson, migrateSnippetsFromJson } = await import('./migration');
        migrateConnectionsFromJson();
        migrateSnippetsFromJson();
    })();

    return initPromise;
}

/**
 * Get the database instance
 */
export function getDatabase(): SqlJsDatabase {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Execute a SQL statement and save to disk
 */
export function runAndSave(sql: string, params?: BindParams): void {
    if (!db) {
        throw new Error('Database not initialized');
    }
    db.run(sql, params);
    saveDatabase();
}

/**
 * Execute a query and return results
 */
export function query<T = unknown>(sql: string, params?: BindParams): T[] {
    if (!db) {
        throw new Error('Database not initialized');
    }
    const stmt = db.prepare(sql);
    if (params) {
        stmt.bind(params);
    }
    const results: T[] = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
}

/**
 * Execute a query and return first result
 */
export function queryOne<T = unknown>(sql: string, params?: BindParams): T | null {
    const results = query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
        dbInitialized = false;
    }
}

/**
 * Export database as base64 string
 */
export function exportDatabase(): string {
    if (!db) {
        throw new Error('Database not initialized');
    }
    const data = db.export();
    const buffer = Buffer.from(data);
    return buffer.toString('base64');
}

/**
 * Import database from base64 string
 */
export async function importDatabase(base64Data: string): Promise<void> {
    const SQL = await initSqlJs();
    const buffer = Buffer.from(base64Data, 'base64');
    const uint8Array = new Uint8Array(buffer);

    // Close current database
    if (db) {
        db.close();
    }

    // Load the imported database
    db = new SQL.Database(uint8Array);

    // Save to disk
    saveDatabase();

    console.log('[Database] Database imported successfully');
}

/**
 * Get database file path
 */
export function getDatabasePath(): string {
    return DB_FILE;
}

export { saveDatabase };
export type { BindParams };
