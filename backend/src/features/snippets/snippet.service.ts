/**
 * Snippet Service
 * 
 * Business logic layer for snippet management.
 * Uses SQLite repository for persistence.
 */

import { snippetRepository } from './snippet.repository';
import type { Snippet, SnippetData } from '../../shared/types';

class SnippetManager {
    /**
     * Get all snippets
     */
    async list(): Promise<Snippet[]> {
        return snippetRepository.findAll();
    }

    /**
     * Add a new snippet
     */
    async add(snippetData: SnippetData): Promise<Snippet> {
        return snippetRepository.create(snippetData);
    }

    /**
     * Update an existing snippet
     */
    async update(snippetData: SnippetData): Promise<Snippet | null> {
        return snippetRepository.update(snippetData);
    }

    /**
     * Remove a snippet
     */
    async remove(id: string): Promise<boolean> {
        return snippetRepository.delete(id);
    }
}

export const snippetManager = new SnippetManager();
