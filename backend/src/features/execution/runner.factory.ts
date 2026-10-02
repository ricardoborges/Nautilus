import type { Connection, SSHConfig } from '../../shared/types';
import type { CommandRunner } from './command-runner.interface';
import { WSLCommandRunner } from './wsl-command-runner';
import { SSHCommandRunner } from './ssh-command-runner';

export type AuthConfigGetter = (connection: Connection) => Promise<SSHConfig>;

export async function createCommandRunner(
    connection: Connection,
    getAuthConfig?: AuthConfigGetter
): Promise<CommandRunner> {
    if (connection.connectionType === 'wsl') {
        const distro = connection.wslDistro || 'Ubuntu';
        return new WSLCommandRunner(distro, connection.wslUser);
    }

    if (!getAuthConfig) {
        throw new Error('AuthConfigGetter is required for SSH connections');
    }

    const authConfig = await getAuthConfig(connection);
    return new SSHCommandRunner(authConfig);
}
