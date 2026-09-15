/**
 * SecurityManager Component
 * 
 * Centralized Security Panel for Linux Servers:
 * - UFW Firewall: toggle, default policies, rule management with presets.
 * - Fail2ban: active jails, live banned IP list, 1-click unban, and manual ban.
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
    Radio,
    Switch,
    Popconfirm,
    message,
    Tooltip,
    Dropdown,
    Empty,
    Segmented,
    Alert
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
    SafetyCertificateOutlined,
    LockOutlined,
    ReloadOutlined,
    PlusOutlined,
    DeleteOutlined,
    PoweroffOutlined,
    CopyOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
    DownOutlined,
    KeyOutlined
} from '@ant-design/icons';
import type {
    UfwStatus,
    UfwRule,
    AddUfwRuleOptions,
    Fail2banStatus,
    Fail2banJail
} from '../../types';

const { Text, Paragraph, Title } = Typography;

interface SecurityManagerProps {
    connectionId?: string;
}

interface BannedIpRow {
    key: string;
    ip: string;
    jail: string;
}

export const SecurityManager: React.FC<SecurityManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const { activeConnectionId, connections } = useConnection();
    const connectionId = propConnectionId || activeConnectionId;

    const currentConnection = useMemo(() => {
        return connections.find((c) => c.id === connectionId);
    }, [connections, connectionId]);

    const [activeTab, setActiveTab] = useState<'ufw' | 'fail2ban'>('ufw');
    const [loading, setLoading] = useState(false);

    // UFW State
    const [ufwStatus, setUfwStatus] = useState<UfwStatus | null>(null);
    const [ufwToggleLoading, setUfwToggleLoading] = useState(false);
    const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
    const [addRuleForm] = Form.useForm();
    const [deleteRuleLoading, setDeleteRuleLoading] = useState<Record<number, boolean>>({});

    // Fail2ban State
    const [fail2banStatus, setFail2banStatus] = useState<Fail2banStatus | null>(null);
    const [isBanModalOpen, setIsBanModalOpen] = useState(false);
    const [banForm] = Form.useForm();
    const [unbanLoading, setUnbanLoading] = useState<Record<string, boolean>>({});

    // Fetch UFW Status
    const fetchUfw = useCallback(async () => {
        if (!connectionId) return;
        try {
            const status = await window.ssm.securityUfwStatus(connectionId);
            setUfwStatus(status);
        } catch (err) {
            console.error('Failed to fetch UFW status:', err);
        }
    }, [connectionId]);

    // Fetch Fail2ban Status
    const fetchFail2ban = useCallback(async () => {
        if (!connectionId) return;
        try {
            const status = await window.ssm.securityFail2banStatus(connectionId);
            setFail2banStatus(status);
        } catch (err) {
            console.error('Failed to fetch Fail2ban status:', err);
        }
    }, [connectionId]);

    // Fetch all
    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchUfw(), fetchFail2ban()]);
        setLoading(false);
    }, [fetchUfw, fetchFail2ban]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(() => {
            if (activeTab === 'ufw') fetchUfw();
            else fetchFail2ban();
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchAll, fetchUfw, fetchFail2ban, activeTab]);

    // UFW Toggle Enable/Disable
    const handleToggleUfw = async (enable: boolean) => {
        if (!connectionId) return;
        setUfwToggleLoading(true);
        try {
            await window.ssm.securityUfwToggle(connectionId, enable ? 'enable' : 'disable');
            message.success(t('security.status_updated', { action: enable ? 'enable' : 'disable' }));
            await fetchUfw();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setUfwToggleLoading(false);
        }
    };

    // UFW Reload
    const handleReloadUfw = async () => {
        if (!connectionId) return;
        setUfwToggleLoading(true);
        try {
            await window.ssm.securityUfwToggle(connectionId, 'reload');
            message.success(t('security.status_updated', { action: 'reload' }));
            await fetchUfw();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setUfwToggleLoading(false);
        }
    };

    // Add Rule
    const handleAddRule = async () => {
        if (!connectionId) return;
        try {
            const values = await addRuleForm.validateFields();
            await window.ssm.securityUfwAddRule(connectionId, values);
            message.success(t('security.rule_added'));
            setIsAddRuleOpen(false);
            addRuleForm.resetFields();
            await fetchUfw();
        } catch (err) {
            if ((err as Error).message) {
                message.error((err as Error).message);
            }
        }
    };

    // Delete Rule
    const handleDeleteRule = async (ruleNumber: number) => {
        if (!connectionId) return;
        setDeleteRuleLoading((prev) => ({ ...prev, [ruleNumber]: true }));
        try {
            await window.ssm.securityUfwDeleteRule(connectionId, ruleNumber);
            message.success(t('security.rule_deleted', { number: ruleNumber }));
            await fetchUfw();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setDeleteRuleLoading((prev) => ({ ...prev, [ruleNumber]: false }));
        }
    };

    // Port Presets for UFW Modal
    const applyPortPreset = (port: string, comment: string) => {
        addRuleForm.setFieldsValue({
            port,
            proto: 'tcp',
            action: 'allow',
            comment,
        });
    };

    const presetMenuItems: MenuProps['items'] = [
        { key: 'ssh', label: t('security.preset_ssh'), onClick: () => applyPortPreset('22', 'SSH') },
        { key: 'http', label: t('security.preset_http'), onClick: () => applyPortPreset('80', 'Web HTTP') },
        { key: 'https', label: t('security.preset_https'), onClick: () => applyPortPreset('443', 'Web HTTPS') },
        { key: 'mysql', label: t('security.preset_mysql'), onClick: () => applyPortPreset('3306', 'MySQL') },
        { key: 'postgres', label: t('security.preset_postgres'), onClick: () => applyPortPreset('5432', 'PostgreSQL') },
        { key: 'redis', label: t('security.preset_redis'), onClick: () => applyPortPreset('6379', 'Redis') },
    ];

    // Fail2ban Unban
    const handleUnban = async (jail: string, ip: string) => {
        if (!connectionId) return;
        const key = `${jail}_${ip}`;
        setUnbanLoading((prev) => ({ ...prev, [key]: true }));
        try {
            await window.ssm.securityFail2banUnban(connectionId, jail, ip);
            message.success(t('security.unban_success', { jail, ip }));
            await fetchFail2ban();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setUnbanLoading((prev) => ({ ...prev, [key]: false }));
        }
    };

    // Fail2ban Manual Ban
    const handleBan = async () => {
        if (!connectionId) return;
        try {
            const values = await banForm.validateFields();
            await window.ssm.securityFail2banBan(connectionId, values.jail, values.ip);
            message.success(t('security.ban_success', { jail: values.jail, ip: values.ip }));
            setIsBanModalOpen(false);
            banForm.resetFields();
            await fetchFail2ban();
        } catch (err) {
            if ((err as Error).message) {
                message.error((err as Error).message);
            }
        }
    };

    // Flat list of banned IPs for table
    const bannedIpsList: BannedIpRow[] = useMemo(() => {
        if (!fail2banStatus?.jails) return [];
        const rows: BannedIpRow[] = [];
        for (const jail of fail2banStatus.jails) {
            for (const ip of jail.bannedIpList) {
                rows.push({
                    key: `${jail.name}_${ip}`,
                    ip,
                    jail: jail.name,
                });
            }
        }
        return rows;
    }, [fail2banStatus]);

    // Total Fail2ban counts
    const fail2banStats = useMemo(() => {
        if (!fail2banStatus?.jails) return { totalJails: 0, totalBanned: 0, currentBanned: 0, totalFailed: 0 };
        return {
            totalJails: fail2banStatus.jails.length,
            totalBanned: fail2banStatus.jails.reduce((acc, curr) => acc + curr.totalBanned, 0),
            currentBanned: fail2banStatus.jails.reduce((acc, curr) => acc + curr.currentlyBanned, 0),
            totalFailed: fail2banStatus.jails.reduce((acc, curr) => acc + curr.totalFailed, 0),
        };
    }, [fail2banStatus]);

    // UFW Table Columns
    const ufwColumns: ColumnsType<UfwRule> = [
        {
            title: t('security.rule_number'),
            dataIndex: 'number',
            key: 'number',
            width: 60,
            render: (val) => <Text strong>#{val}</Text>,
        },
        {
            title: t('security.action'),
            key: 'action',
            width: 140,
            render: (_, record) => {
                let color = 'default';
                if (record.action === 'ALLOW') color = 'success';
                else if (record.action === 'DENY') color = 'error';
                else if (record.action === 'REJECT') color = 'warning';
                else if (record.action === 'LIMIT') color = 'processing';

                return (
                    <Tag color={color} style={{ fontWeight: 600 }}>
                        {record.action} {record.direction}
                    </Tag>
                );
            },
        },
        {
            title: t('security.to_port'),
            dataIndex: 'to',
            key: 'to',
            render: (val) => <Text code>{val}</Text>,
        },
        {
            title: t('security.protocol'),
            key: 'proto',
            width: 90,
            render: (_, record) => (
                <Tag color={record.isV6 ? 'purple' : 'geekblue'}>
                    {record.isV6 ? 'IPv6' : 'IPv4'}
                </Tag>
            ),
        },
        {
            title: t('security.from_ip'),
            dataIndex: 'from',
            key: 'from',
            render: (val) => <Text>{val || t('security.anywhere')}</Text>,
        },
        {
            title: t('security.comment'),
            dataIndex: 'comment',
            key: 'comment',
            render: (val) => (val ? <Text type="secondary">{val}</Text> : '-'),
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 80,
            render: (_, record) => (
                <Popconfirm
                    title={t('security.confirm_delete_rule', { number: record.number })}
                    onConfirm={() => handleDeleteRule(record.number)}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                >
                    <Button
                        size="small"
                        danger
                        loading={deleteRuleLoading[record.number]}
                        icon={<DeleteOutlined />}
                    />
                </Popconfirm>
            ),
        },
    ];

    // Fail2ban Banned IPs Columns
    const fail2banColumns: ColumnsType<BannedIpRow> = [
        {
            title: t('security.ip_address'),
            dataIndex: 'ip',
            key: 'ip',
            render: (ip) => (
                <Space>
                    <Text code strong>{ip}</Text>
                    <Tooltip title={t('common.copy')}>
                        <Button
                            size="small"
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={() => {
                                navigator.clipboard.writeText(ip);
                                message.success(t('common.copied'));
                            }}
                        />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: t('security.jail'),
            dataIndex: 'jail',
            key: 'jail',
            width: 180,
            render: (jail) => <Tag color="blue">{jail}</Tag>,
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Button
                    size="small"
                    danger
                    loading={unbanLoading[record.key]}
                    onClick={() => handleUnban(record.jail, record.ip)}
                >
                    {t('security.unban')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 24, height: '100%', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        <SafetyCertificateOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                        {t('security.title')}
                    </Title>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                        {t('security.subtitle')}
                    </Paragraph>
                </div>
                <Space>
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={fetchAll}
                    >
                        {t('common.refresh')}
                    </Button>
                </Space>
            </div>

            {/* Navigation Segment */}
            <div style={{ marginBottom: 20 }}>
                <Segmented
                    value={activeTab}
                    onChange={(val) => setActiveTab(val as 'ufw' | 'fail2ban')}
                    options={[
                        {
                            label: (
                                <Space>
                                    <SafetyCertificateOutlined />
                                    <span>{t('security.tab_ufw')}</span>
                                    {ufwStatus?.installed && (
                                        <Badge
                                            status={ufwStatus.active ? 'success' : 'default'}
                                            style={{ marginLeft: 4 }}
                                        />
                                    )}
                                </Space>
                            ),
                            value: 'ufw',
                        },
                        {
                            label: (
                                <Space>
                                    <LockOutlined />
                                    <span>{t('security.tab_fail2ban')}</span>
                                    {fail2banStatus?.running && (
                                        <Tag color="error" style={{ marginLeft: 4, marginRight: 0 }}>
                                            {fail2banStats.currentBanned}
                                        </Tag>
                                    )}
                                </Space>
                            ),
                            value: 'fail2ban',
                        },
                    ]}
                />
            </div>

            {/* TAB 1: UFW FIREWALL */}
            {activeTab === 'ufw' && (
                <div>
                    {ufwStatus && !ufwStatus.installed ? (
                        <Card variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <div>
                                        <Text strong>{t('security.ufw_not_installed')}</Text>
                                        <br />
                                        <Text type="secondary">{t('security.ufw_install_hint')}</Text>
                                        <pre style={{ marginTop: 8, background: themeMode === 'dark' ? '#141414' : '#f0f0f0', padding: 8, borderRadius: 6 }}>
                                            sudo apt update && sudo apt install -y ufw
                                        </pre>
                                    </div>
                                }
                            />
                        </Card>
                    ) : (
                        <>
                            {/* Stat Cards */}
                            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.ufw_status')}</Text>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                                            <Badge
                                                status={ufwStatus?.active ? 'success' : 'default'}
                                                text={
                                                    <Text strong style={{ fontSize: 16 }}>
                                                        {ufwStatus?.active ? t('security.ufw_active') : t('security.ufw_inactive')}
                                                    </Text>
                                                }
                                            />
                                            <Switch
                                                checked={ufwStatus?.active}
                                                loading={ufwToggleLoading}
                                                onChange={handleToggleUfw}
                                            />
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.default_incoming')}</Text>
                                        <div style={{ marginTop: 8 }}>
                                            <Tag color={ufwStatus?.defaultIncoming === 'allow' ? 'warning' : 'success'} style={{ fontSize: 14, padding: '2px 8px' }}>
                                                {ufwStatus?.defaultIncoming?.toUpperCase() || 'DENY'}
                                            </Tag>
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.default_outgoing')}</Text>
                                        <div style={{ marginTop: 8 }}>
                                            <Tag color="blue" style={{ fontSize: 14, padding: '2px 8px' }}>
                                                {ufwStatus?.defaultOutgoing?.toUpperCase() || 'ALLOW'}
                                            </Tag>
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.rules_count')}</Text>
                                        <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                                            {ufwStatus?.rules.length || 0}
                                        </div>
                                    </Card>
                                </Col>
                            </Row>

                            {/* Action Bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <Space>
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={() => {
                                            addRuleForm.resetFields();
                                            setIsAddRuleOpen(true);
                                        }}
                                    >
                                        {t('security.add_rule')}
                                    </Button>
                                    <Dropdown menu={{ items: presetMenuItems }}>
                                        <Button icon={<KeyOutlined />}>
                                            Presets <DownOutlined />
                                        </Button>
                                    </Dropdown>
                                </Space>
                                <Button
                                    icon={<ReloadOutlined />}
                                    loading={ufwToggleLoading}
                                    onClick={handleReloadUfw}
                                >
                                    {t('security.ufw_reload')}
                                </Button>
                            </div>

                            {/* Rules Table */}
                            <Table
                                rowKey="number"
                                columns={ufwColumns}
                                dataSource={ufwStatus?.rules || []}
                                loading={loading}
                                pagination={{ pageSize: 15 }}
                                locale={{
                                    emptyText: <Empty description="Nenhuma regra configurada no UFW" />,
                                }}
                            />
                        </>
                    )}
                </div>
            )}

            {/* TAB 2: FAIL2BAN */}
            {activeTab === 'fail2ban' && (
                <div>
                    {fail2banStatus && !fail2banStatus.installed ? (
                        <Card variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <div>
                                        <Text strong>{t('security.fail2ban_not_installed')}</Text>
                                        <br />
                                        <Text type="secondary">{t('security.fail2ban_install_hint')}</Text>
                                        <pre style={{ marginTop: 8, background: themeMode === 'dark' ? '#141414' : '#f0f0f0', padding: 8, borderRadius: 6 }}>
                                            sudo apt update && sudo apt install -y fail2ban
                                        </pre>
                                    </div>
                                }
                            />
                        </Card>
                    ) : (
                        <>
                            {/* Stat Cards */}
                            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.fail2ban_status')}</Text>
                                        <div style={{ marginTop: 8 }}>
                                            <Badge
                                                status={fail2banStatus?.running ? 'success' : 'error'}
                                                text={
                                                    <Text strong style={{ fontSize: 16 }}>
                                                        {fail2banStatus?.running ? t('security.fail2ban_running') : t('security.fail2ban_stopped')}
                                                    </Text>
                                                }
                                            />
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.active_jails')}</Text>
                                        <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, color: '#1677ff' }}>
                                            {fail2banStats.totalJails}
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.banned_ips')}</Text>
                                        <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4, color: '#ff4d4f' }}>
                                            {fail2banStats.currentBanned}
                                        </div>
                                    </Card>
                                </Col>
                                <Col xs={24} sm={6}>
                                    <Card size="small" variant="borderless" style={{ background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa' }}>
                                        <Text type="secondary">{t('security.total_banned')}</Text>
                                        <div style={{ fontSize: 22, fontWeight: 'bold', marginTop: 4 }}>
                                            {fail2banStats.totalBanned}
                                        </div>
                                    </Card>
                                </Col>
                            </Row>

                            {/* Active Jails Chips */}
                            <Card
                                size="small"
                                title={t('security.active_jails')}
                                style={{ marginBottom: 20 }}
                                extra={
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<PlusOutlined />}
                                        onClick={() => {
                                            banForm.resetFields();
                                            setIsBanModalOpen(true);
                                        }}
                                    >
                                        {t('security.ban_ip')}
                                    </Button>
                                }
                            >
                                <Space wrap>
                                    {fail2banStatus?.jails.map((j) => (
                                        <Tag key={j.name} color={j.currentlyBanned > 0 ? 'red' : 'blue'} style={{ padding: '4px 10px', fontSize: 13 }}>
                                            <Space>
                                                <Text strong>{j.name}</Text>
                                                <Badge count={j.currentlyBanned} overflowCount={999} />
                                            </Space>
                                        </Tag>
                                    ))}
                                    {(!fail2banStatus?.jails || fail2banStatus.jails.length === 0) && (
                                        <Text type="secondary">Nenhuma jail ativa detectada</Text>
                                    )}
                                </Space>
                            </Card>

                            {/* Banned IPs Table */}
                            <Table
                                rowKey="key"
                                columns={fail2banColumns}
                                dataSource={bannedIpsList}
                                loading={loading}
                                pagination={{ pageSize: 10 }}
                                locale={{
                                    emptyText: <Empty description={t('security.no_banned_ips')} />,
                                }}
                            />
                        </>
                    )}
                </div>
            )}

            {/* Add UFW Rule Modal */}
            <Modal
                title={t('security.add_rule')}
                open={isAddRuleOpen}
                onOk={handleAddRule}
                onCancel={() => setIsAddRuleOpen(false)}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Alert
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message={t('security.ssh_warning', { port: currentConnection?.port || 22 })}
                    style={{ marginBottom: 16 }}
                />

                <Form
                    form={addRuleForm}
                    layout="vertical"
                    initialValues={{
                        action: 'allow',
                        proto: 'tcp',
                        from: '',
                    }}
                >
                    <Form.Item
                        name="port"
                        label={t('security.port_or_service')}
                        rules={[{ required: true, message: 'Informe a porta ou serviço' }]}
                    >
                        <Input placeholder={t('security.port_placeholder')} />
                    </Form.Item>

                    <Form.Item name="action" label={t('security.action')}>
                        <Radio.Group>
                            <Radio value="allow">{t('security.allow')}</Radio>
                            <Radio value="deny">{t('security.deny')}</Radio>
                            <Radio value="reject">{t('security.reject')}</Radio>
                            <Radio value="limit">{t('security.limit')}</Radio>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item name="proto" label={t('security.protocol')}>
                        <Radio.Group>
                            <Radio value="tcp">TCP</Radio>
                            <Radio value="udp">UDP</Radio>
                            <Radio value="any">Any (TCP/UDP)</Radio>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item
                        name="from"
                        label={t('security.from_ip')}
                        tooltip="Deixe em branco para permitir de qualquer origem (0.0.0.0/0)"
                    >
                        <Input placeholder={t('security.from_placeholder')} />
                    </Form.Item>

                    <Form.Item name="comment" label={t('security.comment')}>
                        <Input placeholder="ex: Servidor Web Producao" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Manual Ban Modal */}
            <Modal
                title={t('security.ban_ip')}
                open={isBanModalOpen}
                onOk={handleBan}
                onCancel={() => setIsBanModalOpen(false)}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form
                    form={banForm}
                    layout="vertical"
                    initialValues={{
                        jail: fail2banStatus?.jails[0]?.name || 'sshd',
                    }}
                >
                    <Form.Item
                        name="jail"
                        label={t('security.jail')}
                        rules={[{ required: true }]}
                    >
                        <Input placeholder="sshd" />
                    </Form.Item>

                    <Form.Item
                        name="ip"
                        label={t('security.ip_address')}
                        rules={[{ required: true, message: 'Informe o endereço IP a ser banido' }]}
                    >
                        <Input placeholder="192.0.2.1" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};
