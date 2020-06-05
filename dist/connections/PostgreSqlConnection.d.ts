import { PgConnectionConfig } from 'knex';
import { AbstractSqlConnection } from './AbstractSqlConnection';
export declare class PostgreSqlConnection extends AbstractSqlConnection {
    connect(): Promise<void>;
    getDefaultClientUrl(): string;
    getConnectionOptions(): PgConnectionConfig;
    protected transformRawResult<T>(res: any, method: 'all' | 'get' | 'run'): T;
    /**
     * monkey patch knex' postgres dialect so it correctly handles column updates (especially enums)
     */
    private patchKnex;
    private addColumn;
    private alterColumnNullable;
    private alterColumnDefault;
}
