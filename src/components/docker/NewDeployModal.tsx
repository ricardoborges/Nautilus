/**
 * New Deploy Modal Component
 * 
 * Provides two deployment options:
 * A) Stack Editor (YAML First) - Paste docker-compose.yml and deploy
 * B) Docker Run Converter - Paste docker run command and convert to Compose
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Modal,
    Tabs,
    Button,
    Input,
    Space,
    Typography,
    Alert,
    Spin,
    Tooltip,
    Form,
    theme,
} from 'antd';
import {
    CodeOutlined,
    ThunderboltOutlined,
    RocketOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    CopyOutlined,
    PlayCircleOutlined,
    SettingOutlined,
    FolderOutlined,
} from '@ant-design/icons';
import CodeMirror from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface NewDeployModalProps {
    open: boolean;
    onClose: () => void;
    connectionId: string;
    stacksDirectory: string;
    onOpenSettings?: () => void;
    onDeploySuccess: () => void;
}

// Simple YAML validation
const validateYaml = (content: string): { valid: boolean; error?: string } => {
    if (!content.trim()) {
        return { valid: false, error: 'YAML content is required' };
    }

    // Check for basic docker-compose structure
    const lines = content.split('\n');
    let hasVersion = false;
    let hasServices = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('version:') || trimmed.startsWith("version:")) {
            hasVersion = true;
        }
        if (trimmed === 'services:' || trimmed.startsWith('services:')) {
            hasServices = true;
        }
    }

    // Check for proper YAML indentation (basic check)
    const yamlErrors: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        // Check for tabs (YAML should use spaces)
        if (line.includes('\t')) {
            yamlErrors.push(`Line ${i + 1}: YAML should use spaces, not tabs`);
        }

        // Check for improper colons
        if (line.includes(': ') && line.trim().endsWith(':')) {
            // This is likely okay, it's a key with a nested value
        }
    }

    if (yamlErrors.length > 0) {
        return { valid: false, error: yamlErrors.join('\n') };
    }

    if (!hasServices) {
        return { valid: false, error: 'Missing "services:" section. This is required for docker-compose files.' };
    }

    return { valid: true };
};

// Detect if input is a docker run command
const isDockerRunCommand = (input: string): boolean => {
    const trimmed = input.trim().toLowerCase();
    return trimmed.startsWith('docker run') || trimmed.startsWith('docker container run');
};

export const NewDeployModal: React.FC<NewDeployModalProps> = ({
    open,
    onClose,
    connectionId,
    stacksDirectory,
    onOpenSettings,
    onDeploySuccess,
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const isDark = token.colorBgContainer === '#141414' || token.colorBgBase?.includes('14');

    // Stack Editor state
    const [stackName, setStackName] = useState('');
    const [yamlContent, setYamlContent] = useState(`version: "3.8"

services:
  # Define your services here
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`);
    const [yamlError, setYamlError] = useState<string | null>(null);
    const [deployLoading, setDeployLoading] = useState(false);
    const [deployError, setDeployError] = useState<string | null>(null);
    const [deploySuccess, setDeploySuccess] = useState(false);

    // Docker Run Converter state
    const [dockerRunCommand, setDockerRunCommand] = useState('');
    const [convertedCompose, setConvertedCompose] = useState('');
    const [convertLoading, setConvertLoading] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);
    const [quickStackName, setQuickStackName] = useState('');
    const [quickDeployLoading, setQuickDeployLoading] = useState(false);

    // Active tab
    const [activeTab, setActiveTab] = useState('stack-editor');

    // Reset state when modal opens/closes
    const handleClose = useCallback(() => {
        setStackName('');
        setYamlError(null);
        setDeployLoading(false);
        setDeployError(null);
        setDeploySuccess(false);
        setDockerRunCommand('');
        setConvertedCompose('');
        setConvertLoading(false);
        setConvertError(null);
        setQuickStackName('');
        setQuickDeployLoading(false);
        setActiveTab('stack-editor');
        onClose();
    }, [onClose]);

    // Validate YAML on change
    const handleYamlChange = useCallback((value: string) => {
        setYamlContent(value);
        const result = validateYaml(value);
        if (!result.valid) {
            setYamlError(result.error || 'Invalid YAML');
        } else {
            setYamlError(null);
        }
    }, []);

    // Deploy stack from YAML
    const handleDeployStack = useCallback(async () => {
        if (!stackName.trim()) {
            setDeployError(t('docker.deploy.stack_name_required'));
            return;
        }

        const validation = validateYaml(yamlContent);
        if (!validation.valid) {
            setDeployError(validation.error || t('docker.deploy.invalid_yaml'));
            return;
        }

        setDeployLoading(true);
        setDeployError(null);
        setDeploySuccess(false);

        try {
            await window.ssm.dockerDeployStack(connectionId, stackName.trim(), yamlContent, stacksDirectory);
            setDeploySuccess(true);
            onDeploySuccess();
            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);
        } catch (error) {
            const err = error as Error;
            setDeployError(err.message || t('docker.deploy.deploy_error'));
        } finally {
            setDeployLoading(false);
        }
    }, [connectionId, stackName, yamlContent, stacksDirectory, t, onDeploySuccess, handleClose]);

    // Convert docker run to compose
    const handleConvertDockerRun = useCallback(async () => {
        if (!dockerRunCommand.trim()) {
            setConvertError(t('docker.deploy.docker_run_required'));
            return;
        }

        if (!isDockerRunCommand(dockerRunCommand)) {
            setConvertError(t('docker.deploy.invalid_docker_run'));
            return;
        }

        setConvertLoading(true);
        setConvertError(null);

        try {
            const result = await window.ssm.dockerConvertRun(connectionId, dockerRunCommand.trim());
            setConvertedCompose(result);

            // Extract suggested name from the command (image name)
            const imageMatch = dockerRunCommand.match(/(?:docker run|docker container run).*?\s+([a-z0-9._/-]+(?::[a-z0-9._-]+)?)\s*$/i);
            if (imageMatch) {
                const imageName = imageMatch[1].split('/').pop()?.split(':')[0] || 'app';
                setQuickStackName(imageName.replace(/[^a-zA-Z0-9-_]/g, '-'));
            }
        } catch (error) {
            const err = error as Error;
            setConvertError(err.message || t('docker.deploy.convert_error'));
        } finally {
            setConvertLoading(false);
        }
    }, [connectionId, dockerRunCommand, t]);

    // Deploy from converted compose
    const handleQuickDeploy = useCallback(async () => {
        if (!quickStackName.trim()) {
            setConvertError(t('docker.deploy.stack_name_required'));
            return;
        }

        if (!convertedCompose.trim()) {
            setConvertError(t('docker.deploy.no_compose_to_deploy'));
            return;
        }

        setQuickDeployLoading(true);
        setConvertError(null);

        try {
            await window.ssm.dockerDeployStack(connectionId, quickStackName.trim(), convertedCompose, stacksDirectory);
            setDeploySuccess(true);
            onDeploySuccess();
            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);
        } catch (error) {
            const err = error as Error;
            setConvertError(err.message || t('docker.deploy.deploy_error'));
        } finally {
            setQuickDeployLoading(false);
        }
    }, [connectionId, quickStackName, convertedCompose, stacksDirectory, t, onDeploySuccess, handleClose]);

    // Copy converted compose to clipboard
    const handleCopyCompose = useCallback(() => {
        navigator.clipboard.writeText(convertedCompose);
    }, [convertedCompose]);

    // Use converted compose in Stack Editor
    const handleUseInEditor = useCallback(() => {
        setYamlContent(convertedCompose);
        setStackName(quickStackName);
        setActiveTab('stack-editor');
    }, [convertedCompose, quickStackName]);

    return (
        <Modal
            title={
                <Space>
                    <RocketOutlined style={{ color: token.colorPrimary }} />
                    {t('docker.deploy.title')}
                </Space>
            }
            open={open}
            onCancel={handleClose}
            width={900}
            footer={null}
            destroyOnClose
        >
            {deploySuccess && (
                <Alert
                    message={t('docker.deploy.success')}
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* Stack directory info */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                marginBottom: 16,
                background: token.colorFillQuaternary,
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorBorderSecondary}`,
            }}>
                <Space>
                    <FolderOutlined style={{ color: token.colorTextSecondary }} />
                    <Text type="secondary">
                        {t('docker.deploy.deploy_directory')}: <Text code>{stacksDirectory}</Text>
                    </Text>
                </Space>
                {onOpenSettings && (
                    <Tooltip title={t('common.settings')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<SettingOutlined />}
                            onClick={() => {
                                onOpenSettings();
                            }}
                        />
                    </Tooltip>
                )}
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'stack-editor',
                        label: (
                            <Space>
                                <CodeOutlined />
                                {t('docker.deploy.stack_editor')}
                            </Space>
                        ),
                        children: (
                            <div>
                                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                                    {t('docker.deploy.stack_editor_desc')}
                                </Paragraph>

                                <Form layout="vertical">
                                    <Form.Item
                                        label={t('docker.deploy.stack_name')}
                                        required
                                        validateStatus={deployError && !stackName.trim() ? 'error' : undefined}
                                    >
                                        <Input
                                            placeholder={t('docker.deploy.stack_name_placeholder')}
                                            value={stackName}
                                            onChange={(e) => setStackName(e.target.value)}
                                            style={{ maxWidth: 300 }}
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        label={t('docker.deploy.compose_yaml')}
                                        required
                                        validateStatus={yamlError ? 'warning' : undefined}
                                        help={yamlError}
                                    >
                                        <div style={{
                                            border: `1px solid ${yamlError ? token.colorWarning : token.colorBorder}`,
                                            borderRadius: token.borderRadius,
                                            overflow: 'hidden',
                                        }}>
                                            <CodeMirror
                                                value={yamlContent}
                                                height="350px"
                                                theme={isDark ? oneDark : undefined}
                                                extensions={[yaml()]}
                                                onChange={handleYamlChange}
                                                basicSetup={{
                                                    lineNumbers: true,
                                                    highlightActiveLineGutter: true,
                                                    highlightActiveLine: true,
                                                    foldGutter: true,
                                                }}
                                            />
                                        </div>
                                    </Form.Item>
                                </Form>

                                {deployError && (
                                    <Alert
                                        message={deployError}
                                        type="error"
                                        showIcon
                                        icon={<ExclamationCircleOutlined />}
                                        style={{ marginBottom: 16 }}
                                    />
                                )}

                                <div style={{ textAlign: 'right', marginTop: 16 }}>
                                    <Space>
                                        <Button onClick={handleClose}>
                                            {t('common.cancel')}
                                        </Button>
                                        <Button
                                            type="primary"
                                            icon={<PlayCircleOutlined />}
                                            onClick={handleDeployStack}
                                            loading={deployLoading}
                                            disabled={!!yamlError || !stackName.trim()}
                                        >
                                            {t('docker.deploy.deploy')}
                                        </Button>
                                    </Space>
                                </div>
                            </div>
                        ),
                    },
                    {
                        key: 'quick-run',
                        label: (
                            <Space>
                                <ThunderboltOutlined />
                                {t('docker.deploy.quick_run')}
                            </Space>
                        ),
                        children: (
                            <div>
                                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                                    {t('docker.deploy.quick_run_desc')}
                                </Paragraph>

                                <Form layout="vertical">
                                    <Form.Item
                                        label={t('docker.deploy.docker_run_command')}
                                        required
                                    >
                                        <TextArea
                                            placeholder={t('docker.deploy.docker_run_placeholder')}
                                            value={dockerRunCommand}
                                            onChange={(e) => setDockerRunCommand(e.target.value)}
                                            rows={4}
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                    </Form.Item>

                                    <Button
                                        type="primary"
                                        icon={<ThunderboltOutlined />}
                                        onClick={handleConvertDockerRun}
                                        loading={convertLoading}
                                        disabled={!dockerRunCommand.trim()}
                                        style={{ marginBottom: 16 }}
                                    >
                                        {t('docker.deploy.convert')}
                                    </Button>
                                </Form>

                                {convertError && (
                                    <Alert
                                        message={convertError}
                                        type="error"
                                        showIcon
                                        icon={<ExclamationCircleOutlined />}
                                        style={{ marginBottom: 16 }}
                                    />
                                )}

                                {convertedCompose && (
                                    <div>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: 8,
                                        }}>
                                            <Text strong>{t('docker.deploy.converted_compose')}</Text>
                                            <Space>
                                                <Tooltip title={t('common.copy')}>
                                                    <Button
                                                        size="small"
                                                        icon={<CopyOutlined />}
                                                        onClick={handleCopyCompose}
                                                    />
                                                </Tooltip>
                                                <Button
                                                    size="small"
                                                    onClick={handleUseInEditor}
                                                >
                                                    {t('docker.deploy.use_in_editor')}
                                                </Button>
                                            </Space>
                                        </div>

                                        <div style={{
                                            border: `1px solid ${token.colorBorder}`,
                                            borderRadius: token.borderRadius,
                                            overflow: 'hidden',
                                            marginBottom: 16,
                                        }}>
                                            <CodeMirror
                                                value={convertedCompose}
                                                height="200px"
                                                theme={isDark ? oneDark : undefined}
                                                extensions={[yaml()]}
                                                editable={false}
                                                basicSetup={{
                                                    lineNumbers: true,
                                                    highlightActiveLineGutter: false,
                                                    highlightActiveLine: false,
                                                }}
                                            />
                                        </div>

                                        <Form layout="vertical">
                                            <Form.Item
                                                label={t('docker.deploy.stack_name')}
                                                required
                                            >
                                                <Input
                                                    placeholder={t('docker.deploy.stack_name_placeholder')}
                                                    value={quickStackName}
                                                    onChange={(e) => setQuickStackName(e.target.value)}
                                                    style={{ maxWidth: 300 }}
                                                />
                                            </Form.Item>
                                        </Form>

                                        <div style={{ textAlign: 'right' }}>
                                            <Space>
                                                <Button onClick={handleClose}>
                                                    {t('common.cancel')}
                                                </Button>
                                                <Button
                                                    type="primary"
                                                    icon={<PlayCircleOutlined />}
                                                    onClick={handleQuickDeploy}
                                                    loading={quickDeployLoading}
                                                    disabled={!quickStackName.trim()}
                                                >
                                                    {t('docker.deploy.deploy_as_stack')}
                                                </Button>
                                            </Space>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
};

export default NewDeployModal;
