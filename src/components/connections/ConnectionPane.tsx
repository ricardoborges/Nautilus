/**
 * ConnectionPane Component
 * 
 * Encapsulates the full UI for a single connection.
 * Contains sidebar navigation and content area with isolated state.
 */

import React, { useState } from 'react';
import { Layout, Menu, Button, Tooltip } from 'antd';
import {
    DashboardOutlined,
    CodeOutlined,
    FolderOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    ContainerOutlined,
    SettingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Dashboard } from '../dashboard/Dashboard';
import { TerminalManager } from '../terminal/TerminalManager';
import { FileManager } from '../files/FileManager';
import { ProcessManager } from '../processes/ProcessManager';
import { CronManager } from '../cron/CronManager';
import { DockerDashboard } from '../docker/DockerDashboard';

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
    ];

    const tabStyle = (tab: TabKey): React.CSSProperties => ({
        display: activeTab === tab ? 'flex' : 'none',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
    });

    if (!isVisible) {
        return null;
    }

    return (
        <Layout style={{ height: '100%', background: 'transparent' }}>
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
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <Menu
                        mode="inline"
                        selectedKeys={[activeTab]}
                        onClick={(info) => setActiveTab(info.key as TabKey)}
                        items={menuItems}
                        theme={isDark ? 'dark' : 'light'}
                        style={{
                            border: 'none',
                            background: 'transparent',
                        }}
                    />
                </div>

                {/* Footer with Settings and Collapse */}
                <div style={{
                    borderTop: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
                    padding: collapsed ? '8px 0' : '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                }}>
                    {!collapsed && (
                        <Button
                            type="text"
                            icon={<SettingOutlined />}
                            block
                            onClick={onOpenSettings}
                            style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                        >
                            {t('common.settings')}
                        </Button>
                    )}
                    {collapsed && (
                        <Tooltip title={t('common.settings')} placement="right">
                            <Button
                                type="text"
                                icon={<SettingOutlined />}
                                onClick={onOpenSettings}
                                style={{ width: '100%' }}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={collapsed ? t('common.expand') : t('common.collapse')} placement="right">
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(!collapsed)}
                            style={{ width: '100%' }}
                        />
                    </Tooltip>
                </div>
            </Sider>

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
        </Layout>
    );
};
