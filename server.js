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
const HOST = 'footapi7.p.rapidapi.com';


// ── FILTRE DES TOURNOIS ───────────────────────────────────────────────────
// Pas de filtre pour l'instant - on affiche tout pour voir les vrais noms
function isAllowedTournament(e) {
  return true; // temporaire
}

function footApi(endpoint) {
  return fetch('https://' + HOST + endpoint, {
    method: 'GET',
    headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
}

// ── DIAGNOSTIC: liste tous les tournois uniques du jour ──────────────────
app.get('/api/debug-tournaments', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'no key' });
  var today = new Date();
  var day = String(today.getDate()).padStart(2,'0');
  var month = String(today.getMonth()+1).padStart(2,'0');
  var year = today.getFullYear();
  footApi('/api/matches/' + day + '/' + month + '/' + year)
    .then(function(data) {
      var events = data && data.events ? data.events : [];
      var seen = {};
      events.forEach(function(e) {
        var uname = e.tournament && e.tournament.uniqueTournament ? e.tournament.uniqueTournament.name : '';
        var country = e.tournament && e.tournament.category ? e.tournament.category.name : '';
        if (uname && !seen[uname]) {
          seen[uname] = country;
        }
      });
      // Trier par pays
      var list = Object.keys(seen).sort(function(a,b){
        return seen[a].localeCompare(seen[b]);
      }).map(function(name) {
        return { country: seen[name], tournament: name };
      });
      res.json({ total: list.length, tournaments: list });
    });
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

function isTopLevel(e) {
  return isAllowedTournament(e);
}

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
    statusCode: e.status ? e.status.code : 0,
    statusType: type,
    tournament: e.tournament ? e.tournament.name : '',
    tournamentId: e.tournament ? e.tournament.id : null,
    country: e.tournament && e.tournament.category ? e.tournament.category.name : '',
    seasonId: e.season ? e.season.id : null,
    round: e.roundInfo ? e.roundInfo.round : null,
    roundName: e.roundInfo ? e.roundInfo.name : null,
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

// ── GET MATCHES ───────────────────────────────────────────────────────────
app.get('/api/matches', function(req, res) {
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configuree' });

  var now = Math.floor(Date.now() / 1000);

  function getDateStr(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  }

  function fetchDay(offset) {
    return footApi('/api/matches/' + getDateStr(offset))
      .then(function(data) { return data && data.events ? data.events : []; });
  }

  Promise.all([fetchDay(0), fetchDay(1), fetchDay(2)]).then(function(results) {
    var all = [];
    results.forEach(function(arr) { all = all.concat(arr); });

    var live = [];
    var scheduled = [];

    all.forEach(function(e) {
      if (!isTopLevel(e)) return;
      var code = e.status ? e.status.code : 0;
      // Live: en cours (codes 6=1st half, 7=2nd half, 31=HT, 41-43=extra, 60=penalties)
      if (code === 6 || code === 7 || code === 31 || code === 41 || code === 42 || code === 43 || code === 60) {
        live.push(formatEvent(e, 'live'));
      }
      // Scheduled: pas commencé (code 0) et dans le futur
      else if ((code === 0 || code === 70) && e.startTimestamp && e.startTimestamp > now) {
        scheduled.push(formatEvent(e, 'scheduled'));
      }
    });

    scheduled.sort(function(a,b) { return (a.startTimestamp||0) - (b.startTimestamp||0); });

    res.json({ live: live, scheduled: scheduled, total: live.length + scheduled.length });
  });
});

// ── GET LINEUPS ───────────────────────────────────────────────────────────
app.get('/api/lineups/:matchId', function(req, res) {
  footApi('/api/match/' + req.params.matchId + '/lineups')
    .then(function(data) {
      if (!data) return res.json({ home: null, away: null });
      function fmt(t) {
        if (!t) return null;
        return {
          formation: t.formation || '?',
          players: (t.players || []).map(function(p) {
            return { name: p.player ? p.player.name : '?', position: p.position || '?', shirtNumber: p.shirtNumber || '?', substitute: p.substitute || false };
          })
        };
      }
      res.json({ home: fmt(data.home), away: fmt(data.away) });
    });
});

// ── GET TEAM RECENT MATCHES ───────────────────────────────────────────────
function getTeamRecent(teamId) {
  if (!teamId) return Promise.resolve([]);
  return footApi('/api/team/' + teamId + '/matches/previous/0')
    .then(function(data) {
      if (!data || !data.events) return [];
      // Trier par date décroissante et prendre les 5 plus récents
      var events = data.events.sort(function(a,b) { return (b.startTimestamp||0) - (a.startTimestamp||0); });
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
          competition: e.tournament ? e.tournament.name : '?'
        };
      });
    });
}

// ── GET HEAD TO HEAD ──────────────────────────────────────────────────────
function getH2H(matchId) {
  if (!matchId) return Promise.resolve([]);
  return footApi('/api/match/' + matchId + '/h2h')
    .then(function(data) {
      if (!data || !data.events) return [];
      return data.events.slice(0, 5).map(function(e) {
        var d = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null;
        return {
          date: d ? d.toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'}) : '?',
          home: e.homeTeam ? e.homeTeam.name : '?',
          away: e.awayTeam ? e.awayTeam.name : '?',
          score: (e.homeScore ? e.homeScore.current : '?') + '-' + (e.awayScore ? e.awayScore.current : '?'),
          competition: e.tournament ? e.tournament.name : '?'
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

  // Récupérer stats réelles en parallèle
  Promise.all([
    getTeamRecent(m.homeId),
    getTeamRecent(m.awayId),
    getH2H(m.id)
  ]).then(function(results) {
    var homeRecent = results[0] || [];
    var awayRecent = results[1] || [];
    var h2h = results[2] || [];

    // Stats résumées
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
      var tot = matches.length || 1;
      return { form: matches.map(function(m){return m.result;}).join(''), v:v, n:n, d:d, gf:gf, ga:ga, avgGf:(gf/tot).toFixed(1), avgGa:(ga/tot).toFixed(1) };
    }

    var hs = stats(homeRecent);
    var as_ = stats(awayRecent);

    // Construire le bloc de données réelles
    var dataBlock = '\n\n══════════════════════════════\nDONNÉES RÉELLES (API live)\n══════════════════════════════\n';

    // Forme récente
    dataBlock += '\n📊 5 DERNIERS MATCHS — ' + m.home + ':\n';
    if (homeRecent.length) {
      homeRecent.forEach(function(r) {
        dataBlock += '  ' + r.date + ' | ' + r.venue + ' | vs ' + r.opponent + ' | ' + r.score + ' | ' + r.result + '\n';
      });
      dataBlock += '  Forme: ' + hs.form + ' | ' + hs.v + 'V/' + hs.n + 'N/' + hs.d + 'D | Moy: ' + hs.avgGf + ' buts/match marqués, ' + hs.avgGa + ' encaissés\n';
    } else { dataBlock += '  (données non disponibles)\n'; }

    dataBlock += '\n📊 5 DERNIERS MATCHS — ' + m.away + ':\n';
    if (awayRecent.length) {
      awayRecent.forEach(function(r) {
        dataBlock += '  ' + r.date + ' | ' + r.venue + ' | vs ' + r.opponent + ' | ' + r.score + ' | ' + r.result + '\n';
      });
      dataBlock += '  Forme: ' + as_.form + ' | ' + as_.v + 'V/' + as_.n + 'N/' + as_.d + 'D | Moy: ' + as_.avgGf + ' buts/match marqués, ' + as_.avgGa + ' encaissés\n';
    } else { dataBlock += '  (données non disponibles)\n'; }

    // H2H
    if (h2h.length) {
      dataBlock += '\n⚔️ CONFRONTATIONS DIRECTES (5 dernières):\n';
      h2h.forEach(function(r) {
        dataBlock += '  ' + r.date + ' | ' + r.home + ' ' + r.score + ' ' + r.away + ' | ' + r.competition + '\n';
      });
    }

    // Infos match
    var roundInfo = m.roundName ? m.roundName : (m.round ? 'J.' + m.round : '');
    var scoreInfo = isLive ? '\n🔴 SCORE EN DIRECT: ' + m.homeScore + '-' + m.awayScore + ' (' + m.status + ')' : '';

    // Compos
    var lineupsBlock = '';
    if (lineups && lineups.home && lineups.away) {
      var ht = (lineups.home.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return '#'+p.shirtNumber+' '+p.name+'('+p.position+')';}).join(', ');
      var at = (lineups.away.players||[]).filter(function(p){return !p.substitute;}).map(function(p){return '#'+p.shirtNumber+' '+p.name+'('+p.position+')';}).join(', ');
      lineupsBlock = '\n\n📋 COMPOS OFFICIELLES:\n' + m.home + ' [' + lineups.home.formation + ']: ' + ht + '\n' + m.away + ' [' + lineups.away.formation + ']: ' + at;
    }

    var L = lang === 'fr' ? 'Réponds UNIQUEMENT en français.' : 'Respond ONLY in English.';
    var tableInstruction = 'Utilise des tableaux HTML compacts et bien designés pour TOUTES les données comparatives. Format: <table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>';

    var header = 'Tu es un analyste football expert de haut niveau. ' + scoreInfo + '\nMATCH: ' + m.home + ' vs ' + m.away + ' | ' + m.tournament + ' ' + roundInfo + ' | ' + m.date + (m.time?' à '+m.time:'') + dataBlock + lineupsBlock + '\n\n';

    var prompts = {
      pre: header + 'BRIEFING COMPLET AVANT MATCH:\n\n1. FORME RÉCENTE — tableau HTML compact: Date | Adversaire | Lieu | Score | Résultat | Compétition (pour chaque équipe)\n2. CONFRONTATIONS DIRECTES — tableau HTML: Date | Match | Score | Compétition\n3. STATS COMPARATIVES — tableau HTML: Critère | ' + m.home + ' | ' + m.away + ' (forme, V/N/D, moy buts marqués/encaissés)\n4. LE STADE — donne le nom exact du stade de ' + m.home + ', sa capacité, son altitude si notable, et l\'avantage domicile de cette équipe\n5. ENJEUX DU MATCH — en te basant sur ' + m.tournament + ' ' + roundInfo + ', explique ce que ce match représente pour chaque équipe (titre, maintien, coupe, barrage, élimination directe)\n\n' + tableInstruction + '\n' + L,

      compo: header + 'ANALYSE TACTIQUE:\n\n1. SYSTÈME ' + m.home + ' [' + (lineups&&lineups.home?lineups.home.formation:'?') + '] — style de jeu, pressing, construction, joueurs clés et leurs rôles\n2. SYSTÈME ' + m.away + ' [' + (lineups&&lineups.away?lineups.away.formation:'?') + '] — même analyse\n3. TABLEAU FORCES/FAIBLESSES — tableau HTML: Secteur | ' + m.home + ' | ' + m.away + ' | Avantage (Défense, Milieu, Attaque, Vitesse, Set pieces, Pressing)\n4. DUEL CLÉ — le matchup individuel le plus décisif\n5. PRÉDICTION — score exact + % confiance + raisonnement basé sur les données réelles\n\n' + tableInstruction + '\n' + L,

      scorers: header + 'TOP 3 BUTEURS POTENTIELS par équipe.\n\nTableau HTML ' + m.home + ':\n<table><thead><tr><th>Joueur</th><th>Poste</th><th>Buts saison</th><th>Forme récente</th><th>% 1ère MT</th><th>% 2ème MT</th><th>Raison</th></tr></thead><tbody>...</tbody></table>\n\nMême tableau pour ' + m.away + '.\nConclusion: qui est le favori pour marquer.\n\n' + L,

      assists: header + 'TOP 3 PASSEURS DÉCISIFS POTENTIELS par équipe.\n\nTableau HTML ' + m.home + ':\n<table><thead><tr><th>Joueur</th><th>Poste</th><th>Passes déc.</th><th>Rôle créatif</th><th>% 1ère MT</th><th>% 2ème MT</th><th>Raison</th></tr></thead><tbody>...</tbody></table>\n\nMême tableau pour ' + m.away + '.\n\n' + L,

      penalty: header + 'ANALYSE PÉNALTYS:\n\nTableau 1 — Stats saison:\n<table><thead><tr><th>Équipe</th><th>Pén. obtenus</th><th>Taux/match</th><th>Pén. concédés</th><th>Conversion</th><th>Tireur principal</th></tr></thead><tbody>...</tbody></table>\n\nTableau 2 — Joueurs clés:\n<table><thead><tr><th>Joueur</th><th>Équipe</th><th>Rôle</th><th>Stat clé</th></tr></thead><tbody>...</tbody></table>\n\nProbabilité globale: X% | 1ère MT: X% | 2ème MT: X%\nQuelle équipe en bénéficiera le plus.\n\n' + L
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
      res.json({ text: text || 'Aucune réponse.' });
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
