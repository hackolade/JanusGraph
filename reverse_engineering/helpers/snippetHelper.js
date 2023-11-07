const _ = require('lodash');

const getSnippet = properties => {
	if (isPointSnippet(properties)) {
		return getPointSnippet(properties);
	}

	const geometryData = properties?.geometry ? convertGraphSonToSchema(properties?.geometry) : properties;

	if (isCircleSnippet(geometryData)) {
		return getCircleSnippet(geometryData);
	}

	if (isPolygon(geometryData)) {
		return getPolygonSnippet(geometryData);
	}

	if (isLine(geometryData)) {
		return getLineSnippet(geometryData);
	}

	if (isMultiPoint(geometryData)) {
		return getMultiPointSnippet(geometryData);
	}

	if (isMultiLineString(geometryData)) {
		return getMultiLineString(geometryData);
	}

	if (isMultiPolygon(geometryData)) {
		return getMultiPolygon(geometryData);
	}

	if (isGeometryCollection(geometryData)) {
		return getGeometryCollection(geometryData);
	}

	return getDefaultSnippet();
};

const isPointSnippet = properties =>
	(properties?.coordinates?.length === 2 && _.isUndefined(properties.type)) || properties.type === 'Point';
const isCircleSnippet = geometryData => geometryData.type === 'Circle';
const isPolygon = geometryData => geometryData.type === 'Polygon';
const isLine = geometryData => geometryData.type === 'LineString';
const isMultiPoint = geometryData => geometryData.type === 'MultiPoint';
const isMultiLineString = geometryData => geometryData.type === 'MultiLineString';
const isMultiPolygon = geometryData => geometryData.type === 'MultiPolygon';
const isGeometryCollection = geometryData => geometryData.type === 'GeometryCollection';

const getPointSnippet = properties => ({
	subType: 'point',
	properties: {
		coordinates: {
			type: 'array',
			items: getCoordinates(properties.coordinates),
		},
	},
});

const getCircleSnippet = geometryData => ({
	subType: 'circle',
	properties: {
		radius: {
			mode: 'double',
			type: 'number',
			sample: geometryData.radius,
		},
		coordinates: {
			type: 'array',
			items: getCoordinates(geometryData.coordinates),
		},
	},
});

const getPolygonSnippet = geometryData => ({
	subType: 'polygon',
	properties: {
		coordinates: {
			type: 'array',
			properties: geometryData.coordinates.map(polygon => ({
				type: 'array',
				items: polygon.map(point => ({ type: 'array', items: getCoordinates(point) })),
			})),
		},
	},
});

const getLineSnippet = geometryData => ({
	subType: 'line',
	properties: {
		coordinates: {
			type: 'array',
			items: geometryData.coordinates.map(point => ({
				type: 'array',
				items: getCoordinates(point),
			})),
		},
	},
});

const getMultiPointSnippet = geometryData => ({
	subType: 'multipoint',
	properties: {
		coordinates: {
			type: 'array',
			items: geometryData.coordinates.map(point => ({
				type: 'array',
				items: getCoordinates(point),
			})),
		},
	},
});

const getMultiLineString = geometryData => ({
	subType: 'multilinestring',
	properties: {
		coordinates: {
			type: 'array',
			items: geometryData.coordinates.map(points => ({
				type: 'array',
				items: points.map(point => ({ type: 'array', items: getCoordinates(point) })),
			})),
		},
	},
});

const getMultiPolygon = geometryData => ({
	subType: 'multipolygon',
	properties: {
		coordinates: {
			type: 'array',
			items: geometryData.coordinates.map(polygonData => ({
				type: 'array',
				items: polygonData.map(polygon => ({
					type: 'array',
					items: polygon.map(point => ({ type: 'array', items: getCoordinates(point) })),
				})),
			})),
		},
	},
});

const getGeometryCollection = geometryData => ({
	subType: 'geometrycollection',
	properties: {
		geometries: {
			type: 'array',
			items: geometryData.geometries.map(geometry => ({
				type: 'geoshape',
				...getSnippet(geometry),
			})),
		},
	},
});

const getCoordinates = coordinates =>
	coordinates.map(coordinate => ({
		type: 'number',
		mode: 'double',
		sample: coordinate,
	}));

const getDefaultSnippet = () => {
	return {
		subType: 'wkt',
		properties: [
			{
				name: 'WKT',
				type: 'string',
			},
		],
	};
};

const groupPropertiesForMap = properties => {
	const { keys, values } = properties.reduce(
		({ keys, values }, property, index) => {
			if (index % 2) {
				return { keys, values: [...values, convertGraphSonToSchema(property)] };
			}

			return { keys: [...keys, property + ''], values };
		},
		{
			keys: [],
			values: [],
		},
	);

	return keys.reduce((properties, key, index) => {
		return Object.assign({}, properties, {
			[key]: values[index] || {},
		});
	}, {});
};

const getItems = properties => properties.map(convertGraphSonToSchema);

const convertGraphSonToSchema = graphSON => {
	if (_.isArray(graphSON)) {
		return getItems(graphSON);
	}

	if (!_.isPlainObject(graphSON)) {
		return graphSON;
	}

	const rawType = graphSON['@type'];
	const rawProperties = graphSON['@value'];

	if (rawType === 'g:Map') {
		return groupPropertiesForMap(rawProperties);
	}

	if (rawType === 'g:List' || rawType === 'g:Set') {
		return getItems(rawProperties);
	}

	return rawProperties;
};

module.exports = {
	getDefaultSnippet,
	getSnippet,
};
