import { extractConnectionAlias, extractConnectionUrl, dialectNameFromUrl, findUrlForAlias, findDefaultUrl } from '../formatter/utils';

describe('extractConnectionAlias', () => {
    it('returns undefined for bare %%sql magic line', () => {
        expect(extractConnectionAlias('%%sql')).toBeUndefined();
    });

    it('returns undefined when first argument is an option flag', () => {
        expect(extractConnectionAlias('%%sql --save myquery')).toBeUndefined();
        expect(extractConnectionAlias('%%sql -l')).toBeUndefined();
    });

    it('returns undefined when first argument is a connection URL', () => {
        expect(extractConnectionAlias('%%sql duckdb://')).toBeUndefined();
        expect(extractConnectionAlias('%%sql postgresql://user:pass@localhost/db')).toBeUndefined();
        expect(extractConnectionAlias('%%sql sqlite://')).toBeUndefined();
    });

    it('returns the alias when first argument is a plain alias', () => {
        expect(extractConnectionAlias('%%sql mydb')).toBe('mydb');
        expect(extractConnectionAlias('%%sql prod_db')).toBe('prod_db');
    });

    it('returns the alias and ignores subsequent options', () => {
        expect(extractConnectionAlias('%%sql mydb --save myquery')).toBe('mydb');
        expect(extractConnectionAlias('%%sql myalias -S savedquery')).toBe('myalias');
    });

    it('handles extra whitespace', () => {
        expect(extractConnectionAlias('%%sql  mydb')).toBe('mydb');
    });
});

describe('extractConnectionUrl', () => {
    it('returns undefined for bare %%sql magic line', () => {
        expect(extractConnectionUrl('%%sql')).toBeUndefined();
    });

    it('returns undefined when first argument is an option flag', () => {
        expect(extractConnectionUrl('%%sql --save myquery')).toBeUndefined();
        expect(extractConnectionUrl('%%sql -l')).toBeUndefined();
    });

    it('returns undefined when first argument is a plain alias', () => {
        expect(extractConnectionUrl('%%sql mydb')).toBeUndefined();
        expect(extractConnectionUrl('%%sql prod_db')).toBeUndefined();
    });

    it('returns the URL when first argument is a connection URL', () => {
        expect(extractConnectionUrl('%%sql duckdb://')).toBe('duckdb://');
        expect(extractConnectionUrl('%%sql sqlite://')).toBe('sqlite://');
        expect(extractConnectionUrl('%%sql postgresql://user:pass@localhost/db')).toBe('postgresql://user:pass@localhost/db');
        expect(extractConnectionUrl('%%sql mysql+pymysql://root@localhost/mydb')).toBe('mysql+pymysql://root@localhost/mydb');
    });

    it('handles extra whitespace', () => {
        expect(extractConnectionUrl('%%sql  duckdb://')).toBe('duckdb://');
    });
});

describe('dialectNameFromUrl', () => {
    it('returns the bare dialect name for simple URLs', () => {
        expect(dialectNameFromUrl('duckdb://')).toBe('duckdb');
        expect(dialectNameFromUrl('sqlite://')).toBe('sqlite');
        expect(dialectNameFromUrl('postgresql://user:pass@localhost/db')).toBe('postgresql');
        expect(dialectNameFromUrl('mysql://root@localhost/mydb')).toBe('mysql');
        expect(dialectNameFromUrl('snowflake://...')).toBe('snowflake');
        expect(dialectNameFromUrl('mssql://...')).toBe('mssql');
    });

    it('strips the driver suffix (e.g. +pymysql) before returning', () => {
        expect(dialectNameFromUrl('mysql+pymysql://root@localhost/mydb')).toBe('mysql');
        expect(dialectNameFromUrl('postgresql+psycopg2://user:pass@localhost/db')).toBe('postgresql');
        expect(dialectNameFromUrl('mssql+pyodbc://...')).toBe('mssql');
        expect(dialectNameFromUrl('oracle+oracledb://...')).toBe('oracle');
        expect(dialectNameFromUrl('redshift+redshift_connector://...')).toBe('redshift');
    });

    it('is case-insensitive (lowercases the scheme)', () => {
        expect(dialectNameFromUrl('DuckDB://')).toBe('duckdb');
        expect(dialectNameFromUrl('PostgreSQL://user:pass@localhost/db')).toBe('postgresql');
    });

    it('returns the raw scheme even for unrecognised dialects', () => {
        expect(dialectNameFromUrl('unknown://')).toBe('unknown');
        expect(dialectNameFromUrl('ftp://example.com')).toBe('ftp');
    });
});

describe('findUrlForAlias', () => {
    it('returns undefined when cell list is empty', () => {
        expect(findUrlForAlias([], 'mydb')).toBeUndefined();
    });

    it('returns undefined when no cell defines the alias', () => {
        const cells = [
            '%%sql duckdb://\nSELECT 1',
            '%sql sqlite:// --alias other',
        ];
        expect(findUrlForAlias(cells, 'mydb')).toBeUndefined();
    });

    it('finds a %%sql cell magic alias definition with --alias', () => {
        const cells = ['%%sql duckdb:// --alias mydb\nSELECT 1'];
        expect(findUrlForAlias(cells, 'mydb')).toBe('duckdb://');
    });

    it('finds a %sql line magic alias definition with --alias', () => {
        const cells = ['%sql duckdb:// --alias mydb'];
        expect(findUrlForAlias(cells, 'mydb')).toBe('duckdb://');
    });

    it('finds an alias definition using the short -A flag', () => {
        const cells = ['%%sql sqlite:// -A mydb\nSELECT 1'];
        expect(findUrlForAlias(cells, 'mydb')).toBe('sqlite://');
    });

    it('returns the most recent (last) definition when alias is defined multiple times', () => {
        const cells = [
            '%%sql sqlite:// --alias mydb\nSELECT 1',
            '%%sql duckdb:// --alias mydb\nSELECT 1',
        ];
        expect(findUrlForAlias(cells, 'mydb')).toBe('duckdb://');
    });

    it('does not match a definition that appears after the provided cells', () => {
        // Only cells *before* the current cell are passed in; this tests that
        // slicing is the caller's responsibility, not findUrlForAlias's.
        const cells = ['%sql sqlite:// --alias mydb'];
        expect(findUrlForAlias(cells, 'mydb')).toBe('sqlite://');
        expect(findUrlForAlias([], 'mydb')).toBeUndefined();
    });

    it('handles full connection URLs with credentials', () => {
        const cells = ['%sql postgresql+psycopg2://user:pass@localhost/mydb --alias prod'];
        expect(findUrlForAlias(cells, 'prod')).toBe('postgresql+psycopg2://user:pass@localhost/mydb');
    });

    it('does not confuse a different alias in the same cell', () => {
        const cells = ['%%sql duckdb:// --alias other\nSELECT 1'];
        expect(findUrlForAlias(cells, 'mydb')).toBeUndefined();
    });

    it('finds the alias definition even when extra options follow it', () => {
        const cells = ['%sql duckdb:// --alias mydb --section dev'];
        expect(findUrlForAlias(cells, 'mydb')).toBe('duckdb://');
    });
});

describe('findDefaultUrl', () => {
    it('returns undefined when cell list is empty', () => {
        expect(findDefaultUrl([])).toBeUndefined();
    });

    it('returns undefined when no cell has a bare connection URL', () => {
        const cells = [
            '%sql duckdb:// --alias mydb',
            '%sql sqlite:// -A other',
        ];
        expect(findDefaultUrl(cells)).toBeUndefined();
    });

    it('finds a %%sql default connection (no alias flag)', () => {
        const cells = ['%%sql duckdb://\nSELECT 1'];
        expect(findDefaultUrl(cells)).toBe('duckdb://');
    });

    it('finds a %sql default connection (no alias flag)', () => {
        const cells = ['%sql sqlite://'];
        expect(findDefaultUrl(cells)).toBe('sqlite://');
    });

    it('returns the most recent default connection when multiple are present', () => {
        const cells = [
            '%sql sqlite://',
            '%sql duckdb://',
        ];
        expect(findDefaultUrl(cells)).toBe('duckdb://');
    });

    it('ignores named alias definitions and returns the default', () => {
        const cells = [
            '%sql duckdb:// --alias prod',
            '%sql sqlite://',
        ];
        expect(findDefaultUrl(cells)).toBe('sqlite://');
    });

    it('skips named connections and finds the most recent unnamed one', () => {
        const cells = [
            '%sql sqlite://',
            '%sql duckdb:// --alias named',
        ];
        expect(findDefaultUrl(cells)).toBe('sqlite://');
    });

    it('handles full connection URLs with credentials', () => {
        const cells = ['%sql postgresql+psycopg2://user:pass@localhost/mydb'];
        expect(findDefaultUrl(cells)).toBe('postgresql+psycopg2://user:pass@localhost/mydb');
    });

    it('ignores non-magic lines within a cell', () => {
        const cells = ['# just a comment\nimport something\nSELECT 1'];
        expect(findDefaultUrl(cells)).toBeUndefined();
    });

    it('finds a bare URL even when other options precede the alias flag in another cell', () => {
        const cells = [
            '%sql duckdb://',
            '%sql sqlite:// --alias named',
        ];
        expect(findDefaultUrl(cells)).toBe('duckdb://');
    });
});
