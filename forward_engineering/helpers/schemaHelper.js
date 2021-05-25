const { transformToValidGremlinName, DEFAULT_INDENT, setInManagement } = require('./common');
const { generateEdges } = require('./edgeLabelHelper');
const { generateIndexes } = require('./indexHelper');
const { generatePropertyKeys } = require('./propertyKeysHelper');
const { generateVertices } = require('./vertexLabelHelper');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateJanusGraphSchema = ({
    collections,
    relationships,
    containerData,
    app,
    modelDefinitions,
    entities,
    options,
}) => {
    setDependencies(app);

    const useConfiguredGraphFactory = options?.additionalOptions[0]?.value;
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

    const graphCreationScript = useConfiguredGraphFactory
        ? getGraphCreationScriptWithConfiguredGraphFactory(graphName, traversalSource, graphConfigurations)
        : getGraphCreationScriptWithJanusGraphFactory(graphName, traversalSource, graphConfigurations);
    const verticesScript = generateVertices({ collections: parsedCollections, app });
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
        [propertyKeysScript, verticesScript, edgesScript, indexesScript].join('\n\n\n')
    );

    return [graphCreationScript, getRollback(traversalSource), createItemsScript].join('\n\n\n').trim();
};

const getGraphCreationScriptWithConfiguredGraphFactory = (graphName, traversalSource, graphConfigurations = []) =>
    getGraphCreationScript({
        graphName,
        graphConfigurations,
        mapConfiguration: configuration =>
            `conf.put("${configuration.graphConfigurationKey}", "${configuration.graphConfigurationValue}");`,
        getConfigScript: configurations => `conf = new HashMap();\n${configurations}`,
        getCreateConfigurationScript: configurations =>
            `${configurations}\nConfiguredGraphFactory.createConfiguration(new MapConfiguration(conf));`,
        getCreateGraphScript: configurationScript =>
            `${configurationScript}\n${traversalSource} = ConfiguredGraphFactory.${
                _.isEmpty(configurationScript) ? 'create' : 'open'
            }("${graphName}").traversal();`,
    });

const getGraphCreationScriptWithJanusGraphFactory = (graphName, traversalSource, graphConfigurations = []) =>
    getGraphCreationScript({
        graphName,
        graphConfigurations,
        mapConfiguration: configuration =>
            `conf.setProperty("${configuration.graphConfigurationKey}", "${configuration.graphConfigurationValue}");`,
        getConfigScript: configurations => `conf = new BaseConfiguration();\n${configurations}`,
        getCreateConfigurationScript: configurations => `${configurations}`,
        getCreateGraphScript: configurationScript =>
            `${configurationScript}\n${traversalSource} = JanusGraphFactory.open(${
                _.isEmpty(configurationScript) ? `"${graphName}"` : 'conf'
            }).traversal();`,
    });

const getGraphCreationScript = ({
    graphName,
    graphConfigurations = [],
    mapConfiguration,
    getConfigScript,
    getCreateConfigurationScript,
    getCreateGraphScript,
}) => {
    const hasGraphNameConfiguration = graphConfigurations.find(
        item => item.graphConfigurationKey === 'graph.graphname'
    );
    const graphNameConfiguration = !hasGraphNameConfiguration
        ? [{ graphConfigurationKey: 'graph.graphname', graphConfigurationValue: graphName }]
        : [];

    const configurations = graphConfigurations.concat(graphNameConfiguration).map(mapConfiguration).join('\n');
    const configurationScript = getConfigScript(configurations);

    const createConfigurationScript = getCreateConfigurationScript(configurationScript);

    return getCreateGraphScript(_.isEmpty(graphConfigurations) ? '' : createConfigurationScript);
};

const getRollback = traversalSource => `${traversalSource}.tx().rollback()`;

module.exports = {
    generateJanusGraphSchema,
};
