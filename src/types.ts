/**
 * Type definitions for Nautilus SSM (Server Manager)
 */

// ========================
// Connection Types
// ========================

export interface Connection {
    id: string;
    name: string;
    host: string;
    user: string;
    description?: string;
    connectionType: 'ssh' | 'rdp';
    authMethod: 'password' | 'key';
    keyPath?: string;
    monitoredServices?: string[];
    autoConnect?: boolean;
    // RDP specific fields
    rdpAuthMethod?: 'credentials' | 'windows_auth';
    domain?: string;
    port?: number;
}

export interface ConnectionFormData extends Omit<Connection, 'id'> {
    id?: string;
    description?: string;
    password?: string;
    // RDP specific
    rdpAuthMethod?: 'credentials' | 'windows_auth';
    domain?: string;
}

// ========================
// Metrics Types
// ========================

export interface SystemMetrics {
    status: 'ok' | 'error';
    message?: string;
    data: {
        uptime: string;
        cpu: number;
        memory: {
            total: string;
            used: string;
            free: string;
        };
        disk: {
            total: string;
            used: string;
            free: string;
            percent: string;
        };
        network: {
            in: string;
            out: string;
        };
        system: {
            os: string;
            kernel: string;
            arch: string;
            cpu: string;
        };
        services: ServiceStatus[];
    };
}

export interface ServiceStatus {
    name: string;
    status: 'active' | 'inactive' | 'failed' | string;
}

// ========================
// Terminal Types
// ========================

export interface TerminalSession {
    id: string;
    term: import('xterm').Terminal;
    fitAddon: import('xterm-addon-fit').FitAddon;
    tabEl: HTMLLIElement;
    paneEl: HTMLDivElement;
}

export interface TerminalDataPayload {
    id: string;
    data: string;
}

// ========================
// File Manager Types
// ========================

export interface SFTPFile {
    name: string;
    isDirectory: boolean;
    size?: number;
    modifyTime?: number;
    permissions?: string;
}

export interface SFTPUploadResult {
    success: boolean;
    reason?: string;
    path?: string;
}

export interface SFTPDownloadResult {
    success: boolean;
    content?: string;
    filename?: string;
}

// ========================
// Process Types
// ========================

export interface ProcessInfo {
    pid: string;
    user: string;
    cpu: string;
    mem: string;
    command: string;
}

// ========================
// Cron Types
// ========================

export interface CronJob {
    minute: string;
    hour: string;
    day: string;
    month: string;
    weekday: string;
    command: string;
    raw: string;
}

export interface CronTemplate {
    label: string;
    value: string;
    cron: [string, string, string, string, string];
}

// ========================
// Snippet Types
// ========================

export interface Snippet {
    id: string;
    name: string;
    command: string;
    isSystem?: boolean;
}

// ========================
// Docker Types
// ========================

export interface DockerContainer {
    id: string;
    name: string;
    image: string;
    status: string;
    state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created' | 'unhealthy';
    ports: string;
    created: string;
    stack?: string;
    ipAddress?: string;
}

export interface DockerImage {
    id: string;
    repository: string;
    tag: string;
    size: string;
    created: string;
}

export interface DockerVolume {
    name: string;
    driver: string;
    mountpoint: string;
    created: string;
    size?: string;
}

export interface DockerNetwork {
    id: string;
    name: string;
    driver: string;
    scope: string;
    attachable?: boolean;
    internal?: boolean;
    ipamDriver?: string;
    subnet?: string;
    gateway?: string;
    stack?: string;
    isSystem?: boolean;
}

export interface DockerStack {
    name: string;
    type: string;
    control: string;
    created: string;
}

export interface DockerInfo {
    available: boolean;
    version?: string;
    containers?: number;
    imagesCount?: number;
}

// ========================
// SSM API Types
// ========================

// ========================
// RDP Types
// ========================

export interface RdpConnectOptions {
    connectionId: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    domain?: string;
    useWindowsAuth: boolean;
    width?: number;
    height?: number;
}

export interface RdpConnectResponse {
    success: boolean;
    embedded: boolean;
    width?: number;
    height?: number;
}

export interface RdpBitmapEvent {
    sessionId: string;
    destTop: number;
    destLeft: number;
    destBottom: number;
    destRight: number;
    width: number;
    height: number;
    bitsPerPixel: number;
    isCompress: boolean;
    data: string; // Base64 encoded
}

export interface SSMWindowControls {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
}

export interface SSMAPI {
    // Navigation
    openExternal: (url: string) => Promise<void>;

    // Connection Management
    listConnections: () => Promise<Connection[]>;
    addConnection: (data: ConnectionFormData) => Promise<Connection>;
    updateConnection: (id: string, data: Partial<Connection>) => Promise<void>;
    removeConnection: (id: string) => Promise<void>;
    setPassword: (id: string, password: string) => Promise<void>;
    getPassword: (id: string) => Promise<string | null>;

    // SSH
    testConnection: (data: ConnectionFormData) => Promise<void>;

    // SFTP
    sftpList: (connectionId: string, path: string) => Promise<SFTPFile[]>;
    sftpReadFile: (connectionId: string, path: string) => Promise<string>;
    sftpReadFileAsBase64: (connectionId: string, path: string) => Promise<string>;
    sftpWriteFile: (connectionId: string, path: string, content: string) => Promise<void>;
    sftpDeleteFile: (connectionId: string, path: string) => Promise<void>;
    sftpDeleteDir: (connectionId: string, path: string) => Promise<void>;
    sftpCreateDir: (connectionId: string, path: string) => Promise<void>;
    sftpDownloadFile: (connectionId: string, path: string) => Promise<SFTPDownloadResult>;
    sftpUploadFile: (connectionId: string, remoteDir: string) => Promise<SFTPUploadResult>;
    sftpRename: (connectionId: string, oldPath: string, newPath: string) => Promise<void>;

    // Metrics
    startMetrics: (connectionId: string) => Promise<void>;
    stopMetrics: () => Promise<void>;
    onMetricsUpdate: (callback: (metrics: SystemMetrics) => void) => () => void;

    // Terminal
    terminalCreate: (connectionId: string, terminalId: string) => Promise<void>;
    terminalStop: (terminalId: string) => Promise<void>;
    terminalWrite: (terminalId: string, data: string) => Promise<void>;
    terminalResize: (terminalId: string, cols: number, rows: number) => Promise<void>;
    onTerminalData: (callback: (payload: TerminalDataPayload) => void) => () => void;

    // Processes
    processList: (connectionId: string) => Promise<string>;
    processKill: (connectionId: string, pid: string) => Promise<void>;

    // Cron
    cronList: (connectionId: string) => Promise<string>;
    cronSave: (connectionId: string, content: string) => Promise<void>;
    cronReadLog: (connectionId: string, logPath: string) => Promise<string>;

    // Snippets
    snippetsList: () => Promise<Snippet[]>;
    snippetAdd: (snippet: Omit<Snippet, 'id'>) => Promise<Snippet>;
    snippetUpdate: (snippet: Snippet) => Promise<void>;
    snippetRemove: (id: string) => Promise<void>;

    // Database
    databaseExport: () => Promise<{ data: string }>;
    databaseImport: (data: string) => Promise<void>;

    // Docker
    dockerCheckAvailable: (connectionId: string) => Promise<DockerInfo>;
    dockerListContainers: (connectionId: string) => Promise<DockerContainer[]>;
    dockerListImages: (connectionId: string) => Promise<DockerImage[]>;
    dockerListVolumes: (connectionId: string) => Promise<DockerVolume[]>;
    dockerListNetworks: (connectionId: string) => Promise<DockerNetwork[]>;
    dockerListStacks: (connectionId: string) => Promise<DockerStack[]>;
    dockerContainerAction: (connectionId: string, containerId: string, action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause' | 'kill') => Promise<void>;
    dockerContainerLogs: (connectionId: string, containerId: string, tail?: number) => Promise<string>;
    dockerImageAction: (connectionId: string, imageId: string, action: 'remove') => Promise<void>;
    dockerVolumeAction: (connectionId: string, volumeName: string, action: 'remove') => Promise<void>;
    dockerNetworkAction: (connectionId: string, networkId: string, action: 'remove') => Promise<void>;
    dockerDeployStack: (connectionId: string, stackName: string, composeContent: string, stacksDirectory: string) => Promise<void>;
    dockerConvertRun: (connectionId: string, dockerRunCommand: string) => Promise<string>;

    // RDP
    rdpConnect: (options: RdpConnectOptions) => Promise<RdpConnectResponse>;
    rdpDisconnect: (connectionId: string) => Promise<void>;
    rdpSendMouse: (connectionId: string, x: number, y: number, button: number, isPressed: boolean) => Promise<void>;
    rdpSendKeyboard: (connectionId: string, scanCode: number, isPressed: boolean, isExtended: boolean) => Promise<void>;
    onRdpBitmap: (callback: (event: RdpBitmapEvent) => void) => () => void;
    onRdpConnected: (callback: (event: { sessionId: string }) => void) => () => void;
    onRdpClosed: (callback: (event: { sessionId: string }) => void) => () => void;
    onRdpError: (callback: (event: { sessionId: string; error: string }) => void) => () => void;

    // Window Controls
    win: SSMWindowControls;
}

// ========================
// Global Window Extension
// ========================

declare global {
    interface Window {
        ssm: SSMAPI;
        lucide?: {
            createIcons: () => void;
        };
    }
}

export { };
