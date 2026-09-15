/**
 * PackageManager Component
 * 
 * OS software updates & security patch management.
 * Supports APT, DNF/YUM, APK, and Pacman with:
 * - Total vs Security CVE counts
 * - Reboot-required detection
 * - Cache refresh & batch / single package upgrades
 * - Execution log drawer
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
    Input,
    Segmented,
    Modal,
    Drawer,
    Alert,
    Tooltip,
    Popconfirm,
    message,
    Empty
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    SyncOutlined,
    ReloadOutlined,
    CloudDownloadOutlined,
    SafetyCertificateOutlined,
    SearchOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
    CopyOutlined,
    ClearOutlined
} from '@ant-design/icons';
import type { PackageUpdate, PackageUpdatesResult } from '../../types';

const { Text, Paragraph, Title } = Typography;

interface PackageManagerProps {
    connectionId?: string;
}

export const PackageManager: React.FC<PackageManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { activeConnectionId } = useConnection();
    const connectionId = propConnectionId || activeConnectionId;

    const [data, setData] = useState<PackageUpdatesResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [upgrading, setUpgrading] = useState(false);

    // Filter & Search
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'security'>('all');
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    // Upgrade output drawer
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerOutput, setDrawerOutput] = useState('');
    const [drawerTitle, setDrawerTitle] = useState('');

    // Fetch updates
    const fetchUpdates = useCallback(async () => {
        if (!connectionId) return;
        setLoading(true);
        try {
            const res = await window.ssm.packagesList(connectionId);
            setData(res);
            setSelectedRowKeys([]);
        } catch (err) {
            console.error('Failed to load packages list:', err);
            message.error((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [connectionId]);

    useEffect(() => {
        fetchUpdates();
    }, [fetchUpdates]);

    // Refresh cache
    const handleRefreshCache = async () => {
        if (!connectionId) return;
        setRefreshing(true);
        try {
            await window.ssm.packagesRefresh(connectionId);
            message.success(t('packages.refresh_success'));
            await fetchUpdates();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setRefreshing(false);
        }
    };

    // Run upgrade
    const handleUpgrade = async (packageNames?: string[]) => {
        if (!connectionId) return;
        const count = packageNames ? packageNames.length : (data?.totalUpdates || 0);
        setDrawerTitle(packageNames ? `Upgrading ${count} selected package(s)` : 'Upgrading all packages');
        setDrawerOutput('Starting upgrade in non-interactive mode...\nPlease wait...');
        setIsDrawerOpen(true);
        setUpgrading(true);

        try {
            const res = await window.ssm.packagesUpgrade(connectionId, packageNames);
            setDrawerOutput(res.output || 'Upgrade process completed with exit code 0.');
            message.success(t('packages.upgrade_success'));
            await fetchUpdates();
        } catch (err) {
            setDrawerOutput((prev) => `${prev}\n\n[ERROR]: ${(err as Error).message}`);
            message.error((err as Error).message);
        } finally {
            setUpgrading(false);
        }
    };

    // Filtered packages
    const filteredPackages = useMemo(() => {
        if (!data?.packages) return [];
        return data.packages.filter((pkg) => {
            const matchesSearch =
                !searchText ||
                pkg.name.toLowerCase().includes(searchText.toLowerCase()) ||
                (pkg.repository && pkg.repository.toLowerCase().includes(searchText.toLowerCase()));

            if (!matchesSearch) return false;
            if (filterType === 'security') return pkg.isSecurity;
            return true;
        });
    }, [data, searchText, filterType]);

    // Columns
    const columns: ColumnsType<PackageUpdate> = [
        {
            title: t('packages.package_name'),
            dataIndex: 'name',
            key: 'name',
            render: (name, record) => (
                <Space>
                    <Text strong>{name}</Text>
                    {record.isSecurity && (
                        <Tag color="error" icon={<SafetyCertificateOutlined />}>
                            {t('packages.type_security')}
                        </Tag>
                    )}
                </Space>
            ),
        },
        {
            title: t('packages.current_ver'),
            dataIndex: 'currentVersion',
            key: 'currentVersion',
            render: (ver) => <Text code>{ver}</Text>,
        },
        {
            title: t('packages.new_ver'),
            dataIndex: 'newVersion',
            key: 'newVersion',
            render: (ver) => (
                <Text code style={{ color: '#52c41a', fontWeight: 600 }}>
                    {ver}
                </Text>
            ),
        },
        {
            title: t('packages.repository'),
            dataIndex: 'repository',
            key: 'repository',
            render: (repo) => (repo ? <Tag>{repo}</Tag> : '-'),
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Popconfirm
                    title={`Atualizar pacote "${record.name}"?`}
                    onConfirm={() => handleUpgrade([record.name])}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                >
                    <Button size="small" type="link" icon={<CloudDownloadOutlined />}>
                        Upgrade
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    };

    return (
        <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        <SyncOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                        {t('packages.title')}
                    </Title>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                        {t('packages.subtitle')}
                    </Paragraph>
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined spin={refreshing} />}
                        loading={refreshing}
                        onClick={handleRefreshCache}
                    >
                        {t('packages.refresh_cache')}
                    </Button>
                    <Button
                        type="primary"
                        icon={<CloudDownloadOutlined />}
                        disabled={!data || data.totalUpdates === 0}
                        onClick={() => handleUpgrade()}
                    >
                        {t('packages.upgrade_all')}
                    </Button>
                </Space>
            </div>

            {/* Reboot Required Alert */}
            {data?.rebootRequired && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={
                        <Space direction="vertical" size={2}>
                            <Text strong>{t('packages.reboot_alert')}</Text>
                            {data.rebootPackages && data.rebootPackages.length > 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('packages.reboot_packages_tooltip')}{' '}
                                    {data.rebootPackages.slice(0, 5).join(', ')}
                                    {data.rebootPackages.length > 5 ? ` +${data.rebootPackages.length - 5} more` : ''}
                                </Text>
                            )}
                        </Space>
                    }
                    style={{ marginBottom: 20 }}
                />
            )}

            {/* Metric Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={6}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('packages.card_total')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>
                            {data?.totalUpdates ?? 0}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={6}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('packages.card_security')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4, color: (data?.securityUpdates || 0) > 0 ? '#ff4d4f' : '#52c41a' }}>
                            {data?.securityUpdates ?? 0}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={6}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('packages.card_regular')}</Text>
                        <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>
                            {(data?.totalUpdates || 0) - (data?.securityUpdates || 0)}
                        </div>
                    </Card>
                </Col>
                <Col xs={24} sm={6}>
                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                        <Text type="secondary">{t('packages.card_pm')}</Text>
                        <div style={{ marginTop: 8 }}>
                            <Tag color="geekblue" style={{ fontSize: 13, textTransform: 'uppercase', padding: '2px 8px' }}>
                                {data?.packageManager || 'Detecting...'}
                            </Tag>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Filter and Selection Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Space>
                    <Input
                        prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                        placeholder={t('packages.search_placeholder')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ width: 250 }}
                        allowClear
                    />
                    <Segmented
                        value={filterType}
                        onChange={(val) => setFilterType(val as 'all' | 'security')}
                        options={[
                            {
                                label: t('packages.filter_all', { count: data?.totalUpdates || 0 }),
                                value: 'all',
                            },
                            {
                                label: t('packages.filter_security', { count: data?.securityUpdates || 0 }),
                                value: 'security',
                            },
                        ]}
                    />
                </Space>

                {selectedRowKeys.length > 0 && (
                    <Button
                        type="primary"
                        icon={<CloudDownloadOutlined />}
                        onClick={() => handleUpgrade(selectedRowKeys as string[])}
                    >
                        {t('packages.upgrade_selected', { count: selectedRowKeys.length })}
                    </Button>
                )}
            </div>

            {/* Packages Table */}
            <Table
                rowKey="name"
                rowSelection={rowSelection}
                columns={columns}
                dataSource={filteredPackages}
                loading={loading}
                pagination={{ pageSize: 15 }}
                locale={{
                    emptyText: (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                                <div>
                                    <Text strong>{t('packages.no_updates')}</Text>
                                    <br />
                                    <Text type="secondary">{t('packages.no_updates_desc')}</Text>
                                </div>
                            }
                        />
                    ),
                }}
            />

            {/* Upgrade Output Drawer */}
            <Drawer
                title={drawerTitle}
                placement="right"
                width={600}
                open={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                extra={
                    <Space>
                        <Tooltip title={t('common.copy')}>
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => {
                                    navigator.clipboard.writeText(drawerOutput);
                                    message.success(t('common.copied'));
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="Limpar">
                            <Button
                                size="small"
                                icon={<ClearOutlined />}
                                onClick={() => setDrawerOutput('')}
                            />
                        </Tooltip>
                    </Space>
                }
            >
                <pre
                    style={{
                        margin: 0,
                        padding: 16,
                        height: '100%',
                        overflow: 'auto',
                        background: themeMode === 'dark' ? '#141414' : '#fafafa',
                        color: themeMode === 'dark' ? '#00ff66' : '#111',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                    }}
                >
                    {drawerOutput}
                </pre>
            </Drawer>
        </div>
    );
};
