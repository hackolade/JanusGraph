const { setInManagement, transformToValidGremlinName, getTTlScript } = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generatePropertyKeys = ({ traversalSource, collections, relationships, app }) => {
    setDependencies(app);

    const allProperties = Object.fromEntries(
        collections
            .concat(relationships)
            .flatMap(collection => (collection.properties ? Object.entries(collection.properties) : []))
    );

    const propertiesScript = Object.entries(allProperties)
        .map(([propertyName, propertyData]) =>
            getPropertyScript(transformToValidGremlinName(propertyName), propertyData)
        )
        .join('\n');

    return setInManagement(traversalSource, propertiesScript);
};

const getPropertyScript = (name, fieldData) => {
    const dataType = getDataTypeClass({
        type: fieldData.childType || fieldData.type,
        mode: fieldData.mode,
        subtype: fieldData.subtype,
        firstItem: _.get(fieldData, 'properties.0'),
    });
    const cardinality = _.toUpper(fieldData.propCardinality) || 'SINGLE';

    const createScript = `${name} = mgmt.makePropertyKey('${name}').dataType(${dataType}).cardinality(org.janusgraph.core.Cardinality.${cardinality}).make()`;
    const ttlScript = getTTlScript(name, fieldData.propertyTTL);

    return [createScript, ttlScript].filter(Boolean).join('\n');
};

const getDataTypeClass = ({ type, mode, subtype, firstItem }) => {
    switch (type) {
        case 'string':
            return 'String.class';
        case 'boolean':
            return 'Boolean.class';
        case 'character':
            return 'Character.class';
        case 'date':
            return 'Date.class';
        case 'geoshape':
            return 'Geoshape.class';
        case 'number': {
            switch (mode) {
                case 'byte':
                    return 'Byte.class';
                case 'short':
                    return 'Short.class';
                case 'integer':
                    return 'Integer.class';
                case 'long':
                    return 'Long.class';
                case 'double':
                    return 'Double.class';
                case 'float':
                    return 'Float.class';
                default:
                    return 'Integer.class';
            }
        }
        case 'uuid':
            return 'UUID.class';
        case 'map':
            return 'HashMap.class';
        case 'set':
        case 'list':
            return getTypeFromSubtype(subtype, firstItem);
        default:
            return 'Object.class';
    }
};

const getTypeFromSubtype = (subType, firstItem) => {
    const itemType = /<(.*?)>/.exec(subType)[1];

    switch (itemType) {
        case 'str':
            return 'String[].class';
        case 'char':
            return 'Character[].class';
        case 'bool':
            return 'Boolean[].class';
        case 'number':
            switch (firstItem.mode) {
                case 'byte':
                    return 'Byte[].class';
                case 'short':
                    return 'Short[].class';
                case 'int':
                    return 'Integer[].class';
                case 'long':
                    return 'Long[].class';
                case 'double':
                    return 'Double[].class';
                case 'float':
                    return 'Float[].class';
                default:
                    return 'Integer[].class';
            }
        case 'date':
            return 'Date[].class';
        case 'uuid':
            return 'UUID[].class';
        case 'geoshape':
            return 'Geoshape[].class';
        case 'map':
            return 'HashMap[].class';
        case 'list':
        case 'set':
        default:
            return 'Object.class';
    }
};

module.exports = {
    generatePropertyKeys,
};
