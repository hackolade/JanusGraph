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
    isUpdateScript = false,
}) => {
    setDependencies(app);

    const useConfiguredGraphFactory = containerData[0]?.graphFactory === 'ConfiguredGraphFactory';
    const schemaDefault = containerData[0]?.schemaDefault;
    const schemaConstraints = containerData[0]?.schemaConstraints;
    const useConfiguration = containerData[0]?.useConfiguration;
    const graphName = transformToValidGremlinName(containerData[0]?.code || containerData[0]?.name || 'graph');
    const containerTraversalSource = _.get(containerData, [0, 'traversalSource'], 'g');
    const graphConfigurations = useConfiguration
        ? prepareGraphConfigurations(
              graphName,
              _.get(containerData, [0, 'graphConfigurations'], []),
              schemaDefault,
              schemaConstraints
          )
        : [];
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

    const graphCreationScript = getGraphScript({
        graphName,
        traversalSource,
        graphConfigurations,
        isUpdateScript,
        useConfiguredGraphFactory,
    });
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
        [propertyKeysScript, verticesScript, edgesScript, indexesScript].filter(Boolean).join('\n\n\n')
    );

    return [graphCreationScript, getRollback(traversalSource), createItemsScript].filter(Boolean).join('\n\n\n').trim();
};

const getGraphScript = ({
    graphName,
    traversalSource,
    graphConfigurations,
    isUpdateScript,
    useConfiguredGraphFactory,
}) => {
    if (isUpdateScript) {
        return useConfiguredGraphFactory
            ? openConfiguredGraphFactory(graphName, traversalSource)
            : openJanusGraphFactoryGraph(graphName, traversalSource);
    }

    return useConfiguredGraphFactory
        ? getGraphCreationScriptWithConfiguredGraphFactory({
              graphName,
              traversalSource,
              graphConfigurations,
          })
        : getGraphCreationScriptWithJanusGraphFactory({
              graphName,
              traversalSource,
              graphConfigurations,
          });
};

const prepareGraphConfigurations = (
    graphName,
    graphConfigurations,
    schemaDefault = 'default',
    schemaConstraints = false
) => {
    const hasGraphNameConfiguration = graphConfigurations.find(
        item => item.graphConfigurationKey === 'graph.graphname'
    );
    const graphNameConfiguration = !hasGraphNameConfiguration
        ? [{ graphConfigurationKey: 'graph.graphname', graphConfigurationValue: graphName }]
        : [];

    const schemaDefaultConfiguration = [
        { graphConfigurationKey: 'schema.default', graphConfigurationValue: schemaDefault },
    ];
    const schemaConstraintsConfiguration = schemaConstraints
        ? [{ graphConfigurationKey: 'schema.constraints', graphConfigurationValue: true }]
        : [];

    return _.uniqBy(
        graphConfigurations
            .concat(graphNameConfiguration)
            .concat(schemaDefaultConfiguration)
            .concat(schemaConstraintsConfiguration),
        item => item.graphConfigurationKey
    );
};

const openJanusGraphFactoryGraph = (graphName, traversalSource) => `${traversalSource} = ${graphName}.traversal()`;
const openConfiguredGraphFactory = (graphName, traversalSource) =>
    `${traversalSource} = ConfiguredGraphFactory.open("${graphName}").traversal()`;

const getGraphCreationScriptWithConfiguredGraphFactory = ({ graphName, traversalSource, graphConfigurations = [] }) =>
    getGraphCreationScript({
        graphConfigurations,
        mapConfiguration: configuration =>
            `conf.put("${configuration.graphConfigurationKey}", "${configuration.graphConfigurationValue}");`,
        getConfigScript: configurations => `conf = new HashMap();\n${configurations}`,
        getCreateConfigurationScript: configurations =>
            `${configurations}\nConfiguredGraphFactory.createConfiguration(new MapConfiguration(conf));`,
        getCreateGraphScript: configurationScript =>
            `${
                _.isEmpty(graphConfigurations) ? '' : configurationScript
            }\n${traversalSource} = ConfiguredGraphFactory.create("${graphName}").traversal();`,
    });

const getGraphCreationScriptWithJanusGraphFactory = ({ graphName, traversalSource, graphConfigurations = [] }) =>
    getGraphCreationScript({
        graphConfigurations,
        mapConfiguration: configuration =>
            `conf.setProperty("${configuration.graphConfigurationKey}", "${configuration.graphConfigurationValue}");`,
        getConfigScript: configurations => `conf = new BaseConfiguration();\n${configurations}`,
        getCreateConfigurationScript: configurations => `${configurations}`,
        getCreateGraphScript: configurationScript =>
            `${configurationScript}\n${traversalSource} = JanusGraphFactory.open(conf).traversal();`,
    });

const getGraphCreationScript = ({
    graphConfigurations = [],
    mapConfiguration,
    getConfigScript,
    getCreateConfigurationScript,
    getCreateGraphScript,
}) => {
    const configurations = graphConfigurations.map(mapConfiguration).join('\n');
    const configurationScript = getConfigScript(configurations);

    const createConfigurationScript = getCreateConfigurationScript(configurationScript);

    return getCreateGraphScript(createConfigurationScript);
};

const getRollback = traversalSource => `${traversalSource}.tx().rollback()`;

module.exports = {
    generateJanusGraphSchema,
};
