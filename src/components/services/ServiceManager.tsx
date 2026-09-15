/**
 * ServiceManager Component
 * 
 * Lists and manages systemd services on remote Linux machines.
 * Supports start/stop/restart, enable/disable at boot, inspection of status,
 * and quick jump to the Central Log Viewer.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import {
    Table,
    Input,
    Segmented,
    Button,
    Tag,
    Badge,
    Space,
    Typography,
    Card,
    Row,
    Col,
    Drawer,
    Popconfirm,
    message,
    Empty,
    Spin,
    Tooltip
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    SearchOutlined,
    ReloadOutlined,
    PlayCircleOutlined,
    PoweroffOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
    FileSearchOutlined,
    WarningOutlined,
    ControlOutlined
} from '@ant-design/icons';
import type { SystemdService, ServiceAction } from '../../types';

const { Text, Paragraph, Title } = Typography;

interface ServiceManagerProps {
    connectionId?: string;
    onNavigateToLogs?: (serviceName: string) => void;
}

export const ServiceManager: React.FC<ServiceManagerProps> = ({
    connectionId: propConnectionId,
    onNavigateToLogs
}) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { activeConnectionId: contextConnectionId } = useConnection();

    const activeConnectionId = propConnectionId ?? contextConnectionId;

    const [services, setServices] = useState<SystemdService[]>([]);
    const [isSupported, setIsSupported] = useState<boolean>(true);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [searchText, setSearchText] = useState<string>('');
    const [filterState, setFilterState] = useState<string>('all');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Details drawer state
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
    const [selectedService, setSelectedService] = useState<SystemdService | null>(null);
    const [statusOutput, setStatusOutput] = useState<string>('');
    const [statusLoading, setStatusLoading] = useState<boolean>(false);

    const isDark = themeMode === 'dark';

    // Load services list
    const loadServices = useCallback(async () => {
        if (!activeConnectionId) return;
        setIsLoading(true);
        try {
            const result = await window.ssm.servicesList(activeConnectionId);
            setIsSupported(result.supported);
            setServices(result.services || []);
        } catch (err) {
            console.error('Failed to load systemd services:', err);
            message.error(t('services.action_error', { action: t('common.loading'), error: (err as Error).message }));
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId, t]);

    useEffect(() => {
        loadServices();
    }, [loadServices]);

    // Handle service action
    const handleAction = async (serviceName: string, action: ServiceAction) => {
        if (!activeConnectionId) return;
        setActionLoading(`${serviceName}:${action}`);
        try {
            await window.ssm.servicesAction(activeConnectionId, serviceName, action);
            message.success(t('services.action_success', { action: t(`services.${action}`), name: serviceName }));
            await loadServices();
        } catch (err) {
            message.error(t('services.action_error', { action: t(`services.${action}`), error: (err as Error).message }));
        } finally {
            setActionLoading(null);
        }
    };

    // Open status drawer
    const openStatusDrawer = async (service: SystemdService) => {
        if (!activeConnectionId) return;
        setSelectedService(service);
        setDrawerOpen(true);
        setStatusLoading(true);
        setStatusOutput('');
        try {
            const res = await window.ssm.servicesStatus(activeConnectionId, service.name);
            setStatusOutput(res.status);
        } catch (err) {
            setStatusOutput((err as Error).message || 'Error fetching status');
        } finally {
            setStatusLoading(false);
        }
    };

    // Filtered services
    const filteredServices = useMemo(() => {
        return services.filter((svc) => {
            const matchesSearch =
                svc.name.toLowerCase().includes(searchText.toLowerCase()) ||
                svc.description.toLowerCase().includes(searchText.toLowerCase());

            if (!matchesSearch) return false;

            if (filterState === 'all') return true;
            if (filterState === 'active') return svc.activeState === 'active';
            if (filterState === 'failed') return svc.activeState === 'failed';
            if (filterState === 'inactive') return svc.activeState === 'inactive' || svc.activeState === 'deactivating';
            return true;
        });
    }, [services, searchText, filterState]);

    // Stats calculations
    const stats = useMemo(() => {
        const total = services.length;
        const active = services.filter((s) => s.activeState === 'active').length;
        const failed = services.filter((s) => s.activeState === 'failed').length;
        const inactive = services.filter((s) => s.activeState === 'inactive' || s.activeState === 'deactivating').length;
        return { total, active, failed, inactive };
    }, [services]);

    const columns: ColumnsType<SystemdService> = [
        {
            title: t('services.col_name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string, record: SystemdService) => (
                <div>
                    <Text strong style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}>
                        {name}
                    </Text>
                    {record.description && (
                        <div style={{ fontSize: 12, color: isDark ? '#8c8c8c' : '#8c8c8c', marginTop: 2 }}>
                            {record.description}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: t('services.col_state'),
            dataIndex: 'activeState',
            key: 'activeState',
            width: 140,
            filters: [
                { text: t('services.active'), value: 'active' },
                { text: t('services.failed'), value: 'failed' },
                { text: t('services.inactive'), value: 'inactive' },
            ],
            onFilter: (value, record) => record.activeState === value,
            render: (state: string) => {
                if (state === 'active') {
                    return <Badge status="success" text={<Text type="success">{t('services.active')}</Text>} />;
                }
                if (state === 'failed') {
                    return <Badge status="error" text={<Text type="danger" strong>{t('services.failed')}</Text>} />;
                }
                return <Badge status="default" text={<Text type="secondary">{t('services.inactive')}</Text>} />;
            },
        },
        {
            title: t('services.col_substate'),
            dataIndex: 'subState',
            key: 'subState',
            width: 130,
            render: (sub: string) => {
                let color = 'default';
                if (sub === 'running') color = 'green';
                else if (sub === 'failed') color = 'red';
                else if (sub === 'exited') color = 'blue';
                return <Tag color={color}>{sub}</Tag>;
            },
        },
        {
            title: t('services.col_enabled'),
            dataIndex: 'enabledState',
            key: 'enabledState',
            width: 140,
            render: (enabled?: string) => {
                if (enabled === 'enabled') return <Tag color="success">{t('services.enable')}d</Tag>;
                if (enabled === 'disabled') return <Tag>{t('services.disable')}d</Tag>;
                if (enabled === 'static') return <Tag color="cyan">static</Tag>;
                if (enabled === 'masked') return <Tag color="magenta">masked</Tag>;
                return <Tag>{enabled || 'unknown'}</Tag>;
            },
        },
        {
            title: t('services.col_actions'),
            key: 'actions',
            width: 220,
            render: (_, record: SystemdService) => {
                const isOperating = actionLoading?.startsWith(record.name);
                const isRunning = record.activeState === 'active';
                const isEnabled = record.enabledState === 'enabled';

                return (
                    <Space size="small">
                        <Popconfirm
                            title={t('services.confirm_action', { action: t('services.restart'), name: record.name })}
                            onConfirm={() => handleAction(record.name, 'restart')}
                            okText={t('common.yes')}
                            cancelText={t('common.no')}
                        >
                            <Tooltip title={t('services.restart')}>
                                <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    loading={actionLoading === `${record.name}:restart`}
                                    disabled={isOperating}
                                />
                            </Tooltip>
                        </Popconfirm>

                        <Popconfirm
                            title={t('services.confirm_action', {
                                action: isRunning ? t('services.stop') : t('services.start'),
                                name: record.name
                            })}
                            onConfirm={() => handleAction(record.name, isRunning ? 'stop' : 'start')}
                            okText={t('common.yes')}
                            cancelText={t('common.no')}
                        >
                            <Tooltip title={isRunning ? t('services.stop') : t('services.start')}>
                                <Button
                                    size="small"
                                    danger={isRunning}
                                    type={isRunning ? 'default' : 'primary'}
                                    icon={isRunning ? <PoweroffOutlined /> : <PlayCircleOutlined />}
                                    loading={actionLoading === `${record.name}:${isRunning ? 'stop' : 'start'}`}
                                    disabled={isOperating}
                                />
                            </Tooltip>
                        </Popconfirm>

                        <Tooltip title={isEnabled ? t('services.disable') : t('services.enable')}>
                            <Button
                                size="small"
                                onClick={() => handleAction(record.name, isEnabled ? 'disable' : 'enable')}
                                loading={actionLoading === `${record.name}:${isEnabled ? 'disable' : 'enable'}`}
                                disabled={isOperating}
                            >
                                {isEnabled ? 'Off' : 'On'}
                            </Button>
                        </Tooltip>

                        <Tooltip title={t('services.status')}>
                            <Button
                                size="small"
                                icon={<InfoCircleOutlined />}
                                onClick={() => openStatusDrawer(record)}
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    if (!isSupported) {
        return (
            <div style={{ padding: 48, textAlign: 'center' }}>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <Space direction="vertical">
                            <Text strong style={{ fontSize: 16 }}>{t('services.title')}</Text>
                            <Text type="secondary">{t('services.not_supported')}</Text>
                        </Space>
                    }
                />
            </div>
        );
    }

    return (
        <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Stats Cards */}
            <Row gutter={16}>
                <Col span={6}>
                    <Card size="small" style={{ background: isDark ? '#1f1f1f' : '#fff' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{t('services.total')}</Text>
                        <div style={{ fontSize: 20, fontWeight: 'bold' }}>{stats.total}</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" style={{ background: isDark ? '#1f1f1f' : '#fff' }}>
                        <Text type="success" style={{ fontSize: 12 }}>
                            <CheckCircleOutlined style={{ marginRight: 6 }} />
                            {t('services.active')}
                        </Text>
                        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>{stats.active}</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" style={{ background: isDark ? '#1f1f1f' : '#fff' }}>
                        <Text type="danger" style={{ fontSize: 12 }}>
                            <CloseCircleOutlined style={{ marginRight: 6 }} />
                            {t('services.failed')}
                        </Text>
                        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#ff4d4f' }}>{stats.failed}</div>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card size="small" style={{ background: isDark ? '#1f1f1f' : '#fff' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <ExclamationCircleOutlined style={{ marginRight: 6 }} />
                            {t('services.inactive')}
                        </Text>
                        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#8c8c8c' }}>{stats.inactive}</div>
                    </Card>
                </Col>
            </Row>

            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Space size="middle">
                    <Input
                        placeholder={t('services.search_placeholder')}
                        prefix={<SearchOutlined />}
                        allowClear
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 320 }}
                    />
                    <Segmented
                        options={[
                            { label: `${t('services.all')} (${stats.total})`, value: 'all' },
                            { label: `${t('services.active')} (${stats.active})`, value: 'active' },
                            {
                                label: (
                                    <span>
                                        {t('services.failed')}{' '}
                                        {stats.failed > 0 && <Badge count={stats.failed} size="small" />}
                                    </span>
                                ),
                                value: 'failed'
                            },
                            { label: `${t('services.inactive')} (${stats.inactive})`, value: 'inactive' },
                        ]}
                        value={filterState}
                        onChange={(val) => setFilterState(val as string)}
                    />
                </Space>

                <Button icon={<ReloadOutlined />} onClick={loadServices} loading={isLoading}>
                    {t('common.refresh')}
                </Button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={filteredServices}
                    rowKey="name"
                    loading={isLoading}
                    pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '30', '50', '100'] }}
                    size="small"
                />
            </div>

            {/* Status Details Drawer */}
            <Drawer
                title={selectedService ? t('services.status_modal_title', { name: selectedService.name }) : t('services.status')}
                placement="right"
                width={640}
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                extra={
                    selectedService && onNavigateToLogs ? (
                        <Button
                            type="primary"
                            icon={<FileSearchOutlined />}
                            onClick={() => {
                                setDrawerOpen(false);
                                onNavigateToLogs(selectedService.name);
                            }}
                        >
                            {t('services.view_logs')}
                        </Button>
                    ) : null
                }
            >
                {statusLoading ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" />
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {selectedService && (
                            <Card size="small" style={{ background: isDark ? '#141414' : '#fafafa' }}>
                                <Paragraph style={{ margin: 0 }}>
                                    <Text strong>{selectedService.description || selectedService.name}</Text>
                                </Paragraph>
                                <Space size="small" style={{ marginTop: 8 }}>
                                    <Tag color={selectedService.activeState === 'active' ? 'green' : 'red'}>
                                        {selectedService.activeState} ({selectedService.subState})
                                    </Tag>
                                    <Tag>{selectedService.enabledState || 'boot status unknown'}</Tag>
                                </Space>
                            </Card>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text strong>systemctl status output:</Text>
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={() => selectedService && openStatusDrawer(selectedService)}
                            >
                                {t('common.refresh')}
                            </Button>
                        </div>

                        <pre
                            style={{
                                background: isDark ? '#0d1117' : '#f6f8fa',
                                color: isDark ? '#c9d1d9' : '#24292e',
                                padding: 12,
                                borderRadius: 6,
                                overflowX: 'auto',
                                fontFamily: 'Consolas, monospace',
                                fontSize: 12,
                                lineHeight: 1.5,
                                maxHeight: 'calc(100vh - 280px)',
                            }}
                        >
                            {statusOutput || 'No output received.'}
                        </pre>
                    </div>
                )}
            </Drawer>
        </div>
    );
};
