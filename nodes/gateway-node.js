module.exports = function(RED) {
  function GatewayNode(config) {
    RED.nodes.createNode(this, config);
    this.clientId = config.clientId;
    this.gateway = config.gateway;
    this.account = config.account;
    this.password = config.password;
  }

  RED.nodes.registerType('gateway', GatewayNode)
};
