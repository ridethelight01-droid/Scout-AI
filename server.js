const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY || 'a905d67f8378867faba7dd5b9eca7805';
const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const ALLSPORTS_HOST = 'allsportsapi2.p.rapidapi.com';
const BETS_HOST = 'betsapi2.p.rapidapi.com';
const FOOTAPI_HOST = 'footapi7.p.rapidapi.com';

function allSports(endpoint) {
  return fetch('https://' + ALLSPORTS_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': ALLSPORTS_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

function betsApi(endpoint) {
  return fetch('https://' + BETS_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': BETS_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

function footApi(endpoint) {
  return fetch('https://' + FOOTAPI_HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': FOOTAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

// ── WHITELIST STRICTE ─────────────────────────────────────────────────────
var WHITELIST = [
  // Top 5 + Portugal D1
  'premier league','laliga','la liga','serie a','bundesliga','ligue 1','primeira liga',
  // Top 5 + Portugal D2
  'championship','efl championship','laliga2','segunda división','segunda','serie b',
  '2. bundesliga','ligue 2','liga portugal 2','portugal segunda liga',
  // Coupes top 7
  'fa cup','copa del rey','coppa italia','dfb-pokal','coupe de france',
  'taça de portugal','taca de portugal','coupe de belgique','beker van belgië',
  // Europe D1
  'eredivisie','pro league','belgian pro league','jupiler pro league',
  'süper lig','super lig','türkiye super lig',
  'scottish premiership',
  'league of ireland','league of ireland premier division',
  'ekstraklasa','poland ekstraklasa',
  'liga i','romania liga i',
  'first professional football league','parva liga',
  'super league greece','super league 1',
  'nemzeti bajnokság i','nb i','hungary nb i',
  'czech first league',
  'prva liga','prvaliga','slovenian prva liga',
  'serbian superliga','super liga',
  'niké liga','nike liga',
  'ukrainian premier league',
  'swiss super league',
  'admiral bundesliga','austrian bundesliga',
  'hnl','croatia hnl','croatia 1.nl',
  'premier liga bih','premijer liga',
  'a lyga','lithuania a lyga',
  'virsliga','latvia virsliga',
  'meistriliiga','estonia meistriliiga',
  'veikkausliiga',
  'allsvenskan',
  'danish superliga','superligaen',
  'eliteserien',
  'erovnuli liga','georgia erovnuli liga',
  'a-league men','a-league','australia a-league',
  // Monde D1
  'saudi pro league','saudi arabia pro league',
  'liga profesional','liga profesional de fútbol',
  'campeonato nacional',
  'brasileirao','campeonato brasileiro série a',
  'categoría primera a','colombia primera a',
  'ligapro','liga pro',
  'mls','major league soccer',
  'liga mx','mexico liga mx',
  'botola pro',
  'dstv premiership',
  'j1 league',
  'k league 1',
  'chinese super league','china super league',
  // UEFA & FIFA
  'uefa champions league','champions league',
  'uefa europa league','europa league',
  'uefa europa conference league','conference league',
  'fifa world cup','world cup',
  'uefa super cup','fifa club world cup',
  'uefa european championship','uefa nations league',
  'copa américa','copa america',
];

function isAllowedLeague(name) {
  if (!name) return false;
  var n = name.toLowerCase().trim();
  for (var i = 0; i < WHITELIST.length; i++) {
    if (n === WHITELIST[i]) return true;
  }
  return false;
}

function isAllowed(e) {
  if (!e || !e.tournament) return false;
  var uname = e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '';
  var tname = e.tournament.name || '';
  return isAllowedLeague(uname) || isAllowedLeague(tname);
}

// ── HEALTH ────────────────────────────────────────────────────────────────
function oddsApi(endpoint) {
  return fetch('https://api.the-odds-api.com' + endpoint + '&apiKey=' + ODDS_API_KEY, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  }).then(function(r) { return r.json(); }).catch(function(e) { return { error: e.message }; });
}

app.get('/api/test-oddsapi', function(req, res) {
  // Lister tous les sports de football disponibles
  fetch('https://api.the-odds-api.com/v4/sports?apiKey=' + ODDS_API_KEY)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var soccer = Array.isArray(data) ? data.filter(function(s) {
        return s.group === 'Soccer' && s.active;
      }) : data;
      res.json({ total: Array.isArray(soccer) ? soccer.length : 0, sports: soccer });
    }).catch(function(err) { res.status(500).json({ error: err.message }); });
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

// ── TEST BETSAPI ──────────────────────────────────────────────────────────
app.get('/api/test-betsapi', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var page = req.query.page || 1;
  betsApi('/v1/bet365/upcoming?sport_id=1&page=' + page)
    .then(function(data) {
      if (!data) return res.json({ error: 'no response from BetsAPI' });
      var results = data.results || [];
      var real = results.filter(function(e) {
        return isAllowedLeague(e.league ? e.league.name : '');
      });
      res.json({
        page: page,
        pager: data.pager,
        total_on_page: results.length,
        real_on_page: real.length,
        real_leagues: real.map(function(e){ return e.league ? e.league.name : '?'; }),
        sample: results.slice(0,3).map(function(e){
          return { league: e.league ? e.league.name : '?', home: e.home ? e.home.name : '?', away: e.away ? e.away.name : '?' };
        })
      });
    });
});

// ── GET MATCHES ───────────────────────────────────────────────────────────
app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var now = Math.floor(Date.now() / 1000);

  // Live via FootApi
  var livePromise = footApi('/api/matches/live')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.filter(isAllowed).map(function(e) { return formatFootEvent(e, 'live'); });
    }).catch(function() { return []; });

  // Scheduled via BetsAPI (toutes les pages)
  var schedPromise = betsApi('/v1/bet365/upcoming?sport_id=1&page=1')
    .then(function(first) {
      if (!first) return [];
      var total = first.pager ? parseInt(first.pager.total) : 0;
      var perPage = first.pager ? parseInt(first.pager.per_page) : 50;
      var totalPages = Math.min(Math.ceil(total / perPage), 22);
      var promises = [Promise.resolve(first.results || [])];
      for (var p = 2; p <= totalPages; p++) {
        (function(page) {
          promises.push(
            betsApi('/v1/bet365/upcoming?sport_id=1&page=' + page)
              .then(function(d) { return d && d.results ? d.results : []; })
          );
        })(p);
      }
      return Promise.all(promises).then(function(pages) {
        var all = [];
        pages.forEach(function(r) { all = all.concat(r); });
        var seen = {};
        var matches = [];
        all.forEach(function(e) {
          if (seen[e.id]) return;
          seen[e.id] = true;
          var league = e.league ? e.league.name : '';
          if (!isAllowedLeague(league)) return;
          var ts = parseInt(e.time);
          if (ts <= now) return;
          var d = new Date(ts * 1000);
          matches.push({
            id: e.id,
            homeId: e.home ? e.home.id : null,
            awayId: e.away ? e.away.id : null,
            home: e.home ? e.home.name : '?',
            away: e.away ? e.away.name : '?',
            homeScore: null, awayScore: null,
            status: 'Not started', statusType: 'scheduled',
            tournament: league, country: '',
            startTimestamp: ts,
            time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            dateLabel: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
          });
        });
        matches.sort(function(a,b) { return a.startTimestamp - b.startTimestamp; });
        return matches;
      });
    }).catch(function() { return []; });

  Promise.all([livePromise, schedPromise]).then(function(r) {
    var live = r[0] || [];
    var sched = r[1] || [];
    // Dédoublonner
    var seenLive = {};
    live = live.filter(function(m) { if(seenLive[m.id]) return false; seenLive[m.id]=true; return true; });
    res.json({ live: live, scheduled: sched, total: live.length + sched.length });
  });
});

function formatFootEvent(e, type) {
  var m = {
    id: e.id,
    homeId: e.homeTeam ? e.homeTeam.id : null,
    awayId: e.awayTeam ? e.awayTeam.id : null,
    home: e.homeTeam ? e.homeTeam.name : '?',
    away: e.awayTeam ? e.awayTeam.name : '?',
    homeScore: (e.homeScore && e.homeScore.current !== undefined) ? e.homeScore.current : null,
    awayScore: (e.awayScore && e.awayScore.current !== undefined) ? e.awayScore.current : null,
    status: e.status ? e.status.description : '',
    statusType: type,
    tournament: e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : (e.tournament ? e.tournament.name : ''),
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

    function stats(matches) {
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

    var hs = stats(homeRecent);
    var as_ = stats(awayRecent);

    var dataBlock = '\n\n══════════════════════════\nDONNÉES RÉELLES (API)\n══════════════════════════\n\n';
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
    var TABLE = 'Utilise des tableaux HTML pour toutes les données comparatives: <table><thead><tr><th>Col</th></tr></thead><tbody><tr><td>val</td></tr></tbody></table>. PAS de tableaux markdown avec |.';

    var header = 'Tu es un analyste football expert.'+scoreInfo+'\nMATCH: '+m.home+' vs '+m.away+' | '+m.tournament+' '+roundInfo+' | '+m.date+(m.time?' à '+m.time:'')+dataBlock+lineupsBlock+'\n\n';

    var prompts = {
      pre: header+'BRIEFING COMPLET:\n1. FORME RÉCENTE — tableau HTML: Date|Adversaire|Lieu|Score|Résultat|Compétition (chaque équipe)\n2. CONFRONTATIONS DIRECTES — tableau HTML: Date|Match|Score|Compétition\n3. STATS — tableau HTML: Critère|'+m.home+'|'+m.away+'\n4. STADE — nom, capacité, altitude, avantage domicile\n5. ENJEUX — ce que ce match représente pour chaque équipe\n\n'+TABLE+'\n'+L,
      compo: header+'ANALYSE TACTIQUE:\n1. SYSTÈME '+m.home+': formation, style, joueurs clés\n2. SYSTÈME '+m.away+': idem\n3. TABLEAU FORCES/FAIBLESSES: Secteur|'+m.home+'|'+m.away+'|Avantage\n4. DUEL CLÉ\n5. PRÉDICTION: score + % confiance\n\n'+TABLE+'\n'+L,
      scorers: header+'TOP 3 BUTEURS par équipe.\nTableau '+m.home+': Joueur|Poste|Buts|Forme|% 1ère MT|% 2ème MT|Raison\nTableau '+m.away+': idem\nConclusion.\n\n'+TABLE+'\n'+L,
      assists: header+'TOP 3 PASSEURS par équipe.\nTableau '+m.home+': Joueur|Poste|Passes déc.|Rôle|% 1ère MT|% 2ème MT|Raison\nTableau '+m.away+': idem\n\n'+TABLE+'\n'+L,
      penalty: header+'ANALYSE PÉNALTYS:\nTableau stats: Équipe|Pén. obtenus|Taux/match|Pén. concédés|Conversion|Tireur\nTableau joueurs clés: Joueur|Équipe|Rôle|Stat\nProbabilité: X% | 1ère MT X% | 2ème MT X%\n\n'+TABLE+'\n'+L
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
