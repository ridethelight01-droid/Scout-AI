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

    const results = await Promise.allSettled([getLiveMatches(), getScheduledMatches()]);
    const live = results[0].status === 'fulfilled' ? results[0].value : [];
    const scheduled = results[1].status === 'fulfilled' ? results[1].value : [];
    const errors = {};
    results.forEach(function(result, index) {
      if (result.status !== 'rejected') return;
      const error = result.reason;
      const source = index === 0 ? 'live' : 'scheduled';
      console.error('/api/matches source failed:', source, error?.message);
      errors[source] = {
        code: error?.code?.startsWith('API_FOOTBALL_') ? error.code : 'MATCHES_ERROR',
        message: error?.code?.startsWith('API_FOOTBALL_') ? error.message : 'Impossible de récupérer les matchs.'
      };
    });

    console.log('🔴 /api/matches live:', live.length);
    console.log('📅 /api/matches scheduled:', scheduled.length);

    const payload = {
      live,
      scheduled,
      total: live.length + scheduled.length
    };

    if (Object.keys(errors).length) {
      payload.errors = errors;
      payload.error = Object.values(errors).map(function(error) { return error.message; }).join(' ');
      payload.partial = payload.total > 0;
      // Preserve available matches for the current UI; an upstream failure
      // must never look like an ordinary, successful empty list.
      if (!payload.total) {
        const failed = results.find(function(result) { return result.status === 'rejected'; });
        const status = failed.reason?.statusCode;
        return res.status([502, 503, 504].includes(status) ? status : 500).json(payload);
      }
    }

    res.json(payload);

  } catch (error) {
    console.error('❌ /api/matches ERROR:', error.message);

    res.status(500).json({
      error: 'Impossible de récupérer les matchs.',
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
