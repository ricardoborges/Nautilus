/**
 * TunnelManager Component
 * 
 * Manage SSH Port Forwarding (Local and Remote Tunnels) with
 * live status, client connection counts, 1-click templates,
 * and copyable SSH CLI commands.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import {
    Table,
    Button,
    Tag,
    Badge,
    Space,
    Typography,
    Card,
    Row,
    Col,
    Modal,
    Form,
    Input,
    InputNumber,
    Radio,
    Checkbox,
    Popconfirm,
    message,
    Tooltip,
    Dropdown,
    Empty
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
    SwapOutlined,
    ReloadOutlined,
    PlusOutlined,
    PlayCircleOutlined,
    PoweroffOutlined,
    CopyOutlined,
    EditOutlined,
    DeleteOutlined,
    DownOutlined,
    DatabaseOutlined,
    GlobalOutlined,
    BranchesOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined
} from '@ant-design/icons';
import type { TunnelConfig, TunnelRuntimeInfo } from '../../types';

const { Text, Paragraph, Title } = Typography;

interface TunnelManagerProps {
    connectionId?: string;
}

interface PresetItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    name: string;
    localPort: number;
    remotePort: number;
    remoteHost: string;
}

export const TunnelManager: React.FC<TunnelManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { activeConnectionId, connections } = useConnection();
    const connectionId = propConnectionId || activeConnectionId;

    const currentConnection = useMemo(() => {
        return connections.find((c) => c.id === connectionId);
    }, [connections, connectionId]);

    const bastionConnection = useMemo(() => {
        if (!currentConnection?.bastionConnectionId) return null;
        return connections.find((c) => c.id === currentConnection.bastionConnectionId);
    }, [connections, currentConnection]);

    const [tunnels, setTunnels] = useState<TunnelRuntimeInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTunnel, setEditingTunnel] = useState<TunnelConfig | null>(null);
    const [modalForm] = Form.useForm();

    // Fetch tunnels
    const fetchTunnels = useCallback(async () => {
        if (!connectionId) return;
        setLoading(true);
        try {
            const list = await window.ssm.tunnelsList(connectionId);
            setTunnels(list);
        } catch (err) {
            console.error('Failed to load tunnels:', err);
            message.error((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [connectionId]);

    useEffect(() => {
        fetchTunnels();
        // Poll status every 5 seconds while viewed
        const interval = setInterval(fetchTunnels, 5000);
        return () => clearInterval(interval);
    }, [fetchTunnels]);

    // Tunnel Start / Stop
    const handleToggleTunnel = async (record: TunnelRuntimeInfo) => {
        const id = record.id;
        setActionLoading((prev) => ({ ...prev, [id]: true }));
        try {
            if (record.status === 'active') {
                await window.ssm.tunnelsStop(id);
                message.success(t('tunnels.stopped_success', { name: record.name }));
            } else {
                await window.ssm.tunnelsStart(id);
                message.success(t('tunnels.started_success', { name: record.name, port: record.localPort }));
            }
            await fetchTunnels();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setActionLoading((prev) => ({ ...prev, [id]: false }));
        }
    };

    // Delete tunnel
    const handleDeleteTunnel = async (id: string) => {
        try {
            await window.ssm.tunnelsDelete(id);
            message.success(t('tunnels.deleted_success'));
            await fetchTunnels();
        } catch (err) {
            message.error((err as Error).message);
        }
    };

    // Open Modal for Create or Edit
    const handleOpenModal = (tunnel?: TunnelConfig) => {
        if (tunnel) {
            setEditingTunnel(tunnel);
            modalForm.setFieldsValue({
                name: tunnel.name,
                tunnelType: tunnel.tunnelType,
                localHost: tunnel.localHost,
                localPort: tunnel.localPort,
                remoteHost: tunnel.remoteHost,
                remotePort: tunnel.remotePort,
                autoStart: tunnel.autoStart,
            });
        } else {
            setEditingTunnel(null);
            modalForm.setFieldsValue({
                name: '',
                tunnelType: 'local',
                localHost: '127.0.0.1',
                localPort: 5432,
                remoteHost: '127.0.0.1',
                remotePort: 5432,
                autoStart: false,
            });
        }
        setIsModalOpen(true);
    };

    // Save tunnel
    const handleSaveModal = async () => {
        if (!connectionId) return;
        try {
            const values = await modalForm.validateFields();
            if (editingTunnel) {
                await window.ssm.tunnelsUpdate(editingTunnel.id, values);
                message.success(t('tunnels.updated_success'));
            } else {
                await window.ssm.tunnelsCreate({
                    ...values,
                    connectionId,
                });
                message.success(t('tunnels.created_success'));
            }
            setIsModalOpen(false);
            await fetchTunnels();
        } catch (err) {
            if ((err as Error).message) {
                message.error((err as Error).message);
            }
        }
    };

    // Presets application
    const presets: PresetItem[] = [
        {
            key: 'postgres',
            label: t('tunnels.preset_postgres'),
            icon: <DatabaseOutlined style={{ color: '#336791' }} />,
            name: 'PostgreSQL DB',
            localPort: 5432,
            remotePort: 5432,
            remoteHost: '127.0.0.1',
        },
        {
            key: 'mysql',
            label: t('tunnels.preset_mysql'),
            icon: <DatabaseOutlined style={{ color: '#00758F' }} />,
            name: 'MySQL Server',
            localPort: 3306,
            remotePort: 3306,
            remoteHost: '127.0.0.1',
        },
        {
            key: 'redis',
            label: t('tunnels.preset_redis'),
            icon: <DatabaseOutlined style={{ color: '#DC382D' }} />,
            name: 'Redis Cache',
            localPort: 6379,
            remotePort: 6379,
            remoteHost: '127.0.0.1',
        },
        {
            key: 'mongodb',
            label: t('tunnels.preset_mongodb'),
            icon: <DatabaseOutlined style={{ color: '#47A248' }} />,
            name: 'MongoDB',
            localPort: 27017,
            remotePort: 27017,
            remoteHost: '127.0.0.1',
        },
        {
            key: 'web',
            label: t('tunnels.preset_web'),
            icon: <GlobalOutlined style={{ color: '#1890FF' }} />,
            name: 'Web Application',
            localPort: 8080,
            remotePort: 80,
            remoteHost: '127.0.0.1',
        },
    ];

    const handleApplyPreset = (preset: PresetItem) => {
        setEditingTunnel(null);
        modalForm.setFieldsValue({
            name: preset.name,
            tunnelType: 'local',
            localHost: '127.0.0.1',
            localPort: preset.localPort,
            remoteHost: preset.remoteHost,
            remotePort: preset.remotePort,
            autoStart: false,
        });
        setIsModalOpen(true);
    };

    const presetMenuItems: MenuProps['items'] = presets.map((p) => ({
        key: p.key,
        label: p.label,
        icon: p.icon,
        onClick: () => handleApplyPreset(p),
    }));

    // Copy SSH CLI command
    const handleCopySSHCommand = (tunnel: TunnelConfig) => {
        if (!currentConnection) return;
        let cmd = 'ssh -N';

        if (tunnel.tunnelType === 'local') {
            cmd += ` -L ${tunnel.localPort}:${tunnel.remoteHost}:${tunnel.remotePort}`;
        } else {
            cmd += ` -R ${tunnel.remotePort}:${tunnel.localHost}:${tunnel.localPort}`;
        }

        if (bastionConnection) {
            cmd += ` -J ${bastionConnection.user}@${bastionConnection.host}${
                bastionConnection.port && bastionConnection.port !== 22 ? `:${bastionConnection.port}` : ''
            }`;
        }

        cmd += ` ${currentConnection.user}@${currentConnection.host}`;
        if (currentConnection.port && currentConnection.port !== 22) {
            cmd += ` -p ${currentConnection.port}`;
        }

        navigator.clipboard.writeText(cmd);
        message.success(t('tunnels.command_copied'));
    };

    // Calculate stats
    const stats = useMemo(() => {
        const total = tunnels.length;
        const active = tunnels.filter((t) => t.status === 'active').length;
        const totalConnections = tunnels.reduce((acc, curr) => acc + (curr.activeConnections || 0), 0);
        return { total, active, totalConnections };
    }, [tunnels]);

    const columns: ColumnsType<TunnelRuntimeInfo> = [
        {
            title: t('tunnels.name'),
            key: 'name',
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Space>
                        <Text strong>{record.name}</Text>
                        <Tag color={record.tunnelType === 'local' ? 'blue' : 'purple'}>
                            {record.tunnelType === 'local' ? 'Local (-L)' : 'Remote (-R)'}
                        </Tag>
                        {record.autoStart && (
                            <Tag color="cyan">Auto-start</Tag>
                        )}
                    </Space>
                    {record.error && (
                        <Text type="danger" style={{ fontSize: 12 }}>
                            {record.error}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: t('tunnels.forward_direction'),
            key: 'direction',
            render: (_, record) => {
                const local = `${record.localHost}:${record.localPort}`;
                const remote = `${record.remoteHost}:${record.remotePort}`;
                return (
                    <Space>
                        <Tag style={{ fontFamily: 'monospace' }}>
                            {record.tunnelType === 'local' ? local : remote}
                        </Tag>
                        <SwapOutlined style={{ color: '#8c8c8c' }} />
                        <Tag style={{ fontFamily: 'monospace' }}>
                            {record.tunnelType === 'local' ? remote : local}
                        </Tag>
                    </Space>
                );
            },
        },
        {
            title: t('tunnels.status'),
            key: 'status',
            width: 140,
            render: (_, record) => {
                if (record.status === 'active') {
                    return <Badge status="success" text={<Text type="success">{t('tunnels.active')}</Text>} />;
                }
                if (record.status === 'error') {
                    return <Badge status="error" text={<Text type="danger">{t('tunnels.error')}</Text>} />;
                }
                return <Badge status="default" text={<Text type="secondary">{t('tunnels.inactive')}</Text>} />;
            },
        },
        {
            title: t('tunnels.active_connections'),
            key: 'activeConnections',
            width: 110,
            render: (_, record) => (
                <Tag color={record.activeConnections > 0 ? 'green' : 'default'}>
                    {record.activeConnections || 0}
                </Tag>
            ),
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 220,
            render: (_, record) => {
                const isActive = record.status === 'active';
                const isOpLoading = actionLoading[record.id];

                return (
                    <Space direction="horizontal" size="small">
                        <Button
                            size="small"
                            type={isActive ? 'default' : 'primary'}
                            danger={isActive}
                            loading={isOpLoading}
                            icon={isActive ? <PoweroffOutlined /> : <PlayCircleOutlined />}
                            onClick={() => handleToggleTunnel(record)}
                        >
                            {isActive ? t('common.stop') : t('common.start')}
                        </Button>
                        <Tooltip title={t('tunnels.copy_command')}>
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => handleCopySSHCommand(record)}
                            />
                        </Tooltip>
                        <Tooltip title={t('common.edit')}>
                            <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleOpenModal(record)}
                            />
                        </Tooltip>
                        <Popconfirm
                            title={t('tunnels.confirm_delete', { name: record.name })}
                            onConfirm={() => handleDeleteTunnel(record.id)}
                            okText={t('common.yes')}
                            cancelText={t('common.no')}
                        >
                            <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                            />
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

    return (
        <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        <SwapOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                        {t('tunnels.title')}
                    </Title>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                        {t('tunnels.subtitle')}
                        {bastionConnection && (
                            <Tag color="geekblue" icon={<BranchesOutlined />} style={{ marginLeft: 8 }}>
                                Via Bastion: {bastionConnection.name}
                            </Tag>
                        )}
                    </Paragraph>
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={fetchTunnels}
                    >
                        {t('common.refresh')}
                    </Button>
                    <Dropdown menu={{ items: presetMenuItems }} placement="bottomRight">
                        <Button icon={<DatabaseOutlined />}>
                            {t('tunnels.presets')} <DownOutlined />
                        </Button>
                    </Dropdown>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenModal()}
                    >
                        {t('tunnels.new_tunnel')}
                    </Button>
                </Space>
            </div>

            {/* Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={8}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('tunnels.card_total')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>
                            {stats.total}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('tunnels.card_active')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4, color: '#52c41a' }}>
                            {stats.active}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('tunnels.card_connections')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4, color: '#1677ff' }}>
                            {stats.totalConnections}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Tunnels Table */}
            <Table
                rowKey="id"
                columns={columns}
                dataSource={tunnels}
                loading={loading}
                pagination={{ pageSize: 10 }}
                locale={{
                    emptyText: (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                                <div>
                                    <Text strong>{t('tunnels.no_tunnels')}</Text>
                                    <br />
                                    <Text type="secondary">{t('tunnels.no_tunnels_desc')}</Text>
                                </div>
                            }
                        >
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => handleOpenModal()}
                            >
                                {t('tunnels.new_tunnel')}
                            </Button>
                        </Empty>
                    ),
                }}
            />

            {/* Create / Edit Modal */}
            <Modal
                title={editingTunnel ? t('tunnels.edit_tunnel') : t('tunnels.new_tunnel')}
                open={isModalOpen}
                onOk={handleSaveModal}
                onCancel={() => setIsModalOpen(false)}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form
                    form={modalForm}
                    layout="vertical"
                    initialValues={{
                        tunnelType: 'local',
                        localHost: '127.0.0.1',
                        localPort: 5432,
                        remoteHost: '127.0.0.1',
                        remotePort: 5432,
                        autoStart: false,
                    }}
                >
                    <Form.Item
                        name="name"
                        label={t('tunnels.name')}
                        rules={[{ required: true, message: t('tunnels.name_required') }]}
                    >
                        <Input placeholder={t('tunnels.name_placeholder')} />
                    </Form.Item>

                    <Form.Item name="tunnelType" label={t('tunnels.tunnel_type')}>
                        <Radio.Group>
                            <Radio value="local">{t('tunnels.type_local')}</Radio>
                            <Radio value="remote">{t('tunnels.type_remote')}</Radio>
                        </Radio.Group>
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={14}>
                            <Form.Item
                                name="localHost"
                                label={t('tunnels.local_host')}
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="127.0.0.1" />
                            </Form.Item>
                        </Col>
                        <Col span={10}>
                            <Form.Item
                                name="localPort"
                                label={t('tunnels.local_port')}
                                rules={[{ required: true }]}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} max={65535} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={14}>
                            <Form.Item
                                name="remoteHost"
                                label={t('tunnels.remote_host')}
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="127.0.0.1" />
                            </Form.Item>
                        </Col>
                        <Col span={10}>
                            <Form.Item
                                name="remotePort"
                                label={t('tunnels.remote_port')}
                                rules={[{ required: true }]}
                            >
                                <InputNumber style={{ width: '100%' }} min={1} max={65535} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="autoStart" valuePropName="checked">
                        <Checkbox>{t('tunnels.auto_start')}</Checkbox>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};
