const mqtt = require('mqtt');

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

                let addNewDevice = false;
                if (!devices.has(tagDefinition.device)) {
                    addNewDevice = true;
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
                    sendConfigurations(gatewayNode, client, addNewDevice);
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
        const client = mqtt.connect('mqtt://pc-scada-pro', {
            clientId: "3cad2717-2ed8-47b1-9758-474d0fad7582",
            username: "GW001",
            password: "GW001",
        });
        client.on('connect', () => {
            gatewayNode.log('mqtt://pc-scada-pro connected');
            mqttClient = client;
            resolve(client);
        });
    });
}

async function sendConfigurations(gatewayNode, client, addNewDevice) {
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
                    "TagData": tagDefinitionList.filter(tagDefinition => tagDefinition.CollectionNodeId === collection.CollectionNodeId)
                };
            })
        }
    });
    if (addNewDevice) {
        client.publish('GW001/DeviceInfo', JSON.stringify(deviceList), () => {
            gatewayNode.log('send DeviceInfo');
        });
        gatewayNode.send({
            topic: 'GW001/DeviceInfo',
            payload: deviceList
        });
    }

    client.publish('GW001/TagConfiguration', JSON.stringify(tagConfigurations), () => {
        gatewayNode.log('send TagConfiguration');
    });
    gatewayNode.send({
        topic: 'GW001/TagConfiguration',
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
