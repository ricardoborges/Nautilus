/**
 * Docker Dashboard Component
 * 
 * Displays Docker containers and images running on the server.
 * Shows container status, image info, ports, and provides basic actions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import {
    Card,
    Table,
    Tag,
    Button,
    Space,
    Typography,
    Spin,
    Empty,
    Tooltip,
    message,
    Row,
    Col,
    Statistic,
    Modal,
    Tabs,
} from 'antd';
import { ProCard } from '@ant-design/pro-components';
import {
    PlayCircleOutlined,
    PauseCircleOutlined,
    StopOutlined,
    ReloadOutlined,
    DeleteOutlined,
    CloudServerOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    PictureOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import type { DockerContainer, DockerImage } from '../../types';

const { Text, Title } = Typography;

export const DockerDashboard: React.FC = () => {
    const { t } = useTranslation();
    const { activeConnectionId, dockerAvailable } = useConnection();
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [images, setImages] = useState<DockerImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Logs modal state
    const [logsModalOpen, setLogsModalOpen] = useState(false);
    const [logsContent, setLogsContent] = useState('');
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsContainerName, setLogsContainerName] = useState('');

    const loadContainers = useCallback(async () => {
        if (!activeConnectionId) return;

        setLoading(true);
        try {
            const result = await window.ssm.dockerListContainers(activeConnectionId);
            setContainers(result);
        } catch (error) {
            console.error('Failed to load containers:', error);
            message.error(t('docker.load_error'));
        } finally {
            setLoading(false);
        }
    }, [activeConnectionId, t]);

    const loadImages = useCallback(async () => {
        if (!activeConnectionId) return;

        setImagesLoading(true);
        try {
            const result = await window.ssm.dockerListImages(activeConnectionId);
            setImages(result);
        } catch (error) {
            console.error('Failed to load images:', error);
            message.error(t('docker.images_load_error'));
        } finally {
            setImagesLoading(false);
        }
    }, [activeConnectionId, t]);

    useEffect(() => {
        if (activeConnectionId && dockerAvailable) {
            loadContainers();
            loadImages();
        }
    }, [activeConnectionId, dockerAvailable, loadContainers, loadImages]);

    const handleAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
        if (!activeConnectionId) return;

        setActionLoading(containerId);
        try {
            await window.ssm.dockerContainerAction(activeConnectionId, containerId, action);
            message.success(t(`docker.${action}_success`));
            await loadContainers();
        } catch (error) {
            const err = error as Error;
            message.error(t(`docker.${action}_error`, { message: err.message }));
        } finally {
            setActionLoading(null);
        }
    };

    const confirmRemove = (containerId: string, containerName: string) => {
        Modal.confirm({
            title: t('docker.remove_confirm_title'),
            content: t('docker.remove_confirm_content', { name: containerName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => handleAction(containerId, 'remove'),
        });
    };

    const handleImageAction = async (imageId: string, action: 'remove') => {
        if (!activeConnectionId) return;

        setActionLoading(imageId);
        try {
            await window.ssm.dockerImageAction(activeConnectionId, imageId, action);
            message.success(t(`docker.image_${action}_success`));
            await loadImages();
        } catch (error) {
            const err = error as Error;
            message.error(t(`docker.image_${action}_error`, { message: err.message }));
        } finally {
            setActionLoading(null);
        }
    };

    const confirmRemoveImage = (imageId: string, imageName: string) => {
        Modal.confirm({
            title: t('docker.image_remove_confirm_title'),
            content: t('docker.image_remove_confirm_content', { name: imageName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => handleImageAction(imageId, 'remove'),
        });
    };

    const openLogs = async (containerId: string, containerName: string) => {
        if (!activeConnectionId) return;

        setLogsContainerName(containerName);
        setLogsContent('');
        setLogsModalOpen(true);
        setLogsLoading(true);

        try {
            const logs = await window.ssm.dockerContainerLogs(activeConnectionId, containerId, 500);
            setLogsContent(logs || t('docker.logs_empty'));
        } catch (error) {
            const err = error as Error;
            setLogsContent(`${t('docker.logs_error')}: ${err.message}`);
        } finally {
            setLogsLoading(false);
        }
    };

    const refreshLogs = async (containerId: string) => {
        if (!activeConnectionId) return;

        setLogsLoading(true);
        try {
            const logs = await window.ssm.dockerContainerLogs(activeConnectionId, containerId, 500);
            setLogsContent(logs || t('docker.logs_empty'));
        } catch (error) {
            const err = error as Error;
            setLogsContent(`${t('docker.logs_error')}: ${err.message}`);
        } finally {
            setLogsLoading(false);
        }
    };

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
                <CloudServerOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Title level={4} type="secondary">
                    {t('docker.select_connection')}
                </Title>
                <Text type="secondary">
                    {t('docker.select_connection_desc')}
                </Text>
            </div>
        );
    }

    if (!dockerAvailable) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: 48,
            }}>
                <ExclamationCircleOutlined style={{ fontSize: 64, color: '#faad14', marginBottom: 24 }} />
                <Title level={4} type="secondary">
                    {t('docker.not_available')}
                </Title>
                <Text type="secondary">
                    {t('docker.not_available_desc')}
                </Text>
            </div>
        );
    }

    const getStatusTag = (status: string, state: string) => {
        const stateColors: Record<string, string> = {
            running: 'success',
            exited: 'default',
            paused: 'warning',
            restarting: 'processing',
            dead: 'error',
            created: 'default',
        };

        const stateIcons: Record<string, React.ReactNode> = {
            running: <CheckCircleOutlined />,
            exited: <StopOutlined />,
            paused: <PauseCircleOutlined />,
            restarting: <ReloadOutlined spin />,
            dead: <ExclamationCircleOutlined />,
            created: <ClockCircleOutlined />,
        };

        return (
            <Tag color={stateColors[state] || 'default'} icon={stateIcons[state]}>
                {status}
            </Tag>
        );
    };

    // Statistics
    const runningCount = containers.filter(c => c.state === 'running').length;
    const stoppedCount = containers.filter(c => c.state === 'exited').length;
    const totalCount = containers.length;
    const imagesCount = images.length;

    const containerColumns = [
        {
            title: t('docker.container_name'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: t('docker.image'),
            dataIndex: 'image',
            key: 'image',
            render: (image: string) => (
                <Tooltip title={image}>
                    <Text style={{ maxWidth: 200 }} ellipsis>
                        {image}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: t('docker.status'),
            dataIndex: 'status',
            key: 'status',
            render: (status: string, record: DockerContainer) => getStatusTag(status, record.state),
        },
        {
            title: t('docker.ports'),
            dataIndex: 'ports',
            key: 'ports',
            render: (ports: string) => {
                if (!ports) return '-';

                // Parse port mappings from Docker format: "0.0.0.0:8080->80/tcp, 0.0.0.0:443->443/tcp"
                const portMappings = ports.split(',').map(p => p.trim());
                const links: React.ReactNode[] = [];

                portMappings.forEach((mapping, index) => {
                    // Match pattern like "0.0.0.0:8080->80/tcp" or ":::8080->80/tcp"
                    const match = mapping.match(/(?:[\d.:]+:)?(\d+)->(\d+)\/(\w+)/);
                    if (match) {
                        const hostPort = match[1];
                        const containerPort = match[2];
                        const protocol = match[3];

                        // Only create links for HTTP-compatible protocols (tcp)
                        if (protocol === 'tcp') {
                            links.push(
                                <span key={index}>
                                    {index > 0 && ', '}
                                    <a
                                        href={`http://localhost:${hostPort}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.ssm.openExternal(`http://localhost:${hostPort}`);
                                        }}
                                        style={{ color: '#1677ff' }}
                                    >
                                        {hostPort}→{containerPort}
                                    </a>
                                </span>
                            );
                        } else {
                            links.push(
                                <span key={index}>
                                    {index > 0 && ', '}
                                    <Text type="secondary">{hostPort}→{containerPort}/{protocol}</Text>
                                </span>
                            );
                        }
                    } else if (mapping) {
                        // Fallback: just display the raw mapping
                        links.push(
                            <span key={index}>
                                {index > 0 && ', '}
                                <Text type="secondary">{mapping}</Text>
                            </span>
                        );
                    }
                });

                return links.length > 0 ? <>{links}</> : '-';
            },
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 150,
        },
        {
            title: t('docker.actions'),
            key: 'actions',
            width: 220,
            render: (_: unknown, record: DockerContainer) => {
                const isLoading = actionLoading === record.id;
                const isRunning = record.state === 'running';

                return (
                    <Space size="small">
                        {isRunning ? (
                            <>
                                <Tooltip title={t('docker.stop')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<StopOutlined />}
                                        loading={isLoading}
                                        onClick={() => handleAction(record.id, 'stop')}
                                        danger
                                    />
                                </Tooltip>
                                <Tooltip title={t('docker.restart')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<ReloadOutlined />}
                                        loading={isLoading}
                                        onClick={() => handleAction(record.id, 'restart')}
                                    />
                                </Tooltip>
                            </>
                        ) : (
                            <Tooltip title={t('docker.start')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<PlayCircleOutlined />}
                                    loading={isLoading}
                                    onClick={() => handleAction(record.id, 'start')}
                                    style={{ color: '#52c41a' }}
                                />
                            </Tooltip>
                        )}
                        <Tooltip title={t('docker.logs')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<FileTextOutlined />}
                                onClick={() => openLogs(record.id, record.name)}
                            />
                        </Tooltip>
                        <Tooltip title={t('docker.remove')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                loading={isLoading}
                                onClick={() => confirmRemove(record.id, record.name)}
                                danger
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    const imageColumns = [
        {
            title: t('docker.repository'),
            dataIndex: 'repository',
            key: 'repository',
            render: (repo: string) => <Text strong>{repo}</Text>,
        },
        {
            title: t('docker.tag'),
            dataIndex: 'tag',
            key: 'tag',
            render: (tag: string) => <Tag color="blue">{tag}</Tag>,
        },
        {
            title: t('docker.image_id'),
            dataIndex: 'id',
            key: 'id',
            render: (id: string) => (
                <Tooltip title={id}>
                    <Text code style={{ fontSize: 12 }}>
                        {id.substring(0, 12)}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: t('docker.size'),
            dataIndex: 'size',
            key: 'size',
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 150,
        },
        {
            title: t('docker.actions'),
            key: 'actions',
            width: 100,
            render: (_: unknown, record: DockerImage) => {
                const isLoading = actionLoading === record.id;
                const imageName = `${record.repository}:${record.tag}`;

                return (
                    <Space size="small">
                        <Tooltip title={t('docker.remove')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                loading={isLoading}
                                onClick={() => confirmRemoveImage(record.id, imageName)}
                                danger
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    return (
        <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
            {/* Statistics */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} sm={6}>
                    <ProCard className="statistic-card">
                        <Statistic
                            title={t('docker.total_containers')}
                            value={totalCount}
                            prefix={<CloudServerOutlined style={{ color: '#1677ff' }} />}
                            valueStyle={{ color: '#1677ff' }}
                        />
                    </ProCard>
                </Col>
                <Col xs={12} sm={6}>
                    <ProCard className="statistic-card">
                        <Statistic
                            title={t('docker.running')}
                            value={runningCount}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </ProCard>
                </Col>
                <Col xs={12} sm={6}>
                    <ProCard className="statistic-card">
                        <Statistic
                            title={t('docker.stopped')}
                            value={stoppedCount}
                            prefix={<StopOutlined style={{ color: '#8c8c8c' }} />}
                            valueStyle={{ color: '#8c8c8c' }}
                        />
                    </ProCard>
                </Col>
                <Col xs={12} sm={6}>
                    <ProCard className="statistic-card">
                        <Statistic
                            title={t('docker.total_images')}
                            value={imagesCount}
                            prefix={<PictureOutlined style={{ color: '#722ed1' }} />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </ProCard>
                </Col>
            </Row>

            {/* Tabs for Containers and Images */}
            <Card>
                <Tabs
                    defaultActiveKey="containers"
                    items={[
                        {
                            key: 'containers',
                            label: (
                                <Space>
                                    <CloudServerOutlined />
                                    {t('docker.containers')} ({totalCount})
                                </Space>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={loadContainers}
                                            loading={loading}
                                        >
                                            {t('common.refresh')}
                                        </Button>
                                    </div>
                                    {loading && containers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_containers')}
                                            </Text>
                                        </div>
                                    ) : containers.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={t('docker.no_containers')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={containers}
                                            columns={containerColumns}
                                            rowKey="id"
                                            pagination={false}
                                            size="middle"
                                            loading={loading}
                                        />
                                    )}
                                </>
                            ),
                        },
                        {
                            key: 'images',
                            label: (
                                <Space>
                                    <PictureOutlined />
                                    {t('docker.images')} ({imagesCount})
                                </Space>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={loadImages}
                                            loading={imagesLoading}
                                        >
                                            {t('common.refresh')}
                                        </Button>
                                    </div>
                                    {imagesLoading && images.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_images')}
                                            </Text>
                                        </div>
                                    ) : images.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={t('docker.no_images')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={images}
                                            columns={imageColumns}
                                            rowKey="id"
                                            pagination={false}
                                            size="middle"
                                            loading={imagesLoading}
                                        />
                                    )}
                                </>
                            ),
                        },
                    ]}
                />
            </Card>

            {/* Logs Modal */}
            <Modal
                title={
                    <Space>
                        <FileTextOutlined />
                        {t('docker.logs_title', { name: logsContainerName })}
                    </Space>
                }
                open={logsModalOpen}
                onCancel={() => setLogsModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setLogsModalOpen(false)}>
                        {t('common.close')}
                    </Button>
                ]}
                width={900}
                styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
            >
                {logsLoading ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" />
                        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                            {t('docker.logs_loading')}
                        </Text>
                    </div>
                ) : (
                    <pre style={{
                        backgroundColor: '#1e1e1e',
                        color: '#d4d4d4',
                        padding: 16,
                        borderRadius: 8,
                        fontSize: 12,
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: '50vh',
                        overflow: 'auto',
                        margin: 0,
                    }}>
                        {logsContent}
                    </pre>
                )}
            </Modal>
        </div>
    );
};
