/**
 * Splash Screen Component
 * 
 * Modern loading screen with Ant Design Spin component.
 * Shows during application initialization.
 */

import React from 'react';
import { Spin, Progress, Typography, Space } from 'antd';
import { CloudServerOutlined } from '@ant-design/icons';

interface SplashScreenProps {
    message?: string;
    progress?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
    message = 'Loading...',
    progress,
}) => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}>
            {/* Logo */}
            <div style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 32,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(4px)',
            }}>
                <CloudServerOutlined style={{ fontSize: 60, color: '#fff' }} />
            </div>

            {/* App Title */}
            <Typography.Title
                level={2}
                style={{
                    color: '#fff',
                    margin: 0,
                    marginBottom: 8,
                    fontWeight: 300,
                    letterSpacing: 4,
                    textTransform: 'uppercase',
                }}
            >
                Nautilus
            </Typography.Title>

            <Typography.Text style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: 32 }}>
                Server Manager
            </Typography.Text>

            {/* Loading indicator */}
            <Space direction="vertical" align="center" size="large">
                {progress !== undefined ? (
                    <Progress
                        type="circle"
                        percent={progress}
                        size={80}
                        strokeColor={{
                            '0%': '#fff',
                            '100%': '#87d068',
                        }}
                        trailColor="rgba(255, 255, 255, 0.2)"
                        format={(percent) => (
                            <span style={{ color: '#fff', fontSize: 16 }}>{percent}%</span>
                        )}
                    />
                ) : (
                    <Spin size="large" />
                )}

                <Typography.Text style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                    {message}
                </Typography.Text>
            </Space>

            {/* Footer */}
            <div style={{
                position: 'absolute',
                bottom: 24,
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: 12,
            }}>
                NTI • MPBA
            </div>
        </div>
    );
};
