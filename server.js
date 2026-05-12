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
    m.dateLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return m;
}

function fetchScheduledForDate(d, mo, y, now) {
  return fetchAllSports('/api/category/1/matches/' + d + '/' + mo + '/' + y)
    .then(function(data) {
      var events = (data && data.events) ? data.events : [];
      return events.filter(function(e) {
        if (!isTopLevel(e)) return false;
        return e.startTimestamp && e.startTimestamp > now;
      }).map(function(e) {
        return formatMatch(e, 'scheduled');
      });
    })
    .catch(function() { return []; });
}

app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  }

  var today = new Date();
  var now = Math.floor(Date.now() / 1000);

  function getDateParts(date) {
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: String(date.getMonth() + 1).padStart(2, '0'),
      year: date.getFullYear()
    };
  }

  var todayParts = getDateParts(today);
  var tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  var tomorrowParts = getDateParts(tomorrow);
  var dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
  var dayAfterParts = getDateParts(dayAfter);

  var livePromise = fetchAllSports('/api/matches/live')
    .then(function(data) {
      var events = (data && data.events) ? data.events : [];
      return events.filter(isTopLevel).map(function(e) { return formatMatch(e, 'live'); });
    })
    .catch(function() { return []; });

  // Cherche aujourd'hui, demain, après-demain jusqu'à trouver des matchs
  var scheduledPromise = fetchScheduledForDate(todayParts.day, todayParts.month, todayParts.year, now)
    .then(function(matches) {
      if (matches.length > 0) return matches;
      return fetchScheduledForDate(tomorrowParts.day, tomorrowParts.month, tomorrowParts.year, now);
    })
    .then(function(matches) {
      if (matches.length > 0) return matches;
      return fetchScheduledForDate(dayAfterParts.day, dayAfterParts.month, dayAfterParts.year, now);
    });

  Promise.all([livePromise, scheduledPromise]).then(function(results) {
    var liveMatches = results[0];
    var scheduledMatches = results[1] || [];
    scheduledMatches.sort(function(a, b) { return (a.startTimestamp || 0) - (b.startTimestamp || 0); });
    res.json({ live: liveMatches, scheduled: scheduledMatches, total: liveMatches.length + scheduledMatches.length });
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
    prompt = 'Tu es un analyste football elite avec acces a la recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. BRIEFING AVANT MATCH COMPLET: 1) Forme recente 5 derniers matchs de chaque equipe 2) Confrontations directes 3) Stats cles: buts, possession, xG 4) Infos stade: capacite, altitude, taux victoires domicile 5) Blessures et suspensions. ' + L;
  } else if (chapter === 'compo') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. 1) Systeme de jeu de ' + m.home + ' 2) Systeme de jeu de ' + m.away + ' 3) Enjeux du match 4) Duel tactique 5) Score predit avec % confiance. ' + L;
  } else if (chapter === 'scorers') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. TOP 3 BUTEURS POTENTIELS pour chaque equipe: nom, poste, buts saison, forme recente, % marquer 1ere MT, % marquer 2eme MT, justification. ' + L;
  } else if (chapter === 'assists') {
    prompt = 'Tu es un analyste football elite. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. TOP 3 PASSEURS POTENTIELS pour chaque equipe: nom, poste, passes decisives saison, % passe decisive 1ere MT, % 2eme MT, justification. ' + L;
  } else if (chapter === 'penalty') {
    prompt = 'Tu es un analyste football elite avec recherche web. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. ANALYSE PENALTIES: penalties obtenus/concedes par chaque equipe, joueurs cles, probabilite globale, repartition 1ere MT vs 2eme MT, synthese. ' + L;
  } else {
    return res.status(400).json({ error: 'chapter invalide' });
  }

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
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
  .catch(function(err) { res.status(500).json({ error: err.message }); });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
