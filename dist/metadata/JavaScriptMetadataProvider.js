"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MetadataProvider_1 = require("./MetadataProvider");
const utils_1 = require("../utils");
const entity_1 = require("../entity");
class JavaScriptMetadataProvider extends MetadataProvider_1.MetadataProvider {
    async loadEntityMetadata(meta, name) {
        const schema = this.getSchema(meta);
        Object.entries(schema.properties).forEach(([name, prop]) => {
            if (utils_1.Utils.isString(prop)) {
                schema.properties[name] = { type: prop };
            }
        });
        utils_1.Utils.merge(meta, schema);
        Object.entries(meta.properties).forEach(([name, prop]) => {
            this.initProperty(prop, name);
        });
    }
    /**
     * Re-hydrates missing attributes like `onUpdate` (functions are lost when caching to JSON)
     */
    loadFromCache(meta, cache) {
        utils_1.Utils.merge(meta, cache);
        const schema = this.getSchema(meta);
        Object.entries(schema.properties).forEach(([name, prop]) => {
            if (utils_1.Utils.isObject(prop)) {
                Object.entries(prop).forEach(([attribute, value]) => {
                    if (!(attribute in meta.properties[name])) {
                        meta.properties[name][attribute] = value;
                    }
                });
            }
        });
    }
    initProperty(prop, propName) {
        prop.name = propName;
        if (typeof prop.reference === 'undefined') {
            prop.reference = entity_1.ReferenceType.SCALAR;
        }
        if (prop.reference !== entity_1.ReferenceType.SCALAR && typeof prop.cascade === 'undefined') {
            prop.cascade = [entity_1.Cascade.PERSIST, entity_1.Cascade.MERGE];
        }
    }
    getSchema(meta) {
        const path = utils_1.Utils.absolutePath(meta.path, this.config.get('baseDir'));
        const { schema } = require(path);
        return schema;
    }
}
exports.JavaScriptMetadataProvider = JavaScriptMetadataProvider;
