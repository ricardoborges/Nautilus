/**
 * EnvManager Component
 *
 * Finds every .env file under the SSH user's home directory on the remote
 * server and lets the user edit or delete them.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ProTable } from '@ant-design/pro-components';
import { Button, Space, Typography, Modal, message, Empty, Tag, Tooltip } from 'antd';
import {
    ReloadOutlined, EditOutlined, DeleteOutlined, FileTextOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { EnvEditorModal } from './EnvEditorModal';
import type { EnvFile } from '../../types';

const { Text } = Typography;

const formatSize = (bytes: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
};

const formatDate = (epochMs: number): string => {
    if (!epochMs) return '-';
    return new Date(epochMs).toLocaleString();
};

interface EnvManagerProps {
    connectionId?: string;
}

export const EnvManager: React.FC<EnvManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { activeConnectionId: contextConnectionId } = useConnection();
    const activeConnectionId = propConnectionId ?? contextConnectionId;

    const [files, setFiles] = useState<EnvFile[]>([]);
    const [home, setHome] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [editing, setEditing] = useState<EnvFile | null>(null);

    const loadFiles = useCallback(async () => {
        if (!activeConnectionId) return;

        setIsLoading(true);
        try {
            const result = await window.ssm.envList(activeConnectionId);
            setFiles(result.files);
            setHome(result.home);
        } catch (err) {
            console.error('Failed to list env files:', err);
            message.error(t('env.load_list_error', { message: (err as Error).message }));
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId, t]);

    useEffect(() => {
        if (activeConnectionId) {
            loadFiles();
        } else {
            setFiles([]);
        }
    }, [activeConnectionId, loadFiles]);

    const deleteFile = useCallback((file: EnvFile) => {
        if (!activeConnectionId) return;

        Modal.confirm({
            title: t('env.delete_title'),
            icon: <ExclamationCircleOutlined />,
            content: (
                <Space direction="vertical" size={4}>
                    <Text>{t('env.delete_confirm')}</Text>
                    <Text code style={{ fontSize: 12 }}>{file.path}</Text>
                </Space>
            ),
            okText: t('env.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await window.ssm.sftpDeleteFile(activeConnectionId, file.path);
                    message.success(t('env.delete_success', { name: file.name }));
                    await loadFiles();
                } catch (err) {
                    message.error(t('env.delete_error', { message: (err as Error).message }));
                }
            },
        });
    }, [activeConnectionId, loadFiles, t]);

    /** Shortens /home/user/app to ~/app for readability. */
    const relativeDir = useCallback((directory: string): string => {
        if (home && directory === home) return '~';
        if (home && directory.startsWith(`${home}/`)) return `~${directory.slice(home.length)}`;
        return directory;
    }, [home]);

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
                <FileTextOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Typography.Title level={4} type="secondary">
                    {t('env.select_connection')}
                </Typography.Title>
                <Text type="secondary">{t('env.select_connection_desc')}</Text>
            </div>
        );
    }

    const columns: any[] = [
        {
            title: t('env.file'),
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (name: any) => (
                <Space>
                    <FileTextOutlined style={{ color: '#1677ff' }} />
                    <Text strong style={{ fontFamily: 'monospace' }}>{name}</Text>
                </Space>
            ),
        },
        {
            title: t('env.location'),
            dataIndex: 'directory',
            key: 'directory',
            ellipsis: true,
            render: (directory: any) => (
                <Tooltip title={directory}>
                    <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {relativeDir(directory)}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: t('env.size'),
            dataIndex: 'size',
            key: 'size',
            width: 100,
            sorter: (a: EnvFile, b: EnvFile) => a.size - b.size,
            render: (size: any) => <Tag>{formatSize(size)}</Tag>,
        },
        {
            title: t('env.modified'),
            dataIndex: 'modified',
            key: 'modified',
            width: 170,
            sorter: (a: EnvFile, b: EnvFile) => a.modified - b.modified,
            render: (modified: any) => (
                <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(modified)}</Text>
            ),
        },
        {
            title: t('env.actions'),
            key: 'actions',
            width: 170,
            render: (_: unknown, record: EnvFile) => (
                <Space size={4}>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(record)}
                    >
                        {t('env.edit')}
                    </Button>
                    <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => deleteFile(record)}
                    >
                        {t('env.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '8px 16px 16px 16px',
            overflow: 'hidden',
        }}>
            <ProTable<EnvFile>
                columns={columns}
                dataSource={files}
                rowKey="path"
                loading={isLoading}
                search={false}
                dateFormatter="string"
                headerTitle={
                    <Space>
                        {t('env.title')}
                        {home && (
                            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                                {t('env.searched_in', { home })}
                            </Text>
                        )}
                    </Space>
                }
                size="small"
                toolBarRender={() => [
                    <Button
                        key="refresh"
                        icon={<ReloadOutlined spin={isLoading} />}
                        onClick={loadFiles}
                    >
                        {t('env.refresh')}
                    </Button>,
                ]}
                pagination={{
                    showSizeChanger: true,
                    defaultPageSize: 20,
                    pageSizeOptions: ['10', '20', '50', '100'],
                }}
                locale={{
                    emptyText: (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('env.no_files')}
                        />
                    ),
                }}
                options={{
                    density: true,
                    fullScreen: true,
                    // Refresh is already provided by the labelled toolbar button
                    reload: false,
                }}
                scroll={{ x: 800, y: 'calc(100vh - 280px)' }}
                cardProps={{ bodyStyle: { padding: 0 } }}
            />

            <EnvEditorModal
                open={editing !== null}
                connectionId={activeConnectionId}
                file={editing}
                onClose={() => setEditing(null)}
                onSaved={loadFiles}
            />
        </div>
    );
};
