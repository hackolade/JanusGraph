const { transformToValidGremlinName, DEFAULT_INDENT } = require('./common');
const { getGeoshapeSample } = require('./geoshapeHelper');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateGremlinDataSamples = ({ collections, relationships, jsonData, containerData, app }) => {
    setDependencies(app);

    const traversalSource = _.get(containerData, [0, 'traversalSource'], 'g');
    const graphName = transformToValidGremlinName(traversalSource);
    const parsedCollections = collections.map(JSON.parse);
    const parsedRelationships = relationships.map(JSON.parse);

    const variables = _.get(containerData, [0, 'graphVariables'], []);
    const variablesScript = generateVariables(variables);
    const verticesScript = generateVertices(parsedCollections, jsonData, graphName);
    const edgesScript = generateEdges(parsedCollections, parsedRelationships, jsonData, graphName);

    return [variablesScript, verticesScript, edgesScript, `${graphName}.tx().commit();`]
        .filter(Boolean)
        .join('\n\n\n');
};

const generateVariables = variables => {
    return variables.reduce((script, variable) => {
        const key = variable.graphVariableKey;
        const value = variable.GraphVariableValue || '';
        if (!key) {
            return script;
        }
        try {
            const parsedValue = JSON.parse(value);
            if (!_.isString(parsedValue)) {
                return script + `${graphName}.getGraph().variables().set("${key}", ${value});\n`;
            }

            return script + `${graphName}.getGraph().variables().set("${key}", "${value}");\n`;
        } catch (e) {
            return script + `${graphName}.getGraph().variables().set("${key}", "${value}");\n`;
        }
    }, '');
};

const generateVertex = (collection, vertexData, graphName) => {
    const vertexName = transformToValidGremlinName(collection.collectionName);
    const propertiesScript = addPropertiesScript(collection, vertexData, vertexName);

    return `${vertexName} = ${graphName}.getGraph().addVertex(${JSON.stringify(vertexName)});${propertiesScript}`;
};

const generateVertices = (collections, jsonData, graphName) => {
    const vertices = collections.map(collection => {
        const vertexData = JSON.parse(jsonData[collection.GUID]);

        return generateVertex(collection, vertexData, graphName);
    });

    const script = vertices.join('\n\n');
    if (!script) {
        return '';
    }

    return script;
};

const generateEdge = (from, to, relationship, edgeData, graphName) => {
    const edgeName = transformToValidGremlinName(relationship.name);
    const propertiesScript = addPropertiesScript(relationship, edgeData, edgeName);

    return `${edgeName} = ${from}.\n${DEFAULT_INDENT}addEdge(${JSON.stringify(edgeName)}, ${to});${propertiesScript}`;
};

const generateEdges = (collections, relationships, jsonData, graphName) => {
    const edges = relationships
        .reduce((edges, relationship) => {
            const parentCollection = collections.find(collection => collection.GUID === relationship.parentCollection);
            const childCollection = collections.find(collection => collection.GUID === relationship.childCollection);
            if (!parentCollection || !childCollection) {
                return edges;
            }
            const from = transformToValidGremlinName(parentCollection.collectionName);
            const to = transformToValidGremlinName(childCollection.collectionName);
            const edgeData = JSON.parse(jsonData[relationship.GUID]);

            return edges.concat(generateEdge(from, to, relationship, edgeData, graphName));
        }, [])
        .join('\n\n');

    if (_.isEmpty(edges)) {
        return '';
    }

    return edges;
};

const getDefaultMetaPropertyValue = type => {
    switch (type) {
        case 'map':
        case 'list':
            return '[]';
        case 'set':
            return '[]';
        case 'string':
            return '"Lorem"';
        case 'number':
            return '1';
        case 'date':
            return 'new Date()';
        case 'uuid':
            return 'UUID.randomUUID()';
        case 'boolean':
            return 'true';
    }

    return '"Lorem"';
};

const handleMetaProperties = metaProperties => {
    if (!metaProperties) {
        return '';
    }

    const metaPropertiesFlatList = metaProperties.reduce((list, property) => {
        if (!property.metaPropName) {
            return list;
        }

        const sample = _.isUndefined(property.metaPropSample)
            ? getDefaultMetaPropertyValue(property.metaPropType)
            : property.metaPropSample;

        return list.concat(JSON.stringify(property.metaPropName), sample);
    }, []);

    return metaPropertiesFlatList.join(', ');
};

const getChoices = item => {
    const availableChoices = ['oneOf', 'allOf', 'anyOf'];

    const choices = availableChoices.reduce((choices, choiceType) => {
        const choice = _.get(item, choiceType, []);
        if (_.isEmpty(choice)) {
            return choices;
        }

        return Object.assign({}, choices, {
            [choiceType]: {
                choice: _.get(item, choiceType, []),
                meta: _.get(item, `${choiceType}_meta`, {}),
            },
        });
    }, {});

    if (_.isEmpty(choices)) {
        return [];
    }

    const choicePropertiesData = Object.keys(choices).map(choiceType => {
        const choiceData = choices[choiceType];
        const index = _.get(choiceData, 'meta.index');

        return {
            properties: _.first(choiceData.choice).properties || {},
            index,
        };
    });

    const sortedChoices = choicePropertiesData.sort((a, b) => a.index - b.index);

    return sortedChoices.map((choiceData, index, choicesData) => {
        if (index === 0) {
            return choiceData;
        }

        const additionalPropertiesCount = choicesData.reduce((count, choiceData, choiceDataIndex) => {
            if (choiceDataIndex >= index) {
                return count;
            }

            return count + Object.keys(choiceData.properties).length - 1;
        }, 0);

        return {
            properties: choiceData.properties,
            index: choiceData.index + additionalPropertiesCount,
        };
    });
};

const resolveArrayChoices = (choices, items) => {
    if (_.isEmpty(choices)) {
        return items;
    }

    const choiceItems = choices.reduce((choiceItems, choice) => {
        const choiceProperties = _.get(choice, 'properties', {});

        return choiceItems.concat(Object.keys(choiceProperties).map(key => choiceProperties[key]));
    }, []);

    return [...items, ...choiceItems];
};

const resolveChoices = (choices, properties) => {
    if (_.isEmpty(choices)) {
        return properties;
    }

    return choices.reduce((sortedProperties, choiceData) => {
        const choiceProperties = choiceData.properties;
        const choicePropertiesIndex = choiceData.index;
        if (_.isEmpty(sortedProperties)) {
            return choiceProperties;
        }

        if (_.isUndefined(choicePropertiesIndex) || Object.keys(sortedProperties).length <= choicePropertiesIndex) {
            return Object.assign({}, sortedProperties, choiceProperties);
        }

        return Object.keys(sortedProperties).reduce((result, propertyKey, index) => {
            if (index !== choicePropertiesIndex) {
                return Object.assign({}, result, {
                    [propertyKey]: sortedProperties[propertyKey],
                });
            }

            return Object.assign({}, result, choiceProperties, {
                [propertyKey]: sortedProperties[propertyKey],
            });
        }, {});
    }, properties || {});
};

const addPropertiesScript = (collection, vertexData, itemName) => {
    const properties = _.get(collection, 'properties', {});

    const choices = getChoices(collection);
    const propertiesWithResolvedChoices = resolveChoices(choices, properties);

    if (_.isEmpty(propertiesWithResolvedChoices)) {
        return '';
    }

    return Object.keys(propertiesWithResolvedChoices).reduce((script, name) => {
        const property = propertiesWithResolvedChoices[name];
        const type = property.childType || property.type;
        let metaPropertiesScript = handleMetaProperties(property.metaProperties);
        if (!_.isEmpty(metaPropertiesScript)) {
            metaPropertiesScript = ', ' + metaPropertiesScript;
        }
        const valueScript = convertPropertyValue(property, 2, type, vertexData[name]);

        return (
            script +
            `\n${DEFAULT_INDENT}${itemName}.property(${JSON.stringify(name)}, ${valueScript}${metaPropertiesScript});`
        );
    }, '');
};

const isGraphSONType = type => ['map', 'set', 'list', 'date', 'uuid', 'number', 'geoshape'].includes(type);

const convertMap = (property, level, value) => {
    const choices = getChoices(property);
    const properties = resolveChoices(choices, _.get(property, 'properties', {}));

    const childProperties = Object.keys(properties).map(name => ({
        name,
        property: properties[name],
    }));
    const indent = _.range(0, level).reduce(indent => indent + DEFAULT_INDENT, '');
    const previousIndent = _.range(0, level - 1).reduce(indent => indent + DEFAULT_INDENT, '');

    let mapValue = childProperties.reduce((result, { name, property }) => {
        const childValue = value[name];
        const type = property.childType || property.type;

        return (
            result +
            `, \n${indent}${JSON.stringify(name)}: ${convertPropertyValue(property, level + 1, type, childValue)}`
        );
    }, '');

    if (mapValue.slice(0, 2) === ', ') {
        mapValue = mapValue.slice(2);
    }

    return `new HashMap([${mapValue}\n${previousIndent}])`;
};

const convertList = (property, level, value) => {
    let items = _.get(property, 'items', []);
    if (!_.isArray(items)) {
        items = [items];
    }

    const choices = getChoices(property);
    items = resolveArrayChoices(choices, items);

    let listValue = items.reduce((result, item, index) => {
        const childValue = value[index];
        const type = item.childType || item.type;

        return result + `, ${convertPropertyValue(item, level + 1, type, childValue)}`;
    }, '');

    if (listValue.slice(0, 2) === ', ') {
        listValue = listValue.slice(2);
    }

    return `[${listValue}]`;
};

const convertDate = value => `new java.text.SimpleDateFormat("yyyy-MM-dd").parse(${JSON.stringify(value)})`;

const convertUUID = value => `UUID.fromString(${JSON.stringify(value)})`;

const convertNumber = (property, value) => {
    const mode = property.mode;
    const numberValue = JSON.stringify(value);

    switch (mode) {
        case 'double':
            return `${numberValue}d`;
        case 'float':
            return `${numberValue}f`;
        case 'long':
            return `${numberValue}l`;
        case 'byte':
            return `(byte)${numberValue}`;
        case 'short':
            return `(short)${numberValue}`;
    }

    return numberValue;
};

const convertPropertyValue = (property, level, type, value) => {
    if (!isGraphSONType(type)) {
        return JSON.stringify(value);
    }

    switch (type) {
        case 'uuid':
            return convertUUID(value);
        case 'map':
            return convertMap(property, level, value);
        case 'set':
            return convertList(property, level, value);
        case 'list':
            return convertList(property, level, value);
        case 'date':
            return convertDate(value);
        case 'number':
            return convertNumber(property, value);
        case 'geoshape':
            return getGeoshapeSample(property, { lodash: _ });
    }

    return convertMap(property, level, value);
};

module.exports = {
    generateGremlinDataSamples,
};
