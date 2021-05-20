const { transformToValidGremlinName, DEFAULT_INDENT, setInManagement } = require('./common');
const { generateEdges } = require('./edgeLabelHelper');
const { generateIndexes } = require('./indexHelper');
const { generatePropertyKeys } = require('./propertyKeysHelper');
const { generateVertices } = require('./vertexLabelHelper');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateJanusGraphSchema = ({ collections, relationships, containerData, app, modelDefinitions, entities }) => {
    setDependencies(app);

    const graphName = containerData[0].code || containerData[0].name;
    const containerTraversalSource = _.get(containerData, [0, 'traversalSource'], 'g');
    const graphConfigurations = _.get(containerData, [0, 'graphConfigurations'], []);
    const traversalSource = transformToValidGremlinName(containerTraversalSource);

    const parsedCollections = collections.map(JSON.parse);
    const parsedRelationships = relationships.map(JSON.parse);

    const parsedModelDefinitions = JSON.parse(modelDefinitions);

    const propertyKeysScript = generatePropertyKeys({
        collections: parsedCollections,
        relationships: parsedRelationships,
        modelDefinitions: parsedModelDefinitions,
        traversalSource,
        app,
    });

    const graphCreationScript = getGraphCreationScript(graphName, traversalSource, graphConfigurations);
    const verticesScript = generateVertices({ traversalSource, collections: parsedCollections, app });
    const edgesScript = generateEdges({ vertices: parsedCollections, relationships: parsedRelationships, app });
    const indexesScript = generateIndexes({
        ...containerData[1],
        traversalSource,
        app,
        entities,
        vertices: parsedCollections,
        edges: parsedRelationships,
    });

    const createItemsScript = setInManagement(
        traversalSource,
        [propertyKeysScript, verticesScript, edgesScript].join('\n\n\n')
    );

    return [graphCreationScript, createItemsScript, indexesScript].join('\n\n\n').trim();
};

const getGraphCreationScript = (graphName, traversalSource, graphConfigurations) => {
    if (_.isEmpty(graphConfigurations)) {
        return `${graphName} = ConfiguredGraphFactory.create("${graphName}");\n${traversalSource} = ${graphName}.traversal();`;
    }

    const configurations = graphConfigurations
        .map(config => `map.put("${config.graphConfigurationKey}", "${config.graphConfigurationValue}");`)
        .join('\n');
    const configurationMapScript = `map = new HashMap();\n${configurations}`;

    const configurationScript = `${configurationMapScript}\nConfiguredGraphFactory.createConfiguration(new MapConfiguration(map));`;

    return `${configurationScript}\n${graphName} = ConfiguredGraphFactory.create("${graphName}");\n${traversalSource} = ${graphName}.traversal();`;
};

module.exports = {
    generateJanusGraphSchema,
};
