/**
 * Type definitions for Nautilus Backend
 */

import type { Client, ClientChannel, SFTPWrapper } from 'ssh2';

// ========================
// SSH Configuration
// ========================

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: Buffer;
}

// ========================
// Connection Types
// ========================

export interface ConnectionData {
    id?: string;
    name: string;
    description?: string;
    host: string;
    port?: number;
    user: string;
    connectionType: 'ssh' | 'rdp';
    authMethod: 'password' | 'key';
    keyPath?: string | null;
    lastSeen?: string | null;
    monitoredServices?: string[];
    autoConnect?: boolean;
    // RDP specific fields
    rdpAuthMethod?: 'credentials' | 'windows_auth';
    domain?: string;
}

export interface Connection extends Required<Omit<ConnectionData, 'keyPath' | 'lastSeen' | 'rdpAuthMethod' | 'domain' | 'description'>> {
    keyPath: string | null;
    lastSeen: string | null;
    rdpAuthMethod?: 'credentials' | 'windows_auth';
    domain?: string;
    description?: string;
}

// ========================
// Snippet Types
// ========================

export interface SnippetData {
    id?: string;
    name: string;
    command: string;
}

export interface Snippet {
    id: string;
    name: string;
    command: string;
}

// ========================
// SFTP Types
// ========================

export interface SFTPFile {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
    size: number;
    modified: Date;
}

// ========================
// Metrics Types
// ========================

export interface MemoryInfo {
    total: number;
    used: number;
    free: number;
}

export interface DiskInfo {
    total: string;
    used: string;
    available: string;
    percent: string;
}

export interface SystemInfo {
    kernel: string;
    arch: string;
    os: string;
    cpu: string;
}

export interface NetworkInfo {
    in: string;
    out: string;
}

export interface ServiceStatus {
    name: string;
    status: string;
}

export interface MetricsData {
    uptime: string;
    memory: MemoryInfo;
    disk: DiskInfo;
    cpu: string;
    system: SystemInfo;
    network: NetworkInfo;
    services: ServiceStatus[];
}

export interface MetricsUpdate {
    status: 'success' | 'error';
    data?: MetricsData;
    message?: string;
}

// ========================
// SSH Execution Result
// ========================

export interface SSHExecResult {
    stdout: string;
    stderr: string;
}

// ========================
// API Types
// ========================

export interface APIRequest {
    channel: string;
    args?: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
    success: boolean;
    result?: T;
    error?: string;
}

// ========================
// Handler Types
// ========================

export type Handler<T = unknown> = (args: Record<string, unknown>) => Promise<T>;

export interface HandlerRegistry {
    [channel: string]: Handler;
}
