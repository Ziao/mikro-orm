"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const utils_1 = require("./utils");
const entity_1 = require("./entity");
const unit_of_work_1 = require("./unit-of-work");
const drivers_1 = require("./drivers");
const query_1 = require("./query");
/**
 * The EntityManager is the central access point to ORM functionality. It is a facade to all different ORM subsystems
 * such as UnitOfWork, Query Language and Repository API.
 */
class EntityManager {
    constructor(config, driver, metadata, useContext = true) {
        this.config = config;
        this.driver = driver;
        this.metadata = metadata;
        this.useContext = useContext;
        this.id = uuid_1.v4();
        this.validator = new entity_1.EntityValidator(this.config.get('strict'));
        this.repositoryMap = {};
        this.entityLoader = new entity_1.EntityLoader(this);
        this.unitOfWork = new unit_of_work_1.UnitOfWork(this);
        this.entityFactory = new entity_1.EntityFactory(this.unitOfWork, this);
    }
    /**
     * Gets the Driver instance used by this EntityManager
     */
    getDriver() {
        return this.driver;
    }
    /**
     * Gets the Connection instance, by default returns write connection
     */
    getConnection(type) {
        return this.driver.getConnection(type);
    }
    /**
     * Gets repository for given entity. You can pass either string name or entity class reference.
     */
    getRepository(entityName) {
        entityName = utils_1.Utils.className(entityName);
        if (!this.repositoryMap[entityName]) {
            const meta = this.metadata.get(entityName);
            const RepositoryClass = this.config.getRepositoryClass(meta.customRepository);
            this.repositoryMap[entityName] = new RepositoryClass(this, entityName);
        }
        return this.repositoryMap[entityName];
    }
    /**
     * Gets EntityValidator instance
     */
    getValidator() {
        return this.validator;
    }
    /**
     * Creates a QueryBuilder instance
     */
    createQueryBuilder(entityName, alias, type) {
        entityName = utils_1.Utils.className(entityName);
        const driver = this.driver;
        if (!(driver instanceof drivers_1.AbstractSqlDriver)) {
            throw new Error('Not supported by given driver');
        }
        return new query_1.QueryBuilder(entityName, this.metadata, driver, this.transactionContext, alias, type, this);
    }
    /**
     * Finds all entities matching your `where` query.
     */
    async find(entityName, where, populate, orderBy, limit, offset) {
        entityName = utils_1.Utils.className(entityName);
        where = query_1.SmartQueryHelper.processWhere(where, entityName, this.metadata.get(entityName));
        this.validator.validateParams(where);
        const options = utils_1.Utils.isObject(populate) ? populate : { populate, orderBy, limit, offset };
        options.orderBy = options.orderBy || {};
        const results = await this.driver.find(entityName, where, Object.assign(Object.assign({}, options), { populate: this.preparePopulate(options.populate) }), this.transactionContext);
        if (results.length === 0) {
            return [];
        }
        const ret = [];
        for (const data of results) {
            const entity = this.merge(entityName, data, options.refresh);
            ret.push(entity);
        }
        const unique = utils_1.Utils.unique(ret);
        await this.entityLoader.populate(entityName, unique, options.populate || [], where, options.orderBy, options.refresh);
        return unique;
    }
    /**
     * Calls `em.find()` and `em.count()` with the same arguments (where applicable) and returns the results as tuple
     * where first element is the array of entities and the second is the count.
     */
    async findAndCount(entityName, where, populate, orderBy, limit, offset) {
        const [entities, count] = await Promise.all([
            this.find(entityName, where, populate, orderBy, limit, offset),
            this.count(entityName, where),
        ]);
        return [entities, count];
    }
    /**
     * Finds first entity matching your `where` query.
     */
    async findOne(entityName, where, populate, orderBy) {
        entityName = utils_1.Utils.className(entityName);
        const options = utils_1.Utils.isObject(populate) ? populate : { populate, orderBy };
        const meta = this.metadata.get(entityName);
        this.validator.validateEmptyWhere(where);
        where = query_1.SmartQueryHelper.processWhere(where, entityName, meta);
        this.checkLockRequirements(options.lockMode, meta);
        let entity = this.getUnitOfWork().tryGetById(entityName, where);
        const isOptimisticLocking = !utils_1.Utils.isDefined(options.lockMode) || options.lockMode === unit_of_work_1.LockMode.OPTIMISTIC;
        if (entity && entity_1.wrap(entity).isInitialized() && !options.refresh && isOptimisticLocking) {
            return this.lockAndPopulate(entityName, entity, where, options);
        }
        this.validator.validateParams(where);
        const data = await this.driver.findOne(entityName, where, Object.assign(Object.assign({}, options), { populate: this.preparePopulate(options.populate) }), this.transactionContext);
        if (!data) {
            return null;
        }
        entity = this.merge(entityName, data, options.refresh);
        await this.lockAndPopulate(entityName, entity, where, options);
        return entity;
    }
    /**
     * Finds first entity matching your `where` query. If nothing found, it will throw an error.
     * You can override the factory for creating this method via `options.failHandler` locally
     * or via `Configuration.findOneOrFailHandler` globally.
     */
    async findOneOrFail(entityName, where, populate, orderBy) {
        const entity = await this.findOne(entityName, where, populate, orderBy);
        if (!entity) {
            const options = utils_1.Utils.isObject(populate) ? populate : {};
            options.failHandler = options.failHandler || this.config.get('findOneOrFailHandler');
            entityName = utils_1.Utils.className(entityName);
            throw options.failHandler(entityName, where);
        }
        return entity;
    }
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    async transactional(cb, ctx = this.transactionContext) {
        const em = this.fork(false);
        return em.getConnection().transactional(async (trx) => {
            em.transactionContext = trx;
            const ret = await cb(em);
            await em.flush();
            return ret;
        }, ctx);
    }
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    async lock(entity, lockMode, lockVersion) {
        await this.getUnitOfWork().lock(entity, lockMode, lockVersion);
    }
    /**
     * Fires native insert query. Calling this has no side effects on the context (identity map).
     */
    async nativeInsert(entityName, data) {
        entityName = utils_1.Utils.className(entityName);
        data = query_1.SmartQueryHelper.processParams(data);
        this.validator.validateParams(data, 'insert data');
        const res = await this.driver.nativeInsert(entityName, data, this.transactionContext);
        return res.insertId;
    }
    /**
     * Fires native update query. Calling this has no side effects on the context (identity map).
     */
    async nativeUpdate(entityName, where, data) {
        entityName = utils_1.Utils.className(entityName);
        data = query_1.SmartQueryHelper.processParams(data);
        where = query_1.SmartQueryHelper.processWhere(where, entityName, this.metadata.get(entityName, false, false));
        this.validator.validateParams(data, 'update data');
        this.validator.validateParams(where, 'update condition');
        const res = await this.driver.nativeUpdate(entityName, where, data, this.transactionContext);
        return res.affectedRows;
    }
    /**
     * Fires native delete query. Calling this has no side effects on the context (identity map).
     */
    async nativeDelete(entityName, where) {
        entityName = utils_1.Utils.className(entityName);
        where = query_1.SmartQueryHelper.processWhere(where, entityName, this.metadata.get(entityName, false, false));
        this.validator.validateParams(where, 'delete condition');
        const res = await this.driver.nativeDelete(entityName, where, this.transactionContext);
        return res.affectedRows;
    }
    /**
     * Maps raw database result to an entity and merges it to this EntityManager.
     */
    map(entityName, result) {
        entityName = utils_1.Utils.className(entityName);
        const meta = this.metadata.get(entityName);
        const data = this.driver.mapResult(result, meta);
        return this.merge(entityName, data, true);
    }
    /**
     * Shortcut to driver's aggregate method. Available in MongoDriver only.
     */
    async aggregate(entityName, pipeline) {
        entityName = utils_1.Utils.className(entityName);
        return this.driver.aggregate(entityName, pipeline);
    }
    /**
     * Merges given entity to this EntityManager so it becomes managed. You can force refreshing of existing entities
     * via second parameter. By default it will return already loaded entities without modifying them.
     */
    merge(entityName, data, refresh) {
        if (utils_1.Utils.isEntity(entityName)) {
            return this.merge(entityName.constructor.name, entityName, data);
        }
        entityName = utils_1.Utils.className(entityName);
        this.validator.validatePrimaryKey(data, this.metadata.get(entityName));
        let entity = this.getUnitOfWork().tryGetById(entityName, data);
        if (entity && entity_1.wrap(entity).isInitialized() && !refresh) {
            return entity;
        }
        entity = utils_1.Utils.isEntity(data) ? data : this.getEntityFactory().create(entityName, data);
        // add to IM immediately - needed for self-references that can be part of `data` (and do not trigger cascade merge)
        this.getUnitOfWork().merge(entity, [entity]);
        entity_1.EntityAssigner.assign(entity, data, true);
        this.getUnitOfWork().merge(entity); // add to IM again so we have correct payload saved to change set computation
        return entity;
    }
    /**
     * Creates new instance of given entity and populates it with given data
     */
    create(entityName, data) {
        return this.getEntityFactory().create(entityName, data, true, true);
    }
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference(entityName, id, wrapped = false) {
        const meta = this.metadata.get(utils_1.Utils.className(entityName));
        if (utils_1.Utils.isPrimaryKey(id)) {
            if (meta.compositePK) {
                throw utils_1.ValidationError.invalidCompositeIdentifier(meta);
            }
            id = [id];
        }
        const entity = this.getEntityFactory().createReference(entityName, id);
        this.getUnitOfWork().merge(entity, [entity], false);
        if (wrapped) {
            return entity_1.Reference.create(entity);
        }
        return entity;
    }
    /**
     * Returns total number of entities matching your `where` query.
     */
    async count(entityName, where = {}) {
        entityName = utils_1.Utils.className(entityName);
        where = query_1.SmartQueryHelper.processWhere(where, entityName, this.metadata.get(entityName));
        this.validator.validateParams(where);
        return this.driver.count(entityName, where, this.transactionContext);
    }
    /**
     * Tells the EntityManager to make an instance managed and persistent. You can force flushing via second parameter.
     * The entity will be entered into the database at or before transaction commit or as a result of the flush operation.
     */
    persist(entity, flush = this.config.get('autoFlush')) {
        if (flush) {
            return this.persistAndFlush(entity);
        }
        this.persistLater(entity);
    }
    /**
     * Persists your entity immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.persistLater(e) && em.flush()`.
     */
    async persistAndFlush(entity) {
        this.persistLater(entity);
        await this.flush();
    }
    /**
     * Tells the EntityManager to make an instance managed and persistent.
     * The entity will be entered into the database at or before transaction commit or as a result of the flush operation.
     */
    persistLater(entity) {
        const entities = utils_1.Utils.asArray(entity);
        for (const ent of entities) {
            this.getUnitOfWork().persist(ent);
        }
    }
    /**
     * Removes an entity instance or all entities matching your `where` query. When deleting entity by instance, you
     * will need to flush your changes. You can force flushing via third parameter.
     */
    remove(entityName, where, flush = this.config.get('autoFlush')) {
        entityName = utils_1.Utils.className(entityName);
        if (utils_1.Utils.isEntity(where)) {
            const ret = this.removeEntity(where, flush);
            return ret ? ret.then(() => 1) : ret;
        }
        this.validator.validateRemoveEmptyWhere(entityName, where);
        return this.nativeDelete(entityName, where);
    }
    /**
     * Removes an entity instance. You can force flushing via second parameter.
     * A removed entity will be removed from the database at or before transaction commit or as a result of the flush operation.
     */
    removeEntity(entity, flush = this.config.get('autoFlush')) {
        if (flush) {
            return this.removeAndFlush(entity);
        }
        this.removeLater(entity);
    }
    /**
     * Removes an entity instance immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.removeLater(e) && em.flush()`
     */
    async removeAndFlush(entity) {
        this.getUnitOfWork().remove(entity);
        await this.flush();
    }
    /**
     * Removes an entity instance.
     * A removed entity will be removed from the database at or before transaction commit or as a result of the flush operation.
     */
    removeLater(entity) {
        this.getUnitOfWork().remove(entity);
    }
    /**
     * Flushes all changes to objects that have been queued up to now to the database.
     * This effectively synchronizes the in-memory state of managed objects with the database.
     */
    async flush() {
        await this.getUnitOfWork().commit();
    }
    /**
     * Clears the EntityManager. All entities that are currently managed by this EntityManager become detached.
     */
    clear() {
        this.getUnitOfWork().clear();
    }
    /**
     * Checks whether given property can be populated on the entity.
     */
    canPopulate(entityName, property) {
        entityName = utils_1.Utils.className(entityName);
        const [p, ...parts] = property.split('.');
        const props = this.metadata.get(entityName).properties;
        const ret = p in props && props[p].reference !== entity_1.ReferenceType.SCALAR;
        if (!ret) {
            return false;
        }
        if (parts.length > 0) {
            return this.canPopulate(props[p].type, parts.join('.'));
        }
        return ret;
    }
    async populate(entities, populate, where = {}, orderBy = {}, refresh = false, validate = true) {
        const entitiesArray = utils_1.Utils.asArray(entities);
        if (entitiesArray.length === 0) {
            return entities;
        }
        const entityName = entitiesArray[0].constructor.name;
        await this.entityLoader.populate(entityName, entitiesArray, populate, where, orderBy, refresh, validate);
        return entities;
    }
    /**
     * Returns new EntityManager instance with its own identity map
     *
     * @param clear do we want clear identity map? defaults to true
     * @param useContext use request context? should be used only for top level request scope EM, defaults to false
     */
    fork(clear = true, useContext = false) {
        const em = new EntityManager(this.config, this.driver, this.metadata, useContext);
        if (!clear) {
            Object.values(this.getUnitOfWork().getIdentityMap()).forEach(entity => em.merge(entity));
        }
        return em;
    }
    /**
     * Gets the UnitOfWork used by the EntityManager to coordinate operations.
     */
    getUnitOfWork() {
        const em = this.useContext ? (utils_1.RequestContext.getEntityManager() || this) : this;
        return em.unitOfWork;
    }
    /**
     * Gets the EntityFactory used by the EntityManager.
     */
    getEntityFactory() {
        const em = this.useContext ? (utils_1.RequestContext.getEntityManager() || this) : this;
        return em.entityFactory;
    }
    /**
     * Checks whether this EntityManager is currently operating inside a database transaction.
     */
    isInTransaction() {
        return !!this.transactionContext;
    }
    /**
     * Gets the transaction context (driver dependent object used to make sure queries are executed on same connection).
     */
    getTransactionContext() {
        return this.transactionContext;
    }
    /**
     * Gets the MetadataStorage.
     */
    getMetadata() {
        return this.metadata;
    }
    checkLockRequirements(mode, meta) {
        if (!mode) {
            return;
        }
        if (mode === unit_of_work_1.LockMode.OPTIMISTIC && !meta.versionProperty) {
            throw utils_1.ValidationError.notVersioned(meta);
        }
        if ([unit_of_work_1.LockMode.PESSIMISTIC_READ, unit_of_work_1.LockMode.PESSIMISTIC_WRITE].includes(mode) && !this.isInTransaction()) {
            throw utils_1.ValidationError.transactionRequired();
        }
    }
    async lockAndPopulate(entityName, entity, where, options) {
        if (options.lockMode === unit_of_work_1.LockMode.OPTIMISTIC) {
            await this.lock(entity, options.lockMode, options.lockVersion);
        }
        await this.entityLoader.populate(entityName, [entity], options.populate || [], where, options.orderBy || {}, options.refresh);
        return entity;
    }
    preparePopulate(populate) {
        return Array.isArray(populate) ? populate : [];
    }
}
exports.EntityManager = EntityManager;
