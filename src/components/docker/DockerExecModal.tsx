/**
 * DockerExecModal Component
 *
 * Interactive xterm modal for running docker exec -it shell inside a container.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Typography } from 'antd';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const { Text } = Typography;

interface DockerExecModalProps {
    isOpen: boolean;
    onClose: () => void;
    connectionId: string;
    containerId: string;
    containerName: string;
}

export const DockerExecModal: React.FC<DockerExecModalProps> = ({
    isOpen,
    onClose,
    connectionId,
    containerId,
    containerName,
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<{ term: Terminal; fitAddon: FitAddon; terminalId: string } | null>(null);
    // Só montamos o xterm depois que o modal terminou de abrir: antes disso o
    // container ainda está animando e o fit calcula um tamanho errado.
    const [mounted, setMounted] = useState(false);

    const handleAfterOpenChange = useCallback((open: boolean) => {
        setMounted(open);
    }, []);

    useEffect(() => {
        if (!mounted || !isOpen || !connectionId || !containerId) return;
        const container = terminalRef.current;
        if (!container) return;

        const terminalId = `exec-${containerId}-${Date.now()}`;
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
            },
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: 13,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        container.innerHTML = '';
        term.open(container);
        try {
            fitAddon.fit();
        } catch {
            // Ignore fit errors
        }
        term.focus();

        sessionRef.current = { term, fitAddon, terminalId };

        // Listen for terminal output
        const cleanupListener = window.ssm.onTerminalData((payload) => {
            if (payload.id === terminalId) {
                term.write(payload.data);
                term.scrollToBottom();
            }
        });

        // Listen for user input
        term.onData((data) => {
            window.ssm.terminalWrite(terminalId, data);
        });

        // Listen for resize
        term.onResize(({ cols, rows }) => {
            window.ssm.terminalResize(terminalId, cols, rows);
        });

        // Start exec session in backend já com o tamanho correto do PTY
        window.ssm
            .dockerExecTerminal(connectionId, terminalId, containerId, term.cols, term.rows)
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                term.write(`\r\n\x1b[31mErro ao iniciar docker exec: ${msg}\x1b[0m\r\n`);
            });

        const handleResize = () => {
            try {
                fitAddon.fit();
                window.ssm.terminalResize(terminalId, term.cols, term.rows);
            } catch {
                // Ignore fit errors
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cleanupListener();
            window.ssm.terminalStop(terminalId).catch(() => {});
            term.dispose();
            sessionRef.current = null;
        };
    }, [mounted, isOpen, connectionId, containerId]);

    return (
        <Modal
            title={<Text strong>Terminal Interativo (docker exec) - {containerName}</Text>}
            open={isOpen}
            onCancel={onClose}
            afterOpenChange={handleAfterOpenChange}
            footer={null}
            width={900}
            style={{ maxWidth: '95vw' }}
            styles={{ body: { padding: 0, background: '#1e1e1e', height: '550px' } }}
            destroyOnHidden
        >
            <div
                ref={terminalRef}
                style={{ width: '100%', height: '100%', padding: '8px' }}
            />
        </Modal>
    );
};
