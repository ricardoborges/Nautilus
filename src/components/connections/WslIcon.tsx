import React from 'react';
import { LinuxOutlined, WindowsOutlined } from '@ant-design/icons';

interface WslIconProps {
    size?: number;
    style?: React.CSSProperties;
}

export const WslIcon: React.FC<WslIconProps> = ({ size = 18, style }) => (
    <span
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: size,
            height: size,
            flexShrink: 0,
            lineHeight: 1,
            ...style,
        }}
    >
        <LinuxOutlined style={{ fontSize: size, color: '#13c2c2' }} />
        <span
            style={{
                position: 'absolute',
                bottom: -2,
                right: -4,
                background: 'rgba(0, 0, 0, 0.75)',
                borderRadius: 2,
                padding: '0 1px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
            }}
        >
            <WindowsOutlined style={{ fontSize: Math.max(8, Math.round(size * 0.5)), color: '#00a4ef' }} />
        </span>
    </span>
);
