const getVertexLabelsFromSchema = traversalSource =>
	`${traversalSource}.getGraph().openManagement().getVertexLabels().collect{label -> label.name()}`;

const getVertexLabelsFromData = traversalSource => `${traversalSource}. V().label().dedup().toList()`;

const getEdgesDataFromData = (traversalSource, edgeLabel, limit) =>
	`${traversalSource}.
    E().hasLabel('${edgeLabel}').
    limit(${limit}).
    collect{edgeLabel -> [
        "relationship": '${edgeLabel}',
        "start": edgeLabel.getVertex(0).label(),
        "end": edgeLabel.getVertex(1).label()
    ]}.
    toList()`;

const getEdgeDataFromSchema = (traversalSource, edgeLabel) =>
	`${traversalSource}.
    getGraph().
    openManagement().
    getEdgeLabel('${edgeLabel}').
    mappedConnections().
    inject([]) {accumulator, connection -> 
        def currentConnection = [ 
            "relationship": '${edgeLabel}', 
            "start": connection.getOutgoingVertexLabel().name(), 
            "end": connection.getIncomingVertexLabel().name() 
        ]
        def temp = accumulator.findAll {it -> it.start == currentConnection.start && it.end == currentConnection.end }.size
        temp == 0 ? accumulator.add(currentConnection) : accumulator
        accumulator
    }.
    toList()`;

const getNodesData = (traversalSource, label, limit) =>
	`${traversalSource}.V().hasLabel('${label}').limit(${limit}).valueMap(true).toList()`;

const getRelationshipDataScript = (traversalSource, relationship, start, end, limit) =>
	`${traversalSource}.E().hasLabel('${relationship}').where(and(
        outV().label().is(eq('${start}')),
        inV().label().is(eq('${end}')))
    ).limit(${limit}).valueMap(true).toList()`;

const getNodesCountScript = (traversalSource, label) => `${traversalSource}.V().hasLabel('${label}').count().next()`;

const getRelationshipsCountScript = (traversalSource, relationship, start, end) =>
	`${traversalSource}.E().hasLabel('${relationship}').where(and(
        outV().label().is(eq('${start}')),
        inV().label().is(eq('${end}')))
    ).count().next()`;

const getVertexIndexes = traversalSource =>
	`${traversalSource}.
    getGraph().
    openManagement().
    getGraphIndexes(Vertex.class).
    collect{element -> 
        [element.name(), 
            element, 
            element.getFieldKeys().collect{field -> 
                [field.name(),element.getParametersFor(field).collect{i -> [i.key(), i.value().toString()]}] 
            }
        ]
    };`;

const getEdgeIndexes = traversalSource =>
	`${traversalSource}.
	getGraph().
	openManagement().
	getGraphIndexes(Edge.class).
    collect{element -> 
        [element.name(), 
            element, 
            element.getFieldKeys().collect{field -> 
                [field.name(),element.getParametersFor(field).collect{i -> [i.key(), i.value().toString()]}] 
            }
        ]
    };`;

const getRelationIndexes = traversalSource =>
	`relationIndexes = [];

    ${traversalSource}.
        getGraph().
        openManagement().
        getRelationTypes(RelationType.class).
        eachWithIndex{rt, index -> relationIndexes[index] = g.getGraph().openManagement().getRelationIndexes(rt)};

    relationIndexes.
        findAll{item -> item.size() > 0}.
        inject([]){ temp, val -> temp.plus(val)}.
        collect{ri -> 
            [ri.name(), 
                ri.getType().name(), 
                ri.getDirection(), 
                ri.getSortKey()[0].name(),
                ri.getSortOrder(), 
                ri.getIndexStatus().name(),
                ri.getSortKey().collect{key -> key.name()}
            ]
        };`;

const getGraphFeatures = traversalSource => `${traversalSource}.getGraph().features()`;
const getGraphVariables = traversalSource => `${traversalSource}.getGraph().variables().asMap()`;

const wrapInGraphSONMapperScript = query =>
	`GraphSONMapper.
    	build().
        typeInfo(org.apache.tinkerpop.gremlin.structure.io.graphson.TypeInfo.PARTIAL_TYPES).
        addCustomModule(org.apache.tinkerpop.gremlin.structure.io.graphson.GraphSONXModuleV2d0.build().create(false)).
    	version(GraphSONVersion.V3_0).
    	addRegistry(JanusGraphIoRegistry.instance()).
    	create().
    	createMapper().
    	writeValueAsString(${query})`;

const getDataQuery = (traversalSource, element, label, limit) =>
	`${traversalSource}.${element}().hasLabel('${label}').limit(${limit}).valueMap().toList()`;

const getTemplateData = (traversalSource, element, label, limit) =>
	`${traversalSource}.${element}().hasLabel('${label}').limit(${limit}).properties().key().order().dedup().toList()`;

const getEdgeLabelsScript = traversalSource =>
	`${traversalSource}.
    getGraph().
    openManagement().
    getRelationTypes(EdgeLabel.class).
    collect{relation -> [
        "name": relation.name(),
        "isUnidirected": relation.isUnidirected(),
        "multiplicity": relation.multiplicity().name(),
        "edgeTTL": relation.getTTL(),
        "properties": relation.mappedProperties().collect{item -> item.name()}
    ]}`;

const getPropertyKeysScript = traversalSource =>
	`${traversalSource}.
    getGraph().
    openManagement().
    getRelationTypes(PropertyKey.class).
    collect{propertyKey -> [
        "name": propertyKey.name(),
        "cardinality": propertyKey.cardinality().convert(),
        "dataType": propertyKey.dataType(),
        "TTL": propertyKey.getTTL(),
    ]}`;

const getVertexLabelDataScript = (traversalSource, label) =>
	`vertexLabel = ${traversalSource}.
    getGraph().
    openManagement().
    getVertexLabel('${label}')

    [vertexLabel.isStatic(), vertexLabel.getTTL(), vertexLabel.mappedProperties().collect{item -> item.name()}]`;

const getGraphSchemaScript = traversalSource => `${traversalSource}.getGraph().openManagement().printSchema()`;

const getMetaPropertiesDataQuery = (traversalSource, label, limit) =>
	`${traversalSource}.
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

const checkGraphTraversalSourceScript = graphName =>
	`org.janusgraph.graphdb.management.JanusGraphManager.getInstance().getGraph('${graphName}').traversal().V().limit(1); 1`;

const getGraphTraversalSourceScript = graphName =>
	`org.janusgraph.graphdb.management.JanusGraphManager.getInstance().getGraph('${graphName}').traversal()`;

const checkGraphTraversalSourceScriptFromConfiguredGraphFactory = graphName =>
	`ConfiguredGraphFactory.open('${graphName}').traversal().V().limit(1); 1`;

const getGraphTraversalSourceScriptFromConfiguredGraphFactory = graphName =>
	`ConfiguredGraphFactory.open('${graphName}').traversal()`;

const getGraphConfigurations = traversalSource =>
	`cnfg = ${traversalSource}.getGraph().configuration();
    cnfg.getKeys().collect{item -> [item, cnfg.getProperty(item)]}`;

module.exports = {
	getVertexLabelsFromSchema,
	getVertexLabelsFromData,
	getEdgesDataFromData,
	getEdgeDataFromSchema,
	getNodesData,
	getRelationshipDataScript,
	getNodesCountScript,
	getRelationshipsCountScript,
	getVertexIndexes,
	getEdgeIndexes,
	getRelationIndexes,
	getGraphFeatures,
	getGraphVariables,
	wrapInGraphSONMapperScript,
	getDataQuery,
	getTemplateData,
	getEdgeLabelsScript,
	getPropertyKeysScript,
	getVertexLabelDataScript,
	getGraphSchemaScript,
	getMetaPropertiesDataQuery,
	checkGraphTraversalSourceScript,
	getGraphTraversalSourceScript,
	getGraphConfigurations,
	checkGraphTraversalSourceScriptFromConfiguredGraphFactory,
	getGraphTraversalSourceScriptFromConfiguredGraphFactory,
};
