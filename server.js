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

  var L = lang === 'fr'
    ? 'Reponds UNIQUEMENT en francais. Utilise des tableaux HTML (<table>) quand c\'est pertinent pour presenter les donnees comparatives.'
    : 'Respond ONLY in English. Use HTML tables (<table>) when relevant for comparative data.';
  var m = match;
  var scoreInfo = isLive ? ' Score en cours: ' + m.homeScore + '-' + m.awayScore + ' (' + m.status + ').' : '';
  var prompt = '';

  if (isLive) {
    var livePrompts = {
      pre: 'Tu es un analyste football expert avec acces a internet. Match EN COURS: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ').' + scoreInfo + '\n\nFournis une ANALYSE LIVE COMPLETE:\n1. Resume du match: qui domine, comment s\'est passe chaque periode\n2. Stats estimees en direct (possession %, tirs, corners, cartons)\n3. Tournants du match et buts marques avec contexte\n4. Analyse de la dynamique actuelle: quelle equipe a le momentum\n5. Prediction pour la fin du match avec score final probable\n\nUtilise des tableaux HTML pour les stats comparatives. ' + L,
      compo: 'Tu es un analyste football expert. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + '\n\n1. Systemes tactiques observes dans ce match (formations, pressing)\n2. Ajustements effectues par chaque coach\n3. Duels cles en cours et qui les gagne\n4. Quelle equipe controle le jeu et pourquoi\n5. Prediction tactique pour la fin: quels changements attendre\n\nTableaux HTML pour comparaisons. ' + L,
      scorers: 'Tu es un analyste football expert. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + '\n\nQui peut encore marquer dans ce match?\nPour chaque equipe, top 3 buteurs potentiels:\n- Nom, poste\n- Stats saison (buts, matches joues)\n- % probabilite de marquer avant la fin\n- Raison (forme, position sur le terrain)\n\nTableaux HTML par equipe. ' + L,
      assists: 'Tu es un analyste football expert. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + '\n\nQui peut encore faire une passe decisive?\nPour chaque equipe, top 3 passeurs potentiels:\n- Nom, poste\n- Passes decisives saison\n- % probabilite de passe decisive avant la fin\n- Raison\n\nTableaux HTML par equipe. ' + L,
      penalty: 'Tu es un analyste football expert. Match EN COURS: ' + m.home + ' vs ' + m.away + '.' + scoreInfo + '\n\nAnalyse penalties dans ce match:\n- Y a-t-il eu des penalties? Dans quelles circonstances?\n- Probabilite qu un autre penalty soit accorde avant la fin\n- Joueurs susceptibles de provoquer ou conceder un penalty\n- Tireurs de penalties des deux equipes\n\nTableaux si pertinent. ' + L
    };
    prompt = livePrompts[chapter];
  } else {
    var prePrompts = {
      pre: 'Tu es un analyste football expert avec acces a internet pour chercher les informations manquantes. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '.\n\nFournis un BRIEFING COMPLET en cherchant toutes les infos necessaires:\n\n1. FORME RECENTE - tableau des 5 derniers matchs de chaque equipe (adversaire, resultat, buts)\n2. CONFRONTATIONS DIRECTES - tableau des 5 derniers face-a-face avec resultats\n3. STATS COMPARATIVES - tableau: buts marques, buts encaisses, possession moyenne, xG moyen par match\n4. LE STADE - recherche le nom exact du stade de ' + m.home + ', sa capacite, son altitude, le taux de victoires a domicile de ' + m.home + ' cette saison dans ce stade, et si ce stade confere un avantage notable\n5. FAITS MARQUANTS - blessures importantes, suspensions, forme des joueurs cles\n\nSi une info n\'est pas disponible, cherche-la sur internet. Utilise des tableaux HTML pour toutes les donnees comparatives. ' + L,
      compo: 'Tu es un analyste football expert avec acces a internet. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '.\n\nFournis une ANALYSE TACTIQUE COMPLETE:\n1. Formation probable de ' + m.home + ' (cherche les compositions recentes): systeme, style de jeu, joueurs titulaires probables avec leurs roles\n2. Formation probable de ' + m.away + ': meme analyse\n3. Tableau comparatif des forces/faiblesses de chaque equipe\n4. Enjeux du match pour chaque equipe (tableau)\n5. Duel tactique cle: quel secteur sera decisif\n6. PREDICTION: score exact probable avec % de confiance et raisonnement detaille\n\nTableaux HTML obligatoires pour les comparaisons. ' + L,
      scorers: 'Tu es un analyste football expert avec acces a internet. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '.\n\nFournis les TOP 3 BUTEURS POTENTIELS de chaque equipe.\n\nPour chaque equipe, cree un tableau HTML avec:\n| Joueur | Poste | Buts saison | Derniers matchs (buts) | % 1ere MT | % 2eme MT | Raison |\n\nRecherche les stats reelles de la saison en cours. Ajoute une synthese sur qui est le plus susceptible de marquer. ' + L,
      assists: 'Tu es un analyste football expert avec acces a internet. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '.\n\nFournis les TOP 3 PASSEURS DECISIFS POTENTIELS de chaque equipe.\n\nPour chaque equipe, cree un tableau HTML avec:\n| Joueur | Poste | Passes dé saison | xA | Forme recente | % 1ere MT | % 2eme MT | Raison |\n\nRecherche les vraies stats. Ajoute une synthese. ' + L,
      penalty: 'Tu es un analyste football expert avec acces a internet. Match: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') le ' + m.date + '.\n\nANALYSE PENALTIES COMPLETE - recherche les vraies statistiques:\n\nTableau 1: Stats penalties cette saison\n| Equipe | Penalties obtenus | Taux/match | Penalties concedes | Conversion % |\n\nTableau 2: Joueurs cles\n| Joueur | Equipe | Role | Stat cle |\n\nEnsuite:\n- Probabilite globale d un penalty dans ce match: X%\n- Repartition: 1ere MT X% / 2eme MT X%\n- Quelle equipe en beneficiera le plus et pourquoi\n\n' + L
    };
    prompt = prePrompts[chapter];
  }

  if (!prompt) return res.status(400).json({ error: 'chapter invalide' });

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
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
    res.json({ text: text || 'Aucune reponse generee.' });
  })
  .catch(function(err) { res.status(500).json({ error: err.message }); });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
