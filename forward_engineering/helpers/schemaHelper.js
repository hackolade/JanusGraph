const { transformToValidGremlinName, DEFAULT_INDENT, setInManagement } = require('./common');
const { generateEdges } = require('./edgeLabelHelper');
const { generatePropertyKeys } = require('./propertyKeysHelper');
const { generateVertices } = require('./vertexLabelHelper');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateJanusGraphSchema = ({ collections, relationships, jsonData, containerData, app }) => {
    setDependencies(app);

    const containerTraversalSource = _.get(containerData, [0, 'traversalSource'], 'g');
    const traversalSource = transformToValidGremlinName(containerTraversalSource);

    const parsedCollections = collections.map(JSON.parse);
    const parsedRelationships = relationships.map(JSON.parse);

    const propertyKeysScript = generatePropertyKeys({
        collections: parsedCollections,
        relationships: parsedRelationships,
        traversalSource,
        app,
    });

    const verticesScript = generateVertices({ traversalSource, collections: parsedCollections, app });
    const edgesScript = generateEdges({ traversalSource, relationships: parsedRelationships, app });

    return [propertyKeysScript, verticesScript, edgesScript].join('\n\n');
};

module.exports = {
    generateJanusGraphSchema,
};
