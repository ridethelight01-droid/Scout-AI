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
  fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
    var matches = [];
    if (data && data.response && data.response.matches) {
      matches = data.response.matches;
    }
    var upcoming = matches.filter(function(m) {
      return m.status && m.status.notStarted === true;
    });
    res.json({ matches: upcoming });
  })
  .catch(function(err) {
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });
  var L = lang === 'fr' ? 'Reponds entierement en francais.' : 'Respond entirely in English.';
  var m = match;
  var prompts = {
    pre: 'Tu es un analyste football elite avec acces a la recherche web. Pour le match ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') au ' + m.stadium + ', ' + m.city + ', le ' + m.date + ' a ' + m.time + ', redige un BRIEFING COMPLET AVANT MATCH : forme recente des 2 equipes (5 derniers matchs), confrontations directes, stats cles (buts, possession, xG), infos stade (capacite, altitude, taux victoires domicile %), faits marquants (blessures, suspensions). ' + L,
    compo: 'Tu es un analyste football elite. Pour ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + ' : systeme de jeu probable des 2 equipes, enjeux du match, duel tactique, score predit avec % de confiance. ' + L,
    scorers: 'Tu es un analyste football elite. Pour ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + ' : top 3 buteurs potentiels pour chaque equipe avec buts cette saison, forme recente, % de marquer en 1ere MT et 2eme MT. ' + L,
    assists: 'Tu es un analyste football elite. Pour ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + ' : top 3 passeurs potentiels pour chaque equipe avec passes decisives cette saison, % de donner une passe decisive en 1ere MT et 2eme MT. ' + L,
    penalty: 'Tu es un analyste football elite. Pour ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + ' : penalties obtenus/concedes par chaque equipe cette saison, joueurs cles, probabilite globale d un penalty dans ce match, repartition 1ere MT vs 2eme MT. ' + L
  };
  var prompt = prompts[chapter];
  if (!prompt) return res.status(400).json({ error: 'chapter invalide' });
  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  })
  .then(function(response) { return response.json(); })
  .then(function(data) {
    if (data.error) return res.status(500).json({ error: data.error.message });
    var text = (data.content || [])
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n') || 'Aucune reponse.';
    res.json({ text: text });
  })
  .catch(function(err) {
    res.status(500).json({ error: err.message });
  });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('SCOUT IA running on port ' + PORT);
});
