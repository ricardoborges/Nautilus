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

let saveTimeout: NodeJS.Timeout | null = null;
let isSaving = false;
let pendingSave = false;

/**
 * Save database to file asynchronously with debouncing (100ms)
 * to prevent blocking the Node.js event loop on write bursts.
 */
function saveDatabase(): void {
    if (!db) return;

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        if (isSaving) {
            pendingSave = true;
            return;
        }

        try {
            isSaving = true;
            if (db) {
                const data = db.export();
                const buffer = Buffer.from(data);
                await fs.promises.writeFile(DB_FILE, buffer);
            }
        } catch (err) {
            console.error('[Database] Error saving database:', err);
        } finally {
            isSaving = false;
            if (pendingSave) {
                pendingSave = false;
                saveDatabase();
            }
        }
    }, 100);
}

/**
 * Save database synchronously (used for app shutdown)
 */
function saveDatabaseSync(): void {
    if (db) {
        try {
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_FILE, buffer);
        } catch (err) {
            console.error('[Database] Error saving database sync:', err);
        }
    }
}

/**
 * Create/upgrade the schema on the given database.
 * Safe to call repeatedly and required after importing a database file,
 * which may come from an older version missing tables or columns.
 */
function createSchema(database: SqlJsDatabase): void {
    // Create connections table
    database.run(`
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
            tags TEXT DEFAULT '[]',
            environment TEXT DEFAULT 'other',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration for existing databases
    try { database.run("ALTER TABLE connections ADD COLUMN tags TEXT DEFAULT '[]'"); } catch {}
    try { database.run("ALTER TABLE connections ADD COLUMN environment TEXT DEFAULT 'other'"); } catch {}

    // Create snippets table (for future migration)
    database.run(`
        CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            command TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create known_hosts table (SSH host key pinning / TOFU)
    database.run(`
        CREATE TABLE IF NOT EXISTS known_hosts (
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            fingerprint TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (host, port)
        )
    `);
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

        createSchema(db);

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
        if (saveTimeout) clearTimeout(saveTimeout);
        saveDatabaseSync();
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
    if (typeof base64Data !== 'string' || !base64Data) {
        throw new Error('Backup inválido: conteúdo vazio');
    }

    const SQL = await initSqlJs();
    const buffer = Buffer.from(base64Data, 'base64');

    // Validate the SQLite header before touching the live database
    if (buffer.length < 16 || buffer.toString('utf8', 0, 15) !== 'SQLite format 3') {
        throw new Error('Backup inválido: não é um arquivo de banco Nautilus');
    }

    // Open the candidate first; only replace the live database if it loads
    let imported: SqlJsDatabase;
    try {
        imported = new SQL.Database(new Uint8Array(buffer));
        // Missing tables/columns are expected on backups from older versions
        createSchema(imported);
    } catch (err) {
        throw new Error(`Backup inválido: ${(err as Error).message}`);
    }

    if (db) {
        db.close();
    }

    db = imported;

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
