/**
 * ConnectionTabs Component
 * 
 * Horizontal tab bar showing all active connections.
 * Allows switching between connections and closing them.
 */

import React, { useState } from 'react';
import { Tabs, Button, Dropdown, Space, Typography } from 'antd';
import {
    PlusOutlined,
    LinuxOutlined,
    WindowsOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import type { MenuProps } from 'antd';

const { Text } = Typography;

export const ConnectionTabs: React.FC = () => {
    const { t } = useTranslation();
    const { themeMode } = useTheme();
    const {
        connections,
        activeConnectionIds,
        focusedConnectionId,
        openConnection,
        closeConnection,
        focusConnection,
    } = useConnection();

    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Get connection details for active connections
    const activeConnections = activeConnectionIds
        .map(id => connections.find(c => c.id === id))
        .filter(Boolean);

    // Build dropdown menu items for adding new connections
    const availableConnections = connections.filter(
        c => !activeConnectionIds.includes(c.id) && c.connectionType === 'ssh'
    );

    const dropdownItems: MenuProps['items'] = availableConnections.map(conn => ({
        key: conn.id,
        icon: conn.connectionType === 'rdp'
            ? <WindowsOutlined style={{ color: '#0078d4' }} />
            : <LinuxOutlined style={{ color: '#f57c00' }} />,
        label: conn.name,
        onClick: () => {
            openConnection(conn.id);
            setDropdownOpen(false);
        },
    }));

    if (availableConnections.length === 0) {
        dropdownItems.push({
            key: 'no-connections',
            label: <Text type="secondary">{t('common.no_available_connections')}</Text>,
            disabled: true,
        });
    }

    // Build tab items
    const tabItems = activeConnections.map(conn => ({
        key: conn!.id,
        label: (
            <Space size={4}>
                {conn!.connectionType === 'rdp'
                    ? <WindowsOutlined style={{ color: '#0078d4' }} />
                    : <LinuxOutlined style={{ color: '#f57c00' }} />
                }
                <span>{conn!.name}</span>
            </Space>
        ),
        closable: true,
    }));

    // Handle tab close
    const handleEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
        if (action === 'remove' && typeof targetKey === 'string') {
            closeConnection(targetKey);
        }
    };

    // Don't render if no connections are active AND no connection is focused
    if (activeConnectionIds.length === 0 && !focusedConnectionId) {
        return null;
    }

    const isDark = themeMode === 'dark';

    // Colors based on theme - tab active matches content background
    const tabActiveBackground = isDark ? '#1f1f1f' : '#f5f5f5';
    const tabInactiveBackground = isDark ? '#141414' : '#e8e8e8';
    const borderColor = isDark ? '#303030' : '#d9d9d9';

    return (
        <div
            className={`connection-tabs-container ${isDark ? 'dark-theme' : 'light-theme'}`}
            style={{
                background: isDark ? '#141414' : '#fff',
                borderBottom: `1px solid ${borderColor}`,
                paddingLeft: 0,
                paddingRight: 0,
                height: 32,
                display: 'flex',
                alignItems: 'flex-end',
            }}
        >
            <style>{`
                .connection-tabs-container .ant-tabs .ant-tabs-nav .ant-tabs-tab {
                    background: ${tabInactiveBackground} !important;
                    border-color: ${borderColor} !important;
                    transition: all 0.2s ease;
                }
                .connection-tabs-container .ant-tabs .ant-tabs-nav .ant-tabs-tab.ant-tabs-tab-active {
                    background: ${tabActiveBackground} !important;
                    border-color: ${borderColor} !important;
                    border-bottom-color: ${tabActiveBackground} !important;
                }
                .connection-tabs-container .ant-tabs .ant-tabs-nav .ant-tabs-tab:hover:not(.ant-tabs-tab-active) {
                    background: ${isDark ? '#252525' : '#e0e0e0'} !important;
                }
            `}</style>
            <Tabs
                type="editable-card"
                activeKey={focusedConnectionId || undefined}
                onChange={(key) => focusConnection(key)}
                onEdit={handleEdit}
                items={tabItems}
                hideAdd
                size="small"
                tabBarStyle={{
                    marginBottom: 0,
                    borderBottom: 'none',
                    margin: 0,
                }}
                style={{
                    marginBottom: 0,
                    width: '100%',
                }}
            />
        </div>
    );
};
