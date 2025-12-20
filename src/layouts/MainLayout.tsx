/**
 * Main Layout Component
 * 
 * Uses Ant Design ProLayout for professional application layout.
 * Includes sidebar navigation, header, and content area.
 */

import React, { useState, useMemo } from 'react';
import {
    DashboardOutlined,
    CodeOutlined,
    FolderOutlined,
    SettingOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    PlusOutlined,
    CloudServerOutlined,
    InfoCircleOutlined,
    BulbOutlined,
    GlobalOutlined,
    ContainerOutlined,
    WindowsOutlined,
    LinuxOutlined,
} from '@ant-design/icons';
import { ProLayout, PageContainer } from '@ant-design/pro-components';
import { Button, Dropdown, Modal, Space, Typography, Divider, Radio, Form, App, Select, Input } from 'antd';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { useTheme } from '../context/ThemeContext';
import { useConnection } from '../context/ConnectionContext';
import { Dashboard } from '../components/dashboard/Dashboard';
import { TerminalManager } from '../components/terminal/TerminalManager';
import { FileManager } from '../components/files/FileManager';
import { ProcessManager } from '../components/processes/ProcessManager';
import { CronManager } from '../components/cron/CronManager';
import { DockerDashboard } from '../components/docker/DockerDashboard';
import { ConnectionModal } from '../components/modals/ConnectionModal';
import type { Connection } from '../types';
import splashScreen from '../assets/splash-screen.png';

const { Text } = Typography;

type TabKey = 'dashboard' | 'terminal' | 'files' | 'processes' | 'cron' | 'docker';

export const MainLayout: React.FC = () => {
    const { t, i18n } = useTranslation();
    const {
        connections,
        activeConnectionId,
        selectConnection,
        refreshConnections,
    } = useConnection();

    const { themeMode, setThemeMode } = useTheme();
    const { modal, message } = App.useApp();

    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
    const [collapsed, setCollapsed] = useState(false);
    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
    const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // Docker stacks directory setting
    const [stacksDirectory, setStacksDirectory] = useState<string>(() => {
        return localStorage.getItem('nautilus_stacks_dir') || '/tmp/nautilus-stacks';
    });

    // Save stacks directory to localStorage when it changes
    const handleStacksDirectoryChange = (value: string) => {
        setStacksDirectory(value);
        localStorage.setItem('nautilus_stacks_dir', value);
    };

    // Get active connection info
    const activeConnection = connections.find(c => c.id === activeConnectionId);

    // Connection dropdown menu items
    const connectionMenuItems: MenuProps['items'] = [
        {
            key: 'add',
            icon: <PlusOutlined />,
            label: t('common.new_connection'),
            onClick: () => {
                setEditingConnection(null);
                setIsConnectionModalOpen(true);
            },
        },
        { type: 'divider' },
        ...connections.map(conn => ({
            key: conn.id,
            icon: conn.connectionType === 'rdp' ? <WindowsOutlined style={{ color: '#0078d4' }} /> : <LinuxOutlined style={{ color: '#f57c00' }} />,
            label: (
                <Space>
                    <span>{conn.name}</span>
                    {conn.id === activeConnectionId && (
                        <Text type="success" style={{ fontSize: 12 }}>●</Text>
                    )}
                </Space>
            ),
            children: [
                {
                    key: `${conn.id}-connect`,
                    label: conn.connectionType === 'rdp' ? t('common.launch_rdp') : t('common.connect'),
                    onClick: async () => {
                        if (conn.connectionType === 'rdp') {
                            // RDP - just launch mstsc without changing layout
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
                            } catch (err) {
                                message.error(t('rdp.launch_failed', { error: (err as Error).message }));
                            }
                        } else {
                            // SSH - normal connection
                            selectConnection(conn.id);
                        }
                    },
                },
                {
                    key: `${conn.id}-edit`,
                    label: t('common.edit'),
                    onClick: () => {
                        setEditingConnection(conn);
                        setIsConnectionModalOpen(true);
                    },
                },
                {
                    key: `${conn.id}-delete`,
                    label: t('common.delete'),
                    danger: true,
                    onClick: async () => {
                        Modal.confirm({
                            title: t('common.delete_connection'),
                            content: t('common.confirm_delete_connection', { name: conn.name }),
                            okText: t('common.delete'),
                            okType: 'danger',
                            cancelText: t('common.cancel'),
                            onOk: async () => {
                                await window.ssm.removeConnection(conn.id);
                                refreshConnections();
                            },
                        });
                    },
                },
            ],
        })),
    ];

    // Render content based on active tab
    const renderContent = () => {
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
                    <Typography.Title level={4} type="secondary">
                        {t('common.no_connection_selected')}
                    </Typography.Title>
                    <Typography.Paragraph type="secondary">
                        {t('common.select_or_create_connection')}
                    </Typography.Paragraph>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        size="large"
                        onClick={() => {
                            setEditingConnection(null);
                            setIsConnectionModalOpen(true);
                        }}
                    >
                        {t('common.new_connection')}
                    </Button>
                </div>
            );
        }

        switch (activeTab) {
            case 'dashboard':
                return <Dashboard />;
            case 'terminal':
                return <TerminalManager />;
            case 'files':
                return <FileManager />;
            case 'processes':
                return <ProcessManager />;
            case 'cron':
                return <CronManager />;
            case 'docker':
                return <DockerDashboard stacksDirectory={stacksDirectory} onOpenSettings={openSettings} />;
            default:
                return <Dashboard />;
        }
    };

    // About modal
    const showAbout = () => {
        modal.info({
            title: t('common.about_nautilus'),
            content: (
                <div style={{ textAlign: 'center' }}>
                    <img
                        src={splashScreen}
                        alt="Nautilus"
                        style={{
                            maxWidth: '100%',
                            height: 'auto',
                            marginBottom: 24,
                            borderRadius: 8
                        }}
                    />
                    <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        <a href="https://github.com/ricardoborges/nautilus" target="_blank" rel="noopener noreferrer">
                            github.com/ricardoborges/nautilus
                        </a>
                    </Text>
                </div>
            ),
            okText: t('common.close'),
            width: 500,
        });
    };

    // Settings modal
    const openSettings = () => {
        setIsSettingsModalOpen(true);
    };

    return (
        <>
            {/* Custom Header */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                height: 56,
                background: themeMode === 'dark' ? '#141414' : '#fff',
                borderBottom: `1px solid ${themeMode === 'dark' ? '#303030' : '#f0f0f0'}`,
            }}>
                <Space>
                    <CloudServerOutlined style={{ fontSize: 20, color: '#1677ff' }} />
                    <Typography.Title level={5} style={{ margin: 0, color: themeMode === 'dark' ? '#fff' : undefined }}>
                        Nautilus
                    </Typography.Title>
                </Space>
                <Space size="middle">
                    <Dropdown menu={{ items: connectionMenuItems }} placement="bottomRight">
                        <Button type={activeConnection ? 'primary' : 'default'} size="large">
                            <Space>
                                <CloudServerOutlined />
                                {activeConnection ? activeConnection.name : t('common.select_connection')}
                            </Space>
                        </Button>
                    </Dropdown>
                    <Button
                        type="text"
                        icon={<InfoCircleOutlined />}
                        onClick={showAbout}
                    />
                </Space>
            </div>

            {/* ProLayout */}
            <div style={{ paddingTop: 56 }}>
                <ProLayout
                    title="Nautilus"
                    logo={<CloudServerOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                    layout="side"
                    navTheme={themeMode === 'dark' ? 'realDark' : 'light'}
                    splitMenus={false}
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    siderWidth={220}
                    fixSiderbar
                    headerRender={false}
                    menuProps={{
                        onClick: (info) => {
                            setActiveTab(info.key as TabKey);
                        },
                        selectedKeys: [activeTab],
                    }}
                    route={{
                        routes: [
                            {
                                path: '/dashboard',
                                name: t('common.dashboard'),
                                icon: <DashboardOutlined />,
                                key: 'dashboard',
                            },
                            {
                                path: '/terminal',
                                name: t('common.terminal'),
                                icon: <CodeOutlined />,
                                key: 'terminal',
                            },
                            {
                                path: '/files',
                                name: t('common.files'),
                                icon: <FolderOutlined />,
                                key: 'files',
                            },
                            {
                                path: '/processes',
                                name: t('common.processes'),
                                icon: <AppstoreOutlined />,
                                key: 'processes',
                            },
                            {
                                path: '/cron',
                                name: t('common.cron'),
                                icon: <ClockCircleOutlined />,
                                key: 'cron',
                            },
                            // Docker menu - always visible
                            {
                                path: '/docker',
                                name: t('common.docker'),
                                icon: <ContainerOutlined />,
                                key: 'docker',
                            },
                        ],
                    }}
                    menuFooterRender={(props) => {
                        if (props?.collapsed) return undefined;
                        return (
                            <div style={{ padding: '12px 16px', borderTop: `1px solid ${themeMode === 'dark' ? '#303030' : '#f0f0f0'}` }}>
                                <Button
                                    type="text"
                                    icon={<SettingOutlined />}
                                    block
                                    onClick={openSettings}
                                    style={{ textAlign: 'left' }}
                                >
                                    {t('common.settings')}
                                </Button>
                            </div>
                        );
                    }}
                >
                    <PageContainer
                        header={{ title: undefined, breadcrumb: {} }}
                        style={{ padding: 0, height: 'calc(100vh - 48px)', overflow: 'auto' }}
                    >
                        {renderContent()}
                    </PageContainer>
                </ProLayout>
            </div>

            {/* Connection Modal */}
            <ConnectionModal
                isOpen={isConnectionModalOpen}
                onClose={() => setIsConnectionModalOpen(false)}
                onSave={refreshConnections}
                connection={editingConnection}
            />

            {/* Settings Modal */}
            <Modal
                title={
                    <Space>
                        <SettingOutlined />
                        {t('common.settings')}
                    </Space>
                }
                open={isSettingsModalOpen}
                onCancel={() => setIsSettingsModalOpen(false)}
                footer={[
                    <Button key="about" onClick={showAbout}>
                        {t('common.about')}
                    </Button>,
                    <Button key="close" type="primary" onClick={() => setIsSettingsModalOpen(false)}>
                        {t('common.close')}
                    </Button>,
                ]}
                width={400}
            >
                <Form layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        label={
                            <Space>
                                <BulbOutlined />
                                {t('common.theme')}
                            </Space>
                        }
                    >
                        <Radio.Group
                            value={themeMode}
                            onChange={(e) => setThemeMode(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                        >
                            <Radio.Button value="light">☀️ {t('common.light')}</Radio.Button>
                            <Radio.Button value="dark">🌙 {t('common.dark')}</Radio.Button>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item
                        label={
                            <Space>
                                <GlobalOutlined />
                                {t('common.language')}
                            </Space>
                        }
                    >
                        <Select
                            value={i18n.language}
                            onChange={(value) => i18n.changeLanguage(value)}
                            style={{ width: '100%' }}
                            options={[
                                { value: 'en', label: 'English' },
                                { value: 'pt-BR', label: 'Português (Brasil)' },
                                { value: 'es', label: 'Español' },
                                { value: 'de', label: 'Deutsch' },
                                { value: 'it', label: 'Italiano' },
                                { value: 'fr', label: 'Français' },
                                { value: 'ja', label: '日本語' },
                                { value: 'zh', label: '中文' },
                                { value: 'ko', label: '한국어' },
                            ]}
                        />
                    </Form.Item>

                    <Divider>{t('common.docker')}</Divider>

                    <Form.Item
                        label={
                            <Space>
                                <ContainerOutlined />
                                {t('settings.stacks_directory')}
                            </Space>
                        }
                        help={t('settings.stacks_directory_help')}
                    >
                        <Input
                            value={stacksDirectory}
                            onChange={(e) => handleStacksDirectoryChange(e.target.value)}
                            placeholder="/tmp/nautilus-stacks"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};
