/**
 * Extracts the connection alias from a %%sql magic line, if present.
 * Returns undefined when the first argument is absent, a flag (starts with "-"),
 * or a connection URL (contains "://") rather than a plain alias.
 */
export function extractConnectionAlias(magicLine: string): string | undefined {
    const parts = magicLine.trim().split(/\s+/);
    // parts[0] is "%%sql"; parts[1] (if any) is the connection argument
    if (parts.length < 2) {
        return undefined;
    }
    const firstArg = parts[1];
    // Option flags start with "-"
    if (firstArg.startsWith('-')) {
        return undefined;
    }
    // Full connection URLs contain "://"
    if (firstArg.includes('://')) {
        return undefined;
    }
    return firstArg;
}

/**
 * Extracts the connection URL from a %%sql magic line, if present.
 * Returns undefined when the first argument is absent, a flag (starts with "-"),
 * or a plain alias (no "://").
 */
export function extractConnectionUrl(magicLine: string): string | undefined {
    const parts = magicLine.trim().split(/\s+/);
    // parts[0] is "%%sql"; parts[1] (if any) is the connection argument
    if (parts.length < 2) {
        return undefined;
    }
    const firstArg = parts[1];
    // Option flags start with "-"
    if (firstArg.startsWith('-')) {
        return undefined;
    }
    // Only return URLs (those containing "://")
    if (!firstArg.includes('://')) {
        return undefined;
    }
    return firstArg;
}

/**
 * Parses the SQLAlchemy dialect name from a connection URL string
 * (e.g. "duckdb://", "postgresql+psycopg2://user:pass@host/db").
 * Strips the scheme before "://" and any "+driver" suffix, then
 * lowercases the result.
 * Returns undefined if the URL cannot be parsed.
 */
export function dialectNameFromUrl(url: string): string | undefined {
    try {
        const scheme = url.split('://')[0].split('+')[0].toLowerCase();
        return scheme || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Returns true when the magic line tokens (already split on whitespace) contain
 * a --alias / -A flag, meaning the connection is named rather than the default.
 */
function hasAliasFlag(parts: string[]): boolean {
    for (let j = 2; j < parts.length; j++) {
        if (parts[j] === '--alias' || parts[j] === '-A') {
            return true;
        }
    }
    return false;
}

/**
 * Scans an array of cell source strings (from oldest to newest) for the most
 * recent %%sql / %sql magic line that defines the given alias via --alias or
 * -A and also includes a connection URL.
 * Returns the connection URL when found, or undefined.
 * This allows the formatter to resolve an alias to a dialect entirely from the
 * notebook content, avoiding a kernel roundtrip.
 */
export function findUrlForAlias(cellSources: string[], alias: string): string | undefined {
    for (let i = cellSources.length - 1; i >= 0; i--) {
        for (const line of cellSources[i].split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('%%sql') && !trimmed.startsWith('%sql')) {
                continue;
            }
            const url = extractConnectionUrl(trimmed);
            if (url === undefined) {
                continue;
            }
            const parts = trimmed.split(/\s+/);
            for (let j = 2; j < parts.length; j++) {
                if ((parts[j] === '--alias' || parts[j] === '-A') && parts[j + 1] === alias) {
                    return url;
                }
            }
        }
    }
    return undefined;
}

/**
 * Scans an array of cell source strings (from oldest to newest) for the most
 * recent %%sql / %sql magic line that sets a default (unnamed) connection, i.e.
 * has a connection URL but no --alias / -A flag.
 * Returns the connection URL when found, or undefined.
 * This is used to infer the dialect for bare %%sql cells without any connection
 * argument, matching what you see in the notebook rather than kernel state.
 */
export function findDefaultUrl(cellSources: string[]): string | undefined {
    for (let i = cellSources.length - 1; i >= 0; i--) {
        for (const line of cellSources[i].split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('%%sql') && !trimmed.startsWith('%sql')) {
                continue;
            }
            const url = extractConnectionUrl(trimmed);
            if (url === undefined) {
                continue;
            }
            const parts = trimmed.split(/\s+/);
            if (!hasAliasFlag(parts)) {
                return url;
            }
        }
    }
    return undefined;
}
