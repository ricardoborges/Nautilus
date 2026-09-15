/**
 * LogManager Component
 * 
 * Central Log Viewer for inspection and live-streaming of systemd journals
 * and system log files (/var/log/*).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import {
    Card,
    Select,
    Segmented,
    Input,
    Button,
    Switch,
    Space,
    Typography,
    Tooltip,
    Badge,
    Spin,
    Empty,
    message
} from 'antd';
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    ReloadOutlined,
    ClearOutlined,
    CopyOutlined,
    DownloadOutlined,
    SearchOutlined,
    ProfileOutlined,
    FileTextOutlined,
    VerticalAlignBottomOutlined
} from '@ant-design/icons';
import type { SystemdService, LogStreamDataPayload } from '../../types';

const { Text } = Typography;

interface LogManagerProps {
    connectionId?: string;
    initialService?: string;
}

export const LogManager: React.FC<LogManagerProps> = ({
    connectionId: propConnectionId,
    initialService
}) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { activeConnectionId: contextConnectionId } = useConnection();

    const activeConnectionId = propConnectionId ?? contextConnectionId;

    // Log source & filters
    const [source, setSource] = useState<'journal' | 'file'>('journal');
    const [target, setTarget] = useState<string>(initialService || 'all');
    const [priority, setPriority] = useState<string>('all');
    const [timeRange, setTimeRange] = useState<string>('24h');
    const [filterText, setFilterText] = useState<string>('');

    // Available targets
    const [serviceOptions, setServiceOptions] = useState<{ label: string; value: string }[]>([]);
    const [fileOptions, setFileOptions] = useState<{ label: string; value: string }[]>([]);

    // Log data & streaming
    const [logs, setLogs] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [autoScroll, setAutoScroll] = useState<boolean>(true);

    const logContainerRef = useRef<HTMLDivElement>(null);
    const activeStreamIdRef = useRef<string | null>(null);

    const isDark = themeMode === 'dark';

    // Auto-scroll when new logs arrive if autoScroll is enabled
    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    // Load available services for Journal dropdown
    useEffect(() => {
        if (!activeConnectionId) return;
        window.ssm.servicesList(activeConnectionId)
            .then((res) => {
                const options = [
                    { label: t('logs.all_services'), value: 'all' },
                    ...(res.services || []).map((s: SystemdService) => ({
                        label: s.name,
                        value: s.name
                    }))
                ];
                setServiceOptions(options);
            })
            .catch(() => {});
    }, [activeConnectionId, t]);

    // Load available log files for Files dropdown
    useEffect(() => {
        if (!activeConnectionId) return;
        window.ssm.logsListFiles(activeConnectionId)
            .then((res) => {
                const defaultFiles = ['/var/log/syslog', '/var/log/auth.log', '/var/log/messages', '/var/log/nginx/access.log', '/var/log/nginx/error.log'];
                const merged = Array.from(new Set([...(res.files || []), ...defaultFiles]));
                setFileOptions(merged.map((f) => ({ label: f, value: f })));
            })
            .catch(() => {});
    }, [activeConnectionId]);

    // Update target when initialService changes from props
    useEffect(() => {
        if (initialService) {
            setSource('journal');
            setTarget(initialService);
        }
    }, [initialService]);

    // Static read logs
    const fetchLogs = useCallback(async () => {
        if (!activeConnectionId || !target) return;
        setIsLoading(true);
        try {
            let sinceArg: string | undefined;
            if (timeRange === '1h') sinceArg = '1 hour ago';
            else if (timeRange === '24h') sinceArg = '24 hours ago';
            else if (timeRange === 'today') sinceArg = 'today';

            const priorityArg = priority !== 'all' ? priority : undefined;

            const res = await window.ssm.logsRead(activeConnectionId, {
                source,
                target,
                lines: 300,
                since: sinceArg,
                priority: priorityArg
            });
            setLogs(res.lines || []);
        } catch (err) {
            message.error(t('logs.error_loading', { error: (err as Error).message }));
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId, source, target, priority, timeRange, t]);

    // Fetch on filter/target change (when not live streaming)
    useEffect(() => {
        if (!isStreaming) {
            fetchLogs();
        }
    }, [fetchLogs, isStreaming]);

    // Handle Live Stream start / stop
    const stopActiveStream = useCallback(() => {
        if (activeStreamIdRef.current) {
            window.ssm.logsStreamStop(activeStreamIdRef.current).catch(() => {});
            activeStreamIdRef.current = null;
        }
        setIsStreaming(false);
    }, []);

    const toggleStreaming = async () => {
        if (isStreaming) {
            stopActiveStream();
        } else {
            if (!activeConnectionId || !target) return;
            const newStreamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            activeStreamIdRef.current = newStreamId;
            setIsStreaming(true);
            try {
                await window.ssm.logsStreamStart(activeConnectionId, newStreamId, {
                    source,
                    target
                });
            } catch (err) {
                setIsStreaming(false);
                activeStreamIdRef.current = null;
                message.error(t('logs.error_loading', { error: (err as Error).message }));
            }
        }
    };

    // Listen to SSE live log chunks
    useEffect(() => {
        const cleanup = window.ssm.onLogsStreamData((payload: LogStreamDataPayload) => {
            if (payload.streamId === activeStreamIdRef.current && payload.chunk) {
                const newLines = payload.chunk.split('\n').filter(Boolean);
                setLogs((prev) => {
                    const combined = [...prev, ...newLines];
                    // Keep at most 3,000 lines in buffer for performance
                    return combined.length > 3000 ? combined.slice(combined.length - 3000) : combined;
                });
            }
        });

        return () => {
            cleanup();
            stopActiveStream();
        };
    }, [stopActiveStream]);

    // Copy to clipboard
    const copyLogs = () => {
        navigator.clipboard.writeText(logs.join('\n'));
        message.success(t('logs.copied'));
    };

    // Download logs file
    const downloadLogs = () => {
        const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${target.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Filtered lines for display
    const displayedLogs = useMemo(() => {
        if (!filterText) return logs;
        const lower = filterText.toLowerCase();
        return logs.filter((l) => l.toLowerCase().includes(lower));
    }, [logs, filterText]);

    return (
        <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Top Toolbar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Space size="middle" wrap>
                    {/* Source Selector */}
                    <Segmented
                        options={[
                            { label: t('logs.journal'), value: 'journal', icon: <ProfileOutlined /> },
                            { label: t('logs.files'), value: 'file', icon: <FileTextOutlined /> },
                        ]}
                        value={source}
                        onChange={(val) => {
                            stopActiveStream();
                            const newSource = val as 'journal' | 'file';
                            setSource(newSource);
                            setTarget(newSource === 'journal' ? 'all' : (fileOptions[0]?.value || '/var/log/syslog'));
                        }}
                    />

                    {/* Target Selector */}
                    {source === 'journal' ? (
                        <Select
                            showSearch
                            placeholder={t('logs.select_service')}
                            options={serviceOptions}
                            value={target}
                            onChange={(val) => {
                                stopActiveStream();
                                setTarget(val);
                            }}
                            style={{ minWidth: 260 }}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    ) : (
                        <Select
                            showSearch
                            placeholder={t('logs.select_file')}
                            options={fileOptions}
                            value={target}
                            onChange={(val) => {
                                stopActiveStream();
                                setTarget(val);
                            }}
                            style={{ minWidth: 280 }}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    )}

                    {/* Priority Selector (Journald only) */}
                    {source === 'journal' && (
                        <Select
                            value={priority}
                            onChange={(val) => {
                                stopActiveStream();
                                setPriority(val);
                            }}
                            style={{ width: 170 }}
                            options={[
                                { label: t('logs.priority_all'), value: 'all' },
                                { label: t('logs.priority_err'), value: 'err' },
                                { label: t('logs.priority_warn'), value: 'warning' },
                                { label: t('logs.priority_info'), value: 'info' },
                            ]}
                        />
                    )}

                    {/* Time Range Selector (Journald only) */}
                    {source === 'journal' && (
                        <Select
                            value={timeRange}
                            onChange={(val) => {
                                stopActiveStream();
                                setTimeRange(val);
                            }}
                            style={{ width: 140 }}
                            options={[
                                { label: t('logs.time_1h'), value: '1h' },
                                { label: t('logs.time_24h'), value: '24h' },
                                { label: t('logs.time_today'), value: 'today' },
                                { label: t('logs.time_all'), value: 'all' },
                            ]}
                        />
                    )}
                </Space>

                <Space size="small">
                    {/* Live Stream Button */}
                    <Button
                        type={isStreaming ? 'primary' : 'default'}
                        danger={isStreaming}
                        icon={isStreaming ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        onClick={toggleStreaming}
                    >
                        {isStreaming ? t('logs.streaming') : t('logs.live_stream')}
                    </Button>

                    {!isStreaming && (
                        <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={isLoading}>
                            {t('common.refresh')}
                        </Button>
                    )}
                </Space>
            </div>

            {/* Second Row: Search & Console Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Input
                    placeholder={t('logs.filter_placeholder')}
                    prefix={<SearchOutlined />}
                    allowClear
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    style={{ width: 340 }}
                />

                <Space size="middle">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('logs.lines_count', { count: displayedLogs.length })}
                    </Text>

                    <Tooltip title={t('logs.autoscroll')}>
                        <Space size="small">
                            <VerticalAlignBottomOutlined />
                            <Switch size="small" checked={autoScroll} onChange={setAutoScroll} />
                        </Space>
                    </Tooltip>

                    <Button size="small" icon={<ClearOutlined />} onClick={() => setLogs([])}>
                        {t('logs.clear')}
                    </Button>

                    <Button size="small" icon={<CopyOutlined />} onClick={copyLogs} disabled={logs.length === 0}>
                        {t('logs.copy')}
                    </Button>

                    <Button size="small" icon={<DownloadOutlined />} onClick={downloadLogs} disabled={logs.length === 0}>
                        {t('logs.download')}
                    </Button>
                </Space>
            </div>

            {/* Log Console Output Area */}
            <div
                ref={logContainerRef}
                style={{
                    flex: 1,
                    background: isDark ? '#0d1117' : '#1e1e1e',
                    color: '#c9d1d9',
                    fontFamily: 'Consolas, "Fira Code", monospace',
                    fontSize: 12,
                    lineHeight: 1.6,
                    padding: 14,
                    borderRadius: 8,
                    overflowY: 'auto',
                    border: `1px solid ${isDark ? '#30363d' : '#333'}`,
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                }}
            >
                {isLoading && logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" />
                    </div>
                ) : displayedLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48, color: '#8b949e' }}>
                        {t('logs.no_logs')}
                    </div>
                ) : (
                    displayedLogs.map((line, idx) => {
                        const isErr = /error|crit|fail|emerg|fatal/i.test(line);
                        const isWarn = /warn|alert/i.test(line);

                        let color = '#c9d1d9';
                        if (isErr) color = '#ff7b72';
                        else if (isWarn) color = '#d29922';

                        return (
                            <div
                                key={idx}
                                style={{
                                    color,
                                    padding: '1px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}
                            >
                                {line}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
