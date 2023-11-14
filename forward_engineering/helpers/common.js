const _ = require('lodash');

const DEFAULT_INDENT = '    ';
const NEW_LINE_DOUBLE_INDENT = `\n${DEFAULT_INDENT}${DEFAULT_INDENT}`;

const transformToValidGremlinName = name => {
	const DEFAULT_NAME = 'New_vertex';
	const DEFAULT_PREFIX = 'v_';

	if (!name || !_.isString(name)) {
		return DEFAULT_NAME;
	}

	const nameWithoutSpecialCharacters = name.replace(/[\s`~!@#%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, '_');
	const startsFromDigit = nameWithoutSpecialCharacters.match(/^[0-9].*$/);

	if (startsFromDigit) {
		return `${DEFAULT_PREFIX}_${nameWithoutSpecialCharacters}`;
	}

	return nameWithoutSpecialCharacters;
};

const getManagement = traversalSource => `mgmt = ${traversalSource}.getGraph().openManagement()`;
const getCommitManagement = () => `mgmt.commit()`;
const setInManagement = (traversalSource, script) =>
	`${getManagement(traversalSource)}\n${script}\n${getCommitManagement()}`;

const getTTlScript = (vertexName, TTL) => {
	if (!TTL || !TTL?.TTLValue || TTL?.TTLValue <= 0) {
		return '';
	}

	const ttlUnit = getTTLUnit(TTL.TTLUnit);
	const ttlValue = TTL.TTLValue;

	return `mgmt.setTTL(${vertexName}, Duration.${ttlUnit}(${ttlValue}))`;
};

const getTTLUnit = ttlUnit => {
	switch (ttlUnit) {
		case 'Days':
			return 'ofDays';
		case 'Hours':
			return 'ofHours';
		case 'Minutes':
			return 'ofMinutes';
		default:
			return 'ofSeconds';
	}
};

const getItemPropertyKeys = (itemName, properties = []) =>
	properties.length === 0 ? '' : `mgmt.addProperties(${itemName}, ${properties.join(', ')})`;

const getPropertyKeyGetScript = propertyName => `${propertyName} = mgmt.getPropertyKey('${propertyName}')`;

module.exports = {
	transformToValidGremlinName,
	setInManagement,
	getTTlScript,
	getItemPropertyKeys,
	getPropertyKeyGetScript,
	DEFAULT_INDENT,
	NEW_LINE_DOUBLE_INDENT,
};
