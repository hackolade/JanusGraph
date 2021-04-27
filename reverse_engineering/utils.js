const fs = require('fs');

const getKeyType = (type = '') => {
    if (type.toLowerCase() === 'desc') {
        return 'descending';
    }

    return 'ascending';
};

const getTTL = (ttl = 0) => {
    if (ttl === 0) {
        return null;
    }

    return {
        TTLValue: ttl,
        TTLUnit: 'Seconds',
    };
};

const getPropertyData = property => {
    return { ...getType(property.dataType), propCardinality: property.cardinality };
};

const getType = propertyType => {
    switch (propertyType) {
        case 'java.lang.String':
            return { type: 'character' };
        case 'java.lang.Character':
            return { type: 'string' };
        case 'java.lang.Boolean':
            return { type: 'boolean' };
        case 'java.lang.Byte':
            return { type: 'number', mode: 'byte' };
        case 'java.lang.Short':
            return { type: 'number', mode: 'short' };
        case 'java.lang.Integer':
            return { type: 'number', mode: 'integer' };
        case 'java.lang.Long':
            return { type: 'number', mode: 'long' };
        case 'java.lang.Float':
            return { type: 'number', mode: 'float' };
        case 'java.lang.Double':
            return { type: 'number', mode: 'double' };
        case 'java.util.Date':
            return { type: 'number', mode: 'date' };
        //TODO: add geoshape
        // case 'org.janusgraph.core.attribute.Geoshape':
        //     return { type: 'geoshape' };
        case 'java.util.UUID':
            return { type: 'uuid' };
        default:
            return { type: 'string' };
    }
};

const getSSLConfig = info => {
    let config = {
        rejectUnauthorized: false,
    };

    switch (info.sslType) {
        case 'TRUST_ALL_CERTIFICATES':
        case 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES':
            return config;
        case 'TRUST_CUSTOM_CA_SIGNED_CERTIFICATES': {
            const cert = fs.readFileSync(info.certAuthority, 'utf8');
            config.ca = [cert];
            return config;
        }
        case 'TRUST_SERVER_CLIENT_CERTIFICATES': {
            const pfx = fs.readFileSync(info.pfx);
            const cert = fs.readFileSync(info.certAuthority, 'utf8');
            config.ca = [cert];
            config.pfx = pfx;
            return config;
        }
        case 'Off':
        default:
            return {};
    }
};

module.exports = {
    getKeyType,
    getTTL,
    getPropertyData,
    getSSLConfig,
};
