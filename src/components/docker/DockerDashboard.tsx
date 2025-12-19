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
    Input,
    Popconfirm,
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
    DatabaseOutlined,
    GlobalOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import type { DockerContainer, DockerImage, DockerVolume, DockerNetwork } from '../../types';

const { Text, Title } = Typography;

export const DockerDashboard: React.FC = () => {
    const { t } = useTranslation();
    const { activeConnectionId, dockerAvailable } = useConnection();
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [images, setImages] = useState<DockerImage[]>([]);
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [loading, setLoading] = useState(false);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [volumesLoading, setVolumesLoading] = useState(false);
    const [networksLoading, setNetworksLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Image selection and search state
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [imageSearchText, setImageSearchText] = useState('');

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

    const loadVolumes = useCallback(async () => {
        if (!activeConnectionId) return;

        setVolumesLoading(true);
        try {
            const result = await window.ssm.dockerListVolumes(activeConnectionId);
            setVolumes(result);
        } catch (error) {
            console.error('Failed to load volumes:', error);
            message.error(t('docker.volumes_load_error'));
        } finally {
            setVolumesLoading(false);
        }
    }, [activeConnectionId, t]);

    const loadNetworks = useCallback(async () => {
        if (!activeConnectionId) return;

        setNetworksLoading(true);
        try {
            const result = await window.ssm.dockerListNetworks(activeConnectionId);
            setNetworks(result);
        } catch (error) {
            console.error('Failed to load networks:', error);
            message.error(t('docker.networks_load_error'));
        } finally {
            setNetworksLoading(false);
        }
    }, [activeConnectionId, t]);

    useEffect(() => {
        if (activeConnectionId && dockerAvailable) {
            loadContainers();
            loadImages();
            loadVolumes();
            loadNetworks();
        }
    }, [activeConnectionId, dockerAvailable, loadContainers, loadImages, loadVolumes, loadNetworks]);

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

    // Filtered images based on search
    const filteredImages = images.filter(img => {
        if (!imageSearchText) return true;
        const search = imageSearchText.toLowerCase();
        return (
            img.id.toLowerCase().includes(search) ||
            img.repository.toLowerCase().includes(search) ||
            img.tag.toLowerCase().includes(search)
        );
    });

    // Handle bulk remove selected images
    const removeSelectedImages = async () => {
        if (!activeConnectionId || selectedImages.length === 0) return;

        setActionLoading('bulk');
        let successCount = 0;
        let errorCount = 0;

        for (const imageId of selectedImages) {
            try {
                await window.ssm.dockerImageAction(activeConnectionId, imageId, 'remove');
                successCount++;
            } catch {
                errorCount++;
            }
        }

        setSelectedImages([]);
        setActionLoading(null);
        await loadImages();

        if (successCount > 0) {
            message.success(t('docker.images_removed_count', { count: successCount }));
        }
        if (errorCount > 0) {
            message.warning(t('docker.images_remove_errors', { count: errorCount }));
        }
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
    const volumesCount = volumes.length;
    const networksCount = networks.length;

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
            title: t('docker.image_id'),
            dataIndex: 'id',
            key: 'id',
            sorter: (a: DockerImage, b: DockerImage) => a.id.localeCompare(b.id),
            render: (id: string, record: DockerImage) => {
                const isUnused = record.repository === '<none>' || record.tag === '<none>';
                return (
                    <Space>
                        <Tooltip title={id}>
                            <Text code style={{ fontSize: 12, color: '#8b8b8b' }}>
                                {id.startsWith('sha256:') ? id.substring(0, 30) + '...' : id.substring(0, 12)}
                            </Text>
                        </Tooltip>
                        {isUnused && (
                            <Tag color="orange" style={{ marginLeft: 8 }}>
                                {t('docker.unused')}
                            </Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: t('docker.tags'),
            key: 'tags',
            sorter: (a: DockerImage, b: DockerImage) => {
                const aName = `${a.repository}:${a.tag}`;
                const bName = `${b.repository}:${b.tag}`;
                return aName.localeCompare(bName);
            },
            render: (_: unknown, record: DockerImage) => {
                if (record.repository === '<none>' || record.tag === '<none>') {
                    return null;
                }
                return (
                    <Tag color="geekblue" style={{ fontSize: 12 }}>
                        {record.repository}:{record.tag}
                    </Tag>
                );
            },
        },
        {
            title: t('docker.size'),
            dataIndex: 'size',
            key: 'size',
            width: 100,
            align: 'right' as const,
            sorter: (a: DockerImage, b: DockerImage) => {
                // Parse size strings like "49 MB", "1.2 GB"
                const parseSize = (s: string): number => {
                    const match = s.match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
                    if (!match) return 0;
                    const val = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    const multipliers: Record<string, number> = { KB: 1, MB: 1024, GB: 1024 * 1024, TB: 1024 * 1024 * 1024 };
                    return val * (multipliers[unit] || 1);
                };
                return parseSize(a.size) - parseSize(b.size);
            },
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 180,
            sorter: (a: DockerImage, b: DockerImage) => a.created.localeCompare(b.created),
        },
    ];

    const volumeColumns = [
        {
            title: t('docker.volume_name'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: t('docker.driver'),
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: string) => <Tag>{driver}</Tag>,
        },
        {
            title: t('docker.mountpoint'),
            dataIndex: 'mountpoint',
            key: 'mountpoint',
            render: (mp: string) => (
                <Tooltip title={mp}>
                    <Text code style={{ fontSize: 11 }} ellipsis>
                        {mp.length > 40 ? `...${mp.slice(-40)}` : mp}
                    </Text>
                </Tooltip>
            ),
        },
    ];

    const networkColumns = [
        {
            title: t('docker.network_name'),
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: t('docker.network_id'),
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
            title: t('docker.driver'),
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: string) => <Tag color="blue">{driver}</Tag>,
        },
        {
            title: t('docker.scope'),
            dataIndex: 'scope',
            key: 'scope',
            render: (scope: string) => <Tag color={scope === 'local' ? 'green' : 'orange'}>{scope}</Tag>,
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
                                    {/* Toolbar */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 16,
                                        gap: 16,
                                    }}>
                                        <Input
                                            placeholder={t('docker.search_images')}
                                            prefix={<SearchOutlined style={{ color: '#8b8b8b' }} />}
                                            value={imageSearchText}
                                            onChange={(e) => setImageSearchText(e.target.value)}
                                            allowClear
                                            style={{ maxWidth: 300 }}
                                        />
                                        <Space>
                                            <Popconfirm
                                                title={t('docker.remove_selected_confirm')}
                                                description={t('docker.remove_selected_count', { count: selectedImages.length })}
                                                onConfirm={removeSelectedImages}
                                                disabled={selectedImages.length === 0}
                                                okText={t('common.delete')}
                                                cancelText={t('common.cancel')}
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Button
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    disabled={selectedImages.length === 0}
                                                    loading={actionLoading === 'bulk'}
                                                >
                                                    {t('docker.remove')} {selectedImages.length > 0 && `(${selectedImages.length})`}
                                                </Button>
                                            </Popconfirm>
                                            <Button
                                                type="primary"
                                                icon={<ReloadOutlined />}
                                                onClick={() => {
                                                    setSelectedImages([]);
                                                    loadImages();
                                                }}
                                                loading={imagesLoading}
                                            >
                                                {t('common.refresh')}
                                            </Button>
                                        </Space>
                                    </div>
                                    {imagesLoading && images.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_images')}
                                            </Text>
                                        </div>
                                    ) : filteredImages.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={imageSearchText ? t('docker.no_images_match') : t('docker.no_images')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={filteredImages}
                                            columns={imageColumns}
                                            rowKey="id"
                                            size="middle"
                                            loading={imagesLoading}
                                            rowSelection={{
                                                selectedRowKeys: selectedImages,
                                                onChange: (keys) => setSelectedImages(keys as string[]),
                                            }}
                                            pagination={{
                                                pageSize: 10,
                                                showSizeChanger: true,
                                                pageSizeOptions: ['10', '25', '50'],
                                                showTotal: (total, range) =>
                                                    t('docker.items_range', { start: range[0], end: range[1], total }),
                                            }}
                                        />
                                    )}
                                </>
                            ),
                        },
                        {
                            key: 'volumes',
                            label: (
                                <Space>
                                    <DatabaseOutlined />
                                    {t('docker.volumes')} ({volumesCount})
                                </Space>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={loadVolumes}
                                            loading={volumesLoading}
                                        >
                                            {t('common.refresh')}
                                        </Button>
                                    </div>
                                    {volumesLoading && volumes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_volumes')}
                                            </Text>
                                        </div>
                                    ) : volumes.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={t('docker.no_volumes')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={volumes}
                                            columns={volumeColumns}
                                            rowKey="name"
                                            pagination={false}
                                            size="middle"
                                            loading={volumesLoading}
                                        />
                                    )}
                                </>
                            ),
                        },
                        {
                            key: 'networks',
                            label: (
                                <Space>
                                    <GlobalOutlined />
                                    {t('docker.networks')} ({networksCount})
                                </Space>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                                        <Button
                                            type="primary"
                                            icon={<ReloadOutlined />}
                                            onClick={loadNetworks}
                                            loading={networksLoading}
                                        >
                                            {t('common.refresh')}
                                        </Button>
                                    </div>
                                    {networksLoading && networks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_networks')}
                                            </Text>
                                        </div>
                                    ) : networks.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={t('docker.no_networks')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={networks}
                                            columns={networkColumns}
                                            rowKey="id"
                                            pagination={false}
                                            size="middle"
                                            loading={networksLoading}
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
