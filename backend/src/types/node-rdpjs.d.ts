declare module 'node-rdpjs' {
    interface RdpClientOptions {
        domain?: string;
        userName: string;
        password: string;
        enablePerf?: boolean;
        autoLogin?: boolean;
        screen?: {
            width: number;
            height: number;
        };
        locale?: string;
        logLevel?: string;
    }

    interface RdpBitmap {
        destTop: number;
        destLeft: number;
        destBottom: number;
        destRight: number;
        width: number;
        height: number;
        bitsPerPixel: number;
        isCompress: boolean;
        data: Buffer;
    }

    interface RdpClient {
        on(event: 'connect', listener: () => void): this;
        on(event: 'bitmap', listener: (bitmap: RdpBitmap) => void): this;
        on(event: 'close', listener: () => void): this;
        on(event: 'error', listener: (err: Error) => void): this;
        connect(host: string, port: number): void;
        close(): void;
        sendPointerEvent(x: number, y: number, button: number, isPressed: boolean): void;
        sendKeyEventScancode(scanCode: number, isPressed: boolean, isExtended: boolean): void;
    }

    function createClient(options: RdpClientOptions): RdpClient;

    export { createClient, RdpClient, RdpClientOptions, RdpBitmap };
    export default { createClient };
}
