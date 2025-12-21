/**
 * FileManager Component
 * 
 * SFTP file browser with navigation, upload, download, editing and media preview.
 * Uses Ant Design components with CodeMirror editor integration and theme support.
 */


import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { php } from '@codemirror/lang-php';
import { oneDark } from '@codemirror/theme-one-dark';
import {
    Card,
    Button,
    Space,
    Typography,
    Empty,
    Breadcrumb,
    List,
    Tooltip,
    Modal,
    Input,
    message,
    Spin,
    Alert,
} from 'antd';
import {
    FolderOutlined,
    FileOutlined,
    PictureOutlined,
    PlayCircleOutlined,
    CustomerServiceOutlined,
    FileZipOutlined,
    CodeOutlined,
    FileTextOutlined,
    UploadOutlined,
    DownloadOutlined,
    ReloadOutlined,
    DeleteOutlined,
    ArrowUpOutlined,
    FolderAddOutlined,
    SaveOutlined,
    HomeOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from '@ant-design/icons';
import type { SFTPFile } from '../../types';

const { Text } = Typography;

const getFileIcon = (file: SFTPFile): React.ReactNode => {
    if (file.isDirectory) return <FolderOutlined style={{ color: '#faad14', fontSize: 18 }} />;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) {
        return <PictureOutlined style={{ color: '#eb2f96', fontSize: 18 }} />;
    }
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
        return <PlayCircleOutlined style={{ color: '#722ed1', fontSize: 18 }} />;
    }
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
        return <CustomerServiceOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
    }
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) {
        return <FileZipOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'rb', 'php'].includes(ext)) {
        return <CodeOutlined style={{ color: '#1677ff', fontSize: 18 }} />;
    }
    if (['txt', 'md', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'sh', 'conf', 'log'].includes(ext)) {
        return <FileTextOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />;
    }

    return <FileOutlined style={{ color: '#595959', fontSize: 18 }} />;
};

const formatSize = (bytes?: number): string => {
    if (bytes === undefined) return '--';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getLanguageExtension = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, any> = {
        'js': javascript({ jsx: false }),
        'jsx': javascript({ jsx: true }),
        'ts': javascript({ jsx: false, typescript: true }),
        'tsx': javascript({ jsx: true, typescript: true }),
        'py': python(),
        'json': json(),
        'yaml': markdown(), // CodeMirror não tem YAML nativo, usa markdown como alternativa
        'yml': markdown(),
        'xml': xml(),
        'html': html(),
        'css': css(),
        'scss': css(),
        'md': markdown(),
        'sh': javascript(), // Shell como JavaScript para syntax básica
        'bash': javascript(),
        'sql': sql(),
        'go': rust(), // Go como Rust para syntax básica
        'rs': rust(),
        'java': java(),
        'c': cpp(),
        'cpp': cpp(),
        'h': cpp(),
        'rb': python(), // Ruby como Python para syntax básica
        'php': php(),
    };
    return langMap[ext] || [];
};

const isMediaFile = (filename: string): 'image' | 'video' | 'audio' | null => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
    return null;
};

interface FileManagerProps {
    connectionId?: string;
}

export const FileManager: React.FC<FileManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { activeConnectionId: contextConnectionId } = useConnection();
    const { themeMode } = useTheme();

    // Use prop connectionId if provided, otherwise fall back to context
    const activeConnectionId = propConnectionId ?? contextConnectionId;
    const [currentPath, setCurrentPath] = useState('/');
    const [files, setFiles] = useState<SFTPFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<SFTPFile | null>(null);
    const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);

    // Editor state
    const [openFile, setOpenFile] = useState<{ path: string; name: string; content: string } | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [isEditorDirty, setIsEditorDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ type: 'image' | 'video' | 'audio'; src: string } | null>(null);

    // New folder modal
    const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    // Load directory contents
    const loadDirectory = useCallback(async (path: string) => {
        if (!activeConnectionId) return;

        setIsLoading(true);
        setError(null);
        setSelectedFile(null);

        try {
            const list = await window.ssm.sftpList(activeConnectionId, path);
            // Sort: directories first, then by name
            list.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
            setFiles(list);
            setCurrentPath(path);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId]);

    // Navigate to a directory
    const navigateTo = useCallback((path: string) => {
        loadDirectory(path);
    }, [loadDirectory]);

    // Go up one directory
    const navigateUp = useCallback(() => {
        if (currentPath === '/') return;
        const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        navigateTo(parentPath);
    }, [currentPath, navigateTo]);

    // Build full file path
    const getFullPath = useCallback((file: SFTPFile) => {
        return currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    }, [currentPath]);

    // Handle file click (open)
    const handleFileOpen = useCallback(async (file: SFTPFile) => {
        if (file.isDirectory) {
            navigateTo(getFullPath(file));
            return;
        }

        // Check if it's a media file
        const mediaType = isMediaFile(file.name);
        if (mediaType) {
            try {
                const base64 = await window.ssm.sftpReadFileAsBase64(activeConnectionId!, getFullPath(file));
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const mimeMap: Record<string, string> = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                    svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
                    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
                    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
                };
                const mime = mimeMap[ext] || 'application/octet-stream';
                setMediaPreview({ type: mediaType, src: `data:${mime};base64,${base64}` });
                setOpenFile(null);
            } catch (err) {
                message.error(t('files.media_error'));
                console.error('Failed to load media:', err);
            }
            return;
        }

        // Open text file in editor
        try {
            const content = await window.ssm.sftpReadFile(activeConnectionId!, getFullPath(file));
            setOpenFile({ path: getFullPath(file), name: file.name, content });
            setEditorContent(content);
            setMediaPreview(null);
            setIsEditorDirty(false);
        } catch (err) {
            message.error(t('files.open_error'));
            console.error('Failed to open file:', err);
        }
    }, [activeConnectionId, getFullPath, navigateTo, t]);

    // Handle save file
    const handleSaveFile = useCallback(async () => {
        if (!openFile || !activeConnectionId) return;

        setIsSaving(true);
        try {
            await window.ssm.sftpWriteFile(activeConnectionId, openFile.path, editorContent);
            setIsEditorDirty(false);
            message.success(t('files.file_saved'));
        } catch (err) {
            message.error(t('files.save_error', { message: (err as Error).message }));
        } finally {
            setIsSaving(false);
        }
    }, [activeConnectionId, openFile, editorContent, t]);

    // Handle download
    const handleDownload = async () => {
        if (!activeConnectionId || !selectedFile) return;

        try {
            await window.ssm.sftpDownloadFile(activeConnectionId, getFullPath(selectedFile));
            message.success(t('files.download_started'));
        } catch (err) {
            message.error(t('files.download_error'));
            console.error('Download failed:', err);
        }
    };

    // Handle upload
    const handleUpload = async () => {
        if (!activeConnectionId) return;

        try {
            const result = await window.ssm.sftpUploadFile(activeConnectionId, currentPath);
            if (result.success) {
                loadDirectory(currentPath);
                message.success(t('files.upload_complete'));
            }
        } catch (err) {
            message.error(t('files.upload_error'));
            console.error('Upload failed:', err);
        }
    };

    // Handle create folder
    const handleCreateFolder = async () => {
        if (!newFolderName || !activeConnectionId) return;

        try {
            const newPath = currentPath === '/' ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
            await window.ssm.sftpCreateDir(activeConnectionId, newPath);
            loadDirectory(currentPath);
            setNewFolderModalOpen(false);
            setNewFolderName('');
            message.success(t('files.folder_created'));
        } catch (err) {
            message.error((err as Error).message);
        }
    };

    // Handle delete
    const handleDelete = async () => {
        if (!activeConnectionId || !selectedFile) return;

        Modal.confirm({
            title: t('files.delete_confirm_title'),
            content: t('files.delete_confirm_content', { name: selectedFile.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    if (selectedFile.isDirectory) {
                        await window.ssm.sftpDeleteDir(activeConnectionId, getFullPath(selectedFile));
                    } else {
                        await window.ssm.sftpDeleteFile(activeConnectionId, getFullPath(selectedFile));
                    }
                    loadDirectory(currentPath);
                    message.success(t('files.deleted_success'));
                } catch (err) {
                    message.error((err as Error).message);
                }
            },
        });
    };

    // Build breadcrumb items
    const breadcrumbItems = [
        {
            title: <HomeOutlined onClick={() => navigateTo('/')} style={{ cursor: 'pointer' }} />,
        },
        ...currentPath.split('/').filter(Boolean).map((part, idx, arr) => ({
            title: (
                <span
                    onClick={() => navigateTo('/' + arr.slice(0, idx + 1).join('/'))}
                    style={{ cursor: 'pointer' }}
                >
                    {part}
                </span>
            ),
        })),
    ];

    // Load root when connection changes
    useEffect(() => {
        if (activeConnectionId) {
            loadDirectory('/');
        } else {
            setFiles([]);
            setCurrentPath('/');
            setOpenFile(null);
            setMediaPreview(null);
        }
    }, [activeConnectionId, loadDirectory]);

    if (!activeConnectionId) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: 48,
            }}>
                <FolderOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Typography.Title level={4} type="secondary">
                    {t('files.select_connection')}
                </Typography.Title>
                <Text type="secondary">
                    {t('files.select_connection_desc')}
                </Text>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', height: '100%', padding: 16, gap: 16 }}>
            {/* File List Panel */}
            {!isTreeCollapsed && (
                <Card
                    title={t('files.files_title')}
                    size="small"
                    style={{ width: 350, display: 'flex', flexDirection: 'column' }}
                    bodyStyle={{ flex: 1, overflow: 'auto', padding: 0 }}
                    extra={
                        <Space size="small">
                            <Tooltip title={t('files.collapse_tree')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<MenuFoldOutlined />}
                                    onClick={() => setIsTreeCollapsed(true)}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.parent_directory')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ArrowUpOutlined />}
                                    onClick={navigateUp}
                                    disabled={currentPath === '/'}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.refresh')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ReloadOutlined spin={isLoading} />}
                                    onClick={() => loadDirectory(currentPath)}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.new_folder')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<FolderAddOutlined />}
                                    onClick={() => setNewFolderModalOpen(true)}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.upload')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<UploadOutlined />}
                                    onClick={handleUpload}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.download')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    onClick={handleDownload}
                                    disabled={!selectedFile || selectedFile.isDirectory}
                                />
                            </Tooltip>
                            <Tooltip title={t('files.delete_item')}>
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={handleDelete}
                                    disabled={!selectedFile}
                                />
                            </Tooltip>
                        </Space>
                    }
                >
                    {/* Breadcrumb */}
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                        <Breadcrumb items={breadcrumbItems} />
                    </div>

                    {/* File List */}
                    {error ? (
                        <Alert
                            type="error"
                            message={error}
                            showIcon
                            style={{ margin: 12 }}
                        />
                    ) : isLoading ? (
                        <div style={{ textAlign: 'center', padding: 48 }}>
                            <Spin />
                        </div>
                    ) : files.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('files.empty_directory')}
                            style={{ padding: 48 }}
                        />
                    ) : (
                        <List
                            size="small"
                            dataSource={files}
                            renderItem={(file) => (
                                <List.Item
                                    key={file.name}
                                    onClick={() => setSelectedFile(file)}
                                    onDoubleClick={() => handleFileOpen(file)}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '8px 12px',
                                        background: selectedFile?.name === file.name ? '#e6f4ff' : undefined,
                                    }}
                                >
                                    <Space>
                                        {getFileIcon(file)}
                                        <Text ellipsis style={{ maxWidth: 180 }}>{file.name}</Text>
                                    </Space>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {file.isDirectory ? '' : formatSize(file.size)}
                                    </Text>
                                </List.Item>
                            )}
                        />
                    )}
                </Card>
            )}

            {/* Editor/Preview Panel */}
            <Card
                title={
                    openFile ? (
                        <Space>
                            <FileTextOutlined />
                            {openFile.name}
                            {isEditorDirty && <Text type="warning">●</Text>}
                        </Space>
                    ) : mediaPreview ? (
                        <Space>
                            {mediaPreview.type === 'image' && <PictureOutlined />}
                            {mediaPreview.type === 'video' && <PlayCircleOutlined />}
                            {mediaPreview.type === 'audio' && <CustomerServiceOutlined />}
                            {t('files.preview')}
                        </Space>
                    ) : (
                        t('files.editor')
                    )
                }
                size="small"
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                bodyStyle={{ flex: 1, padding: 0, position: 'relative' }}
                extra={
                    <Space>
                        {isTreeCollapsed && (
                            <Tooltip title={t('files.expand_tree')}>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<MenuUnfoldOutlined />}
                                    onClick={() => setIsTreeCollapsed(false)}
                                />
                            </Tooltip>
                        )}
                        {openFile && (
                            <Button
                                type="primary"
                                size="small"
                                icon={<SaveOutlined />}
                                onClick={handleSaveFile}
                                loading={isSaving}
                                disabled={!isEditorDirty}
                            >
                                {t('files.save')}
                            </Button>
                        )}
                    </Space>
                }
            >
                {/* CodeMirror Editor */}
                {openFile && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        overflow: 'auto',
                    }}>
                        <CodeMirror
                            value={editorContent}
                            height="100%"
                            theme={themeMode === 'dark' ? oneDark : undefined}
                            extensions={[getLanguageExtension(openFile.name)]}
                            onChange={(value) => {
                                setEditorContent(value);
                                setIsEditorDirty(value !== openFile.content);
                            }}
                            basicSetup={{
                                lineNumbers: true,
                                highlightActiveLineGutter: true,
                                highlightSpecialChars: true,
                                foldGutter: true,
                                drawSelection: true,
                                dropCursor: true,
                                allowMultipleSelections: true,
                                indentOnInput: true,
                                syntaxHighlighting: true,
                                bracketMatching: true,
                                closeBrackets: true,
                                autocompletion: true,
                                rectangularSelection: true,
                                crosshairCursor: true,
                                highlightActiveLine: true,
                                highlightSelectionMatches: true,
                                closeBracketsKeymap: true,
                                searchKeymap: true,
                                foldKeymap: true,
                                completionKeymap: true,
                                lintKeymap: true,
                            }}
                        />
                    </div>
                )}

                {/* Media Preview */}
                {mediaPreview && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                        background: '#fafafa',
                        overflow: 'auto',
                    }}>
                        {mediaPreview.type === 'image' && (
                            <img src={mediaPreview.src} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )}
                        {mediaPreview.type === 'video' && (
                            <video src={mediaPreview.src} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />
                        )}
                        {mediaPreview.type === 'audio' && (
                            <audio src={mediaPreview.src} controls />
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!openFile && !mediaPreview && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <Empty
                            image={<FileTextOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                            description={t('files.double_click_to_open')}
                        />
                    </div>
                )}
            </Card>

            {/* New Folder Modal */}
            <Modal
                title={t('files.new_folder')}
                open={newFolderModalOpen}
                onOk={handleCreateFolder}
                onCancel={() => {
                    setNewFolderModalOpen(false);
                    setNewFolderName('');
                }}
                okText={t('files.create')}
                cancelText={t('common.cancel')}
            >
                <Input
                    placeholder={t('files.folder_name')}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onPressEnter={handleCreateFolder}
                    autoFocus
                />
            </Modal>
        </div>
    );
};
