const { DEFAULT_INDENT, NEW_LINE_DOUBLE_INDENT } = require('./common');

let _ = null;
const setDependencies = dependencies => (_ = dependencies.lodash);

const getGeoshapeSample = (field, dependencies) => {
	setDependencies(dependencies);
	switch (field.subType) {
		case 'point':
			return getPoint(field);
		case 'box':
			return getBox(field);
		case 'circle':
			return getCircle(field);
		case 'line':
			return getLine(field);
		case 'polygon':
			return getPolygon(field);
		case 'multipoint':
			return getMultiPoint(field);
		case 'multilinestring':
			return getMultiLineString(field);
		case 'multipolygon':
			return getMultiPolygon(field);
		case 'geometrycollection':
			return getGeometryCollection(field);
		case 'wkt':
		default:
			return getWKT(field);
	}
};

const getWKT = field => {
	const sample =
		_.get(field, 'WKT.sample') ||
		_.get(field, 'WKT.enum.0') ||
		'POLYGON ((35.4 48.9, 35.6 48.9, 35.6 49.1, 35.4 49.1, 35.4 48.9))';

	return `Geoshape.fromWkt("${sample}")`;
};

const getPoint = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items?.slice(0, 2);

	if (createGeoshapeItem) {
		return `Geoshape.point(${getCoordinates(coordinates)})`;
	}

	return `Geoshape.getShapeFactory().pointXY(${getCoordinates(coordinates)})`;
};

const getBox = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items?.slice(0, 4);

	if (createGeoshapeItem) {
		return `Geoshape.box(${getCoordinates(coordinates)})`;
	}

	return `Geoshape.getShapeFactory().rect(${getCoordinates(coordinates)})`;
};

const getCircle = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items?.slice(0, 2);
	const radius = field.properties?.radius;

	if (createGeoshapeItem) {
		return `Geoshape.circle(${getCoordinates(coordinates)}, ${getNumberSample(radius)})`;
	}

	return `Geoshape.getShapeFactory().circle(${getCoordinates(
		coordinates,
	)},org.locationtech.spatial4j.distance.DistanceUtils.dist2Degrees(${getNumberSample(
		radius,
	)},org.locationtech.spatial4j.distance.DistanceUtils.EARTH_MEAN_RADIUS_KM))`;
};

const getLine = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items || [];

	if (createGeoshapeItem) {
		const coordinatesData = coordinates.map(coordinates => `(double[])[${getCoordinates(coordinates?.items)}]`);
		return `Geoshape.line([${coordinatesData}].asList())`;
	}

	const coordinatesData = coordinates
		.map(coordinates => `pointXY(${getCoordinates(coordinates?.items)})`)
		.join(`.${NEW_LINE_DOUBLE_INDENT}${DEFAULT_INDENT}`);
	return `Geoshape.getShapeFactory().lineString().${NEW_LINE_DOUBLE_INDENT}${DEFAULT_INDENT}${coordinatesData}`;
};

const getPolygon = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items || [];

	if (!createGeoshapeItem) {
		const polygons = coordinates
			.map(
				polygon =>
					`${polygon?.items
						?.map(coordinates => `pointXY(${getCoordinates(coordinates?.items)})`)
						.join(`.${NEW_LINE_DOUBLE_INDENT}${DEFAULT_INDENT}`)}`,
			)
			.join(`.${NEW_LINE_DOUBLE_INDENT}${DEFAULT_INDENT}`);

		return `Geoshape.getShapeFactory().polygon().${NEW_LINE_DOUBLE_INDENT}${DEFAULT_INDENT}${polygons}`;
	}

	if (coordinates.length === 1 || _.isPlainObject(coordinates)) {
		const polygon = _.isPlainObject(coordinates) ? coordinates : coordinates[0];
		const coordinatesData = polygon?.items?.map(coordinates => `(double[])[${getCoordinates(coordinates?.items)}]`);

		return `Geoshape.polygon([${coordinatesData}].asList())`;
	}

	const polygons = coordinates
		.map(
			polygon =>
				`(${polygon?.items
					?.map(coordinates => `${getCoordinates(coordinates?.items).split(',').join(' ')}`)
					.join(',')})`,
		)
		.join(',');

	return `Geoshape.fromWkt("POLYGON (${polygons})")`;
};

const getMultiPoint = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items || [];
	const points = coordinates.map(point => `pointXY(${getCoordinates(point?.items)})`).join('.');

	if (createGeoshapeItem) {
		return `Geoshape.geoshape(Geoshape.getShapeFactory().multiPoint().${points}.build())`;
	}

	return `Geoshape.getShapeFactory().multiPoint().${points}.build()`;
};

const getMultiLineString = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items || [];
	const lines = coordinates
		.map(
			line =>
				`add(Geoshape.getShapeFactory().lineString().${line.items
					.map(point => `pointXY(${getCoordinates(point?.items)})`)
					.join('.')})`,
		)
		.join(`.${NEW_LINE_DOUBLE_INDENT}`);

	if (createGeoshapeItem) {
		return `Geoshape.geoshape(Geoshape.getShapeFactory().multiLineString().${NEW_LINE_DOUBLE_INDENT}${lines}.build())`;
	}

	return `Geoshape.getShapeFactory().multiLineString().${NEW_LINE_DOUBLE_INDENT}${lines}.build()`;
};

const getMultiPolygon = (field, createGeoshapeItem = true) => {
	const coordinates = field.properties?.coordinates?.items || [];

	const getPolygon = polygon => {
		const firstPolygon = getItems(polygon.items)[0];
		const polygonCoordinates = getItems(firstPolygon.items);

		return polygonCoordinates.map(point => `pointXY(${getCoordinates(point?.items)})`).join('.');
	};
	const polygons = coordinates
		.map(polygon => `add(Geoshape.getShapeFactory().polygon().${getPolygon(polygon)})`)
		.join(`.${NEW_LINE_DOUBLE_INDENT}`);

	if (createGeoshapeItem) {
		return `Geoshape.geoshape(Geoshape.getShapeFactory().multiPolygon().${NEW_LINE_DOUBLE_INDENT}${polygons}.build())`;
	}

	return `Geoshape.getShapeFactory().multiPolygon().${NEW_LINE_DOUBLE_INDENT}${polygons}`;
};

const getGeometryCollection = field => {
	const geometries = getItems(field.properties?.geometries?.items || []);

	const setInAddStatement = script => `add(${script})`;

	const geometriesString = geometries
		.map(geometry => {
			switch (geometry.subType) {
				case 'point':
					return setInAddStatement(getPoint(geometry, false));
				case 'box':
					return setInAddStatement(getBox(geometry, false));
				case 'circle':
					return setInAddStatement(getCircle(geometry, false));
				case 'line':
					return setInAddStatement(getLine(geometry, false));
				case 'polygon':
					return setInAddStatement(getPolygon(geometry, false));
				case 'multipoint':
					return setInAddStatement(getMultiPoint(geometry, false));
				case 'multilinestring':
					return setInAddStatement(getMultiLineString(geometry, false));
				case 'multipolygon':
					return setInAddStatement(getMultiPolygon(geometry, false));
			}
		})
		.filter(Boolean)
		.join(`.${NEW_LINE_DOUBLE_INDENT}`);

	return `Geoshape.geoshape(Geoshape.getGeometryCollectionBuilder().${NEW_LINE_DOUBLE_INDENT}${geometriesString}.build())`;
};

const getItems = items => {
	if (_.isPlainObject(items)) {
		return [items];
	}

	return items;
};

const getCoordinates = coordinates => coordinates?.map(getNumberSample).join(',');

const getNumberSample = coordinate => coordinate?.sample || coordinate?.default || _.get(coordinate, 'enum.0') || 37.97;

module.exports = {
	getGeoshapeSample,
};
