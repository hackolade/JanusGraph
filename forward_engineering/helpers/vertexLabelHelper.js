const {
    transformToValidGremlinName,
    getTTlScript,
    getItemPropertyKeys,
} = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateVertices = ({ collections, app }) => {
    setDependencies(app);

    const vertices = collections.map(getVertexScript).join('\n\n');

    return vertices;
};

const getVertexScript = collection => {
    const vertexName = getVertexName(collection);
    const staticScript = getStaticScript(collection);
    const properties = _.keys(collection.properties).map(transformToValidGremlinName);

    const propertyKeys = getItemPropertyKeys(vertexName, properties);

    const createVertexScript = `${vertexName} = mgmt.makeVertexLabel('${vertexName}')${staticScript}.make()`;
    const ttlScript = collection.staticVertex ? getTTlScript(vertexName, collection.vertexTTL) : '';

    return [createVertexScript, ttlScript, propertyKeys].filter(Boolean).join('\n');
};

const getStaticScript = collection => (collection.staticVertex ? '.setStatic()' : '');

const getVertexName = collection => transformToValidGremlinName(collection.collectionName || collection.code);

module.exports = {
    generateVertices,
};
