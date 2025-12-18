import path from 'path';
import fs from 'fs/promises';
import keytar from 'keytar';
import { ConnectionModel } from './connection.model';
import type { Connection, ConnectionData } from '../../shared/types';

const APP_NAME = 'nautilus';
const STORAGE_FILE = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'Nautilus',
    'connections.json'
);

class ConnectionManager {
    private connections: ConnectionModel[] = [];

    private async ensureStorageDir(): Promise<void> {
        const dir = path.dirname(STORAGE_FILE);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch {
            // Ignore if already exists
        }
    }

    private async loadConnectionsFromFile(): Promise<ConnectionModel[]> {
        await this.ensureStorageDir();
        try {
            const data = await fs.readFile(STORAGE_FILE, 'utf-8');
            const rawConnections = JSON.parse(data) as ConnectionData[];
            this.connections = rawConnections.map(c => new ConnectionModel(c));
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                this.connections = [];
                await this.saveConnectionsToFile();
            } else {
                console.error('Failed to load connections:', error);
            }
        }
        return this.connections;
    }

    private async saveConnectionsToFile(): Promise<void> {
        await this.ensureStorageDir();
        try {
            await fs.writeFile(STORAGE_FILE, JSON.stringify(this.connections, null, 2));
        } catch (error) {
            console.error('Failed to save connections:', error);
        }
    }

    async list(): Promise<Connection[]> {
        return await this.loadConnectionsFromFile();
    }

    async get(id: string): Promise<Connection | undefined> {
        await this.loadConnectionsFromFile();
        return this.connections.find(c => c.id === id);
    }

    async add(connectionData: ConnectionData): Promise<Connection> {
        await this.loadConnectionsFromFile();
        const newConnection = new ConnectionModel(connectionData);
        this.connections.push(newConnection);
        await this.saveConnectionsToFile();
        return newConnection;
    }

    async update(id: string, data: Partial<ConnectionData>): Promise<Connection | null> {
        await this.loadConnectionsFromFile();
        const index = this.connections.findIndex(c => c.id === id);
        if (index !== -1) {
            const existingData = this.connections[index];
            this.connections[index] = new ConnectionModel({ ...existingData, ...data, id });
            await this.saveConnectionsToFile();
            return this.connections[index];
        }
        return null;
    }

    async remove(id: string): Promise<boolean> {
        await this.loadConnectionsFromFile();
        this.connections = this.connections.filter(c => c.id !== id);
        await this.saveConnectionsToFile();
        await keytar.deletePassword(APP_NAME, id);
        return true;
    }

    async setPassword(connectionId: string, password: string): Promise<void> {
        await keytar.setPassword(APP_NAME, connectionId, password);
    }

    async getPassword(connectionId: string): Promise<string | null> {
        return keytar.getPassword(APP_NAME, connectionId);
    }
}

export const connectionManager = new ConnectionManager();
