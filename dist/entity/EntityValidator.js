"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EntityFactory_1 = require("./EntityFactory");
const utils_1 = require("../utils");
const enums_1 = require("./enums");
const EntityHelper_1 = require("./EntityHelper");
class EntityValidator {
    constructor(strict) {
        this.strict = strict;
    }
    static validateSingleDecorator(meta, propertyName) {
        if (meta.properties[propertyName] && meta.properties[propertyName].reference) {
            throw utils_1.ValidationError.multipleDecorators(meta.className, propertyName);
        }
    }
    validate(entity, payload, meta) {
        Object.values(meta.properties).forEach(prop => {
            if ([enums_1.ReferenceType.ONE_TO_MANY, enums_1.ReferenceType.MANY_TO_MANY].includes(prop.reference)) {
                this.validateCollection(entity, prop);
            }
        });
        Object.keys(payload).forEach(prop => {
            const property = meta.properties[prop];
            if (!property || property.reference !== enums_1.ReferenceType.SCALAR || !EntityFactory_1.SCALAR_TYPES.includes(property.type)) {
                return;
            }
            payload[prop] = entity[prop] = this.validateProperty(property, payload[prop], entity);
        });
    }
    validateProperty(prop, givenValue, entity) {
        if (givenValue === null || givenValue === undefined) {
            return givenValue;
        }
        const expectedType = prop.type.toLowerCase();
        let givenType = utils_1.Utils.getObjectType(givenValue);
        let ret = givenValue;
        if (!this.strict) {
            ret = this.fixTypes(expectedType, givenType, givenValue);
            givenType = utils_1.Utils.getObjectType(ret);
        }
        if (givenType !== expectedType) {
            throw utils_1.ValidationError.fromWrongPropertyType(entity, prop.name, expectedType, givenType, givenValue);
        }
        return ret;
    }
    validateParams(params, type = 'search condition', field) {
        if (utils_1.Utils.isPrimaryKey(params) || utils_1.Utils.isEntity(params)) {
            return;
        }
        if (Array.isArray(params)) {
            return params.forEach((item) => this.validateParams(item, type, field));
        }
        if (utils_1.Utils.isObject(params)) {
            Object.keys(params).forEach(k => {
                this.validateParams(params[k], type, k);
            });
        }
    }
    validatePrimaryKey(entity, meta) {
        const pkExists = meta.primaryKeys.every(pk => utils_1.Utils.isDefined(entity[pk], true)) || utils_1.Utils.isDefined(entity[meta.serializedPrimaryKey], true);
        if (!entity || !pkExists) {
            throw utils_1.ValidationError.fromMergeWithoutPK(meta);
        }
    }
    validateEmptyWhere(where) {
        if (utils_1.Utils.isEmpty(where)) {
            throw new Error(`You cannot call 'EntityManager.findOne()' with empty 'where' parameter`);
        }
    }
    validateRemoveEmptyWhere(className, where) {
        if (!utils_1.Utils.isDefined(where, true)) {
            throw new Error(`You cannot call 'EntityManager.remove()' with empty 'where' parameter. If you want to remove all entities, use 'em.remove(${className}, {})'.`);
        }
    }
    validateCollection(entity, prop) {
        if (EntityHelper_1.wrap(entity).isInitialized() && !entity[prop.name]) {
            throw utils_1.ValidationError.fromCollectionNotInitialized(entity, prop);
        }
    }
    fixTypes(expectedType, givenType, givenValue) {
        if (expectedType === 'date' && ['string', 'number'].includes(givenType)) {
            givenValue = this.fixDateType(givenValue);
        }
        if (expectedType === 'number' && givenType === 'string') {
            givenValue = this.fixNumberType(givenValue);
        }
        if (expectedType === 'boolean' && givenType === 'number') {
            givenValue = this.fixBooleanType(givenValue);
        }
        return givenValue;
    }
    fixDateType(givenValue) {
        let date;
        if (utils_1.Utils.isString(givenValue) && givenValue.match(/^-?\d+(\.\d+)?$/)) {
            date = new Date(+givenValue);
        }
        else {
            date = new Date(givenValue);
        }
        return date.toString() !== 'Invalid Date' ? date : givenValue;
    }
    fixNumberType(givenValue) {
        const num = +givenValue;
        return '' + num === givenValue ? num : givenValue;
    }
    fixBooleanType(givenValue) {
        const bool = !!givenValue;
        return +bool === givenValue ? bool : givenValue;
    }
}
exports.EntityValidator = EntityValidator;
