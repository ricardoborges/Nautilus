/**
 * ConnectionManager Component
 * 
 * Replaces the simple dropdown with a searchable modal for managing connections.
 * Allows filtering, quick connection, editing, and deleting.
 */

import React, { useState, useMemo } from 'react';
import {
    Modal,
    Input,
    List,
    Button,
    Space,
    Typography,
    Tag,
    Empty,
    Tooltip,
    App,
    Popconfirm
} from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    WindowsOutlined,
    LinuxOutlined,
    EditOutlined,
    DeleteOutlined,
    LoginOutlined,
    LogoutOutlined,
    CheckCircleFilled
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import { Connection } from '../../types';

const { Text } = Typography;

interface ConnectionManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onEditConnection: (connection: Connection) => void;
    onCreateConnection: () => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
    isOpen,
    onClose,
    onEditConnection,
    onCreateConnection,
}) => {
    const { t } = useTranslation();
    const {
        connections,
        activeConnectionIds,
        openConnection,
        closeConnection,
        refreshConnections
    } = useConnection();
    const { message } = App.useApp();
    const { themeMode } = useTheme();

    const [searchTerm, setSearchTerm] = useState('');

    // Define border color based on theme
    const borderColor = themeMode === 'dark' ? '#434343' : '#d9d9d9';

    // Filter connections based on search term
    const filteredConnections = useMemo(() => {
        if (!searchTerm) return connections;
        const term = searchTerm.toLowerCase();
        return connections.filter(conn =>
            conn.name.toLowerCase().includes(term) ||
            conn.host.toLowerCase().includes(term) ||
            conn.user?.toLowerCase().includes(term)
        );
    }, [connections, searchTerm]);

    const handleConnect = async (conn: Connection) => {
        if (conn.connectionType === 'rdp') {
            try {
                let password: string | null = null;
                if (conn.rdpAuthMethod === 'credentials') {
                    password = await window.ssm.getPassword(conn.id);
                }
                await window.ssm.rdpConnect({
                    connectionId: conn.id,
                    host: conn.host,
                    port: conn.port || 3389,
                    username: conn.user,
                    password: password || undefined,
                    domain: conn.domain,
                    useWindowsAuth: conn.rdpAuthMethod === 'windows_auth',
                });
                message.success(t('rdp.session_launched', { name: conn.name }));
                onClose();
            } catch (err) {
                message.error(t('rdp.launch_failed', { error: (err as Error).message }));
            }
        } else {
            // SSH
            openConnection(conn.id);
            onClose();
        }
    };

    const handleDelete = async (connId: string) => {
        await window.ssm.removeConnection(connId);
        refreshConnections();
        message.success(t('common.connection_deleted'));
    };

    return (
        <Modal
            title={t('common.connections')}
            open={isOpen}
            onCancel={onClose}
            footer={[
                <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => {
                    onClose();
                    onCreateConnection();
                }}>
                    {t('common.new_connection')}
                </Button>,
                <Button key="close" onClick={onClose}>
                    {t('common.close')}
                </Button>
            ]}
            width="90%"
            style={{ maxWidth: 1000, paddingBottom: 0 }}
            styles={{ body: { height: '60vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 } }}
        >
            <Input
                placeholder={t('common.search_connections')}
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ marginBottom: 16 }}
                autoFocus
                allowClear
                size="large"
            />

            {filteredConnections.length === 0 ? (
                <Empty
                    description={
                        searchTerm
                            ? t('common.no_results')
                            : t('common.no_connections_yet')
                    }
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            ) : (
                <List
                    grid={{ gutter: 12, xs: 1, sm: 2, md: 3, lg: 4, xl: 4, xxl: 5 }}
                    dataSource={filteredConnections}
                    renderItem={item => {
                        const isActive = activeConnectionIds.includes(item.id);
                        return (
                            <List.Item>
                                <div
                                    style={{
                                        border: `1px solid ${isActive ? '#1677ff' : borderColor}`,
                                        borderRadius: 6,
                                        padding: 10,
                                        cursor: 'pointer',
                                        background: isActive ? 'rgba(22, 119, 255, 0.05)' : 'var(--ant-color-bg-container)',
                                        transition: 'all 0.3s',
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                    }}
                                    className="connection-card"
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#1677ff';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isActive ? '#1677ff' : borderColor;
                                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
                                    }}
                                    onDoubleClick={() => handleConnect(item)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {item.connectionType === 'rdp'
                                                ? <WindowsOutlined style={{ fontSize: 18, color: '#0078d4' }} />
                                                : <LinuxOutlined style={{ fontSize: 18, color: '#f57c00' }} />
                                            }
                                            <Space direction="vertical" size={0} style={{ rowGap: 0 }}>
                                                <Text strong style={{ fontSize: 14, lineHeight: '1.2' }}>{item.name}</Text>
                                                <Text type="secondary" style={{ fontSize: 11 }}>{item.user}@{item.host}</Text>
                                            </Space>
                                        </div>
                                        {isActive && (
                                            <Tag color="success" icon={<CheckCircleFilled />} style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                                                {t('common.active')}
                                            </Tag>
                                        )}
                                    </div>

                                    {item.description && (
                                        <div style={{ marginBottom: 8, flex: 1 }}>
                                            <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 0, lineHeight: '1.4' }} ellipsis={{ rows: 2, tooltip: true }}>
                                                {item.description}
                                            </Typography.Paragraph>
                                        </div>
                                    )}

                                    <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--ant-color-border-secondary)', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                        <Tooltip title={isActive ? t('common.disconnect') : t('common.connect')}>
                                            <Button
                                                type="default"
                                                danger={isActive}
                                                size="small"
                                                icon={isActive
                                                    ? <LogoutOutlined style={{ fontSize: 12 }} />
                                                    : <LoginOutlined style={{ fontSize: 12 }} />
                                                }
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isActive) {
                                                        closeConnection(item.id);
                                                    } else {
                                                        handleConnect(item);
                                                    }
                                                }}
                                                style={{ height: 24, padding: '0 8px', fontSize: 12 }}
                                            >
                                                {isActive ? t('common.disconnect') : t('common.connect')}
                                            </Button>
                                        </Tooltip>
                                        <Tooltip title={t('common.edit')}>
                                            <Button
                                                size="small"
                                                icon={<EditOutlined style={{ fontSize: 12 }} />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onClose();
                                                    onEditConnection(item);
                                                }}
                                                style={{ height: 24, width: 24 }}
                                            />
                                        </Tooltip>
                                        <Popconfirm
                                            title={t('common.delete_connection')}
                                            description={t('common.confirm_delete_connection', { name: item.name })}
                                            onConfirm={(e) => {
                                                e?.stopPropagation();
                                                handleDelete(item.id);
                                            }}
                                            onCancel={(e) => e?.stopPropagation()}
                                            okText={t('common.delete')}
                                            cancelText={t('common.cancel')}
                                            okButtonProps={{ danger: true }}
                                        >
                                            <Tooltip title={t('common.delete')}>
                                                <Button
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ height: 24, width: 24 }}
                                                />
                                            </Tooltip>
                                        </Popconfirm>
                                    </div>
                                </div>
                            </List.Item>
                        );
                    }}
                />
            )}
        </Modal>
    );
};
