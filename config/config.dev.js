var config = {
  couch: 'http://host:test@localhost:5984',
  db: 'lunacy',
  googleWalletSecret: '',
  ports: {
    host: 7000,
    collector: 7001,
    hedwig: 7002,
    gamemaster: 7003
  },
  maxNameLength: 12,
  clientOrigin: 'http://localhost'
};

module.exports = config;
