const { transformToValidGremlinName, getTTlScript, getItemPropertyKeys } = require('./common');
const _ = require('lodash');

const generateEdges = ({ relationships, vertices }) => {
	return _.uniqBy(relationships, relationship => relationship.name)
		.map(getEdgeLabelScript(vertices))
		.join('\n\n');
};

const getEdgeLabelScript = vertices => relationship => {
	const name = transformToValidGremlinName(relationship.name);

	const multiplicity = _.get(relationship, 'customProperties.multiplicity', 'MULTI');
	const unidirectedScript = getUnidirectedScript(relationship);
	const properties = _.keys(relationship.properties).map(transformToValidGremlinName);

	const propertyKeys = getItemPropertyKeys(name, properties);

	const createEdgeScript = `${name} = mgmt.makeEdgeLabel('${name}').multiplicity(${multiplicity})${unidirectedScript}.make()`;
	const edgeTTL = getTTlScript(name, relationship.edgeTTL);
	const toVertex = vertices.find(vertex => vertex.GUID === relationship.childCollection);
	const fromVertex = vertices.find(vertex => vertex.GUID === relationship.parentCollection);

	if (!toVertex || !fromVertex) {
		return '';
	}

	const fromVertexName = transformToValidGremlinName(fromVertex.code || fromVertex.collectionName);
	const toVertexName = transformToValidGremlinName(toVertex.code || toVertex.collectionName);
	const connectionScript = `mgmt.addConnection(${name}, ${fromVertexName}, ${toVertexName})`;

	return [createEdgeScript, edgeTTL, propertyKeys, connectionScript].filter(Boolean).join('\n');
};

const getUnidirectedScript = relationship => (relationship.biDirectional ? '' : '.unidirected()');

module.exports = {
	generateEdges,
};
