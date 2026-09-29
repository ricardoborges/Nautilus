import { execFile } from 'child_process';
import { decodeWslBuffer } from './wsl-command-runner';
import logger from '../../shared/utils/logger';

export function parseDistroList(raw: string): string[] {
    return raw
        .split('\n')
        .map(line => line.trim().replace(/^\*\s*/, '').replace(/\0/g, ''))
        .filter(line => line.length > 0);
}

export async function isWslAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') {
        return false;
    }

    return new Promise<boolean>((resolve) => {
        execFile('wsl.exe', ['--status'], { encoding: 'buffer', timeout: 5000 }, (error, stdout) => {
            if (error) {
                // Try --list as fallback check
                execFile('wsl.exe', ['--list', '--quiet'], { encoding: 'buffer', timeout: 5000 }, (err) => {
                    resolve(!err);
                });
                return;
            }
            resolve(true);
        });
    });
}

export async function listWslDistros(): Promise<{ distros: string[]; defaultDistro?: string }> {
    if (process.platform !== 'win32') {
        return { distros: [] };
    }

    return new Promise((resolve) => {
        execFile('wsl.exe', ['--list', '--quiet'], { encoding: 'buffer', timeout: 8000 }, (error, stdout) => {
            if (error) {
                logger.warn(`[WslDetector] Failed to list distros: ${error.message}`);
                return resolve({ distros: [] });
            }

            const decoded = decodeWslBuffer(stdout);
            const distros = parseDistroList(decoded);
            const defaultDistro = distros.length > 0 ? distros[0] : undefined;

            resolve({
                distros,
                defaultDistro,
            });
        });
    });
}
