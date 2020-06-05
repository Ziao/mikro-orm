import { Configuration } from '../utils';
import { MetadataStorage } from './MetadataStorage';
import { Platform } from '../platforms';
export declare class MetadataDiscovery {
    private readonly metadata;
    private readonly platform;
    private readonly config;
    private readonly namingStrategy;
    private readonly metadataProvider;
    private readonly cache;
    private readonly logger;
    private readonly schemaHelper;
    private readonly validator;
    private readonly discovered;
    constructor(metadata: MetadataStorage, platform: Platform, config: Configuration);
    discover(preferTsNode?: boolean): Promise<MetadataStorage>;
    private findEntities;
    private discoverDirectory;
    private prepare;
    private getSchema;
    private discoverEntity;
    private saveToCache;
    private applyNamingStrategy;
    private initFieldName;
    private initManyToOneFieldName;
    private initManyToManyFieldName;
    private initManyToManyFields;
    private initManyToOneFields;
    private initOneToManyFields;
    private processEntity;
    private initFactoryField;
    private definePivotTableEntity;
    private defineFixedOrderProperty;
    private definePivotProperty;
    private autoWireBidirectionalProperties;
    private defineBaseEntityProperties;
    private getDefaultVersionValue;
    private initVersionProperty;
    private initCustomType;
    private initColumnType;
    private initEnumValues;
    private initUnsigned;
    private initIndexes;
    private getEntityClassOrSchema;
}
