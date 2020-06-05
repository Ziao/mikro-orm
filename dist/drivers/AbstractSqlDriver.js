"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DatabaseDriver_1 = require("./DatabaseDriver");
const entity_1 = require("../entity");
const query_1 = require("../query");
const utils_1 = require("../utils");
class AbstractSqlDriver extends DatabaseDriver_1.DatabaseDriver {
    constructor(config, platform, connection, connector) {
        super(config, connector);
        this.replicas = [];
        this.connection = new connection(this.config);
        this.replicas = this.createReplicas(conf => new connection(this.config, conf, 'read'));
        this.platform = platform;
    }
    async find(entityName, where, options, ctx) {
        const meta = this.metadata.get(entityName);
        options = Object.assign({ populate: [], orderBy: {} }, (options || {}));
        options.populate = this.autoJoinOneToOneOwner(meta, options.populate);
        if (options.fields) {
            options.fields.unshift(...meta.primaryKeys.filter(pk => !options.fields.includes(pk)));
        }
        const qb = this.createQueryBuilder(entityName, ctx, !!ctx);
        qb.select(options.fields || '*').populate(options.populate).where(where).orderBy(options.orderBy).withSchema(options.schema);
        if (options.limit !== undefined) {
            qb.limit(options.limit, options.offset);
        }
        return qb.execute('all');
    }
    async findOne(entityName, where, options, ctx) {
        options = Object.assign({ populate: [], orderBy: {} }, (options || {}));
        const meta = this.metadata.get(entityName);
        options.populate = this.autoJoinOneToOneOwner(meta, options.populate);
        const pk = meta.primaryKeys[0];
        if (utils_1.Utils.isPrimaryKey(where)) {
            where = { [pk]: where };
        }
        if (options.fields && !options.fields.includes(pk)) {
            options.fields.unshift(pk);
        }
        return this.createQueryBuilder(entityName, ctx, !!ctx)
            .select(options.fields || '*')
            .populate(options.populate)
            .where(where)
            .orderBy(options.orderBy)
            .limit(1)
            .setLockMode(options.lockMode)
            .withSchema(options.schema)
            .execute('get');
    }
    async count(entityName, where, ctx) {
        const qb = this.createQueryBuilder(entityName, ctx, !!ctx);
        const pks = this.metadata.get(entityName).primaryKeys;
        const res = await qb.count(pks, true).where(where).execute('get', false);
        return +res.count;
    }
    async nativeInsert(entityName, data, ctx) {
        const meta = this.metadata.get(entityName, false, false);
        const collections = this.extractManyToMany(entityName, data);
        const pks = this.getPrimaryKeyFields(entityName);
        const qb = this.createQueryBuilder(entityName, ctx, true);
        const res = await qb.insert(data).execute('run', false);
        res.row = res.row || {};
        let pk;
        if (pks.length > 1) { // owner has composite pk
            pk = utils_1.Utils.getPrimaryKeyCond(data, pks);
        }
        else {
            res.insertId = data[pks[0]] || res.insertId || res.row[pks[0]];
            pk = [res.insertId];
        }
        await this.processManyToMany(meta, pk, collections, false, ctx);
        return res;
    }
    async nativeUpdate(entityName, where, data, ctx) {
        const meta = this.metadata.get(entityName, false, false);
        const pks = this.getPrimaryKeyFields(entityName);
        const collections = this.extractManyToMany(entityName, data);
        let res = { affectedRows: 0, insertId: 0, row: {} };
        if (utils_1.Utils.isPrimaryKey(where) && pks.length === 1) {
            where = { [pks[0]]: where };
        }
        if (Object.keys(data).length > 0) {
            const qb = this.createQueryBuilder(entityName, ctx, true);
            res = await qb.update(data).where(where).execute('run', false);
        }
        const pk = pks.map(pk => utils_1.Utils.extractPK(data[pk] || where, meta));
        await this.processManyToMany(meta, pk, collections, true, ctx);
        return res;
    }
    async nativeDelete(entityName, where, ctx) {
        const pks = this.getPrimaryKeyFields(entityName);
        if (utils_1.Utils.isPrimaryKey(where) && pks.length === 1) {
            where = { [pks[0]]: where };
        }
        return this.createQueryBuilder(entityName, ctx, true).delete(where).execute('run', false);
    }
    async syncCollection(coll, ctx) {
        const meta = entity_1.wrap(coll.owner).__meta;
        const pks = entity_1.wrap(coll.owner).__primaryKeys;
        const snapshot = coll.getSnapshot().map(item => entity_1.wrap(item).__primaryKeys);
        const current = coll.getItems().map(item => entity_1.wrap(item).__primaryKeys);
        const deleteDiff = snapshot.filter(item => !current.includes(item));
        const insertDiff = current.filter(item => !snapshot.includes(item));
        const target = snapshot.filter(item => current.includes(item)).concat(...insertDiff);
        const equals = utils_1.Utils.equals(current, target);
        // wrong order if we just delete and insert to the end
        if (coll.property.fixedOrder && !equals) {
            deleteDiff.length = insertDiff.length = 0;
            deleteDiff.push(...snapshot);
            insertDiff.push(...current);
        }
        await this.updateCollectionDiff(meta, coll.property, pks, deleteDiff, insertDiff, ctx);
    }
    async loadFromPivotTable(prop, owners, where, orderBy, ctx) {
        const pivotProp2 = this.getPivotInverseProperty(prop);
        const meta = this.metadata.get(prop.type);
        const cond = { [`${prop.pivotTable}.${pivotProp2.name}`]: { $in: meta.compositePK ? owners : owners.map(o => o[0]) } };
        if (!utils_1.Utils.isEmpty(where) && Object.keys(where).every(k => query_1.QueryBuilderHelper.isOperator(k, false))) {
            where = cond;
        }
        else {
            where = Object.assign(Object.assign({}, where), cond);
        }
        orderBy = this.getPivotOrderBy(prop, orderBy);
        const qb = this.createQueryBuilder(prop.type, ctx, !!ctx);
        const populate = this.autoJoinOneToOneOwner(meta, [prop.pivotTable]);
        qb.select('*').populate(populate).where(where).orderBy(orderBy);
        const items = owners.length ? await qb.execute('all') : [];
        const map = {};
        owners.forEach(owner => map['' + utils_1.Utils.getPrimaryKeyHash(owner)] = []);
        items.forEach((item) => {
            const key = utils_1.Utils.getPrimaryKeyHash(prop.joinColumns.map(col => item[col]));
            map[key].push(item);
            prop.joinColumns.forEach(col => delete item[col]);
            prop.inverseJoinColumns.forEach(col => delete item[col]);
        });
        return map;
    }
    /**
     * 1:1 owner side needs to be marked for population so QB auto-joins the owner id
     */
    autoJoinOneToOneOwner(meta, populate) {
        if (!this.config.get('autoJoinOneToOneOwner')) {
            return populate;
        }
        const toPopulate = Object.values(meta.properties)
            .filter(prop => prop.reference === entity_1.ReferenceType.ONE_TO_ONE && !prop.owner && !populate.includes(prop.name))
            .map(prop => prop.name);
        return [...populate, ...toPopulate];
    }
    createQueryBuilder(entityName, ctx, write) {
        return new query_1.QueryBuilder(entityName, this.metadata, this, ctx, undefined, write ? 'write' : 'read');
    }
    extractManyToMany(entityName, data) {
        if (!this.metadata.has(entityName)) {
            return {};
        }
        const props = this.metadata.get(entityName).properties;
        const ret = {};
        for (const k of Object.keys(data)) {
            const prop = props[k];
            if (prop && prop.reference === entity_1.ReferenceType.MANY_TO_MANY) {
                ret[k] = data[k].map((item) => utils_1.Utils.asArray(item));
                delete data[k];
            }
        }
        return ret;
    }
    async processManyToMany(meta, pks, collections, clear, ctx) {
        if (!meta) {
            return;
        }
        const props = meta.properties;
        for (const k of Object.keys(collections)) {
            await this.updateCollectionDiff(meta, props[k], pks, clear, collections[k], ctx);
        }
    }
    async updateCollectionDiff(meta, prop, pks, deleteDiff, insertDiff, ctx) {
        const meta2 = this.metadata.get(prop.type);
        if (!deleteDiff) {
            deleteDiff = [];
        }
        if (deleteDiff === true || deleteDiff.length > 0) {
            const qb1 = this.createQueryBuilder(prop.pivotTable, ctx, true);
            const knex = qb1.getKnex();
            if (Array.isArray(deleteDiff)) {
                knex.whereIn(prop.inverseJoinColumns, deleteDiff);
            }
            meta2.primaryKeys.forEach((pk, idx) => knex.andWhere(prop.joinColumns[idx], pks[idx]));
            await this.connection.execute(knex.delete());
        }
        const items = insertDiff.map(item => {
            const cond = {};
            prop.joinColumns.forEach((joinColumn, idx) => cond[joinColumn] = pks[idx]);
            prop.inverseJoinColumns.forEach((inverseJoinColumn, idx) => cond[inverseJoinColumn] = item[idx]);
            return cond;
        });
        if (this.platform.allowsMultiInsert()) {
            const qb2 = this.createQueryBuilder(prop.pivotTable, ctx, true);
            await this.connection.execute(qb2.getKnex().insert(items));
        }
        else {
            await utils_1.Utils.runSerial(items, item => this.createQueryBuilder(prop.pivotTable, ctx, true).insert(item).execute('run', false));
        }
    }
}
exports.AbstractSqlDriver = AbstractSqlDriver;
