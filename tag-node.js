module.exports = function(RED) {
    function TagNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.address = config.address;
        this.valueType = config.valueType;
        this.accessLevel = config.accessLevel;
        this.mode = config.mode;
        this.description = config.description;
        this.unit = config.unit;
        this.device = config.device;
        this.collection = config.collection;
    }

    RED.nodes.registerType('tag-node', TagNode)
};
