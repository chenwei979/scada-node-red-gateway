module.exports = function (RED) {
    function DeviceConfig(config) {
        RED.nodes.createNode(this, config);
        this.deviceSN = config.deviceSN;
        this.ip = config.ip;
        this.port = config.port;
        this.protocol = config.protocol;
        this.slaveAddress = config.slaveAddress;
        this.endian = config.endian;
    }

    RED.nodes.registerType('device-config', DeviceConfig)
};
