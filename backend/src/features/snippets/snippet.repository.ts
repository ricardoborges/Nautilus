/**
 * Snippet Repository
 * 
 * Handles all database operations for snippets using SQLite (sql.js).
 */

import crypto from 'crypto';
import { getDatabase, saveDatabase, query, queryOne, BindParams } from '../../shared/database';
import type { Snippet, SnippetData } from '../../shared/types';

interface SnippetRow {
    id: string;
    name: string;
    command: string;
    created_at: string;
    updated_at: string;
}

function rowToSnippet(row: SnippetRow): Snippet {
    return {
        id: row.id,
        name: row.name,
        command: row.command,
    };
}

export class SnippetRepository {
    /**
     * Get all snippets
     */
    findAll(): Snippet[] {
        const rows = query<SnippetRow>('SELECT * FROM snippets ORDER BY name');
        return rows.map(rowToSnippet);
    }

    /**
     * Get a snippet by ID
     */
    findById(id: string): Snippet | null {
        const row = queryOne<SnippetRow>('SELECT * FROM snippets WHERE id = ?', [id]);
        return row ? rowToSnippet(row) : null;
    }

    /**
     * Create a new snippet
     */
    create(data: SnippetData): Snippet {
        const db = getDatabase();
        const id = data.id || crypto.randomUUID();

        const params: BindParams = [
            id,
            data.name,
            data.command,
        ];

        db.run(`
            INSERT INTO snippets (id, name, command)
            VALUES (?, ?, ?)
        `, params);

        saveDatabase();
        return this.findById(id)!;
    }

    /**
     * Update an existing snippet
     */
    update(data: SnippetData): Snippet | null {
        if (!data.id) return null;
        
        const existing = this.findById(data.id);
        if (!existing) return null;

        const db = getDatabase();

        const params: BindParams = [
            data.name ?? existing.name,
            data.command ?? existing.command,
            data.id,
        ];

        db.run(`
            UPDATE snippets SET
                name = ?,
                command = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, params);

        saveDatabase();
        return this.findById(data.id);
    }

    /**
     * Delete a snippet
     */
    delete(id: string): boolean {
        const db = getDatabase();
        const existing = this.findById(id);
        if (!existing) return false;

        db.run('DELETE FROM snippets WHERE id = ?', [id]);
        saveDatabase();
        return true;
    }

    /**
     * Check if a snippet exists
     */
    exists(id: string): boolean {
        const result = queryOne<{ count: number }>('SELECT 1 as count FROM snippets WHERE id = ?', [id]);
        return result !== null;
    }

    /**
     * Count all snippets
     */
    count(): number {
        const result = queryOne<{ count: number }>('SELECT COUNT(*) as count FROM snippets');
        return result?.count ?? 0;
    }
}

export const snippetRepository = new SnippetRepository();
