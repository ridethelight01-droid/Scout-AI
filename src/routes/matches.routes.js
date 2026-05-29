const express = require('express');

const {
  getLiveMatches,
  getScheduledMatches,
  getLineups
} = require('../services/footballApi.service');

const router = express.Router();

router.get('/matches', async function(req, res) {
  try {
    console.log('📡 /api/matches called');

    const live = await getLiveMatches();
    const scheduled = await getScheduledMatches();

    console.log('🔴 /api/matches live:', live.length);
    console.log('📅 /api/matches scheduled:', scheduled.length);

    res.json({
      live,
      scheduled,
      total: live.length + scheduled.length
    });

  } catch (error) {
    console.error('❌ /api/matches ERROR:', error.message);

    res.status(500).json({
      error: error.message,
      live: [],
      scheduled: [],
      total: 0
    });
  }
});

router.get('/lineups/:matchId', async function(req, res) {
  try {
    const lineups = await getLineups(req.params.matchId);
    res.json(lineups);
  } catch (error) {
    console.error('❌ /api/lineups ERROR:', error.message);

    res.status(500).json({
      error: error.message,
      home: null,
      away: null
    });
  }
});

module.exports = router;
