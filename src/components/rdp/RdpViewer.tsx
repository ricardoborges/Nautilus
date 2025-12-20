/**
 * RDP Viewer Component
 * 
 * Displays a Remote Desktop connection using node-rdpjs.
 * Renders the remote desktop in an HTML5 canvas.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Space,
    Typography,
    Spin,
    Alert,
    Tooltip,
} from 'antd';
import {
    FullscreenOutlined,
    FullscreenExitOutlined,
    DisconnectOutlined,
    ReloadOutlined,
    SettingOutlined,
    WindowsOutlined,
    LoadingOutlined,
} from '@ant-design/icons';
import type { Connection, RdpBitmapEvent } from '../../types';

interface RdpViewerProps {
    connection: Connection;
    onDisconnect: () => void;
}

// Keyboard scancode mapping
const KEY_TO_SCANCODE: Record<string, { scanCode: number; extended: boolean }> = {
    'Escape': { scanCode: 0x01, extended: false },
    'F1': { scanCode: 0x3B, extended: false },
    'F2': { scanCode: 0x3C, extended: false },
    'F3': { scanCode: 0x3D, extended: false },
    'F4': { scanCode: 0x3E, extended: false },
    'F5': { scanCode: 0x3F, extended: false },
    'F6': { scanCode: 0x40, extended: false },
    'F7': { scanCode: 0x41, extended: false },
    'F8': { scanCode: 0x42, extended: false },
    'F9': { scanCode: 0x43, extended: false },
    'F10': { scanCode: 0x44, extended: false },
    'F11': { scanCode: 0x57, extended: false },
    'F12': { scanCode: 0x58, extended: false },
    'Backquote': { scanCode: 0x29, extended: false },
    'Digit1': { scanCode: 0x02, extended: false },
    'Digit2': { scanCode: 0x03, extended: false },
    'Digit3': { scanCode: 0x04, extended: false },
    'Digit4': { scanCode: 0x05, extended: false },
    'Digit5': { scanCode: 0x06, extended: false },
    'Digit6': { scanCode: 0x07, extended: false },
    'Digit7': { scanCode: 0x08, extended: false },
    'Digit8': { scanCode: 0x09, extended: false },
    'Digit9': { scanCode: 0x0A, extended: false },
    'Digit0': { scanCode: 0x0B, extended: false },
    'Minus': { scanCode: 0x0C, extended: false },
    'Equal': { scanCode: 0x0D, extended: false },
    'Backspace': { scanCode: 0x0E, extended: false },
    'Tab': { scanCode: 0x0F, extended: false },
    'KeyQ': { scanCode: 0x10, extended: false },
    'KeyW': { scanCode: 0x11, extended: false },
    'KeyE': { scanCode: 0x12, extended: false },
    'KeyR': { scanCode: 0x13, extended: false },
    'KeyT': { scanCode: 0x14, extended: false },
    'KeyY': { scanCode: 0x15, extended: false },
    'KeyU': { scanCode: 0x16, extended: false },
    'KeyI': { scanCode: 0x17, extended: false },
    'KeyO': { scanCode: 0x18, extended: false },
    'KeyP': { scanCode: 0x19, extended: false },
    'BracketLeft': { scanCode: 0x1A, extended: false },
    'BracketRight': { scanCode: 0x1B, extended: false },
    'Backslash': { scanCode: 0x2B, extended: false },
    'CapsLock': { scanCode: 0x3A, extended: false },
    'KeyA': { scanCode: 0x1E, extended: false },
    'KeyS': { scanCode: 0x1F, extended: false },
    'KeyD': { scanCode: 0x20, extended: false },
    'KeyF': { scanCode: 0x21, extended: false },
    'KeyG': { scanCode: 0x22, extended: false },
    'KeyH': { scanCode: 0x23, extended: false },
    'KeyJ': { scanCode: 0x24, extended: false },
    'KeyK': { scanCode: 0x25, extended: false },
    'KeyL': { scanCode: 0x26, extended: false },
    'Semicolon': { scanCode: 0x27, extended: false },
    'Quote': { scanCode: 0x28, extended: false },
    'Enter': { scanCode: 0x1C, extended: false },
    'ShiftLeft': { scanCode: 0x2A, extended: false },
    'KeyZ': { scanCode: 0x2C, extended: false },
    'KeyX': { scanCode: 0x2D, extended: false },
    'KeyC': { scanCode: 0x2E, extended: false },
    'KeyV': { scanCode: 0x2F, extended: false },
    'KeyB': { scanCode: 0x30, extended: false },
    'KeyN': { scanCode: 0x31, extended: false },
    'KeyM': { scanCode: 0x32, extended: false },
    'Comma': { scanCode: 0x33, extended: false },
    'Period': { scanCode: 0x34, extended: false },
    'Slash': { scanCode: 0x35, extended: false },
    'ShiftRight': { scanCode: 0x36, extended: false },
    'ControlLeft': { scanCode: 0x1D, extended: false },
    'MetaLeft': { scanCode: 0x5B, extended: true },
    'AltLeft': { scanCode: 0x38, extended: false },
    'Space': { scanCode: 0x39, extended: false },
    'AltRight': { scanCode: 0x38, extended: true },
    'MetaRight': { scanCode: 0x5C, extended: true },
    'ControlRight': { scanCode: 0x1D, extended: true },
    'Insert': { scanCode: 0x52, extended: true },
    'Delete': { scanCode: 0x53, extended: true },
    'Home': { scanCode: 0x47, extended: true },
    'End': { scanCode: 0x4F, extended: true },
    'PageUp': { scanCode: 0x49, extended: true },
    'PageDown': { scanCode: 0x51, extended: true },
    'ArrowUp': { scanCode: 0x48, extended: true },
    'ArrowDown': { scanCode: 0x50, extended: true },
    'ArrowLeft': { scanCode: 0x4B, extended: true },
    'ArrowRight': { scanCode: 0x4D, extended: true },
};

export const RdpViewer: React.FC<RdpViewerProps> = ({
    connection,
    onDisconnect,
}) => {
    const { t } = useTranslation();
    const [isConnecting, setIsConnecting] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isEmbedded, setIsEmbedded] = useState(true);
    const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Start RDP connection
    useEffect(() => {
        let mounted = true;

        const startConnection = async () => {
            setIsConnecting(true);
            setError(null);

            try {
                // Get password if using credentials auth
                let password: string | null = null;
                if (connection.rdpAuthMethod === 'credentials') {
                    password = await window.ssm.getPassword(connection.id);
                }

                // Get canvas dimensions
                const width = containerRef.current?.clientWidth || 1920;
                const height = (containerRef.current?.clientHeight || 1080) - 48; // Minus toolbar

                // Connect
                const result = await window.ssm.rdpConnect({
                    connectionId: connection.id,
                    host: connection.host,
                    port: connection.port || 3389,
                    username: connection.user,
                    password: password || undefined,
                    domain: connection.domain,
                    useWindowsAuth: connection.rdpAuthMethod === 'windows_auth',
                    width,
                    height,
                });

                if (mounted) {
                    setIsEmbedded(result.embedded);
                    setCanvasSize({ width: result.width || width, height: result.height || height });

                    if (!result.embedded) {
                        // Opened in external mstsc
                        setIsConnected(true);
                        setIsConnecting(false);
                    }
                }
            } catch (err) {
                if (mounted) {
                    setError((err as Error).message);
                    setIsConnecting(false);
                }
            }
        };

        startConnection();

        return () => {
            mounted = false;
        };
    }, [connection.id]);

    // Subscribe to RDP events
    useEffect(() => {
        // Connected event
        const unsubConnected = window.ssm.onRdpConnected((event) => {
            if (event.sessionId === connection.id) {
                setIsConnected(true);
                setIsConnecting(false);
            }
        });

        // Closed event
        const unsubClosed = window.ssm.onRdpClosed((event) => {
            if (event.sessionId === connection.id) {
                onDisconnect();
            }
        });

        // Error event
        const unsubError = window.ssm.onRdpError((event) => {
            if (event.sessionId === connection.id) {
                setError(event.error);
                setIsConnecting(false);
            }
        });

        // Bitmap event - render to canvas
        const unsubBitmap = window.ssm.onRdpBitmap((event: RdpBitmapEvent) => {
            if (event.sessionId === connection.id) {
                renderBitmap(event);
            }
        });

        return () => {
            unsubConnected();
            unsubClosed();
            unsubError();
            unsubBitmap();
        };
    }, [connection.id, onDisconnect]);

    // Render bitmap to canvas
    const renderBitmap = useCallback((event: RdpBitmapEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        try {
            // Decode base64 data
            const binaryString = atob(event.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Create ImageData
            const width = event.width;
            const height = event.height;
            const imageData = ctx.createImageData(width, height);

            // Convert bitmap data to RGBA
            // RDP typically sends BGR or BGRA
            const bpp = event.bitsPerPixel;
            const srcData = bytes;
            const destData = imageData.data;

            if (bpp === 32) {
                // BGRA to RGBA
                for (let i = 0, j = 0; i < srcData.length && j < destData.length; i += 4, j += 4) {
                    destData[j] = srcData[i + 2];     // R
                    destData[j + 1] = srcData[i + 1]; // G
                    destData[j + 2] = srcData[i];     // B
                    destData[j + 3] = 255;            // A
                }
            } else if (bpp === 24) {
                // BGR to RGBA
                for (let i = 0, j = 0; i < srcData.length && j < destData.length; i += 3, j += 4) {
                    destData[j] = srcData[i + 2];     // R
                    destData[j + 1] = srcData[i + 1]; // G
                    destData[j + 2] = srcData[i];     // B
                    destData[j + 3] = 255;            // A
                }
            } else if (bpp === 16) {
                // RGB565 to RGBA
                for (let i = 0, j = 0; i < srcData.length && j < destData.length; i += 2, j += 4) {
                    const pixel = srcData[i] | (srcData[i + 1] << 8);
                    destData[j] = ((pixel >> 11) & 0x1F) << 3;     // R
                    destData[j + 1] = ((pixel >> 5) & 0x3F) << 2;  // G
                    destData[j + 2] = (pixel & 0x1F) << 3;         // B
                    destData[j + 3] = 255;                          // A
                }
            }

            // Draw to canvas at the correct position
            ctx.putImageData(imageData, event.destLeft, event.destTop);
        } catch (err) {
            console.error('Failed to render bitmap:', err);
        }
    }, []);

    // Mouse event handlers
    const handleMouseEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>, isPressed: boolean) => {
        if (!isConnected || !isEmbedded) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvasSize.width / rect.width;
        const scaleY = canvasSize.height / rect.height;

        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        // RDP button flags: 1 = left, 2 = right, 3 = middle
        let button = 0;
        if (e.button === 0) button = 1; // Left
        else if (e.button === 2) button = 2; // Right
        else if (e.button === 1) button = 3; // Middle

        window.ssm.rdpSendMouse(connection.id, x, y, button, isPressed);
    }, [connection.id, isConnected, isEmbedded, canvasSize]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isConnected || !isEmbedded) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvasSize.width / rect.width;
        const scaleY = canvasSize.height / rect.height;

        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        window.ssm.rdpSendMouse(connection.id, x, y, 0, false);
    }, [connection.id, isConnected, isEmbedded, canvasSize]);

    // Keyboard event handlers
    useEffect(() => {
        if (!isConnected || !isEmbedded) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            const mapping = KEY_TO_SCANCODE[e.code];
            if (mapping) {
                window.ssm.rdpSendKeyboard(connection.id, mapping.scanCode, true, mapping.extended);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            e.preventDefault();
            const mapping = KEY_TO_SCANCODE[e.code];
            if (mapping) {
                window.ssm.rdpSendKeyboard(connection.id, mapping.scanCode, false, mapping.extended);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [connection.id, isConnected, isEmbedded]);

    // Fullscreen handling
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Disconnect handler
    const handleDisconnect = async () => {
        await window.ssm.rdpDisconnect(connection.id);
        onDisconnect();
    };

    // Retry connection
    const handleRetry = async () => {
        setError(null);
        setIsConnecting(true);

        try {
            let password: string | null = null;
            if (connection.rdpAuthMethod === 'credentials') {
                password = await window.ssm.getPassword(connection.id);
            }

            const result = await window.ssm.rdpConnect({
                connectionId: connection.id,
                host: connection.host,
                port: connection.port || 3389,
                username: connection.user,
                password: password || undefined,
                domain: connection.domain,
                useWindowsAuth: connection.rdpAuthMethod === 'windows_auth',
                width: canvasSize.width,
                height: canvasSize.height,
            });

            setIsEmbedded(result.embedded);
            if (!result.embedded) {
                setIsConnected(true);
                setIsConnecting(false);
            }
        } catch (err) {
            setError((err as Error).message);
            setIsConnecting(false);
        }
    };

    // Render loading state
    if (isConnecting) {
        return (
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    width: '100vw',
                    background: 'linear-gradient(135deg, #0078d4 0%, #004578 100%)',
                    color: 'white',
                }}
            >
                <WindowsOutlined style={{ fontSize: 80, marginBottom: 24 }} />
                <Spin
                    indicator={<LoadingOutlined style={{ fontSize: 48, color: 'white' }} spin />}
                />
                <Typography.Title level={3} style={{ color: 'white', marginTop: 24 }}>
                    {t('rdp.connecting')}
                </Typography.Title>
                <Typography.Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>
                    {connection.name} ({connection.host})
                </Typography.Text>
                <Button
                    type="text"
                    icon={<DisconnectOutlined />}
                    onClick={handleDisconnect}
                    style={{ marginTop: 32, color: 'white' }}
                >
                    {t('common.cancel')}
                </Button>
            </div>
        );
    }

    // Render error state
    if (error) {
        return (
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    width: '100vw',
                    background: '#1a1a2e',
                    color: 'white',
                }}
            >
                <WindowsOutlined style={{ fontSize: 80, marginBottom: 24, color: '#ff4d4f' }} />
                <Typography.Title level={3} style={{ color: 'white' }}>
                    {t('rdp.connection_failed')}
                </Typography.Title>
                <Alert
                    type="error"
                    message={error}
                    style={{ marginTop: 16, maxWidth: 500 }}
                />
                <Space style={{ marginTop: 32 }}>
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        onClick={handleRetry}
                    >
                        {t('rdp.retry')}
                    </Button>
                    <Button
                        icon={<DisconnectOutlined />}
                        onClick={handleDisconnect}
                    >
                        {t('rdp.disconnect')}
                    </Button>
                </Space>
            </div>
        );
    }

    // Render connected RDP session
    return (
        <div
            ref={containerRef}
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                width: '100vw',
                background: '#000',
            }}
        >
            {/* Toolbar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    background: 'linear-gradient(90deg, #0078d4 0%, #004578 100%)',
                    borderBottom: '1px solid #003d6b',
                    height: 48,
                }}
            >
                <Space>
                    <WindowsOutlined style={{ color: 'white', fontSize: 20 }} />
                    <Typography.Text strong style={{ color: 'white' }}>
                        {connection.name}
                    </Typography.Text>
                    <Typography.Text style={{ color: 'rgba(255,255,255,0.7)' }}>
                        ({connection.host}:{connection.port || 3389})
                    </Typography.Text>
                    {!isEmbedded && (
                        <Typography.Text style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                            (External)
                        </Typography.Text>
                    )}
                </Space>
                <Space>
                    {isEmbedded && (
                        <Tooltip title={isFullscreen ? t('rdp.exit_fullscreen') : t('rdp.fullscreen')}>
                            <Button
                                type="text"
                                icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                                onClick={toggleFullscreen}
                                style={{ color: 'white' }}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={t('rdp.settings')}>
                        <Button
                            type="text"
                            icon={<SettingOutlined />}
                            style={{ color: 'white' }}
                        />
                    </Tooltip>
                    <Button
                        type="primary"
                        danger
                        icon={<DisconnectOutlined />}
                        onClick={handleDisconnect}
                    >
                        {t('rdp.disconnect')}
                    </Button>
                </Space>
            </div>

            {/* Canvas for embedded RDP */}
            {isEmbedded ? (
                <canvas
                    ref={canvasRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    onMouseDown={(e) => handleMouseEvent(e, true)}
                    onMouseUp={(e) => handleMouseEvent(e, false)}
                    onMouseMove={handleMouseMove}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                        flex: 1,
                        width: '100%',
                        height: 'calc(100vh - 48px)',
                        objectFit: 'contain',
                        cursor: 'default',
                    }}
                />
            ) : (
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#1a1a2e',
                    }}
                >
                    <div style={{ textAlign: 'center', color: 'white' }}>
                        <WindowsOutlined style={{ fontSize: 120, marginBottom: 24, color: '#0078d4' }} />
                        <Typography.Title level={3} style={{ color: 'white' }}>
                            {t('rdp.session_active')}
                        </Typography.Title>
                        <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.7)', maxWidth: 400 }}>
                            {t('rdp.session_info')}
                        </Typography.Paragraph>
                    </div>
                </div>
            )}
        </div>
    );
};
