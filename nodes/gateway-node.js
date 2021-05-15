const mqtt = require('mqtt');

// const mqttBrokerUrl = 'mqtt://vpc-sz-jx';
const mqttBrokerUrl = 'mqtt://pc-scada-pro';
const gatewaySN = 'GW678';

const devices = new Map();
const collections = new Map();
const tagDefinitions = new Map();
const tagValues = new Map();

module.exports = function (RED) {
    function GatewayNode(config) {
        RED.nodes.createNode(this, config);
        this.gateway = config.gateway;
        this.account = config.account;
        this.password = config.password;

        const gatewayNode = this;
        gatewayNode.on('input', msg => {
            if (msg.topic === 'tag-value') {
                const tagId = msg.payload.id;
                const tagValue = msg.payload.value;
                tagValues.set(tagId, tagValue);
                connectMqttBroker(gatewayNode).then((client) => {
                    sendValues(gatewayNode, client);
                });
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
    }

    RED.nodes.registerType('gateway', GatewayNode)
};

let mqttClient = null;

function connectMqttBroker(gatewayNode) {
    if (mqttClient) {
        return Promise.resolve(mqttClient);
    }

    return new Promise((resolve) => {
        const client = mqtt.connect(mqttBrokerUrl, {
            username: gatewaySN,
            password: gatewaySN,
        });
        client.on('connect', () => {
            gatewayNode.log(`${mqttBrokerUrl} connected`);
            mqttClient = client;
            resolve(client);
        });
        client.on('close', () => {
            gatewayNode.log(`${mqttBrokerUrl} close`);
        });
        client.on('reconnect', () => {
            gatewayNode.log(`${mqttBrokerUrl} reconnect`);
        });
        client.on('disconnect', () => {
            gatewayNode.log(`${mqttBrokerUrl} disconnect`);
        });
        client.on('offline', () => {
            gatewayNode.log(`${mqttBrokerUrl} offline`);
        });
        client.on('error', () => {
            gatewayNode.log(`${mqttBrokerUrl} error`);
        });
    });
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
    client.publish(`${gatewaySN}/DeviceInfo`, JSON.stringify(deviceInfo), () => {
        gatewayNode.log('send DeviceInfo');
    });
    gatewayNode.send({
        topic: `${gatewaySN}/DeviceInfo`,
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
    client.publish(`${gatewaySN}/TagConfiguration`, JSON.stringify(tagConfigurations), () => {
        gatewayNode.log('send TagConfiguration');
    });
    gatewayNode.send({
        topic: `${gatewaySN}/TagConfiguration`,
        payload: tagConfigurations
    });
}

async function sendValues(gatewayNode, client) {
    const deviceList = Array.from(devices, ([name, value]) => value);
    const collectionList = Array.from(collections, ([name, value]) => value);
    const tagDefinitionList = Array.from(tagDefinitions, ([name, value]) => value);

    const tagValues = deviceList.map(device => {
        return {
            Cache: false,
            DeviceSN: device.deviceSN,
            TagData: [
                {
                    "Time": "2021-05-16T01:37:47.642000Z",
                    "Humidity": Math.floor(Math.random() * 100),
                    "Temperature": Math.floor(Math.random() * 100),
                }
            ]
        }
    });
    client.publish(`${gatewaySN}/TagValues`, JSON.stringify(tagValues), () => {
        gatewayNode.log('send TagValues');
    });
    gatewayNode.send({
        topic: `${gatewaySN}/TagValues`,
        payload: tagValues
    });
}
