/**
 * ProcessManager Component
 * 
 * Lists running processes and allows killing them.
 * Uses Ant Design ProTable for professional table display.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { ProTable } from '@ant-design/pro-components';
import { Button, Space, Tag, Typography, Modal, message, Empty } from 'antd';
import {
    ReloadOutlined,
    StopOutlined,
    AppstoreOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ProcessInfo } from '../../types';

const { Text } = Typography;

const parseProcessList = (output: string): ProcessInfo[] => {
    const lines = output.trim().split('\n');
    if (lines.length <= 1) return [];

    return lines.slice(1).map(line => {
        const parts = line.trim().split(/\s+/);
        return {
            pid: parts[0],
            user: parts[1],
            cpu: parts[2],
            mem: parts[3],
            command: parts.slice(4).join(' ')
        };
    }).filter(p => p.pid && p.command);
};

interface ProcessManagerProps {
    connectionId?: string;
}

export const ProcessManager: React.FC<ProcessManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { activeConnectionId: contextConnectionId } = useConnection();

    // Use prop connectionId if provided, otherwise fall back to context
    const activeConnectionId = propConnectionId ?? contextConnectionId;
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedPid, setSelectedPid] = useState<string | null>(null);

    // Load processes
    const loadProcesses = useCallback(async () => {
        if (!activeConnectionId) return;

        setIsLoading(true);
        try {
            const output = await window.ssm.processList(activeConnectionId);
            setProcesses(parseProcessList(output));
        } catch (err) {
            console.error('Failed to load processes:', err);
            message.error(t('processes.load_error'));
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId, t]);

    // Kill a process
    const killProcess = useCallback(async (pid: string) => {
        if (!activeConnectionId) return;

        Modal.confirm({
            title: t('processes.kill_process'),
            icon: <ExclamationCircleOutlined />,
            content: t('processes.kill_confirm', { pid }),
            okText: t('processes.kill'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await window.ssm.processKill(activeConnectionId, pid);
                    await loadProcesses();
                    message.success(t('processes.kill_success', { pid }));
                    setSelectedPid(null);
                } catch (err) {
                    message.error(t('processes.kill_error', { message: (err as Error).message }));
                }
            },
        });
    }, [activeConnectionId, loadProcesses, t]);

    // Load on mount and connection change
    useEffect(() => {
        if (activeConnectionId) {
            loadProcesses();
        } else {
            setProcesses([]);
        }
    }, [activeConnectionId, loadProcesses]);

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
                <AppstoreOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Typography.Title level={4} type="secondary">
                    {t('processes.select_connection')}
                </Typography.Title>
                <Text type="secondary">
                    {t('processes.select_connection_desc')}
                </Text>
            </div>
        );
    }

    const getCpuTag = (cpu: string) => {
        const value = parseFloat(cpu);
        if (value > 50) return <Tag color="error">{cpu}%</Tag>;
        if (value > 20) return <Tag color="warning">{cpu}%</Tag>;
        return <Tag color="default">{cpu}%</Tag>;
    };

    const getMemTag = (mem: string) => {
        const value = parseFloat(mem);
        if (value > 50) return <Tag color="error">{mem}%</Tag>;
        if (value > 20) return <Tag color="warning">{mem}%</Tag>;
        return <Tag color="default">{mem}%</Tag>;
    };

    const columns: any[] = [
        {
            title: t('processes.pid'),
            dataIndex: 'pid',
            key: 'pid',
            width: 100,
            render: (pid: any) => (
                <Text code style={{ color: '#1677ff' }}>{pid}</Text>
            ),
        },
        {
            title: t('processes.user'),
            dataIndex: 'user',
            key: 'user',
            width: 120,
        },
        {
            title: t('processes.cpu'),
            dataIndex: 'cpu',
            key: 'cpu',
            width: 100,
            render: (cpu: any) => getCpuTag(cpu),
            sorter: (a: ProcessInfo, b: ProcessInfo) => parseFloat(a.cpu) - parseFloat(b.cpu),
        },
        {
            title: t('processes.memory'),
            dataIndex: 'mem',
            key: 'mem',
            width: 100,
            render: (mem: any) => getMemTag(mem),
            sorter: (a: ProcessInfo, b: ProcessInfo) => parseFloat(a.mem) - parseFloat(b.mem),
        },
        {
            title: t('processes.command'),
            dataIndex: 'command',
            key: 'command',
            ellipsis: true,
            render: (command: any) => (
                <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {command}
                </Text>
            ),
        },
        {
            title: t('processes.actions'),
            key: 'actions',
            width: 100,
            render: (_: unknown, record: ProcessInfo) => (
                <Button
                    type="text"
                    danger
                    size="small"
                    icon={<StopOutlined />}
                    onClick={(e) => {
                        e.stopPropagation();
                        killProcess(record.pid);
                    }}
                >
                    {t('processes.kill')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '8px 16px 16px 16px',
            overflow: 'hidden'
        }}>
            <ProTable<ProcessInfo>
                columns={columns}
                dataSource={processes}
                rowKey="pid"
                loading={isLoading}
                search={false}
                dateFormatter="string"
                headerTitle={t('processes.running_processes')}
                size="small"
                toolBarRender={() => [
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined spin={isLoading} />}
                        onClick={loadProcesses}
                    >
                        {t('processes.refresh')}
                    </Button>,
                    selectedPid && (
                        <Button
                            key="kill"
                            danger
                            type="primary"
                            icon={<StopOutlined />}
                            onClick={() => killProcess(selectedPid)}
                        >
                            {t('processes.kill_selected')}
                        </Button>
                    ),
                ]}
                rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedPid ? [selectedPid] : [],
                    onChange: (keys) => setSelectedPid(keys[0] as string || null),
                }}
                onRow={(record) => ({
                    onClick: () => setSelectedPid(record.pid),
                    style: {
                        cursor: 'pointer',
                        background: selectedPid === record.pid ? '#e6f4ff' : undefined,
                    },
                })}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    defaultPageSize: 50,
                    pageSizeOptions: ['20', '50', '100', '200'],
                }}
                locale={{
                    emptyText: (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('processes.no_processes')}
                        />
                    ),
                }}
                options={{
                    density: true,
                    fullScreen: true,
                    reload: loadProcesses,
                }}
                scroll={{ x: 800, y: 'calc(100vh - 280px)' }}
                cardProps={{
                    bodyStyle: { padding: 0 },
                }}
            />
        </div>
    );
};
