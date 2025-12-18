import { Client, SFTPWrapper, FileEntry } from 'ssh2';
import type { SSHConfig, SFTPFile } from '../../shared/types';

export class SFTPClient {
    private sshConfig: SSHConfig;
    private client: Client;
    private sftp: SFTPWrapper | null = null;

    constructor(sshConfig: SSHConfig) {
        this.sshConfig = sshConfig;
        this.client = new Client();
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client
                .on('ready', () => {
                    this.client.sftp((err, sftp) => {
                        if (err) return reject(err);
                        this.sftp = sftp;
                        resolve();
                    });
                })
                .on('error', (err) => reject(err))
                .connect(this.sshConfig);
        });
    }

    list(remotePath: string): Promise<SFTPFile[]> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));

            this.sftp.readdir(remotePath, (err, list) => {
                if (err) return reject(err);

                const files: SFTPFile[] = list.map((item: FileEntry) => ({
                    name: item.filename,
                    isDirectory: item.longname.startsWith('d'),
                    isFile: item.longname.startsWith('-'),
                    size: item.attrs.size,
                    modified: new Date(item.attrs.mtime * 1000)
                }));
                resolve(files);
            });
        });
    }

    readFile(remotePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));

            const stream = this.sftp.createReadStream(remotePath);
            const chunks: Buffer[] = [];

            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks).toString(encoding)));
            stream.on('error', (err: Error) => reject(err));
        });
    }

    writeFile(remotePath: string, content: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));

            const stream = this.sftp.createWriteStream(remotePath);
            stream.on('finish', () => resolve());
            stream.on('error', (err: Error) => reject(err));
            stream.end(content, 'utf8');
        });
    }

    writeFileBuffer(remotePath: string, buffer: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));

            const stream = this.sftp.createWriteStream(remotePath);
            stream.on('finish', () => resolve());
            stream.on('error', (err: Error) => reject(err));
            stream.end(buffer);
        });
    }

    deleteFile(remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()));
        });
    }

    deleteDir(remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.rmdir(remotePath, (err) => (err ? reject(err) : resolve()));
        });
    }

    createDir(remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.mkdir(remotePath, (err) => (err ? reject(err) : resolve()));
        });
    }

    rename(oldPath: string, newPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()));
        });
    }

    downloadFile(remotePath: string, localPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.fastGet(remotePath, localPath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    uploadFile(localPath: string, remotePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.sftp) return reject(new Error('SFTP not connected'));
            this.sftp.fastPut(localPath, remotePath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    disconnect(): void {
        if (this.sftp) {
            this.sftp.end();
            this.sftp = null;
        }
        this.client.end();
    }
}
