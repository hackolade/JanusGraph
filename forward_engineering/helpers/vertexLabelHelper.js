const {
    transformToValidGremlinName,
    getTTlScript,
    getItemPropertyKeys,
    getPropertyKeyGetScript,
    setInManagement,
} = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateVertices = ({ traversalSource, collections, app }) => {
    setDependencies(app);

    const vertices = collections.map(getVertexScript(traversalSource)).join('\n\n');

    return vertices;
};

const getVertexScript = traversalSource => collection => {
    const vertexName = getVertexName(collection);
    const staticScript = getStaticScript(collection);
    const properties = _.keys(collection.properties).map(transformToValidGremlinName);

    const getPropertyKeysScript = properties.map(getPropertyKeyGetScript).join('\n');
    const propertyKeys = getItemPropertyKeys(vertexName, properties);

    const createVertexScript = `${vertexName} = mgmt.makeVertexLabel('${vertexName}')${staticScript}.make()`;
    const ttlScript = getTTlScript(vertexName, collection.vertexTTL);

    const vertexScript = [createVertexScript, ttlScript, getPropertyKeysScript, propertyKeys]
        .filter(Boolean)
        .join('\n');

    return setInManagement(traversalSource, vertexScript);
};

const getStaticScript = collection => (collection.staticVertex ? '.setStatic()' : '');

const getVertexName = collection => transformToValidGremlinName(collection.collectionName || collection.code);

module.exports = {
    generateVertices,
};
