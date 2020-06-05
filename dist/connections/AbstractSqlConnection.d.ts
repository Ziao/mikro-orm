import Knex, { Config, QueryBuilder, Raw } from 'knex';
import { Connection, QueryResult, Transaction } from './Connection';
import { EntityData, AnyEntity } from '../typings';
export declare abstract class AbstractSqlConnection extends Connection {
    protected client: Knex;
    getKnex(): Knex;
    close(force?: boolean): Promise<void>;
    isConnected(): Promise<boolean>;
    transactional<T>(cb: (trx: Transaction) => Promise<T>, ctx?: Transaction): Promise<T>;
    execute<T extends QueryResult | EntityData<AnyEntity> | EntityData<AnyEntity>[] = EntityData<AnyEntity>[]>(queryOrKnex: string | QueryBuilder | Raw, params?: any[], method?: 'all' | 'get' | 'run', ctx?: Transaction): Promise<T>;
    /**
     * Execute raw SQL queries from file
     */
    loadFile(path: string): Promise<void>;
    protected logQuery(query: string, took?: number): void;
    protected createKnexClient(type: string): Knex;
    protected getKnexOptions(type: string): Config;
    protected executeKnex(qb: QueryBuilder | Raw, method: 'all' | 'get' | 'run'): Promise<QueryResult | any | any[]>;
    private getSql;
    protected transformKnexResult(res: any, method: 'all' | 'get' | 'run'): QueryResult | any | any[];
    protected abstract transformRawResult<T>(res: any, method: 'all' | 'get' | 'run'): T;
}
