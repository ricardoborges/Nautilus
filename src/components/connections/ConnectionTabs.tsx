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

    if (activeConnectionIds.length === 0) {
        return null; // Don't render if no connections are active
    }

    return (
        <div style={{
            background: themeMode === 'dark' ? '#1f1f1f' : '#fafafa',
            borderBottom: `1px solid ${themeMode === 'dark' ? '#303030' : '#f0f0f0'}`,
            paddingLeft: 8,
            paddingRight: 8,
        }}>
            <Tabs
                type="editable-card"
                activeKey={focusedConnectionId || undefined}
                onChange={(key) => focusConnection(key)}
                onEdit={handleEdit}
                items={tabItems}
                hideAdd
                size="small"
                tabBarStyle={{ marginBottom: 0 }}
                tabBarExtraContent={{
                    right: (
                        <Dropdown
                            menu={{ items: dropdownItems }}
                            trigger={['click']}
                            open={dropdownOpen}
                            onOpenChange={setDropdownOpen}
                            placement="bottomRight"
                        >
                            <Button
                                type="text"
                                size="small"
                                icon={<PlusOutlined />}
                                style={{ marginLeft: 8 }}
                            />
                        </Dropdown>
                    ),
                }}
            />
        </div>
    );
};
