"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const fs_extra_1 = require("fs-extra");
const utils_1 = require("../utils");
const DatabaseSchema_1 = require("./DatabaseSchema");
const entity_1 = require("../entity");
class EntityGenerator {
    constructor(driver, config) {
        this.driver = driver;
        this.config = config;
        this.platform = this.driver.getPlatform();
        this.helper = this.platform.getSchemaHelper();
        this.connection = this.driver.getConnection();
        this.namingStrategy = this.config.getNamingStrategy();
        this.project = new ts_morph_1.Project();
        this.sources = [];
        this.project.manipulationSettings.set({ quoteKind: ts_morph_1.QuoteKind.Single, indentationText: ts_morph_1.IndentationText.TwoSpaces });
    }
    async generate(options = {}) {
        const baseDir = utils_1.Utils.normalizePath(options.baseDir || this.config.get('baseDir') + '/generated-entities');
        const schema = await DatabaseSchema_1.DatabaseSchema.create(this.connection, this.helper, this.config);
        for (const table of schema.getTables()) {
            await this.createEntity(table);
        }
        this.sources.forEach(entity => {
            entity.fixMissingImports();
            entity.fixUnusedIdentifiers();
            entity.organizeImports();
        });
        if (options.save) {
            await fs_extra_1.ensureDir(baseDir);
            await Promise.all(this.sources.map(e => fs_extra_1.writeFile(baseDir + '/' + e.getBaseName(), e.getFullText())));
        }
        return this.sources.map(e => e.getFullText());
    }
    async createEntity(table) {
        const meta = table.getEntityDeclaration(this.namingStrategy, this.helper);
        const entity = this.project.createSourceFile(meta.className + '.ts', writer => {
            writer.writeLine(`import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, OneToOne, ManyToMany, Cascade, Index, Unique } from 'mikro-orm';`);
            writer.blankLine();
            writer.writeLine('@Entity()');
            meta.indexes.forEach(index => {
                const properties = utils_1.Utils.asArray(index.properties).map(prop => `'${prop}'`);
                writer.writeLine(`@Index({ name: '${index.name}', properties: [${properties.join(', ')}] })`);
            });
            meta.uniques.forEach(index => {
                const properties = utils_1.Utils.asArray(index.properties).map(prop => `'${prop}'`);
                writer.writeLine(`@Unique({ name: '${index.name}', properties: [${properties.join(', ')}] })`);
            });
            writer.write(`export class ${meta.className}`);
            writer.block(() => Object.values(meta.properties).forEach(prop => {
                const decorator = this.getPropertyDecorator(prop);
                const definition = this.getPropertyDefinition(prop);
                writer.blankLineIfLastNot();
                writer.writeLine(decorator);
                writer.writeLine(definition);
                writer.blankLine();
            }));
            writer.write('');
        });
        this.sources.push(entity);
    }
    getPropertyDefinition(prop) {
        // string defaults are usually things like SQL functions
        const useDefault = prop.default && typeof prop.default !== 'string';
        const optional = prop.nullable ? '?' : (useDefault ? '' : '!');
        const ret = `${prop.name}${optional}: ${prop.type}`;
        if (!useDefault) {
            return ret + ';';
        }
        return `${ret} = ${prop.default};`;
    }
    getPropertyDecorator(prop) {
        const options = {};
        const columnType = this.helper.getTypeFromDefinition(prop.columnTypes[0], '__false') === '__false' ? prop.columnTypes[0] : undefined;
        let decorator = this.getDecoratorType(prop);
        if (prop.reference !== entity_1.ReferenceType.SCALAR) {
            this.getForeignKeyDecoratorOptions(options, prop);
        }
        else {
            this.getScalarPropertyDecoratorOptions(options, prop, columnType);
        }
        this.getCommonDecoratorOptions(options, prop, columnType);
        const indexes = this.getPropertyIndexes(prop, options);
        decorator = [...indexes.sort(), decorator].join('\n');
        if (Object.keys(options).length === 0) {
            return `${decorator}()`;
        }
        return `${decorator}({ ${Object.entries(options).map(([opt, val]) => `${opt}: ${val}`).join(', ')} })`;
    }
    getPropertyIndexes(prop, options) {
        if (prop.reference === entity_1.ReferenceType.SCALAR) {
            const ret = [];
            if (prop.index) {
                ret.push(`@Index({ name: '${prop.index}' })`);
            }
            if (prop.unique) {
                ret.push(`@Unique({ name: '${prop.unique}' })`);
            }
            return ret;
        }
        if (prop.index) {
            options.index = `'${prop.index}'`;
        }
        if (prop.unique) {
            options.unique = `'${prop.unique}'`;
        }
        return [];
    }
    getCommonDecoratorOptions(options, prop, columnType) {
        if (columnType) {
            options.columnType = `'${columnType}'`;
        }
        if (prop.nullable) {
            options.nullable = true;
        }
        if (prop.default && typeof prop.default === 'string') {
            options.default = `\`${prop.default}\``;
        }
    }
    getScalarPropertyDecoratorOptions(options, prop, columnType) {
        const defaultColumnType = this.helper.getTypeDefinition(prop).replace(/\(\d+\)/, '');
        if (!columnType && prop.columnTypes[0] !== defaultColumnType && prop.type !== columnType) {
            options.columnType = `'${prop.columnTypes[0]}'`;
        }
        if (prop.fieldNames[0] !== this.namingStrategy.propertyToColumnName(prop.name)) {
            options.fieldName = `'${prop.fieldNames[0]}'`;
        }
        if (prop.length && prop.columnTypes[0] !== 'enum') {
            options.length = prop.length;
        }
    }
    getForeignKeyDecoratorOptions(options, prop) {
        options.entity = `() => ${this.namingStrategy.getClassName(prop.referencedTableName, '_')}`;
        if (prop.fieldNames[0] !== this.namingStrategy.joinKeyColumnName(prop.name, prop.referencedColumnNames[0])) {
            options.fieldName = `'${prop.fieldNames[0]}'`;
        }
        const cascade = ['Cascade.MERGE'];
        if (prop.onUpdateIntegrity === 'cascade') {
            cascade.push('Cascade.PERSIST');
        }
        if (prop.onDelete === 'cascade') {
            cascade.push('Cascade.REMOVE');
        }
        if (cascade.length === 3) {
            cascade.length = 0;
            cascade.push('Cascade.ALL');
        }
        if (!(cascade.length === 2 && cascade.includes('Cascade.PERSIST') && cascade.includes('Cascade.MERGE'))) {
            options.cascade = `[${cascade.sort().join(', ')}]`;
        }
        if (prop.primary) {
            options.primary = true;
        }
    }
    getDecoratorType(prop) {
        if (prop.reference === entity_1.ReferenceType.ONE_TO_ONE) {
            return '@OneToOne';
        }
        if (prop.reference === entity_1.ReferenceType.MANY_TO_ONE) {
            return '@ManyToOne';
        }
        if (prop.primary) {
            return '@PrimaryKey';
        }
        return '@Property';
    }
}
exports.EntityGenerator = EntityGenerator;
