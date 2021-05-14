module.exports = function(RED) {
    function CollectionConfig(config) {
        RED.nodes.createNode(this, config);
        this.id = config.id;
        this.name = config.name;
        this.sampleRate = config.sampleRate;
        this.publishInterval = config.publishInterval;
    }

    RED.nodes.registerType('collection-config', CollectionConfig)
};
