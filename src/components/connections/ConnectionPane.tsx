/**
 * ConnectionPane Component
 * 
 * Encapsulates the full UI for a single connection.
 * Contains sidebar navigation and content area with isolated state.
 */

import React, { useState } from 'react';
import { ProLayout, PageContainer } from '@ant-design/pro-components';
import {
    DashboardOutlined,
    CodeOutlined,
    FolderOutlined,
    ClockCircleOutlined,
    AppstoreOutlined,
    ContainerOutlined,
    SettingOutlined,
    CloudServerOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Dashboard } from '../dashboard/Dashboard';
import { TerminalManager } from '../terminal/TerminalManager';
import { FileManager } from '../files/FileManager';
import { ProcessManager } from '../processes/ProcessManager';
import { CronManager } from '../cron/CronManager';
import { DockerDashboard } from '../docker/DockerDashboard';

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

    // Container height calculation
    const containerHeight = 'calc(100vh - 56px - 40px)'; // Header + tabs height

    const tabStyle = (tab: TabKey): React.CSSProperties => ({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'auto',
        visibility: activeTab === tab ? 'visible' : 'hidden',
        pointerEvents: activeTab === tab ? 'auto' : 'none',
    });

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            visibility: isVisible ? 'visible' : 'hidden',
            pointerEvents: isVisible ? 'auto' : 'none',
        }}>
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
                                onClick={onOpenSettings}
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
                    style={{ padding: 0 }}
                >
                    <div style={{ position: 'relative', height: containerHeight, width: '100%', overflow: 'hidden' }}>
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
                    </div>
                </PageContainer>
            </ProLayout>
        </div>
    );
};
