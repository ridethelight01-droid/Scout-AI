const {
  getLineups,
  getTeamRecent,
  getH2H,
  getFixtureStatistics,
  getFixtureEvents,
  getFixturePlayers,
  getPlayersSeasonStats,
  getFixtureStatus
} = require("./footballApi.service");

function computeLiveScore(events, homeId, awayId) {
  const score = { home: 0, away: 0 };
  if (!Array.isArray(events)) return score;
  events.forEach(function(e) {
    const t = (e.type || "").toLowerCase();
    const d = (e.detail || "").toLowerCase();
    const isGoal = t === "goal" || d.includes("normal goal") || d.includes("penalty") || d.includes("own goal");
    if (!isGoal) return;
    const isOwn = d.includes("own goal");
    const tid = Number(e.teamId);
    if (isOwn) {
      if (tid === Number(homeId)) score.away++;
      else if (tid === Number(awayId)) score.home++;
    } else {
      if (tid === Number(homeId)) score.home++;
      else if (tid === Number(awayId)) score.away++;
    }
  });
  return score;
}

async function buildAnalysisContext(match, forcedLineups, options) {
  const isLive = !!(options && options.isLive);
  const homeId = match.homeId;
  const awayId = match.awayId;
  const matchId = match.id;

  const [
    lineups,
    homeRecent,
    awayRecent,
    h2h,
    liveStats,
    events,
    fixturePlayers,
    fixtureStatus
  ] = await Promise.all([
    forcedLineups
      ? Promise.resolve(forcedLineups)
      : getLineups(matchId),

    getTeamRecent(homeId),

    getTeamRecent(awayId),

    getH2H(homeId, awayId),

    getFixtureStatistics(matchId),

    getFixtureEvents(matchId),

    getFixturePlayers(matchId),

    getFixtureStatus(matchId)
  ]);

  const allPlayerIds = (fixturePlayers || [])
    .flatMap(function(team) {
      return team.players || [];
    })
    .map(function(player) {
      return player.id;
    })
    .filter(Boolean);

  const seasonPlayerStats = await getPlayersSeasonStats(
    allPlayerIds,
    match.season || new Date().getFullYear(),
    8
  );

  const stats = buildStatsSummary(liveStats);
  const scoring = buildScoringSummary(events, homeId, awayId);
  const cards = buildCardsSummary(events, homeId, awayId);

  const playerModels = buildPlayerModels(
    fixturePlayers,
    homeId,
    awayId,
    stats,
    seasonPlayerStats
  );

  const liveScore = computeLiveScore(events, homeId, awayId);

  const context = {
    match,

    lineups,

    fixtureStatus,

    liveScore,

    recent: {
      home: homeRecent,
      away: awayRecent
    },

    h2h,

    liveStats,

    events,

    fixturePlayers,

    seasonPlayerStats,

    scoring,

    cards,

    stats,

    playerModels,

    goalThreatTable: playerModels.goalThreatTable,

    assistThreatTable: playerModels.assistThreatTable,

    penaltyRiskTable: playerModels.penaltyRiskTable,

    dataQuality: {
      hasLineups: !!(
        lineups &&
        lineups.home &&
        lineups.away
      ),

      hasRecent:
        homeRecent.length > 0 ||
        awayRecent.length > 0,

      hasH2H:
        h2h.length > 0,

      hasLiveStats:
        Array.isArray(liveStats) &&
        liveStats.length >= 2,

      hasEvents:
        Array.isArray(events) &&
        events.length > 0,

      hasScorers:
        scoring.home.length > 0 ||
        scoring.away.length > 0,

      hasFixturePlayers:
        Array.isArray(fixturePlayers) &&
        fixturePlayers.length > 0,

      hasSeasonPlayerStats:
        Array.isArray(seasonPlayerStats) &&
        seasonPlayerStats.length > 0,

      hasXg:
        !!(
          stats &&
          stats.xgAvailable &&
          (
            stats.xgAvailable.home ||
            stats.xgAvailable.away
          )
        )
    }
  };

  console.log(
    "📊 ANALYSIS CONTEXT:",
    JSON.stringify(context.dataQuality, null, 2)
  );

  return context;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function number(value, fallback) {
  const parsed = Number(value);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return fallback || 0;
}

function clamp(value, min, max) {
  const n = number(value, 0);

  if (n < min) return min;
  if (n > max) return max;

  return Math.round(n);
}

function rawStatValue(stats, possibleNames) {
  const names = Array.isArray(possibleNames)
    ? possibleNames
    : [possibleNames];

  const found = (stats || []).find(function(s) {
    return names.some(function(name) {
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

function statValue(stats, possibleNames) {
  const value = rawStatValue(stats, possibleNames);

  if (value === null || value === undefined) {
    return 0;
  }

  return value;
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

function getTeamStatsFromApiTeam(teamBlock) {
  if (!teamBlock) {
    return {
      possession: 0,
      shots: 0,
      shotsOn: 0,
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      xg: 0,
      xgAvailable: false
    };
  }

  if (teamBlock.normalized) {
    return {
      possession: number(teamBlock.normalized.possession),
      shots: number(teamBlock.normalized.shots),
      shotsOn: number(teamBlock.normalized.shotsOn),
      corners: number(teamBlock.normalized.corners),
      fouls: number(teamBlock.normalized.fouls),
      yellowCards: number(teamBlock.normalized.yellowCards),
      redCards: number(teamBlock.normalized.redCards),
      xg: teamBlock.normalized.xgAvailable
        ? number(teamBlock.normalized.xg)
        : 0,
      xgAvailable: !!teamBlock.normalized.xgAvailable
    };
  }

  const rawStats = teamBlock.statistics || [];

  const xg = extractXg(rawStats);

  return {
    possession: statValue(rawStats, ["Ball Possession", "Possession"]),
    shots: statValue(rawStats, ["Total Shots", "Shots total", "Shots"]),
    shotsOn: statValue(rawStats, ["Shots on Goal", "Shots on Target"]),
    corners: statValue(rawStats, ["Corner Kicks", "Corners"]),
    fouls: statValue(rawStats, ["Fouls"]),
    yellowCards: statValue(rawStats, ["Yellow Cards"]),
    redCards: statValue(rawStats, ["Red Cards"]),
    xg: xg === null ? 0 : xg,
    xgAvailable: xg !== null
  };
}

function buildStatsSummary(liveStats) {
  if (!Array.isArray(liveStats) || liveStats.length < 2) {
    return null;
  }

  const homeStats = getTeamStatsFromApiTeam(liveStats[0]);
  const awayStats = getTeamStatsFromApiTeam(liveStats[1]);

  return {
    home: homeStats,
    away: awayStats,
    xgAvailable: {
      home: homeStats.xgAvailable,
      away: awayStats.xgAvailable,
      any: homeStats.xgAvailable || awayStats.xgAvailable,
      both: homeStats.xgAvailable && awayStats.xgAvailable
    },
    source: {
      xg: homeStats.xgAvailable || awayStats.xgAvailable
        ? "API-Football"
        : "unavailable"
    }
  };
}

function isGoalEvent(event) {
  if (!event) return false;

  const type = normalizeText(event.type);
  const detail = normalizeText(event.detail);

  return (
    type === "goal" ||
    detail.includes("normal goal") ||
    detail.includes("penalty") ||
    detail.includes("own goal")
  );
}

function buildScoringSummary(events, homeId, awayId) {
  const result = {
    home: [],
    away: [],
    all: []
  };

  if (!Array.isArray(events)) {
    return result;
  }

  events
    .filter(isGoalEvent)
    .forEach(function(event) {
      const scorer = {
        minute:
          event.extra
            ? event.time + "+" + event.extra
            : event.time,

        teamId: event.teamId,

        teamName: event.teamName,

        playerName:
          event.playerName || "Buteur inconnu",

        assistName:
          event.assistName || null,

        detail:
          event.detail || "Goal",

        isOwnGoal:
          normalizeText(event.detail).includes("own goal"),

        isPenalty:
          normalizeText(event.detail).includes("penalty")
      };

      result.all.push(scorer);

      if (Number(event.teamId) === Number(homeId)) {
        result.home.push(scorer);
      } else if (Number(event.teamId) === Number(awayId)) {
        result.away.push(scorer);
      }
    });

  return result;
}

function buildCardsSummary(events, homeId, awayId) {
  const cards = {
    home: {
      yellow: 0,
      red: 0
    },
    away: {
      yellow: 0,
      red: 0
    }
  };

  if (!Array.isArray(events)) {
    return cards;
  }

  events.forEach(function(event) {
    const type = normalizeText(event.type);
    const detail = normalizeText(event.detail);

    if (type !== "card") {
      return;
    }

    const target =
      Number(event.teamId) === Number(homeId)
        ? cards.home
        : Number(event.teamId) === Number(awayId)
        ? cards.away
        : null;

    if (!target) return;

    if (detail.includes("yellow")) {
      target.yellow += 1;
    }

    if (detail.includes("red")) {
      target.red += 1;
    }
  });

  return cards;
}

function flattenFixturePlayers(fixturePlayers, homeId, awayId) {
  if (!Array.isArray(fixturePlayers)) return [];

  const result = [];

  fixturePlayers.forEach(function(team) {
    const side =
      Number(team.teamId) === Number(homeId)
        ? "home"
        : Number(team.teamId) === Number(awayId)
        ? "away"
        : "unknown";

    (team.players || []).forEach(function(player) {
      result.push({
        ...player,
        teamId: team.teamId,
        teamName: team.teamName,
        side
      });
    });
  });

  return result;
}

function positionCode(position) {
  return normalizeText(position).toUpperCase();
}

function isForward(player) {
  const pos = positionCode(player.position);

  return (
    pos === "F" ||
    pos === "FW" ||
    pos === "ST" ||
    pos === "CF" ||
    pos.includes("FORWARD") ||
    pos.includes("ATTACKER")
  );
}

function isMidfielder(player) {
  const pos = positionCode(player.position);

  return (
    pos === "M" ||
    pos === "MF" ||
    pos === "AM" ||
    pos === "CM" ||
    pos === "DM" ||
    pos.includes("MID")
  );
}

function isDefender(player) {
  const pos = positionCode(player.position);

  return (
    pos === "D" ||
    pos === "DF" ||
    pos === "CB" ||
    pos === "LB" ||
    pos === "RB" ||
    pos.includes("DEF")
  );
}

function isCreativeProfile(player) {
  const pos = positionCode(player.position);

  return (
    isMidfielder(player) ||
    pos === "AM" ||
    pos === "LW" ||
    pos === "RW" ||
    pos.includes("WINGER")
  );
}

function buildSeasonMap(seasonPlayerStats) {
  const seasonMap = {};

  (seasonPlayerStats || []).forEach(function(player) {
    if (player && player.playerId) {
      seasonMap[player.playerId] = player;
    }
  });

  return seasonMap;
}

function liveAvailability(player) {
  return {
    hasShots:
      number(player.shots) > 0 ||
      number(player.shotsOn) > 0,

    hasPassing:
      number(player.keyPasses) > 0 ||
      number(player.totalPasses) > 0 ||
      number(player.assists) > 0,

    hasDribbles:
      number(player.dribblesAttempts) > 0 ||
      number(player.dribblesSuccess) > 0,

    hasFouls:
      number(player.foulsDrawn) > 0 ||
      number(player.foulsCommitted) > 0
  };
}

function buildGoalThreat(player, teamStats, season) {
  const liveShots = number(player.shots);
  const liveShotsOn = number(player.shotsOn);
  const liveGoals = number(player.goals);
  const rating = number(player.rating);

  const goalsPerMatch = number(season.goalsPerMatch);
  const shotsPerMatch = number(season.shotsPerMatch);
  const shotsOnPerMatch = number(season.shotsOnPerMatch);

  const teamXg = teamStats.xgAvailable
    ? number(teamStats.xg)
    : 0;

  let score =
    liveShots * 15 +
    liveShotsOn * 25 +
    liveGoals * 30 +
    goalsPerMatch * 30 +
    shotsPerMatch * 10 +
    shotsOnPerMatch * 10 +
    rating * 3 +
    teamXg * 8;

  if (isForward(player)) {
    score += 25;
  } else if (isCreativeProfile(player)) {
    score += 12;
  } else if (isMidfielder(player)) {
    score += 6;
  }

  if (number(player.minutes) >= 60) {
    score += 4;
  }

  return clamp(score, 0, 100);
}

function buildAssistThreat(player, teamStats, season) {
  const liveKeyPasses = number(player.keyPasses);
  const liveAssists = number(player.assists);
  const totalPasses = number(player.totalPasses);
  const dribblesSuccess = number(player.dribblesSuccess);
  const rating = number(player.rating);

  const assistsPerMatch = number(season.assistsPerMatch);
  const keyPassesPerMatch = number(season.keyPassesPerMatch);

  let score =
    liveKeyPasses * 25 +
    liveAssists * 30 +
    Math.min(totalPasses * 0.35, 12) +
    dribblesSuccess * 6 +
    assistsPerMatch * 35 +
    keyPassesPerMatch * 15 +
    number(teamStats.corners) * 3 +
    rating * 3;

  if (isCreativeProfile(player)) {
    score += 25;
  } else if (isMidfielder(player)) {
    score += 15;
  } else if (isForward(player)) {
    score += 8;
  } else if (isDefender(player)) {
    score += 4;
  }

  return clamp(score, 0, 100);
}

function buildPenaltyRisk(player, teamStats) {
  const foulsDrawn = number(player.foulsDrawn);
  const dribblesAttempts = number(player.dribblesAttempts);
  const dribblesSuccess = number(player.dribblesSuccess);
  const shots = number(player.shots);
  const shotsOn = number(player.shotsOn);
  const penaltiesWon = number(player.penaltiesWon);

  let score =
    foulsDrawn * 10 +
    dribblesAttempts * 4 +
    dribblesSuccess * 5 +
    shots * 3 +
    shotsOn * 4 +
    penaltiesWon * 25 +
    number(teamStats.corners) * 1.2 +
    number(teamStats.shotsOn) * 1.8;

  if (isForward(player)) {
    score += 8;
  } else if (isCreativeProfile(player)) {
    score += 5;
  }

  return clamp(score, 0, 100);
}

function buildPlayerModels(
  fixturePlayers,
  homeId,
  awayId,
  stats,
  seasonPlayerStats
) {
  const players = flattenFixturePlayers(
    fixturePlayers,
    homeId,
    awayId
  );

  const seasonMap = buildSeasonMap(seasonPlayerStats);

  const homeStats =
    stats && stats.home
      ? stats.home
      : {};

  const awayStats =
    stats && stats.away
      ? stats.away
      : {};

  const enriched = players
    .filter(function(player) {
      return player.name;
    })
    .map(function(player) {
      const teamStats =
        player.side === "home"
          ? homeStats
          : awayStats;

      const season =
        seasonMap[player.id] || {};

      const availability =
        liveAvailability(player);

      const goalThreat =
        buildGoalThreat(player, teamStats, season);

      const assistThreat =
        buildAssistThreat(player, teamStats, season);

      const penaltyRisk =
        buildPenaltyRisk(player, teamStats);

      return {
        ...player,

        seasonStats: season,

        liveAvailability: availability,

        dataSource: {
          live: "API-Football /fixtures/players",
          season: season.playerId
            ? "API-Football /players"
            : "unavailable"
        },

        goalThreat,

        assistThreat,

        penaltyRisk,

        goalFacts: {
          liveShots: number(player.shots),
          liveShotsOn: number(player.shotsOn),
          liveGoals: number(player.goals),
          goalsPerMatch: number(season.goalsPerMatch),
          shotsPerMatch: number(season.shotsPerMatch)
        },

        assistFacts: {
          liveKeyPasses: number(player.keyPasses),
          liveAssists: number(player.assists),
          totalPasses: number(player.totalPasses),
          assistsPerMatch: number(season.assistsPerMatch),
          keyPassesPerMatch: number(season.keyPassesPerMatch)
        },

        penaltyFacts: {
          foulsDrawn: number(player.foulsDrawn),
          dribblesAttempts: number(player.dribblesAttempts),
          dribblesSuccess: number(player.dribblesSuccess),
          penaltiesWon: number(player.penaltiesWon)
        }
      };
    });

  const goalThreatTable = enriched
    .slice()
    .filter(function(player) {
      return player.goalThreat > 0;
    })
    .sort(function(a, b) {
      return b.goalThreat - a.goalThreat;
    })
    .slice(0, 10);

  const assistThreatTable = enriched
    .slice()
    .filter(function(player) {
      return player.assistThreat > 0;
    })
    .sort(function(a, b) {
      return b.assistThreat - a.assistThreat;
    })
    .slice(0, 10);

  const penaltyRiskTable = enriched
    .slice()
    .filter(function(player) {
      return player.penaltyRisk > 0;
    })
    .sort(function(a, b) {
      return b.penaltyRisk - a.penaltyRisk;
    })
    .slice(0, 10);

  return {
    allPlayers: enriched,
    goalThreatTable,
    assistThreatTable,
    penaltyRiskTable
  };
}

module.exports = {
  buildAnalysisContext
};
