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
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

function isTopLevel(e) {
  if (!e.eventFilters || !e.eventFilters.level) return false;
  var levels = e.eventFilters.level;
  return levels.indexOf('top-competitions') !== -1 || levels.indexOf('pro') !== -1;
}

function formatMatch(e, type) {
  var m = {
    id: e.id,
    homeId: e.homeTeam ? e.homeTeam.id : null,
    awayId: e.awayTeam ? e.awayTeam.id : null,
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
      if (!data) return [];
      var events = data.events || [];
      return events.filter(function(e) {
        return isTopLevel(e) && e.startTimestamp && e.startTimestamp > now;
      }).map(function(e) { return formatMatch(e, 'scheduled'); });
    });
}

// ── GET MATCHES ───────────────────────────────────────────────────────────
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
      if (!data) return [];
      return (data.events||[]).filter(isTopLevel).map(function(e) { return formatMatch(e, 'live'); });
    });

  var scheduledPromise = fetchScheduledForDate(t.day, t.month, t.year, now)
    .then(function(m) { return m.length > 0 ? m : fetchScheduledForDate(tm.day, tm.month, tm.year, now); })
    .then(function(m) { return m.length > 0 ? m : fetchScheduledForDate(da.day, da.month, da.year, now); });

  Promise.all([livePromise, scheduledPromise]).then(function(results) {
    var live = results[0] || [];
    var sched = (results[1]||[]).sort(function(a,b){ return (a.startTimestamp||0)-(b.startTimestamp||0); });
    res.json({ live: live, scheduled: sched, total: live.length + sched.length });
  });
});

// ── GET LINEUPS ───────────────────────────────────────────────────────────
app.get('/api/lineups/:matchId', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });
  fetchAllSports('/api/match/' + req.params.matchId + '/lineups')
    .then(function(data) {
      if (!data) return res.json({ home: null, away: null });
      var lineups = data.lineups || data;
      function formatTeam(t) {
        if (!t) return null;
        return {
          formation: t.formation || '?',
          players: (t.players || []).map(function(p) {
            return { name: p.player ? p.player.name : '?', position: p.position || '?', shirtNumber: p.shirtNumber || '?', substitute: p.substitute || false };
          })
        };
      }
      res.json({ home: formatTeam(lineups.home), away: formatTeam(lineups.away) });
    });
});

// ── GET TEAM STATS (5 derniers matchs) ────────────────────────────────────
function getTeamRecentMatches(teamId) {
  if (!teamId) return Promise.resolve([]);
  return fetchAllSports('/api/team/' + teamId + '/matches/previous/0')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.slice(0, 5).map(function(e) {
        var isHome = e.homeTeam && e.homeTeam.id === teamId;
        return {
          date: e.startTimestamp ? new Date(e.startTimestamp * 1000).toLocaleDateString('fr-FR', {day:'numeric',month:'short'}) : '?',
          opponent: isHome ? (e.awayTeam ? e.awayTeam.name : '?') : (e.homeTeam ? e.homeTeam.name : '?'),
          venue: isHome ? 'Dom.' : 'Ext.',
          homeScore: e.homeScore ? e.homeScore.current : '?',
          awayScore: e.awayScore ? e.awayScore.current : '?',
          result: e.homeScore && e.awayScore ? (isHome
            ? (e.homeScore.current > e.awayScore.current ? 'V' : e.homeScore.current < e.awayScore.current ? 'D' : 'N')
            : (e.awayScore.current > e.homeScore.current ? 'V' : e.awayScore.current < e.homeScore.current ? 'D' : 'N')) : '?',
          score: (e.homeScore ? e.homeScore.current : '?') + '-' + (e.awayScore ? e.awayScore.current : '?'),
          tournament: e.tournament ? e.tournament.name : '?'
        };
      });
    });
}

// ── ANALYZE ───────────────────────────────────────────────────────────────
app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang;
  var isLive = req.body.isLive || false;
  var lineups = req.body.lineups || null;

  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configuree' });

  var m = match;

  // Récupérer les stats réelles des deux équipes en parallèle
  var statsPromise = Promise.all([
    getTeamRecentMatches(m.homeId),
    getTeamRecentMatches(m.awayId)
  ]);

  statsPromise.then(function(statsResults) {
    var homeMatches = statsResults[0] || [];
    var awayMatches = statsResults[1] || [];

    // Calculer stats résumées
    function calcStats(matches, teamName) {
      if (!matches.length) return { team: teamName, form: 'N/A', wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
      var wins=0, draws=0, losses=0, gf=0, ga=0;
      matches.forEach(function(m) {
        if (m.result==='V') wins++; else if(m.result==='N') draws++; else if(m.result==='D') losses++;
        var parts = m.score.split('-');
        if (parts.length === 2) {
          if (m.venue === 'Dom.') { gf += parseInt(parts[0])||0; ga += parseInt(parts[1])||0; }
          else { gf += parseInt(parts[1])||0; ga += parseInt(parts[0])||0; }
        }
      });
      return {
        team: teamName,
        form: matches.map(function(m){return m.result;}).join(' '),
        wins: wins, draws: draws, losses: losses,
        goalsFor: gf, goalsAgainst: ga,
        avgGoalsFor: (gf/matches.length).toFixed(1),
        avgGoalsAgainst: (ga/matches.length).toFixed(1)
      };
    }

    var homeStats = calcStats(homeMatches, m.home);
    var awayStats = calcStats(awayMatches, m.away);

    // Formatter les matchs récents en texte structuré
    function formatRecentMatches(matches, teamName) {
      if (!matches.length) return teamName + ': données non disponibles';
      return teamName + ' (5 derniers matchs):\n' + matches.map(function(match) {
        return '  ' + match.date + ' | ' + match.venue + ' vs ' + match.opponent + ' | ' + match.score + ' | ' + match.result + ' | ' + match.tournament;
      }).join('\n');
    }

    // Bloc compos
    var lineupsBlock = '';
    if (lineups && lineups.home && lineups.away) {
      var homeTitulaires = (lineups.home.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return p.shirtNumber+'.'+p.name+'('+p.position+')';}).join(', ');
      var awayTitulaires = (lineups.away.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return p.shirtNumber+'.'+p.name+'('+p.position+')';}).join(', ');
      lineupsBlock = '\n\nCOMPOSITIONS OFFICIELLES:\n' + m.home + ' [' + lineups.home.formation + ']: ' + homeTitulaires + '\n' + m.away + ' [' + lineups.away.formation + ']: ' + awayTitulaires;
    }

    var scoreInfo = isLive ? '\nSCORE ACTUEL: ' + m.homeScore + '-' + m.awayScore + ' (' + m.status + ')' : '';
    var L = lang === 'fr' ? 'Reponds UNIQUEMENT en francais.' : 'Respond ONLY in English.';

    // Données réelles injectées dans le prompt
    var realData = '\n\nDONNEES REELLES DE LA SAISON:\n' +
      formatRecentMatches(homeMatches, m.home) + '\n\n' +
      formatRecentMatches(awayMatches, m.away) + '\n\n' +
      'STATS RESUMEES (5 derniers matchs):\n' +
      m.home + ': Forme=' + homeStats.form + ' | V/N/D=' + homeStats.wins+'/'+homeStats.draws+'/'+homeStats.losses + ' | Moy buts: ' + homeStats.avgGoalsFor + ' marqués, ' + homeStats.avgGoalsAgainst + ' encaissés\n' +
      m.away + ': Forme=' + awayStats.form + ' | V/N/D=' + awayStats.wins+'/'+awayStats.draws+'/'+awayStats.losses + ' | Moy buts: ' + awayStats.avgGoalsFor + ' marqués, ' + awayStats.avgGoalsAgainst + ' encaissés';

    var prompts = {
      pre: 'Tu es un analyste football expert de haut niveau.' + scoreInfo + '\n\nMATCH: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') | ' + m.date + realData + lineupsBlock + '\n\nEn te basant sur ces données réelles, fournis un BRIEFING COMPLET:\n\n1. FORME RÉCENTE — tableau HTML des 5 derniers matchs de chaque équipe avec résultats\n2. STATS COMPARATIVES — tableau HTML: Critère | ' + m.home + ' | ' + m.away + ' (buts marqués/encaissés moy, forme, V/N/D)\n3. LE STADE — nom du stade de ' + m.home + ', capacité, altitude, avantage domicile notable, taux de victoires à domicile cette saison\n4. BLESSURES & SUSPENSIONS — joueurs absents importants de chaque équipe\n5. ENJEUX — ce que ce match représente pour chaque équipe (titre, maintien, coupe, derby)\n\nUtilise des tableaux HTML pour toutes les données comparatives. ' + L,

      compo: 'Tu es un analyste football expert de haut niveau.' + scoreInfo + '\n\nMATCH: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') | ' + m.date + realData + lineupsBlock + '\n\nANALYSE TACTIQUE COMPLETE:\n\n1. SYSTÈME ' + m.home + ' — formation ' + (lineups&&lineups.home?lineups.home.formation:'probable') + ', style de jeu, bloc défensif, construction, joueurs clés et leurs rôles\n2. SYSTÈME ' + m.away + ' — même analyse complète\n3. TABLEAU COMPARATIF — tableau HTML: Secteur | ' + m.home + ' | ' + m.away + ' | Avantage (Défense, Milieu, Attaque, Pressing, Set pieces)\n4. DUEL CLÉ — le matchup individuel le plus important du match\n5. SCÉNARIO & PRÉDICTION — score exact probable avec % de confiance, raisonnement basé sur les données réelles\n\nTableaux HTML obligatoires. ' + L,

      scorers: 'Tu es un analyste football expert de haut niveau.' + scoreInfo + '\n\nMATCH: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') | ' + m.date + realData + lineupsBlock + '\n\nTOP 3 BUTEURS POTENTIELS par équipe.\n\nTableau HTML ' + m.home + ':\n| Joueur | Poste | Buts saison | Forme (derniers matchs) | % 1ère MT | % 2ème MT | Raison principale |\n\nTableau HTML ' + m.away + ' (même structure)\n\nSynthèse finale: qui est le plus susceptible de marquer et pourquoi.\n\n' + L,

      assists: 'Tu es un analyste football expert de haut niveau.' + scoreInfo + '\n\nMATCH: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') | ' + m.date + realData + lineupsBlock + '\n\nTOP 3 PASSEURS DÉCISIFS POTENTIELS par équipe.\n\nTableau HTML ' + m.home + ':\n| Joueur | Poste | Passes déc. saison | Rôle créatif | % 1ère MT | % 2ème MT | Raison |\n\nTableau HTML ' + m.away + ' (même structure)\n\nSynthèse: qui va créer le danger.\n\n' + L,

      penalty: 'Tu es un analyste football expert de haut niveau.' + scoreInfo + '\n\nMATCH: ' + m.home + ' vs ' + m.away + ' (' + m.leagueName + ') | ' + m.date + realData + lineupsBlock + '\n\nANALYSE PÉNALTYS COMPLÈTE:\n\nTableau 1 — Stats pénaltys saison:\n| Équipe | Pén. obtenus | Taux/match | Pén. concédés | Conversion % | Tireur principal |\n\nTableau 2 — Joueurs à surveiller:\n| Joueur | Équipe | Rôle | Statistique clé |\n\nConclusion:\n- Probabilité globale d\'un pénalty: X%\n- Répartition: 1ère MT X% / 2ème MT X%\n- Quelle équipe en bénéficiera le plus et pourquoi\n\n' + L
    };

    var prompt = prompts[chapter];
    if (!prompt) return res.status(400).json({ error: 'chapter invalide' });

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
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

  }).catch(function(err) {
    res.status(500).json({ error: err.message });
  });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
