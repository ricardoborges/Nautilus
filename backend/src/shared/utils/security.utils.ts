/**
 * Security Utilities
 * 
 * Provides functions for validating IDs and escaping shell arguments.
 */

/**
 * Validates an ID or name (container, image, volume, network, PID)
 * to ensure it contains only safe characters.
 */
export function validateId(id: unknown, fieldName: string = 'ID'): string {
    if (typeof id !== 'string' || !id.trim()) {
        throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
    }

    const trimmed = id.trim();
    // Allow alphanumeric, dashes, underscores, dots, colons, forward slashes (e.g., repo/image:tag)
    if (!/^[a-zA-Z0-9_.:/-]+$/.test(trimmed)) {
        throw new Error(`Security Violation: Invalid characters in ${fieldName}`);
    }

    return trimmed;
}

/**
 * Escapes a single shell argument safely for Bash/sh
 */
export function escapeShellArg(arg: string): string {
    if (arg === null || arg === undefined) return "''";
    const str = String(arg);
    if (str === '') return "''";
    return `'${str.replace(/'/g, "'\\''")}'`;
}
