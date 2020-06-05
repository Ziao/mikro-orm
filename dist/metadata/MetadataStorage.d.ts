import { EntityMetadata, AnyEntity, Dictionary } from '../typings';
import { EntityManager } from '../EntityManager';
export declare class MetadataStorage {
    private static readonly metadata;
    private readonly metadata;
    constructor(metadata?: Dictionary<EntityMetadata>);
    static getMetadata(): Dictionary<EntityMetadata>;
    static getMetadata<T extends AnyEntity<T> = any>(entity: string): EntityMetadata<T>;
    static init(): MetadataStorage;
    getAll(): Dictionary<EntityMetadata>;
    get<T extends AnyEntity<T> = any>(entity: string, init?: boolean, validate?: boolean): EntityMetadata<T>;
    has(entity: string): boolean;
    set(entity: string, meta: EntityMetadata): EntityMetadata;
    reset(entity: string): void;
    decorate(em: EntityManager): void;
}
