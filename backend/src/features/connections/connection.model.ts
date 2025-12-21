import crypto from 'crypto';
import type { Connection, ConnectionData } from '../../shared/types';

export class ConnectionModel implements Connection {
    id: string;
    name: string;
    host: string;
    port: number;
    user: string;
    connectionType: 'ssh' | 'rdp';
    authMethod: 'password' | 'key';
    keyPath: string | null;
    lastSeen: string | null;
    monitoredServices: string[];
    autoConnect: boolean;
    // RDP specific fields
    rdpAuthMethod?: 'credentials' | 'windows_auth';
    domain?: string;

    description?: string;

    constructor(data: ConnectionData) {
        this.id = data.id || crypto.randomUUID();
        this.name = data.name;
        this.description = data.description;
        this.host = data.host;
        this.port = data.port ?? (data.connectionType === 'rdp' ? 3389 : 22);
        this.user = data.user;
        this.connectionType = data.connectionType || 'ssh';
        this.authMethod = data.authMethod || 'key';
        this.keyPath = data.keyPath ?? null;
        this.lastSeen = data.lastSeen ?? null;
        this.monitoredServices = data.monitoredServices ?? [];
        this.autoConnect = data.autoConnect ?? false;
        // RDP specific
        this.rdpAuthMethod = data.rdpAuthMethod;
        this.domain = data.domain;
    }
}
