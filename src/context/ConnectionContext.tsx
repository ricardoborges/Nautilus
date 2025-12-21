/**
 * Connection Context
 * 
 * Provides global state management for multiple active connections
 * and connection-related operations.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Connection, Snippet, SystemMetrics } from '../types';
import { SYSTEM_SNIPPETS } from '../utils/constants';

// Per-connection state
interface ConnectionState {
    metrics: SystemMetrics | null;
    dockerAvailable: boolean;
    dockerVersion: string | null;
    isLoading: boolean;
}

interface ConnectionContextType {
    // Connection state
    connections: Connection[];
    activeConnectionIds: string[];  // All open connections
    focusedConnectionId: string | null;  // Currently visible connection

    // Snippets
    snippets: Snippet[];

    // Per-connection state accessor
    getConnectionState: (connectionId: string) => ConnectionState | null;

    // Actions
    openConnection: (id: string) => Promise<void>;
    closeConnection: (id: string) => Promise<void>;
    focusConnection: (id: string) => void;
    refreshConnections: () => Promise<void>;
    refreshSnippets: () => Promise<void>;

    // For backwards compatibility with components that need the focused connection
    activeConnectionId: string | null;
    activeConnection: Connection | null;
    isLoading: boolean;
    metrics: SystemMetrics | null;
    dockerAvailable: boolean;
    dockerVersion: string | null;
}

const ConnectionContext = createContext<ConnectionContextType | null>(null);

export const useConnection = (): ConnectionContextType => {
    const context = useContext(ConnectionContext);
    if (!context) {
        throw new Error('useConnection must be used within ConnectionProvider');
    }
    return context;
};

interface ConnectionProviderProps {
    children: ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({ children }) => {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [activeConnectionIds, setActiveConnectionIds] = useState<string[]>([]);
    const [focusedConnectionId, setFocusedConnectionId] = useState<string | null>(null);
    const [snippets, setSnippets] = useState<Snippet[]>([]);

    // Per-connection state map
    const [connectionStates, setConnectionStates] = useState<Record<string, ConnectionState>>({});

    // Get active connection from list (for backwards compatibility)
    const activeConnection = connections.find(c => c.id === focusedConnectionId) || null;

    // Get state for a specific connection
    const getConnectionState = useCallback((connectionId: string): ConnectionState | null => {
        return connectionStates[connectionId] || null;
    }, [connectionStates]);

    // Get focused connection state (for backwards compatibility)
    const focusedState = focusedConnectionId ? connectionStates[focusedConnectionId] : null;

    // Load connections
    const refreshConnections = useCallback(async () => {
        try {
            const list = await window.ssm.listConnections();
            console.log('[ConnectionContext] Loaded connections:', list);
            setConnections(list);
        } catch (error) {
            console.error('Failed to load connections:', error);
        }
    }, []);

    // Load snippets
    const refreshSnippets = useCallback(async () => {
        try {
            const userSnippets = await window.ssm.snippetsList();
            setSnippets([...SYSTEM_SNIPPETS, ...userSnippets]);
        } catch (error) {
            console.error('Failed to load snippets:', error);
        }
    }, []);

    // Check Docker availability for a connection
    const checkDockerAvailability = useCallback(async (connectionId: string) => {
        try {
            console.log('[ConnectionContext] Checking Docker availability for:', connectionId);
            const dockerInfo = await window.ssm.dockerCheckAvailable(connectionId);
            setConnectionStates(prev => ({
                ...prev,
                [connectionId]: {
                    ...prev[connectionId],
                    dockerAvailable: dockerInfo.available,
                    dockerVersion: dockerInfo.version || null,
                }
            }));
            console.log('[ConnectionContext] Docker available:', dockerInfo.available, 'version:', dockerInfo.version);
        } catch (error) {
            console.error('Failed to check Docker availability:', error);
            setConnectionStates(prev => ({
                ...prev,
                [connectionId]: {
                    ...prev[connectionId],
                    dockerAvailable: false,
                    dockerVersion: null,
                }
            }));
        }
    }, []);

    // Open a connection (add to active list)
    const openConnection = useCallback(async (id: string) => {
        // Check if already open
        if (activeConnectionIds.includes(id)) {
            // Just focus it
            setFocusedConnectionId(id);
            return;
        }

        // Initialize connection state
        setConnectionStates(prev => ({
            ...prev,
            [id]: {
                metrics: null,
                dockerAvailable: false,
                dockerVersion: null,
                isLoading: true,
            }
        }));

        // Add to active list and focus
        setActiveConnectionIds(prev => [...prev, id]);
        setFocusedConnectionId(id);

        try {
            // Start metrics for this connection
            await window.ssm.startMetrics(id);

            // Check Docker availability in background
            checkDockerAvailability(id);
        } catch (error) {
            console.error('Failed to start metrics:', error);
        } finally {
            setConnectionStates(prev => ({
                ...prev,
                [id]: {
                    ...prev[id],
                    isLoading: false,
                }
            }));
        }
    }, [activeConnectionIds, checkDockerAvailability]);

    // Close a connection (remove from active list)
    const closeConnection = useCallback(async (id: string) => {
        const conn = connections.find(c => c.id === id);
        if (conn && conn.connectionType === 'rdp') {
            try {
                await window.ssm.rdpDisconnect(id);
            } catch (error) {
                console.error('Failed to disconnect RDP:', error);
            }
        }

        // Stop metrics for this connection
        // Note: Current backend only supports one metrics stream, 
        // we'll need to handle this differently if we want concurrent metrics
        try {
            await window.ssm.stopMetrics();
        } catch (error) {
            console.error('Failed to stop metrics:', error);
        }

        // Remove from active list
        setActiveConnectionIds(prev => {
            const newList = prev.filter(cid => cid !== id);

            // If we closed the focused connection, focus another one
            if (focusedConnectionId === id) {
                const newFocused = newList.length > 0 ? newList[newList.length - 1] : null;
                setFocusedConnectionId(newFocused);

                // Start metrics for newly focused connection
                if (newFocused) {
                    window.ssm.startMetrics(newFocused);
                }
            }

            return newList;
        });

        // Clean up connection state
        setConnectionStates(prev => {
            const { [id]: removed, ...rest } = prev;
            return rest;
        });
    }, [connections, focusedConnectionId]);

    // Focus a connection (switch visible tab)
    const focusConnection = useCallback((id: string) => {
        if (activeConnectionIds.includes(id)) {
            // Stop metrics for previous connection
            if (focusedConnectionId && focusedConnectionId !== id) {
                window.ssm.stopMetrics();
            }

            setFocusedConnectionId(id);

            // Start metrics for newly focused connection
            window.ssm.startMetrics(id);
        }
    }, [activeConnectionIds, focusedConnectionId]);

    // Subscribe to metrics updates
    useEffect(() => {
        const unsubscribe = window.ssm.onMetricsUpdate((data: SystemMetrics) => {
            if (focusedConnectionId) {
                setConnectionStates(prev => ({
                    ...prev,
                    [focusedConnectionId]: {
                        ...prev[focusedConnectionId],
                        metrics: data,
                        isLoading: false,
                    }
                }));
            }
        });

        return () => {
            unsubscribe();
        };
    }, [focusedConnectionId]);

    // Initial load
    useEffect(() => {
        const init = async () => {
            await refreshConnections();
            await refreshSnippets();

            // Check for auto-connect
            const list = await window.ssm.listConnections();
            const autoConnectConn = list.find(c => c.autoConnect);
            if (autoConnectConn) {
                openConnection(autoConnectConn.id);
            }
        };

        init();
    }, []);  // Only run once on mount

    const value: ConnectionContextType = {
        connections,
        activeConnectionIds,
        focusedConnectionId,
        snippets,
        getConnectionState,
        openConnection,
        closeConnection,
        focusConnection,
        refreshConnections,
        refreshSnippets,
        // Backwards compatibility - expose focused connection state
        activeConnectionId: focusedConnectionId,
        activeConnection,
        isLoading: focusedState?.isLoading ?? false,
        metrics: focusedState?.metrics ?? null,
        dockerAvailable: focusedState?.dockerAvailable ?? false,
        dockerVersion: focusedState?.dockerVersion ?? null,
    };

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
};
