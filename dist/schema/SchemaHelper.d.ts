import { TableBuilder } from 'knex';
import { Dictionary, EntityProperty } from '../typings';
import { Column, Index } from './DatabaseTable';
import { AbstractSqlConnection, Connection } from '../connections';
export declare abstract class SchemaHelper {
    getSchemaBeginning(charset: string): string;
    getSchemaEnd(): string;
    finalizeTable(table: TableBuilder, charset: string): void;
    getTypeDefinition(prop: EntityProperty, types?: Dictionary<string[]>, lengths?: Dictionary<number>, allowZero?: boolean): string;
    isSame(prop: EntityProperty, column: Column, idx?: number, types?: Dictionary<string[]>, defaultValues?: Dictionary<string[]>): IsSame;
    supportsSchemaConstraints(): boolean;
    indexForeignKeys(): boolean;
    getTypeFromDefinition(type: string, defaultType: string, types?: Dictionary<string[]>): string;
    getPrimaryKeys(connection: AbstractSqlConnection, indexes: Index[], tableName: string, schemaName?: string): Promise<string[]>;
    getForeignKeys(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<Dictionary>;
    getEnumDefinitions(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<Dictionary>;
    getListTablesSQL(): string;
    getRenameColumnSQL(tableName: string, from: Column, to: EntityProperty, idx?: number, quote?: string): string;
    getColumns(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<any[]>;
    getIndexes(connection: AbstractSqlConnection, tableName: string, schemaName?: string): Promise<Index[]>;
    getForeignKeysSQL(tableName: string, schemaName?: string): string;
    /**
     * Returns the default name of index for the given columns
     */
    getIndexName(tableName: string, columns: string[], unique: boolean): string;
    mapForeignKeys(fks: any[]): Dictionary;
    private processTypeWildCard;
    supportsColumnAlter(): boolean;
    normalizeDefaultValue(defaultValue: string, length: number, defaultValues?: Dictionary<string[]>): string | number;
    getCreateDatabaseSQL(name: string): string;
    getDropDatabaseSQL(name: string): string;
    getDatabaseExistsSQL(name: string): string;
    getDatabaseNotExistsError(dbName: string): string;
    getManagementDbName(): string;
    getDefaultEmptyString(): string;
    databaseExists(connection: Connection, name: string): Promise<boolean>;
    private hasSameType;
    private hasSameDefaultValue;
    private hasSameIndex;
    private hasSameEnumDefinition;
}
export interface IsSame {
    all?: boolean;
    sameTypes?: boolean;
    sameNullable?: boolean;
    sameDefault?: boolean;
    sameIndex?: boolean;
    sameEnums?: boolean;
}
