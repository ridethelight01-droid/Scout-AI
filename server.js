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
const ODDS_API_KEY = process.env.ODDS_API_KEY || 'a905d67f8378867faba7dd5b9eca7805';
const ALLSPORTS_HOST = 'allsportsapi2.p.rapidapi.com';
const FOOTAPI_HOST = 'footapi7.p.rapidapi.com';

function allSports(endpoint) {
  return fetch('https://' + ALLSPORTS_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': ALLSPORTS_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

function footApi(endpoint) {
  return fetch('https://' + FOOTAPI_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': FOOTAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

function oddsApi(endpoint) {
  var sep = endpoint.indexOf('?') !== -1 ? '&' : '?';
  return fetch('https://api.the-odds-api.com' + endpoint + sep + 'apiKey=' + ODDS_API_KEY)
    .then(function(r) { return r.json(); }).catch(function() { return null; });
}

// ── TOUTES LES LIGUES DISPONIBLES ─────────────────────────────────────────
var SPORT_KEYS = [
  // Top 5 + Portugal D1
  'soccer_epl', 'soccer_france_ligue_one', 'soccer_spain_la_liga',
  'soccer_italy_serie_a', 'soccer_germany_bundesliga', 'soccer_portugal_primeira_liga',
  // D2 top 6
  'soccer_efl_champ', 'soccer_france_ligue_two', 'soccer_spain_segunda_division',
  'soccer_italy_serie_b', 'soccer_germany_bundesliga2',
  // Coupes
  'soccer_fa_cup', 'soccer_france_coupe_de_france', 'soccer_germany_dfb_pokal',
  // Europe D1
  'soccer_netherlands_eredivisie', 'soccer_belgium_first_div',
  'soccer_turkey_super_league', 'soccer_spl', 'soccer_league_of_ireland',
  'soccer_poland_ekstraklasa', 'soccer_greece_super_league',
  'soccer_switzerland_superleague', 'soccer_austria_bundesliga',
  'soccer_sweden_allsvenskan', 'soccer_denmark_superliga',
  'soccer_norway_eliteserien', 'soccer_finland_veikkausliiga',
  // Monde D1
  'soccer_saudi_arabia_pro_league', 'soccer_argentina_primera_division',
  'soccer_chile_campeonato', 'soccer_brazil_campeonato',
  'soccer_mexico_ligamx', 'soccer_usa_mls', 'soccer_japan_j_league',
  'soccer_korea_kleague1', 'soccer_china_superleague',
  'soccer_australia_aleague',
  // UEFA & FIFA
  'soccer_uefa_champs_league', 'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league', 'soccer_fifa_world_cup',
];

// Nom lisible par clé
var SPORT_NAMES = {
  'soccer_epl': 'Premier League',
  'soccer_france_ligue_one': 'Ligue 1',
  'soccer_spain_la_liga': 'LaLiga',
  'soccer_italy_serie_a': 'Serie A',
  'soccer_germany_bundesliga': 'Bundesliga',
  'soccer_portugal_primeira_liga': 'Primeira Liga',
  'soccer_efl_champ': 'Championship',
  'soccer_france_ligue_two': 'Ligue 2',
  'soccer_spain_segunda_division': 'Segunda División',
  'soccer_italy_serie_b': 'Serie B',
  'soccer_germany_bundesliga2': '2. Bundesliga',
  'soccer_fa_cup': 'FA Cup',
  'soccer_france_coupe_de_france': 'Coupe de France',
  'soccer_germany_dfb_pokal': 'DFB-Pokal',
  'soccer_netherlands_eredivisie': 'Eredivisie',
  'soccer_belgium_first_div': 'Belgian Pro League',
  'soccer_turkey_super_league': 'Süper Lig',
  'soccer_spl': 'Scottish Premiership',
  'soccer_league_of_ireland': 'League of Ireland',
  'soccer_poland_ekstraklasa': 'Ekstraklasa',
  'soccer_greece_super_league': 'Super League Greece',
  'soccer_switzerland_superleague': 'Swiss Super League',
  'soccer_austria_bundesliga': 'Austrian Bundesliga',
  'soccer_sweden_allsvenskan': 'Allsvenskan',
  'soccer_denmark_superliga': 'Danish Superliga',
  'soccer_norway_eliteserien': 'Eliteserien',
  'soccer_finland_veikkausliiga': 'Veikkausliiga',
  'soccer_saudi_arabia_pro_league': 'Saudi Pro League',
  'soccer_argentina_primera_division': 'Liga Profesional',
  'soccer_chile_campeonato': 'Campeonato Nacional',
  'soccer_brazil_campeonato': 'Brasileirao',
  'soccer_mexico_ligamx': 'Liga MX',
  'soccer_usa_mls': 'MLS',
  'soccer_japan_j_league': 'J1 League',
  'soccer_korea_kleague1': 'K League 1',
  'soccer_china_superleague': 'Chinese Super League',
  'soccer_australia_aleague': 'A-League',
  'soccer_uefa_champs_league': 'Champions League',
  'soccer_uefa_europa_league': 'Europa League',
  'soccer_uefa_europa_conference_league': 'Conference League',
  'soccer_fifa_world_cup': 'FIFA World Cup',
};

// ── HEALTH ────────────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY, oddsapi: !!ODDS_API_KEY });
});

// ── GET MATCHES ───────────────────────────────────────────────────────────
app.get('/api/matches', function(req, res) {
  var now = new Date();

  // Live via FootApi
  var livePromise = footApi('/api/matches/live')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.filter(function(e) {
        var name = e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '';
        return Object.values(SPORT_NAMES).indexOf(name) !== -1;
      }).map(function(e) {
        var m = {
          id: e.id,
          homeId: e.homeTeam ? e.homeTeam.id : null,
          awayId: e.awayTeam ? e.awayTeam.id : null,
          home: e.homeTeam ? e.homeTeam.name : '?',
          away: e.awayTeam ? e.awayTeam.name : '?',
          homeScore: (e.homeScore && e.homeScore.current !== undefined) ? e.homeScore.current : null,
          awayScore: (e.awayScore && e.awayScore.current !== undefined) ? e.awayScore.current : null,
          status: e.status ? e.status.description : '',
          statusType: 'live',
          tournament: e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '',
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
      });
    }).catch(function() { return []; });

  // Scheduled via The Odds API - toutes les ligues en parallèle
  var schedPromise = Promise.all(SPORT_KEYS.map(function(sportKey) {
    return oddsApi('/v4/sports/' + sportKey + '/odds?regions=eu&markets=h2h&dateFormat=unix&oddsFormat=decimal')
      .then(function(data) {
        if (!Array.isArray(data)) return [];
        return data.filter(function(e) {
          return new Date(e.commence_time * 1000) > now;
        }).map(function(e) {
          var d = new Date(e.commence_time * 1000);
          return {
            id: e.id,
            homeId: null, awayId: null,
            home: e.home_team,
            away: e.away_team,
            homeScore: null, awayScore: null,
            status: 'Not started', statusType: 'scheduled',
            tournament: SPORT_NAMES[sportKey] || sportKey,
            country: '',
            startTimestamp: e.commence_time,
            time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            dateLabel: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
          };
        });
      }).catch(function() { return []; });
  })).then(function(results) {
    var all = [];
    results.forEach(function(r) { all = all.concat(r); });
    // Dédoublonner et trier
    var seen = {};
    var unique = [];
    all.forEach(function(m) {
      var key = m.home + '_' + m.away + '_' + m.startTimestamp;
      if (!seen[key]) { seen[key] = true; unique.push(m); }
    });
    unique.sort(function(a,b) { return (a.startTimestamp||0) - (b.startTimestamp||0); });
    return unique;
  });

  Promise.all([livePromise, schedPromise]).then(function(r) {
    var live = r[0] || [];
    var sched = r[1] || [];
    res.json({ live: live, scheduled: sched, total: live.length + sched.length });
  });
});

// ── LINEUPS ───────────────────────────────────────────────────────────────
app.get('/api/lineups/:matchId', function(req, res) {
  allSports('/api/match/' + req.params.matchId + '/lineups')
    .then(function(data) {
      if (!data) return res.json({ home: null, away: null });
      var lineups = data.lineups || data;
      function fmt(t) {
        if (!t) return null;
        return {
          formation: t.formation || '?',
          players: (t.players || []).map(function(p) {
            return { name: p.player ? p.player.name : '?', position: p.position || '?', shirtNumber: p.shirtNumber || '?', substitute: p.substitute || false };
          })
        };
      }
      res.json({ home: fmt(lineups.home), away: fmt(lineups.away) });
    });
});

// ── TEAM RECENT ───────────────────────────────────────────────────────────
function getTeamRecent(teamId) {
  if (!teamId) return Promise.resolve([]);
  return allSports('/api/team/' + teamId + '/matches/previous/0')
    .then(function(data) {
      if (!data || !data.events) return [];
      var events = data.events.sort(function(a,b){ return (b.startTimestamp||0)-(a.startTimestamp||0); });
      return events.slice(0, 5).map(function(e) {
        var isHome = e.homeTeam && e.homeTeam.id === parseInt(teamId);
        var hs = e.homeScore ? e.homeScore.current : null;
        var as = e.awayScore ? e.awayScore.current : null;
        var result = '?';
        if (hs !== null && as !== null) {
          if (isHome) result = hs > as ? 'V' : hs < as ? 'D' : 'N';
          else result = as > hs ? 'V' : as < hs ? 'D' : 'N';
        }
        var d = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null;
        return {
          date: d ? d.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'}) : '?',
          opponent: isHome ? (e.awayTeam ? e.awayTeam.name : '?') : (e.homeTeam ? e.homeTeam.name : '?'),
          venue: isHome ? 'Dom.' : 'Ext.',
          score: (hs !== null ? hs : '?') + '-' + (as !== null ? as : '?'),
          result: result,
          competition: e.tournament ? (e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : e.tournament.name) : '?'
        };
      });
    });
}

// ── H2H ──────────────────────────────────────────────────────────────────
function getH2H(matchId) {
  if (!matchId) return Promise.resolve([]);
  return allSports('/api/match/' + matchId + '/h2h')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.slice(0, 5).map(function(e) {
        var d = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null;
        return {
          date: d ? d.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'}) : '?',
          home: e.homeTeam ? e.homeTeam.name : '?',
          away: e.awayTeam ? e.awayTeam.name : '?',
          score: (e.homeScore ? e.homeScore.current : '?') + '-' + (e.awayScore ? e.awayScore.current : '?'),
          competition: e.tournament ? (e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : e.tournament.name) : '?'
        };
      });
    });
}

// ── ANALYZE ───────────────────────────────────────────────────────────────
app.post('/api/analyze', function(req, res) {
  var chapter = req.body.chapter;
  var match = req.body.match;
  var lang = req.body.lang || 'fr';
  var isLive = req.body.isLive || false;
  var lineups = req.body.lineups || null;

  if (!chapter || !match) return res.status(400).json({ error: 'Paramètres manquants' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY manquante' });

  var m = match;

  Promise.all([getTeamRecent(m.homeId), getTeamRecent(m.awayId), getH2H(m.id)]).then(function(results) {
    var homeRecent = results[0] || [];
    var awayRecent = results[1] || [];
    var h2h = results[2] || [];

    function calcStats(matches) {
      var v=0,n=0,d=0,gf=0,ga=0;
      matches.forEach(function(m) {
        if(m.result==='V') v++; else if(m.result==='N') n++; else if(m.result==='D') d++;
        var p=m.score.split('-');
        if(p.length===2) {
          if(m.venue==='Dom.') { gf+=parseInt(p[0])||0; ga+=parseInt(p[1])||0; }
          else { gf+=parseInt(p[1])||0; ga+=parseInt(p[0])||0; }
        }
      });
      var tot=matches.length||1;
      return { form:matches.map(function(m){return m.result;}).join(''), v:v,n:n,d:d, avgGf:(gf/tot).toFixed(1), avgGa:(ga/tot).toFixed(1) };
    }

    var hs = calcStats(homeRecent);
    var as_ = calcStats(awayRecent);

    var dataBlock = '\n\n══════════════════════════\nDONNÉES RÉELLES\n══════════════════════════\n\n';
    dataBlock += '📊 5 DERNIERS MATCHS — ' + m.home + ':\n';
    if (homeRecent.length) {
      homeRecent.forEach(function(r){ dataBlock += '  '+r.date+' | '+r.venue+' vs '+r.opponent+' | '+r.score+' | '+r.result+' | '+r.competition+'\n'; });
      dataBlock += '  Forme: '+hs.form+' | '+hs.v+'V/'+hs.n+'N/'+hs.d+'D | Moy: '+hs.avgGf+' buts marqués, '+hs.avgGa+' encaissés\n';
    } else dataBlock += '  (non disponible)\n';

    dataBlock += '\n📊 5 DERNIERS MATCHS — ' + m.away + ':\n';
    if (awayRecent.length) {
      awayRecent.forEach(function(r){ dataBlock += '  '+r.date+' | '+r.venue+' vs '+r.opponent+' | '+r.score+' | '+r.result+' | '+r.competition+'\n'; });
      dataBlock += '  Forme: '+as_.form+' | '+as_.v+'V/'+as_.n+'N/'+as_.d+'D | Moy: '+as_.avgGf+' buts marqués, '+as_.avgGa+' encaissés\n';
    } else dataBlock += '  (non disponible)\n';

    if (h2h.length) {
      dataBlock += '\n⚔️ CONFRONTATIONS DIRECTES:\n';
      h2h.forEach(function(r){ dataBlock += '  '+r.date+' | '+r.home+' '+r.score+' '+r.away+' | '+r.competition+'\n'; });
    }

    var roundInfo = m.roundName || (m.round ? 'J.'+m.round : '');
    var scoreInfo = isLive ? '\n🔴 SCORE: '+m.homeScore+'-'+m.awayScore+' ('+m.status+')' : '';
    var lineupsBlock = '';
    if (lineups && lineups.home && lineups.away) {
      var ht=(lineups.home.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return '#'+p.shirtNumber+' '+p.name+'('+p.position+')';}).join(', ');
      var at=(lineups.away.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return '#'+p.shirtNumber+' '+p.name+'('+p.position+')';}).join(', ');
      lineupsBlock = '\n\n📋 COMPOS OFFICIELLES:\n'+m.home+' ['+lineups.home.formation+']: '+ht+'\n'+m.away+' ['+lineups.away.formation+']: '+at;
    }

    var L = lang==='fr' ? 'Réponds UNIQUEMENT en français.' : 'Respond ONLY in English.';
    var TABLE = 'Utilise des tableaux HTML pour toutes les données comparatives. Format: <table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>val</td></tr></tbody></table>. PAS de markdown avec |.';

    var header = 'Tu es un analyste football expert.'+scoreInfo+'\nMATCH: '+m.home+' vs '+m.away+' | '+m.tournament+' '+roundInfo+' | '+m.date+(m.time?' à '+m.time:'')+dataBlock+lineupsBlock+'\n\n';

    var prompts = {
      pre: header+'BRIEFING COMPLET:\n1. FORME RÉCENTE — tableau HTML: Date|Adversaire|Lieu|Score|Résultat|Compétition (chaque équipe)\n2. CONFRONTATIONS DIRECTES — tableau HTML: Date|Match|Score|Compétition\n3. STATS — tableau HTML: Critère|'+m.home+'|'+m.away+'\n4. STADE — nom, capacité, altitude, avantage domicile\n5. ENJEUX — ce que ce match représente\n\n'+TABLE+'\n'+L,
      compo: header+'ANALYSE TACTIQUE:\n1. SYSTÈME '+m.home+': formation, style, joueurs clés\n2. SYSTÈME '+m.away+': idem\n3. FORCES/FAIBLESSES — tableau HTML: Secteur|'+m.home+'|'+m.away+'|Avantage\n4. DUEL CLÉ\n5. PRÉDICTION: score + % confiance\n\n'+TABLE+'\n'+L,
      scorers: header+'TOP 3 BUTEURS par équipe.\nTableau '+m.home+': Joueur|Poste|Buts|Forme|% 1ère MT|% 2ème MT|Raison\nTableau '+m.away+': idem\nConclusion.\n\n'+TABLE+'\n'+L,
      assists: header+'TOP 3 PASSEURS par équipe.\nTableau '+m.home+': Joueur|Poste|Passes déc.|Rôle|% 1ère MT|% 2ème MT|Raison\nTableau '+m.away+': idem\n\n'+TABLE+'\n'+L,
      penalty: header+'ANALYSE PÉNALTYS:\nTableau stats: Équipe|Pén. obtenus|Taux/match|Pén. concédés|Conversion|Tireur\nTableau joueurs: Joueur|Équipe|Rôle|Stat\nProbabilité: X% | 1ère MT X% | 2ème MT X%\n\n'+TABLE+'\n'+L
    };

    var prompt = prompts[chapter];
    if (!prompt) return res.status(400).json({ error: 'chapter invalide' });

    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (data.error) return res.status(500).json({ error: data.error.message });
      var text = '';
      if (data.content) { for (var i=0;i<data.content.length;i++) { if(data.content[i].type==='text') text+=data.content[i].text; } }
      res.json({ text: text || 'Aucune réponse.' });
    })
    .catch(function(err){ res.status(500).json({ error: err.message }); });

  }).catch(function(err){ res.status(500).json({ error: err.message }); });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('SCOUT IA running on port ' + PORT); });
