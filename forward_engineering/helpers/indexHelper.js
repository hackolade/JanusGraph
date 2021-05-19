const { setInManagement, transformToValidGremlinName, getPropertyKeyGetScript } = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const getRollback = traversalSource => `${traversalSource}.tx().rollback()`;
const getGetEdgeScript = edgeName => `${edgeName} = mgmt.getEdgeLabel('${edgeName}')`;
const getGetVertexScript = vertexName => `${vertexName} = mgmt.getVertexLabel('${vertexName}')`;
const getAwaitRelationIndexStatus = (traversalSource, indexName, itemName) =>
    `ManagementSystem.awaitRelationIndexStatus(${traversalSource}.getGraph(), '${indexName}', '${itemName}').call()`;
const getAwaitGraphIndexStatus = (traversalSource, indexName) =>
    `ManagementSystem.awaitGraphIndexStatus(${traversalSource}.getGraph(), '${indexName}').call()`;

const getReindexGraphIndex = (traversalSource, indexName) => `
mgmt = ${traversalSource}.getGraph().openManagement()
mgmt.updateIndex(mgmt.getGraphIndex("${indexName}"), SchemaAction.REINDEX).get()
mgmt.commit()`;

const getReindexRelationIndex = (traversalSource, indexName, edgeName) => `
mgmt = ${traversalSource}.getGraph().openManagement()
${getGetEdgeScript(edgeName)}
mgmt.updateIndex(mgmt.getRelationIndex(${edgeName}, '${indexName}'), SchemaAction.REINDEX).get()
mgmt.commit()`;

const generateIndexes = ({
    compositeIndexes = [],
    mixedIndexes = [],
    vertexCentricIndexes = [],
    traversalSource,
    app,
    vertices,
    edges,
    entities,
}) => {
    setDependencies(app);

    const compositeIndexesScript = generateCompositeIndexesScript({
        traversalSource,
        compositeIndexes,
        edges,
        vertices,
        entities,
    });
    const mixedIndexesScript = generateMixedIndexesScript(traversalSource, mixedIndexes, entities);
    const vertexCentricIndexesScript = generateVertexCentricIndexes(traversalSource, vertexCentricIndexes, edges);

    return [compositeIndexesScript, mixedIndexesScript, vertexCentricIndexesScript].join('\n\n');
};

const generateCompositeIndexesScript = ({ traversalSource, compositeIndexes, edges, vertices, entities }) => {
    return compositeIndexes
        .map(compositeIndex => {
            const firstIndexKey = _.get(compositeIndex, 'indexKey.0');
            if (!firstIndexKey) {
                return;
            }

            const isVertexIndex = entities.includes(firstIndexKey.path[0]);

            const properties = compositeIndex.indexKey.map(indexKey => transformToValidGremlinName(indexKey.name));
            const getPropertyKeysScript = properties.map(getPropertyKeyGetScript).join('\n');

            const addPropertiesScript = properties.map(property => `.addKey(${property})`).join('');
            const uniqueScript = compositeIndex.unique ? '.unique()' : '';
            const indexOnlyData = getIndexOnlyData({ compositeIndex, vertices, edges, firstIndexKey, isVertexIndex });
            const buildIndexScript = `mgmt.buildIndex('${compositeIndex.name}', ${
                isVertexIndex ? 'Vertex' : 'Edge'
            }.class)${addPropertiesScript}${uniqueScript}${indexOnlyData?.script || ''}.buildCompositeIndex()`;

            const createIndexScript = [getPropertyKeysScript, indexOnlyData?.getItemScript, buildIndexScript]
                .filter(Boolean)
                .join('\n');

            return [
                getRollback(traversalSource),
                setInManagement(traversalSource, createIndexScript),
                getAwaitGraphIndexStatus(traversalSource, compositeIndex.name),
                getReindexGraphIndex(traversalSource, compositeIndex.name),
            ].join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
};

const generateMixedIndexesScript = (traversalSource, mixedIndexes, entities) => {
    return mixedIndexes
        .map(mixedIndex => {
            const firstIndexKey = _.get(mixedIndex, 'indexKey.0');
            if (!firstIndexKey) {
                return;
            }

            const isVertexIndex = entities.includes(firstIndexKey.path[0]);

            const properties = mixedIndex.indexKey.map(indexKey => ({
                name: transformToValidGremlinName(indexKey.name),
                type: indexKey.type || 'TEXT',
            }));
            const getPropertyKeysScript = properties
                .map(property => property.name)
                .map(getPropertyKeyGetScript)
                .join('\n');

            const addPropertiesScript = properties
                .map(
                    property =>
                        `.addKey(${property.name}${
                            property.type === 'TEXT' ? '' : `, Mapping.${property.type}.asParameter()`
                        })`
                )
                .join('');
            const buildIndexScript = `mgmt.buildIndex('${mixedIndex.name}', ${
                isVertexIndex ? 'Vertex' : 'Edge'
            }.class)${addPropertiesScript}.buildMixedIndex("${mixedIndexes.indexingBackend || 'search'}")`;

            const createIndexScript = [getPropertyKeysScript, buildIndexScript].join('\n');

            return [
                getRollback(traversalSource),
                setInManagement(traversalSource, createIndexScript),
                getAwaitGraphIndexStatus(traversalSource, mixedIndex.name),
                getReindexGraphIndex(traversalSource, mixedIndex.name),
            ].join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
};

const generateVertexCentricIndexes = (traversalSource, vertexCentricIndexes, edges = []) => {
    return vertexCentricIndexes
        .map(vertexCentricIndex => {
            const firstIndexKey = _.get(vertexCentricIndex, 'indexKey.0');

            if (!firstIndexKey) {
                return;
            }

            const edgeName = edges.find(edge => edge.GUID === firstIndexKey.path[0])?.name;

            if (!edgeName) {
                return;
            }

            const properties = vertexCentricIndex.indexKey.map(indexKey => transformToValidGremlinName(indexKey.name));
            const getPropertyKeysScript = properties.map(getPropertyKeyGetScript).join('\n');
            const directionScript = `Direction.${vertexCentricIndex.direction || 'BOTH'}`;
            const orderScript = vertexCentricIndex.order === 'descending' ? 'Order.desc' : 'Order.asc';
            const getEdgeScript = getGetEdgeScript(edgeName);
            const validEdgeName = transformToValidGremlinName(edgeName);

            const buildIndexScript = `mgmt.buildEdgeIndex(${validEdgeName}, '${
                vertexCentricIndex.name
            }', ${directionScript}, ${orderScript}, ${properties.join(', ')})`;

            const createIndexScript = [getPropertyKeysScript, getEdgeScript, buildIndexScript].join('\n');

            return [
                getRollback(traversalSource),
                setInManagement(traversalSource, createIndexScript),
                getAwaitRelationIndexStatus(traversalSource, vertexCentricIndex.name, edgeName),
                getReindexRelationIndex(traversalSource, vertexCentricIndex.name, edgeName),
            ].join('\n');
        })
        .filter(Boolean)
        .join('\n\n');
};

const getIndexOnlyData = ({ compositeIndex, vertices, edges, firstIndexKey, isVertexIndex }) => {
    if (!compositeIndex.indexOnly) {
        return {};
    }

    return isVertexIndex
        ? getIndexOnlyVertexScript({ vertices, firstIndexKey })
        : getIndexOnlyEdgeScript({ edges, firstIndexKey });
};

const getIndexOnlyVertexScript = ({ vertices, firstIndexKey }) =>
    getIndexOnlyScript({ items: vertices, firstIndexKey, getGetItemScript: getGetVertexScript });

const getIndexOnlyEdgeScript = ({ edges, firstIndexKey }) =>
    getIndexOnlyScript({ items: edges, firstIndexKey, getGetItemScript: getGetEdgeScript });

const getIndexOnlyScript = ({ items, firstIndexKey, getGetItemScript }) => {
    const item = items.find(vertex => vertex.GUID === firstIndexKey.path[0]);
    const itemName = transformToValidGremlinName(item.code || item.name);
    const getItemScript = getGetItemScript(itemName);

    return { getItemScript, script: `.indexOnly(${itemName})` };
};

module.exports = {
    generateIndexes,
};
