/**
 * SnippetModal Component
 * 
 * Modal for creating and editing command snippets.
 * Uses Ant Design Modal and Form components.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Input, Alert, message, Checkbox } from 'antd';
import { CodeOutlined, LockOutlined } from '@ant-design/icons';
import type { Snippet } from '../../types';

const { TextArea } = Input;

interface SnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    snippet?: Snippet | null;
}

export const SnippetModal: React.FC<SnippetModalProps> = ({
    isOpen,
    onClose,
    onSave,
    snippet
}) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const isEditing = !!snippet;
    const isSecret = Form.useWatch('isSecret', form);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (snippet) {
                form.setFieldsValue({
                    name: snippet.name,
                    command: snippet.command,
                    isSecret: Boolean(snippet.isSecret),
                });
            } else {
                form.resetFields();
                form.setFieldsValue({
                    isSecret: false,
                });
            }
            setError(null);
        }
    }, [isOpen, snippet, form]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            setIsSaving(true);
            setError(null);

            const isSecretValue = Boolean(values.isSecret);
            const commandValue = values.command;

            if (isEditing && snippet) {
                await window.ssm.snippetUpdate({
                    id: snippet.id,
                    name: values.name.trim(),
                    command: commandValue,
                    isSecret: isSecretValue,
                });
                message.success(t('snippet.snippet_updated'));
            } else {
                await window.ssm.snippetAdd({
                    name: values.name.trim(),
                    command: commandValue,
                    isSecret: isSecretValue,
                });
                message.success(t('snippet.snippet_created'));
            }
            onSave();
            onClose();
        } catch (err) {
            if (err && typeof err === 'object' && 'errorFields' in err) {
                // Form validation error
                return;
            }
            setError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            title={
                <span>
                    {isSecret ? (
                        <LockOutlined style={{ marginRight: 8, color: '#faad14' }} />
                    ) : (
                        <CodeOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                    )}
                    {isEditing ? t('snippet.edit_snippet') : t('snippet.new_snippet')}
                </span>
            }
            open={isOpen}
            onCancel={onClose}
            onOk={handleSave}
            okText={isEditing ? t('common.save') : t('common.create')}
            cancelText={t('common.cancel')}
            confirmLoading={isSaving}
            width={800}
        >
            <Form
                form={form}
                layout="vertical"
                style={{ marginTop: 16 }}
            >
                {/* Name */}
                <Form.Item
                    name="name"
                    label={t('snippet.name')}
                    rules={[{ required: true, message: t('snippet.name_required') }]}
                >
                    <Input
                        placeholder={t('snippet.name_placeholder')}
                        autoFocus
                    />
                </Form.Item>

                {/* Secret Checkbox */}
                <Form.Item
                    name="isSecret"
                    valuePropName="checked"
                    style={{ marginBottom: 16 }}
                >
                    <Checkbox>
                        <span style={{ fontWeight: 500 }}>Secret</span>
                    </Checkbox>
                </Form.Item>

                {/* Command or Secret */}
                <Form.Item
                    name="command"
                    label={isSecret ? (t('snippet.secret_value') || 'Secret') : t('snippet.command')}
                    rules={[{ required: true, message: isSecret ? (t('snippet.secret_required') || 'Please enter secret value') : t('snippet.command_required') }]}
                    extra={isSecret ? (t('snippet.secret_tip') || 'This secret is stored securely and hidden from view') : t('snippet.save_tip')}
                >
                    {isSecret ? (
                        <Input.Password
                            placeholder={t('snippet.secret_placeholder') || '••••••••••••'}
                            style={{ fontFamily: 'monospace' }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleSave();
                                }
                            }}
                        />
                    ) : (
                        <TextArea
                            placeholder={t('snippet.command_placeholder')}
                            rows={12}
                            style={{ fontFamily: 'monospace' }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey) {
                                    handleSave();
                                }
                            }}
                        />
                    )}
                </Form.Item>

                {/* Error Message */}
                {error && (
                    <Alert
                        type="error"
                        message={error}
                        showIcon
                    />
                )}
            </Form>
        </Modal>
    );
};
