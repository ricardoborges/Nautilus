/**
 * SnippetSidebar Component
 * 
 * Sidebar for managing and executing command snippets in the terminal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { List, Button, Tooltip, Space, Typography, Input, Empty, Popconfirm, message, theme, Tag } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    SearchOutlined,
    CodeOutlined,
    LockOutlined,
    EyeOutlined,
    EyeInvisibleOutlined
} from '@ant-design/icons';
import { terminalService } from '../../hooks/useTerminal';
import { SnippetModal } from '../modals/SnippetModal';
import type { Snippet } from '../../types';

const { Text } = Typography;

export const SnippetSidebar: React.FC = () => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [snippets, setSnippets] = useState<Snippet[]>([]);
    const [filteredSnippets, setFilteredSnippets] = useState<Snippet[]>([]);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);

    const fetchSnippets = useCallback(async () => {
        setLoading(true);
        try {
            const data = await window.ssm.snippetsList();
            setSnippets(data);
            setFilteredSnippets(data);
        } catch (error) {
            console.error('Failed to fetch snippets:', error);
            message.error(t('common.error_loading_snippets'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchSnippets();
    }, [fetchSnippets]);

    useEffect(() => {
        const filtered = snippets.filter(s => 
            s.name.toLowerCase().includes(searchText.toLowerCase()) ||
            (!s.isSecret && s.command.toLowerCase().includes(searchText.toLowerCase()))
        );
        setFilteredSnippets(filtered);
    }, [searchText, snippets]);

    const handleToggleSecretVisibility = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setVisibleSecrets(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleExecute = (snippet: Snippet) => {
        if (!terminalService.isReady) {
            message.warning(t('terminal.no_terminal_open'));
            return;
        }
        
        // Add newline to execute immediately
        terminalService.writeToActive(snippet.command + '\n');
        message.success(t('snippet.executing', { name: snippet.name }));
    };

    const handleDelete = async (id: string) => {
        try {
            await window.ssm.snippetRemove(id);
            message.success(t('common.deleted_success'));
            fetchSnippets();
        } catch (error) {
            message.error(t('common.error'));
        }
    };

    const handleEdit = (snippet: Snippet) => {
        setEditingSnippet(snippet);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingSnippet(null);
        setIsModalOpen(true);
    };

    return (
        <div style={{ 
            width: 280, 
            flexShrink: 0,
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            borderLeft: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer
        }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                        <CodeOutlined style={{ marginRight: 8 }} />
                        {t('common.snippets')}
                    </Typography.Title>
                    <Button 
                        type="primary" 
                        size="small" 
                        icon={<PlusOutlined />} 
                        onClick={handleAdd}
                    />
                </div>
                <Input
                    placeholder={t('common.search')}
                    prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    size="small"
                    allowClear
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {filteredSnippets.length > 0 ? (
                    <List
                        dataSource={filteredSnippets}
                        renderItem={(snippet) => {
                            const isSecret = Boolean(snippet.isSecret);
                            const isRevealed = Boolean(visibleSecrets[snippet.id]);
                            const displayedCommand = isSecret && !isRevealed ? '••••••••••••' : snippet.command;

                            return (
                                <List.Item
                                    style={{ 
                                        padding: '8px 12px', 
                                        cursor: 'pointer',
                                        transition: 'background 0.3s'
                                    }}
                                    className="snippet-item"
                                    actions={[
                                        isSecret && (
                                            <Tooltip key="toggle" title={isRevealed ? (t('snippet.hide_secret') || 'Hide') : (t('snippet.show_secret') || 'Reveal')}>
                                                <Button 
                                                    type="text" 
                                                    size="small" 
                                                    icon={isRevealed ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
                                                    onClick={(e) => handleToggleSecretVisibility(snippet.id, e)} 
                                                />
                                            </Tooltip>
                                        ),
                                        <Tooltip key="edit" title={t('common.edit')}>
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                icon={<EditOutlined />} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEdit(snippet);
                                                }} 
                                            />
                                        </Tooltip>,
                                        <Popconfirm
                                            key="delete"
                                            title={t('common.delete')}
                                            description={t('common.confirm_delete')}
                                            onConfirm={(e) => {
                                                e?.stopPropagation();
                                                handleDelete(snippet.id);
                                            }}
                                            onCancel={(e) => e?.stopPropagation()}
                                            okText={t('common.yes')}
                                            cancelText={t('common.no')}
                                        >
                                            <Button 
                                                type="text" 
                                                size="small" 
                                                danger 
                                                icon={<DeleteOutlined />} 
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </Popconfirm>
                                    ].filter(Boolean)}
                                    onClick={() => handleExecute(snippet)}
                                >
                                    <List.Item.Meta
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, width: '100%' }}>
                                                <PlayCircleOutlined style={{ color: '#52c41a', flexShrink: 0 }} />
                                                <Text strong style={{ fontSize: 13, flex: 1, minWidth: 0 }} ellipsis={{ tooltip: snippet.name }}>
                                                    {snippet.name}
                                                </Text>
                                                {isSecret && (
                                                    <Tag 
                                                        color="warning" 
                                                        icon={<LockOutlined />} 
                                                        style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px', flexShrink: 0 }}
                                                    >
                                                        Secret
                                                    </Tag>
                                                )}
                                            </div>
                                        }
                                        description={
                                            <Text 
                                                type="secondary" 
                                                style={{ fontSize: 11, fontFamily: isSecret && !isRevealed ? 'monospace' : undefined }} 
                                                ellipsis={{ tooltip: isSecret && !isRevealed ? 'Secret' : snippet.command }}
                                            >
                                                {displayedCommand}
                                            </Text>
                                        }
                                    />
                                </List.Item>
                            );
                        }}
                    />
                ) : (
                    <Empty 
                        image={Empty.PRESENTED_IMAGE_SIMPLE} 
                        description={t('common.no_results')} 
                        style={{ marginTop: 40 }}
                    />
                )}
            </div>

            <SnippetModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchSnippets}
                snippet={editingSnippet}
            />

            <style>{`
                .snippet-item:hover {
                    background-color: ${token.colorFillAlter} !important;
                }
                .snippet-item .ant-list-item-action {
                    margin-inline-start: 8px !important;
                }
                .snippet-item .ant-list-item-action > li {
                    padding: 0 2px !important;
                }
                .snippet-item .ant-list-item-action .ant-list-item-action-split {
                    display: none !important;
                }
                .snippet-item .ant-list-item-meta-content {
                    min-width: 0 !important;
                }
            `}</style>
        </div>
    );
};
