"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EntitySchema_1 = require("./EntitySchema");
const utils_1 = require("../utils");
const entity_1 = require("../entity");
class DatabaseTable {
    constructor(name, schema) {
        this.name = name;
        this.schema = schema;
    }
    getColumns() {
        return Object.values(this.columns);
    }
    getColumn(name) {
        return this.columns[name];
    }
    getIndexes() {
        return this.indexes.reduce((o, index) => {
            if (index.primary) {
                return o;
            }
            o[index.keyName] = o[index.keyName] || [];
            o[index.keyName].push(index);
            return o;
        }, {});
    }
    init(cols, indexes, pks, fks, enums) {
        this.indexes = indexes;
        this.foreignKeys = fks;
        const map = this.getIndexes();
        Object.keys(map).forEach(key => {
            map[key].forEach(index => index.composite = map[key].length > 1);
        });
        this.columns = cols.reduce((o, v) => {
            const index = indexes.filter(i => i.columnName === v.name);
            v.primary = pks.includes(v.name);
            v.unique = index.some(i => i.unique && !i.primary);
            v.fk = fks[v.name];
            v.indexes = index.filter(i => !i.primary && !i.composite);
            v.defaultValue = v.defaultValue && v.defaultValue.toString().startsWith('nextval(') ? null : v.defaultValue;
            v.enumItems = enums[v.name] || [];
            o[v.name] = v;
            return o;
        }, {});
    }
    getEntityDeclaration(namingStrategy, schemaHelper) {
        const name = namingStrategy.getClassName(this.name, '_');
        const schema = new EntitySchema_1.EntitySchema({ name, collection: this.name });
        const indexes = this.getIndexes();
        const compositeFkIndexes = {};
        Object.keys(indexes)
            .filter(name => indexes[name].length > 1)
            .forEach(name => {
            const properties = indexes[name].map(index => this.getPropertyName(this.getColumn(index.columnName)));
            const index = { name, properties: utils_1.Utils.unique(properties) };
            if (index.properties.length === 1) {
                compositeFkIndexes[index.properties[0]] = { keyName: name };
                return;
            }
            if (indexes[index.name][0].unique) {
                schema.addUnique(index);
            }
            else {
                schema.addIndex(index);
            }
        });
        this.getColumns().forEach(column => this.getPropertyDeclaration(column, namingStrategy, schemaHelper, compositeFkIndexes, schema));
        return schema.init().meta;
    }
    getPropertyDeclaration(column, namingStrategy, schemaHelper, compositeFkIndexes, schema) {
        const reference = this.getReferenceType(column);
        const prop = this.getPropertyName(column);
        const type = this.getPropertyType(namingStrategy, schemaHelper, column);
        const fkOptions = {};
        const index = compositeFkIndexes[prop] || column.indexes.find(i => !i.unique);
        const unique = column.indexes.find(i => i.unique);
        if (column.fk) {
            fkOptions.referencedTableName = column.fk.referencedTableName;
            fkOptions.referencedColumnNames = [column.fk.referencedColumnName];
            fkOptions.onUpdateIntegrity = column.fk.updateRule.toLowerCase();
            fkOptions.onDelete = column.fk.deleteRule.toLowerCase();
        }
        schema.addProperty(prop, type, Object.assign({ reference, columnType: column.type, default: this.getPropertyDefaultValue(schemaHelper, column, type), nullable: column.nullable, primary: column.primary, fieldName: column.name, length: column.maxLength, index: index ? index.keyName : undefined, unique: unique ? unique.keyName : undefined }, fkOptions));
    }
    getReferenceType(column) {
        if (column.fk && column.unique) {
            return entity_1.ReferenceType.ONE_TO_ONE;
        }
        if (column.fk) {
            return entity_1.ReferenceType.MANY_TO_ONE;
        }
        return entity_1.ReferenceType.SCALAR;
    }
    getPropertyName(column) {
        let field = column.name;
        if (column.fk) {
            field = field.replace(new RegExp(`_${column.fk.referencedColumnName}$`), '');
        }
        return field.replace(/_(\w)/g, m => m[1].toUpperCase()).replace(/_+/g, '');
    }
    getPropertyType(namingStrategy, schemaHelper, column, defaultType = 'string') {
        if (column.fk) {
            return namingStrategy.getClassName(column.fk.referencedTableName, '_');
        }
        return schemaHelper.getTypeFromDefinition(column.type, defaultType);
    }
    getPropertyDefaultValue(schemaHelper, column, propType) {
        if (!column.defaultValue) {
            return;
        }
        const val = schemaHelper.normalizeDefaultValue(column.defaultValue, column.maxLength);
        if (column.nullable && val === 'null') {
            return;
        }
        if (propType === 'boolean') {
            return !!column.defaultValue;
        }
        if (propType === 'number') {
            return +column.defaultValue;
        }
        return '' + val;
    }
}
exports.DatabaseTable = DatabaseTable;
