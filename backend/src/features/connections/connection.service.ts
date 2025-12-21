/**
 * Connection Service
 * 
 * Business logic layer for connection management.
 * Uses SQLite repository for persistence.
 */

import crypto from 'crypto';
import keytar from 'keytar';
import { connectionRepository } from './connection.repository';
import { ConnectionModel } from './connection.model';
import type { Connection, ConnectionData } from '../../shared/types';

const APP_NAME = 'nautilus';

class ConnectionManager {
    /**
     * Get all connections
     */
    async list(): Promise<Connection[]> {
        return connectionRepository.findAll();
    }

    /**
     * Get a connection by ID
     */
    async get(id: string): Promise<Connection | undefined> {
        const connection = connectionRepository.findById(id);
        return connection ?? undefined;
    }

    /**
     * Add a new connection
     */
    async add(connectionData: ConnectionData): Promise<Connection> {
        const id = connectionData.id || crypto.randomUUID();
        const newConnection = new ConnectionModel({ ...connectionData, id });

        return connectionRepository.create({
            id,
            name: newConnection.name,
            description: newConnection.description,
            host: newConnection.host,
            port: newConnection.port,
            user: newConnection.user,
            connectionType: newConnection.connectionType,
            authMethod: newConnection.authMethod,
            keyPath: newConnection.keyPath,
            lastSeen: newConnection.lastSeen,
            monitoredServices: newConnection.monitoredServices,
            autoConnect: newConnection.autoConnect,
            rdpAuthMethod: newConnection.rdpAuthMethod,
            domain: newConnection.domain,
        });
    }

    /**
     * Update an existing connection
     */
    async update(id: string, data: Partial<ConnectionData>): Promise<Connection | null> {
        return connectionRepository.update(id, data);
    }

    /**
     * Remove a connection
     */
    async remove(id: string): Promise<boolean> {
        const deleted = connectionRepository.delete(id);
        if (deleted) {
            await keytar.deletePassword(APP_NAME, id);
        }
        return deleted;
    }

    /**
     * Set password for a connection (stored securely via keytar)
     */
    async setPassword(connectionId: string, password: string): Promise<void> {
        await keytar.setPassword(APP_NAME, connectionId, password);
    }

    /**
     * Get password for a connection (retrieved securely via keytar)
     */
    async getPassword(connectionId: string): Promise<string | null> {
        return keytar.getPassword(APP_NAME, connectionId);
    }
}

export const connectionManager = new ConnectionManager();
