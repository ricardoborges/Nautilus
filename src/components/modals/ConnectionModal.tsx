/**
 * ConnectionModal Component
 * 
 * Modal for creating and editing SSH/RDP connections.
 * Uses Ant Design Modal and Form components.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Modal,
    Form,
    Input,
    Radio,
    Checkbox,
    Button,
    Space,
    Alert,
    message,
    Divider,
    InputNumber,
} from 'antd';
import {
    KeyOutlined,
    LockOutlined,
    ExperimentOutlined,
    CheckCircleOutlined,
    LoadingOutlined,
    WindowsOutlined,
    LinuxOutlined,
    DesktopOutlined,
} from '@ant-design/icons';
import type { Connection, ConnectionFormData } from '../../types';

interface ConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    connection?: Connection | null;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
    isOpen,
    onClose,
    onSave,
    connection
}) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const isEditing = !!connection;

    const [password, setPassword] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Watch form values
    const connectionType = Form.useWatch('connectionType', form);
    const authMethod = Form.useWatch('authMethod', form);
    const rdpAuthMethod = Form.useWatch('rdpAuthMethod', form);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (connection) {
                form.setFieldsValue({
                    name: connection.name,
                    description: connection.description,
                    host: connection.host,
                    user: connection.user,
                    connectionType: connection.connectionType || 'ssh',
                    authMethod: connection.authMethod,
                    keyPath: connection.keyPath || '',
                    autoConnect: connection.autoConnect || false,
                    rdpAuthMethod: connection.rdpAuthMethod || 'credentials',
                    domain: connection.domain || '',
                    port: connection.port,
                });
                // Load password if editing
                window.ssm.getPassword(connection.id).then(pwd => {
                    if (pwd) setPassword(pwd);
                });
            } else {
                form.setFieldsValue({
                    name: '',
                    description: '',
                    host: '',
                    user: 'root',
                    connectionType: 'ssh',
                    authMethod: 'password',
                    keyPath: '',
                    autoConnect: false,
                    rdpAuthMethod: 'credentials',
                    domain: '',
                    port: undefined,
                });
                setPassword('');
            }
            setTestResult(null);
            setError(null);
        }
    }, [isOpen, connection, form]);

    // Update default user when connection type changes
    useEffect(() => {
        if (!isEditing && connectionType) {
            const currentUser = form.getFieldValue('user');
            if (connectionType === 'ssh' && (!currentUser || currentUser === 'Administrator')) {
                form.setFieldValue('user', 'root');
            } else if (connectionType === 'rdp' && (!currentUser || currentUser === 'root')) {
                form.setFieldValue('user', 'Administrator');
            }
        }
    }, [connectionType, isEditing, form]);

    const handleTest = async () => {
        try {
            await form.validateFields(['host', 'user']);
        } catch {
            return;
        }

        // Only test SSH connections
        if (connectionType === 'rdp') {
            message.info(t('connection.rdp_test_not_available'));
            return;
        }

        setIsTesting(true);
        setTestResult(null);
        setError(null);

        try {
            const values = form.getFieldsValue();
            const formData: ConnectionFormData = {
                name: values.name,
                description: values.description,
                host: values.host,
                user: values.user,
                connectionType: values.connectionType || 'ssh',
                authMethod: values.authMethod,
                keyPath: values.keyPath || '',
                autoConnect: values.autoConnect || false,
            };

            await window.ssm.testConnection({ ...formData, password });
            setTestResult('success');
            message.success(t('connection.test_success'));
        } catch (err) {
            setTestResult('error');
            setError((err as Error).message);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            const formData: ConnectionFormData = {
                name: values.name,
                description: values.description,
                host: values.host,
                user: values.user,
                connectionType: values.connectionType || 'ssh',
                authMethod: values.connectionType === 'rdp' ? 'password' : values.authMethod,
                keyPath: values.keyPath || '',
                autoConnect: values.autoConnect || false,
                rdpAuthMethod: values.connectionType === 'rdp' ? values.rdpAuthMethod : undefined,
                domain: values.connectionType === 'rdp' ? values.domain : undefined,
                port: values.port,
            };

            // Validate password for SSH connections with password auth
            if (values.connectionType === 'ssh' && formData.authMethod === 'password' && !password && !isEditing) {
                setError(t('connection.password_required'));
                return;
            }

            // Validate password for RDP connections with credentials auth
            if (values.connectionType === 'rdp' && values.rdpAuthMethod === 'credentials' && !password && !isEditing) {
                setError(t('connection.password_required'));
                return;
            }

            setIsSaving(true);
            setError(null);

            if (isEditing && connection) {
                await window.ssm.updateConnection(connection.id, formData);
                // Save password for SSH password auth or RDP credentials auth
                const shouldSavePassword =
                    (formData.connectionType === 'ssh' && formData.authMethod === 'password') ||
                    (formData.connectionType === 'rdp' && formData.rdpAuthMethod === 'credentials');
                if (shouldSavePassword && password) {
                    await window.ssm.setPassword(connection.id, password);
                }
                message.success(t('connection.connection_updated'));
            } else {
                const newConn = await window.ssm.addConnection(formData);
                // Save password for SSH password auth or RDP credentials auth
                const shouldSavePassword =
                    (formData.connectionType === 'ssh' && formData.authMethod === 'password') ||
                    (formData.connectionType === 'rdp' && formData.rdpAuthMethod === 'credentials');
                if (shouldSavePassword && password) {
                    await window.ssm.setPassword(newConn.id, password);
                }
                message.success(t('connection.connection_created'));
            }
            onSave();
            onClose();
        } catch (err) {
            if (err && typeof err === 'object' && 'errorFields' in err) {
                // Form validation error - already shown by Ant Design
                return;
            }
            setError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    // Determine if we should show SSH-specific test button
    const showTestButton = connectionType !== 'rdp';

    return (
        <Modal
            title={isEditing ? t('common.edit_connection') : t('common.new_connection')}
            open={isOpen}
            onCancel={onClose}
            width={560}
            footer={[
                showTestButton && (
                    <Button
                        key="test"
                        icon={isTesting ? <LoadingOutlined /> : <ExperimentOutlined />}
                        onClick={handleTest}
                        loading={isTesting}
                    >
                        {t('common.test')}
                    </Button>
                ),
                <Button key="cancel" onClick={onClose}>
                    {t('common.cancel')}
                </Button>,
                <Button
                    key="save"
                    type="primary"
                    onClick={handleSave}
                    loading={isSaving}
                >
                    {isEditing ? t('common.save') : t('common.create')}
                </Button>,
            ].filter(Boolean)}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    connectionType: 'ssh',
                    authMethod: 'password',
                    user: 'root',
                    autoConnect: false,
                    rdpAuthMethod: 'credentials',
                }}
            >
                {/* Connection Type */}
                <Form.Item
                    name="connectionType"
                    label={t('connection.connection_type')}
                >
                    <Radio.Group buttonStyle="solid" optionType="button">
                        <Radio.Button value="ssh">
                            <Space>
                                <LinuxOutlined />
                                SSH (Linux)
                            </Space>
                        </Radio.Button>
                        <Radio.Button value="rdp">
                            <Space>
                                <WindowsOutlined />
                                RDP (Windows)
                            </Space>
                        </Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Divider style={{ margin: '16px 0' }} />

                {/* Name */}
                <Form.Item
                    name="name"
                    label={t('connection.name')}
                    rules={[{ required: true, message: t('connection.name_required') }]}
                >
                    <Input placeholder={t('connection.name_placeholder')} />
                </Form.Item>

                {/* Description */}
                <Form.Item
                    name="description"
                    label={t('connection.description')}
                >
                    <Input.TextArea placeholder={t('connection.description_placeholder')} rows={2} />
                </Form.Item>

                {/* Host & Port */}
                <Space style={{ display: 'flex' }} align="start">
                    <Form.Item
                        name="host"
                        label={t('connection.host')}
                        rules={[{ required: true, message: t('connection.host_required') }]}
                        style={{ flex: 1 }}
                    >
                        <Input placeholder={t('connection.host_placeholder')} />
                    </Form.Item>
                    <Form.Item
                        name="port"
                        label={t('connection.port')}
                        style={{ width: 100 }}
                    >
                        <InputNumber
                            placeholder={connectionType === 'rdp' ? '3389' : '22'}
                            min={1}
                            max={65535}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Space>

                {/* SSH specific fields */}
                {connectionType === 'ssh' && (
                    <>
                        {/* User */}
                        <Form.Item
                            name="user"
                            label={t('connection.user')}
                            rules={[{ required: true, message: t('connection.user_required') }]}
                        >
                            <Input placeholder={t('connection.user_placeholder')} />
                        </Form.Item>

                        {/* Auth Method */}
                        <Form.Item name="authMethod" label={t('connection.auth_method')}>
                            <Radio.Group>
                                <Radio value="password">
                                    <Space>
                                        <LockOutlined />
                                        {t('connection.password')}
                                    </Space>
                                </Radio>
                                <Radio value="key">
                                    <Space>
                                        <KeyOutlined />
                                        {t('connection.private_key')}
                                    </Space>
                                </Radio>
                            </Radio.Group>
                        </Form.Item>

                        {/* Password or Key Path */}
                        {authMethod === 'password' ? (
                            <Form.Item label={isEditing ? t('connection.password') : `${t('connection.password')} *`}>
                                <Input.Password
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={isEditing ? t('connection.password_keep') : t('connection.password_ssh')}
                                />
                            </Form.Item>
                        ) : (
                            <Form.Item
                                name="keyPath"
                                label={t('connection.key_path')}
                                rules={[{ required: authMethod === 'key', message: t('connection.key_path_required') }]}
                            >
                                <Input placeholder={t('connection.key_path_placeholder')} />
                            </Form.Item>
                        )}
                    </>
                )}

                {/* RDP specific fields */}
                {connectionType === 'rdp' && (
                    <>
                        {/* RDP Auth Method */}
                        <Form.Item name="rdpAuthMethod" label={t('connection.rdp_auth_method')}>
                            <Radio.Group>
                                <Radio value="credentials">
                                    <Space>
                                        <LockOutlined />
                                        {t('connection.rdp_credentials')}
                                    </Space>
                                </Radio>
                                <Radio value="windows_auth">
                                    <Space>
                                        <DesktopOutlined />
                                        {t('connection.rdp_windows_auth')}
                                    </Space>
                                </Radio>
                            </Radio.Group>
                        </Form.Item>

                        {/* Credentials fields for RDP */}
                        {rdpAuthMethod === 'credentials' && (
                            <>
                                {/* Domain & User */}
                                <Space style={{ display: 'flex' }} align="start">
                                    <Form.Item
                                        name="domain"
                                        label={t('connection.domain')}
                                        style={{ width: 150 }}
                                    >
                                        <Input placeholder={t('connection.domain_placeholder')} />
                                    </Form.Item>
                                    <Form.Item
                                        name="user"
                                        label={t('connection.user')}
                                        rules={[{ required: true, message: t('connection.user_required') }]}
                                        style={{ flex: 1 }}
                                    >
                                        <Input placeholder={t('connection.user_placeholder_windows')} />
                                    </Form.Item>
                                </Space>

                                {/* Password */}
                                <Form.Item label={isEditing ? t('connection.password') : `${t('connection.password')} *`}>
                                    <Input.Password
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={isEditing ? t('connection.password_keep') : t('connection.password_rdp')}
                                    />
                                </Form.Item>
                            </>
                        )}

                        {/* Windows Auth info */}
                        {rdpAuthMethod === 'windows_auth' && (
                            <Alert
                                type="info"
                                message={t('connection.windows_auth_info')}
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                        )}
                    </>
                )}

                {/* Auto Connect */}
                <Form.Item name="autoConnect" valuePropName="checked">
                    <Checkbox>{t('connection.auto_connect')}</Checkbox>
                </Form.Item>

                {/* Error Message */}
                {error && (
                    <Alert
                        type="error"
                        message={error}
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* Test Success */}
                {testResult === 'success' && (
                    <Alert
                        type="success"
                        message={t('connection.test_success')}
                        icon={<CheckCircleOutlined />}
                        showIcon
                    />
                )}
            </Form>
        </Modal>
    );
};
