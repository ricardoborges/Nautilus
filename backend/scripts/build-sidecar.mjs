/**
 * Builds the backend sidecar for the *host* platform.
 *
 * The output name must carry the Rust target triple, because that is what
 * src-tauri/src/lib.rs looks for. Cross-compiling is not attempted: the bundle
 * embeds native modules (keytar) built for the host, so a sidecar is only valid
 * on the platform it was produced on.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const TARGETS = {
    'win32-x64': { pkg: 'node18-win-x64', triple: 'x86_64-pc-windows-msvc', ext: '.exe' },
    'win32-arm64': { pkg: 'node18-win-arm64', triple: 'aarch64-pc-windows-msvc', ext: '.exe' },
    'darwin-x64': { pkg: 'node18-macos-x64', triple: 'x86_64-apple-darwin', ext: '' },
    'darwin-arm64': { pkg: 'node18-macos-arm64', triple: 'aarch64-apple-darwin', ext: '' },
    'linux-x64': { pkg: 'node18-linux-x64', triple: 'x86_64-unknown-linux-gnu', ext: '' },
    'linux-arm64': { pkg: 'node18-linux-arm64', triple: 'aarch64-unknown-linux-gnu', ext: '' },
};

/**
 * pkg caches the native modules it downloads as `<name>.node.<platform>.v<ver>`
 * and reuses any file it finds under that name (producer.js, nativePrebuildInstall).
 * The key omits the architecture, so a macos-x64 build poisons a later
 * macos-arm64 one with an x86_64 .node and the sidecar dies at startup with
 * ERR_DLOPEN_FAILED.
 *
 * Rather than just deleting the cache — which would re-download on every build
 * and break offline builds — keep our own arch-suffixed copy alongside it and
 * swap the right one into place.
 */
const CACHED_NATIVE = /\.node\.(macos|win|linux|alpine|linuxstatic)\.v[\d.]+$/;

function findCachedNatives(dir, found = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return found;
    }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findCachedNatives(full, found);
        } else if (CACHED_NATIVE.test(entry.name)) {
            found.push(full);
        } else if (entry.name.endsWith('.node.bak')) {
            // pkg swaps the real .node aside while fetching a prebuild; a leftover
            // .bak means an interrupted run left a foreign-arch .node in place.
            renameSync(full, full.slice(0, -'.bak'.length));
        }
    }
    return found;
}

/** Point pkg's arch-blind cache at the copy built for `arch`, if we have one. */
function primeNativeCache(nodeModules, arch) {
    let restored = 0;
    let cleared = 0;

    for (const cached of findCachedNatives(nodeModules)) {
        const stash = `${cached}.${arch}`;
        if (existsSync(stash)) {
            copyFileSync(stash, cached);
            restored++;
        } else {
            // Unknown provenance — assume it is the wrong arch and make pkg refetch.
            rmSync(cached, { force: true });
            cleared++;
        }
    }
    return { restored, cleared };
}

/** Save whatever pkg just fetched under an arch-qualified name for next time. */
function stashNativeCache(nodeModules, arch) {
    let stashed = 0;
    for (const cached of findCachedNatives(nodeModules)) {
        const stash = `${cached}.${arch}`;
        if (!existsSync(stash)) {
            copyFileSync(cached, stash);
            stashed++;
        }
    }
    return stashed;
}

const key = `${process.platform}-${process.arch}`;
const target = TARGETS[key];

if (!target) {
    console.error(`Unsupported host platform: ${key}. Supported: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
}

const backendRoot = path.resolve(import.meta.dirname, '..');
const nodeModules = path.join(backendRoot, 'node_modules');
const outDir = path.resolve(backendRoot, '..', 'src-tauri', 'binaries');
const outFile = path.join(outDir, `nautilus-backend-${target.triple}${target.ext}`);

mkdirSync(outDir, { recursive: true });

const { restored, cleared } = primeNativeCache(nodeModules, process.arch);
if (restored > 0) console.log(`Reused ${restored} cached ${process.arch} native module(s)`);
if (cleared > 0) console.log(`Cleared ${cleared} native module(s) of unknown architecture`);

console.log(`Building sidecar for ${key} -> ${path.basename(outFile)}`);

const result = spawnSync(
    process.execPath,
    [
        path.join(nodeModules, 'pkg', 'lib-es5', 'bin.js'),
        'dist/index.js',
        '--target', target.pkg,
        '--output', outFile,
        '--config', 'pkg.json',
    ],
    { cwd: backendRoot, stdio: 'inherit' }
);

if (result.status !== 0) {
    console.error(`pkg failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
}

const stashed = stashNativeCache(nodeModules, process.arch);
if (stashed > 0) console.log(`Cached ${stashed} ${process.arch} native module(s) for future builds`);

// pkg does not always set the exec bit on non-Windows output.
if (process.platform !== 'win32') {
    spawnSync('chmod', ['+x', outFile], { stdio: 'inherit' });
}

console.log(`Sidecar written to ${outFile}`);
