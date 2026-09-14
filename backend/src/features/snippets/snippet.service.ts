/**
 * Snippet Service
 * 
 * Business logic layer for snippet management.
 * Uses SQLite repository for persistence.
 */

import keytar from 'keytar';
import { snippetRepository } from './snippet.repository';
import type { Snippet, SnippetData } from '../../shared/types';

const APP_NAME = 'nautilus';

class SnippetManager {
    /**
     * Get all snippets (populating secret commands from secure store)
     */
    async list(): Promise<Snippet[]> {
        const snippets = snippetRepository.findAll();
        return await Promise.all(snippets.map(async (s) => {
            if (s.isSecret) {
                try {
                    const secret = await keytar.getPassword(APP_NAME, `snippet:${s.id}`);
                    return { ...s, command: secret ?? '' };
                } catch (err) {
                    console.error(`[SnippetService] Error retrieving secret for snippet ${s.id}:`, err);
                    return { ...s, command: '' };
                }
            }
            return s;
        }));
    }

    /**
     * Add a new snippet
     */
    async add(snippetData: SnippetData): Promise<Snippet> {
        const snippet = snippetRepository.create(snippetData);
        if (snippetData.isSecret && snippetData.command) {
            try {
                await keytar.setPassword(APP_NAME, `snippet:${snippet.id}`, snippetData.command);
            } catch (err) {
                console.error(`[SnippetService] Error saving secret for snippet ${snippet.id}:`, err);
            }
        }
        return snippet;
    }

    /**
     * Update an existing snippet
     */
    async update(snippetData: SnippetData): Promise<Snippet | null> {
        const snippet = snippetRepository.update(snippetData);
        if (!snippet) return null;

        if (snippet.isSecret) {
            if (snippetData.command !== undefined) {
                try {
                    await keytar.setPassword(APP_NAME, `snippet:${snippet.id}`, snippetData.command);
                } catch (err) {
                    console.error(`[SnippetService] Error updating secret for snippet ${snippet.id}:`, err);
                }
            }
        } else {
            try {
                await keytar.deletePassword(APP_NAME, `snippet:${snippet.id}`);
            } catch {}
        }

        return snippet;
    }

    /**
     * Remove a snippet
     */
    async remove(id: string): Promise<boolean> {
        const deleted = snippetRepository.delete(id);
        if (deleted) {
            try {
                await keytar.deletePassword(APP_NAME, `snippet:${id}`);
            } catch (err) {
                console.error(`[SnippetService] Error deleting secret for snippet ${id}:`, err);
            }
        }
        return deleted;
    }
}

export const snippetManager = new SnippetManager();
