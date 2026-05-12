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
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  }
  var leagueId = req.query.leagueId || '42';
  var url = 'https://' + RAPIDAPI_HOST + '/football-get-all-matches-by-league?leagueid=' + leagueId;
  fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  })
  .then(function(r) {
    return r.json();
  })
  .then(function(data) {
    var matches = [];
    if (data && data.response && data.response.matches) {
      matches = data.response.matches;
    }
    var upcoming = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (m.status && m.status.notStarted === true) {
        upcoming.push(m);
      }
    }
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
  if (!chapter || !match) {
    return res.status(400).json({ error: 'chapter et match requis' });
  }
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });
  }
  var L = lang === 'fr' ? 'Reponds en francais.' : 'Respond in English.';
  var m = match;
  var prompt = '';
  if (chapter === 'pre') {
    prompt = 'Analyste football elite. Match ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. BRIEFING AVANT MATCH : forme 5 derniers matchs de chaque equipe, confrontations directes, stats cles, infos stade, blessures et suspensions. ' + L;
  } else if (chapter === 'compo') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. Systeme de jeu des 2 equipes, enjeux, duel tactique, score predit avec pourcentage de confiance. ' + L;
  } else if (chapter === 'scorers') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. Top 3 buteurs potentiels de chaque equipe, pourcentage de marquer en 1ere et 2eme mi-temps. ' + L;
  } else if (chapter === 'assists') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. Top 3 passeurs potentiels de chaque equipe, pourcentage de donner une passe decisive en 1ere et 2eme mi-temps. ' + L;
  } else if (chapter === 'penalty') {
    prompt = 'Analyste football elite. ' + m.home + ' vs ' + m.away + ' le ' + m.date + '. Penalties obtenus et concedes par chaque equipe, probabilite globale et repartition 1ere vs 2eme mi-temps. ' + L;
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
  .then(function(r) {
    return r.json();
  })
  .then(function(data) {
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    var text = '';
    if (data.content) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') {
          text += data.content[i].text;
        }
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
