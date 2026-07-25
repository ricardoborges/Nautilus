/**
 * Host Key Confirmation Dialog
 *
 * Shown when connecting to a server whose SSH host key is not yet trusted.
 * The SSH handshake is suspended on the backend until the user answers, so
 * no key is ever trusted silently.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Typography, Alert, Space, Tag } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { HostKeyPromptEvent } from '../../types';

const { Text, Paragraph } = Typography;

export const HostKeyPrompt: React.FC = () => {
    const { t } = useTranslation();
    const [queue, setQueue] = useState<HostKeyPromptEvent[]>([]);
    const [responding, setResponding] = useState(false);

    const current = queue[0];

    useEffect(() => {
        if (!window.ssm?.onHostKeyPrompt) return;

        return window.ssm.onHostKeyPrompt((event) => {
            setQueue(prev => (
                prev.some(item => item.requestId === event.requestId) ? prev : [...prev, event]
            ));
        });
    }, []);

    const respond = useCallback(async (accept: boolean) => {
        if (!current) return;
        setResponding(true);
        try {
            await window.ssm.hostKeyRespond(current.requestId, accept);
        } catch (err) {
            console.error('Failed to answer host key prompt:', err);
        } finally {
            setResponding(false);
            setQueue(prev => prev.filter(item => item.requestId !== current.requestId));
        }
    }, [current]);

    if (!current) return null;

    return (
        <Modal
            open
            title={
                <Space>
                    <SafetyCertificateOutlined />
                    {t('hostkey.title')}
                </Space>
            }
            okText={t('hostkey.trust')}
            cancelText={t('hostkey.reject')}
            onOk={() => respond(true)}
            onCancel={() => respond(false)}
            confirmLoading={responding}
            closable={false}
            maskClosable={false}
            keyboard={false}
            width={560}
        >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Paragraph style={{ marginBottom: 0 }}>
                    {t('hostkey.first_connection')}
                </Paragraph>

                <div>
                    <Text type="secondary">{t('hostkey.server')}</Text>
                    <div>
                        <Tag>{current.host}:{current.port}</Tag>
                    </div>
                </div>

                <div>
                    <Text type="secondary">{t('hostkey.fingerprint')}</Text>
                    <Paragraph
                        copyable={{ text: current.fingerprint }}
                        style={{
                            fontFamily: 'monospace',
                            fontSize: 13,
                            wordBreak: 'break-all',
                            marginBottom: 0,
                        }}
                    >
                        {current.fingerprint}
                    </Paragraph>
                </div>

                <Alert
                    type="warning"
                    showIcon
                    message={t('hostkey.verify_hint')}
                    description={
                        <Text code style={{ fontSize: 12 }}>
                            ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
                        </Text>
                    }
                />
            </Space>
        </Modal>
    );
};

export default HostKeyPrompt;
