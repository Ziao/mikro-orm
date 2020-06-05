import { AbstractSqlDriver, Configuration } from '..';
import { MetadataStorage } from '../metadata';
export declare class SchemaGenerator {
    private readonly driver;
    private readonly metadata;
    private readonly config;
    private readonly platform;
    private readonly helper;
    private readonly connection;
    private readonly knex;
    constructor(driver: AbstractSqlDriver, metadata: MetadataStorage, config: Configuration);
    generate(): Promise<string>;
    createSchema(wrap?: boolean): Promise<void>;
    ensureDatabase(): Promise<void>;
    getCreateSchemaSQL(wrap?: boolean): Promise<string>;
    dropSchema(wrap?: boolean, dropMigrationsTable?: boolean, dropDb?: boolean): Promise<void>;
    getDropSchemaSQL(wrap?: boolean, dropMigrationsTable?: boolean): Promise<string>;
    updateSchema(wrap?: boolean, safe?: boolean, dropTables?: boolean): Promise<void>;
    getUpdateSchemaSQL(wrap?: boolean, safe?: boolean, dropTables?: boolean): Promise<string>;
    /**
     * creates new database and connects to it
     */
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
    execute(sql: string): Promise<void>;
    private getUpdateTableSQL;
    private getUpdateTableFKsSQL;
    private wrapSchema;
    private createTable;
    private updateTable;
    private computeTableDifference;
    private computeColumnDifference;
    private dropTable;
    private shouldHaveColumn;
    private createTableColumn;
    private createSimpleTableColumn;
    private updateTableColumn;
    private dropTableColumn;
    private configureColumn;
    private getIndexName;
    private getDefaultValue;
    private createForeignKeys;
    private createForeignKey;
    private createForeignKeyReference;
    private findRenamedColumns;
    private dump;
}
