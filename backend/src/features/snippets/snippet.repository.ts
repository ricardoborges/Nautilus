/**
 * Snippet Repository
 * 
 * Handles all database operations for snippets using SQLite (sql.js).
 */

import crypto from 'crypto';
import { getDatabase, saveDatabase, query, queryOne, BindParams } from '../../shared/database';
import type { Snippet, SnippetData, SnippetStep } from '../../shared/types';

interface SnippetRow {
    id: string;
    name: string;
    command: string;
    is_secret?: number | null;
    steps?: string | null;
    created_at: string;
    updated_at: string;
}

function parseSteps(stepsJson?: string | null): SnippetStep[] | undefined {
    if (!stepsJson) return undefined;
    try {
        const parsed = JSON.parse(stepsJson);
        return Array.isArray(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function rowToSnippet(row: SnippetRow): Snippet {
    return {
        id: row.id,
        name: row.name,
        command: row.command,
        isSecret: Boolean(row.is_secret),
        steps: parseSteps(row.steps),
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
        const isSecret = Boolean(data.isSecret);
        // If secret, do not store sensitive content in plain text in sqlite
        const storedCommand = isSecret ? '' : data.command;
        const storedSteps = data.steps && data.steps.length > 0 ? JSON.stringify(data.steps) : null;

        const params: BindParams = [
            id,
            data.name,
            storedCommand,
            isSecret ? 1 : 0,
            storedSteps,
        ];

        db.run(`
            INSERT INTO snippets (id, name, command, is_secret, steps)
            VALUES (?, ?, ?, ?, ?)
        `, params);

        saveDatabase();
        return {
            id,
            name: data.name,
            command: data.command,
            isSecret,
            steps: data.steps,
        };
    }

    /**
     * Update an existing snippet
     */
    update(data: SnippetData): Snippet | null {
        if (!data.id) return null;
        
        const existing = this.findById(data.id);
        if (!existing) return null;

        const db = getDatabase();
        const isSecret = data.isSecret !== undefined ? Boolean(data.isSecret) : Boolean(existing.isSecret);
        const newCommand = data.command ?? existing.command;
        const storedCommand = isSecret ? '' : newCommand;
        const newSteps = data.steps !== undefined ? data.steps : existing.steps;
        const storedSteps = newSteps && newSteps.length > 0 ? JSON.stringify(newSteps) : null;

        const params: BindParams = [
            data.name ?? existing.name,
            storedCommand,
            isSecret ? 1 : 0,
            storedSteps,
            data.id,
        ];

        db.run(`
            UPDATE snippets SET
                name = ?,
                command = ?,
                is_secret = ?,
                steps = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, params);

        saveDatabase();
        return {
            id: data.id,
            name: data.name ?? existing.name,
            command: newCommand,
            isSecret,
            steps: newSteps,
        };
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
