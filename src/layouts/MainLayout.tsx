/**
 * Main Layout Component
 * 
 * Uses Ant Design ProLayout for professional application layout.
 * Supports multiple active connections with OnlyOffice-style tabs.
 */

import React, { useState } from 'react';
import {
    SettingOutlined,
    PlusOutlined,
    CloudServerOutlined,
    InfoCircleOutlined,
    BulbOutlined,
    GlobalOutlined,
    ContainerOutlined,
    WindowsOutlined,
    LinuxOutlined,
    DatabaseOutlined,
    CodeOutlined,
    ExportOutlined,
    ImportOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Modal, Space, Typography, Divider, Radio, Form, App, Select, Input, InputNumber, Popconfirm, Row, Col, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { useTheme } from '../context/ThemeContext';
import { useConnection } from '../context/ConnectionContext';
import { ConnectionTabs } from '../components/connections/ConnectionTabs';
import { ConnectionPane } from '../components/connections/ConnectionPane';
import { ConnectionModal } from '../components/modals/ConnectionModal';
import { ConnectionManager } from '../components/connections/ConnectionManager';
import type { Connection } from '../types';
import splashScreen from '../assets/splash-screen.png';
import pkg from '../../package.json';

const { Text, Title } = Typography;

export const MainLayout: React.FC = () => {
    const { t, i18n } = useTranslation();
    const {
        connections,
        activeConnectionIds,
        focusedConnectionId,
        openConnection,
        refreshConnections,
    } = useConnection();

    const { themeMode, setThemeMode } = useTheme();
    const { modal, message } = App.useApp();

    const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
    const [isConnectionManagerOpen, setIsConnectionManagerOpen] = useState(false);
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

    // Terminal font setting
    const DEFAULT_TERMINAL_FONT = 'Consolas, monospace';
    const DEFAULT_TERMINAL_FONT_SIZE = 13;
    const TERMINAL_FONT_OPTIONS = [
        { value: DEFAULT_TERMINAL_FONT, label: 'Consolas (default)' },
        { value: '"Fira Code", "Cascadia Code", Consolas, monospace', label: 'Fira Code' },
        { value: '"ProggyClean Nerd Font", "Cascadia Code", Consolas, monospace', label: 'ProggyClean Nerd Font' },
        { value: '"GeistMono Nerd Font", "Cascadia Code", Consolas, monospace', label: 'GeistMono Nerd Font' },
        { value: '"Cascadia Code", Consolas, monospace', label: 'Cascadia Code' },
        { value: '"Courier New", monospace', label: 'Courier New' },
    ];
    const [terminalFont, setTerminalFont] = useState<string>(() => {
        return localStorage.getItem('nautilus_terminal_font') || DEFAULT_TERMINAL_FONT;
    });
    const [terminalFontSize, setTerminalFontSize] = useState<number>(() => {
        const raw = localStorage.getItem('nautilus_terminal_font_size');
        const parsed = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TERMINAL_FONT_SIZE;
    });

    const handleTerminalFontChange = (value: string) => {
        setTerminalFont(value);
        localStorage.setItem('nautilus_terminal_font', value);
        window.dispatchEvent(new Event('nautilus:terminal-font-changed'));
    };

    const handleTerminalFontSizeChange = (value: number | null) => {
        if (value == null || !Number.isFinite(value) || value <= 0) return;
        setTerminalFontSize(value);
        localStorage.setItem('nautilus_terminal_font_size', String(value));
        window.dispatchEvent(new Event('nautilus:terminal-font-changed'));
    };



    // Render content based on active connections
    const renderContent = () => {
        if (activeConnectionIds.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 32px)',
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

        // Render only the focused connection pane
        // Header (32px) + Tabs (32px)
        const containerHeight = 'calc(100vh - 32px - 32px)';

        return (
            <div style={{ height: containerHeight, width: '100%', overflow: 'hidden' }}>
                {activeConnectionIds.map(connId => (
                    <ConnectionPane
                        key={connId}
                        connectionId={connId}
                        isVisible={connId === focusedConnectionId}
                        stacksDirectory={stacksDirectory}
                        onOpenSettings={openSettings}
                    />
                ))}
            </div>
        );
    };

    // About modal
    const showAbout = () => {
        modal.info({
            title: t('common.about_nautilus'),
            icon: null,
            className: 'about-modal',
            content: (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'center',
                }}>
                    <img
                        src={splashScreen}
                        alt="Nautilus"
                        style={{
                            width: 128,
                            height: 128,
                            maxWidth: '100%',
                            borderRadius: 8,
                        }}
                    />
                    <Title level={4} style={{ margin: 0 }}>
                        Nautilus Server Manager
                    </Title>
                    <Tag color="blue" style={{ margin: 0, fontSize: 12, padding: '2px 8px', fontWeight: 600 }}>
                        v{pkg.version}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                        <a href="https://github.com/ricardoborges/nautilus" target="_blank" rel="noopener noreferrer">
                            github.com/ricardoborges/nautilus
                        </a>
                    </Text>
                </div>
            ),
            okText: t('common.close'),
            width: 360,
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
                padding: '0 12px',
                height: 32,
                background: themeMode === 'dark' ? '#141414' : '#fff',
                borderBottom: `1px solid ${themeMode === 'dark' ? '#303030' : '#f0f0f0'}`,
            }}>
                <Space>
                    <CloudServerOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                    <Typography.Title level={5} style={{ margin: 0, fontSize: 16, color: themeMode === 'dark' ? '#fff' : undefined }}>
                        Nautilus
                    </Typography.Title>
                </Space>
                <Space size="small">
                    <Button
                        type="default"
                        size="small"
                        onClick={() => setIsConnectionManagerOpen(true)}
                    >
                        <Space>
                            <CloudServerOutlined />
                            {t('common.connections')}
                        </Space>
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={openSettings}
                    />
                    <Button
                        type="text"
                        size="small"
                        icon={<InfoCircleOutlined />}
                        onClick={showAbout}
                    />
                </Space>
            </div>

            {/* Connection Tabs */}
            <div style={{ paddingTop: 32 }}>
                <ConnectionTabs />
                {renderContent()}
            </div>

            {/* Connection Manager */}
            <ConnectionManager
                isOpen={isConnectionManagerOpen}
                onClose={() => setIsConnectionManagerOpen(false)}
                onEditConnection={(conn) => {
                    setEditingConnection(conn);
                    setIsConnectionModalOpen(true);
                }}
                onCreateConnection={() => {
                    setEditingConnection(null);
                    setIsConnectionModalOpen(true);
                }}
            />

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
                width={560}
            >
                <Form layout="vertical" style={{ marginTop: 8 }}>
                    <Row gutter={16}>
                        <Col span={12}>
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
                        </Col>
                        <Col span={12}>
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
                        </Col>
                    </Row>

                    <Form.Item
                        label={
                            <Space>
                                <ContainerOutlined />
                                {t('settings.stacks_directory')}
                            </Space>
                        }
                        help={t('settings.stacks_directory_help')}
                        style={{ marginBottom: 16 }}
                    >
                        <Input
                            value={stacksDirectory}
                            onChange={(e) => handleStacksDirectoryChange(e.target.value)}
                            placeholder="/tmp/nautilus-stacks"
                        />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item
                                label={
                                    <Space>
                                        <CodeOutlined />
                                        {t('settings.terminal_font')}
                                    </Space>
                                }
                                help={t('settings.terminal_font_help')}
                                style={{ marginBottom: 16 }}
                            >
                                <Select
                                    value={terminalFont}
                                    onChange={handleTerminalFontChange}
                                    style={{ width: '100%' }}
                                    options={TERMINAL_FONT_OPTIONS}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                label={t('settings.terminal_font_size')}
                                help={t('settings.terminal_font_size_help')}
                                style={{ marginBottom: 16 }}
                            >
                                <InputNumber
                                    value={terminalFontSize}
                                    onChange={handleTerminalFontSizeChange}
                                    min={8}
                                    max={48}
                                    step={1}
                                    style={{ width: '100%' }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider style={{ margin: '8px 0 16px' }}>{t('settings.data_management')}</Divider>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space>
                                    <DatabaseOutlined />
                                    <span>{t('settings.export_database')}</span>
                                </Space>
                                <Button
                                    icon={<ExportOutlined />}
                                    onClick={async () => {
                                        try {
                                            const defaultName = `nautilus-backup-${new Date().toISOString().split('T')[0]}.ndb`;
                                            let dialog: typeof import('@tauri-apps/plugin-dialog') | null = null;
                                            try {
                                                dialog = await import('@tauri-apps/plugin-dialog');
                                            } catch {
                                                dialog = null;
                                            }

                                            if (dialog) {
                                                const targetPath = await dialog.save({
                                                    defaultPath: defaultName,
                                                    filters: [
                                                        { name: 'Nautilus Backup', extensions: ['ndb'] },
                                                        { name: 'All Files', extensions: ['*'] },
                                                    ],
                                                });
                                                if (!targetPath) return;
                                                const result = await window.ssm.databaseExport();
                                                const fs = await import('@tauri-apps/plugin-fs');
                                                const binary = atob(result.data);
                                                const bytes = new Uint8Array(binary.length);
                                                for (let i = 0; i < binary.length; i++) {
                                                    bytes[i] = binary.charCodeAt(i);
                                                }
                                                await fs.writeFile(targetPath, bytes);
                                            } else {
                                                const result = await window.ssm.databaseExport();
                                                const blob = new Blob([result.data], { type: 'application/octet-stream' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = defaultName;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                URL.revokeObjectURL(url);
                                            }
                                            message.success(t('settings.export_success'));
                                        } catch (error) {
                                            message.error(t('settings.export_error'));
                                        }
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    {t('settings.export_database')}
                                </Button>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('settings.export_database_help')}
                                </Typography.Text>
                            </Space>
                        </Col>
                        <Col span={12}>
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space>
                                    <DatabaseOutlined />
                                    <span>{t('settings.import_database')}</span>
                                </Space>
                                <Popconfirm
                                    title={t('settings.import_database')}
                                    description={t('settings.import_warning')}
                                    onConfirm={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.ndb';
                                        input.onchange = async (e) => {
                                            const target = e.target as HTMLInputElement;
                                            const file = target.files?.[0];
                                            if (!file) return;

                                            try {
                                                const reader = new FileReader();
                                                reader.onload = async (event) => {
                                                    const data = event.target?.result as string;
                                                    if (!data) {
                                                        message.error(t('settings.invalid_file'));
                                                        return;
                                                    }
                                                    try {
                                                        await window.ssm.databaseImport(data);
                                                        message.success(t('settings.import_success'));
                                                        refreshConnections();
                                                        setIsSettingsModalOpen(false);
                                                    } catch (error) {
                                                        message.error(t('settings.import_error'));
                                                    }
                                                };
                                                reader.readAsText(file);
                                            } catch (error) {
                                                message.error(t('settings.import_error'));
                                            }
                                        };
                                        input.click();
                                    }}
                                    okText={t('common.yes')}
                                    cancelText={t('common.no')}
                                >
                                    <Button icon={<ImportOutlined />} style={{ width: '100%' }}>
                                        {t('settings.import_database')}
                                    </Button>
                                </Popconfirm>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('settings.import_database_help')}
                                </Typography.Text>
                            </Space>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </>
    );
};
