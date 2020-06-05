"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SchemaHelper_1 = require("./SchemaHelper");
class PostgreSqlSchemaHelper extends SchemaHelper_1.SchemaHelper {
    getSchemaBeginning(charset) {
        return `set names '${charset}';\nset session_replication_role = 'replica';\n\n`;
    }
    getSchemaEnd() {
        return `set session_replication_role = 'origin';\n`;
    }
    getTypeDefinition(prop) {
        return super.getTypeDefinition(prop, PostgreSqlSchemaHelper.TYPES, PostgreSqlSchemaHelper.DEFAULT_TYPE_LENGTHS, true);
    }
    getTypeFromDefinition(type, defaultType) {
        return super.getTypeFromDefinition(type, defaultType, PostgreSqlSchemaHelper.TYPES);
    }
    isSame(prop, column, idx) {
        return super.isSame(prop, column, idx, PostgreSqlSchemaHelper.TYPES, PostgreSqlSchemaHelper.DEFAULT_VALUES);
    }
    indexForeignKeys() {
        return false;
    }
    getListTablesSQL() {
        return 'select table_name, table_schema as schema_name '
            + `from information_schema.tables where table_schema not like 'pg\_%' and table_schema = current_schema() `
            + `and table_name != 'geometry_columns' and table_name != 'spatial_ref_sys' and table_type != 'VIEW' order by table_name`;
    }
    async getColumns(connection, tableName, schemaName) {
        const sql = `select column_name, column_default, is_nullable, udt_name, coalesce(datetime_precision, character_maximum_length) length
      from information_schema.columns where table_schema = '${schemaName}' and table_name = '${tableName}'`;
        const columns = await connection.execute(sql);
        return columns.map(col => ({
            name: col.column_name,
            type: col.udt_name,
            maxLength: col.length,
            nullable: col.is_nullable === 'YES',
            defaultValue: this.normalizeDefaultValue(col.column_default, col.length),
        }));
    }
    async getIndexes(connection, tableName, schemaName) {
        const sql = this.getIndexesSQL(tableName, schemaName);
        const indexes = await connection.execute(sql);
        return indexes.map(index => ({
            columnName: index.column_name,
            keyName: index.constraint_name,
            unique: index.unique,
            primary: index.primary,
        }));
    }
    getForeignKeysSQL(tableName, schemaName) {
        return `select kcu.table_name as table_name, rel_kcu.table_name as referenced_table_name, kcu.column_name as column_name,
      rel_kcu.column_name as referenced_column_name, kcu.constraint_name, rco.update_rule, rco.delete_rule
      from information_schema.table_constraints tco
      join information_schema.key_column_usage kcu
        on tco.constraint_schema = kcu.constraint_schema
        and tco.constraint_name = kcu.constraint_name
      join information_schema.referential_constraints rco
        on tco.constraint_schema = rco.constraint_schema
        and tco.constraint_name = rco.constraint_name
      join information_schema.key_column_usage rel_kcu
        on rco.unique_constraint_schema = rel_kcu.constraint_schema
        and rco.unique_constraint_name = rel_kcu.constraint_name
        and kcu.ordinal_position = rel_kcu.ordinal_position
      where tco.table_name = '${tableName}' and tco.table_schema = '${schemaName}' and tco.constraint_schema = '${schemaName}' and tco.constraint_type = 'FOREIGN KEY'
      order by kcu.table_schema, kcu.table_name, kcu.ordinal_position`;
    }
    async getEnumDefinitions(connection, tableName, schemaName) {
        const sql = `select conrelid::regclass as table_from, conname, pg_get_constraintdef(c.oid) as enum_def
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where contype = 'c' and conrelid = '"${schemaName}"."${tableName}"'::regclass order by contype`;
        const enums = await connection.execute(sql);
        return enums.reduce((o, item) => {
            // check constraints are defined as one of:
            // `CHECK ((type = ANY (ARRAY['local'::text, 'global'::text])))`
            // `CHECK (((enum_test)::text = ANY ((ARRAY['a'::character varying, 'b'::character varying, 'c'::character varying])::text[])))`
            const m1 = item.enum_def.match(/check \(\(\((\w+)\)::/i) || item.enum_def.match(/check \(\((\w+) = any/i);
            const m2 = item.enum_def.match(/\(array\[(.*)]\)/i);
            if (m1 && m2) {
                o[m1[1]] = m2[1].split(',').map((item) => item.trim().match(/^'(.*)'/)[1]);
            }
            return o;
        }, {});
    }
    normalizeDefaultValue(defaultValue, length) {
        if (!defaultValue) {
            return defaultValue;
        }
        const match = defaultValue.match(/^'(.*)'::(.*)$/);
        if (match) {
            if (match[2] === 'integer') {
                return +match[1];
            }
            return `'${match[1]}'`;
        }
        return super.normalizeDefaultValue(defaultValue, length, PostgreSqlSchemaHelper.DEFAULT_VALUES);
    }
    getDatabaseExistsSQL(name) {
        return `select 1 from pg_database where datname = '${name}'`;
    }
    getDatabaseNotExistsError(dbName) {
        return `database "${dbName}" does not exist`;
    }
    getManagementDbName() {
        return 'postgres';
    }
    getIndexesSQL(tableName, schemaName) {
        return `select relname as constraint_name, attname as column_name, idx.indisunique as unique, idx.indisprimary as primary
      from pg_index idx
      left join pg_class AS i on i.oid = idx.indexrelid
      left join pg_attribute a on a.attrelid = idx.indrelid and a.attnum = ANY(idx.indkey) and a.attnum > 0
      where indrelid = '"${schemaName}"."${tableName}"'::regclass`;
    }
}
exports.PostgreSqlSchemaHelper = PostgreSqlSchemaHelper;
PostgreSqlSchemaHelper.TYPES = {
    boolean: ['bool', 'boolean'],
    number: ['int4', 'integer', 'int2', 'int', 'float', 'float8', 'double', 'double precision', 'bigint', 'smallint', 'decimal', 'numeric', 'real'],
    string: ['varchar(?)', 'character varying', 'text', 'character', 'char', 'uuid', 'bigint', 'int8', 'enum'],
    float: ['float'],
    double: ['double precision', 'float8'],
    tinyint: ['int2'],
    smallint: ['int2'],
    text: ['text'],
    Date: ['timestamptz(?)', 'timestamp(?)', 'datetime(?)', 'timestamp with time zone', 'timestamp without time zone', 'datetimetz', 'time', 'date', 'timetz', 'datetz'],
    date: ['timestamptz(?)', 'timestamp(?)', 'datetime(?)', 'timestamp with time zone', 'timestamp without time zone', 'datetimetz', 'time', 'date', 'timetz', 'datetz'],
    object: ['json'],
    json: ['json'],
    uuid: ['uuid'],
    enum: ['text'],
};
PostgreSqlSchemaHelper.DEFAULT_TYPE_LENGTHS = {
    string: 255,
    date: 0,
};
PostgreSqlSchemaHelper.DEFAULT_VALUES = {
    'now()': ['now()', 'current_timestamp'],
    'current_timestamp(?)': ['current_timestamp(?)'],
    "('now'::text)::timestamp(?) with time zone": ['current_timestamp(?)'],
    "('now'::text)::timestamp(?) without time zone": ['current_timestamp(?)'],
    'null::character varying': ['null'],
    'null::timestamp with time zone': ['null'],
    'null::timestamp without time zone': ['null'],
};
