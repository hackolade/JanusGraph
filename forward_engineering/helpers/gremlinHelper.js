const fs = require('fs');
const ssh = require('../../reverse_engineering/node_modules/tunnel-ssh');
const gremlin = require('../../reverse_engineering/node_modules/gremlin');

let _ = null;
const setDependencies = app => (_ = app.require('lodash'));

let client;
let sshTunnel;
let traversalSource;

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

const connect = (info, app) => {
    setDependencies(app);

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
        const traversalSourceItem = info.traversalSource || 'g';
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
                    authenticator,
                    traversalSource,
                },
                sslOptions
            )
        );

        client
            .open()
            .then(() => {
                traversalSource = traversalSourceItem;
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

    return client.submit(`${traversalSource}.V().next()`);
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

const applyToInstance = script => client.submit(script);

module.exports = {
    connect,
    testConnection,
    applyToInstance,
    close,
};
