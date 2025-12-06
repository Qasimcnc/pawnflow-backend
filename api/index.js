const serverless = require('serverless-http');
const app = require('../server'); // loads your Express app
module.exports = serverless(app);