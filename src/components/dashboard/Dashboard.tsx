/**
 * Dashboard Component
 * 
 * Displays system metrics, charts, and service status.
 * Uses Ant Design Pro components for a professional look.
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../context/ConnectionContext';
import { Chart, registerables } from 'chart.js';
import { Card, Row, Col, Statistic, Tag, Typography, Spin, Empty, Descriptions, Badge, Space } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import {
    DashboardOutlined,
    HddOutlined,
    CloudServerOutlined,
    WifiOutlined,
    FieldTimeOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    MinusCircleOutlined,
} from '@ant-design/icons';

Chart.register(...registerables);

const { Title, Text } = Typography;

interface DashboardProps {
    connectionId?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ connectionId: propConnectionId }) => {
    const { t } = useTranslation();
    const { activeConnectionId: contextConnectionId, metrics, isLoading } = useConnection();

    // Use prop connectionId if provided, otherwise fall back to context
    const activeConnectionId = propConnectionId ?? contextConnectionId;

    const cpuChartRef = useRef<HTMLCanvasElement>(null);
    const memChartRef = useRef<HTMLCanvasElement>(null);
    const diskChartRef = useRef<HTMLCanvasElement>(null);
    const cpuChartInstance = useRef<Chart | null>(null);
    const memChartInstance = useRef<Chart | null>(null);
    const diskChartInstance = useRef<Chart | null>(null);

    // Initialize charts
    useEffect(() => {
        if (!activeConnectionId) return;

        const createLineChart = (canvas: HTMLCanvasElement, label: string, color: string): Chart => {
            const ctx = canvas.getContext('2d')!;
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
            gradient.addColorStop(0, `${color}40`);
            gradient.addColorStop(1, `${color}00`);

            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label,
                        data: [],
                        borderColor: color,
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.3,
                        fill: true,
                        backgroundColor: gradient
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, display: false },
                        x: { display: false }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        };

        if (cpuChartRef.current && !cpuChartInstance.current) {
            cpuChartInstance.current = createLineChart(cpuChartRef.current, 'CPU', '#1677ff');
        }
        if (memChartRef.current && !memChartInstance.current) {
            memChartInstance.current = createLineChart(memChartRef.current, 'Memory', '#52c41a');
        }
        if (diskChartRef.current && !diskChartInstance.current) {
            diskChartInstance.current = new Chart(diskChartRef.current.getContext('2d')!, {
                type: 'doughnut',
                data: {
                    labels: [t('dashboard.disk_used'), t('dashboard.disk_free')],
                    datasets: [{
                        data: [0, 100],
                        backgroundColor: ['#ff4d4f', '#f0f0f0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }

        return () => {
            cpuChartInstance.current?.destroy();
            memChartInstance.current?.destroy();
            diskChartInstance.current?.destroy();
            cpuChartInstance.current = null;
            memChartInstance.current = null;
            diskChartInstance.current = null;
        };
    }, [activeConnectionId, t]);

    // Update charts with metrics
    useEffect(() => {
        if (!metrics || metrics.status === 'error') return;

        const { cpu, memory, disk } = metrics.data;
        const now = new Date().toLocaleTimeString();
        const maxPoints = 12;

        // CPU Chart
        if (cpuChartInstance.current) {
            const chart = cpuChartInstance.current;
            chart.data.labels!.push(now);
            (chart.data.datasets[0].data as number[]).push(cpu);
            if (chart.data.labels!.length > maxPoints) {
                chart.data.labels!.shift();
                (chart.data.datasets[0].data as number[]).shift();
            }
            chart.update('none');
        }

        // Memory Chart
        if (memChartInstance.current) {
            const memPercent = (parseFloat(memory.used) / parseFloat(memory.total)) * 100;
            const chart = memChartInstance.current;
            chart.data.labels!.push(now);
            (chart.data.datasets[0].data as number[]).push(memPercent);
            if (chart.data.labels!.length > maxPoints) {
                chart.data.labels!.shift();
                (chart.data.datasets[0].data as number[]).shift();
            }
            chart.update('none');
        }

        // Disk Chart
        if (diskChartInstance.current) {
            const diskPercent = parseInt(disk.percent.replace('%', ''));
            diskChartInstance.current.data.datasets[0].data = [diskPercent, 100 - diskPercent];
            diskChartInstance.current.update('none');
        }
    }, [metrics]);

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
                <CloudServerOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 24 }} />
                <Title level={4} type="secondary">
                    {t('common.select_connection')}
                </Title>
                <Text type="secondary">
                    {t('common.select_or_create_connection')}
                </Text>
            </div>
        );
    }

    if (isLoading && !metrics) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
            }}>
                <Spin size="large" />
                <Text type="secondary" style={{ marginTop: 16 }}>
                    {t('dashboard.connecting')}
                </Text>
            </div>
        );
    }

    const data = metrics?.data;

    const getServiceStatus = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge status="success" text={t('dashboard.active')} />;
            case 'failed':
                return <Badge status="error" text={t('dashboard.failed')} />;
            default:
                return <Badge status="default" text={status} />;
        }
    };

    return (
        <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
            {/* Uptime Banner */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Space>
                    <FieldTimeOutlined style={{ color: '#52c41a' }} />
                    <Text type="secondary">{t('dashboard.uptime')}:</Text>
                    <Text strong>{data?.uptime || '--'}</Text>
                </Space>
            </Card>

            {/* Metrics Grid */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                {/* CPU */}
                <Col xs={24} sm={12} lg={6}>
                    <ProCard
                        className="statistic-card"
                        style={{ height: '100%' }}
                    >
                        <Statistic
                            title={
                                <Space>
                                    <DashboardOutlined style={{ color: '#1677ff' }} />
                                    {t('dashboard.cpu_usage')}
                                </Space>
                            }
                            value={data?.cpu || 0}
                            suffix="%"
                            valueStyle={{ color: '#1677ff' }}
                        />
                        <div style={{ height: 60, marginTop: 12 }}>
                            <canvas ref={cpuChartRef} />
                        </div>
                    </ProCard>
                </Col>

                {/* Memory */}
                <Col xs={24} sm={12} lg={6}>
                    <ProCard
                        className="statistic-card"
                        style={{ height: '100%' }}
                    >
                        <Statistic
                            title={
                                <Space>
                                    <CloudServerOutlined style={{ color: '#52c41a' }} />
                                    {t('dashboard.memory_usage')}
                                </Space>
                            }
                            value={data?.memory?.used || 0}
                            suffix={`/ ${data?.memory?.total || 0} MB`}
                            valueStyle={{ color: '#52c41a' }}
                        />
                        <div style={{ height: 60, marginTop: 12 }}>
                            <canvas ref={memChartRef} />
                        </div>
                    </ProCard>
                </Col>

                {/* Disk */}
                <Col xs={24} sm={12} lg={6}>
                    <ProCard
                        className="statistic-card"
                        style={{ height: '100%' }}
                    >
                        <Statistic
                            title={
                                <Space>
                                    <HddOutlined style={{ color: '#ff4d4f' }} />
                                    {t('dashboard.disk_usage')}
                                </Space>
                            }
                            value={parseInt(data?.disk?.percent?.replace('%', '') || '0')}
                            suffix="%"
                            valueStyle={{ color: '#ff4d4f' }}
                        />
                        <div style={{ height: 60, marginTop: 12 }}>
                            <canvas ref={diskChartRef} />
                        </div>
                    </ProCard>
                </Col>

                {/* Network */}
                <Col xs={24} sm={12} lg={6}>
                    <ProCard
                        className="statistic-card"
                        style={{ height: '100%' }}
                    >
                        <Statistic
                            title={
                                <Space>
                                    <WifiOutlined style={{ color: '#722ed1' }} />
                                    {t('dashboard.network')}
                                </Space>
                            }
                            value={`↓${data?.network?.in || '0'}`}
                            suffix={`↑${data?.network?.out || '0'} KB/s`}
                            valueStyle={{ color: '#722ed1', fontSize: 20 }}
                        />
                    </ProCard>
                </Col>
            </Row>

            {/* System Info */}
            <Row gutter={[16, 16]}>
                <Col xs={24}>
                    <Card title={t('dashboard.os_info')} size="small">
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label={t('dashboard.os_info')}>
                                {data?.system?.os || '--'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('dashboard.kernel')}>
                                {data?.system?.kernel || '--'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('dashboard.architecture')}>
                                {data?.system?.arch || '--'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('dashboard.cpu_model')}>
                                <Text style={{ fontSize: 12 }}>{data?.system?.cpu || '--'}</Text>
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};
