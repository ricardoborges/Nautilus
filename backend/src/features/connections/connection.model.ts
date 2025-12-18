import crypto from 'crypto';
import type { Connection, ConnectionData } from '../../shared/types';

export class ConnectionModel implements Connection {
    id: string;
    name: string;
    host: string;
    port: number;
    user: string;
    authMethod: 'password' | 'key';
    keyPath: string | null;
    lastSeen: string | null;
    monitoredServices: string[];
    autoConnect: boolean;

    constructor(data: ConnectionData) {
        this.id = data.id || crypto.randomUUID();
        this.name = data.name;
        this.host = data.host;
        this.port = data.port ?? 22;
        this.user = data.user;
        this.authMethod = data.authMethod || 'key';
        this.keyPath = data.keyPath ?? null;
        this.lastSeen = data.lastSeen ?? null;
        this.monitoredServices = data.monitoredServices ?? [];
        this.autoConnect = data.autoConnect ?? false;
    }
}
