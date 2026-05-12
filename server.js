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
const LIVESCORE_HOST = 'livescore-football.p.rapidapi.com';

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  }

  var today = new Date();
  var y = today.getFullYear();
  var mo = String(today.getMonth() + 1).padStart(2, '0');
  var day = String(today.getDate()).padStart(2, '0');
  // Format ddddmmyy = ddmmyyyy
  var dateStr = day + '' + mo + '' + y;

  var url = 'https://' + LIVESCORE_HOST + '/soccer/matches-by-date?date=' + dateStr + '&timezone_utc=0%3A00';

  fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': LIVESCORE_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var matches = [];
    if (data && Array.isArray(data.data)) matches = data.data;
    else if (data && Array.isArray(data)) matches = data;
    else if (data && data.matches && Array.isArray(data.matches)) matches = data.matches;
    res.json({ matches: matches, date: dateStr, raw: data });
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

  var L = lang === 'fr' ? 'Reponds en francais.' : 'Respond in English.';
  var m = match;
  var prompt = '';

  if (chapter === 'pre') {
    prompt = 'Analyste football elite. Match ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') au ' + m.stadium + ' le ' + m.date + '. BRIEFING AVANT MATCH : forme 5 derniers matchs de chaque equipe, confrontations directes, stats cles buts/possession/xG, infos stade capacite et altitude et taux victoires domicile, blessures et suspensions. ' + L;
  } else if (chapter === 'compo') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Systeme de jeu des 2 equipes, enjeux, duel tactique, score predit avec pourcentage de confiance. ' + L;
  } else if (chapter === 'scorers') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Top 3 buteurs potentiels de chaque equipe : buts cette saison, forme recente, pourcentage de marquer en 1ere et 2eme mi-temps. ' + L;
  } else if (chapter === 'assists') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Top 3 passeurs potentiels de chaque equipe : passes decisives cette saison, pourcentage de donner une passe decisive en 1ere et 2eme mi-temps. ' + L;
  } else if (chapter === 'penalty') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Penalties obtenus et concedes par chaque equipe cette saison, joueurs cles, probabilite globale et repartition 1ere vs 2eme mi-temps. ' + L;
  } else {
    return res.status(400).json({ error: 'chapter invalide' });
  }

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
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) return res.status(500).json({ error: data.error.message });
    var text = '';
    if (data.content) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') text += data.content[i].text;
      }
    }
    if (!text) text = 'Aucune reponse.';
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
