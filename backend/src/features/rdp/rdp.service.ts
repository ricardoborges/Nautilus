/**
 * RDP Service
 * 
 * Handles RDP connections using node-rdpjs library.
 * Emits bitmap events that can be rendered on a canvas.
 */

import rdp from 'node-rdpjs';
import logger from '../../shared/utils/logger';

export interface RdpConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    domain?: string;
    width?: number;
    height?: number;
}

export interface RdpBitmapEvent {
    destTop: number;
    destLeft: number;
    destBottom: number;
    destRight: number;
    width: number;
    height: number;
    bitsPerPixel: number;
    isCompress: boolean;
    data: string; // Base64 encoded
}

export interface RdpSession {
    id: string;
    client: any;
    onBitmap: (bitmap: RdpBitmapEvent) => void;
    onClose: () => void;
    onError: (error: Error) => void;
}

const activeSessions = new Map<string, RdpSession>();

export class RdpService {
    /**
     * Start a new RDP session
     */
    static async connect(
        sessionId: string,
        config: RdpConfig,
        callbacks: {
            onBitmap: (bitmap: RdpBitmapEvent) => void;
            onClose: () => void;
            onError: (error: Error) => void;
        }
    ): Promise<void> {
        logger.info(`[RDP] Starting connection to ${config.host}:${config.port}`);

        const client = rdp.createClient({
            domain: config.domain || '',
            userName: config.username,
            password: config.password || '',
            enablePerf: true,
            autoLogin: true,
            screen: {
                width: config.width || 1920,
                height: config.height || 1080
            },
            locale: 'en',
            logLevel: 'INFO'
        });

        // Handle connection
        client.on('connect', () => {
            logger.info(`[RDP] Connected to ${config.host}`);
        });

        // Handle bitmap updates
        client.on('bitmap', (bitmap: any) => {
            try {
                const bitmapEvent: RdpBitmapEvent = {
                    destTop: bitmap.destTop,
                    destLeft: bitmap.destLeft,
                    destBottom: bitmap.destBottom,
                    destRight: bitmap.destRight,
                    width: bitmap.width,
                    height: bitmap.height,
                    bitsPerPixel: bitmap.bitsPerPixel,
                    isCompress: bitmap.isCompress,
                    data: bitmap.data.toString('base64')
                };
                callbacks.onBitmap(bitmapEvent);
            } catch (err) {
                logger.error(`[RDP] Error processing bitmap: ${err}`);
            }
        });

        // Handle close
        client.on('close', () => {
            logger.info(`[RDP] Connection closed for session ${sessionId}`);
            activeSessions.delete(sessionId);
            callbacks.onClose();
        });

        // Handle errors
        client.on('error', (err: Error) => {
            logger.error(`[RDP] Error: ${err.message}`);
            activeSessions.delete(sessionId);
            callbacks.onError(err);
        });

        // Store session
        const session: RdpSession = {
            id: sessionId,
            client,
            onBitmap: callbacks.onBitmap,
            onClose: callbacks.onClose,
            onError: callbacks.onError
        };
        activeSessions.set(sessionId, session);

        // Connect
        client.connect(config.host, config.port || 3389);
    }

    /**
     * Send mouse event to RDP session
     */
    static sendMouse(sessionId: string, x: number, y: number, button: number, isPressed: boolean): void {
        const session = activeSessions.get(sessionId);
        if (session && session.client) {
            if (isPressed) {
                session.client.sendPointerEvent(x, y, button, true);
            } else {
                session.client.sendPointerEvent(x, y, button, false);
            }
        }
    }

    /**
     * Send keyboard event to RDP session
     */
    static sendKeyboard(sessionId: string, scanCode: number, isPressed: boolean, isExtended: boolean): void {
        const session = activeSessions.get(sessionId);
        if (session && session.client) {
            session.client.sendKeyEventScancode(scanCode, isPressed, isExtended);
        }
    }

    /**
     * Disconnect RDP session
     */
    static disconnect(sessionId: string): void {
        const session = activeSessions.get(sessionId);
        if (session) {
            logger.info(`[RDP] Disconnecting session ${sessionId}`);
            try {
                session.client.close();
            } catch (err) {
                logger.error(`[RDP] Error closing session: ${err}`);
            }
            activeSessions.delete(sessionId);
        }
    }

    /**
     * Check if session is active
     */
    static isConnected(sessionId: string): boolean {
        return activeSessions.has(sessionId);
    }
}
