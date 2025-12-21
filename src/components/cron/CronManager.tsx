/**
 * CronManager Component
 * 
 * Gestão de Crontab com interface amigável para usuários leigos.
 * Permite criar, editar, excluir e visualizar logs de jobs do crontab.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import {
    Card,
    Button,
    Space,
    Typography,
    Empty,
    Input,
    message,
    Modal,
    Table,
    Form,
    Select,
    Checkbox,
    Popconfirm,
    Tag
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    ReloadOutlined,
    EditOutlined,
    DeleteOutlined,
    ClockCircleOutlined,
    PlusOutlined,
    EyeOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import type { CronJob, CronTemplate } from '../../types';

const { Text } = Typography;

// Parse crontab content para array de jobs
const parseCronJobs = (content: string): CronJob[] => {
    const lines = content.split('\n');
    const jobs: CronJob[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const parts = trimmed.split(/\s+/);
        if (parts.length >= 6) {
            jobs.push({
                minute: parts[0],
                hour: parts[1],
                day: parts[2],
                month: parts[3],
                weekday: parts[4],
                command: parts.slice(5).join(' '),
                raw: trimmed
            });
        }
    }

    return jobs;
};

// Serializa jobs para formato crontab
const serializeCronJobs = (jobs: CronJob[]): string => {
    return jobs.map(job => job.raw).join('\n');
};

// Extrai caminho do log do comando (se houver redirecionamento)
const extractLogPath = (command: string): string | null => {
    const matches = command.match(/(?:>>|>)\s*(\S+)/);
    return matches ? matches[1] : null;
};

interface CronManagerProps {
    connectionId?: string;
}

export const CronManager: React.FC<CronManagerProps> = ({ connectionId: propConnectionId }) => {
    const { t, i18n } = useTranslation();
    const { activeConnectionId: contextConnectionId } = useConnection();

    // Use prop connectionId if provided, otherwise fall back to context
    const activeConnectionId = propConnectionId ?? contextConnectionId;
    const [jobs, setJobs] = useState<CronJob[]>([]);
    const [rawContent, setRawContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Modal de criação/edição
    const [isJobModalOpen, setIsJobModalOpen] = useState(false);
    const [editingJobIndex, setEditingJobIndex] = useState<number | null>(null);
    const [form] = Form.useForm();

    // Modal de log
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [logContent, setLogContent] = useState('');
    const [logPath, setLogPath] = useState('');

    // Templates de agendamento
    const getCronTemplates = useCallback((): CronTemplate[] => [
        { label: t('cron.templates.custom'), value: 'custom', cron: ['*', '*', '*', '*', '*'] },
        { label: t('cron.templates.every_minute'), value: 'every_minute', cron: ['*', '*', '*', '*', '*'] },
        { label: t('cron.templates.every_hour'), value: 'every_hour', cron: ['0', '*', '*', '*', '*'] },
        { label: t('cron.templates.daily_midnight'), value: 'daily_midnight', cron: ['0', '0', '*', '*', '*'] },
        { label: t('cron.templates.daily_6am'), value: 'daily_6am', cron: ['0', '6', '*', '*', '*'] },
        { label: t('cron.templates.daily_noon'), value: 'daily_noon', cron: ['0', '12', '*', '*', '*'] },
        { label: t('cron.templates.weekly'), value: 'weekly', cron: ['0', '0', '*', '*', '0'] },
        { label: t('cron.templates.monthly'), value: 'monthly', cron: ['0', '0', '1', '*', '*'] },
    ], [t]);

    // Formata expressão cron para descrição legível
    const formatCronDescription = useCallback((job: CronJob): string => {
        const { minute, hour, day, month, weekday } = job;
        const days = t('cron.descriptions.days', { returnObjects: true }) as string[];

        if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
            return t('cron.descriptions.every_minute');
        }
        if (minute !== '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
            return t('cron.descriptions.every_hour_at', { minute });
        }
        if (minute === '0' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
            return t('cron.descriptions.every_hour');
        }
        if (day === '*' && month === '*' && weekday === '*') {
            return t('cron.descriptions.daily_at', { hour, minute: minute.padStart(2, '0') });
        }
        if (weekday !== '*' && day === '*' && month === '*') {
            const dayName = days[parseInt(weekday)] || weekday;
            return t('cron.descriptions.weekly_at', { day: dayName, hour, minute: minute.padStart(2, '0') });
        }
        if (day !== '*' && month === '*' && weekday === '*') {
            return t('cron.descriptions.monthly_at', { day, hour, minute: minute.padStart(2, '0') });
        }

        return `${minute} ${hour} ${day} ${month} ${weekday}`;
    }, [t]);

    // Carregar crontab
    const loadCrontab = useCallback(async () => {
        if (!activeConnectionId) return;

        setIsLoading(true);
        try {
            const content = await window.ssm.cronList(activeConnectionId);
            setRawContent(content);
            setJobs(parseCronJobs(content));
        } catch (err) {
            console.error('Failed to load crontab:', err);
            message.error(t('cron.crontab_load_error'));
        } finally {
            setIsLoading(false);
        }
    }, [activeConnectionId, t]);

    // Salvar crontab
    const saveCrontab = useCallback(async (newJobs: CronJob[]) => {
        if (!activeConnectionId) return;

        try {
            const content = serializeCronJobs(newJobs);
            await window.ssm.cronSave(activeConnectionId, content);
            setRawContent(content);
            setJobs(newJobs);
            message.success(t('cron.crontab_saved'));
        } catch (err) {
            message.error(t('cron.crontab_save_error', { message: (err as Error).message }));
            throw err;
        }
    }, [activeConnectionId, t]);

    // Ver log
    const viewLog = useCallback(async (path: string) => {
        if (!activeConnectionId) return;

        try {
            const content = await window.ssm.cronReadLog(activeConnectionId, path);
            setLogContent(content || t('cron.log_empty'));
            setLogPath(path);
            setIsLogModalOpen(true);
        } catch (err) {
            message.error(t('cron.log_read_error', { message: (err as Error).message }));
        }
    }, [activeConnectionId, t]);

    // Abrir modal para novo job
    const openNewJobModal = () => {
        setEditingJobIndex(null);
        form.resetFields();
        form.setFieldsValue({
            template: 'custom',
            minute: '*',
            hour: '*',
            day: '*',
            month: '*',
            weekday: '*',
            command: '',
            enableLog: false,
        });
        setIsJobModalOpen(true);
    };

    // Abrir modal para editar job
    const openEditJobModal = (index: number) => {
        const job = jobs[index];
        const logPath = extractLogPath(job.command);

        // Remover redirecionamento do comando se existir
        let cleanCommand = job.command;
        if (logPath) {
            cleanCommand = job.command.replace(/\s*(?:>>|>)\s*\S+.*$/, '').trim();
        }

        setEditingJobIndex(index);
        form.setFieldsValue({
            template: 'custom',
            minute: job.minute,
            hour: job.hour,
            day: job.day,
            month: job.month,
            weekday: job.weekday,
            command: cleanCommand,
            enableLog: !!logPath,
        });
        setIsJobModalOpen(true);
    };

    // Deletar job
    const deleteJob = async (index: number) => {
        const newJobs = jobs.filter((_, i) => i !== index);
        await saveCrontab(newJobs);
    };

    // Salvar job (criar ou editar)
    const handleSaveJob = async () => {
        try {
            const values = await form.validateFields();
            const { minute, hour, day, month, weekday, command, enableLog } = values;

            // Gerar comando com log se habilitado
            let fullCommand = command.trim();
            if (enableLog && fullCommand) {
                // Extrair o script base do comando
                const scriptMatch = fullCommand.match(/(?:^|\s)(\S+\.sh)(?:\s|$)/);
                if (scriptMatch) {
                    const scriptPath = scriptMatch[1];
                    const logPath = scriptPath.replace(/\.sh$/, '.log');
                    fullCommand = `${fullCommand} >> ${logPath} 2>&1`;
                }
            }

            const newJob: CronJob = {
                minute: minute.trim(),
                hour: hour.trim(),
                day: day.trim(),
                month: month.trim(),
                weekday: weekday.trim(),
                command: fullCommand,
                raw: `${minute.trim()} ${hour.trim()} ${day.trim()} ${month.trim()} ${weekday.trim()} ${fullCommand}`
            };

            let newJobs: CronJob[];
            if (editingJobIndex !== null) {
                // Editar job existente
                newJobs = [...jobs];
                newJobs[editingJobIndex] = newJob;
            } else {
                // Adicionar novo job
                newJobs = [...jobs, newJob];
            }

            await saveCrontab(newJobs);
            setIsJobModalOpen(false);
        } catch (err) {
            console.error('Validation failed:', err);
        }
    };

    // Aplicar template
    const handleTemplateChange = (value: string) => {
        const templates = getCronTemplates();
        const template = templates.find(t => t.value === value);
        if (template && value !== 'custom') {
            form.setFieldsValue({
                minute: template.cron[0],
                hour: template.cron[1],
                day: template.cron[2],
                month: template.cron[3],
                weekday: template.cron[4],
            });
        }
    };

    // Load on mount
    useEffect(() => {
        if (activeConnectionId) {
            loadCrontab();
        } else {
            setJobs([]);
            setRawContent('');
        }
    }, [activeConnectionId, loadCrontab]);

    // Colunas da tabela
    const columns: ColumnsType<CronJob> = [
        {
            title: t('cron.minute'),
            dataIndex: 'minute',
            key: 'minute',
            width: 80,
            align: 'center',
            render: (text) => <Tag>{text}</Tag>,
        },
        {
            title: t('cron.hour'),
            dataIndex: 'hour',
            key: 'hour',
            width: 80,
            align: 'center',
            render: (text) => <Tag>{text}</Tag>,
        },
        {
            title: t('cron.day'),
            dataIndex: 'day',
            key: 'day',
            width: 80,
            align: 'center',
            render: (text) => <Tag>{text}</Tag>,
        },
        {
            title: t('cron.month'),
            dataIndex: 'month',
            key: 'month',
            width: 80,
            align: 'center',
            render: (text) => <Tag>{text}</Tag>,
        },
        {
            title: t('cron.weekday'),
            dataIndex: 'weekday',
            key: 'weekday',
            width: 100,
            align: 'center',
            render: (text) => <Tag>{text}</Tag>,
        },
        {
            title: t('cron.command'),
            dataIndex: 'command',
            key: 'command',
            ellipsis: true,
            render: (text, record) => (
                <div>
                    <Text code style={{ fontSize: 12 }}>{text}</Text>
                    <br />
                    <Tag color="blue" style={{ marginTop: 4, fontSize: 11 }}>
                        {formatCronDescription(record)}
                    </Tag>
                </div>
            ),
        },
        {
            title: t('cron.actions'),
            key: 'actions',
            width: 120,
            align: 'center',
            fixed: 'right',
            render: (_, record, index) => {
                const logPath = extractLogPath(record.command);
                return (
                    <Space size="small">
                        {logPath && (
                            <Button
                                type="text"
                                icon={<EyeOutlined />}
                                size="small"
                                style={{ color: '#52c41a' }}
                                onClick={() => viewLog(logPath)}
                                title={t('cron.view_log')}
                            />
                        )}
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => openEditJobModal(index)}
                            title={t('common.edit')}
                        />
                        <Popconfirm
                            title={t('cron.delete_job')}
                            description={t('cron.delete_job_confirm')}
                            onConfirm={() => deleteJob(index)}
                            okText={t('common.yes')}
                            cancelText={t('common.no')}
                        >
                            <Button
                                type="text"
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                                title={t('common.delete')}
                            />
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

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
                <ClockCircleOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Typography.Title level={4} type="secondary">
                    {t('cron.select_connection')}
                </Typography.Title>
                <Text type="secondary">
                    {t('cron.select_connection_desc')}
                </Text>
            </div>
        );
    }

    const cronTemplates = getCronTemplates();

    return (
        <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
            <Card
                title={
                    <Space>
                        <ClockCircleOutlined />
                        <span>{t('cron.task_scheduler')}</span>
                    </Space>
                }
                extra={
                    <Space>
                        <Button
                            icon={<ReloadOutlined spin={isLoading} />}
                            onClick={loadCrontab}
                            loading={isLoading}
                        >
                            {t('cron.refresh')}
                        </Button>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={openNewJobModal}
                        >
                            {t('cron.new_job')}
                        </Button>
                    </Space>
                }
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    {t('cron.manage_tasks_desc')}
                </Text>

                {isLoading && jobs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <ReloadOutlined spin style={{ fontSize: 24, color: '#1677ff' }} />
                        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                            {t('cron.loading_crontab')}
                        </Text>
                    </div>
                ) : jobs.length === 0 ? (
                    <Empty
                        image={<ClockCircleOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
                        description={t('cron.no_scheduled_tasks')}
                    >
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={openNewJobModal}
                        >
                            {t('cron.create_first_job')}
                        </Button>
                    </Empty>
                ) : (
                    <Table
                        columns={columns}
                        dataSource={jobs}
                        rowKey={(record, index) => `${index}`}
                        pagination={false}
                        size="middle"
                    />
                )}
            </Card>

            {/* Modal de Criação/Edição de Job */}
            <Modal
                title={
                    <Space>
                        <ClockCircleOutlined />
                        {editingJobIndex !== null ? t('cron.edit_job') : t('cron.new_job')}
                    </Space>
                }
                open={isJobModalOpen}
                onCancel={() => setIsJobModalOpen(false)}
                onOk={handleSaveJob}
                okText={editingJobIndex !== null ? t('common.save') : t('common.create')}
                cancelText={t('common.cancel')}
                width={700}
            >
                <Form
                    form={form}
                    layout="vertical"
                    style={{ marginTop: 24 }}
                >
                    <Form.Item
                        name="template"
                        label={t('cron.schedule_template')}
                    >
                        <Select
                            options={cronTemplates.map(t => ({ label: t.label, value: t.value }))}
                            onChange={handleTemplateChange}
                        />
                    </Form.Item>

                    <Space size="middle" style={{ width: '100%', marginBottom: 16 }}>
                        <Form.Item name="minute" label={t('cron.minute')} style={{ marginBottom: 0, flex: 1 }}>
                            <Input placeholder="*" />
                        </Form.Item>
                        <Form.Item name="hour" label={t('cron.hour')} style={{ marginBottom: 0, flex: 1 }}>
                            <Input placeholder="*" />
                        </Form.Item>
                        <Form.Item name="day" label={t('cron.day')} style={{ marginBottom: 0, flex: 1 }}>
                            <Input placeholder="*" />
                        </Form.Item>
                        <Form.Item name="month" label={t('cron.month')} style={{ marginBottom: 0, flex: 1 }}>
                            <Input placeholder="*" />
                        </Form.Item>
                        <Form.Item name="weekday" label={t('cron.weekday')} style={{ marginBottom: 0, flex: 1 }}>
                            <Input placeholder="*" />
                        </Form.Item>
                    </Space>

                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
                        <strong>{t('cron.cron_tip')}</strong>
                    </Text>

                    <Form.Item
                        name="command"
                        label={t('cron.command')}
                        rules={[{ required: true, message: t('cron.command_required') }]}
                    >
                        <Input.TextArea
                            placeholder={t('cron.command_placeholder')}
                            rows={3}
                            style={{ fontFamily: 'monospace' }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="enableLog"
                        valuePropName="checked"
                    >
                        <Checkbox>
                            <Space direction="vertical" size={0}>
                                <span>{t('cron.enable_log')}</span>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {t('cron.enable_log_desc')}
                                </Text>
                            </Space>
                        </Checkbox>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal de Visualização de Log */}
            <Modal
                title={
                    <Space>
                        <FileTextOutlined />
                        {logPath}
                    </Space>
                }
                open={isLogModalOpen}
                onCancel={() => setIsLogModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setIsLogModalOpen(false)}>
                        {t('common.close')}
                    </Button>
                ]}
                width="80%"
            >
                <pre style={{
                    maxHeight: 500,
                    overflow: 'auto',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    padding: 16,
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    margin: 0,
                }}>
                    {logContent}
                </pre>
            </Modal>
        </div>
    );
};
