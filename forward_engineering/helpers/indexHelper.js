const { transformToValidGremlinName } = require('./common');
const _ = require('lodash');

const getGetEdgeScript = edgeName => `${edgeName} = mgmt.getEdgeLabel('${edgeName}')`;
const getGetVertexScript = vertexName => `${vertexName} = mgmt.getVertexLabel('${vertexName}')`;

const generateIndexes = ({
	compositeIndexes = [],
	mixedIndexes = [],
	vertexCentricIndexes = [],
	traversalSource,
	vertices,
	edges,
	entities,
}) => {
	const compositeIndexesScript = generateCompositeIndexesScript({
		compositeIndexes: filterInactiveIndexes(compositeIndexes),
		traversalSource,
		edges,
		vertices,
		entities,
	});
	const mixedIndexesScript = generateMixedIndexesScript(
		traversalSource,
		filterInactiveIndexes(mixedIndexes),
		entities,
	);
	const vertexCentricIndexesScript = generateVertexCentricIndexes(
		traversalSource,
		filterInactiveIndexes(vertexCentricIndexes),
		edges,
	);

	return [compositeIndexesScript, mixedIndexesScript, vertexCentricIndexesScript].join('\n\n');
};

const filterInactiveIndexes = indexes => {
	if (!Array.isArray(indexes)) {
		return [];
	}

	return indexes.filter(index => index.isActivated !== false);
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

			const addPropertiesScript = properties.map(property => `.addKey(${property})`).join('');
			const uniqueScript = compositeIndex.unique ? '.unique()' : '';
			const indexOnlyData = getIndexOnlyData({ compositeIndex, vertices, edges, firstIndexKey, isVertexIndex });
			const buildIndexScript = `mgmt.buildIndex('${compositeIndex.name}', ${
				isVertexIndex ? 'Vertex' : 'Edge'
			}.class)${addPropertiesScript}${uniqueScript}${indexOnlyData?.script || ''}.buildCompositeIndex()`;

			return buildIndexScript;
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

			const addPropertiesScript = properties
				.map(
					property =>
						`.addKey(${property.name}${
							property.type === 'TEXT' ? '' : `, Mapping.${property.type}.asParameter()`
						})`,
				)
				.join('');
			const buildIndexScript = `mgmt.buildIndex('${mixedIndex.name}', ${
				isVertexIndex ? 'Vertex' : 'Edge'
			}.class)${addPropertiesScript}.buildMixedIndex("${mixedIndexes.indexingBackend || 'search'}")`;

			return buildIndexScript;
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
			const directionScript = `Direction.${vertexCentricIndex.direction || 'BOTH'}`;
			const orderScript = vertexCentricIndex.order === 'descending' ? 'Order.desc' : 'Order.asc';
			const validEdgeName = transformToValidGremlinName(edgeName);

			const buildIndexScript = `mgmt.buildEdgeIndex(${validEdgeName}, '${
				vertexCentricIndex.name
			}', ${directionScript}, ${orderScript}, ${properties.join(', ')})`;

			return buildIndexScript;
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
