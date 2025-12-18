/**
 * useTerminal Hook
 * 
 * Provides access to terminal operations for sending commands/snippets.
 */

import { createContext, useContext, useCallback, useRef } from 'react';

interface TerminalContextType {
    writeToActiveTerminal: (data: string) => void;
    registerTerminalWriter: (id: string, writer: (data: string) => void) => void;
    unregisterTerminalWriter: (id: string) => void;
    setActiveTerminal: (id: string | null) => void;
}

const terminalWriters = new Map<string, (data: string) => void>();
let activeTerminalId: string | null = null;

export const useTerminal = () => {
    const writeToActiveTerminal = useCallback((data: string) => {
        if (activeTerminalId) {
            const writer = terminalWriters.get(activeTerminalId);
            if (writer) {
                writer(data);
            }
        }
    }, []);

    const registerTerminalWriter = useCallback((id: string, writer: (data: string) => void) => {
        terminalWriters.set(id, writer);
    }, []);

    const unregisterTerminalWriter = useCallback((id: string) => {
        terminalWriters.delete(id);
    }, []);

    const setActiveTerminal = useCallback((id: string | null) => {
        activeTerminalId = id;
    }, []);

    return {
        writeToActiveTerminal,
        registerTerminalWriter,
        unregisterTerminalWriter,
        setActiveTerminal,
    };
};

// Singleton for global access
export const terminalService = {
    writeToActive: (data: string) => {
        if (activeTerminalId) {
            const writer = terminalWriters.get(activeTerminalId);
            if (writer) {
                writer(data);
            }
        }
    },
    setActive: (id: string | null) => {
        activeTerminalId = id;
    },
    register: (id: string, writer: (data: string) => void) => {
        terminalWriters.set(id, writer);
    },
    unregister: (id: string) => {
        terminalWriters.delete(id);
    },
    get isReady() {
        return activeTerminalId !== null && terminalWriters.has(activeTerminalId);
    }
};
