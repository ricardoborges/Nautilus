import crypto from 'crypto';
import type { Snippet, SnippetData } from '../../shared/types';

export class SnippetModel implements Snippet {
    id: string;
    name: string;
    command: string;
    isSecret?: boolean;

    constructor(data: SnippetData) {
        this.id = data.id || crypto.randomUUID();
        this.name = data.name;
        this.command = data.command;
        this.isSecret = Boolean(data.isSecret);
    }
}
