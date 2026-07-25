/**
 * EnvEditorModal Component
 *
 * Structured editor for a remote .env file: every variable is an individual
 * key/value field instead of raw text. Comments, blank lines and unparsed lines
 * are preserved on save, so editing one variable never rewrites the rest.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Modal, Input, Button, Space, Typography, Tooltip, Alert,
    Empty, Spin, Tag, message,
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined,
    SearchOutlined, SaveOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
    parseEnv, serializeEnv, createVariable, findDuplicateKeys, isValidKey,
    type EnvEntry, type EnvVariable,
} from '../../utils/dotenv';
import type { EnvFile } from '../../types';

const { Text } = Typography;

interface EnvEditorModalProps {
    open: boolean;
    connectionId: string;
    file: EnvFile | null;
    onClose: () => void;
    onSaved: () => void;
}

export const EnvEditorModal: React.FC<EnvEditorModalProps> = ({
    open, connectionId, file, onClose, onSaved,
}) => {
    const { t } = useTranslation();
    const [entries, setEntries] = useState<EnvEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showValues, setShowValues] = useState(false);
    const [search, setSearch] = useState('');
    const [dirty, setDirty] = useState(false);

    // Load and parse the file whenever the modal opens for a file
    useEffect(() => {
        if (!open || !file) return;

        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setSearch('');
        setShowValues(false);
        setDirty(false);

        window.ssm.sftpReadFile(connectionId, file.path)
            .then(content => {
                if (cancelled) return;
                setEntries(parseEnv(content));
            })
            .catch(err => {
                if (cancelled) return;
                setLoadError((err as Error).message);
                setEntries([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [open, file, connectionId]);

    const variables = useMemo(
        () => entries.filter((e): e is EnvVariable => e.kind === 'variable'),
        [entries]
    );

    const visibleVariables = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return variables;
        return variables.filter(v =>
            v.key.toLowerCase().includes(term) || v.value.toLowerCase().includes(term)
        );
    }, [variables, search]);

    const duplicates = useMemo(() => findDuplicateKeys(entries), [entries]);
    const invalidKeys = useMemo(
        () => variables.filter(v => v.key && !isValidKey(v.key)).map(v => v.key),
        [variables]
    );
    const hasEmptyKey = useMemo(() => variables.some(v => !v.key.trim()), [variables]);

    const updateVariable = useCallback((id: string, patch: Partial<EnvVariable>) => {
        setEntries(prev => prev.map(entry =>
            entry.kind === 'variable' && entry.id === id ? { ...entry, ...patch } : entry
        ));
        setDirty(true);
    }, []);

    const removeVariable = useCallback((id: string) => {
        setEntries(prev => prev.filter(entry => !(entry.kind === 'variable' && entry.id === id)));
        setDirty(true);
    }, []);

    const addVariable = useCallback(() => {
        setEntries(prev => [...prev, createVariable()]);
        setSearch('');
        setDirty(true);
    }, []);

    const handleSave = useCallback(async () => {
        if (!file) return;

        if (hasEmptyKey) {
            message.error(t('env.error_empty_key'));
            return;
        }
        if (invalidKeys.length > 0) {
            message.error(t('env.error_invalid_key', { keys: invalidKeys.join(', ') }));
            return;
        }

        setSaving(true);
        try {
            await window.ssm.sftpWriteFile(connectionId, file.path, serializeEnv(entries));
            message.success(t('env.save_success', { name: file.name }));
            setDirty(false);
            onSaved();
            onClose();
        } catch (err) {
            message.error(t('env.save_error', { message: (err as Error).message }));
        } finally {
            setSaving(false);
        }
    }, [file, entries, connectionId, hasEmptyKey, invalidKeys, onSaved, onClose, t]);

    const handleClose = useCallback(() => {
        if (!dirty) {
            onClose();
            return;
        }
        Modal.confirm({
            title: t('env.discard_title'),
            content: t('env.discard_message'),
            okText: t('env.discard_confirm'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: onClose,
        });
    }, [dirty, onClose, t]);

    return (
        <Modal
            open={open}
            title={
                <Space>
                    <Text strong>{file?.name}</Text>
                    <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                        {file?.directory}
                    </Text>
                </Space>
            }
            width={860}
            onCancel={handleClose}
            maskClosable={false}
            footer={[
                <Button key="cancel" onClick={handleClose}>
                    {t('common.cancel')}
                </Button>,
                <Button
                    key="save"
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    disabled={loading || !!loadError}
                    onClick={handleSave}
                >
                    {t('env.save')}
                </Button>,
            ]}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin />
                </div>
            ) : loadError ? (
                <Alert type="error" showIcon message={t('env.load_error')} description={loadError} />
            ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Input
                            placeholder={t('env.search_placeholder')}
                            prefix={<SearchOutlined />}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            allowClear
                            style={{ width: 260 }}
                        />
                        <Space>
                            <Tag>{t('env.variable_count', { count: variables.length })}</Tag>
                            <Tooltip title={showValues ? t('env.hide_values') : t('env.show_values')}>
                                <Button
                                    icon={showValues ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                    onClick={() => setShowValues(v => !v)}
                                />
                            </Tooltip>
                            <Button type="dashed" icon={<PlusOutlined />} onClick={addVariable}>
                                {t('env.add_variable')}
                            </Button>
                        </Space>
                    </Space>

                    {duplicates.length > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            icon={<WarningOutlined />}
                            message={t('env.duplicate_warning', { keys: duplicates.join(', ') })}
                        />
                    )}

                    <div style={{ maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
                        {visibleVariables.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={search ? t('env.no_matches') : t('env.no_variables')}
                            />
                        ) : (
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                {visibleVariables.map(variable => {
                                    const keyInvalid = Boolean(variable.key) && !isValidKey(variable.key);
                                    return (
                                        <Space.Compact key={variable.id} style={{ width: '100%' }}>
                                            <Input
                                                value={variable.key}
                                                onChange={e => updateVariable(variable.id, { key: e.target.value })}
                                                placeholder={t('env.key_placeholder')}
                                                status={keyInvalid ? 'error' : undefined}
                                                style={{
                                                    width: '38%',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 500,
                                                }}
                                            />
                                            <Input
                                                value={variable.value}
                                                onChange={e => updateVariable(variable.id, { value: e.target.value })}
                                                placeholder={t('env.value_placeholder')}
                                                type={showValues ? 'text' : 'password'}
                                                style={{ fontFamily: 'monospace' }}
                                            />
                                            <Tooltip title={t('env.remove_variable')}>
                                                <Button
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    onClick={() => removeVariable(variable.id)}
                                                />
                                            </Tooltip>
                                        </Space.Compact>
                                    );
                                })}
                            </Space>
                        )}
                    </div>

                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('env.preserve_note')}
                    </Text>
                </Space>
            )}
        </Modal>
    );
};

export default EnvEditorModal;
