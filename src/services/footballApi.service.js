const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";
const MATCH_TIMEZONE = "Europe/Paris";
const API_TIMEOUT_MS = 10000;

// IDs fiables pour les compétitions internationales de clubs CONMEBOL
// Indépendant du country/name retourné par l'API
const ALLOWED_LEAGUE_IDS = [13, 11]; // 13=Copa Libertadores, 11=Copa Sudamericana

const ALLOWED_RULES = [
  { country: "France", leagues: ["Ligue 1", "Ligue 2", "Coupe de France"] },
  { country: "England", leagues: ["Premier League", "Championship", "FA Cup", "League Cup"] },
  { country: "Spain", leagues: ["La Liga", "Segunda División", "Copa del Rey"] },
  { country: "Italy", leagues: ["Serie A", "Serie B", "Coppa Italia"] },
  { country: "Germany", leagues: ["Bundesliga", "2. Bundesliga", "DFB Pokal"] },
  { country: "Portugal", leagues: ["Primeira Liga", "Segunda Liga", "Taça de Portugal", "League Cup"] },

  { country: "Ireland", leagues: ["Premier Division"] },
  { country: "Scotland", leagues: ["Premiership"] },
  { country: "Netherlands", leagues: ["Eredivisie"] },
  { country: "Belgium", leagues: ["Jupiler Pro League"] },
  { country: "Hungary", leagues: ["NB I"] },
  { country: "Poland", leagues: ["Ekstraklasa"] },
  { country: "Romania", leagues: ["Liga I"] },
  { country: "Bulgaria", leagues: ["First League"] },
  { country: "Greece", leagues: ["Super League 1"] },
  { country: "Turkey", leagues: ["Süper Lig", "Super Lig"] },
  { country: "Israel", leagues: ["Ligat Ha'al"] },
  { country: "Czech-Republic", leagues: ["Czech Liga"] },
  { country: "Slovenia", leagues: ["1. SNL"] },
  { country: "Serbia", leagues: ["Super Liga"] },
  { country: "Slovakia", leagues: ["Super Liga"] },
  { country: "Ukraine", leagues: ["Premier League"] },
  { country: "Switzerland", leagues: ["Super League"] },
  { country: "Austria", leagues: ["Bundesliga"] },
  { country: "Croatia", leagues: ["HNL"] },
  { country: "Bosnia", leagues: ["Premijer Liga"] },
  { country: "Lithuania", leagues: ["A Lyga"] },
  { country: "Latvia", leagues: ["Virsliga"] },
  { country: "Estonia", leagues: ["Meistriliiga"] },
  { country: "Finland", leagues: ["Veikkausliiga"] },
  { country: "Sweden", leagues: ["Allsvenskan"] },
  { country: "Denmark", leagues: ["Superliga"] },
  { country: "Norway", leagues: ["Eliteserien"] },
  { country: "Georgia", leagues: ["Erovnuli Liga"] },

  { country: "Australia", leagues: ["A-League"] },
  { country: "China", leagues: ["Super League"] },
  { country: "Japan", leagues: ["J1 League"] },
  { country: "South-Korea", leagues: ["K League 1"] },
  { country: "Saudi-Arabia", leagues: ["Pro League"] },

  { country: "Morocco", leagues: ["Botola Pro"] },
  { country: "South-Africa", leagues: ["Premier Soccer League"] },
  { country: "Algeria", leagues: ["Ligue 1"] },

  { country: "Argentina", leagues: ["Liga Profesional Argentina", "Primera División"] },
  { country: "Chile", leagues: ["Primera División"] },
  { country: "Brazil", leagues: ["Serie A"] },
  { country: "Colombia", leagues: ["Primera A"] },
  { country: "Ecuador", leagues: ["Liga Pro"] },
  { country: "Canada", leagues: ["Canadian Premier League"] },
  { country: "USA", leagues: ["Major League Soccer"] },
  { country: "Mexico", leagues: ["Liga MX"] },

  { country: "World", leagues: ["World Cup", "Copa Libertadores", "Copa Sudamericana", "CONMEBOL Libertadores", "CONMEBOL Sudamericana"] },
  { country: "Europe", leagues: ["Euro Championship", "UEFA European Championship"] },
  { country: "Africa", leagues: ["Africa Cup of Nations"] },
  { country: "South-America", leagues: ["Copa America", "Copa Libertadores", "Copa Sudamericana"] },
  { country: "South America", leagues: ["Copa America", "Copa Libertadores", "Copa Sudamericana"] }
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

// Normalize competition labels only; statistics keep their existing matching.
function normalizeCompetition(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[-_.\s]+/g, " ")
    .trim();
}

// International competitions may be reported under World or their continent.
// Reuse only names that are already present in the current selection.
const INTERNATIONAL_LEAGUES = new Set(
  ALLOWED_RULES
    .filter(function(rule) {
      return ["World", "Europe", "Africa", "South-America", "South America"].includes(rule.country);
    })
    .flatMap(function(rule) { return rule.leagues.map(normalizeCompetition); })
);

function isAllowedCompetition(item) {
  const country = item?.league?.country;
  const league = item?.league?.name;
  const leagueId = Number(item?.league?.id || 0);

  const lowerLeague = normalizeText(league);
  const home = normalizeText(item?.teams?.home?.name);
  const away = normalizeText(item?.teams?.away?.name);

  const isYouthOrWomen =
    lowerLeague.includes("u20") ||
    lowerLeague.includes("u19") ||
    lowerLeague.includes("u21") ||
    lowerLeague.includes("women") ||
    lowerLeague.includes("feminine") ||
    home.includes("u20") ||
    away.includes("u20") ||
    home.includes("u19") ||
    away.includes("u19") ||
    home.endsWith(" w") ||
    away.endsWith(" w");

  if (isYouthOrWomen) return false;

  // Vérification par ID en priorité (indépendant du country/name de l'API)
  if (leagueId && ALLOWED_LEAGUE_IDS.includes(leagueId)) return true;

  if (!league) return false;
  if (INTERNATIONAL_LEAGUES.has(normalizeCompetition(league))) return true;
  if (!country) return false;

  return ALLOWED_RULES.some(function (rule) {
    if (normalizeCompetition(rule.country) !== normalizeCompetition(country)) return false;

    return rule.leagues.some(function (allowedLeague) {
      return normalizeCompetition(league) === normalizeCompetition(allowedLeague);
    });
  });
}

const apiCache = new Map();

function getCacheTtl(endpoint) {
  if (endpoint.startsWith("/fixtures/lineups")) return 300000;     // 5 min
  if (endpoint.startsWith("/players?id=")) return 1800000;         // 30 min
  if (endpoint.startsWith("/fixtures?team=")) return 600000;       // 10 min
  if (endpoint.startsWith("/fixtures/headtohead")) return 600000;  // 10 min
  return 45000;                                                     // 45s live
}

function footballApiError(code, message, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function apiFootball(endpoint, { required = false } = {}) {
  let timeout;
  let controller;
  try {
    if (!API_KEY || !API_KEY.trim()) {
      throw footballApiError("API_FOOTBALL_CONFIG", "API_FOOTBALL_KEY manquante sur le serveur.", 503);
    }

    const cached = apiCache.get(endpoint);
    if (cached && (Date.now() - cached.ts) < getCacheTtl(endpoint)) {
      return cached.data;
    }

    controller = new AbortController();
    timeout = setTimeout(function() { controller.abort(); }, API_TIMEOUT_MS);
    const response = await fetch(BASE_URL + endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { "x-apisports-key": API_KEY }
    });

    if (!response.ok) {
      throw footballApiError("API_FOOTBALL_HTTP", "API-Football a renvoyé HTTP " + response.status + ".");
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw footballApiError("API_FOOTBALL_RESPONSE", "Réponse JSON API-Football invalide.");
    }

    if (data?.errors && Object.keys(data.errors).length > 0) {
      // Provider details stay in server logs; redact the configured API key.
      const details = JSON.stringify(data.errors).split(API_KEY).join("[REDACTED]");
      console.error("API-Football errors:", endpoint, details);
      throw footballApiError("API_FOOTBALL_PROVIDER", "API-Football signale une erreur. Vérifier la clé, le quota et les droits de l'abonnement dans les logs serveur.");
    }

    // Team statistics return an object, other endpoints used here return arrays.
    const validResponse = endpoint.startsWith("/teams/statistics?")
      ? data?.response && typeof data.response === "object"
      : Array.isArray(data?.response);
    if (!validResponse) {
      throw footballApiError("API_FOOTBALL_RESPONSE", "Structure de réponse API-Football invalide.");
    }

    apiCache.set(endpoint, { data, ts: Date.now() });
    return data;
  } catch (err) {
    const error = err.statusCode ? err : (
      controller?.signal.aborted || err.name === "AbortError" || err.name === "TimeoutError"
        ? footballApiError("API_FOOTBALL_TIMEOUT", "Délai de réponse API-Football dépassé.", 504)
        : footballApiError("API_FOOTBALL_NETWORK", "API-Football est injoignable.")
    );
    console.error("API-Football request failed:", endpoint, error.code, error.message);
    // Discovery reports failures. Optional analysis data retain their previous
    // null/empty fallback so a missing statistic does not break an analysis.
    if (required) throw error;
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function formatParisDate(dateStr) {
  const d = new Date(dateStr);

  return {
    time: d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris"
    }),
    dateLabel: d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Europe/Paris"
    }),
    startTimestamp: Math.floor(d.getTime() / 1000)
  };
}

function formatFixture(item) {
  const formatted = formatParisDate(item.fixture.date);

  return {
    id: item.fixture.id,

    homeId: item.teams.home.id,
    awayId: item.teams.away.id,

    home: item.teams.home.name,
    away: item.teams.away.name,

    homeLogo: item.teams.home.logo,
    awayLogo: item.teams.away.logo,

    homeScore: item.goals.home,
    awayScore: item.goals.away,

    status: item.fixture.status.short,
    statusType: item.fixture.status.short,
    minute: item.fixture.status.elapsed || 0,

    tournament: item.league.name,
    leagueName: item.league.name,
    leagueId: item.league.id,
    season: item.league.season,
    country: item.league.country,

    date: item.fixture.date,
    startTimestamp: formatted.startTimestamp,
    time: formatted.time,
    dateLabel: formatted.dateLabel
  };
}

function logStatisticTypes(matchId, response) {
  try {
    const homeTypes = response?.[0]?.statistics?.map(function (s) {
      return s.type;
    }) || [];

    const awayTypes = response?.[1]?.statistics?.map(function (s) {
      return s.type;
    }) || [];

    console.log("📊 FIXTURE STAT TYPES:", matchId, {
      home: homeTypes,
      away: awayTypes
    });
  } catch (err) {
    console.log("⚠️ Impossible de logger les types de stats:", err.message);
  }
}

function rawStatValue(stats, possibleNames) {
  const names = Array.isArray(possibleNames) ? possibleNames : [possibleNames];

  const found = (stats || []).find(function (s) {
    return names.some(function (name) {
      return normalizeText(s.type) === normalizeText(name);
    });
  });

  if (!found) return null;

  const val = found.value;

  if (val === null || val === undefined) return null;

  if (typeof val === "string") {
    const parsed = parseFloat(val.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return Number.isFinite(Number(val)) ? Number(val) : null;
}

function extractXg(stats) {
  return rawStatValue(stats, [
    "Expected Goals",
    "Expected goals",
    "expected_goals",
    "xG",
    "XG",
    "Expected Goal",
    "Expected Goal Value"
  ]);
}

function extractStat(stats, possibleNames) {
  const value = rawStatValue(stats, possibleNames);
  return value === null || value === undefined ? 0 : value;
}

async function getLiveMatches() {
  console.log("🔴 GET LIVE MATCHES");

  const data = await apiFootball("/fixtures?live=all", { required: true });

  console.log("🔴 LIVE RAW:", data.response.length);

  const filtered = data.response.filter(isAllowedCompetition);

  console.log("🔴 LIVE FILTERED:", filtered.length);

  return filtered.map(formatFixture);
}

function getMatchDates(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCH_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(function(part) { return [part.type, part.value]; }));
  const today = values.year + "-" + values.month + "-" + values.day;
  // Advance a calendar date, not the current instant by 24h (DST boundaries).
  const tomorrow = new Date(today + "T00:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return [today, tomorrow.toISOString().slice(0, 10)];
}

async function getScheduledMatches() {
  const dates = getMatchDates();
  const days = await Promise.all(dates.map(function(date) {
    return apiFootball("/fixtures?date=" + date + "&timezone=" + encodeURIComponent(MATCH_TIMEZONE), { required: true });
  }));
  const allFixtures = days.flatMap(function(day) { return day.response; });
  const scheduled = allFixtures
    .filter(isAllowedCompetition)
    .filter(function(item) { return item.fixture?.status?.short === "NS"; });

  console.log("SCHEDULED FIXTURES:", { dates, raw: allFixtures.length, filtered: scheduled.length });

  return Array.from(new Map(scheduled.map(function(item) {
    return [item.fixture.id, item];
  })).values())
    .map(formatFixture)
    .sort(function(a, b) { return (a.startTimestamp || 0) - (b.startTimestamp || 0); });
}

async function getFixtureStatistics(matchId) {
  if (!matchId) return [];

  const data = await apiFootball("/fixtures/statistics?fixture=" + matchId);

  if (!data || !data.response) return [];

  logStatisticTypes(matchId, data.response);

  return data.response.map(function (team) {
    const statistics = team.statistics || [];

    return {
      team: team.team || null,
      statistics,
      normalized: {
        possession: extractStat(statistics, ["Ball Possession", "Possession"]),
        shots: extractStat(statistics, ["Total Shots", "Shots total", "Shots"]),
        shotsOn: extractStat(statistics, ["Shots on Goal", "Shots on Target"]),
        shotsOff: extractStat(statistics, ["Shots off Goal", "Shots off Target"]),
        corners: extractStat(statistics, ["Corner Kicks", "Corners"]),
        fouls: extractStat(statistics, ["Fouls"]),
        yellowCards: extractStat(statistics, ["Yellow Cards"]),
        redCards: extractStat(statistics, ["Red Cards"]),
        xg: extractXg(statistics),
        xgAvailable: extractXg(statistics) !== null
      }
    };
  });
}

async function getFixtureEvents(matchId) {
  if (!matchId) return [];

  const data = await apiFootball("/fixtures/events?fixture=" + matchId);

  if (!data || !data.response) return [];

  return data.response.map(function (event) {
    return {
      time: event.time ? event.time.elapsed : null,
      extra: event.time ? event.time.extra : null,
      teamId: event.team ? event.team.id : null,
      teamName: event.team ? event.team.name : null,
      playerId: event.player ? event.player.id : null,
      playerName: event.player ? event.player.name : null,
      assistId: event.assist ? event.assist.id : null,
      assistName: event.assist ? event.assist.name : null,
      type: event.type || null,
      detail: event.detail || null,
      comments: event.comments || null
    };
  });
}

function flattenPlayerStats(player, stats, team) {
  const games = stats.games || {};
  const goals = stats.goals || {};
  const shots = stats.shots || {};
  const passes = stats.passes || {};
  const dribbles = stats.dribbles || {};
  const fouls = stats.fouls || {};
  const duels = stats.duels || {};
  const tackles = stats.tackles || {};
  const cards = stats.cards || {};
  const penalty = stats.penalty || {};

  return {
    id: player.id || null,
    name: player.name || "",
    photo: player.photo || null,

    teamId: team?.id || null,
    teamName: team?.name || null,

    position: games.position || null,
    minutes: games.minutes || 0,
    rating: games.rating ? Number(games.rating) : null,
    captain: games.captain || false,
    substitute: games.substitute || false,

    goals: goals.total || 0,
    conceded: goals.conceded || 0,
    assists: goals.assists || 0,
    saves: goals.saves || 0,

    shots: shots.total || 0,
    shotsOn: shots.on || 0,

    totalPasses: passes.total || 0,
    keyPasses: passes.key || 0,
    passAccuracy: passes.accuracy || null,

    dribblesAttempts: dribbles.attempts || 0,
    dribblesSuccess: dribbles.success || 0,

    duelsTotal: duels.total || 0,
    duelsWon: duels.won || 0,

    tacklesTotal: tackles.total || 0,
    tacklesBlocks: tackles.blocks || 0,
    tacklesInterceptions: tackles.interceptions || 0,

    foulsDrawn: fouls.drawn || 0,
    foulsCommitted: fouls.committed || 0,

    yellow: cards.yellow || 0,
    red: cards.red || 0,

    penaltiesWon: penalty.won || 0,
    penaltiesCommitted: penalty.commited || penalty.committed || 0,
    penaltiesScored: penalty.scored || 0,
    penaltiesMissed: penalty.missed || 0,
    penaltiesSaved: penalty.saved || 0,

    rawStatistics: stats
  };
}

async function getFixturePlayers(matchId) {
  if (!matchId) return [];

  const data = await apiFootball("/fixtures/players?fixture=" + matchId);

  if (!data || !data.response) return [];

  console.log(
    "👥 FIXTURE PLAYERS:",
    matchId,
    data.response.map(function (team) {
      return {
        team: team.team?.name,
        players: team.players?.length || 0
      };
    })
  );

  return data.response.map(function (team) {
    return {
      teamId: team.team ? team.team.id : null,
      teamName: team.team ? team.team.name : null,
      teamLogo: team.team ? team.team.logo : null,
      players: (team.players || []).map(function (item) {
        const player = item.player || {};
        const stats = item.statistics && item.statistics[0]
          ? item.statistics[0]
          : {};

        return flattenPlayerStats(player, stats, team.team);
      })
    };
  });
}

async function getLineups(matchId) {
  if (!matchId) {
    return { home: null, away: null };
  }

  const data = await apiFootball("/fixtures/lineups?fixture=" + matchId);

  if (!data || !data.response || data.response.length < 2) {
    return { home: null, away: null };
  }

  function formatTeam(team) {
    return {
      teamId: team.team ? team.team.id : null,
      teamName: team.team ? team.team.name : null,
      teamLogo: team.team ? team.team.logo : null,
      coach: team.coach ? team.coach.name : null,
      formation: team.formation || "?",
      players: (team.startXI || []).map(function (p) {
        return {
          id: p.player.id || null,
          name: p.player.name,
          position: p.player.pos || "?",
          shirtNumber: p.player.number || "?",
          grid: p.player.grid || null,
          substitute: false
        };
      }).concat(
        (team.substitutes || []).map(function (p) {
          return {
            id: p.player.id || null,
            name: p.player.name,
            position: p.player.pos || "?",
            shirtNumber: p.player.number || "?",
            grid: p.player.grid || null,
            substitute: true
          };
        })
      )
    };
  }

  return {
    home: formatTeam(data.response[0]),
    away: formatTeam(data.response[1])
  };
}

async function getTeamRecent(teamId) {
  if (!teamId) return [];

  const data = await apiFootball(
    "/fixtures?team=" + teamId + "&last=5"
  );

  if (!data || !data.response) return [];

  return data.response
    .slice(0, 5)
    .map(function (item) {
      const isHome = item.teams.home.id === Number(teamId);

      const hs = item.goals.home;
      const as = item.goals.away;

      let result = "?";

      if (hs !== null && as !== null) {
        result = isHome
          ? (hs > as ? "V" : hs < as ? "D" : "N")
          : (as > hs ? "V" : as < hs ? "D" : "N");
      }

      const d = new Date(item.fixture.date);

      return {
        date: d.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit"
        }),
        opponent: isHome ? item.teams.away.name : item.teams.home.name,
        venue: isHome ? "Dom." : "Ext.",
        score: hs + "-" + as,
        result,
        competition: item.league.name
      };
    });
}

async function getPlayerSeasonStats(playerId, season) {
  if (!playerId) return null;

  const targetSeason = season || new Date().getFullYear();

  const data = await apiFootball(
    "/players?id=" + playerId + "&season=" + targetSeason
  );

  if (!data || !data.response || !data.response[0]) {
    return null;
  }

  const player = data.response[0].player || {};
  const stats = data.response[0].statistics?.[0];

  if (!stats) return null;

  const appearances = stats.games?.appearences || stats.games?.appearances || 0;
  const minutes = stats.games?.minutes || 0;
  const goals = stats.goals?.total || 0;
  const assists = stats.goals?.assists || 0;
  const shots = stats.shots?.total || 0;
  const shotsOn = stats.shots?.on || 0;
  const keyPasses = stats.passes?.key || 0;

  return {
    playerId: player.id || playerId,
    name: player.name || "",
    age: player.age || null,
    nationality: player.nationality || null,
    photo: player.photo || null,

    season: targetSeason,
    teamId: stats.team?.id || null,
    teamName: stats.team?.name || null,
    leagueId: stats.league?.id || null,
    leagueName: stats.league?.name || null,

    appearances,
    minutes,
    position: stats.games?.position || null,
    rating: stats.games?.rating ? Number(stats.games.rating) : null,

    goals,
    assists,
    shots,
    shotsOn,
    keyPasses,

    goalsPerMatch: appearances > 0 ? Number((goals / appearances).toFixed(2)) : 0,
    assistsPerMatch: appearances > 0 ? Number((assists / appearances).toFixed(2)) : 0,
    shotsPerMatch: appearances > 0 ? Number((shots / appearances).toFixed(2)) : 0,
    shotsOnPerMatch: appearances > 0 ? Number((shotsOn / appearances).toFixed(2)) : 0,
    keyPassesPerMatch: appearances > 0 ? Number((keyPasses / appearances).toFixed(2)) : 0,

    rawStatistics: stats
  };
}

async function getPlayersSeasonStats(playerIds, season, limit) {
  const ids = Array.from(new Set((playerIds || []).filter(Boolean)));
  const max = limit || 8;
  const selected = ids.slice(0, max);

  const results = await Promise.all(
    selected.map(function(playerId) {
      return getPlayerSeasonStats(playerId, season).catch(function() { return null; });
    })
  );

  return results.filter(Boolean);
}

async function getTeamStatistics(teamId, leagueId, season) {
  if (!teamId || !leagueId) return null;

  const targetSeason = season || new Date().getFullYear();

  const data = await apiFootball(
    "/teams/statistics?team=" +
      teamId +
      "&league=" +
      leagueId +
      "&season=" +
      targetSeason
  );

  if (!data || !data.response) return null;

  return data.response;
}

function clearFixtureCache(matchId) {
  if (!matchId) return;
  [
    "/fixtures?id=" + matchId,
    "/fixtures/statistics?fixture=" + matchId,
    "/fixtures/events?fixture=" + matchId,
    "/fixtures/players?fixture=" + matchId,
    "/fixtures/lineups?fixture=" + matchId
  ].forEach(function(key) { apiCache.delete(key); });
}

async function getFixtureStatus(matchId) {
  if (!matchId) return null;
  const data = await apiFootball("/fixtures?id=" + matchId);
  if (!data || !data.response || !data.response[0]) return null;
  const f = data.response[0];
  return {
    status: f.fixture.status.short,
    minute: f.fixture.status.elapsed || 0,
    homeScore: f.goals && f.goals.home !== null ? f.goals.home : null,
    awayScore: f.goals && f.goals.away !== null ? f.goals.away : null
  };
}

async function getH2H(homeId, awayId) {
  if (!homeId || !awayId) return [];

  const data = await apiFootball(
    "/fixtures/headtohead?h2h=" + homeId + "-" + awayId + "&last=5"
  );

  if (!data || !data.response) return [];

  return data.response
    .filter(function(item) {
      const s = item.fixture && item.fixture.status && item.fixture.status.short;
      return s === "FT" || s === "AET" || s === "PEN";
    })
    .slice(0, 5)
    .map(function(item) {
      const hg = item.goals && item.goals.home !== null ? item.goals.home : "-";
      const ag = item.goals && item.goals.away !== null ? item.goals.away : "-";
      const d = new Date(item.fixture && item.fixture.date);
      return {
        date: d.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit"
        }),
        homeTeam: item.teams && item.teams.home ? item.teams.home.name : "",
        awayTeam: item.teams && item.teams.away ? item.teams.away.name : "",
        score: hg + "-" + ag,
        competition: item.league ? item.league.name : ""
      };
    });
}

module.exports = {
  getLiveMatches,
  getScheduledMatches,
  getFixtureStatistics,
  getFixtureEvents,
  getFixturePlayers,
  getLineups,
  getTeamRecent,
  getPlayerSeasonStats,
  getPlayersSeasonStats,
  getTeamStatistics,
  getFixtureStatus,
  getH2H,
  clearFixtureCache,

  // Helpers utiles pour les autres services
  extractXg,
  extractStat
};
