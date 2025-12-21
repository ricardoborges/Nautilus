/**
 * Docker Dashboard Component - Portainer Style
 * 
 * Displays Docker containers, images, volumes, and networks.
 * UI inspired by Portainer for a professional container management experience.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
    Row,
    Col,
    Statistic,
    Modal,
    Tabs,
    Input,
    Popconfirm,
    Checkbox,
    theme,
    App,
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
    CloseCircleOutlined,
    LinkOutlined,
    WarningOutlined,
    SyncOutlined,
    CaretRightOutlined,
    PoweroffOutlined,
    AppstoreOutlined,
    ContainerOutlined,
    RocketOutlined,
} from '@ant-design/icons';
import { NewDeployModal } from './NewDeployModal';
import type { DockerContainer, DockerImage, DockerVolume, DockerNetwork, DockerStack } from '../../types';

const { Text, Title } = Typography;

// Status badge component similar to Portainer
const StatusBadge: React.FC<{ state: string; status: string }> = ({ state, status }) => {
    const { t } = useTranslation();

    // Check for unhealthy state in status string
    const isUnhealthy = status.toLowerCase().includes('unhealthy');
    const effectiveState = isUnhealthy ? 'unhealthy' : state;

    const stateConfig: Record<string, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
        running: {
            color: '#52c41a',
            bgColor: 'rgba(82, 196, 26, 0.15)',
            icon: <CheckCircleOutlined />,
            label: t('docker.running')
        },
        unhealthy: {
            color: '#faad14',
            bgColor: 'rgba(250, 173, 20, 0.15)',
            icon: <WarningOutlined />,
            label: t('docker.unhealthy')
        },
        exited: {
            color: '#8c8c8c',
            bgColor: 'rgba(140, 140, 140, 0.15)',
            icon: <StopOutlined />,
            label: t('docker.exited')
        },
        paused: {
            color: '#1677ff',
            bgColor: 'rgba(22, 119, 255, 0.15)',
            icon: <PauseCircleOutlined />,
            label: t('docker.paused')
        },
        restarting: {
            color: '#1677ff',
            bgColor: 'rgba(22, 119, 255, 0.15)',
            icon: <SyncOutlined spin />,
            label: t('docker.restarting_state')
        },
        dead: {
            color: '#ff4d4f',
            bgColor: 'rgba(255, 77, 79, 0.15)',
            icon: <CloseCircleOutlined />,
            label: t('docker.dead')
        },
        created: {
            color: '#8c8c8c',
            bgColor: 'rgba(140, 140, 140, 0.15)',
            icon: <ClockCircleOutlined />,
            label: t('docker.created_state')
        },
    };

    const config = stateConfig[effectiveState] || stateConfig.exited;

    return (
        <Tag
            style={{
                color: config.color,
                backgroundColor: config.bgColor,
                border: 'none',
                borderRadius: 4,
                padding: '2px 8px',
                fontWeight: 500,
                fontSize: 12,
            }}
            icon={config.icon}
        >
            {config.label}
        </Tag>
    );
};

// Ports display component
const PortsDisplay: React.FC<{ ports: string; hostIp: string }> = ({ ports, hostIp }) => {
    const { t } = useTranslation();

    if (!ports) return <Text type="secondary">-</Text>;

    // Parse port mappings from Docker format: "0.0.0.0:8080->80/tcp, 0.0.0.0:443->443/tcp"
    const portMappings = ports.split(',').map(p => p.trim());
    const links: React.ReactNode[] = [];

    portMappings.forEach((mapping, index) => {
        // Match pattern like "0.0.0.0:8080->80/tcp" or ":::8080->80/tcp"
        const match = mapping.match(/(?:[\d.:]+:)?(\d+)->(\d+)\/(\w+)/);
        if (match) {
            const hostPort = match[1];
            // containerPort = match[2] - not used in display
            const protocol = match[3];

            // Only create links for HTTP-compatible protocols (tcp)
            if (protocol === 'tcp') {
                links.push(
                    <Tooltip key={index} title={t('docker.open_in_browser')}>
                        <a
                            href={`http://${hostIp}:${hostPort}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                                e.preventDefault();
                                window.ssm.openExternal(`http://${hostIp}:${hostPort}`);
                            }}
                            style={{
                                color: '#1677ff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                marginRight: 8,
                            }}
                        >
                            <LinkOutlined style={{ fontSize: 12 }} />
                            {hostPort}
                        </a>
                    </Tooltip>
                );
            } else {
                links.push(
                    <Text key={index} type="secondary" style={{ marginRight: 8 }}>
                        {hostPort}/{protocol}
                    </Text>
                );
            }
        } else if (mapping) {
            // Fallback: just display the raw mapping
            links.push(
                <Text key={index} type="secondary" style={{ marginRight: 8 }}>
                    {mapping}
                </Text>
            );
        }
    });

    return links.length > 0 ? <>{links}</> : <Text type="secondary">-</Text>;
};

// Quick Actions component
const QuickActions: React.FC<{
    container: DockerContainer;
    onAction: (id: string, action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause' | 'kill') => void;
    onLogs: (id: string, name: string) => void;
    loading: string | null;
}> = ({ container, onAction, onLogs, loading }) => {
    const { t } = useTranslation();
    const isLoading = loading === container.id;
    const isRunning = container.state === 'running';
    const isPaused = container.state === 'paused';

    const iconStyle = { fontSize: 14 };

    return (
        <Space size={4}>
            {/* Logs button - always visible */}
            <Tooltip title={t('docker.logs')}>
                <Button
                    type="text"
                    size="small"
                    icon={<FileTextOutlined style={iconStyle} />}
                    onClick={() => onLogs(container.id, container.name)}
                    style={{ padding: '2px 6px' }}
                />
            </Tooltip>

            {isRunning && !isPaused && (
                <>
                    <Tooltip title={t('docker.stop')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<StopOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />}
                            loading={isLoading}
                            onClick={() => onAction(container.id, 'stop')}
                            style={{ padding: '2px 6px' }}
                        />
                    </Tooltip>
                    <Tooltip title={t('docker.restart')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined style={iconStyle} />}
                            loading={isLoading}
                            onClick={() => onAction(container.id, 'restart')}
                            style={{ padding: '2px 6px' }}
                        />
                    </Tooltip>
                    <Tooltip title={t('docker.pause')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<PauseCircleOutlined style={{ ...iconStyle, color: '#1677ff' }} />}
                            loading={isLoading}
                            onClick={() => onAction(container.id, 'pause')}
                            style={{ padding: '2px 6px' }}
                        />
                    </Tooltip>
                </>
            )}

            {isPaused && (
                <Tooltip title={t('docker.resume')}>
                    <Button
                        type="text"
                        size="small"
                        icon={<CaretRightOutlined style={{ ...iconStyle, color: '#52c41a' }} />}
                        loading={isLoading}
                        onClick={() => onAction(container.id, 'unpause')}
                        style={{ padding: '2px 6px' }}
                    />
                </Tooltip>
            )}

            {!isRunning && !isPaused && (
                <Tooltip title={t('docker.start')}>
                    <Button
                        type="text"
                        size="small"
                        icon={<PlayCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />}
                        loading={isLoading}
                        onClick={() => onAction(container.id, 'start')}
                        style={{ padding: '2px 6px' }}
                    />
                </Tooltip>
            )}
        </Space>
    );
};

interface DockerDashboardProps {
    connectionId?: string;
    stacksDirectory?: string;
    onOpenSettings?: () => void;
}

export const DockerDashboard: React.FC<DockerDashboardProps> = ({
    connectionId: propConnectionId,
    stacksDirectory = '/tmp/nautilus-stacks',
    onOpenSettings
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { modal, message: messageApi } = App.useApp();
    const { activeConnectionId: contextConnectionId, activeConnection, dockerAvailable } = useConnection();

    // Use prop connectionId if provided, otherwise fall back to context
    const activeConnectionId = propConnectionId ?? contextConnectionId;
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [images, setImages] = useState<DockerImage[]>([]);
    const [volumes, setVolumes] = useState<DockerVolume[]>([]);
    const [networks, setNetworks] = useState<DockerNetwork[]>([]);
    const [loading, setLoading] = useState(false);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [volumesLoading, setVolumesLoading] = useState(false);
    const [networksLoading, setNetworksLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Container selection and search state
    const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
    const [containerSearchText, setContainerSearchText] = useState('');

    // Image selection and search state
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [imageSearchText, setImageSearchText] = useState('');

    // Volume selection and search state
    const [selectedVolumes, setSelectedVolumes] = useState<string[]>([]);
    const [volumeSearchText, setVolumeSearchText] = useState('');

    // Network selection and search state
    const [selectedNetworks, setSelectedNetworks] = useState<string[]>([]);
    const [networkSearchText, setNetworkSearchText] = useState('');

    // Stacks state
    const [stacks, setStacks] = useState<DockerStack[]>([]);
    const [stacksLoading, setStacksLoading] = useState(false);
    const [selectedStacks, setSelectedStacks] = useState<string[]>([]);
    const [stackSearchText, setStackSearchText] = useState('');

    // Docker permission error state
    const [dockerPermissionError, setDockerPermissionError] = useState(false);

    // Logs modal state
    const [logsModalOpen, setLogsModalOpen] = useState(false);
    const [logsContent, setLogsContent] = useState('');
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsContainerName, setLogsContainerName] = useState('');
    const [logsContainerId, setLogsContainerId] = useState('');

    // New Deploy modal state
    const [deployModalOpen, setDeployModalOpen] = useState(false);

    // Helper to check for Docker permission errors
    const isDockerPermissionError = (error: unknown): boolean => {
        const errorMessage = String(error);
        return errorMessage.toLowerCase().includes('permission denied') &&
            errorMessage.toLowerCase().includes('docker');
    };

    // Get host IP for port links
    const hostIp = activeConnection?.host || 'localhost';

    const loadContainers = useCallback(async () => {
        if (!activeConnectionId) return;

        setLoading(true);
        try {
            const result = await window.ssm.dockerListContainers(activeConnectionId);
            setContainers(result);
            setDockerPermissionError(false);
        } catch (error) {
            console.error('Failed to load containers:', error);
            if (isDockerPermissionError(error)) {
                setDockerPermissionError(true);
            } else {
                messageApi.error(t('docker.load_error'));
            }
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
            if (isDockerPermissionError(error)) {
                setDockerPermissionError(true);
            } else {
                messageApi.error(t('docker.images_load_error'));
            }
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
            if (isDockerPermissionError(error)) {
                setDockerPermissionError(true);
            } else {
                messageApi.error(t('docker.volumes_load_error'));
            }
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
            if (isDockerPermissionError(error)) {
                setDockerPermissionError(true);
            } else {
                messageApi.error(t('docker.networks_load_error'));
            }
        } finally {
            setNetworksLoading(false);
        }
    }, [activeConnectionId, t]);

    const loadStacks = useCallback(async () => {
        if (!activeConnectionId) return;

        setStacksLoading(true);
        try {
            const data = await window.ssm.dockerListStacks(activeConnectionId);
            setStacks(data);
        } catch (error) {
            console.error('Failed to load stacks:', error);
            if (isDockerPermissionError(error)) {
                setDockerPermissionError(true);
            } else {
                messageApi.error(t('docker.stacks_load_error'));
            }
        } finally {
            setStacksLoading(false);
        }
    }, [activeConnectionId, t]);

    useEffect(() => {
        if (activeConnectionId && dockerAvailable) {
            loadContainers();
            loadImages();
            loadVolumes();
            loadNetworks();
            loadStacks();
        }
    }, [activeConnectionId, dockerAvailable, loadContainers, loadImages, loadVolumes, loadNetworks, loadStacks]);

    const handleAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove' | 'pause' | 'unpause' | 'kill') => {
        if (!activeConnectionId) return;

        setActionLoading(containerId);
        try {
            await window.ssm.dockerContainerAction(activeConnectionId, containerId, action);
            // Map unpause to resume for translation key
            const translationAction = action === 'unpause' ? 'resume' : action;
            messageApi.success(t(`docker.${translationAction}_success`));
            await loadContainers();
        } catch (error) {
            const err = error as Error;
            const translationAction = action === 'unpause' ? 'resume' : action;
            messageApi.error(t(`docker.${translationAction}_error`, { message: err.message }));
        } finally {
            setActionLoading(null);
        }
    };

    const confirmRemove = (containerId: string, containerName: string) => {
        modal.confirm({
            title: t('docker.remove_confirm_title'),
            content: t('docker.remove_confirm_content', { name: containerName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => handleAction(containerId, 'remove'),
        });
    };

    // Bulk action on selected containers
    const handleBulkAction = async (action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill') => {
        if (selectedContainers.length === 0) return;

        for (const containerId of selectedContainers) {
            await handleAction(containerId, action);
        }
        setSelectedContainers([]);
    };

    const handleBulkRemove = () => {
        if (selectedContainers.length === 0) return;
        modal.confirm({
            title: t('docker.remove_confirm_title'),
            content: t('docker.remove_selected_count', { count: selectedContainers.length }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                for (const containerId of selectedContainers) {
                    await handleAction(containerId, 'remove');
                }
                setSelectedContainers([]);
            },
        });
    };

    const handleImageAction = async (imageId: string, action: 'remove') => {
        if (!activeConnectionId) return;

        setActionLoading(imageId);
        try {
            await window.ssm.dockerImageAction(activeConnectionId, imageId, action);
            messageApi.success(t(`docker.image_${action}_success`));
            await loadImages();
        } catch (error) {
            const err = error as Error;
            messageApi.error(t(`docker.image_${action}_error`, { message: err.message }));
        } finally {
            setActionLoading(null);
        }
    };

    const confirmRemoveImage = (imageId: string, imageName: string) => {
        modal.confirm({
            title: t('docker.image_remove_confirm_title'),
            content: t('docker.image_remove_confirm_content', { name: imageName }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => handleImageAction(imageId, 'remove'),
        });
    };

    // Filtered containers based on search
    const filteredContainers = useMemo(() => {
        if (!containerSearchText) return containers;
        const search = containerSearchText.toLowerCase();
        return containers.filter(c =>
            c.name.toLowerCase().includes(search) ||
            c.image.toLowerCase().includes(search) ||
            c.state.toLowerCase().includes(search) ||
            (c.stack && c.stack.toLowerCase().includes(search))
        );
    }, [containers, containerSearchText]);

    // Filtered images based on search
    const filteredImages = useMemo(() => {
        if (!imageSearchText) return images;
        const search = imageSearchText.toLowerCase();
        return images.filter(img =>
            img.id.toLowerCase().includes(search) ||
            img.repository.toLowerCase().includes(search) ||
            img.tag.toLowerCase().includes(search)
        );
    }, [images, imageSearchText]);

    // Handle bulk remove selected images
    const removeSelectedImages = async () => {
        if (!activeConnectionId || selectedImages.length === 0) return;

        setActionLoading('bulk');
        let successCount = 0;
        const errors: string[] = [];

        for (const imageId of selectedImages) {
            try {
                await window.ssm.dockerImageAction(activeConnectionId, imageId, 'remove');
                successCount++;
            } catch (error) {
                const err = error as Error;
                errors.push(`${imageId.substring(0, 12)}: ${err.message}`);
            }
        }

        setSelectedImages([]);
        setActionLoading(null);
        await loadImages();

        if (successCount > 0) {
            messageApi.success(t('docker.images_removed_count', { count: successCount }));
        }
        if (errors.length > 0) {
            messageApi.error({
                content: errors.join('\n'),
                duration: 5,
            });
        }
    };

    // Filtered volumes based on search
    const filteredVolumes = useMemo(() => {
        if (!volumeSearchText) return volumes;
        const search = volumeSearchText.toLowerCase();
        return volumes.filter(vol =>
            vol.name.toLowerCase().includes(search) ||
            vol.driver.toLowerCase().includes(search) ||
            vol.mountpoint.toLowerCase().includes(search)
        );
    }, [volumes, volumeSearchText]);

    // Handle bulk remove selected volumes
    const removeSelectedVolumes = async () => {
        if (!activeConnectionId || selectedVolumes.length === 0) return;

        modal.confirm({
            title: t('docker.volume_remove_confirm_title'),
            content: t('docker.volume_remove_selected_count', { count: selectedVolumes.length }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                setActionLoading('bulk-volumes');
                let successCount = 0;
                const errors: string[] = [];

                for (const volumeName of selectedVolumes) {
                    try {
                        await window.ssm.dockerVolumeAction(activeConnectionId, volumeName, 'remove');
                        successCount++;
                    } catch (error) {
                        const err = error as Error;
                        errors.push(`${volumeName}: ${err.message}`);
                    }
                }

                setSelectedVolumes([]);
                setActionLoading(null);
                await loadVolumes();

                if (successCount > 0) {
                    messageApi.success(t('docker.volumes_removed_count', { count: successCount }));
                }
                if (errors.length > 0) {
                    messageApi.error({
                        content: errors.join('\n'),
                        duration: 5,
                    });
                }
            },
        });
    };

    // Filtered networks based on search
    const filteredNetworks = useMemo(() => {
        if (!networkSearchText) return networks;
        const search = networkSearchText.toLowerCase();
        return networks.filter(net =>
            net.name.toLowerCase().includes(search) ||
            net.driver.toLowerCase().includes(search) ||
            (net.stack && net.stack.toLowerCase().includes(search)) ||
            (net.subnet && net.subnet.toLowerCase().includes(search))
        );
    }, [networks, networkSearchText]);

    // Handle bulk remove selected networks
    const removeSelectedNetworks = async () => {
        if (!activeConnectionId || selectedNetworks.length === 0) return;

        modal.confirm({
            title: t('docker.network_remove_confirm_title'),
            content: t('docker.network_remove_selected_count', { count: selectedNetworks.length }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                setActionLoading('bulk-networks');
                let successCount = 0;
                const errors: string[] = [];

                for (const networkId of selectedNetworks) {
                    try {
                        await window.ssm.dockerNetworkAction(activeConnectionId, networkId, 'remove');
                        successCount++;
                    } catch (error) {
                        const err = error as Error;
                        errors.push(`${networkId}: ${err.message}`);
                    }
                }

                setSelectedNetworks([]);
                setActionLoading(null);
                await loadNetworks();

                if (successCount > 0) {
                    messageApi.success(t('docker.networks_removed_count', { count: successCount }));
                }
                if (errors.length > 0) {
                    messageApi.error({
                        content: errors.join('\n'),
                        duration: 5,
                    });
                }
            },
        });
    };

    // Filtered stacks based on search
    const filteredStacks = useMemo(() => {
        if (!stackSearchText) return stacks;
        const search = stackSearchText.toLowerCase();
        return stacks.filter(stack =>
            stack.name.toLowerCase().includes(search) ||
            stack.type.toLowerCase().includes(search)
        );
    }, [stacks, stackSearchText]);

    // Handle bulk remove selected stacks (placeholder - would need backend support)
    const removeSelectedStacks = async () => {
        if (selectedStacks.length === 0) return;
        messageApi.info(t('docker.stack_remove_not_implemented'));
        setSelectedStacks([]);
    };

    const openLogs = async (containerId: string, containerName: string) => {
        if (!activeConnectionId) return;

        setLogsContainerName(containerName);
        setLogsContainerId(containerId);
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

    const refreshLogs = async () => {
        if (!activeConnectionId || !logsContainerId) return;

        setLogsLoading(true);
        try {
            const logs = await window.ssm.dockerContainerLogs(activeConnectionId, logsContainerId, 500);
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

    if (!dockerAvailable || dockerPermissionError) {
        const username = activeConnection?.user || 'your-user';
        const commands = [
            `sudo usermod -aG docker ${username}`,
            'newgrp docker',
        ];

        const copyCommands = () => {
            navigator.clipboard.writeText(commands.join('\n'));
            messageApi.success(t('common.copied'));
        };

        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: 48,
                maxWidth: 600,
                margin: '0 auto',
                textAlign: 'center',
            }}>
                <ContainerOutlined style={{ fontSize: 64, color: '#8b8b8b', marginBottom: 24 }} />
                <Title level={4} type="secondary">
                    {dockerPermissionError ? t('docker.permission_denied') : t('docker.engine_not_found')}
                </Title>
                <Text type="secondary" style={{ marginTop: 16, marginBottom: 24 }}>
                    {t('docker.engine_not_found_hint')}
                </Text>

                {/* Terminal-style command card */}
                <div style={{
                    width: '100%',
                    maxWidth: 500,
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: 8,
                    position: 'relative',
                }}>
                    {/* Copy button */}
                    <Tooltip title={t('common.copy')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<FileTextOutlined style={{ color: '#888' }} />}
                            onClick={copyCommands}
                            style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                            }}
                        />
                    </Tooltip>
                    {/* Terminal content */}
                    <div style={{
                        padding: '16px 40px 16px 16px',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        fontSize: 13,
                        lineHeight: 1.8,
                        textAlign: 'left',
                    }}>
                        {commands.map((cmd, index) => (
                            <div key={index}>
                                <Text style={{ color: '#27ca3f' }}>$ </Text>
                                <Text style={{ color: '#e0e0e0' }}>{cmd}</Text>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Statistics
    const runningCount = containers.filter(c => c.state === 'running').length;
    const stoppedCount = containers.filter(c => c.state === 'exited').length;
    const totalCount = containers.length;
    const imagesCount = images.length;
    const volumesCount = volumes.length;
    const networksCount = networks.length;
    const stacksCount = stacks.length;

    // Format created date to be more readable
    const formatCreatedDate = (created: string): string => {
        // Docker format: "2025-12-15 17:08:25 -0300 -03"
        const match = created.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
        if (match) {
            return `${match[1]} ${match[2]}`;
        }
        return created;
    };

    const containerColumns = [
        {
            title: t('docker.container_name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a: DockerContainer, b: DockerContainer) => a.name.localeCompare(b.name),
            render: (name: string) => <Text strong style={{ color: token.colorPrimary }}>{name}</Text>,
        },
        {
            title: t('docker.state'),
            dataIndex: 'state',
            key: 'state',
            width: 120,
            filters: [
                { text: t('docker.running'), value: 'running' },
                { text: t('docker.exited'), value: 'exited' },
                { text: t('docker.paused'), value: 'paused' },
            ],
            onFilter: (value: unknown, record: DockerContainer) => record.state === value,
            render: (_: string, record: DockerContainer) => <StatusBadge state={record.state} status={record.status} />,
        },
        {
            title: t('docker.quick_actions'),
            key: 'quickActions',
            width: 140,
            render: (_: unknown, record: DockerContainer) => (
                <QuickActions
                    container={record}
                    onAction={handleAction}
                    onLogs={openLogs}
                    loading={actionLoading}
                />
            ),
        },
        {
            title: t('docker.stack'),
            dataIndex: 'stack',
            key: 'stack',
            width: 120,
            sorter: (a: DockerContainer, b: DockerContainer) => (a.stack || '').localeCompare(b.stack || ''),
            render: (stack: string) => stack ? <Text>{stack}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: t('docker.image'),
            dataIndex: 'image',
            key: 'image',
            ellipsis: true,
            sorter: (a: DockerContainer, b: DockerContainer) => a.image.localeCompare(b.image),
            render: (image: string) => (
                <Tooltip title={image}>
                    <Text style={{ color: token.colorPrimary, cursor: 'pointer' }} ellipsis>
                        {image}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 160,
            sorter: (a: DockerContainer, b: DockerContainer) => a.created.localeCompare(b.created),
            render: (created: string) => <Text type="secondary">{formatCreatedDate(created)}</Text>,
        },
        {
            title: t('docker.ip_address'),
            dataIndex: 'ipAddress',
            key: 'ipAddress',
            width: 120,
            render: (ip: string) => ip ? <Text code style={{ fontSize: 12 }}>{ip}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: t('docker.published_ports'),
            dataIndex: 'ports',
            key: 'ports',
            render: (ports: string) => <PortsDisplay ports={ports} hostIp={hostIp} />,
        },
    ];

    const imageColumns = [
        {
            title: t('docker.image_id'),
            dataIndex: 'id',
            key: 'id',
            width: 280,
            sorter: (a: DockerImage, b: DockerImage) => a.id.localeCompare(b.id),
            render: (id: string, record: DockerImage) => {
                const isUnused = record.repository === '<none>' || record.tag === '<none>';
                return (
                    <Space>
                        <Tooltip title={id}>
                            <Text code style={{ fontSize: 12, color: '#8b8b8b' }}>
                                {id.startsWith('sha256:') ? id.substring(0, 19) + '...' : id.substring(0, 12)}
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
            ellipsis: true,
            sorter: (a: DockerImage, b: DockerImage) => {
                const aName = `${a.repository}:${a.tag}`;
                const bName = `${b.repository}:${b.tag}`;
                return aName.localeCompare(bName);
            },
            render: (_: unknown, record: DockerImage) => {
                if (record.repository === '<none>' || record.tag === '<none>') {
                    return <Text type="secondary">-</Text>;
                }
                const fullTag = `${record.repository}:${record.tag}`;
                return (
                    <Tooltip title={fullTag}>
                        <Tag color="geekblue" style={{ fontSize: 12, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fullTag}
                        </Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: t('docker.size'),
            dataIndex: 'size',
            key: 'size',
            width: 110,
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
            width: 200,
            sorter: (a: DockerImage, b: DockerImage) => a.created.localeCompare(b.created),
            render: (created: string) => <Text style={{ whiteSpace: 'nowrap' }}>{formatCreatedDate(created)}</Text>,
        },
    ];

    const volumeColumns = [
        {
            title: t('docker.volume_name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a: DockerVolume, b: DockerVolume) => a.name.localeCompare(b.name),
            render: (name: string) => (
                <Text strong style={{ color: token.colorPrimary }}>
                    {name}
                </Text>
            ),
        },
        {
            title: t('docker.driver'),
            dataIndex: 'driver',
            key: 'driver',
            width: 100,
            sorter: (a: DockerVolume, b: DockerVolume) => a.driver.localeCompare(b.driver),
            render: (driver: string) => <Tag>{driver}</Tag>,
        },
        {
            title: t('docker.size'),
            dataIndex: 'size',
            key: 'size',
            width: 100,
            sorter: (a: DockerVolume, b: DockerVolume) => (a.size || '').localeCompare(b.size || ''),
            render: (size: string) => (
                <Text style={{ fontFamily: 'monospace' }}>{size || '-'}</Text>
            ),
        },
        {
            title: t('docker.mountpoint'),
            dataIndex: 'mountpoint',
            key: 'mountpoint',
            ellipsis: true,
            sorter: (a: DockerVolume, b: DockerVolume) => a.mountpoint.localeCompare(b.mountpoint),
            render: (mp: string) => (
                <Tooltip title={mp}>
                    <Text code style={{ fontSize: 11 }}>
                        {mp}
                    </Text>
                </Tooltip>
            ),
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 180,
            sorter: (a: DockerVolume, b: DockerVolume) => (a.created || '').localeCompare(b.created || ''),
            render: (created: string) => created ? (
                <Text style={{ whiteSpace: 'nowrap' }}>{created}</Text>
            ) : (
                <Text type="secondary">-</Text>
            ),
        },
    ];

    const networkColumns = [
        {
            title: t('docker.network_name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a: DockerNetwork, b: DockerNetwork) => a.name.localeCompare(b.name),
            render: (name: string, record: DockerNetwork) => (
                <Space size={4}>
                    <Text strong style={{ color: token.colorPrimary }}>
                        {name}
                    </Text>
                    {record.isSystem && (
                        <Tag color="cyan" style={{ marginLeft: 4, fontSize: 10 }}>
                            System
                        </Tag>
                    )}
                </Space>
            ),
        },
        {
            title: t('docker.stack'),
            dataIndex: 'stack',
            key: 'stack',
            width: 120,
            sorter: (a: DockerNetwork, b: DockerNetwork) => (a.stack || '').localeCompare(b.stack || ''),
            render: (stack: string) => stack ? <Text>{stack}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: t('docker.driver'),
            dataIndex: 'driver',
            key: 'driver',
            width: 100,
            sorter: (a: DockerNetwork, b: DockerNetwork) => a.driver.localeCompare(b.driver),
            render: (driver: string) => <Text>{driver}</Text>,
        },
        {
            title: t('docker.attachable'),
            dataIndex: 'attachable',
            key: 'attachable',
            width: 100,
            sorter: (a: DockerNetwork, b: DockerNetwork) => Number(a.attachable) - Number(b.attachable),
            render: (attachable: boolean) => <Text>{attachable ? 'true' : 'false'}</Text>,
        },
        {
            title: t('docker.ipam_driver'),
            dataIndex: 'ipamDriver',
            key: 'ipamDriver',
            width: 110,
            render: (ipamDriver: string) => <Text>{ipamDriver || 'default'}</Text>,
        },
        {
            title: t('docker.ipv4_subnet'),
            dataIndex: 'subnet',
            key: 'subnet',
            width: 140,
            sorter: (a: DockerNetwork, b: DockerNetwork) => (a.subnet || '').localeCompare(b.subnet || ''),
            render: (subnet: string) => subnet ? <Text code style={{ fontSize: 11 }}>{subnet}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: t('docker.ipv4_gateway'),
            dataIndex: 'gateway',
            key: 'gateway',
            width: 130,
            sorter: (a: DockerNetwork, b: DockerNetwork) => (a.gateway || '').localeCompare(b.gateway || ''),
            render: (gateway: string) => gateway ? <Text code style={{ fontSize: 11 }}>{gateway}</Text> : <Text type="secondary">-</Text>,
        },
    ];

    const stackColumns = [
        {
            title: t('docker.stack_name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a: DockerStack, b: DockerStack) => a.name.localeCompare(b.name),
            render: (name: string) => (
                <Text strong style={{ color: token.colorPrimary }}>
                    {name}
                </Text>
            ),
        },
        {
            title: t('docker.type'),
            dataIndex: 'type',
            key: 'type',
            width: 120,
            sorter: (a: DockerStack, b: DockerStack) => a.type.localeCompare(b.type),
            render: (type: string) => <Text>{type}</Text>,
        },
        {
            title: t('docker.control'),
            dataIndex: 'control',
            key: 'control',
            width: 120,
            render: (control: string) => (
                <Space size={4}>
                    <Text>{control}</Text>
                    <Tooltip title={t('docker.limited_control_desc')}>
                        <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 12 }} />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('docker.created'),
            dataIndex: 'created',
            key: 'created',
            width: 180,
            sorter: (a: DockerStack, b: DockerStack) => a.created.localeCompare(b.created),
            render: (created: string) => created ? (
                <Text style={{ whiteSpace: 'nowrap' }}>{formatCreatedDate(created)}</Text>
            ) : (
                <Text type="secondary">-</Text>
            ),
        },
    ];

    // Toolbar buttons for bulk actions (Portainer style)
    const ContainerToolbar = () => (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
        }}>
            <Space wrap>
                <Input
                    placeholder={t('docker.search_containers')}
                    prefix={<SearchOutlined style={{ color: '#8b8b8b' }} />}
                    value={containerSearchText}
                    onChange={(e) => setContainerSearchText(e.target.value)}
                    allowClear
                    style={{ width: 250 }}
                />
            </Space>
            <Space wrap>
                <Button
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleBulkAction('start')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.start')}
                </Button>
                <Button
                    icon={<StopOutlined />}
                    onClick={() => handleBulkAction('stop')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.stop')}
                </Button>
                <Button
                    icon={<PoweroffOutlined />}
                    onClick={() => handleBulkAction('kill')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.kill')}
                </Button>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={() => handleBulkAction('restart')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.restart')}
                </Button>
                <Button
                    icon={<PauseCircleOutlined />}
                    onClick={() => handleBulkAction('pause')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.pause')}
                </Button>
                <Button
                    icon={<CaretRightOutlined />}
                    onClick={() => handleBulkAction('unpause')}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.resume')}
                </Button>
                <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleBulkRemove}
                    disabled={selectedContainers.length === 0}
                >
                    {t('docker.remove')}
                </Button>
                <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={loadContainers}
                    loading={loading}
                >
                    {t('common.refresh')}
                </Button>
            </Space>
        </div>
    );

    return (
        <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
            {/* New Deploy Button - Always visible */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 16,
            }}>
                <Button
                    type="primary"
                    icon={<RocketOutlined />}
                    onClick={() => setDeployModalOpen(true)}
                    size="large"
                    style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                    }}
                >
                    {t('docker.deploy.new_deploy')}
                </Button>
            </div>

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
                                    <ContainerToolbar />
                                    {loading && containers.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_containers')}
                                            </Text>
                                        </div>
                                    ) : filteredContainers.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={containerSearchText ? t('docker.no_containers_match') : t('docker.no_containers')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={filteredContainers}
                                            columns={containerColumns}
                                            rowKey="id"
                                            size="middle"
                                            loading={loading}
                                            rowSelection={{
                                                selectedRowKeys: selectedContainers,
                                                onChange: (keys) => setSelectedContainers(keys as string[]),
                                            }}
                                            pagination={{
                                                pageSize: 10,
                                                showSizeChanger: true,
                                                pageSizeOptions: ['10', '25', '50'],
                                                showTotal: (total, range) =>
                                                    t('docker.items_range', { start: range[0], end: range[1], total }),
                                            }}
                                            scroll={{ x: 1200 }}
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
                                    {/* Toolbar */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 16,
                                        gap: 16,
                                    }}>
                                        <Input
                                            placeholder={t('docker.search_volumes')}
                                            prefix={<SearchOutlined style={{ color: '#8b8b8b' }} />}
                                            value={volumeSearchText}
                                            onChange={(e) => setVolumeSearchText(e.target.value)}
                                            allowClear
                                            style={{ maxWidth: 300 }}
                                        />
                                        <Space>
                                            <Button
                                                danger
                                                icon={<DeleteOutlined />}
                                                disabled={selectedVolumes.length === 0}
                                                onClick={removeSelectedVolumes}
                                            >
                                                {t('docker.remove')} {selectedVolumes.length > 0 && `(${selectedVolumes.length})`}
                                            </Button>
                                            <Button
                                                type="primary"
                                                icon={<ReloadOutlined />}
                                                onClick={() => {
                                                    setSelectedVolumes([]);
                                                    loadVolumes();
                                                }}
                                                loading={volumesLoading}
                                            >
                                                {t('common.refresh')}
                                            </Button>
                                        </Space>
                                    </div>
                                    {volumesLoading && volumes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_volumes')}
                                            </Text>
                                        </div>
                                    ) : filteredVolumes.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={volumeSearchText ? t('docker.no_volumes_match') : t('docker.no_volumes')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={filteredVolumes}
                                            columns={volumeColumns}
                                            rowKey="name"
                                            size="middle"
                                            loading={volumesLoading}
                                            rowSelection={{
                                                selectedRowKeys: selectedVolumes,
                                                onChange: (keys) => setSelectedVolumes(keys as string[]),
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
                            key: 'networks',
                            label: (
                                <Space>
                                    <GlobalOutlined />
                                    {t('docker.networks')} ({networksCount})
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
                                            placeholder={t('docker.search_networks')}
                                            prefix={<SearchOutlined style={{ color: '#8b8b8b' }} />}
                                            value={networkSearchText}
                                            onChange={(e) => setNetworkSearchText(e.target.value)}
                                            allowClear
                                            style={{ maxWidth: 300 }}
                                        />
                                        <Space>
                                            <Button
                                                danger
                                                icon={<DeleteOutlined />}
                                                disabled={selectedNetworks.length === 0}
                                                onClick={removeSelectedNetworks}
                                            >
                                                {t('docker.remove')} {selectedNetworks.length > 0 && `(${selectedNetworks.length})`}
                                            </Button>
                                            <Button
                                                type="primary"
                                                icon={<ReloadOutlined />}
                                                onClick={() => {
                                                    setSelectedNetworks([]);
                                                    loadNetworks();
                                                }}
                                                loading={networksLoading}
                                            >
                                                {t('common.refresh')}
                                            </Button>
                                        </Space>
                                    </div>
                                    {networksLoading && networks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_networks')}
                                            </Text>
                                        </div>
                                    ) : filteredNetworks.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={networkSearchText ? t('docker.no_networks_match') : t('docker.no_networks')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={filteredNetworks}
                                            columns={networkColumns}
                                            rowKey="id"
                                            size="middle"
                                            loading={networksLoading}
                                            rowSelection={{
                                                selectedRowKeys: selectedNetworks,
                                                onChange: (keys) => setSelectedNetworks(keys as string[]),
                                            }}
                                            pagination={{
                                                pageSize: 10,
                                                showSizeChanger: true,
                                                pageSizeOptions: ['10', '25', '50'],
                                                showTotal: (total, range) =>
                                                    t('docker.items_range', { start: range[0], end: range[1], total }),
                                            }}
                                            scroll={{ x: 1000 }}
                                        />
                                    )}
                                </>
                            ),
                        },
                        {
                            key: 'stacks',
                            label: (
                                <Space>
                                    <AppstoreOutlined />
                                    {t('docker.stacks')} ({stacksCount})
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
                                            placeholder={t('docker.search_stacks')}
                                            prefix={<SearchOutlined style={{ color: '#8b8b8b' }} />}
                                            value={stackSearchText}
                                            onChange={(e) => setStackSearchText(e.target.value)}
                                            allowClear
                                            style={{ maxWidth: 300 }}
                                        />
                                        <Space>
                                            <Button
                                                danger
                                                icon={<DeleteOutlined />}
                                                disabled={selectedStacks.length === 0}
                                                onClick={removeSelectedStacks}
                                            >
                                                {t('docker.remove')} {selectedStacks.length > 0 && `(${selectedStacks.length})`}
                                            </Button>
                                            <Button
                                                type="primary"
                                                icon={<ReloadOutlined />}
                                                onClick={() => {
                                                    setSelectedStacks([]);
                                                    loadStacks();
                                                }}
                                                loading={stacksLoading}
                                            >
                                                {t('common.refresh')}
                                            </Button>
                                        </Space>
                                    </div>
                                    {stacksLoading && stacks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 48 }}>
                                            <Spin size="large" />
                                            <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                                                {t('docker.loading_stacks')}
                                            </Text>
                                        </div>
                                    ) : filteredStacks.length === 0 ? (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={stackSearchText ? t('docker.no_stacks_match') : t('docker.no_stacks')}
                                        />
                                    ) : (
                                        <Table
                                            dataSource={filteredStacks}
                                            columns={stackColumns}
                                            rowKey="name"
                                            size="middle"
                                            loading={stacksLoading}
                                            rowSelection={{
                                                selectedRowKeys: selectedStacks,
                                                onChange: (keys) => setSelectedStacks(keys as string[]),
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
                    <Button key="refresh" icon={<ReloadOutlined />} onClick={refreshLogs} loading={logsLoading}>
                        {t('common.refresh')}
                    </Button>,
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

            {/* New Deploy Modal */}
            {activeConnectionId && (
                <NewDeployModal
                    open={deployModalOpen}
                    onClose={() => setDeployModalOpen(false)}
                    connectionId={activeConnectionId}
                    stacksDirectory={stacksDirectory}
                    onOpenSettings={onOpenSettings}
                    onDeploySuccess={() => {
                        loadContainers();
                        loadStacks();
                    }}
                />
            )}
        </div>
    );
};
