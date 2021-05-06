const { setInManagement, transformToValidGremlinName } = require('./common');

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
    const dataType = getDataTypeClass(fieldData.childType || fieldData.type, fieldData.mode);
    const cardinality = _.toUpper(fieldData.propCardinality) || 'SINGLE';

    return `${name} = mgmt.makePropertyKey('${name}').dataType(${dataType}).cardinality(org.janusgraph.core.Cardinality.${cardinality}).make()`;
};

const getDataTypeClass = (dataType, mode) => {
    switch (dataType) {
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
        default:
            return 'Object.class';
    }
};

module.exports = {
    generatePropertyKeys,
};
