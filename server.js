const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const RAPIDAPI_HOST = 'free-api-live-football-data.p.rapidapi.com';
app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});
app.get('/api/matches', function(req, res) {
  var leagueId = req.query.leagueId;
  if (!leagueId) return res.status(400).json({ error: 'leagueId requis' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  var url = 'https://' + RAPIDAPI_HOST + '/football-get-all-matches-by-league?leagueid=' + leagueId;
  fetch(url, { method: 'GET', headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }})
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var matches = [];
    if (data && data.response && data.response.matches) matches = data.response.matches;
    var upcoming = matches.filter(function(m) { return m.status && m.status.notStarted === true; });
    res.json({ matches: upcoming });
  })
  .catch(function(err) { res.status(500).json({ error: err.message }); });
});
app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });
  var L = lang === 'fr' ? 'Reponds en francais.' : 'Respond in English.';
  var m = match;
  var prompts = {
    pre: 'Analyste football elite. Match ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') au ' + m.stadium + ' le ' + m.date + '. BRIEFING AVANT MATCH : forme 5 derniers matchs de chaque equipe, confrontations directes, stats cles buts/possession/xG, infos stade capacite et altitude et taux victoires domicile, blessures et suspensions. ' + L,
    compo: 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. Systeme de jeu des 2 equipes, enjeux, duel tactique, score predi
