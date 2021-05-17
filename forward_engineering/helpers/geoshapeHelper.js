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
            //TODO: add valid handling of geometryCollection
            return `Geoshape.fromWkt("GEOMETRYCOLLECTION (POINT (40 10), LINESTRING (10 10, 20 20, 10 40), POLYGON ((40 40, 20 45, 45 30, 40 40)))")`;
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

const getPoint = field => {
    const coordinates = field.properties?.coordinates?.items?.slice(0, 2);

    return `Geoshape.box(${getCoordinates(coordinates)})`;
};

const getBox = field => {
    const coordinates = field.properties?.coordinates?.items?.slice(0, 4);

    return `Geoshape.box(${getCoordinates(coordinates)})`;
};

const getCircle = field => {
    const coordinates = field.properties?.coordinates?.items?.slice(0, 2);
    const radius = field.properties?.radius;

    return `Geoshape.circle(${getCoordinates(coordinates)}, ${getNumberSample(radius)})`;
};

const getLine = field => {
    const coordinates = field.properties?.coordinates?.items || [];
    const coordinatesData = coordinates.map(coordinates => `(double[])[${getCoordinates(coordinates?.items)}]`);

    return `Geoshape.line([${coordinatesData}].asList())`;
};

const getPolygon = field => {
    const coordinates = field.properties?.coordinates?.items || [];
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
                    .join(',')})`
        )
        .join(',');

    return `Geoshape.fromWkt("(${polygons})")`;
};

const getMultiPoint = field => {
    const coordinates = field.properties?.coordinates?.items || [];
    const points = coordinates.map(point => `pointXY(${getCoordinates(point?.items)})`).join('.');

    return `Geoshape.geoshape(Geoshape.getShapeFactory().multiPoint().${points}.build())`;
};

const getMultiLineString = field => {
    const coordinates = field.properties?.coordinates?.items || [];
    const lines = coordinates
        .map(
            line =>
                `add(Geoshape.getShapeFactory().lineString().${line.items
                    .map(point => `pointXY(${getCoordinates(point?.items)})`)
                    .join('.')})`
        )
        .join('.');

    return `Geoshape.geoshape(Geoshape.getShapeFactory().multiLineString().${lines}.build())`;
};

const getMultiPolygon = field => {
    const coordinates = field.properties?.coordinates?.items || [];

    const getPolygon = polygon => {
        const firstPolygon = getItems(polygon.items)[0];
        const polygonCoordinates = getItems(firstPolygon.items);

        return polygonCoordinates.map(point => `pointXY(${getCoordinates(point?.items)})`).join('.');
    };
    const polygons = coordinates
        .map(polygon => `add(Geoshape.getShapeFactory().polygon().${getPolygon(polygon)})`)
        .join('.');

    return `Geoshape.geoshape(Geoshape.getShapeFactory().multiPolygon().${polygons}.build())`;
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
