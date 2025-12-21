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
                        onClick={(info) => setActiveTab(info.key as TabKey)}
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
        </Layout>
    );
};
