const express = require('express');
const { rapidApiKey, anthropicKey, oddsApiKey } = require('../config/env');

const router = express.Router();

router.get('/', function(req, res) {
  res.json({
    status: 'ok',
    rapidapi: !!rapidApiKey,
    anthropic: !!anthropicKey,
    oddsapi: !!oddsApiKey
  });
});

module.exports = router;
