const mqtt = require('mqtt');

// const mqttBrokerUrl = 'mqtt://vpc-sz-jx';
// const mqttBrokerUrl = 'mqtt://pc-scada-pro';
// const gatewaySN = 'GW678';

const devices = new Map();
const collections = new Map();
const tagDefinitions = new Map();
const tagValues = new Map();

module.exports = function (RED) {
    function GatewayNode(config) {
        RED.nodes.createNode(this, config);
        this.mqttBrokerUrl = config.mqttBrokerUrl;
        this.sn = config.sn;
        this.account = config.sn;
        this.password = config.sn;

        const gatewayNode = this;
        gatewayNode.on('input', msg => {
            if (msg.topic === 'tag-value') {
                const tagId = msg.payload.id;
                const tagValue = msg.payload.value;
                tagValues.set(tagId, tagValue);
                // connectMqttBroker(gatewayNode).then((client) => {
                //     sendValues(gatewayNode, client);
                // });
            } else if (msg.topic === 'tag-definition') {
                const tagDefinition = msg.payload;

                if (!devices.has(tagDefinition.device)) {
                    const device = RED.nodes.getNode(tagDefinition.device);
                    devices.set(device.id, {
                        deviceNodeId: tagDefinition.device,
                        deviceSN: device.deviceSN,
                        protocol: device.protocol,
                        ip: device.ip,
                        port: device.port,
                        slaveAddress: device.slaveAddress,
                        endian: device.endian
                    });
                }

                if (!collections.has(tagDefinition.collection)) {
                    const collection = RED.nodes.getNode(tagDefinition.collection);
                    collections.set(collection.id, {
                        deviceNodeId: tagDefinition.device,
                        collectionNodeId: tagDefinition.collection,
                        id: collection.uuid,
                        name: collection.name,
                        sampleRate: collection.sampleRate,
                        publishInterval: collection.publishInterval
                    });
                }

                const tagId = msg.payload.id;
                tagDefinitions.set(tagId, {
                    deviceNodeId: tagDefinition.device,
                    collectionNodeId: tagDefinition.collection,
                    tagNodeId: tagId,
                    ...tagDefinition
                });

                connectMqttBroker(gatewayNode).then((client) => {
                    sendConfigurations(gatewayNode, client);
                });
            }
        });

        connectMqttBroker(gatewayNode).then((client) => {
            launchCollectionQueue(gatewayNode, client, 1000);
        });
    }

    RED.nodes.registerType('gateway', GatewayNode)
};

let mqttClient = null;
let mqttClientPromise = null;

function connectMqttBroker(gatewayNode) {
    if (mqttClient) {
        return Promise.resolve(mqttClient);
    }

    if (mqttClientPromise) {
        return mqttClientPromise;
    }

    mqttClientPromise = new Promise((resolve) => {
        const client = mqtt.connect(gatewayNode.mqttBrokerUrl, {
            username: gatewayNode.account,
            password: gatewayNode.password,
        });
        client.on('connect', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} connected`);
            mqttClient = client;
            resolve(client);
        });
        client.on('close', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} close`);
        });
        client.on('reconnect', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} reconnect`);
        });
        client.on('disconnect', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} disconnect`);
        });
        client.on('offline', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} offline`);
        });
        client.on('error', () => {
            gatewayNode.log(`${gatewayNode.mqttBrokerUrl} error`);
        });
    });

    return mqttClientPromise;
}

async function sendConfigurations(gatewayNode, client) {
    const deviceList = Array.from(devices, ([name, value]) => value);
    const collectionList = Array.from(collections, ([name, value]) => value);
    const tagDefinitionList = Array.from(tagDefinitions, ([name, value]) => value);

    const deviceInfo = deviceList.map(device => {
        return {
            DeviceSN: device.deviceSN,
            PLCProtocol: device.protocol,
            "IP Address": device.ip,
            Port: device.port,
            SlaveAddress: device.slaveAddress,
            Endian: device.endian,
        };
    });
    client.publish(`${gatewayNode.sn}/DeviceInfo`, JSON.stringify(deviceInfo), () => {
        gatewayNode.log('send DeviceInfo');
    });
    gatewayNode.send({
        topic: `${gatewayNode.sn}/DeviceInfo`,
        payload: deviceInfo
    });

    const tagConfigurations = deviceList.map(device => {
        return {
            DeviceSN: device.deviceSN,
            Collections: collectionList.filter(collection => {
                return collection.deviceNodeId === device.deviceNodeId;
            }).map(collection => {
                return {
                    Id: collection.id,
                    CollectionName: collection.name,
                    SampleRate: collection.sampleRate,
                    PublishInterval: collection.publishInterval,
                    TagData: tagDefinitionList.filter(tagDefinition => {
                        return tagDefinition.collectionNodeId === collection.collectionNodeId;
                    }).map(tag => {
                        return {
                            Tag: tag.name,
                            Address: tag.address,
                            ValueType: tag.valueType,
                            AccessLevel: tag.accessLevel,
                            Description: tag.description,
                            Unit: tag.unit,
                            Mode: tag.mode
                        };
                    })
                };
            })
        }
    });
    client.publish(`${gatewayNode.sn}/TagConfiguration`, JSON.stringify(tagConfigurations), () => {
        gatewayNode.log('send TagConfiguration');
    });
    gatewayNode.send({
        topic: `${gatewayNode.sn}/TagConfiguration`,
        payload: tagConfigurations
    });
}

async function launchCollectionQueue(gatewayNode, client, timer) {
    while (true) {
        await delay(timer);
        sendValues(gatewayNode, client);
    }
}

function sendValues(gatewayNode, client) {
    const deviceList = Array.from(devices, ([name, value]) => value);
    const collectionList = Array.from(collections, ([name, value]) => value);
    const tagDefinitionList = Array.from(tagDefinitions, ([name, value]) => value);

    const now = new Date();
    const time = now.toISOString();
    const deviceTagValues = deviceList.map(device => {
        const deviceCollectionList = collectionList.filter(tag => tag.deviceNodeId === device.deviceNodeId);
        const tagDataList = deviceCollectionList.map(collection => {
            const tagData = {
                "Time": time
            };
            const deviceCollectionTagDefinitionList = tagDefinitionList.filter(tag =>
                tag.deviceNodeId === device.deviceNodeId
                && tag.collectionNodeId === collection.collectionNodeId
            );
            deviceCollectionTagDefinitionList.filter(tagDefinition => {
                return tagValues.has(tagDefinition.tagNodeId);
            }).forEach(tagDefinition => {
                tagData[tagDefinition.name] = tagValues.get(tagDefinition.tagNodeId);
            });
            return tagData;
        });

        return {
            Cache: false,
            DeviceSN: device.deviceSN,
            TagData: tagDataList
        };
    });

    client.publish(`${gatewayNode.sn}/TagValues`, JSON.stringify(deviceTagValues), () => {
        gatewayNode.log('send TagValues');
    });
    gatewayNode.send({
        topic: `${gatewayNode.sn}/TagValues`,
        payload: deviceTagValues
    });
}

async function delay(timer) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, timer);
    });
}
