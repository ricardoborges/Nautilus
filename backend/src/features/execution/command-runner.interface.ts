export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
}

export interface CommandRunnerOptions {
    timeout?: number;
}

export interface CommandRunner {
    exec(command: string, options?: CommandRunnerOptions): Promise<CommandResult>;
    dispose?(): Promise<void> | void;
}
