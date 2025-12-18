import path from 'path';
import fs from 'fs/promises';
import { SnippetModel } from './snippet.model';
import type { Snippet, SnippetData } from '../../shared/types';

const STORAGE_FILE = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'Nautilus',
    'snippets.json'
);

class SnippetManager {
    private snippets: SnippetModel[] = [];

    private async ensureStorageDir(): Promise<void> {
        const dir = path.dirname(STORAGE_FILE);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch {
            // Ignore if already exists
        }
    }

    private async loadSnippetsFromFile(): Promise<SnippetModel[]> {
        await this.ensureStorageDir();
        try {
            const data = await fs.readFile(STORAGE_FILE, 'utf-8');
            const rawSnippets = JSON.parse(data) as SnippetData[];
            this.snippets = rawSnippets.map(s => new SnippetModel(s));
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                this.snippets = [];
                await this.saveSnippetsToFile();
            } else {
                console.error('Failed to load snippets:', error);
            }
        }
        return this.snippets;
    }

    private async saveSnippetsToFile(): Promise<void> {
        await this.ensureStorageDir();
        try {
            await fs.writeFile(STORAGE_FILE, JSON.stringify(this.snippets, null, 2));
        } catch (error) {
            console.error('Failed to save snippets:', error);
        }
    }

    async list(): Promise<Snippet[]> {
        return await this.loadSnippetsFromFile();
    }

    async add(snippetData: SnippetData): Promise<Snippet> {
        await this.loadSnippetsFromFile();
        const newSnippet = new SnippetModel(snippetData);
        this.snippets.push(newSnippet);
        await this.saveSnippetsToFile();
        return newSnippet;
    }

    async update(snippetData: SnippetData): Promise<Snippet | null> {
        await this.loadSnippetsFromFile();
        const index = this.snippets.findIndex(s => s.id === snippetData.id);
        if (index !== -1) {
            this.snippets[index] = new SnippetModel(snippetData);
            await this.saveSnippetsToFile();
            return this.snippets[index];
        }
        return null;
    }

    async remove(id: string): Promise<boolean> {
        await this.loadSnippetsFromFile();
        this.snippets = this.snippets.filter(s => s.id !== id);
        await this.saveSnippetsToFile();
        return true;
    }
}

export const snippetManager = new SnippetManager();
