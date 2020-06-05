"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const metadata_1 = require("../metadata");
const utils_1 = require("../utils");
const entity_1 = require("../entity");
function Property(options = {}) {
    return function (target, propertyName) {
        const meta = metadata_1.MetadataStorage.getMetadata(target.constructor.name);
        const desc = Object.getOwnPropertyDescriptor(target, propertyName) || {};
        entity_1.EntityValidator.validateSingleDecorator(meta, propertyName);
        utils_1.Utils.lookupPathFromDecorator(meta);
        const name = options.name || propertyName;
        if (propertyName !== name && !(desc.value instanceof Function)) {
            utils_1.Utils.renameKey(options, 'name', 'fieldName');
        }
        options.name = propertyName;
        const prop = Object.assign({ reference: entity_1.ReferenceType.SCALAR }, options);
        prop.getter = !!desc.get;
        prop.setter = !!desc.set;
        if (desc.value instanceof Function) {
            prop.getter = true;
            prop.persist = false;
            prop.type = 'method';
            prop.getterName = propertyName;
            prop.name = name;
        }
        meta.properties[prop.name] = prop;
    };
}
exports.Property = Property;
