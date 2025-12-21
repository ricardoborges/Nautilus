/**
 * Tauri API Bridge
 * 
 * This module provides the same API as the Electron preload.js
 * but uses HTTP to communicate with the Node.js backend sidecar.
 */

import type {
    SSMAPI,
    Connection,
    ConnectionFormData,
    SystemMetrics,
    SFTPFile,
    SFTPDownloadResult,
    SFTPUploadResult,
    Snippet,
    TerminalDataPayload,
    DockerContainer,
    DockerImage,
    DockerVolume,
    DockerNetwork,
    DockerStack,
    DockerInfo,
    RdpConnectOptions,
    RdpConnectResponse,
    RdpBitmapEvent
} from './types';

const BACKEND_URL = 'http://127.0.0.1:45678';

// Event listeners storage
const eventListeners = new Map<string, Array<(data: unknown) => void>>();

// Setup SSE connection for real-time events
let eventSource: EventSource | null = null;

function setupEventSource(): void {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource(`${BACKEND_URL}/events`);

    eventSource.onmessage = (event: MessageEvent) => {
        try {
            const { channel, data } = JSON.parse(event.data) as { channel: string; data: unknown };
            const listeners = eventListeners.get(channel) || [];
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error('Event listener error:', e);
                }
            });
        } catch (e) {
            // Ignore parse errors (keepalive messages)
        }
    };

    eventSource.onerror = (error: Event) => {
        console.warn('SSE connection error, reconnecting...', error);
        setTimeout(setupEventSource, 2000);
    };
}

// Wait for backend to be ready
async function waitForBackend(maxRetries: number = 30): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`${BACKEND_URL}/health`);
            if (response.ok) {
                console.log('Backend is ready');
                setupEventSource();
                return true;
            }
        } catch (e) {
            // Backend not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.error('Backend failed to start');
    return false;
}

// Helper to invoke backend
async function backendInvoke<T>(channel: string, args: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, args })
    });

    const data = await response.json() as { success: boolean; result?: T; error?: string };

    if (!data.success) {
        throw new Error(data.error || 'Unknown error');
    }

    return data.result as T;
}

// Tauri window controls - dynamically import when needed
async function getTauriWindow(): Promise<{ minimize: () => Promise<void>; maximize: () => Promise<void>; close: () => Promise<void>; isMaximized: () => Promise<boolean>; unmaximize: () => Promise<void> } | null> {
    try {
        // Dynamic import for Tauri APIs
        const tauriWindow = await import('@tauri-apps/api/window');
        return tauriWindow.getCurrentWindow();
    } catch (e) {
        console.warn('Tauri window API not available:', e);
        return null;
    }
}

// Export the SSM API (same interface as Electron)
const ssm: SSMAPI = {
    // Navigation
    openExternal: async (url: string): Promise<void> => {
        try {
            const shell = await import('@tauri-apps/plugin-shell');
            await shell.open(url);
        } catch (e) {
            // Fallback for development
            window.open(url, '_blank');
        }
    },

    // ConnectionService methods
    listConnections: (): Promise<Connection[]> => backendInvoke<Connection[]>('ssm:connections:list'),

    addConnection: (connectionData: ConnectionFormData): Promise<Connection> => backendInvoke<Connection>('ssm:connections:add', connectionData as unknown as Record<string, unknown>),

    updateConnection: (id: string, connectionData: Partial<Connection>): Promise<void> => backendInvoke<void>('ssm:connections:update', { id, data: connectionData }),

    removeConnection: (id: string): Promise<void> => backendInvoke<void>('ssm:connections:remove', { id }),

    setPassword: (id: string, password: string): Promise<void> => backendInvoke<void>('ssm:connections:setPassword', { id, password }),

    getPassword: (id: string): Promise<string | null> => backendInvoke<string | null>('ssm:connections:getPassword', { id }),

    // SSHService methods
    testConnection: (connectionData: ConnectionFormData): Promise<void> => backendInvoke<void>('ssm:ssh:test', connectionData as unknown as Record<string, unknown>),

    // SFTPService methods
    sftpList: (connectionId: string, remotePath: string): Promise<SFTPFile[]> => backendInvoke<SFTPFile[]>('ssm:sftp:list', { connectionId, path: remotePath }),

    sftpReadFile: (connectionId: string, remotePath: string): Promise<string> => backendInvoke<string>('ssm:sftp:readFile', { connectionId, path: remotePath }),

    sftpReadFileAsBase64: (connectionId: string, remotePath: string): Promise<string> => backendInvoke<string>('ssm:sftp:readFileAsBase64', { connectionId, path: remotePath }),

    sftpWriteFile: (connectionId: string, remotePath: string, content: string): Promise<void> => backendInvoke<void>('ssm:sftp:writeFile', { connectionId, path: remotePath, content }),

    sftpDeleteFile: (connectionId: string, remotePath: string): Promise<void> => backendInvoke<void>('ssm:sftp:deleteFile', { connectionId, path: remotePath }),

    sftpDeleteDir: (connectionId: string, remotePath: string): Promise<void> => backendInvoke<void>('ssm:sftp:deleteDir', { connectionId, path: remotePath }),

    sftpCreateDir: (connectionId: string, remotePath: string): Promise<void> => backendInvoke<void>('ssm:sftp:createDir', { connectionId, path: remotePath }),

    sftpDownloadFile: async (connectionId: string, remotePath: string): Promise<SFTPDownloadResult> => {
        const result = await backendInvoke<SFTPDownloadResult>('ssm:sftp:downloadFile', { connectionId, remotePath });
        if (result.success && result.content) {
            // Create download in browser
            const bytes = Uint8Array.from(atob(result.content), c => c.charCodeAt(0));
            const blob = new Blob([bytes]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return { success: true, filename: result.filename };
        }
        return result;
    },

    sftpUploadFile: async (connectionId: string, remoteDir: string): Promise<SFTPUploadResult> => {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e: Event) => {
                const target = e.target as HTMLInputElement;
                const file = target.files?.[0];
                if (!file) {
                    resolve({ success: false, reason: 'canceled' });
                    return;
                }

                const reader = new FileReader();
                reader.onload = async () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    const content = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                    const result = await backendInvoke<SFTPUploadResult>('ssm:sftp:uploadFile', {
                        connectionId,
                        remoteDir,
                        content,
                        fileName: file.name
                    });
                    resolve(result);
                };
                reader.readAsArrayBuffer(file);
            };
            input.click();
        });
    },

    sftpRename: (connectionId: string, oldPath: string, newPath: string): Promise<void> => backendInvoke<void>('ssm:sftp:rename', { connectionId, oldPath, newPath }),

    // MetricsService methods
    startMetrics: (connectionId: string): Promise<void> => backendInvoke<void>('ssm:metrics:start', { connectionId }),

    stopMetrics: (): Promise<void> => backendInvoke<void>('ssm:metrics:stop'),

    onMetricsUpdate: (callback: (metrics: SystemMetrics) => void): (() => void) => {
        const channel = 'ssm:metrics:update';
        const listeners = eventListeners.get(channel) || [];
        listeners.push(callback as (data: unknown) => void);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(callback as (data: unknown) => void);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    // TerminalService methods
    terminalCreate: (connectionId: string, terminalId: string): Promise<void> => backendInvoke<void>('ssm:terminal:create', { connectionId, terminalId }),

    terminalStop: (terminalId: string): Promise<void> => backendInvoke<void>('ssm:terminal:stop', { terminalId }),

    terminalWrite: (terminalId: string, data: string): Promise<void> => {
        const encoded = btoa(unescape(encodeURIComponent(data)));
        return backendInvoke<void>('ssm:terminal:write', { terminalId, data: encoded });
    },

    terminalResize: (terminalId: string, cols: number, rows: number): Promise<void> => backendInvoke<void>('ssm:terminal:resize', { terminalId, cols, rows }),

    onTerminalData: (callback: (payload: TerminalDataPayload) => void): (() => void) => {
        const channel = 'ssm:terminal:data';
        const wrappedCallback = (payload: unknown): void => {
            try {
                const p = payload as { id: string; data: string };
                const data = decodeURIComponent(escape(atob(p.data)));
                callback({ id: p.id, data });
            } catch (e) {
                // Direct data if not base64
                callback(payload as TerminalDataPayload);
            }
        };

        const listeners = eventListeners.get(channel) || [];
        listeners.push(wrappedCallback);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(wrappedCallback);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    // ProcessService methods
    processList: (connectionId: string): Promise<string> => backendInvoke<string>('ssm:process:list', { connectionId }),

    processKill: (connectionId: string, pid: string): Promise<void> => backendInvoke<void>('ssm:process:kill', { connectionId, pid }),

    // CronService methods
    cronList: (connectionId: string): Promise<string> => backendInvoke<string>('ssm:cron:list', { connectionId }),

    cronSave: (connectionId: string, crontabContent: string): Promise<void> => backendInvoke<void>('ssm:cron:save', { connectionId, content: crontabContent }),

    cronReadLog: (connectionId: string, logPath: string): Promise<string> => backendInvoke<string>('ssm:cron:readLog', { connectionId, logPath }),

    // SnippetService methods
    snippetsList: (): Promise<Snippet[]> => backendInvoke<Snippet[]>('ssm:snippets:list'),

    snippetAdd: (snippet: Omit<Snippet, 'id'>): Promise<Snippet> => backendInvoke<Snippet>('ssm:snippets:add', snippet as unknown as Record<string, unknown>),

    snippetUpdate: (snippet: Snippet): Promise<void> => backendInvoke<void>('ssm:snippets:update', snippet as unknown as Record<string, unknown>),

    snippetRemove: (id: string): Promise<void> => backendInvoke<void>('ssm:snippets:remove', { id }),

    // Database methods
    databaseExport: (): Promise<{ data: string }> => backendInvoke<{ data: string }>('ssm:database:export'),

    databaseImport: (data: string): Promise<void> => backendInvoke<void>('ssm:database:import', { data }),

    // Docker methods
    dockerCheckAvailable: (connectionId: string): Promise<DockerInfo> =>
        backendInvoke<DockerInfo>('ssm:docker:check', { connectionId }),

    dockerListContainers: (connectionId: string): Promise<DockerContainer[]> =>
        backendInvoke<DockerContainer[]>('ssm:docker:list', { connectionId }),

    dockerListImages: (connectionId: string): Promise<DockerImage[]> =>
        backendInvoke<DockerImage[]>('ssm:docker:images', { connectionId }),

    dockerListVolumes: (connectionId: string): Promise<DockerVolume[]> =>
        backendInvoke<DockerVolume[]>('ssm:docker:volumes', { connectionId }),

    dockerListNetworks: (connectionId: string): Promise<DockerNetwork[]> =>
        backendInvoke<DockerNetwork[]>('ssm:docker:networks', { connectionId }),

    dockerListStacks: (connectionId: string): Promise<DockerStack[]> =>
        backendInvoke<DockerStack[]>('ssm:docker:stacks', { connectionId }),

    dockerContainerAction: (connectionId: string, containerId: string, action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause' | 'kill'): Promise<void> =>
        backendInvoke<void>('ssm:docker:action', { connectionId, containerId, action }),

    dockerContainerLogs: (connectionId: string, containerId: string, tail?: number): Promise<string> =>
        backendInvoke<string>('ssm:docker:logs', { connectionId, containerId, tail }),

    dockerImageAction: (connectionId: string, imageId: string, action: 'remove'): Promise<void> =>
        backendInvoke<void>('ssm:docker:imageAction', { connectionId, imageId, action }),

    dockerVolumeAction: (connectionId: string, volumeName: string, action: 'remove'): Promise<void> =>
        backendInvoke<void>('ssm:docker:volumeAction', { connectionId, volumeName, action }),

    dockerNetworkAction: (connectionId: string, networkId: string, action: 'remove'): Promise<void> =>
        backendInvoke<void>('ssm:docker:networkAction', { connectionId, networkId, action }),

    dockerDeployStack: (connectionId: string, stackName: string, composeContent: string, stacksDirectory: string): Promise<void> =>
        backendInvoke<void>('ssm:docker:deployStack', { connectionId, stackName, composeContent, stacksDirectory }),

    dockerConvertRun: (connectionId: string, dockerRunCommand: string): Promise<string> =>
        backendInvoke<string>('ssm:docker:convertRun', { connectionId, dockerRunCommand }),

    // RDP methods
    rdpConnect: (options: RdpConnectOptions): Promise<RdpConnectResponse> =>
        backendInvoke<RdpConnectResponse>('ssm:rdp:connect', options as unknown as Record<string, unknown>),

    rdpDisconnect: (connectionId: string): Promise<void> =>
        backendInvoke<void>('ssm:rdp:disconnect', { connectionId }),

    rdpSendMouse: (connectionId: string, x: number, y: number, button: number, isPressed: boolean): Promise<void> =>
        backendInvoke<void>('ssm:rdp:mouse', { connectionId, x, y, button, isPressed }),

    rdpSendKeyboard: (connectionId: string, scanCode: number, isPressed: boolean, isExtended: boolean): Promise<void> =>
        backendInvoke<void>('ssm:rdp:keyboard', { connectionId, scanCode, isPressed, isExtended }),

    onRdpBitmap: (callback: (event: RdpBitmapEvent) => void): (() => void) => {
        const channel = 'ssm:rdp:bitmap';
        const listeners = eventListeners.get(channel) || [];
        listeners.push(callback as (data: unknown) => void);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(callback as (data: unknown) => void);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    onRdpConnected: (callback: (event: { sessionId: string }) => void): (() => void) => {
        const channel = 'ssm:rdp:connected';
        const listeners = eventListeners.get(channel) || [];
        listeners.push(callback as (data: unknown) => void);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(callback as (data: unknown) => void);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    onRdpClosed: (callback: (event: { sessionId: string }) => void): (() => void) => {
        const channel = 'ssm:rdp:closed';
        const listeners = eventListeners.get(channel) || [];
        listeners.push(callback as (data: unknown) => void);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(callback as (data: unknown) => void);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    onRdpError: (callback: (event: { sessionId: string; error: string }) => void): (() => void) => {
        const channel = 'ssm:rdp:error';
        const listeners = eventListeners.get(channel) || [];
        listeners.push(callback as (data: unknown) => void);
        eventListeners.set(channel, listeners);

        return () => {
            const currentListeners = eventListeners.get(channel) || [];
            const index = currentListeners.indexOf(callback as (data: unknown) => void);
            if (index > -1) {
                currentListeners.splice(index, 1);
                eventListeners.set(channel, currentListeners);
            }
        };
    },

    // Window Controls
    win: {
        minimize: async (): Promise<void> => {
            const win = await getTauriWindow();
            if (win) await win.minimize();
        },
        maximize: async (): Promise<void> => {
            const win = await getTauriWindow();
            if (win) await win.maximize();
        },
        close: async (): Promise<void> => {
            const win = await getTauriWindow();
            if (win) await win.close();
        },
        toggleMaximize: async (): Promise<void> => {
            const win = await getTauriWindow();
            if (win) {
                if (await win.isMaximized()) {
                    await win.unmaximize();
                } else {
                    await win.maximize();
                }
            }
        }
    }
};

// Expose to window for compatibility with existing code
window.ssm = ssm;

// Initialize on load
waitForBackend().then(ready => {
    if (ready) {
        console.log('Nautilus Tauri Bridge initialized');
        // Dispatch event to notify app that backend is ready
        window.dispatchEvent(new CustomEvent('ssm-ready'));
    }
});

// Export for ES modules
export default ssm;
