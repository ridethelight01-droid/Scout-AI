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

function fetchAllSports(endpoint) {
  return fetch('https://' + ALLSPORTS_HOST + endpoint, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': ALLSPORTS_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    }
  }).then(function(r) { return r.json(); });
}

function isTopLevel(e) {
  if (!e.eventFilters || !e.eventFilters.level) return false;
  var levels = e.eventFilters.level;
  return levels.indexOf('top-competitions') !== -1 || levels.indexOf('pro') !== -1;
}

function formatMatch(e, type) {
  var m = {
    id: e.id,
    home: e.homeTeam ? e.homeTeam.name : 'Equipe A',
    away: e.awayTeam ? e.awayTeam.name : 'Equipe B',
    homeScore: (e.homeScore && e.homeScore.current !== undefined) ? e.homeScore.current : null,
    awayScore: (e.awayScore && e.awayScore.current !== undefined) ? e.awayScore.current : null,
    status: e.status ? e.status.description : '',
    statusType: type,
    tournament: e.tournament ? e.tournament.name : '',
    country: e.tournament && e.tournament.category ? e.tournament.category.name : '',
    startTimestamp: e.startTimestamp || null,
    time: null
  };
  if (m.startTimestamp) {
    var d = new Date(m.startTimestamp * 1000);
    m.time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return m;
}

app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  }

  var today = new Date();
  var day = String(today.getDate()).padStart(2, '0');
  var month = String(today.getMonth() + 1).padStart(2, '0');
  var year = today.getFullYear();
  var now = Math.floor(Date.now() / 1000);

  // Fetch live matches + all today's matches in parallel
  var livePromise = fetchAllSports('/api/matches/live')
    .then(function(data) {
      var events = (data && data.events) ? data.events : [];
      return events.filter(isTopLevel).map(function(e) {
        return formatMatch(e, 'live');
      });
    })
    .catch(function() { return []; });

  var todayPromise = fetchAllSports('/api/category/1/matches/' + day + '/' + month + '/' + year)
    .then(function(data) {
      var events = (data && data.events) ? data.events : [];
      // Seulement les matchs pas encore commences
      return events.filter(function(e) {
        if (!isTopLevel(e)) return false;
        return e.startTimestamp && e.startTimestamp > now;
      }).map(function(e) {
        return formatMatch(e, 'scheduled');
      });
    })
    .catch(function() { return []; });

  Promise.all([livePromise, todayPromise]).then(function(results) {
    var liveMatches = results[0];
    var scheduledMatches = results[1];

    // Trier par heure
    scheduledMatches.sort(function(a, b) {
      return (a.startTimestamp || 0) - (b.startTimestamp || 0);
    });

    res.json({
      live: liveMatches,
      scheduled: scheduledMatches,
      total: liveMatches.length + scheduledMatches.length
    });
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
  var prompt = '';

  if (chapter === 'pre') {
    prompt = 'Tu es un analyste football elite avec acces a la recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). BRIEFING AVANT MATCH COMPLET: 1) Forme recente des 5 derniers matchs de chaque equipe avec resultats 2) Confrontations directes historique 3) Stats cles: buts marques/encaisses, possession, xG 4) Infos stade: capacite, altitude, taux victoires domicile cette saison 5) Faits marquants: blessures, suspensions, actualite recente. Sois precis avec des chiffres. ' + L;
  } else if (chapter === 'compo') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). Analyse: 1) Systeme de jeu probable de ' + m.home + ': formation, pressing, construction, defense, joueurs cles 2) Systeme de jeu probable de ' + m.away + ': meme analyse complete 3) Enjeux du match pour chaque equipe 4) Duel tactique: avantages secteur par secteur 5) Score predit avec % de confiance et raisonnement detaille. ' + L;
  } else if (chapter === 'scorers') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). TOP 3 BUTEURS POTENTIELS pour chaque equipe. Pour chaque joueur: nom complet, poste, buts cette saison, forme recente, % de marquer en 1ere mi-temps, % de marquer en 2eme mi-temps, justification. ' + L;
  } else if (chapter === 'assists') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). TOP 3 PASSEURS DECISIFS POTENTIELS pour chaque equipe. Pour chaque joueur: nom, poste, passes decisives cette saison, % de donner une passe decisive en 1ere mi-temps, % en 2eme mi-temps, justification. ' + L;
  } else if (chapter === 'penalty') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + '). ANALYSE PENALTIES COMPLETE: penalties obtenus/concedes par chaque equipe, joueurs cles, probabilite globale, repartition 1ere MT vs 2eme MT, synthese. ' + L;
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
