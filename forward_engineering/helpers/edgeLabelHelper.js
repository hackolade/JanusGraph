const { transformToValidGremlinName, getTTlScript, getPropertyKeyGetScript, getItemPropertyKeys, setInManagement } = require('./common');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

const generateEdges = ({ traversalSource, relationships, app }) => {
    setDependencies(app);

    const edges = relationships.map(getEdgeLabelScript(traversalSource)).join('\n\n');

    return edges;
};

const getEdgeLabelScript = traversalSource => relationship => {
    const name = transformToValidGremlinName(relationship.name);
    const multiplicity = relationship.multiplicity || 'MULTI';
    const unidirectedScript = getUnidirectedScript(relationship);
    const properties = _.keys(relationship.properties).map(transformToValidGremlinName);

    const getPropertyKeysScript = properties.map(getPropertyKeyGetScript).join('\n');
    const propertyKeys = getItemPropertyKeys(name, properties);

    const createEdgeScript = `${name} = mgmt.makeEdgeLabel('${name}').multiplicity(${multiplicity})${unidirectedScript}.make()`;
    const edgeTTL = getTTlScript(name, relationship.edgeTTL);

    const edgeLabelScript = [createEdgeScript, edgeTTL, getPropertyKeysScript, propertyKeys].filter(Boolean).join('\n');

    return setInManagement(traversalSource, edgeLabelScript);
};

const getUnidirectedScript = relationship => (relationship.biDirectional ? '' : '.unidirected()');

module.exports = {
    generateEdges,
};
