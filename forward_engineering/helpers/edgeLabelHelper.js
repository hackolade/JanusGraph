const { transformToValidGremlinName, getTTlScript, getItemPropertyKeys } = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateEdges = ({ traversalSource, relationships, app }) => {
    setDependencies(app);

    return _.uniqBy(relationships, relationship => relationship.name)
        .map(getEdgeLabelScript(traversalSource))
        .join('\n\n');
};

const getEdgeLabelScript = traversalSource => relationship => {
    const name = transformToValidGremlinName(relationship.name);
    const multiplicity = relationship.multiplicity || 'MULTI';
    const unidirectedScript = getUnidirectedScript(relationship);
    const properties = _.keys(relationship.properties).map(transformToValidGremlinName);

    const propertyKeys = getItemPropertyKeys(name, properties);

    const createEdgeScript = `${name} = mgmt.makeEdgeLabel('${name}').multiplicity(${multiplicity})${unidirectedScript}.make()`;
    const edgeTTL = getTTlScript(name, relationship.edgeTTL);

    return [createEdgeScript, edgeTTL, propertyKeys].filter(Boolean).join('\n');
};

const getUnidirectedScript = relationship => (relationship.biDirectional ? '' : '.unidirected()');

module.exports = {
    generateEdges,
};
