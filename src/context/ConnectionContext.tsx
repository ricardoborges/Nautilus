/**
 * Connection Context
 * 
 * Provides global state management for the active connection
 * and connection-related operations.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Connection, Snippet, SystemMetrics } from '../types';
import { SYSTEM_SNIPPETS } from '../utils/constants';

interface ConnectionContextType {
    // Connection state
    connections: Connection[];
    activeConnection: Connection | null;
    activeConnectionId: string | null;
    isLoading: boolean;

    // Snippets
    snippets: Snippet[];

    // Metrics
    metrics: SystemMetrics | null;

    // Actions
    selectConnection: (id: string | null) => Promise<void>;
    refreshConnections: () => Promise<void>;
    refreshSnippets: () => Promise<void>;
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
    const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);

    // Get active connection from list
    const activeConnection = connections.find(c => c.id === activeConnectionId) || null;

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

    // Select a connection
    const selectConnection = useCallback(async (id: string | null) => {
        // Stop previous metrics
        if (activeConnectionId) {
            await window.ssm.stopMetrics();
        }

        setActiveConnectionId(id);
        setMetrics(null);

        if (id) {
            setIsLoading(true);
            try {
                await window.ssm.startMetrics(id);
            } catch (error) {
                console.error('Failed to start metrics:', error);
            } finally {
                setIsLoading(false);
            }
        }
    }, [activeConnectionId]);

    // Subscribe to metrics updates
    useEffect(() => {
        const unsubscribe = window.ssm.onMetricsUpdate((data: SystemMetrics) => {
            if (activeConnectionId) {
                setMetrics(data);
                setIsLoading(false);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [activeConnectionId]);

    // Initial load - backend is already ready when this component mounts
    // (App.tsx waits for ssm-ready before showing MainLayout)
    useEffect(() => {
        const init = async () => {
            await refreshConnections();
            await refreshSnippets();

            // Check for auto-connect
            const list = await window.ssm.listConnections();
            const autoConnectConn = list.find(c => c.autoConnect);
            if (autoConnectConn) {
                selectConnection(autoConnectConn.id);
            }
        };

        // Initialize immediately since backend is ready
        init();
    }, []);  // Only run once on mount

    const value: ConnectionContextType = {
        connections,
        activeConnection,
        activeConnectionId,
        isLoading,
        snippets,
        metrics,
        selectConnection,
        refreshConnections,
        refreshSnippets,
    };

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
};
