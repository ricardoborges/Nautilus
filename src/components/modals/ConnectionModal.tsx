/**
 * ConnectionModal Component
 * 
 * Modal for creating and editing SSH connections.
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
} from 'antd';
import {
    KeyOutlined,
    LockOutlined,
    ExperimentOutlined,
    CheckCircleOutlined,
    LoadingOutlined,
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

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (connection) {
                form.setFieldsValue({
                    name: connection.name,
                    host: connection.host,
                    user: connection.user,
                    authMethod: connection.authMethod,
                    keyPath: connection.keyPath || '',
                    autoConnect: connection.autoConnect || false,
                });
                // Load password if editing
                window.ssm.getPassword(connection.id).then(pwd => {
                    if (pwd) setPassword(pwd);
                });
            } else {
                form.setFieldsValue({
                    name: '',
                    host: '',
                    user: 'root',
                    authMethod: 'password',
                    keyPath: '',
                    autoConnect: false,
                });
                setPassword('');
            }
            setTestResult(null);
            setError(null);
        }
    }, [isOpen, connection, form]);

    const handleTest = async () => {
        try {
            await form.validateFields(['host', 'user']);
        } catch {
            return;
        }

        setIsTesting(true);
        setTestResult(null);
        setError(null);

        try {
            const values = form.getFieldsValue();
            const formData: ConnectionFormData = {
                name: values.name,
                host: values.host,
                user: values.user,
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
                host: values.host,
                user: values.user,
                authMethod: values.authMethod,
                keyPath: values.keyPath || '',
                autoConnect: values.autoConnect || false,
            };

            if (formData.authMethod === 'password' && !password && !isEditing) {
                setError(t('connection.password_required'));
                return;
            }

            setIsSaving(true);
            setError(null);

            if (isEditing && connection) {
                await window.ssm.updateConnection(connection.id, formData);
                if (formData.authMethod === 'password' && password) {
                    await window.ssm.setPassword(connection.id, password);
                }
                message.success(t('connection.connection_updated'));
            } else {
                const newConn = await window.ssm.addConnection(formData);
                if (formData.authMethod === 'password' && password) {
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

    const authMethod = Form.useWatch('authMethod', form);

    return (
        <Modal
            title={isEditing ? t('common.edit_connection') : t('common.new_connection')}
            open={isOpen}
            onCancel={onClose}
            width={520}
            footer={[
                <Button
                    key="test"
                    icon={isTesting ? <LoadingOutlined /> : <ExperimentOutlined />}
                    onClick={handleTest}
                    loading={isTesting}
                >
                    {t('common.test')}
                </Button>,
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
            ]}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    authMethod: 'password',
                    user: 'root',
                    autoConnect: false,
                }}
            >
                {/* Name */}
                <Form.Item
                    name="name"
                    label={t('connection.name')}
                    rules={[{ required: true, message: t('connection.name_required') }]}
                >
                    <Input placeholder={t('connection.name_placeholder')} />
                </Form.Item>

                {/* Host & User */}
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
                        name="user"
                        label={t('connection.user')}
                        rules={[{ required: true, message: t('connection.user_required') }]}
                        style={{ flex: 1 }}
                    >
                        <Input placeholder={t('connection.user_placeholder')} />
                    </Form.Item>
                </Space>

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
