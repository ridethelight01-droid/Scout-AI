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
const FOOTAPI_HOST = 'footapi7.p.rapidapi.com';

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

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

// ── FILTRE STRICT PAR PAYS ────────────────────────────────────────────────
// Pays autorisés avec leurs noms tels qu'ils apparaissent dans l'API
var ALLOWED_COUNTRIES = {
  // Europe top
  'England': 'd1+d2+cup',
  'France': 'd1+d2+cup',
  'Spain': 'd1+d2+cup',
  'Italy': 'd1+d2+cup',
  'Germany': 'd1+d2+cup',
  'Portugal': 'd1+d2+cup',
  'Belgium': 'd1+cup',
  // Europe secondaire D1 seulement
  'Ireland': 'd1',
  'Scotland': 'd1',
  'Netherlands': 'd1',
  'Hungary': 'd1',
  'Poland': 'd1',
  'Romania': 'd1',
  'Bulgaria': 'd1',
  'Greece': 'd1',
  'Turkey': 'd1',
  'Czech Republic': 'd1',
  'Czechia': 'd1',
  'Slovenia': 'd1',
  'Serbia': 'd1',
  'Slovakia': 'd1',
  'Ukraine': 'd1',
  'Switzerland': 'd1',
  'Austria': 'd1',
  'Croatia': 'd1',
  'Bosnia': 'd1',
  'Bosnia & Herzegovina': 'd1',
  'Lithuania': 'd1',
  'Latvia': 'd1',
  'Estonia': 'd1',
  'Finland': 'd1',
  'Sweden': 'd1',
  'Denmark': 'd1',
  'Norway': 'd1',
  'Georgia': 'd1',
  'Australia': 'd1',
  // Monde D1
  'Saudi Arabia': 'd1',
  'Argentina': 'd1',
  'Chile': 'd1',
  'Brazil': 'd1',
  'Colombia': 'd1',
  'Ecuador': 'd1',
  'USA': 'd1',
  'Mexico': 'd1',
  'Morocco': 'd1',
  'South Africa': 'd1',
  'Japan': 'd1',
  'South Korea': 'd1',
  'China': 'd1',
};

// Mots-clés qui indiquent une D2
var D2_KEYWORDS = ['championship', 'segunda', 'serie b', '2. bundesliga', 'ligue 2', 'liga portugal 2', 'second', '2nd division', 'division 2'];
// Mots-clés qui indiquent une coupe nationale
var CUP_KEYWORDS = ['fa cup', 'copa del rey', 'coppa italia', 'dfb-pokal', 'coupe de france', 'taca de portugal', 'coupe de belgique', 'beker van'];
// Compétitions internationales toujours autorisées
var INTL_KEYWORDS = ['champions league', 'europa league', 'conference league', 'world cup', 'super cup', 'club world cup', 'nations league', 'euro', 'copa america'];

// Mots-clés qui EXCLUENT un tournoi (ligues amateurs, régionales, jeunes)
var EXCLUDE_KEYWORDS = [
  'amateur', 'reserve', 'youth', 'u21', 'u20', 'u19', 'u18', 'u17', 'u16', 'u15',
  'women', 'ladies', 'female', 'féminin', 'feminine',
  'veterans', 'veteran', 'masters',
  'regional', 'district', 'county', 'local', 'division',
  'league two', 'league one', 'league 1', 'league 2', 'league three',
  'national league', 'conference',
  'cheshire', 'lancashire', 'yorkshire', 'midlands',
  'super league', // sauf Super League Greece et Swiss Super League
  'premiership', // sauf Scottish Premiership
];

// Noms EXACTS autorisés (whitelist stricte)
var WHITELIST = [
  // Top 5 + Portugal D1
  'premier league', 'laliga', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'primeira liga',
  // Top 5 + Portugal D2
  'championship', 'efl championship', 'segunda división', 'laliga2', 'serie b', '2. bundesliga', 'ligue 2', 'liga portugal 2', 'liga portugal betclic',
  // Coupes top 7
  'fa cup', 'copa del rey', 'coppa italia', 'dfb-pokal', 'coupe de france', 'taça de portugal', 'taca de portugal', 'coupe de belgique', 'beker van belgië',
  // Belgique D1
  'pro league', 'belgian pro league', 'jupiler pro league',
  // Europe D1
  'eredivisie', 'scottish premiership', 'premiership', // Ecosse
  'league of ireland premier division', 'league of ireland',
  'ekstraklasa', 'liga i', 'first professional football league', 'parva liga',
  'super league greece', 'super league 1', // Grèce seulement
  'süper lig', 'super lig',
  'nemzeti bajnokság i', 'nb i', 'otp bank liga',
  'czech first league', 'fortuna liga',
  'prva liga', 'slovenian prva liga', 'prvaliga',
  'super liga', 'serbian superliga', 'superliga serbia',
  'niké liga', 'nike liga', 'fortuna liga slovakia',
  'ukrainian premier league', 'premier liga ukraine',
  'swiss super league', 'super league switzerland',
  'admiral bundesliga', 'austrian bundesliga', 'österreichische bundesliga',
  'hnl', 'supersport hnl', 'croatian football league',
  'premier liga bih', 'premijer liga', 'bosnia premier league',
  'a lyga', 'lithuanian a lyga',
  'virsliga', 'latvian higher league', 'virslīga',
  'meistriliiga', 'estonian meistriliiga',
  'veikkausliiga', 'finnish premier league',
  'allsvenskan', 'swedish allsvenskan',
  'danish superliga', 'superligaen',
  'eliteserien', 'norwegian eliteserien',
  'erovnuli liga', 'georgian erovnuli liga',
  'a-league men', 'a-league',
  // Monde D1
  'saudi pro league', 'roshn saudi league',
  'liga profesional de fútbol', 'liga profesional', 'liga profesional argentina',
  'campeonato nacional chile', 'primera división chile',
  'campeonato brasileiro série a', 'brasileirão', 'brasileirao serie a',
  'categoría primera a', 'liga betplay dimayor',
  'ligapro serie a', 'liga pro ecuador',
  'major league soccer', 'mls',
  'liga mx', 'liga bbva mx',
  'botola pro', 'inwi botola pro',
  'dstv premiership', 'south african premiership',
  'j1 league', 'meiji yasuda j1 league',
  'k league 1',
  'chinese super league', 'csl',
  // UEFA & FIFA
  'uefa champions league', 'champions league',
  'uefa europa league', 'europa league',
  'uefa europa conference league', 'conference league',
  'fifa world cup', 'world cup',
  'uefa super cup', 'supercup',
  'fifa club world cup', 'club world cup',
  'uefa european championship', 'euro',
  'uefa nations league', 'nations league',
  'copa américa', 'copa america',
  'afc champions league elite', 'afc champions league',
];

function isAllowed(e) {
  if (!e.tournament) return false;
  var uname = e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '';
  var tname = e.tournament.name || '';
  var name = (uname || tname).toLowerCase().trim();
  if (!name) return false;
  // Vérifier whitelist exacte
  for (var i = 0; i < WHITELIST.length; i++) {
    if (name === WHITELIST[i]) return true;
  }
  return false;
}

// ── DEBUG ─────────────────────────────────────────────────────────────────
app.get('/api/debug-raw', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var d = new Date(); d.setDate(d.getDate() + 3);
  var day = String(d.getDate()).padStart(2,'0');
  var mo = String(d.getMonth()+1).padStart(2,'0');
  var yr = d.getFullYear();
  allSports('/api/category/1/matches/' + day + '/' + mo + '/' + yr)
    .then(function(data) {
      var events = data && data.events ? data.events : [];
      var sample = events.slice(0,5).map(function(e){
        return {
          home: e.homeTeam ? e.homeTeam.name : '?',
          away: e.awayTeam ? e.awayTeam.name : '?',
          tournament: e.tournament ? e.tournament.name : '?',
          uniqueTournament: e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '?',
          country: e.tournament && e.tournament.category ? e.tournament.category.name : '?',
          allowed: isAllowed(e)
        };
      });
      res.json({ total: events.length, date: day+'/'+mo+'/'+yr, sample: sample });
    });
});

app.get('/api/debug-tournaments', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var promises = [];
  for (var i = 0; i < 5; i++) {
    (function(offset) {
      var d = new Date(); d.setDate(d.getDate() + offset);
      var day = String(d.getDate()).padStart(2,'0');
      var mo = String(d.getMonth()+1).padStart(2,'0');
      var yr = d.getFullYear();
      promises.push(
        footApi('/api/matches/' + day + '/' + mo + '/' + yr)
          .then(function(data) { return data && data.events ? data.events : []; })
      );
    })(i);
  }
  Promise.all(promises).then(function(results) {
    var seen = {};
    results.forEach(function(events) {
      events.forEach(function(e) {
        var uname = e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : (e.tournament ? e.tournament.name : '');
        var country = e.tournament && e.tournament.category ? e.tournament.category.name : '';
        if (uname && !seen[uname]) seen[uname] = country;
      });
    });
    var list = Object.keys(seen).sort(function(a,b){ return seen[a].localeCompare(seen[b]); })
      .map(function(name) { return { country: seen[name], tournament: name, allowed: isAllowed({tournament:{uniqueTournament:{name:name},category:{name:seen[name]}}}) }; });
    res.json({ total: list.length, allowed: list.filter(function(x){return x.allowed;}).length, tournaments: list });
  });
});

// ── GET MATCHES ───────────────────────────────────────────────────────────
app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var now = Math.floor(Date.now() / 1000);

  function getDay(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    return { day: String(d.getDate()).padStart(2,'0'), mo: String(d.getMonth()+1).padStart(2,'0'), yr: d.getFullYear() };
  }

  var livePromise = footApi('/api/matches/live')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.filter(isAllowed).map(function(e) { return formatEvent(e, 'live'); });
    });

  function fetchDay(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    var day = String(d.getDate()).padStart(2,'0');
    var mo = String(d.getMonth()+1).padStart(2,'0');
    var yr = d.getFullYear();
    // FootApi retourne tous les pays
    return footApi('/api/matches/' + day + '/' + mo + '/' + yr)
      .then(function(data) {
        if (!data || !data.events) return [];
        return data.events.filter(function(e) {
          return isAllowed(e) && e.startTimestamp && e.startTimestamp > now;
        }).map(function(e) { return formatEvent(e, 'scheduled'); });
      });
  }

  // Récupérer TOUS les jours en parallèle et tout combiner
  var schedPromise = Promise.all([fetchDay(0), fetchDay(1), fetchDay(2), fetchDay(3)])
    .then(function(results) {
      var all = [];
      results.forEach(function(matches) { all = all.concat(matches); });
      return all;
    });

  Promise.all([livePromise, schedPromise]).then(function(r) {
    var live = r[0] || [];
    var schedRaw = r[1] || [];
    // Dédoublonner par ID
    var seen = {};
    var sched = [];
    schedRaw.forEach(function(m) {
      if (!seen[m.id]) { seen[m.id] = true; sched.push(m); }
    });
    sched.sort(function(a,b){ return (a.startTimestamp||0)-(b.startTimestamp||0); });
    // Dédoublonner live aussi
    var seenLive = {};
    var liveClean = [];
    live.forEach(function(m) {
      if (!seenLive[m.id]) { seenLive[m.id] = true; liveClean.push(m); }
    });
    res.json({ live: liveClean, scheduled: sched, total: liveClean.length + sched.length });
  });
});

function formatEvent(e, type) {
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

// ── TEAM RECENT MATCHES ───────────────────────────────────────────────────
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
    var TABLE = 'Pour TOUTES les données comparatives, utilise des tableaux HTML avec cette structure exacte: <table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>val1</td><td>val2</td></tr></tbody></table>. PAS de tableaux markdown avec |.';

    var header = 'Tu es un analyste football expert de haut niveau.'+scoreInfo+'\nMATCH: '+m.home+' vs '+m.away+' | '+m.tournament+' '+roundInfo+' | '+m.date+(m.time?' à '+m.time:'')+dataBlock+lineupsBlock+'\n\n';

    var prompts = {
      pre: header+'BRIEFING COMPLET:\n1. FORME RÉCENTE — tableau HTML: Date|Adversaire|Lieu|Score|Résultat|Compétition (pour chaque équipe)\n2. CONFRONTATIONS DIRECTES — tableau HTML: Date|Match|Score|Compétition\n3. STATS — tableau HTML: Critère|'+m.home+'|'+m.away+' (V/N/D, moy buts marqués/encaissés, forme)\n4. STADE — nom du stade de '+m.home+', capacité, altitude si notable, avantage domicile\n5. ENJEUX — ce que ce match représente pour chaque équipe selon '+m.tournament+' '+roundInfo+'\n\n'+TABLE+'\n'+L,
      compo: header+'ANALYSE TACTIQUE:\n1. SYSTÈME '+m.home+' ['+( lineups&&lineups.home?lineups.home.formation:'?')+']: style, pressing, construction, joueurs clés\n2. SYSTÈME '+m.away+' ['+(lineups&&lineups.away?lineups.away.formation:'?')+']: idem\n3. TABLEAU FORCES/FAIBLESSES: Secteur|'+m.home+'|'+m.away+'|Avantage\n4. DUEL CLÉ individuel le plus important\n5. PRÉDICTION: score exact + % confiance + raisonnement\n\n'+TABLE+'\n'+L,
      scorers: header+'TOP 3 BUTEURS POTENTIELS par équipe.\nTableau HTML '+m.home+': Joueur|Poste|Buts saison|Forme récente|% 1ère MT|% 2ème MT|Raison\nTableau HTML '+m.away+' (même structure)\nConclusion: favori pour marquer.\n\n'+TABLE+'\n'+L,
      assists: header+'TOP 3 PASSEURS DÉCISIFS POTENTIELS par équipe.\nTableau HTML '+m.home+': Joueur|Poste|Passes déc.|Rôle|% 1ère MT|% 2ème MT|Raison\nTableau HTML '+m.away+' (même structure)\n\n'+TABLE+'\n'+L,
      penalty: header+'ANALYSE PÉNALTYS:\nTableau 1 — Stats: Équipe|Pén. obtenus|Taux/match|Pén. concédés|Conversion|Tireur principal\nTableau 2 — Joueurs clés: Joueur|Équipe|Rôle|Stat clé\nProbabilité: X% total | 1ère MT X% | 2ème MT X%\nConclusion.\n\n'+TABLE+'\n'+L
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
