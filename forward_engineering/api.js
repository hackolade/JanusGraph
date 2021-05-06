const { generateGremlinDataSamples } = require("./helpers/sampleDataHelper");

module.exports = {
    generateContainerScript(data, logger, cb, app) {
        logger.clear();
        try {
            const sampleScript = generateGremlinDataSamples({ ...data, app });

            cb(null, [
                { title: 'JanusGraph schema', script: '' },
                {
                    title: 'Sample data',
                    script: sampleScript,
                },
            ]);
        } catch (e) {
            logger.log('error', { message: e.message, stack: e.stack }, 'Forward-Engineering Error');
            setTimeout(() => {
                cb({ message: e.message, stack: e.stack });
            }, 150);
            return;
        }
    },
};
