const { setCommonDependencies } = require('./helpers/common');
const { generateGremlinDataSamples } = require('./helpers/sampleDataHelper');
const { generateJanusGraphSchema } = require('./helpers/schemaHelper');

module.exports = {
    generateContainerScript(data, logger, cb, app) {
        try {
            logger.clear();
            setCommonDependencies(app);

            const insertSamplesOption =
                (data.options?.additionalOptions || []).find(option => option.id === 'INCLUDE_SAMPLES') || {};
            const withSamples = data.options.origin !== 'ui';

            const schemaScript = generateJanusGraphSchema({ ...data, app });

            if (withSamples || !insertSamplesOption.value) {
                return cb(null, schemaScript);
            }

            const sampleScript = generateGremlinDataSamples({ ...data, app });

            cb(null, [
                { title: 'JanusGraph schema', script: schemaScript },
                {
                    title: 'Sample data',
                    script: sampleScript,
                },
            ]);
        } catch (e) {
            logger.log('error', { message: e.message, stack: e.stack }, 'Forward-Engineering Error');

            setTimeout(() => cb({ message: e.message, stack: e.stack }), 150);
        }
    },
};
