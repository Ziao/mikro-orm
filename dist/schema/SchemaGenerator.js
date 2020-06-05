"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("..");
const utils_1 = require("../utils");
class SchemaGenerator {
    constructor(driver, metadata, config) {
        this.driver = driver;
        this.metadata = metadata;
        this.config = config;
        this.platform = this.driver.getPlatform();
        this.helper = this.platform.getSchemaHelper();
        this.connection = this.driver.getConnection();
        this.knex = this.connection.getKnex();
    }
    async generate() {
        const [dropSchema, createSchema] = await Promise.all([
            this.getDropSchemaSQL(false),
            this.getCreateSchemaSQL(false),
        ]);
        return this.wrapSchema(dropSchema + createSchema);
    }
    async createSchema(wrap = true) {
        await this.ensureDatabase();
        const sql = await this.getCreateSchemaSQL(wrap);
        await this.execute(sql);
    }
    async ensureDatabase() {
        const dbName = this.config.get('dbName');
        const exists = await this.helper.databaseExists(this.connection, dbName);
        if (!exists) {
            this.config.set('dbName', this.helper.getManagementDbName());
            await this.driver.reconnect();
            await this.createDatabase(dbName);
        }
    }
    async getCreateSchemaSQL(wrap = true) {
        let ret = '';
        for (const meta of Object.values(this.metadata.getAll())) {
            ret += this.dump(this.createTable(meta));
        }
        for (const meta of Object.values(this.metadata.getAll())) {
            ret += this.dump(this.knex.schema.alterTable(meta.collection, table => this.createForeignKeys(table, meta)));
        }
        return this.wrapSchema(ret, wrap);
    }
    async dropSchema(wrap = true, dropMigrationsTable = false, dropDb = false) {
        if (dropDb) {
            const name = this.config.get('dbName');
            return this.dropDatabase(name);
        }
        const sql = await this.getDropSchemaSQL(wrap, dropMigrationsTable);
        await this.execute(sql);
    }
    async getDropSchemaSQL(wrap = true, dropMigrationsTable = false) {
        let ret = '';
        for (const meta of Object.values(this.metadata.getAll())) {
            ret += this.dump(this.dropTable(meta.collection), '\n');
        }
        if (dropMigrationsTable) {
            ret += this.dump(this.dropTable(this.config.get('migrations').tableName), '\n');
        }
        return this.wrapSchema(ret + '\n', wrap);
    }
    async updateSchema(wrap = true, safe = false, dropTables = true) {
        const sql = await this.getUpdateSchemaSQL(wrap, safe, dropTables);
        await this.execute(sql);
    }
    async getUpdateSchemaSQL(wrap = true, safe = false, dropTables = true) {
        const schema = await __1.DatabaseSchema.create(this.connection, this.helper, this.config);
        let ret = '';
        for (const meta of Object.values(this.metadata.getAll())) {
            ret += this.getUpdateTableSQL(meta, schema, safe);
        }
        for (const meta of Object.values(this.metadata.getAll())) {
            ret += this.getUpdateTableFKsSQL(meta, schema);
        }
        if (!dropTables || safe) {
            return this.wrapSchema(ret, wrap);
        }
        const definedTables = Object.values(this.metadata.getAll()).map(meta => meta.collection);
        const remove = schema.getTables().filter(table => !definedTables.includes(table.name));
        for (const table of remove) {
            ret += this.dump(this.dropTable(table.name));
        }
        return this.wrapSchema(ret, wrap);
    }
    /**
     * creates new database and connects to it
     */
    async createDatabase(name) {
        await this.connection.execute(this.helper.getCreateDatabaseSQL('' + this.knex.ref(name)));
        this.config.set('dbName', name);
        await this.driver.reconnect();
    }
    async dropDatabase(name) {
        this.config.set('dbName', this.helper.getManagementDbName());
        await this.driver.reconnect();
        await this.connection.execute(this.helper.getDropDatabaseSQL('' + this.knex.ref(name)));
    }
    async execute(sql) {
        const lines = sql.split('\n').filter(i => i.trim());
        for (const line of lines) {
            await this.connection.execute(line);
        }
    }
    getUpdateTableSQL(meta, schema, safe) {
        const table = schema.getTable(meta.collection);
        if (!table) {
            return this.dump(this.createTable(meta));
        }
        return this.updateTable(meta, table, safe).map(builder => this.dump(builder)).join('\n');
    }
    getUpdateTableFKsSQL(meta, schema) {
        const table = schema.getTable(meta.collection);
        if (!table) {
            return this.dump(this.knex.schema.alterTable(meta.collection, table => this.createForeignKeys(table, meta)));
        }
        const { create } = this.computeTableDifference(meta, table, true);
        if (create.length === 0) {
            return '';
        }
        return this.dump(this.knex.schema.alterTable(meta.collection, table => this.createForeignKeys(table, meta, create)));
    }
    async wrapSchema(sql, wrap = true) {
        if (!wrap) {
            return sql;
        }
        let ret = this.helper.getSchemaBeginning(this.config.get('charset'));
        ret += sql;
        ret += this.helper.getSchemaEnd();
        return ret;
    }
    createTable(meta) {
        return this.knex.schema.createTable(meta.collection, table => {
            Object
                .values(meta.properties)
                .filter(prop => this.shouldHaveColumn(meta, prop))
                .forEach(prop => this.createTableColumn(table, meta, prop));
            if (meta.compositePK) {
                const constraintName = meta.collection.includes('.') ? meta.collection.split('.').pop() + '_pkey' : undefined;
                table.primary(utils_1.Utils.flatten(meta.primaryKeys.map(prop => meta.properties[prop].fieldNames)), constraintName);
            }
            const createIndex = (index, unique) => {
                const properties = utils_1.Utils.flatten(utils_1.Utils.asArray(index.properties).map(prop => meta.properties[prop].fieldNames));
                const name = utils_1.Utils.isString(index.name) ? index.name : this.helper.getIndexName(meta.collection, properties, unique);
                if (unique) {
                    table.unique(properties, name);
                }
                else {
                    table.index(properties, name, index.type);
                }
            };
            meta.indexes.forEach(index => createIndex(index, false));
            meta.uniques.forEach(index => createIndex(index, true));
            this.helper.finalizeTable(table, this.config.get('charset'));
        });
    }
    updateTable(meta, table, safe) {
        const { create, update, remove, rename } = this.computeTableDifference(meta, table, safe);
        if (create.length + update.length + remove.length + rename.length === 0) {
            return [];
        }
        const ret = [];
        for (const prop of rename) {
            ret.push(this.knex.schema.raw(this.helper.getRenameColumnSQL(table.name, prop.from, prop.to)));
        }
        ret.push(this.knex.schema.alterTable(meta.collection, t => {
            for (const prop of create) {
                this.createTableColumn(t, meta, prop);
            }
            for (const col of update) {
                this.updateTableColumn(t, meta, col.prop, col.column, col.diff);
            }
            for (const column of remove) {
                this.dropTableColumn(t, column);
            }
        }));
        return ret;
    }
    computeTableDifference(meta, table, safe) {
        const props = Object.values(meta.properties).filter(prop => this.shouldHaveColumn(meta, prop, true));
        const columns = table.getColumns();
        const create = [];
        const update = [];
        const remove = columns.filter(col => !props.find(prop => prop.fieldNames.includes(col.name) || (prop.joinColumns || []).includes(col.name)));
        for (const prop of props) {
            this.computeColumnDifference(table, prop, create, update);
        }
        const rename = this.findRenamedColumns(create, remove);
        if (safe) {
            return { create, update, rename, remove: [] };
        }
        return { create, update, rename, remove };
    }
    computeColumnDifference(table, prop, create, update, joinColumn, idx = 0) {
        if ([__1.ReferenceType.MANY_TO_ONE, __1.ReferenceType.ONE_TO_ONE].includes(prop.reference) && !joinColumn) {
            return prop.joinColumns.forEach((joinColumn, idx) => this.computeColumnDifference(table, prop, create, update, joinColumn, idx));
        }
        if (!joinColumn) {
            return prop.fieldNames.forEach((fieldName, idx) => this.computeColumnDifference(table, prop, create, update, fieldName, idx));
        }
        const column = table.getColumn(joinColumn);
        if (!column) {
            create.push(prop);
            return;
        }
        if (this.helper.supportsColumnAlter() && !this.helper.isSame(prop, column, idx).all) {
            const diff = this.helper.isSame(prop, column, idx);
            update.push({ prop, column, diff });
        }
    }
    dropTable(name) {
        let builder = this.knex.schema.dropTableIfExists(name);
        if (this.platform.usesCascadeStatement()) {
            builder = this.knex.schema.raw(builder.toQuery() + ' cascade');
        }
        return builder;
    }
    shouldHaveColumn(meta, prop, update = false) {
        if (prop.persist === false) {
            return false;
        }
        if (meta.pivotTable) {
            return true;
        }
        if (prop.reference !== __1.ReferenceType.SCALAR && !this.helper.supportsSchemaConstraints() && !update) {
            return false;
        }
        return [__1.ReferenceType.SCALAR, __1.ReferenceType.MANY_TO_ONE].includes(prop.reference) || (prop.reference === __1.ReferenceType.ONE_TO_ONE && prop.owner);
    }
    createTableColumn(table, meta, prop, alter) {
        if (prop.reference === __1.ReferenceType.SCALAR) {
            return [this.createSimpleTableColumn(table, meta, prop, alter)];
        }
        const meta2 = this.metadata.get(prop.type);
        return meta2.primaryKeys.map((pk, idx) => {
            const col = table.specificType(prop.joinColumns[idx], meta2.properties[pk].columnTypes[0]);
            return this.configureColumn(meta, prop, col, prop.joinColumns[idx], meta2.properties[pk], alter);
        });
    }
    createSimpleTableColumn(table, meta, prop, alter) {
        if (prop.primary && !meta.compositePK && this.platform.isBigIntProperty(prop)) {
            return table.bigIncrements(prop.fieldNames[0]);
        }
        if (prop.primary && !meta.compositePK && prop.type === 'number') {
            return table.increments(prop.fieldNames[0]);
        }
        if (prop.enum && prop.items && prop.items.every(item => utils_1.Utils.isString(item))) {
            const col = table.enum(prop.fieldNames[0], prop.items);
            return this.configureColumn(meta, prop, col, prop.fieldNames[0], undefined, alter);
        }
        const col = table.specificType(prop.fieldNames[0], prop.columnTypes[0]);
        return this.configureColumn(meta, prop, col, prop.fieldNames[0], undefined, alter);
    }
    updateTableColumn(table, meta, prop, column, diff) {
        const equalDefinition = diff.sameTypes && diff.sameDefault && diff.sameNullable;
        if (column.fk && !diff.sameIndex) {
            table.dropForeign([column.fk.columnName], column.fk.constraintName);
        }
        if (column.indexes.length > 0 && !diff.sameIndex) {
            table.dropIndex(column.indexes.map(index => index.columnName));
        }
        if (column.fk && !diff.sameIndex && equalDefinition) {
            return this.createForeignKey(table, meta, prop, diff);
        }
        this.createTableColumn(table, meta, prop, diff).map(col => col.alter());
    }
    dropTableColumn(table, column) {
        if (column.fk) {
            table.dropForeign([column.fk.columnName], column.fk.constraintName);
        }
        for (const index of column.indexes) {
            if (index.unique) {
                table.dropUnique([index.columnName], index.keyName);
            }
            else {
                table.dropIndex([index.columnName], index.keyName);
            }
        }
        table.dropColumn(column.name);
    }
    configureColumn(meta, prop, col, columnName, pkProp = prop, alter) {
        const nullable = (alter && this.platform.requiresNullableForAlteringColumn()) || prop.nullable;
        const sameNullable = alter && 'sameNullable' in alter && alter.sameNullable;
        const indexed = 'index' in prop ? prop.index : (prop.reference !== __1.ReferenceType.SCALAR && this.helper.indexForeignKeys());
        const index = (indexed || (prop.primary && meta.compositePK)) && !(alter && alter.sameIndex);
        const indexName = this.getIndexName(meta, prop, false, columnName);
        const uniqueName = this.getIndexName(meta, prop, true, columnName);
        const hasDefault = typeof prop.default !== 'undefined'; // support falsy default values like `0`, `false` or empty string
        const sameDefault = alter && 'sameDefault' in alter ? alter.sameDefault : !hasDefault;
        const defaultValue = this.getDefaultValue(prop, hasDefault);
        utils_1.Utils.runIfNotEmpty(() => col.nullable(), !sameNullable && nullable);
        utils_1.Utils.runIfNotEmpty(() => col.notNullable(), !sameNullable && !nullable);
        utils_1.Utils.runIfNotEmpty(() => col.primary(), prop.primary && !meta.compositePK);
        utils_1.Utils.runIfNotEmpty(() => col.unsigned(), pkProp.unsigned);
        utils_1.Utils.runIfNotEmpty(() => col.index(indexName), index);
        utils_1.Utils.runIfNotEmpty(() => col.unique(uniqueName), prop.unique);
        utils_1.Utils.runIfNotEmpty(() => col.defaultTo(defaultValue), !sameDefault);
        return col;
    }
    getIndexName(meta, prop, unique, columnName) {
        const type = unique ? 'unique' : 'index';
        const value = prop[type];
        if (utils_1.Utils.isString(value)) {
            return value;
        }
        return this.helper.getIndexName(meta.collection, [columnName], unique);
    }
    getDefaultValue(prop, hasDefault) {
        if (!hasDefault) {
            return null;
        }
        return this.knex.raw(prop.default === '' ? this.helper.getDefaultEmptyString() : '' + prop.default);
    }
    createForeignKeys(table, meta, props) {
        Object.values(meta.properties)
            .filter(prop => !props || props.includes(prop))
            .filter(prop => prop.reference === __1.ReferenceType.MANY_TO_ONE || (prop.reference === __1.ReferenceType.ONE_TO_ONE && prop.owner))
            .forEach(prop => this.createForeignKey(table, meta, prop));
    }
    createForeignKey(table, meta, prop, diff = {}) {
        if (this.helper.supportsSchemaConstraints()) {
            this.createForeignKeyReference(table, prop);
            return;
        }
        if (!meta.pivotTable) {
            this.createTableColumn(table, meta, prop, diff);
        }
        // knex does not allow adding new columns with FK in sqlite
        // @see https://github.com/knex/knex/issues/3351
        // const col = this.createSimpleTableColumn(table, meta, prop, true);
        // this.createForeignKeyReference(col, prop);
    }
    createForeignKeyReference(table, prop) {
        const meta2 = this.metadata.get(prop.type);
        const cascade = prop.cascade.includes(__1.Cascade.REMOVE) || prop.cascade.includes(__1.Cascade.ALL);
        meta2.primaryKeys.forEach((primaryKey, idx) => {
            const pk2 = meta2.properties[primaryKey];
            pk2.fieldNames.forEach(fieldName => {
                const col = table.foreign(prop.fieldNames[idx]).references(fieldName).inTable(meta2.collection);
                if (prop.onDelete || cascade || prop.nullable) {
                    col.onDelete(prop.onDelete || (cascade ? 'cascade' : 'set null'));
                }
                if (prop.onUpdateIntegrity || prop.cascade.includes(__1.Cascade.PERSIST) || prop.cascade.includes(__1.Cascade.ALL)) {
                    col.onUpdate(prop.onUpdateIntegrity || 'cascade');
                }
            });
        });
    }
    findRenamedColumns(create, remove) {
        const renamed = [];
        for (const prop of create) {
            for (const fieldName of prop.fieldNames) {
                const match = remove.find(column => {
                    const copy = utils_1.Utils.copy(column);
                    copy.name = fieldName;
                    return this.helper.isSame(prop, copy).all;
                });
                if (match) {
                    renamed.push({ from: match, to: prop });
                }
            }
        }
        renamed.forEach(prop => {
            create.splice(create.indexOf(prop.to), 1);
            remove.splice(remove.indexOf(prop.from), 1);
        });
        return renamed;
    }
    dump(builder, append = '\n\n') {
        const sql = builder.toQuery();
        return sql.length > 0 ? `${sql};${append}` : '';
    }
}
exports.SchemaGenerator = SchemaGenerator;
