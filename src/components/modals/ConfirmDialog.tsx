/**
 * ConfirmDialog Component
 * 
 * Reusable confirmation dialog with customizable actions.
 * Uses Ant Design Modal component.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Space, Typography } from 'antd';
import {
    DeleteOutlined,
    ExclamationCircleOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
    type = 'danger',
    isLoading = false
}) => {
    const { t } = useTranslation();

    // Use provided texts or fall back to translations
    const finalConfirmText = confirmText || t('common.confirm');
    const finalCancelText = cancelText || t('common.cancel');

    const getIcon = () => {
        switch (type) {
            case 'danger':
                return <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 24 }} />;
            case 'warning':
                return <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 24 }} />;
            case 'info':
            default:
                return <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 24 }} />;
        }
    };

    const getButtonType = () => {
        switch (type) {
            case 'danger':
                return { danger: true, type: 'primary' as const };
            case 'warning':
                return { type: 'primary' as const, style: { background: '#faad14', borderColor: '#faad14' } };
            case 'info':
            default:
                return { type: 'primary' as const };
        }
    };

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title={null}
            footer={[
                <Button key="cancel" onClick={onClose} disabled={isLoading}>
                    {finalCancelText}
                </Button>,
                <Button
                    key="confirm"
                    onClick={onConfirm}
                    loading={isLoading}
                    {...getButtonType()}
                >
                    {finalConfirmText}
                </Button>,
            ]}
            width={400}
            centered
        >
            <Space align="start" size="middle" style={{ padding: '16px 0' }}>
                <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: type === 'danger' ? '#fff1f0' : type === 'warning' ? '#fffbe6' : '#e6f4ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {getIcon()}
                </div>
                <div>
                    <Typography.Title level={5} style={{ marginBottom: 8 }}>
                        {title}
                    </Typography.Title>
                    <Text type="secondary">{message}</Text>
                </div>
            </Space>
        </Modal>
    );
};
