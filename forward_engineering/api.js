const { generateGremlinDataSamples } = require('./helpers/sampleDataHelper');
const { generateJanusGraphSchema } = require('./helpers/schemaHelper');
const gremlinHelper = require('../reverse_engineering/gremlinHelper');

module.exports = {
	generateContainerScript(data, logger, cb, app) {
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
	},

	applyToInstance(connectionInfo, logger, callback, app) {
		const sshService = app.require('@hackolade/ssh-service');

		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);

		const script = connectionInfo.script;

		gremlinHelper
			.connect(connectionInfo, logger, sshService)
			.then(() => gremlinHelper.applyToInstance(script))
			.then(() => callback())
			.catch(error => {
				let preparedError = prepareError(error);

				if (/No such property:/.test(error.message) || /Backend shorthand unknown/.test(error.message)) {
					preparedError = {
						message: 'Graph with such name does not exists',
						originalMessage: error.message,
						stack: error.stack,
					};
				} else if (/Adding this property for key(.*?)violates a uniqueness constraint/.test(error.message)) {
					preparedError = {
						message:
							'Graph with such constraints already exists or you use storage.directory of another graph',
						originalMessage: error.message,
						stack: error.stack,
					};
				}

				logger.log('error', preparedError);
				callback(preparedError);
			});
	},

	testConnection(connectionInfo, logger, callback, app) {
		const sshService = app.require('@hackolade/ssh-service');
		gremlinHelper
			.connect(connectionInfo, logger, sshService)
			.then(() => {
				gremlinHelper
					.testConnection()
					.then(() => gremlinHelper.close(sshService))
					.then(() => callback())
					.catch(async error => {
						await gremlinHelper.close(sshService);
						logger.log('error', prepareError(error));

						callback({ message: 'Connection error', stack: error.stack });
					});
			})
			.catch(error => callback({ message: 'Connection error', stack: error.stack }));
	},
};

const prepareError = error => {
	return {
		message: error.message,
		stack: error.stack,
	};
};
