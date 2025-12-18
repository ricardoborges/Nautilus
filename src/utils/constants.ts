import type { Snippet } from '../types';

/**
 * System snippets that are always available
 */
export const SYSTEM_SNIPPETS: Snippet[] = [
    {
        id: '__SEND_PASSWORD__',
        name: '🔐 Enviar Senha',
        command: '__SEND_PASSWORD__',
        isSystem: true
    }
];
