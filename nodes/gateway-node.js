const mqtt = require('mqtt');

const mqttBrokerUrl = 'mqtt://vpc-sz-jx';
const gatewaySN = 'GW678';

const devices = new Map();
const collections = new Map();
const tagDefinitions = new Map();
const tagValues = new Map();

module.exports = function (RED) {
    function GatewayNode(config) {
        RED.nodes.createNode(this, config);
        this.clientId = config.clientId;
        this.gateway = config.gateway;
        this.account = config.account;
        this.password = config.password;

        const gatewayNode = this;
        gatewayNode.on('input', msg => {
            if (msg.topic === 'tag-value') {
                const tagId = msg.payload.id;
                const tagValue = msg.payload.value;
                tagValues.set(tagId, tagValue);
            } else if (msg.topic === 'tag-definition') {
                const tagDefinition = msg.payload;

                if (!devices.has(tagDefinition.device)) {
                    const device = RED.nodes.getNode(tagDefinition.device);
                    devices.set(device.id, {
                        "DeviceNodeId": tagDefinition.device,
                        "DeviceSN": device.deviceSN,
                        "PLCProtocol": device.protocol,
                        "IP Address": device.ip,
                        "Port": device.port,
                        "SlaveAddress": device.slaveAddress,
                        "Endian": device.endian
                    });
                }

                if (!collections.has(tagDefinition.collection)) {
                    const collection = RED.nodes.getNode(tagDefinition.collection);
                    collections.set(collection.id, {
                        "DeviceNodeId": tagDefinition.device,
                        "CollectionNodeId": tagDefinition.collection,
                        "Id": collection.uuid,
                        "CollectionName": collection.name,
                        "SampleRate": collection.sampleRate,
                        "PublishInterval": collection.publishInterval
                    });
                }

                const tagId = msg.payload.id;
                tagDefinitions.set(tagId, {
                    "DeviceNodeId": tagDefinition.device,
                    "CollectionNodeId": tagDefinition.collection,
                    "TagNodeId": tagId,
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
    const tagConfigurations = deviceList.map(device => {
        return {
            DeviceSN: device.DeviceSN,
            Collections: collectionList.filter(collection => {
                return collection.DeviceNodeId === device.DeviceNodeId;
            }).map(collection => {
                return {
                    "Id": collection.Id,
                    "CollectionName": collection.CollectionName,
                    "SampleRate": collection.SampleRate,
                    "PublishInterval": collection.PublishInterval,
                    "TagData": tagDefinitionList.filter(tagDefinition => {
                        return tagDefinition.CollectionNodeId === collection.CollectionNodeId;
                    }).map(tag => {
                        return {
                            Tag: tag.name,
                            Address: tag.address,
                            ValueType: tag.valueType,
                            AccessLevel: tag.accessLevel,
                            Description: tag.description,
                            Unit: tag.unit,
                            Mode: tag.Mode
                        };
                    })
                };
            })
        }
    });
    client.publish(`${gatewaySN}/DeviceInfo`, JSON.stringify(deviceList), () => {
        gatewayNode.log('send DeviceInfo');
    });
    gatewayNode.send({
        topic: `${gatewaySN}/DeviceInfo`,
        payload: deviceList.map(device => {
            return {
                "DeviceSN": device.DeviceSN,
                "PLCProtocol": device.PLCProtocol,
                "IP Address": device["IP Address"],
                "Port": device.Port,
                "SlaveAddress": device.SlaveAddress,
                "Endian": device.Endian
            };
        })
    });

    client.publish(`${gatewaySN}/TagConfiguration`, JSON.stringify(tagConfigurations), () => {
        gatewayNode.log('send TagConfiguration');
    });
    gatewayNode.send({
        topic: `${gatewaySN}/TagConfiguration`,
        payload: tagConfigurations
    });
}

function delay(timer) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, timer);
    });
}
