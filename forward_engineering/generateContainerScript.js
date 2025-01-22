const { generateGremlinDataSamples } = require('./helpers/sampleDataHelper');
const { generateJanusGraphSchema } = require('./helpers/schemaHelper');

function generateContainerScript(data, logger, cb, app) {
	try {
		logger.clear();

		const insertSamplesOption =
			(data.options?.additionalOptions || []).find(option => option.id === 'INCLUDE_SAMPLES') || {};
		const withSamples = data.options.origin !== 'ui';

		const schemaScript = generateJanusGraphSchema({ ...data, app });
		const sampleScript = generateGremlinDataSamples({ ...data, app });

		if (withSamples || !insertSamplesOption.value) {
			return cb(null, `${schemaScript}\n\n${sampleScript}`);
		}

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
}

module.exports = {
	generateContainerScript,
};
