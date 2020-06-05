"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entity_1 = require("../entity");
const ChangeSetComputer_1 = require("./ChangeSetComputer");
const ChangeSetPersister_1 = require("./ChangeSetPersister");
const ChangeSet_1 = require("./ChangeSet");
const utils_1 = require("../utils");
const __1 = require("..");
class UnitOfWork {
    constructor(em) {
        this.em = em;
        /** map of references to managed entities */
        this.identityMap = Object.create(null);
        /** holds copy of identity map so we can compute changes when persisting managed entities */
        this.originalEntityData = Object.create(null);
        /** map of wrapped primary keys so we can compute change set without eager commit */
        this.identifierMap = Object.create(null);
        this.persistStack = [];
        this.removeStack = [];
        this.orphanRemoveStack = [];
        this.changeSets = [];
        this.collectionUpdates = [];
        this.extraUpdates = [];
        this.metadata = this.em.getMetadata();
        this.platform = this.em.getDriver().getPlatform();
        this.changeSetComputer = new ChangeSetComputer_1.ChangeSetComputer(this.em.getValidator(), this.originalEntityData, this.identifierMap, this.collectionUpdates, this.removeStack, this.metadata, this.platform);
        this.changeSetPersister = new ChangeSetPersister_1.ChangeSetPersister(this.em.getDriver(), this.identifierMap, this.metadata);
        this.working = false;
    }
    merge(entity, visited = [], mergeData = true) {
        const wrapped = entity_1.wrap(entity);
        Object.defineProperty(wrapped, '__em', { value: this.em, writable: true });
        if (!utils_1.Utils.isDefined(wrapped.__primaryKey, true)) {
            return;
        }
        this.identityMap[`${wrapped.constructor.name}-${wrapped.__serializedPrimaryKey}`] = wrapped;
        if (mergeData || !this.originalEntityData[wrapped.__uuid]) {
            this.originalEntityData[wrapped.__uuid] = utils_1.Utils.prepareEntity(entity, this.metadata, this.platform);
        }
        this.cascade(entity, entity_1.Cascade.MERGE, visited, { mergeData: false });
    }
    /**
     * Returns entity from the identity map. For composite keys, you need to pass an array of PKs in the same order as they are defined in `meta.primaryKeys`.
     */
    getById(entityName, id) {
        const hash = utils_1.Utils.getPrimaryKeyHash(utils_1.Utils.asArray(id));
        const token = `${entityName}-${hash}`;
        return this.identityMap[token];
    }
    tryGetById(entityName, where) {
        const pk = utils_1.Utils.extractPK(where, this.metadata.get(entityName));
        if (!pk) {
            return null;
        }
        return this.getById(entityName, pk);
    }
    getIdentityMap() {
        return this.identityMap;
    }
    persist(entity, visited = [], checkRemoveStack = false) {
        if (this.persistStack.includes(entity)) {
            return;
        }
        if (checkRemoveStack && this.removeStack.includes(entity)) {
            return;
        }
        if (!utils_1.Utils.isDefined(entity_1.wrap(entity).__primaryKey, true)) {
            this.identifierMap[entity_1.wrap(entity).__uuid] = new entity_1.EntityIdentifier();
        }
        this.persistStack.push(entity);
        this.cleanUpStack(this.removeStack, entity);
        this.cascade(entity, entity_1.Cascade.PERSIST, visited, { checkRemoveStack });
    }
    remove(entity, visited = []) {
        if (this.removeStack.includes(entity)) {
            return;
        }
        if (entity_1.wrap(entity).__primaryKey) {
            this.removeStack.push(entity);
        }
        this.cleanUpStack(this.persistStack, entity);
        this.unsetIdentity(entity);
        this.cascade(entity, entity_1.Cascade.REMOVE, visited);
    }
    async commit() {
        if (this.working) {
            throw utils_1.ValidationError.cannotCommit();
        }
        try {
            this.working = true;
            this.computeChangeSets();
            if (this.changeSets.length === 0 && this.collectionUpdates.length === 0 && this.extraUpdates.length === 0) {
                return this.postCommitCleanup(); // nothing to do, do not start transaction
            }
            this.reorderChangeSets();
            const platform = this.em.getDriver().getPlatform();
            const runInTransaction = !this.em.isInTransaction() && platform.supportsTransactions() && this.em.config.get('implicitTransactions');
            if (runInTransaction) {
                await this.em.getConnection('write').transactional(trx => this.persistToDatabase(trx));
            }
            else {
                await this.persistToDatabase(this.em.getTransactionContext());
            }
        }
        catch (e) {
            throw e;
        }
        finally {
            this.postCommitCleanup();
        }
    }
    async lock(entity, mode, version) {
        if (!this.getById(entity.constructor.name, entity_1.wrap(entity).__primaryKeys)) {
            throw utils_1.ValidationError.entityNotManaged(entity);
        }
        const meta = this.metadata.get(entity.constructor.name);
        if (mode === __1.LockMode.OPTIMISTIC) {
            await this.lockOptimistic(entity, meta, version);
        }
        else if ([__1.LockMode.NONE, __1.LockMode.PESSIMISTIC_READ, __1.LockMode.PESSIMISTIC_WRITE].includes(mode)) {
            await this.lockPessimistic(entity, mode);
        }
    }
    clear() {
        Object.keys(this.identityMap).forEach(key => delete this.identityMap[key]);
        Object.keys(this.originalEntityData).forEach(key => delete this.originalEntityData[key]);
        this.postCommitCleanup();
    }
    unsetIdentity(entity) {
        delete this.identityMap[`${entity.constructor.name}-${entity_1.wrap(entity).__serializedPrimaryKey}`];
        delete this.identifierMap[entity_1.wrap(entity).__uuid];
        delete this.originalEntityData[entity_1.wrap(entity).__uuid];
    }
    computeChangeSets() {
        this.changeSets.length = 0;
        Object.values(this.identityMap)
            .filter(entity => !this.removeStack.includes(entity) && !this.orphanRemoveStack.includes(entity))
            .forEach(entity => this.persist(entity, [], true));
        while (this.persistStack.length) {
            this.findNewEntities(this.persistStack.shift());
        }
        for (const entity of Object.values(this.orphanRemoveStack)) {
            this.remove(entity);
        }
        for (const entity of this.removeStack) {
            const meta = this.metadata.get(entity.constructor.name);
            this.changeSets.push({ entity, type: ChangeSet_1.ChangeSetType.DELETE, name: meta.name, collection: meta.collection, payload: {} });
        }
    }
    scheduleOrphanRemoval(entity) {
        this.orphanRemoveStack.push(entity);
    }
    cancelOrphanRemoval(entity) {
        this.cleanUpStack(this.orphanRemoveStack, entity);
    }
    findNewEntities(entity, visited = []) {
        if (visited.includes(entity)) {
            return;
        }
        visited.push(entity);
        const wrapped = entity_1.wrap(entity);
        if (!wrapped.isInitialized() || this.removeStack.includes(entity) || this.orphanRemoveStack.includes(entity)) {
            return;
        }
        if (!utils_1.Utils.isDefined(wrapped.__primaryKey, true) && !this.identifierMap[wrapped.__uuid]) {
            this.identifierMap[wrapped.__uuid] = new entity_1.EntityIdentifier();
        }
        for (const prop of Object.values(wrapped.__meta.properties)) {
            const reference = this.unwrapReference(entity, prop);
            this.processReference(entity, prop, reference, visited);
        }
        const changeSet = this.changeSetComputer.computeChangeSet(wrapped);
        if (changeSet) {
            this.changeSets.push(changeSet);
            this.cleanUpStack(this.persistStack, wrapped);
            this.originalEntityData[wrapped.__uuid] = utils_1.Utils.prepareEntity(entity, this.metadata, this.platform);
        }
    }
    processReference(parent, prop, reference, visited) {
        const isToOne = prop.reference === entity_1.ReferenceType.MANY_TO_ONE || prop.reference === entity_1.ReferenceType.ONE_TO_ONE;
        if (isToOne && reference) {
            return this.processToOneReference(reference, visited);
        }
        if (utils_1.Utils.isCollection(reference, prop, entity_1.ReferenceType.MANY_TO_MANY) && reference.isDirty()) {
            this.processToManyReference(reference, visited, parent, prop);
        }
    }
    processToOneReference(reference, visited) {
        if (!this.originalEntityData[reference.__uuid]) {
            this.findNewEntities(reference, visited);
        }
    }
    processToManyReference(reference, visited, parent, prop) {
        if (this.isCollectionSelfReferenced(reference, visited)) {
            this.extraUpdates.push([parent, prop.name, reference]);
            parent[prop.name] = new entity_1.Collection(parent);
            return;
        }
        reference.getItems()
            .filter(item => !this.originalEntityData[entity_1.wrap(item).__uuid])
            .forEach(item => this.findNewEntities(item, visited));
    }
    async commitChangeSet(changeSet, ctx) {
        if (changeSet.type === ChangeSet_1.ChangeSetType.CREATE) {
            Object.values(changeSet.entity.__meta.properties)
                .filter(prop => (prop.reference === entity_1.ReferenceType.ONE_TO_ONE && prop.owner) || prop.reference === entity_1.ReferenceType.MANY_TO_ONE)
                .filter(prop => changeSet.entity[prop.name])
                .forEach(prop => {
                const cs = this.changeSets.find(cs => cs.entity === changeSet.entity[prop.name]);
                const isScheduledForInsert = cs && cs.type === ChangeSet_1.ChangeSetType.CREATE && !cs.persisted;
                if (isScheduledForInsert) {
                    this.extraUpdates.push([changeSet.entity, prop.name, changeSet.entity[prop.name]]);
                    delete changeSet.entity[prop.name];
                    delete changeSet.payload[prop.name];
                }
            });
        }
        const type = changeSet.type.charAt(0).toUpperCase() + changeSet.type.slice(1);
        await this.runHooks(`before${type}`, changeSet.entity, changeSet.payload);
        await this.changeSetPersister.persistToDatabase(changeSet, ctx);
        switch (changeSet.type) {
            case ChangeSet_1.ChangeSetType.CREATE:
                this.em.merge(changeSet.entity);
                break;
            case ChangeSet_1.ChangeSetType.UPDATE:
                this.merge(changeSet.entity);
                break;
            case ChangeSet_1.ChangeSetType.DELETE:
                this.unsetIdentity(changeSet.entity);
                break;
        }
        await this.runHooks(`after${type}`, changeSet.entity);
    }
    async runHooks(type, entity, payload) {
        const hooks = this.metadata.get(entity.constructor.name).hooks;
        if (hooks && hooks[type] && hooks[type].length > 0) {
            const copy = utils_1.Utils.prepareEntity(entity, this.metadata, this.platform);
            await utils_1.Utils.runSerial(hooks[type], hook => entity[hook]());
            if (payload) {
                Object.assign(payload, utils_1.Utils.diffEntities(copy, entity, this.metadata, this.platform));
            }
        }
    }
    /**
     * clean up persist/remove stack from previous persist/remove calls for this entity done before flushing
     */
    cleanUpStack(stack, entity) {
        for (const index in stack) {
            if (stack[index] === entity) {
                stack.splice(+index, 1);
            }
        }
    }
    postCommitCleanup() {
        Object.keys(this.identifierMap).forEach(key => delete this.identifierMap[key]);
        this.persistStack.length = 0;
        this.removeStack.length = 0;
        this.orphanRemoveStack.length = 0;
        this.changeSets.length = 0;
        this.collectionUpdates.length = 0;
        this.extraUpdates.length = 0;
        this.working = false;
    }
    cascade(entity, type, visited, options = {}) {
        if (visited.includes(entity)) {
            return;
        }
        visited.push(entity);
        switch (type) {
            case entity_1.Cascade.PERSIST:
                this.persist(entity, visited, options.checkRemoveStack);
                break;
            case entity_1.Cascade.MERGE:
                this.merge(entity, visited, options.mergeData);
                break;
            case entity_1.Cascade.REMOVE:
                this.remove(entity, visited);
                break;
        }
        const meta = this.metadata.get(entity.constructor.name);
        for (const prop of Object.values(meta.properties).filter(prop => prop.reference !== entity_1.ReferenceType.SCALAR)) {
            this.cascadeReference(entity, prop, type, visited, options);
        }
    }
    cascadeReference(entity, prop, type, visited, options) {
        this.fixMissingReference(entity, prop);
        if (!this.shouldCascade(prop, type)) {
            return;
        }
        const reference = this.unwrapReference(entity, prop);
        if ([entity_1.ReferenceType.MANY_TO_ONE, entity_1.ReferenceType.ONE_TO_ONE].includes(prop.reference) && reference) {
            return this.cascade(reference, type, visited, options);
        }
        const collection = reference;
        const requireFullyInitialized = type === entity_1.Cascade.PERSIST; // only cascade persist needs fully initialized items
        if ([entity_1.ReferenceType.ONE_TO_MANY, entity_1.ReferenceType.MANY_TO_MANY].includes(prop.reference) && collection && collection.isInitialized(requireFullyInitialized)) {
            collection.getItems().forEach(item => this.cascade(item, type, visited, options));
        }
    }
    isCollectionSelfReferenced(collection, visited) {
        const filtered = collection.getItems().filter(item => !this.originalEntityData[entity_1.wrap(item).__uuid]);
        return filtered.some(items => visited.includes(items));
    }
    shouldCascade(prop, type) {
        if (type === entity_1.Cascade.REMOVE && prop.orphanRemoval) {
            return true;
        }
        return prop.cascade && (prop.cascade.includes(type) || prop.cascade.includes(entity_1.Cascade.ALL));
    }
    async lockPessimistic(entity, mode) {
        if (!this.em.isInTransaction()) {
            throw utils_1.ValidationError.transactionRequired();
        }
        const qb = this.em.createQueryBuilder(entity.constructor.name);
        const meta = entity_1.wrap(entity).__meta;
        const cond = utils_1.Utils.getPrimaryKeyCond(entity, meta.primaryKeys);
        await qb.select('1').where(cond).setLockMode(mode).execute();
    }
    async lockOptimistic(entity, meta, version) {
        if (!meta.versionProperty) {
            throw utils_1.ValidationError.notVersioned(meta);
        }
        if (!utils_1.Utils.isDefined(version)) {
            return;
        }
        if (!entity_1.wrap(entity).isInitialized()) {
            await entity_1.wrap(entity).init();
        }
        const previousVersion = entity[meta.versionProperty];
        if (previousVersion !== version) {
            throw utils_1.ValidationError.lockFailedVersionMismatch(entity, version, previousVersion);
        }
    }
    fixMissingReference(entity, prop) {
        const reference = this.unwrapReference(entity, prop);
        if ([entity_1.ReferenceType.MANY_TO_ONE, entity_1.ReferenceType.ONE_TO_ONE].includes(prop.reference) && reference && !utils_1.Utils.isEntity(reference)) {
            entity[prop.name] = this.em.getReference(prop.type, reference, !!prop.wrappedReference);
        }
        const isCollection = [entity_1.ReferenceType.ONE_TO_MANY, entity_1.ReferenceType.MANY_TO_MANY].includes(prop.reference);
        if (isCollection && Array.isArray(reference)) {
            const collection = new entity_1.Collection(entity);
            entity[prop.name] = collection;
            collection.set(reference);
        }
    }
    unwrapReference(entity, prop) {
        const reference = entity[prop.name];
        if (reference instanceof entity_1.Reference) {
            return reference.unwrap();
        }
        return reference;
    }
    async persistToDatabase(tx) {
        for (const changeSet of this.changeSets) {
            await this.commitChangeSet(changeSet, tx);
        }
        while (this.extraUpdates.length) {
            const extraUpdate = this.extraUpdates.shift();
            extraUpdate[0][extraUpdate[1]] = extraUpdate[2];
            const changeSet = this.changeSetComputer.computeChangeSet(extraUpdate[0]);
            if (changeSet) {
                await this.commitChangeSet(changeSet, tx);
            }
        }
        for (const coll of this.collectionUpdates) {
            await this.em.getDriver().syncCollection(coll, tx);
            coll.takeSnapshot();
        }
    }
    /**
     * Orders change sets so FK constrains are maintained, ensures stable order (needed for node < 11)
     */
    reorderChangeSets() {
        const commitOrder = this.getCommitOrder();
        const commitOrderReversed = [...commitOrder].reverse();
        const typeOrder = [ChangeSet_1.ChangeSetType.CREATE, ChangeSet_1.ChangeSetType.UPDATE, ChangeSet_1.ChangeSetType.DELETE];
        const compare = (base, arr, a, b, key) => {
            if (arr.indexOf(a[key]) === arr.indexOf(b[key])) {
                return base.indexOf(a) - base.indexOf(b); // ensure stable order
            }
            return arr.indexOf(a[key]) - arr.indexOf(b[key]);
        };
        const copy = this.changeSets.slice(); // make copy to maintain commitOrder
        this.changeSets.sort((a, b) => {
            if (a.type !== b.type) {
                return compare(copy, typeOrder, a, b, 'type');
            }
            // Entity deletions come last and need to be in reverse commit order
            if (a.type === ChangeSet_1.ChangeSetType.DELETE) {
                return compare(copy, commitOrderReversed, a, b, 'name');
            }
            return compare(copy, commitOrder, a, b, 'name');
        });
    }
    getCommitOrder() {
        const calc = new __1.CommitOrderCalculator();
        const types = utils_1.Utils.unique(this.changeSets.map(cs => cs.name));
        types.forEach(entityName => calc.addNode(entityName));
        let entityName = types.pop();
        while (entityName) {
            for (const prop of Object.values(this.metadata.get(entityName).properties)) {
                if (!calc.hasNode(prop.type)) {
                    continue;
                }
                this.addCommitDependency(calc, prop, entityName);
            }
            entityName = types.pop();
        }
        return calc.sort();
    }
    addCommitDependency(calc, prop, entityName) {
        if (!(prop.reference === entity_1.ReferenceType.ONE_TO_ONE && prop.owner) && prop.reference !== entity_1.ReferenceType.MANY_TO_ONE) {
            return;
        }
        calc.addDependency(prop.type, entityName, prop.nullable ? 0 : 1);
    }
}
exports.UnitOfWork = UnitOfWork;
