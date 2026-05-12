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
const ALLSPORTS_HOST = 'allsportsapi2.p.rapidapi.com';

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

// GET /api/matches - retourne les matchs en direct + a venir du jour
app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  }

  var url = 'https://' + ALLSPORTS_HOST + '/api/matches/live';

  fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': ALLSPORTS_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var events = [];
    if (data && Array.isArray(data.events)) {
      events = data.events;
    }

    // Filtrer seulement les grands championnats
    var topLevels = ['top-competitions', 'pro'];
    var filtered = events.filter(function(e) {
      if (!e.eventFilters || !e.eventFilters.level) return false;
      var levels = e.eventFilters.level;
      for (var i = 0; i < topLevels.length; i++) {
        if (levels.indexOf(topLevels[i]) !== -1) return true;
      }
      return false;
    });

    // Formater les matchs
    var matches = filtered.map(function(e) {
      return {
        id: e.id,
        home: e.homeTeam ? e.homeTeam.name : 'Equipe A',
        away: e.awayTeam ? e.awayTeam.name : 'Equipe B',
        homeScore: e.homeScore ? e.homeScore.current : null,
        awayScore: e.awayScore ? e.awayScore.current : null,
        status: e.status ? e.status.description : '',
        statusType: e.status ? e.status.type : '',
        tournament: e.tournament ? e.tournament.name : '',
        country: e.tournament && e.tournament.category ? e.tournament.category.name : '',
        startTimestamp: e.startTimestamp || null
      };
    });

    res.json({ matches: matches, total: matches.length });
  })
  .catch(function(err) {
    res.status(500).json({ error: err.message });
  });
});

// POST /api/analyze - analyse IA d'un match
app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });

  var L = lang === 'fr' ? 'Reponds entierement en francais.' : 'Respond entirely in English.';
  var m = match;
  var prompt = '';

  if (chapter === 'pre') {
    prompt = 'Tu es un analyste football elite avec acces a la recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). BRIEFING AVANT MATCH COMPLET: 1) Forme recente des 5 derniers matchs de chaque equipe avec resultats 2) Confrontations directes historique 3) Stats cles: buts marques/encaisses, possession, xG 4) Infos stade: capacite, altitude, taux victoires domicile cette saison 5) Faits marquants: blessures, suspensions, actualite recente. Sois precis avec des chiffres. ' + L;
  } else if (chapter === 'compo') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). Analyse: 1) Systeme de jeu probable de ' + m.home + ': formation, pressing, construction, defense, joueurs cles 2) Systeme de jeu probable de ' + m.away + ': meme analyse complete 3) Enjeux du match pour chaque equipe 4) Duel tactique: avantages secteur par secteur 5) Score predit avec % de confiance et raisonnement detaille. ' + L;
  } else if (chapter === 'scorers') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). TOP 3 BUTEURS POTENTIELS pour chaque equipe. Pour chaque joueur: nom complet, poste, buts cette saison, forme recente (buts sur les 5 derniers matchs), % de marquer en 1ere mi-temps, % de marquer en 2eme mi-temps, justification. Les % doivent etre realistes. ' + L;
  } else if (chapter === 'assists') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). TOP 3 PASSEURS DECISIFS POTENTIELS pour chaque equipe. Pour chaque joueur: nom, poste, passes decisives cette saison, role creatif, % de donner une passe decisive en 1ere mi-temps, % en 2eme mi-temps, justification. Inclure xA si disponible. ' + L;
  } else if (chapter === 'penalty') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). ANALYSE PENALTIES: 1) Penalties obtenus par ' + m.home + ' cette saison (nombre, taux/match, contextes) 2) Penalties concedes par ' + m.home + ' (nombre, contextes) 3) Penalties obtenus par ' + m.away + ' 4) Penalties concedes par ' + m.away + ' 5) Joueurs cles qui provoquent/concedent des penalties 6) Probabilite globale % qu un penalty soit accorde dans ce match 7) Repartition 1ere MT % vs 2eme MT % 8) Synthese: quelle equipe en beneficiera le plus. ' + L;
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
      max_tokens: 1500,
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
    if (!text) text = 'Aucune reponse generee.';
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
