/**
 * TerminalManager Component
 * 
 * Multi-tab terminal interface using xterm.js.
 * Uses Ant Design Tabs and components for the UI.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { terminalService } from '../../hooks/useTerminal';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Card, Tabs, Button, Typography, Empty } from 'antd';
import {
    PlusOutlined,
    CodeOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import 'xterm/css/xterm.css';

const { Text } = Typography;

interface TerminalSession {
    id: string;
    term: Terminal;
    fitAddon: FitAddon;
}

export const TerminalManager: React.FC = () => {
    const { t } = useTranslation();
    const { activeConnectionId } = useConnection();
    const [sessions, setSessions] = useState<TerminalSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());

    // Generate unique terminal ID
    const generateId = useCallback(() => {
        return `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }, []);

    // Create a new terminal session
    const createSession = useCallback(async () => {
        if (!activeConnectionId) return;

        const id = generateId();
        const term = new Terminal({
            fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
            fontSize: 14,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#1677ff',
                selectionBackground: '#264f78',
            },
            cursorBlink: true,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        const session: TerminalSession = { id, term, fitAddon };
        sessionsRef.current.set(id, session);

        setSessions(prev => [...prev, session]);
        setActiveSessionId(id);

        // Register with terminal service for snippet execution
        terminalService.register(id, (data: string) => {
            window.ssm.terminalWrite(id, data);
        });

        // Create terminal on backend
        try {
            await window.ssm.terminalCreate(activeConnectionId, id);
        } catch (error) {
            console.error('Failed to create terminal:', error);
        }

        // Handle terminal input
        term.onData((data) => {
            window.ssm.terminalWrite(id, data);
        });

        // Handle terminal resize
        term.onResize(({ cols, rows }) => {
            window.ssm.terminalResize(id, cols, rows);
        });

        // Support right-click paste
        term.attachCustomKeyEventHandler((event) => {
            if (event.type === 'keydown' && event.key === 'v' && event.ctrlKey) {
                return false; // Let browser handle Ctrl+V
            }
            return true;
        });
    }, [activeConnectionId, generateId]);

    // Close a terminal session
    const closeSession = useCallback(async (id: string) => {
        const session = sessionsRef.current.get(id);
        if (session) {
            session.term.dispose();
            sessionsRef.current.delete(id);
            terminalService.unregister(id);

            await window.ssm.terminalStop(id);
        }

        setSessions(prev => {
            const newSessions = prev.filter(s => s.id !== id);
            if (activeSessionId === id && newSessions.length > 0) {
                setActiveSessionId(newSessions[newSessions.length - 1].id);
            } else if (newSessions.length === 0) {
                setActiveSessionId(null);
            }
            return newSessions;
        });
    }, [activeSessionId]);

    // Update terminal service when active session changes
    useEffect(() => {
        terminalService.setActive(activeSessionId);
    }, [activeSessionId]);

    // Subscribe to terminal data
    useEffect(() => {
        const unsubscribe = window.ssm.onTerminalData(({ id, data }) => {
            const session = sessionsRef.current.get(id);
            if (session) {
                session.term.write(data);
            }
        });

        return unsubscribe;
    }, []);

    // Attach terminal to container when active session changes
    useEffect(() => {
        if (!activeSessionId || !terminalContainerRef.current) return;

        const session = sessionsRef.current.get(activeSessionId);
        if (!session) return;

        // Clear container and attach terminal
        terminalContainerRef.current.innerHTML = '';
        session.term.open(terminalContainerRef.current);

        // Fit terminal
        setTimeout(() => {
            session.fitAddon.fit();
        }, 0);
    }, [activeSessionId]);

    // Fit terminal on window resize
    useEffect(() => {
        const handleResize = () => {
            if (activeSessionId) {
                const session = sessionsRef.current.get(activeSessionId);
                if (session) {
                    session.fitAddon.fit();
                }
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeSessionId]);

    // Create first terminal when connection changes
    useEffect(() => {
        // Cleanup old sessions
        sessionsRef.current.forEach((session, id) => {
            session.term.dispose();
            terminalService.unregister(id);
            window.ssm.terminalStop(id);
        });
        sessionsRef.current.clear();
        setSessions([]);
        setActiveSessionId(null);
        terminalService.setActive(null);

        // Create new session if connected
        if (activeConnectionId) {
            createSession();
        }
    }, [activeConnectionId, createSession]);

    if (!activeConnectionId) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: 48,
            }}>
                <CodeOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Typography.Title level={4} type="secondary">
                    {t('terminal.select_connection')}
                </Typography.Title>
                <Text type="secondary">
                    {t('terminal.select_connection_desc')}
                </Text>
            </div>
        );
    }

    // Build tab items for Ant Design Tabs
    const tabItems = sessions.map((session, index) => ({
        key: session.id,
        label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CodeOutlined />
                {t('common.terminal')} {index + 1}
            </span>
        ),
        closable: true,
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16 }}>
            <Card
                size="small"
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                bodyStyle={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column' }}
            >
                {/* Terminal Tabs */}
                <Tabs
                    type="editable-card"
                    activeKey={activeSessionId || undefined}
                    onChange={(key) => setActiveSessionId(key)}
                    onEdit={(targetKey, action) => {
                        if (action === 'add') {
                            createSession();
                        } else if (action === 'remove' && typeof targetKey === 'string') {
                            closeSession(targetKey);
                        }
                    }}
                    items={tabItems}
                    style={{ marginBottom: 0 }}
                    tabBarStyle={{ marginBottom: 0, paddingLeft: 8, paddingRight: 8 }}
                />

                {/* Terminal Container */}
                {sessions.length > 0 ? (
                    <div
                        ref={terminalContainerRef}
                        className="terminal-container"
                        style={{ flex: 1, minHeight: 0, background: '#1e1e1e', borderRadius: '0 0 8px 8px' }}
                    />
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fafafa',
                    }}>
                        <Empty
                            image={<CodeOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
                            description={t('terminal.no_terminal_open')}
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={createSession}
                            >
                                {t('terminal.new_terminal')}
                            </Button>
                        </Empty>
                    </div>
                )}
            </Card>
        </div>
    );
};
