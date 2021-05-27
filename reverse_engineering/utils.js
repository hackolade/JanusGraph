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
    return {
        ...getType(property.dataType),
        ...(property.propertyTTL && { propertyTTL: property.propertyTTL }),
        propCardinality: property.cardinality,
    };
};

const getType = propertyType => {
    switch (propertyType) {
        case 'java.lang.String':
            return { type: 'string' };
        case 'java.lang.Character':
            return { type: 'character' };
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
        case 'org.janusgraph.core.attribute.Geoshape':
            return { type: 'geoshape' };
        case 'java.util.UUID':
            return { type: 'uuid' };
        case 'java.util.HashMap':
            return { type: 'map' };
        case '[Ljava.lang.String':
            return { type: 'list', subtype: 'list<str>' };
        case '[Ljava.lang.Character':
            return { type: 'list', subtype: 'list<char>' };
        case '[Ljava.lang.Short':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('short') };
        case '[Ljava.util.Date':
            return { type: 'list', subtype: 'list<date>' };
        case '[Ljava.util.UUID':
            return { type: 'list', subtype: 'list<uuid>' };
        case '[F':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('float') };
        case '[I':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('integer') };
        case '[J':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('long') };
        case '[D':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('double') };
        case '[B':
            return { type: 'list', subtype: 'list<number>', items: getListNumberProperties('byte') };
        case '[Z':
            return { type: 'list', subtype: 'list<bool>' };
        case 'java.lang.Object':
            return { type: 'map' };
        default:
            return { type: 'map' };
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

const getListNumberProperties = mode => [{ type: 'number', mode }];

const getListSubtypeByItemType = itemType => `list<${itemType}>`;

const prepareError = error => {
    return {
        message: error.message,
        stack: error.stack,
    };
};

const getDataType = rawType => {
    switch (rawType) {
        case 'g:List':
            return { type: 'list' };
        case 'g:Map':
            return { type: 'map' };
        case 'g:Set':
            return { type: 'set' };
        case 'g:Double':
            return { type: 'number', mode: 'double' };
        case 'g:Int32':
            return { type: 'number', mode: 'integer' };
        case 'g:Int64':
            return { type: 'number', mode: 'long' };
        case 'g:Float':
            return { type: 'number', mode: 'float' };
        case 'g:Date':
            return { type: 'date' };
        case 'g:UUID':
            return { type: 'uuid' };
        case 'janusgraph:Geoshape':
            return { type: 'geoshape' };
        case 'gx:Char':
            return { type: 'char' };
        case 'gx:Byte':
            return { type: 'number', mode: 'byte' };
        case 'gx:Int16':
            return { type: 'number', mode: 'short' };
        default: {
            return { type: 'string' };
        }
    }
};

module.exports = {
    getKeyType,
    getTTL,
    getPropertyData,
    getSSLConfig,
    getListSubtypeByItemType,
    prepareError,
    getDataType,
};
