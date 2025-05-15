const { generateGremlinDataSamples } = require('./helpers/sampleDataHelper');
const { generateJanusGraphSchema } = require('./helpers/schemaHelper');
const gremlinHelper = require('../reverse_engineering/gremlinHelper');
const { generateContainerScript } = require('./generateContainerScript');

module.exports = {
	generateContainerScript,

	applyToInstance(connectionInfo, logger, callback, app) {
		const sshService = app.require('@hackolade/ssh-service');
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
