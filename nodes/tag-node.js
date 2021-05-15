module.exports = function (RED) {
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

        const tagNode = this;
        const tagDefinition = {
            id: config.id,
            name: config.name,
            address: config.address,
            valueType: config.valueType,
            accessLevel: config.accessLevel,
            mode: config.mode,
            description: config.description,
            unit: config.unit,
            device: config.device,
            collection: config.collection,
        };
        setTimeout(() => {
            tagNode.send({
                topic: 'tag-definition',
                payload: tagDefinition
            });
        });
        tagNode.on('input', msg => {
            tagNode.send({
                topic: 'tag-value',
                payload: {
                    id: config.id,
                    value: msg.payload
                }
            });
        });
    }

    RED.nodes.registerType('tag', TagNode)
};
