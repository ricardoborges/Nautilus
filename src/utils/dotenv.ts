/**
 * Dotenv parsing and serialization.
 *
 * The editor shows variables as fields, but the file it writes back must stay
 * faithful to the original: comments, blank lines, ordering, `export` prefixes
 * and quoting style are all preserved, and anything that cannot be parsed with
 * confidence is carried through untouched rather than rewritten.
 */

export type QuoteStyle = 'none' | 'single' | 'double';

export interface EnvVariable {
    kind: 'variable';
    /** Stable identity for React keys and edits; not part of the file. */
    id: string;
    key: string;
    value: string;
    quote: QuoteStyle;
    /** True when the original line used `export FOO=bar`. */
    exported: boolean;
    /** Trailing `# comment` kept after the value. */
    inlineComment: string;
    /** Original whitespace between value and `#`, so spacing survives a save. */
    inlineCommentGap: string;
}

export interface EnvComment {
    kind: 'comment';
    id: string;
    text: string;
}

export interface EnvBlank {
    kind: 'blank';
    id: string;
}

/** A line we could not parse confidently - preserved verbatim. */
export interface EnvRaw {
    kind: 'raw';
    id: string;
    text: string;
}

export type EnvEntry = EnvVariable | EnvComment | EnvBlank | EnvRaw;

let idCounter = 0;
const nextId = (): string => `env-${++idCounter}`;

const VARIABLE_RE = /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Splits an unquoted value from its trailing comment. Dotenv treats ` #` as the
 * start of a comment only when preceded by whitespace, so `pass#word` is intact.
 */
function splitBareValue(rest: string): { value: string; inlineComment: string; gap: string } {
    const match = rest.match(/(\s+)#(.*)$/);
    if (!match || match.index === undefined) {
        return { value: rest.trim(), inlineComment: '', gap: '' };
    }
    return {
        value: rest.slice(0, match.index).trim(),
        inlineComment: match[2].trim(),
        gap: match[1],
    };
}

/**
 * Reads a quoted value starting at position 0 of `rest`.
 * Returns null when the closing quote is missing, so the caller can preserve
 * the line verbatim instead of corrupting a multi-line value.
 */
function readQuoted(rest: string, quoteChar: '"' | "'"): { value: string; inlineComment: string; gap: string } | null {
    let value = '';
    let i = 1;

    while (i < rest.length) {
        const char = rest[i];

        if (char === '\\' && quoteChar === '"' && i + 1 < rest.length) {
            const escaped = rest[i + 1];
            value += escaped === 'n' ? '\n'
                : escaped === 't' ? '\t'
                : escaped === 'r' ? '\r'
                : escaped;
            i += 2;
            continue;
        }

        if (char === quoteChar) {
            const after = rest.slice(i + 1);
            const trailing = after.trim();
            // Anything else after the closing quote is unexpected; bail out and
            // keep the original line rather than silently dropping it.
            if (trailing && !trailing.startsWith('#')) return null;
            return {
                value,
                inlineComment: trailing.startsWith('#') ? trailing.slice(1).trim() : '',
                gap: trailing ? (after.match(/^\s*/)?.[0] ?? '') : '',
            };
        }

        value += char;
        i++;
    }

    return null;
}

export function parseEnv(content: string): EnvEntry[] {
    const normalized = content.replace(/\r\n/g, '\n');
    // A trailing newline denotes end of file, not an extra blank line
    const lines = normalized.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    return lines.map((line): EnvEntry => {
        if (!line.trim()) {
            return { kind: 'blank', id: nextId() };
        }

        if (line.trimStart().startsWith('#')) {
            return { kind: 'comment', id: nextId(), text: line.trimStart().slice(1).trim() };
        }

        const match = line.match(VARIABLE_RE);
        if (!match) {
            return { kind: 'raw', id: nextId(), text: line };
        }

        const [, , exportPrefix, key, rawRest] = match;
        const rest = rawRest.trim();

        if (rest.startsWith('"') || rest.startsWith("'")) {
            const quoteChar = rest[0] as '"' | "'";
            const parsed = readQuoted(rest, quoteChar);
            if (!parsed) {
                return { kind: 'raw', id: nextId(), text: line };
            }
            return {
                kind: 'variable',
                id: nextId(),
                key,
                value: parsed.value,
                quote: quoteChar === '"' ? 'double' : 'single',
                exported: Boolean(exportPrefix),
                inlineComment: parsed.inlineComment,
                inlineCommentGap: parsed.gap,
            };
        }

        const { value, inlineComment, gap } = splitBareValue(rest);
        return {
            kind: 'variable',
            id: nextId(),
            key,
            value,
            quote: 'none',
            exported: Boolean(exportPrefix),
            inlineComment,
            inlineCommentGap: gap,
        };
    });
}

/**
 * Picks the quoting a value needs, upgrading only when required.
 *
 * Deliberately conservative: a value is quoted only when leaving it bare would
 * change its meaning (whitespace, quote characters, backslashes, newlines).
 * An empty value or a bare `#` inside a value - as in a URL fragment - is left
 * exactly as the user wrote it, so saving never reformats untouched lines.
 */
function effectiveQuote(entry: EnvVariable): QuoteStyle {
    const needsQuoting = /[\s"'\\]/.test(entry.value);

    if (!needsQuoting) return entry.quote;
    if (entry.quote !== 'none') return entry.quote;
    // Single quotes cannot hold a single quote; fall back to double
    return entry.value.includes("'") ? 'double' : 'single';
}

function formatValue(entry: EnvVariable): string {
    const quote = effectiveQuote(entry);

    if (quote === 'single') {
        // No escape mechanism inside single quotes, so a value containing one
        // must use double quotes instead.
        if (entry.value.includes("'")) {
            return `"${escapeDouble(entry.value)}"`;
        }
        return `'${entry.value}'`;
    }

    if (quote === 'double') {
        return `"${escapeDouble(entry.value)}"`;
    }

    return entry.value;
}

function escapeDouble(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

export function serializeEnv(entries: EnvEntry[]): string {
    const lines = entries.map(entry => {
        switch (entry.kind) {
            case 'blank':
                return '';
            case 'comment':
                return entry.text ? `# ${entry.text}` : '#';
            case 'raw':
                return entry.text;
            case 'variable': {
                const prefix = entry.exported ? 'export ' : '';
                const comment = entry.inlineComment
                    ? `${entry.inlineCommentGap || ' '}# ${entry.inlineComment}`
                    : '';
                return `${prefix}${entry.key}=${formatValue(entry)}${comment}`;
            }
        }
    });

    // Always end with a single trailing newline, as tooling expects
    return lines.join('\n') + '\n';
}

export function createVariable(key = '', value = ''): EnvVariable {
    return {
        kind: 'variable',
        id: nextId(),
        key,
        value,
        quote: 'none',
        exported: false,
        inlineComment: '',
        inlineCommentGap: '',
    };
}

/** Keys defined more than once - the last one wins at runtime. */
export function findDuplicateKeys(entries: EnvEntry[]): string[] {
    const seen = new Map<string, number>();
    for (const entry of entries) {
        if (entry.kind !== 'variable' || !entry.key) continue;
        seen.set(entry.key, (seen.get(entry.key) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

const VALID_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidKey(key: string): boolean {
    return VALID_KEY_RE.test(key);
}
