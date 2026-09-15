/**
 * SnippetModal Component
 * 
 * Modal for creating and editing command snippets.
 * Supports simple snippets and sequenced / nested snippets.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Modal,
    Form,
    Input,
    Alert,
    message,
    Checkbox,
    Switch,
    Button,
    Select,
    Card,
    Space,
    Typography,
    Divider,
    Tooltip,
    Tag,
    theme
} from 'antd';
import {
    CodeOutlined,
    LockOutlined,
    PlusOutlined,
    DeleteOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    UnorderedListOutlined
} from '@ant-design/icons';
import type { Snippet, SnippetStep } from '../../types';

const { TextArea } = Input;
const { Text } = Typography;

interface SnippetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    snippet?: Snippet | null;
}

function generateStepId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `step-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const SnippetModal: React.FC<SnippetModalProps> = ({
    isOpen,
    onClose,
    onSave,
    snippet
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [form] = Form.useForm();
    const isEditing = !!snippet;
    const isSecret = Form.useWatch('isSecret', form);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Nested steps state
    const [enableSteps, setEnableSteps] = useState(false);
    const [steps, setSteps] = useState<SnippetStep[]>([]);
    const [availableSnippets, setAvailableSnippets] = useState<Snippet[]>([]);
    const [selectedSnippetToAdd, setSelectedSnippetToAdd] = useState<string | undefined>(undefined);

    // Fetch existing snippets when modal opens to populate selection
    useEffect(() => {
        if (isOpen) {
            window.ssm.snippetsList()
                .then(data => {
                    setAvailableSnippets(data);
                })
                .catch(err => {
                    console.error('Failed to load snippets list for nesting:', err);
                });
        }
    }, [isOpen]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            if (snippet) {
                const hasExistingSteps = Boolean(snippet.steps && snippet.steps.length > 0);
                setEnableSteps(hasExistingSteps);
                setSteps(snippet.steps ? [...snippet.steps] : []);
                form.setFieldsValue({
                    name: snippet.name,
                    command: snippet.command,
                    isSecret: Boolean(snippet.isSecret),
                });
            } else {
                form.resetFields();
                form.setFieldsValue({
                    isSecret: false,
                    command: '',
                });
                setEnableSteps(false);
                setSteps([]);
            }
            setSelectedSnippetToAdd(undefined);
            setError(null);
        }
    }, [isOpen, snippet, form]);

    // Filter available snippets to prevent circular references and direct self-nesting
    const nestableSnippets = useMemo(() => {
        const map = new Map<string, Snippet>();
        availableSnippets.forEach(s => map.set(s.id, s));

        const checkIsDescendant = (
            ancestorId: string,
            candidateId: string,
            visited = new Set<string>()
        ): boolean => {
            if (ancestorId === candidateId) return true;
            if (visited.has(candidateId)) return false;
            visited.add(candidateId);

            const cand = map.get(candidateId);
            if (!cand || !cand.steps) return false;

            for (const step of cand.steps) {
                if (step.type === 'snippet' && step.snippetId) {
                    if (step.snippetId === ancestorId) return true;
                    if (checkIsDescendant(ancestorId, step.snippetId, visited)) return true;
                }
            }
            return false;
        };

        return availableSnippets.filter(candidate => {
            if (isEditing && snippet) {
                if (candidate.id === snippet.id) return false;
                if (checkIsDescendant(snippet.id, candidate.id)) return false;
            }
            return true;
        });
    }, [availableSnippets, isEditing, snippet]);

    // Handle toggling the sequence switch
    const handleToggleSteps = (checked: boolean) => {
        setEnableSteps(checked);
        if (checked && steps.length === 0) {
            const currentCmd = form.getFieldValue('command');
            if (currentCmd && currentCmd.trim()) {
                setSteps([{
                    id: generateStepId(),
                    type: 'command',
                    command: currentCmd.trim()
                }]);
            }
        }
    };

    const handleAddSnippetStep = () => {
        if (!selectedSnippetToAdd) return;
        setSteps(prev => [
            ...prev,
            {
                id: generateStepId(),
                type: 'snippet',
                snippetId: selectedSnippetToAdd
            }
        ]);
        setSelectedSnippetToAdd(undefined);
    };

    const handleAddCustomCommandStep = () => {
        setSteps(prev => [
            ...prev,
            {
                id: generateStepId(),
                type: 'command',
                command: ''
            }
        ]);
    };

    const handleUpdateStepCommand = (id: string, command: string) => {
        setSteps(prev => prev.map(s => s.id === id ? { ...s, command } : s));
    };

    const handleMoveStep = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= steps.length) return;
        setSteps(prev => {
            const next = [...prev];
            const temp = next[index];
            next[index] = next[targetIndex];
            next[targetIndex] = temp;
            return next;
        });
    };

    const handleRemoveStep = (id: string) => {
        setSteps(prev => prev.filter(s => s.id !== id));
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            if (enableSteps && steps.length === 0 && (!values.command || !values.command.trim())) {
                setError(t('snippet.no_steps'));
                return;
            }

            setIsSaving(true);
            setError(null);

            const isSecretValue = Boolean(values.isSecret);
            const finalSteps = enableSteps && steps.length > 0 ? steps : undefined;

            let commandValue = (values.command || '').trim();
            if (enableSteps && !commandValue && finalSteps && finalSteps.length > 0) {
                // Generate a friendly summary command
                commandValue = finalSteps.map(s => {
                    if (s.type === 'snippet') {
                        const target = availableSnippets.find(x => x.id === s.snippetId);
                        return `[${target ? target.name : 'Snippet'}]`;
                    }
                    return s.command || '';
                }).filter(Boolean).join('; ');
            }

            if (!commandValue && (!finalSteps || finalSteps.length === 0)) {
                setError(t('snippet.command_required'));
                setIsSaving(false);
                return;
            }

            if (isEditing && snippet) {
                await window.ssm.snippetUpdate({
                    id: snippet.id,
                    name: values.name.trim(),
                    command: commandValue,
                    isSecret: isSecretValue,
                    steps: finalSteps,
                });
                message.success(t('snippet.snippet_updated'));
            } else {
                await window.ssm.snippetAdd({
                    name: values.name.trim(),
                    command: commandValue,
                    isSecret: isSecretValue,
                    steps: finalSteps,
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
                    {enableSteps ? (
                        <UnorderedListOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                    ) : isSecret ? (
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
            width={850}
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

                <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 16 }}>
                    {/* Secret Checkbox (only relevant if not a sequence of steps) */}
                    {!enableSteps && (
                        <Form.Item
                            name="isSecret"
                            valuePropName="checked"
                            style={{ marginBottom: 0 }}
                        >
                            <Checkbox>
                                <span style={{ fontWeight: 500 }}>Secret</span>
                            </Checkbox>
                        </Form.Item>
                    )}

                    {/* Enable sequence / nesting toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Switch
                            checked={enableSteps}
                            onChange={handleToggleSteps}
                            id="toggle-nested-snippets"
                        />
                        <span style={{ fontWeight: 500 }}>
                            {t('snippet.enable_steps')}
                        </span>
                    </div>
                </div>

                {/* Single Command Mode */}
                {!enableSteps ? (
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
                                rows={10}
                                style={{ fontFamily: 'monospace' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        handleSave();
                                    }
                                }}
                            />
                        )}
                    </Form.Item>
                ) : (
                    /* Nested Steps / Unified Ordered Sequence Mode */
                    <div style={{ marginBottom: 16 }}>
                        <div style={{
                            padding: '12px 16px',
                            background: token.colorFillAlter,
                            borderRadius: token.borderRadiusLG,
                            marginBottom: 16
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text strong style={{ fontSize: 14 }}>
                                    <UnorderedListOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
                                    {t('snippet.steps_title')}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('snippet.steps_description')}
                                </Text>
                            </div>

                            {/* Actions bar to add steps */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Select
                                    placeholder={t('snippet.select_snippet_placeholder')}
                                    style={{ flex: 1, minWidth: 220 }}
                                    value={selectedSnippetToAdd}
                                    onChange={val => setSelectedSnippetToAdd(val)}
                                    allowClear
                                    options={nestableSnippets.map(s => ({
                                        value: s.id,
                                        label: (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {s.isSecret ? (
                                                    <LockOutlined style={{ color: '#faad14', fontSize: 12 }} />
                                                ) : s.steps && s.steps.length > 0 ? (
                                                    <UnorderedListOutlined style={{ color: '#1677ff', fontSize: 12 }} />
                                                ) : (
                                                    <CodeOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                                                )}
                                                <span>{s.name}</span>
                                            </div>
                                        )
                                    }))}
                                />
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={handleAddSnippetStep}
                                    disabled={!selectedSnippetToAdd}
                                >
                                    {t('snippet.add_saved_snippet')}
                                </Button>
                                <Button
                                    icon={<CodeOutlined />}
                                    onClick={handleAddCustomCommandStep}
                                >
                                    {t('snippet.add_custom_step')}
                                </Button>
                            </div>
                        </div>

                        {/* Ordered Steps List */}
                        {steps.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                                {steps.map((step, index) => {
                                    const isSnippetType = step.type === 'snippet';
                                    const targetSnippet = isSnippetType ? availableSnippets.find(s => s.id === step.snippetId) : null;

                                    return (
                                        <Card
                                            key={step.id}
                                            size="small"
                                            style={{
                                                borderColor: token.colorBorderSecondary,
                                                background: token.colorBgContainer
                                            }}
                                            bodyStyle={{ padding: '8px 12px' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                {/* Step order index */}
                                                <div style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: '50%',
                                                    background: token.colorFillContent,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    flexShrink: 0
                                                }}>
                                                    {index + 1}
                                                </div>

                                                {/* Step Content */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {isSnippetType ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                                            <Tag color="blue" style={{ margin: 0, flexShrink: 0 }}>
                                                                <CodeOutlined style={{ marginRight: 4 }} />
                                                                {t('snippet.step_snippet')}
                                                            </Tag>
                                                            <Text strong ellipsis style={{ fontSize: 13, flex: 1 }}>
                                                                {targetSnippet ? targetSnippet.name : `[${step.snippetId}]`}
                                                            </Text>
                                                            {targetSnippet && (
                                                                <Text type="secondary" ellipsis style={{ fontSize: 11, fontFamily: 'monospace', maxWidth: 260 }}>
                                                                    {targetSnippet.isSecret ? '••••••••' : targetSnippet.command}
                                                                </Text>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <Tag color="green" style={{ margin: 0, flexShrink: 0 }}>
                                                                {t('snippet.step_command')}
                                                            </Tag>
                                                            <Input
                                                                size="small"
                                                                placeholder={t('snippet.step_custom_placeholder')}
                                                                value={step.command || ''}
                                                                onChange={e => handleUpdateStepCommand(step.id, e.target.value)}
                                                                style={{ fontFamily: 'monospace' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <Space size={4} style={{ flexShrink: 0 }}>
                                                    <Tooltip title={t('snippet.move_up')}>
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<ArrowUpOutlined />}
                                                            disabled={index === 0}
                                                            onClick={() => handleMoveStep(index, 'up')}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip title={t('snippet.move_down')}>
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            icon={<ArrowDownOutlined />}
                                                            disabled={index === steps.length - 1}
                                                            onClick={() => handleMoveStep(index, 'down')}
                                                        />
                                                    </Tooltip>
                                                    <Tooltip title={t('snippet.remove_step')}>
                                                        <Button
                                                            size="small"
                                                            type="text"
                                                            danger
                                                            icon={<DeleteOutlined />}
                                                            onClick={() => handleRemoveStep(step.id)}
                                                        />
                                                    </Tooltip>
                                                </Space>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{
                                padding: 24,
                                textAlign: 'center',
                                color: token.colorTextSecondary,
                                background: token.colorFillAlter,
                                borderRadius: token.borderRadius,
                                border: `1px dashed ${token.colorBorder}`
                            }}>
                                {t('snippet.no_steps')}
                            </div>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <Alert
                        type="error"
                        message={error}
                        showIcon
                        style={{ marginTop: 12 }}
                    />
                )}
            </Form>
        </Modal>
    );
};

