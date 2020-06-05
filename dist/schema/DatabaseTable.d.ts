import { Dictionary, EntityMetadata } from '../typings';
import { NamingStrategy } from '../naming-strategy';
import { SchemaHelper } from './SchemaHelper';
export declare class DatabaseTable {
    readonly name: string;
    readonly schema?: string | undefined;
    private columns;
    private indexes;
    private foreignKeys;
    constructor(name: string, schema?: string | undefined);
    getColumns(): Column[];
    getColumn(name: string): Column | undefined;
    getIndexes(): Dictionary<Index[]>;
    init(cols: Column[], indexes: Index[], pks: string[], fks: Dictionary<ForeignKey>, enums: Dictionary<string[]>): void;
    getEntityDeclaration(namingStrategy: NamingStrategy, schemaHelper: SchemaHelper): EntityMetadata;
    private getPropertyDeclaration;
    private getReferenceType;
    private getPropertyName;
    private getPropertyType;
    private getPropertyDefaultValue;
}
export interface Column {
    name: string;
    type: string;
    fk: ForeignKey;
    fks: ForeignKey[];
    indexes: Index[];
    primary: boolean;
    unique: boolean;
    nullable: boolean;
    maxLength: number;
    defaultValue: string | null;
    enumItems: string[];
}
export interface ForeignKey {
    columnName: string;
    constraintName: string;
    referencedTableName: string;
    referencedColumnName: string;
    updateRule: string;
    deleteRule: string;
}
export interface Index {
    columnName: string;
    keyName: string;
    unique: boolean;
    primary: boolean;
    composite?: boolean;
}
