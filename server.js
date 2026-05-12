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
    headers: { 'x-rapidapi-host': ALLSPORTS_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
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
    time: null, dateLabel: null
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
        return isTopLevel(e) && e.startTimestamp && e.startTimestamp > now;
      }).map(function(e) { return formatMatch(e, 'scheduled'); });
    }).catch(function() { return []; });
}

app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  var today = new Date();
  var now = Math.floor(Date.now() / 1000);
  function getParts(date) {
    return { day: String(date.getDate()).padStart(2,'0'), month: String(date.getMonth()+1).padStart(2,'0'), year: date.getFullYear() };
  }
  var t = getParts(today);
  var tom = new Date(today); tom.setDate(today.getDate()+1); var tm = getParts(tom);
  var dat = new Date(today); dat.setDate(today.getDate()+2); var da = getParts(dat);

  var livePromise = fetchAllSports('/api/matches/live')
    .then(function(data) {
      var events = (data && data.events) ? data.events : [];
      return events.filter(isTopLevel).map(function(e) { return formatMatch(e, 'live'); });
    }).catch(function() { return []; });

  var scheduledPromise = fetchScheduledForDate(t.day, t.month, t.year, now)
    .then(function(m) { return m.length > 0 ? m : fetchScheduledForDate(tm.day, tm.month, tm.year, now); })
    .then(function(m) { return m.length > 0 ? m : fetchScheduledForDate(da.day, da.month, da.year, now); });

  Promise.all([livePromise, scheduledPromise]).then(function(results) {
    var live = results[0];
    var sched = (results[1]||[]).sort(function(a,b){ return (a.startTimestamp||0)-(b.startTimestamp||0); });
    res.json({ live: live, scheduled: sched, total: live.length + sched.length });
  });
});

app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang;
  var isLive = req.body.isLive || false;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });

  var L = lang === 'fr' ? 'En francais.' : 'In English.';
  var m = match;
  var scoreInfo = isLive ? ' Score actuel: ' + m.homeScore + '-' + m.awayScore + ' (' + m.status + ').' : '';
  var prompt = '';

  if (isLive) {
    // Prompts spéciaux pour matchs en direct
    var livePrompts = {
      pre: 'Analyste football. Match EN COURS: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ').' + scoreInfo + ' Donne une ANALYSE LIVE: resume du match jusqu ici, equipe dominante, stats cles estimees (possession, tirs, occasions), tournant du match, comment le match evolue. ' + L,
      compo: 'Analyste football. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + ' Analyse tactique live: systeme en place, ajustements observes, quelle equipe controle, prediction pour la fin du match avec score final probable. ' + L,
      scorers: 'Analyste football. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + ' Qui peut encore marquer? Top 3 buteurs potentiels de chaque equipe pour la suite du match, avec % de probabilite de marquer avant le coup de sifflet final. ' + L,
      assists: 'Analyste football. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + ' Qui peut encore faire une passe decisive? Top 3 passeurs potentiels de chaque equipe pour la suite du match, avec probabilites. ' + L,
      penalty: 'Analyste football. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + ' Y a-t-il eu des penalties? Probabilite qu un penalty soit accorde avant la fin du match, et quel joueur pourrait le provoquer ou le tirer. ' + L
    };
    prompt = livePrompts[chapter];
  } else {
    // Prompts pré-match
    var prePrompts = {
      pre: 'Analyste football. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Donne: forme 5 derniers matchs de chaque equipe, bilan confrontations directes, stats cles (buts, xG), infos stade (capacite, altitude, % victoires domicile), blessures/suspensions importantes. ' + L,
      compo: 'Analyste football. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Formation probable et style de jeu de chaque equipe, enjeux du match, analyse tactique, score predit avec % confiance. ' + L,
      scorers: 'Analyste football. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Top 3 buteurs potentiels par equipe: nom, buts saison, % marquer 1ere MT et 2eme MT, raison. ' + L,
      assists: 'Analyste football. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Top 3 passeurs potentiels par equipe: nom, passes decisives saison, % passe decisive 1ere MT et 2eme MT, raison. ' + L,
      penalty: 'Analyste football. ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '. Penalties: stats obtenus/concedes par equipe, joueurs cles, % probabilite penalty dans ce match, repartition 1ere/2eme MT. ' + L
    };
    prompt = prePrompts[chapter];
  }

  if (!prompt) return res.status(400).json({ error: 'chapter invalide' });

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
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
    res.json({ text: text || 'Aucune reponse generee.' });
  })
  .catch(function(err) { res.status(500).json({ error: err.message }); });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
