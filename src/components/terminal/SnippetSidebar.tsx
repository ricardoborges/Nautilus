/**
 * SnippetSidebar Component
 * 
 * Sidebar for managing and executing command snippets in the terminal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { List, Button, Tooltip, Space, Typography, Input, Empty, Popconfirm, message, theme } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    SearchOutlined,
    CodeOutlined
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
            s.command.toLowerCase().includes(searchText.toLowerCase())
        );
        setFilteredSnippets(filtered);
    }, [searchText, snippets]);

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
                        renderItem={(snippet) => (
                            <List.Item
                                style={{ 
                                    padding: '8px 16px', 
                                    cursor: 'pointer',
                                    transition: 'background 0.3s'
                                }}
                                className="snippet-item"
                                actions={[
                                    <Tooltip title={t('common.edit')}>
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
                                ]}
                                onClick={() => handleExecute(snippet)}
                            >
                                <List.Item.Meta
                                    title={
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <PlayCircleOutlined style={{ color: '#52c41a' }} />
                                            <Text strong style={{ fontSize: 13 }}>{snippet.name}</Text>
                                        </div>
                                    }
                                    description={
                                        <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: snippet.command }}>
                                            {snippet.command}
                                        </Text>
                                    }
                                />
                            </List.Item>
                        )}
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
            `}</style>
        </div>
    );
};
