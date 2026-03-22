// inspired by: https://github.com/ryantam626/jupyterlab_code_formatter
import { Cell, CodeCell } from '@jupyterlab/cells';
import { INotebookTracker, Notebook } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';
import { showErrorMessage } from '@jupyterlab/apputils';
import { format } from 'sql-formatter';
import type { SqlLanguage } from 'sql-formatter';
import { extractConnectionAlias, extractConnectionUrl, dialectNameFromUrl, findUrlForAlias, findDefaultUrl } from './utils';

/**
 * Maps SQLAlchemy dialect names to sql-formatter language identifiers.
 * Falls back to 'sql' (generic) for unknown dialects.
 */
const SQLALCHEMY_TO_LANGUAGE: Record<string, SqlLanguage> = {
    athena: 'trino',
    awsathena: 'trino',
    bigquery: 'bigquery',
    clickhouse: 'clickhouse',
    clickhouse_driver: 'clickhouse',
    cockroachdb: 'postgresql',
    databricks: 'spark',
    doris: 'mysql',
    drill: 'sql',
    dremio: 'sql',
    druid: 'sql',
    duckdb: 'duckdb',
    exasol: 'sql',
    hive: 'hive',
    mariadb: 'mariadb',
    materialize: 'postgresql',
    mssql: 'tsql',
    mysql: 'mysql',
    oracle: 'plsql',
    postgresql: 'postgresql',
    presto: 'trino',
    redshift: 'redshift',
    risingwave: 'postgresql',
    singlestore: 'singlestoredb',
    singlestoredb: 'singlestoredb',
    snowflake: 'snowflake',
    solr: 'sql',
    spark: 'spark',
    sqlite: 'sqlite',
    starrocks: 'mysql',
    teradata: 'sql',
    teradatasql: 'sql',
    tidb: 'tidb',
    trino: 'trino',
};

export class JupyterlabNotebookCodeFormatter {
    protected working: boolean;
    protected notebookTracker: INotebookTracker;

    constructor(
        notebookTracker: INotebookTracker
    ) {
        this.notebookTracker = notebookTracker;
    }

    /**
     * Resolves the sql-formatter language identifier for a cell from its magic
     * line and the preceding cell sources, without any kernel roundtrip.
     *
     * Resolution order:
     * 1. Connection URL in the magic line  → parse scheme directly.
     * 2. Named alias in the magic line     → scan preceding cells for the most
     *    recent matching --alias / -A definition.
     * 3. Bare %%sql (no args)              → scan preceding cells for the most
     *    recent default (unnamed) connection URL.
     * 4. No URL found anywhere             → 'sql' (generic).
     */
    private resolveLanguage(
        sqlCommand: string,
        precedingSources: string[]
    ): SqlLanguage {
        const connectionUrl = extractConnectionUrl(sqlCommand);
        if (connectionUrl !== undefined) {
            const schemeName = dialectNameFromUrl(connectionUrl);
            return (schemeName !== undefined ? SQLALCHEMY_TO_LANGUAGE[schemeName] : undefined) ?? 'sql';
        }

        const alias = extractConnectionAlias(sqlCommand);
        const resolvedUrl = alias !== undefined
            ? findUrlForAlias(precedingSources, alias)
            : findDefaultUrl(precedingSources);

        if (resolvedUrl !== undefined) {
            const schemeName = dialectNameFromUrl(resolvedUrl);
            return (schemeName !== undefined ? SQLALCHEMY_TO_LANGUAGE[schemeName] : undefined) ?? 'sql';
        }

        return 'sql';
    }


    public async formatAllCodeCells(
        config: any,
        formatter?: string,
        notebook?: Notebook
    ) {
        return this.formatCells(false, config, formatter, notebook);
    }

    private getCodeCells(selectedOnly = true, notebook?: Notebook): CodeCell[] {
        if (!this.notebookTracker.currentWidget) {
            return [];
        }
        const codeCells: CodeCell[] = [];
        notebook = notebook || this.notebookTracker.currentWidget.content;
        notebook.widgets.forEach((cell: Cell) => {
            if (cell.model.type === 'code') {
                if (!selectedOnly || notebook.isSelectedOrActive(cell)) {
                    codeCells.push(cell as CodeCell);
                }
            }
        });
        return codeCells;
    }


    private async formatCells(
        selectedOnly: boolean,
        config: any,
        formatter?: string,
        notebook?: Notebook
    ) {

        if (this.working) {
            return;
        }
        try {
            this.working = true;
            const selectedCells = this.getCodeCells(selectedOnly, notebook);
            if (selectedCells.length === 0) {
                this.working = false;
                return;
            }

            // Collect all cell sources and their notebook indices upfront so that
            // alias and default-connection definitions in preceding cells can be
            // resolved without any kernel roundtrip.
            const nb = notebook || this.notebookTracker.currentWidget?.content;
            const allCellSources: string[] = [];
            const cellIndexMap = new Map<Cell, number>();
            nb?.widgets.forEach((cell: Cell, idx: number) => {
                cellIndexMap.set(cell, idx);
                allCellSources.push(cell.model.sharedModel.source);
            });

            // Cache resolved languages per magic-line string to avoid re-scanning
            // when the same connection appears in multiple selected cells.
            const languageCache = new Map<string, SqlLanguage>();

            for (let i = 0; i < selectedCells.length; ++i) {
                const cell = selectedCells[i];
                const text = cell.model.sharedModel.source;

                if (text.startsWith("%%sql")) {
                    const lines = text.split("\n");
                    const sqlCommand = lines.shift() ?? '';

                    let language: SqlLanguage;
                    if (languageCache.has(sqlCommand)) {
                        language = languageCache.get(sqlCommand)!;
                    } else {
                        const cellNbIndex = cellIndexMap.get(cell) ?? allCellSources.length;
                        const precedingSources = allCellSources.slice(0, cellNbIndex);
                        language = this.resolveLanguage(sqlCommand, precedingSources);
                        languageCache.set(sqlCommand, language);
                    }

                    try {
                        const formattedSql = format(lines.join("\n"), { language });
                        cell.model.sharedModel.source = sqlCommand + "\n" + formattedSql;
                    } catch (error) {
                    }


                }
            }
        } catch (error: any) {
            await showErrorMessage('Jupysql plugin formatting', error);
        }
        this.working = false;
    }

    applicable(formatter: string, currentWidget: Widget) {
        const currentNotebookWidget = this.notebookTracker.currentWidget;
        // TODO: Handle showing just the correct formatter for the language later
        return currentNotebookWidget && currentWidget === currentNotebookWidget;
    }
}
