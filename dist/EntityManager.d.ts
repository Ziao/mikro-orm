import { Configuration } from './utils';
import { EntityFactory, EntityRepository, EntityValidator, IdentifiedReference, Reference } from './entity';
import { LockMode, UnitOfWork } from './unit-of-work';
import { IDatabaseDriver, FindOneOptions, FindOptions } from './drivers';
import { EntityData, EntityName, AnyEntity, IPrimaryKey, FilterQuery, Primary, Dictionary } from './typings';
import { QueryBuilder, QueryOrderMap } from './query';
import { MetadataStorage } from './metadata';
import { Transaction } from './connections';
/**
 * The EntityManager is the central access point to ORM functionality. It is a facade to all different ORM subsystems
 * such as UnitOfWork, Query Language and Repository API.
 */
export declare class EntityManager<D extends IDatabaseDriver = IDatabaseDriver> {
    readonly config: Configuration;
    private readonly driver;
    private readonly metadata;
    private readonly useContext;
    readonly id: string;
    private readonly validator;
    private readonly repositoryMap;
    private readonly entityLoader;
    private readonly unitOfWork;
    private readonly entityFactory;
    private transactionContext?;
    constructor(config: Configuration, driver: D, metadata: MetadataStorage, useContext?: boolean);
    /**
     * Gets the Driver instance used by this EntityManager
     */
    getDriver(): D;
    /**
     * Gets the Connection instance, by default returns write connection
     */
    getConnection(type?: 'read' | 'write'): ReturnType<D['getConnection']>;
    /**
     * Gets repository for given entity. You can pass either string name or entity class reference.
     */
    getRepository<T extends AnyEntity<T>, U extends EntityRepository<T> = EntityRepository<T>>(entityName: EntityName<T>): U;
    /**
     * Gets EntityValidator instance
     */
    getValidator(): EntityValidator;
    /**
     * Creates a QueryBuilder instance
     */
    createQueryBuilder<T extends AnyEntity<T>>(entityName: EntityName<T>, alias?: string, type?: 'read' | 'write'): QueryBuilder<T>;
    /**
     * Finds all entities matching your `where` query. You can pass additional options via the `options` parameter.
     */
    find<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, options?: FindOptions): Promise<T[]>;
    /**
     * Finds all entities matching your `where` query.
     */
    find<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, populate?: string[] | boolean, orderBy?: QueryOrderMap, limit?: number, offset?: number): Promise<T[]>;
    /**
     * Calls `em.find()` and `em.count()` with the same arguments (where applicable) and returns the results as tuple
     * where first element is the array of entities and the second is the count.
     */
    findAndCount<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, options?: FindOptions): Promise<[T[], number]>;
    /**
     * Calls `em.find()` and `em.count()` with the same arguments (where applicable) and returns the results as tuple
     * where first element is the array of entities and the second is the count.
     */
    findAndCount<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, populate?: string[] | boolean, orderBy?: QueryOrderMap, limit?: number, offset?: number): Promise<[T[], number]>;
    /**
     * Finds first entity matching your `where` query.
     */
    findOne<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, options?: FindOneOptions): Promise<T | null>;
    /**
     * Finds first entity matching your `where` query.
     */
    findOne<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, populate?: string[] | boolean, orderBy?: QueryOrderMap): Promise<T | null>;
    /**
     * Finds first entity matching your `where` query. If nothing found, it will throw an error.
     * You can override the factory for creating this method via `options.failHandler` locally
     * or via `Configuration.findOneOrFailHandler` globally.
     */
    findOneOrFail<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, options?: FindOneOrFailOptions): Promise<T>;
    /**
     * Finds first entity matching your `where` query. If nothing found, it will throw an error.
     * You can override the factory for creating this method via `options.failHandler` locally
     * or via `Configuration.findOneOrFailHandler` globally.
     */
    findOneOrFail<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, populate?: string[] | boolean, orderBy?: QueryOrderMap): Promise<T>;
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    transactional<T>(cb: (em: EntityManager) => Promise<T>, ctx?: any): Promise<T>;
    /**
     * Runs your callback wrapped inside a database transaction.
     */
    lock(entity: AnyEntity, lockMode: LockMode, lockVersion?: number | Date): Promise<void>;
    /**
     * Fires native insert query. Calling this has no side effects on the context (identity map).
     */
    nativeInsert<T extends AnyEntity<T>>(entityName: EntityName<T>, data: EntityData<T>): Promise<Primary<T>>;
    /**
     * Fires native update query. Calling this has no side effects on the context (identity map).
     */
    nativeUpdate<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>, data: EntityData<T>): Promise<number>;
    /**
     * Fires native delete query. Calling this has no side effects on the context (identity map).
     */
    nativeDelete<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T>): Promise<number>;
    /**
     * Maps raw database result to an entity and merges it to this EntityManager.
     */
    map<T extends AnyEntity<T>>(entityName: EntityName<T>, result: EntityData<T>): T;
    /**
     * Shortcut to driver's aggregate method. Available in MongoDriver only.
     */
    aggregate(entityName: EntityName<AnyEntity>, pipeline: any[]): Promise<any[]>;
    /**
     * Merges given entity to this EntityManager so it becomes managed. You can force refreshing of existing entities
     * via second parameter. By default it will return already loaded entities without modifying them.
     */
    merge<T extends AnyEntity<T>>(entity: T, refresh?: boolean): T;
    /**
     * Merges given entity to this EntityManager so it becomes managed. You can force refreshing of existing entities
     * via second parameter. By default it will return already loaded entities without modifying them.
     */
    merge<T extends AnyEntity<T>>(entityName: EntityName<T>, data: EntityData<T>, refresh?: boolean): T;
    /**
     * Creates new instance of given entity and populates it with given data
     */
    create<T extends AnyEntity<T>>(entityName: EntityName<T>, data: EntityData<T>): T;
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference<T extends AnyEntity<T>, PK extends keyof T>(entityName: EntityName<T>, id: Primary<T> | Primary<T>[], wrapped: true): IdentifiedReference<T, PK>;
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference<T extends AnyEntity<T>>(entityName: EntityName<T>, id: Primary<T> | Primary<T>[]): T;
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference<T extends AnyEntity<T>>(entityName: EntityName<T>, id: Primary<T> | Primary<T>[], wrapped: false): T;
    /**
     * Gets a reference to the entity identified by the given type and identifier without actually loading it, if the entity is not yet loaded
     */
    getReference<T extends AnyEntity<T>>(entityName: EntityName<T>, id: Primary<T> | Primary<T>[], wrapped: boolean): T | Reference<T>;
    /**
     * Returns total number of entities matching your `where` query.
     */
    count<T extends AnyEntity<T>>(entityName: EntityName<T>, where?: FilterQuery<T>): Promise<number>;
    /**
     * Tells the EntityManager to make an instance managed and persistent. You can force flushing via second parameter.
     * The entity will be entered into the database at or before transaction commit or as a result of the flush operation.
     */
    persist(entity: AnyEntity | AnyEntity[], flush?: boolean): void | Promise<void>;
    /**
     * Persists your entity immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.persistLater(e) && em.flush()`.
     */
    persistAndFlush(entity: AnyEntity | AnyEntity[]): Promise<void>;
    /**
     * Tells the EntityManager to make an instance managed and persistent.
     * The entity will be entered into the database at or before transaction commit or as a result of the flush operation.
     */
    persistLater(entity: AnyEntity | AnyEntity[]): void;
    /**
     * Removes an entity instance or all entities matching your `where` query. When deleting entity by instance, you
     * will need to flush your changes. You can force flushing via third parameter.
     */
    remove<T extends AnyEntity<T>>(entityName: EntityName<T>, where: FilterQuery<T> | T, flush?: boolean): void | Promise<number>;
    /**
     * Removes an entity instance. You can force flushing via second parameter.
     * A removed entity will be removed from the database at or before transaction commit or as a result of the flush operation.
     */
    removeEntity<T extends AnyEntity<T>>(entity: T, flush?: boolean): void | Promise<void>;
    /**
     * Removes an entity instance immediately, flushing all not yet persisted changes to the database too.
     * Equivalent to `em.removeLater(e) && em.flush()`
     */
    removeAndFlush(entity: AnyEntity): Promise<void>;
    /**
     * Removes an entity instance.
     * A removed entity will be removed from the database at or before transaction commit or as a result of the flush operation.
     */
    removeLater(entity: AnyEntity): void;
    /**
     * Flushes all changes to objects that have been queued up to now to the database.
     * This effectively synchronizes the in-memory state of managed objects with the database.
     */
    flush(): Promise<void>;
    /**
     * Clears the EntityManager. All entities that are currently managed by this EntityManager become detached.
     */
    clear(): void;
    /**
     * Checks whether given property can be populated on the entity.
     */
    canPopulate(entityName: string | Function, property: string): boolean;
    populate<T extends AnyEntity<T>, K extends T | T[]>(entities: K, populate: string | string[] | boolean, where?: FilterQuery<T>, orderBy?: QueryOrderMap, refresh?: boolean, validate?: boolean): Promise<K>;
    /**
     * Returns new EntityManager instance with its own identity map
     *
     * @param clear do we want clear identity map? defaults to true
     * @param useContext use request context? should be used only for top level request scope EM, defaults to false
     */
    fork(clear?: boolean, useContext?: boolean): EntityManager;
    /**
     * Gets the UnitOfWork used by the EntityManager to coordinate operations.
     */
    getUnitOfWork(): UnitOfWork;
    /**
     * Gets the EntityFactory used by the EntityManager.
     */
    getEntityFactory(): EntityFactory;
    /**
     * Checks whether this EntityManager is currently operating inside a database transaction.
     */
    isInTransaction(): boolean;
    /**
     * Gets the transaction context (driver dependent object used to make sure queries are executed on same connection).
     */
    getTransactionContext<T extends Transaction = Transaction>(): T | undefined;
    /**
     * Gets the MetadataStorage.
     */
    getMetadata(): MetadataStorage;
    private checkLockRequirements;
    private lockAndPopulate;
    private preparePopulate;
}
export interface FindOneOrFailOptions extends FindOneOptions {
    failHandler?: (entityName: string, where: Dictionary | IPrimaryKey | any) => Error;
}
