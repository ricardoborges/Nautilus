import { execFile } from 'child_process';
import { decodeWslBuffer } from './wsl-command-runner';
import logger from '../../shared/utils/logger';

export interface WslcContainerRaw {
    Command?: string;
    CreatedAt?: string;
    HealthStatus?: string;
    ID?: string;
    Image?: string;
    Labels?: string;
    LocalVolumes?: string;
    Mounts?: string;
    Names?: string;
    Networks?: string;
    Platform?: { architecture?: string; os?: string };
    Ports?: string;
    RunningFor?: string;
    Size?: string;
    State?: string;
    Status?: string;
}

export interface WslcImageRaw {
    Containers?: string;
    CreatedAt?: string;
    CreatedSince?: string;
    Digest?: string;
    ID?: string;
    Repository?: string;
    SharedSize?: string;
    Size?: string;
    Tag?: string;
    UniqueSize?: string;
}

export interface WslcVolumeRaw {
    Availability?: string;
    Driver?: string;
    Group?: string;
    Labels?: string;
    Links?: string;
    Mountpoint?: string;
    Name?: string;
    Scope?: string;
    Size?: string;
    Status?: string;
}

export interface WslcNetworkRaw {
    CreatedAt?: string;
    Driver?: string;
    ID?: string;
    IPv4?: string;
    IPv6?: string;
    Internal?: string;
    Labels?: string;
    Name?: string;
    Scope?: string;
}

export interface WslcStatRaw {
    BlockIO?: string;
    CPUPerc?: string;
    ID?: string;
    MemPerc?: string;
    MemUsage?: string;
    Name?: string;
    NetIO?: string;
    PIDs?: number;
}

export function parseWslcLabels(labelStr?: string): { stack: string; service: string } {
    if (!labelStr) return { stack: '', service: '' };
    const projectMatch = labelStr.match(/com\.docker\.compose\.project=([^,]+)/);
    const serviceMatch = labelStr.match(/com\.docker\.compose\.service=([^,]+)/);
    return {
        stack: projectMatch ? projectMatch[1].trim() : '',
        service: serviceMatch ? serviceMatch[1].trim() : '',
    };
}

export function parseWslcContainers(jsonLines: string): Array<{
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    created: string;
    stack: string;
    service: string;
    ipAddress: string;
}> {
    const lines = jsonLines.trim().split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
        try {
            const raw: WslcContainerRaw = JSON.parse(line.trim());
            const labels = parseWslcLabels(raw.Labels);
            return {
                id: raw.ID || '',
                name: (raw.Names || '').replace(/^\//, ''),
                image: raw.Image || '',
                status: raw.Status || '',
                state: raw.State || 'unknown',
                ports: raw.Ports || '',
                created: raw.CreatedAt || '',
                stack: labels.stack,
                service: labels.service,
                ipAddress: '',
            };
        } catch {
            return null;
        }
    }).filter((c): c is NonNullable<typeof c> => c !== null);
}

export function parseWslcImages(jsonLines: string): Array<{
    id: string;
    repository: string;
    tag: string;
    size: string;
    created: string;
    containersCount?: number;
    inUse?: boolean;
}> {
    const lines = jsonLines.trim().split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
        try {
            const raw: WslcImageRaw = JSON.parse(line.trim());
            const containersCount = typeof raw.Containers === 'string' && raw.Containers.trim() !== ''
                ? parseInt(raw.Containers.trim(), 10)
                : undefined;
            const inUse = containersCount !== undefined && !isNaN(containersCount) ? containersCount > 0 : undefined;
            return {
                id: raw.ID || '',
                repository: raw.Repository || '<none>',
                tag: raw.Tag || '<none>',
                size: raw.Size || '',
                created: raw.CreatedAt || raw.CreatedSince || '',
                containersCount: containersCount !== undefined && !isNaN(containersCount) ? containersCount : undefined,
                inUse,
            };
        } catch {
            return null;
        }
    }).filter((img): img is NonNullable<typeof img> => img !== null);
}

export function parseWslcVolumes(jsonLines: string): Array<{
    name: string;
    driver: string;
    mountpoint: string;
    created: string;
    size: string;
}> {
    const lines = jsonLines.trim().split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
        try {
            const raw: WslcVolumeRaw = JSON.parse(line.trim());
            return {
                name: raw.Name || '',
                driver: raw.Driver || '',
                mountpoint: raw.Mountpoint || '',
                created: '',
                size: raw.Size && raw.Size !== 'N/A' ? raw.Size : '-',
            };
        } catch {
            return null;
        }
    }).filter((v): v is NonNullable<typeof v> => v !== null);
}

export function parseWslcNetworks(jsonLines: string): Array<{
    id: string;
    name: string;
    driver: string;
    scope: string;
    attachable: boolean;
    internal: boolean;
    ipamDriver: string;
    subnet: string;
    gateway: string;
    stack: string;
    isSystem: boolean;
}> {
    const lines = jsonLines.trim().split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
        try {
            const raw: WslcNetworkRaw = JSON.parse(line.trim());
            const isSystem = ['bridge', 'host', 'none', 'null'].includes(raw.Name || '');
            const labels = parseWslcLabels(raw.Labels);
            return {
                id: raw.ID?.substring(0, 12) || '',
                name: raw.Name || '',
                driver: raw.Driver || '',
                scope: raw.Scope || 'local',
                attachable: false,
                internal: raw.Internal === 'true',
                ipamDriver: 'default',
                subnet: '',
                gateway: '',
                stack: labels.stack,
                isSystem,
            };
        } catch {
            return null;
        }
    }).filter((net): net is NonNullable<typeof net> => net !== null);
}

export function parseWslcStats(jsonLines: string): Array<{
    id: string;
    name: string;
    cpu: string;
    memUsage: string;
    memPerc: string;
    netIO: string;
    blockIO: string;
}> {
    const lines = jsonLines.trim().split('\n').filter(l => l.trim().length > 0);
    return lines.map(line => {
        try {
            const raw: WslcStatRaw = JSON.parse(line.trim());
            return {
                id: raw.ID?.substring(0, 12) || '',
                name: raw.Name || '',
                cpu: raw.CPUPerc || '0%',
                memUsage: raw.MemUsage || '0B',
                memPerc: raw.MemPerc || '0%',
                netIO: raw.NetIO || '0B',
                blockIO: raw.BlockIO || '0B',
            };
        } catch {
            return null;
        }
    }).filter((stat): stat is NonNullable<typeof stat> => stat !== null);
}

export async function isWslcAvailable(): Promise<boolean> {
    if (process.platform !== 'win32') {
        return false;
    }
    return new Promise<boolean>((resolve) => {
        execFile('wslc.exe', ['--version'], { encoding: 'buffer', timeout: 5000 }, (error, stdout) => {
            if (error) {
                return resolve(false);
            }
            const out = decodeWslBuffer(stdout);
            resolve(out.toLowerCase().includes('wslc'));
        });
    });
}

export async function getWslcVersion(): Promise<string> {
    return new Promise<string>((resolve) => {
        execFile('wslc.exe', ['--version'], { encoding: 'buffer', timeout: 5000 }, (error, stdout) => {
            if (error) return resolve('unknown');
            const out = decodeWslBuffer(stdout);
            const match = out.match(/wslc\s+([0-9.]+)/i);
            resolve(match ? match[1] : out || 'unknown');
        });
    });
}

export async function wslcExec(args: string[], timeoutMs = 30000): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
        execFile(
            'wslc.exe',
            args,
            { encoding: 'buffer', timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout, stderr) => {
                const outStr = decodeWslBuffer(stdout);
                const errStr = decodeWslBuffer(stderr);
                const exitCode = error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
                if (error && !outStr && errStr) {
                    logger.warn(`[wslcExec] Error executing wslc ${args.join(' ')}: ${errStr}`);
                }
                resolve({
                    stdout: outStr,
                    stderr: errStr,
                    code: exitCode,
                });
            }
        );
    });
}

export async function wslcListContainersWithIps(): Promise<Array<{
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    created: string;
    stack: string;
    service: string;
    ipAddress: string;
}>> {
    const listRes = await wslcExec(['list', '-a', '--format', 'json']);
    const containers = parseWslcContainers(listRes.stdout);
    if (containers.length === 0) return [];

    const runningNames = containers
        .filter(c => c.state === 'running' && c.name)
        .map(c => c.name);

    if (runningNames.length > 0) {
        try {
            const inspectRes = await wslcExec(['inspect', ...runningNames], 10000);
            if (inspectRes.stdout) {
                const inspectData = JSON.parse(inspectRes.stdout);
                if (Array.isArray(inspectData)) {
                    const ipMap = new Map<string, string>();
                    for (const obj of inspectData) {
                        const rawName = (obj.Name || '').replace(/^\//, '');
                        const nets = (obj.NetworkSettings?.Networks || {}) as Record<string, { IPAddress?: string }>;
                        const firstNet = Object.values(nets).find(n => n && typeof n.IPAddress === 'string');
                        const firstIp = firstNet?.IPAddress || '';
                        if (rawName) ipMap.set(rawName, firstIp);
                    }
                    for (const c of containers) {
                        if (ipMap.has(c.name)) {
                            c.ipAddress = ipMap.get(c.name)!;
                        }
                    }
                }
            }
        } catch (e) {
            logger.warn(`[wslcListContainersWithIps] Failed to inspect IP addresses: ${(e as Error).message}`);
        }
    }

    return containers;
}
