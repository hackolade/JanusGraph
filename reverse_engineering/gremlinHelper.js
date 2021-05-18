const _ = require('lodash');
let sshTunnel;
const fs = require('fs');
const ssh = require('tunnel-ssh');
const gremlin = require('gremlin');
const {
    getTTL,
    getKeyType,
    getPropertyData,
    getSSLConfig,
    getListSubtypeByItemType,
    prepareError,
} = require('./utils');
const { getSnippet } = require('./helpers/snippetHelper');

let client;
let state = {
    traversalSource: 'g',
    defaultCardinality: 'single',
};

const getSshConfig = info => {
    const config = {
        username: info.ssh_user,
        host: info.ssh_host,
        port: info.ssh_port,
        dstHost: info.host,
        dstPort: info.port,
        localHost: '127.0.0.1',
        localPort: info.port,
        keepAlive: true,
    };

    if (info.ssh_method === 'privateKey') {
        return Object.assign({}, config, {
            privateKey: fs.readFileSync(info.ssh_key_file),
            passphrase: info.ssh_key_passphrase,
        });
    } else {
        return Object.assign({}, config, {
            password: info.ssh_password,
        });
    }
};

const connectViaSsh = info =>
    new Promise((resolve, reject) => {
        ssh(getSshConfig(info), (err, tunnel) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    tunnel,
                    info: Object.assign({}, info, {
                        host: '127.0.0.1',
                    }),
                });
            }
        });
    });

const connect = info => {
    if (info.ssh) {
        return connectViaSsh(info).then(({ info, tunnel }) => {
            sshTunnel = tunnel;

            return connectToInstance(info);
        });
    } else {
        return connectToInstance(info);
    }
};

const connectToInstance = info => {
    return new Promise((resolve, reject) => {
        const host = info.host;
        const port = info.port;
        const username = info.username;
        const password = info.password;
        const traversalSource = info.traversalSource || 'g';
        const needSasl = username && password;
        const sslOptions = getSSLConfig(info);
        const protocol = _.isEmpty(sslOptions) ? 'ws' : 'wss';
        const authenticator = needSasl
            ? new gremlin.driver.auth.PlainTextSaslAuthenticator(username, password)
            : undefined;

        client = new gremlin.driver.Client(
            `${protocol}://${host}:${port}/gremlin`,
            Object.assign(
                {
                    pongTimeout: info.queryRequestTimeout,
                    pingTimeout: info.queryRequestTimeout,
                    authenticator,
                    traversalSource,
                },
                sslOptions
            )
        );

        client
            .open()
            .then(() => {
                state.traversalSource = traversalSource;
                resolve();
            })
            .catch(error => {
                reject(error);
            });
    });
};

const testConnection = () => {
    if (!client) {
        return Promise.reject('Connection error');
    }

    return client.submit(`${state.traversalSource}.V().next()`);
};

const close = () => {
    if (client) {
        client.close();
        client = null;
    }
    if (sshTunnel) {
        sshTunnel.close();
        sshTunnel = null;
    }
};

const getLabels = () => {
    return Promise.all([
        client.submit(
            `${state.traversalSource}.getGraph().openManagement().getVertexLabels().collect{label -> label.name()}`
        ),
        client.submit(`${state.traversalSource}. V().label().dedup().toList()`),
    ]).then(([labels1, labels2]) => _.concat(labels1.toArray(), labels2.toArray()));
};

const getRelationshipSchema =
    (logger, limit = 100) =>
    labels => {
        return Promise.all(
            labels.map(label => {
                let edgesData = [];

                const mapRelationship = relationship => ({
                    start: relationship.get('start'),
                    relationship: relationship.get('relationship'),
                    end: relationship.get('end'),
                    multiplicity: label.multiplicity,
                    biDirectional: label.biDirectional,
                    properties: label.properties,
                    ...(label.edgeTTL ? { edgeTTL: label.edgeTTL } : {}),
                });

                return client
                    .submit(
                        `${state.traversalSource}
                        .E()
                        .hasLabel('${label.name}')
                        .limit(${limit})
                        .collect{edgeLabel -> [
                            "relationship": '${label.name}',
                            "start": edgeLabel.getVertex(0).label(),
                            "end": edgeLabel.getVertex(1).label()
                        ]}
                        .toList()`
                    )
                    .then(dataEdges => {
                        edgesData = _.uniqWith(dataEdges.toArray().map(mapRelationship), _.isEqual);
                    })
                    .catch(error =>
                        logger.log('error', prepareError(error), 'Error while retrieving connections from data')
                    )
                    .then(() =>
                        client.submit(
                            `${state.traversalSource}.
						    getGraph().
						    openManagement().
						    getEdgeLabel('${label.name}').
						    mappedConnections().
                            inject([]) {accumulator, connection -> 
                                def currentConnection = [ 
                                    "relationship": '${label.name}', 
                                    "start": connection.getOutgoingVertexLabel().name(), 
                                    "end": connection.getIncomingVertexLabel().name() 
                                ]
                                def temp = accumulator.findAll {it -> it.start == currentConnection.start && it.end == currentConnection.end }.size
                                temp == 0 ? accumulator.add(currentConnection) : accumulator
                                accumulator
                            }.
						    toList()
                        `
                        )
                    )
                    .then(schemaEdges => {
                        const relationships = schemaEdges.toArray().map(mapRelationship);

                        return _.uniqWith(relationships.concat(edgesData), _.isEqual);
                    })
                    .catch(error => {
                        logger.log('error', prepareError(error), 'Error while retrieving connections with management');

                        return edgesData;
                    });
            })
        );
    };

const getDatabaseName = () => {
    return Promise.resolve(state.traversalSource);
};

const getItemProperties = propertiesMap => {
    return Array.from(propertiesMap).reduce((obj, [key, rawValue]) => {
        if (!_.isString(key)) {
            return obj;
        }

        const value = _.isArray(rawValue) ? _.first(rawValue) : rawValue;

        if (_.isMap(value)) {
            return Object.assign(obj, { [key]: handleMap(value) });
        }

        return Object.assign(obj, { [key]: value });
    }, {});
};

const handleMap = map => {
    return Array.from(map).reduce((obj, [key, value]) => {
        if (_.isMap(value)) {
            return Object.assign(obj, { [key]: handleMap(value) });
        }

        return Object.assign(obj, { [key]: value });
    }, {});
};

const getNodes = (label, limit = 100) => {
    return client
        .submit(`${state.traversalSource}.V().hasLabel('${label}').limit(${limit}).valueMap(true).toList()`)
        .then(res => res.toArray().map(getItemProperties));
};

const getRelationshipData = ({ start, relationship, end, limit = 100, propertyKeys, properties }) => {
    return client
        .submit(
            `${state.traversalSource}.E().hasLabel('${relationship}').where(and(
			outV().label().is(eq('${start}')),
			inV().label().is(eq('${end}')))
		).limit(${limit}).valueMap(true).toList()`
        )
        .then(relationshipData => relationshipData.toArray().map(getItemProperties))
        .then(documents =>
            getSchema({ gremlinElement: 'E', documents, label: relationship, limit, propertyKeys, properties })
        );
};

const getNodesCount = label => {
    return client.submit(`${state.traversalSource}.V().hasLabel('${label}').count().next()`).then(res => res.first());
};

const getCountRelationshipsData = (start, relationship, end) => {
    return client
        .submit(
            `${state.traversalSource}.E().hasLabel('${relationship}').where(and(
		outV().label().is(eq('${start}')),
		inV().label().is(eq('${end}')))
	).count().next()`
        )
        .then(data => data.toArray());
};

const getIndexes = () => {
    return Promise.all([
        client.submit(`
			${state.traversalSource}
				.getGraph()
				.openManagement()
				.getGraphIndexes(Vertex.class)
				.collect{element -> 
                    [element.name(), 
                        element, 
                        element.getFieldKeys().collect{field -> 
                            [field.name(),element.getParametersFor(field).collect{i -> [i.key(), i.value().toString()]}] 
                        }
                    ]
                };
			`),
        client.submit(`
			${state.traversalSource}
				.getGraph()
				.openManagement()
				.getGraphIndexes(Edge.class)
                .collect{element -> 
                    [element.name(), 
                        element, 
                        element.getFieldKeys().collect{field -> 
                            [field.name(),element.getParametersFor(field).collect{i -> [i.key(), i.value().toString()]}] 
                        }
                    ]
                };
			`),
        client.submit(`
			relationIndexes = [];

			${state.traversalSource}
				.getGraph()
				.openManagement()
				.getRelationTypes(RelationType.class)
				.eachWithIndex{rt, index -> relationIndexes[index] = g.getGraph().openManagement().getRelationIndexes(rt)};
				
			relationIndexes
				.findAll{item -> item.size() > 0}
				.inject([]){ temp, val -> temp.plus(val)}
				.collect{ri -> 
                    [ri.name(), 
                        ri.getType().name(), 
                        ri.getDirection(), 
                        ri.getSortKey()[0].name(),
                        ri.getSortOrder(), 
                        ri.getIndexStatus().name(),
                        ri.getSortKey().collect{key -> key.name()}
                    ]
                }; 
			`),
    ]).then(data => {
        const vertexIndexes = data[0].toArray();
        const edgeIndexes = data[1].toArray();
        const vertexCentricIndexesData = data[2].toArray();
        const indexes = vertexIndexes.concat(edgeIndexes).map(index => ({
            name: index[0],
            unique: index[1].unique,
            indexingBackend: index[1].backingIndex,
            indexKey: index[2].map(indexKey => ({ name: indexKey[0], properties: Object.fromEntries(indexKey[1]) })),
            compositeIndex: index[1].compositeIndex,
            mixedIndex: index[1].mixedIndex,
        }));
        const compositeIndexes = indexes
            .filter(index => index.compositeIndex)
            .map(index => ({
                name: index.name,
                unique: index.unique,
                indexKey: index.indexKey.map(({ name }) => ({ name })),
            }));

        const mixedIndexes = indexes
            .filter(index => index.mixedIndex)
            .map(index => ({
                name: index.name,
                indexingBackend: index.backingIndex,
                indexKey: index.indexKey.map(({ name, properties }) => ({ name, type: properties.mapping })),
            }));

        const vertexCentricIndexes = vertexCentricIndexesData.map(index => ({
            name: index[0],
            indexKey: index[6].map(keyName => ({ name: keyName, type: getKeyType(index[4]), entity: index[1] })),
            direction: index[2],
        }));

        return {
            compositeIndexes,
            mixedIndexes,
            vertexCentricIndexes,
        };
    });
};

const getFeatures = () =>
    client.submit(`${state.traversalSource}.getGraph().features()`).then(data => {
        const features = data.first();
        if (!_.isString(features)) {
            return '';
        }

        return features.slice('FEATURES '.length);
    });

const getVariables = () =>
    client.submit(`${state.traversalSource}.getGraph().variables().asMap()`).then(data => {
        const variablesMaps = data.toArray();
        const variables = variablesMaps.map(handleMap);
        const formattedVariables = variables.map(variableData => {
            const variable = _.first(Object.keys(variableData));
            const variableRawValue = variableData[variable];
            const variableValue = _.isString(variableRawValue)
                ? variableRawValue
                : JSON.stringify(variableData[variable]);

            return {
                graphVariableKey: variable,
                GraphVariableValue: variableValue,
            };
        });

        return formattedVariables;
    });

const convertRootPropertyValue = (cardinality, property) => {
    const value = property['@value'];
    if (property['@type'] !== 'g:List' || !_.isArray(value)) {
        return Object.assign({}, convertGraphSonToSchema(property), { propCardinality: cardinality });
    }

    return Object.assign({}, convertGraphSonToSchema(_.first(value)), { propCardinality: cardinality });
};

const convertRootGraphSON =
    (propertyKeys = {}, propertyNames = []) =>
    propertiesMap => {
        if (_.get(propertiesMap, '@type') !== 'g:Map') {
            return {};
        }

        const properties = propertiesMap['@value'];
        const { keys, values } = properties.reduce(
            ({ keys, values }, property, index) => {
                if (index % 2) {
                    const cardinality = state.defaultCardinality;
                    return { keys, values: [...values, convertRootPropertyValue(cardinality, property)] };
                }

                if (_.isObject(property)) {
                    return { keys, values };
                }

                return {
                    keys: [...keys, String(property)],
                    values,
                };
            },
            { keys: [], values: [] }
        );

        const propertiesDocument = _.concat(keys, propertyNames).reduce(
            (properties, key, index) => ({
                ...properties,
                [key]: mergePropertyKey(values[index] || {}, propertyKeys[key]),
            }),
            {}
        );

        return { properties: propertiesDocument };
    };

const mergePropertyKey = (propertyKeyLeft = {}, propertyKeyRight = {}) => {
    if (propertyKeyLeft.type === 'set') {
        const setSubtype = propertyKeyRight.subtype ? propertyKeyRight.subtype.replace('list', 'set') : '';

        return {
            ...propertyKeyLeft,
            ..._.omit(propertyKeyRight, 'type', 'subtype', 'mode'),
            ...(setSubtype && { setSubtype }),
        };
    }

    if (propertyKeyLeft.type !== propertyKeyRight.type) {
        return { ...propertyKeyLeft, ..._.omit(propertyKeyRight, 'type', 'subtype', 'mode', 'items') };
    }

    return { ...propertyKeyLeft, ...propertyKeyRight };
};

const mergeJsonSchemas = schemas => schemas.reduce(mergeSchemas, {});

const getMergedProperties = (a, b) => {
    if (_.isEmpty(a.properties) && _.isEmpty(b.properties)) {
        return {};
    }

    if (_.isEmpty(a.properties)) {
        a.properties = {};
    }

    if (_.isEmpty(b.properties)) {
        b.properties = {};
    }

    const allPropertiesKeys = _.uniq([...Object.keys(a.properties), ...Object.keys(b.properties)]);
    const mergedProperties = allPropertiesKeys.reduce((properties, key) => {
        const mergedValue = mergeSchemas(a.properties[key], b.properties[key]);

        return Object.assign({}, properties, {
            [key]: mergedValue,
        });
    }, {});

    return { properties: mergedProperties };
};

const getMergedItems = (a, b) => {
    if (_.isEmpty(a.items) && _.isEmpty(b.items)) {
        return {};
    }

    if (_.isEmpty(a.items)) {
        a.items = [];
    }

    if (_.isEmpty(b.items)) {
        b.items = [];
    }

    const mergedItems = _.uniqBy(a.items.concat(b.items), 'type');

    return { items: mergedItems };
};

const mergeSchemas = (a, b) => {
    if (_.isEmpty(a)) {
        a = {};
    }
    if (_.isEmpty(b)) {
        b = {};
    }

    if (a.type === 'geoshape' || b.type === 'geoshape') {
        return Object.assign({}, a, b);
    }

    const properties = getMergedProperties(a, b);
    const items = getMergedItems(a, b);

    const merged = Object.assign({}, a, b);

    return Object.assign({}, merged, items, properties);
};

const convertMetaPropertySample = sample => {
    if (_.isUndefined(sample)) {
        return '';
    }

    if (_.isString(sample)) {
        return sample;
    }

    return JSON.stringify(sample);
};

const convertMetaProperty = metaPropertyMap => {
    if (_.get(metaPropertyMap, '@type') !== 'g:Map') {
        return {};
    }

    const propertyData = metaPropertyMap['@value'];
    const propertyName = propertyData[1];
    const metaProperty = propertyData[3];
    if (_.get(metaProperty, '@type') !== 'g:Map') {
        return {};
    }
    const { keys, values, samples } = metaProperty['@value'].reduce(
        ({ keys, values, samples }, property, index) => {
            if (index % 2) {
                return {
                    keys,
                    values: [...values, convertGraphSonToSchema(property)],
                    samples: [...samples, convertMetaPropertySample(property['@value'])],
                };
            }

            if (_.isObject(property)) {
                return { key, values, samples };
            }

            return { keys: [...keys, property + ''], values, samples };
        },
        { keys: [], values: [], samples: [] }
    );

    const metaPropertiesTypes = values.map(value => value.type);
    const metaPropertiesData = keys.map((key, index) => ({
        metaPropName: key,
        metaPropType: metaPropertiesTypes[index] || 'map',
        metaPropSample: samples[index],
    }));

    return { [propertyName]: metaPropertiesData };
};

const addMetaProperties = (schema, metaProperties) => {
    const properties = schema.properties;
    const mergedMetaProperties = metaProperties.reduce((result, propertyData) => {
        const metaProperties = Object.keys(propertyData).reduce((result, key) => {
            const currentMetaProperties = _.get(result, key, []);
            return Object.assign({}, result, {
                [key]: currentMetaProperties.concat(propertyData[key]),
            });
        }, {});

        return _.merge({}, result, metaProperties);
    }, {});

    const updatedProperties = Object.keys(mergedMetaProperties).reduce((resultProperties, key) => {
        const metaPropertyData = mergedMetaProperties[key];
        if (_.isEmpty(metaPropertyData) || !resultProperties[key]) {
            return resultProperties;
        }

        if (resultProperties[key].type !== 'multi-property') {
            const currentMetaProperties = _.get(resultProperties[key], 'metaProperties', []);
            return Object.assign({}, resultProperties, {
                [key]: Object.assign({}, resultProperties[key], {
                    metaProperties: currentMetaProperties.concat(metaPropertyData),
                }),
            });
        }

        const multiProperties = _.get(resultProperties, [key, 'items'], []);
        if (_.isEmpty(multiProperties)) {
            return resultProperties;
        }

        const updatedItems = multiProperties.map(property => {
            const currentMetaProperties = _.get(property, 'metaProperties', []);

            return Object.assign({}, property, {
                metaProperties: currentMetaProperties.concat(metaPropertyData),
            });
        });

        return Object.assign({}, resultProperties, {
            [key]: Object.assign({}, resultProperties[key], {
                items: updatedItems,
            }),
        });
    }, properties);

    return Object.assign({}, schema, {
        properties: updatedProperties,
    });
};

const submitGraphSONDataScript = query => {
    return client.submit(
        `GraphSONMapper.
			build().
            typeInfo(org.apache.tinkerpop.gremlin.structure.io.graphson.TypeInfo.PARTIAL_TYPES).
            addCustomModule(org.apache.tinkerpop.gremlin.structure.io.graphson.GraphSONXModuleV2d0.build().create(false)).
			version(GraphSONVersion.V3_0).
			addRegistry(JanusGraphIoRegistry.instance()).
			create().
			createMapper().
			writeValueAsString(${query})`
    );
};

const getDataQuery = (element, label, limit) =>
    `${state.traversalSource}.${element}().hasLabel('${label}').limit(${limit}).valueMap().toList()`;

const getMetaPropertiesDataQuery = (label, limit) =>
    `${state.traversalSource}.
		V().
		hasLabel('${label}').
		limit(${limit}).
		properties().
		as('properties').
		as('metaProperties').
		select('properties','metaProperties').
		by(label).
		by(valueMap()).
		dedup().
		toList()`;

const getMetaPropertiesData = (element, label, limit) => {
    if (element !== 'V') {
        return Promise.resolve({
            first: () => ({}),
        });
    }

    return submitGraphSONDataScript(getMetaPropertiesDataQuery(label, limit));
};

const getSchema = ({ gremlinElement, documents, label, limit = 100, propertyKeys, properties }) => {
    return submitGraphSONDataScript(getDataQuery(gremlinElement, label, limit))
        .then(schemaData => {
            return getMetaPropertiesData(gremlinElement, label, limit).then(metaPropertiesData => {
                return client
                    .submit(
                        `${state.traversalSource}.${gremlinElement}().hasLabel('${label}').limit(${limit}).properties().order().by().label().dedup().toList()`
                    )
                    .then(templateData => ({
                        metaProperties: metaPropertiesData.first(),
                        documentsGraphSONSchema: schemaData.first(),
                        template: templateData.toArray(),
                    }))
                    .catch(error => ({
                        metaProperties: metaPropertiesData.first(),
                        documentsGraphSONSchema: schemaData.first(),
                        template: [],
                    }));
            });
        })
        .then(async ({ documentsGraphSONSchema, metaProperties, template }) => {
            try {
                const documentsSchema = JSON.parse(documentsGraphSONSchema)['@value'];
                const metaPropertiesMap = _.isString(metaProperties) ? JSON.parse(metaProperties)['@value'] : [];
                const documentsJsonSchemas = documentsSchema.map(convertRootGraphSON(propertyKeys, properties));
                const metaPropertiesByProperty = metaPropertiesMap.map(convertMetaProperty);
                const mergedJsonSchema = mergeJsonSchemas(documentsJsonSchemas);
                const jsonSchemaWithMetaProperties = addMetaProperties(mergedJsonSchema, metaPropertiesByProperty);

                return { documents, schema: jsonSchemaWithMetaProperties, template };
            } catch (e) {
                return { documents, schema: {}, template: [] };
            }
        });
};

const getType = rawType => {
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
        }
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
        const items = getItems(graphSON);
        const typeOfItems = items[0]?.type;

        return {
            type: 'list',
            subtype: getListSubtypeByItemType(typeOfItems),
            items,
        };
    }

    if (!_.isPlainObject(graphSON)) {
        return {
            type: typeof graphSON,
            sample: graphSON,
        };
    }

    const rawType = graphSON['@type'];
    const typeData = getType(rawType);
    const rawProperties = graphSON['@value'];

    if (typeData.type === 'geoshape') {
        return { ...typeData, ...getSnippet(rawProperties) };
    }

    if (rawType === 'g:Map') {
        const properties = groupPropertiesForMap(rawProperties);

        return { ...typeData, properties };
    }

    if (rawType === 'g:List' || rawType === 'g:Set') {
        const items = getItems(rawProperties);

        return { ...typeData, items };
    }

    return { ...typeData, sample: rawProperties };
};

const getRelationshipsLabels = () => {
    return client
        .submit(
            `${state.traversalSource}
			.getGraph()
			.openManagement()
			.getRelationTypes(EdgeLabel.class)
			.collect{relation -> [
				"name": relation.name(),
				"isUnidirected": relation.isUnidirected(),
				"multiplicity": relation.multiplicity().name(),
				"edgeTTL": relation.getTTL(),
				"properties": relation.mappedProperties().collect{item -> item.name()}
			]}`
        )
        .then(labels =>
            labels.toArray().map(edgeLabel => {
                const edgeTTL = getTTL(edgeLabel.get('edgeTTL'));

                return {
                    name: edgeLabel.get('name'),
                    biDirectional: !edgeLabel.get('isUnidirected'),
                    multiplicity: edgeLabel.get('multiplicity'),
                    properties: edgeLabel.get('properties'),
                    ...(edgeTTL ? { edgeTTL } : {}),
                };
            })
        );
};

const getPropertyKeys = () => {
    return client
        .submit(
            `${state.traversalSource}
			.getGraph()
			.openManagement()
			.getRelationTypes(PropertyKey.class)
			.collect{propertyKey -> [
				"name": propertyKey.name(),
				"cardinality": propertyKey.cardinality().convert(),
				"dataType": propertyKey.dataType(),
				"TTL": propertyKey.getTTL(),
			]}`
        )
        .then(propertyKeys =>
            Object.fromEntries(
                propertyKeys
                    .toArray()
                    .map(property => [
                        property.get('name'),
                        {
                            cardinality: property.get('cardinality'),
                            dataType: property.get('dataType'),
                            propertyTTL: getTTL(property.get('TTL')),
                        },
                    ])
                    .map(([key, value]) => [key, getPropertyData(value)])
            )
        );
};

const getVertexLabelData = name => {
    return client
        .submit(
            `vertexLabel = ${state.traversalSource}
				.getGraph()
				.openManagement()
				.getVertexLabel('${name}')

			[vertexLabel.isStatic(), vertexLabel.getTTL(), vertexLabel.mappedProperties().collect{item -> item.name()}]`
        )
        .then(vertexLabel => {
            const vertexData = vertexLabel.toArray();
            const vertexTTL = getTTL(vertexData[1]);

            return {
                entityLevel: {
                    staticVertex: vertexData[0],
                    ...(vertexTTL ? { vertexTTL } : {}),
                },
                properties: vertexLabel[2],
            };
        });
};

const getGraphSchema = () => {
    return client
        .submit(`${state.traversalSource}.getGraph().openManagement().printSchema()`)
        .then(schema => _.first(schema.toArray()));
};

module.exports = {
    connect,
    testConnection,
    close,
    getLabels,
    getRelationshipData,
    getRelationshipSchema,
    getDatabaseName,
    getNodes,
    getNodesCount,
    getCountRelationshipsData,
    getIndexes,
    getFeatures,
    getVariables,
    getSchema,
    getRelationshipsLabels,
    getPropertyKeys,
    getVertexLabelData,
    getGraphSchema,
};
