/**
 * ConnectionPane Component
 * 
 * Encapsulates the full UI for a single connection.
 * Contains sidebar navigation and content area with isolated state.
 */

import React, { useState } from 'react';
import { Layout, Menu, Button, Tooltip, Modal, Typography, Space, message } from 'antd';
import {
    DashboardOutlined,
    CodeOutlined,
    FolderOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    ContainerOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    ThunderboltOutlined,
    DownloadOutlined,
    GithubOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Dashboard } from '../dashboard/Dashboard';
import { TerminalManager } from '../terminal/TerminalManager';
import { FileManager } from '../files/FileManager';
import { ProcessManager } from '../processes/ProcessManager';
import { CronManager } from '../cron/CronManager';
import { DockerDashboard } from '../docker/DockerDashboard';
import { terminalService } from '../../hooks/useTerminal';

const LZY_CLI_INSTALL_COMMAND = 'sudo pip install lzycli';

const { Sider, Content } = Layout;

type TabKey = 'dashboard' | 'terminal' | 'files' | 'processes' | 'cron' | 'docker';

interface ConnectionPaneProps {
    connectionId: string;
    isVisible: boolean;
    stacksDirectory: string;
    onOpenSettings: () => void;
}

export const ConnectionPane: React.FC<ConnectionPaneProps> = ({
    connectionId,
    isVisible,
    stacksDirectory,
    onOpenSettings,
}) => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
    const [collapsed, setCollapsed] = useState(false);
    const [lzyModalOpen, setLzyModalOpen] = useState(false);

    const handleInstallLzyCli = () => {
        setActiveTab('terminal');
        setLzyModalOpen(false);
        // Aguarda a aba do terminal montar/ficar ativa antes de enviar o comando
        setTimeout(() => {
            if (!terminalService.isReady) {
                message.warning(t('lzy_cli.terminal_not_ready'));
                return;
            }
            terminalService.writeToActive(LZY_CLI_INSTALL_COMMAND + '\n');
            message.success(t('lzy_cli.command_sent'));
        }, 300);
    };

    const isDark = themeMode === 'dark';

    const menuItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: t('common.dashboard'),
        },
        {
            key: 'terminal',
            icon: <CodeOutlined />,
            label: t('common.terminal'),
        },
        {
            key: 'files',
            icon: <FolderOutlined />,
            label: t('common.files'),
        },
        {
            key: 'processes',
            icon: <AppstoreOutlined />,
            label: t('common.processes'),
        },
        {
            key: 'cron',
            icon: <ClockCircleOutlined />,
            label: t('common.cron'),
        },
        {
            key: 'docker',
            icon: <ContainerOutlined />,
            label: t('common.docker'),
        },
        {
            key: 'lzy-cli',
            icon: <ThunderboltOutlined />,
            label: 'Lzy-CLI',
        },
    ];

    const tabStyle = (tab: TabKey): React.CSSProperties => ({
        display: activeTab === tab ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
    });

    return (
        <Layout style={{
            height: '100%',
            background: 'transparent',
            display: isVisible ? 'flex' : 'none'
        }}>
            <div style={{ position: 'relative' }}>
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    width={200}
                    collapsedWidth={48}
                    theme={isDark ? 'dark' : 'light'}
                    trigger={null}
                    style={{
                        background: isDark ? '#141414' : '#fff',
                        borderRight: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
                        height: '100%',
                    }}
                >
                    <Menu
                        mode="inline"
                        selectedKeys={[activeTab]}
                        onClick={(info) => {
                            if (info.key === 'lzy-cli') {
                                setLzyModalOpen(true);
                                return;
                            }
                            setActiveTab(info.key as TabKey);
                        }}
                        items={menuItems}
                        theme={isDark ? 'dark' : 'light'}
                        style={{
                            border: 'none',
                            background: 'transparent',
                        }}
                    />
                </Sider>

                {/* Collapse toggle button on the edge */}
                <Tooltip title={collapsed ? t('common.expand') : t('common.collapse')} placement="right">
                    <Button
                        type="text"
                        size="small"
                        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        onClick={() => setCollapsed(!collapsed)}
                        style={{
                            position: 'absolute',
                            right: -12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 10,
                            width: 24,
                            height: 24,
                            minWidth: 24,
                            padding: 0,
                            borderRadius: '50%',
                            background: isDark ? '#303030' : '#fff',
                            border: `1px solid ${isDark ? '#434343' : '#d9d9d9'}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    />
                </Tooltip>
            </div>

            <Content style={{
                overflow: 'hidden',
                background: isDark ? '#1f1f1f' : '#f5f5f5',
            }}>
                <div style={tabStyle('dashboard')}>
                    <Dashboard connectionId={connectionId} />
                </div>
                <div style={tabStyle('terminal')}>
                    <TerminalManager connectionId={connectionId} />
                </div>
                <div style={tabStyle('files')}>
                    <FileManager connectionId={connectionId} />
                </div>
                <div style={tabStyle('processes')}>
                    <ProcessManager connectionId={connectionId} />
                </div>
                <div style={tabStyle('cron')}>
                    <CronManager connectionId={connectionId} />
                </div>
                <div style={tabStyle('docker')}>
                    <DockerDashboard
                        connectionId={connectionId}
                        stacksDirectory={stacksDirectory}
                        onOpenSettings={onOpenSettings}
                    />
                </div>
            </Content>

            <Modal
                title={
                    <Space>
                        <ThunderboltOutlined style={{ color: '#faad14' }} />
                        <span>{t('lzy_cli.title')}</span>
                    </Space>
                }
                open={lzyModalOpen}
                onCancel={() => setLzyModalOpen(false)}
                width={560}
                footer={[
                    <Button
                        key="github"
                        icon={<GithubOutlined />}
                        onClick={() => window.open('https://github.com/ricardoborges/lzy-cli', '_blank', 'noopener,noreferrer')}
                    >
                        {t('lzy_cli.view_on_github')}
                    </Button>,
                    <Button
                        key="install"
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={handleInstallLzyCli}
                    >
                        {t('lzy_cli.install')}
                    </Button>,
                ]}
            >
                <Typography.Paragraph>
                    {t('lzy_cli.description')}
                </Typography.Paragraph>
                <Typography.Title level={5} style={{ marginTop: 16 }}>
                    {t('lzy_cli.what_it_does')}
                </Typography.Title>
                <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
                    <li>{t('lzy_cli.feature_1')}</li>
                    <li>{t('lzy_cli.feature_2')}</li>
                    <li>{t('lzy_cli.feature_3')}</li>
                </ul>
                <Typography.Title level={5}>
                    {t('lzy_cli.install_command')}
                </Typography.Title>
                <div
                    style={{
                        background: isDark ? '#1e1e1e' : '#f5f5f5',
                        color: isDark ? '#d4d4d4' : '#262626',
                        padding: '12px 14px',
                        borderRadius: 6,
                        fontFamily: 'Consolas, "Cascadia Code", monospace',
                        fontSize: 13,
                        border: `1px solid ${isDark ? '#303030' : '#e8e8e8'}`,
                    }}
                >
                    $ {LZY_CLI_INSTALL_COMMAND}
                </div>
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
                    {t('lzy_cli.install_hint')}
                </Typography.Paragraph>
            </Modal>
        </Layout>
    );
};
