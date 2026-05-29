function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function round(value) {
  return Math.round(Number(value || 0));
}

function safe(value) {
  return Number(value || 0);
}

function pressureLevel(value) {
  if (value >= 85) return "CRITICAL";
  if (value >= 70) return "HIGH";
  if (value >= 50) return "ELEVATED";
  if (value >= 30) return "BUILDING";
  return "LOW";
}

function threatLevel(value) {
  if (value >= 82) return "EXTREME";
  if (value >= 68) return "HIGH";
  if (value >= 48) return "ACTIVE";
  if (value >= 30) return "WATCH";
  return "LOW";
}

function chaosLevel(value) {
  if (value >= 85) return "MATCH EXPLODING";
  if (value >= 70) return "UNSTABLE";
  if (value >= 50) return "OPEN";
  if (value >= 30) return "ACTIVE";
  return "CONTROLLED";
}

function momentumLevel(value) {
  if (value >= 80) return "SURGING";
  if (value >= 65) return "DOMINATING";
  if (value >= 45) return "BUILDING";
  return "FLAT";
}

function computeDominance(home, away) {
  let score = 0;

  score += (home.possession - away.possession) * 0.22;
  score += (home.shots - away.shots) * 1.4;
  score += (home.shotsOn - away.shotsOn) * 3.2;
  score += (home.corners - away.corners) * 1.4;

  if (home.xgAvailable && away.xgAvailable) {
    score += (home.xg - away.xg) * 13;
  }

  return round(score);
}

function computePressure(team) {
  let pressure = 0;

  pressure += team.possession * 0.24;
  pressure += team.shots * 2.2;
  pressure += team.shotsOn * 5.8;
  pressure += team.corners * 2.8;

  if (team.xgAvailable) {
    pressure += team.xg * 18;
  }

  return clamp(round(pressure), 0, 100);
}

function computeThreat(team) {
  let threat = 0;

  threat += team.shots * 2.5;
  threat += team.shotsOn * 9;
  threat += team.corners * 2.5;

  if (team.xgAvailable) {
    threat += team.xg * 30;
  }

  return clamp(round(threat), 0, 100);
}

function computeChaos(home, away, minute) {
  let chaos = 0;

  const totalShots = home.shots + away.shots;
  const totalShotsOn = home.shotsOn + away.shotsOn;
  const totalCorners = home.corners + away.corners;

  chaos += totalShots * 1.5;
  chaos += totalShotsOn * 3.4;
  chaos += totalCorners * 2.2;

  if (home.xgAvailable && away.xgAvailable) {
    const xgGap = Math.abs(home.xg - away.xg);

    if (xgGap < 0.35 && totalShots >= 10) {
      chaos += 14;
    }
  }

  if (minute >= 60) chaos += 6;
  if (minute >= 75) chaos += 12;
  if (minute >= 85) chaos += 10;

  return clamp(round(chaos), 0, 100);
}

function computeMomentum(team, opponent, minute) {
  let momentum = 0;

  momentum += team.possession * 0.18;
  momentum += team.shots * 1.8;
  momentum += team.shotsOn * 4.8;
  momentum += team.corners * 2.2;

  if (team.xgAvailable) {
    momentum += team.xg * 16;
  }

  momentum += Math.max(0, team.shots - opponent.shots) * 2.5;
  momentum += Math.max(0, team.shotsOn - opponent.shotsOn) * 5;
  momentum += Math.max(0, team.corners - opponent.corners) * 2;

  if (minute >= 70) momentum *= 1.08;
  if (minute >= 82) momentum *= 1.15;

  return clamp(round(momentum), 0, 100);
}

function computeGoalPressure(team, opponent, minute, chaosScore) {
  let score = 0;

  score += team.shotsOn * 22;
  score += team.shots * 8;
  score += team.corners * 6;
  score += team.possession * 0.18;

  if (team.xgAvailable) {
    score += team.xg * 42;
  }

  if (team.xgAvailable && opponent.xgAvailable) {
    score += Math.max(0, team.xg - opponent.xg) * 24;
  }

  score += Math.max(0, team.shotsOn - opponent.shotsOn) * 12;
  score += Math.max(0, team.shots - opponent.shots) * 5;

  if (chaosScore >= 65) score += 8;
  if (chaosScore >= 78) score += 10;

  if (minute >= 70) score += 6;
  if (minute >= 80) score += 10;
  if (minute >= 88) score += 10;

  return Math.max(0, score);
}

function computeNoGoalWeight(home, away, minute, chaosScore) {
  let weight = 115;

  const totalShotsOn = home.shotsOn + away.shotsOn;
  const totalShots = home.shots + away.shots;
  const totalCorners = home.corners + away.corners;

  weight -= totalShotsOn * 6;
  weight -= totalShots * 1.4;
  weight -= totalCorners * 1.5;

  if (home.xgAvailable && away.xgAvailable) {
    const totalXg = home.xg + away.xg;
    weight -= totalXg * 20;
  }

  if (chaosScore >= 60) weight -= 8;
  if (chaosScore >= 75) weight -= 12;

  if (minute >= 70) weight -= 8;
  if (minute >= 82) weight -= 10;

  return clamp(weight, 18, 140);
}

function computeNextGoalModel(
  home,
  away,
  minute,
  chaosScore
) {

  const homeGoalRaw =
    computeGoalPressure(
      home,
      away,
      minute,
      chaosScore
    );

  const awayGoalRaw =
    computeGoalPressure(
      away,
      home,
      minute,
      chaosScore
    );

  const noGoalRaw =
    computeNoGoalWeight(
      home,
      away,
      minute,
      chaosScore
    );

  const total =
    homeGoalRaw +
    awayGoalRaw +
    noGoalRaw || 1;

  const homeGoalChance =
    round((homeGoalRaw / total) * 100);

  const awayGoalChance =
    round((awayGoalRaw / total) * 100);

  const noGoalChance =
    Math.max(
      0,
      100 -
      homeGoalChance -
      awayGoalChance
    );

  const leader =
    homeGoalChance >= awayGoalChance
      ? "HOME"
      : "AWAY";

  const leaderChance =
    Math.max(
      homeGoalChance,
      awayGoalChance
    );

  let scoringWindow = "CLOSED";

  if (leaderChance >= 65) {
    scoringWindow = "CRITICAL";
  } else if (leaderChance >= 52) {
    scoringWindow = "OPEN";
  } else if (leaderChance >= 40) {
    scoringWindow = "FORMING";
  } else if (leaderChance >= 28) {
    scoringWindow = "WATCH";
  }

  if (
    chaosScore >= 82 &&
    leaderChance >= 42
  ) {
    scoringWindow = "DANGER";
  }

  let nextLikelyEvent =
    "Le match reste dans une phase relativement stable.";

  if (leaderChance >= 65) {
    nextLikelyEvent =
      "But ou énorme occasion probable dans les prochaines minutes.";
  } else if (leaderChance >= 52) {
    nextLikelyEvent =
      "Séquence de pression très exploitable en cours.";
  } else if (leaderChance >= 40) {
    nextLikelyEvent =
      "Corner, tir cadré ou grosse transition probable.";
  } else if (chaosScore >= 70) {
    nextLikelyEvent =
      "Le match devient instable avec transitions rapides.";
  }

  return {
    homeGoalChance,
    awayGoalChance,
    noGoalChance,

    leader,
    leaderChance,

    scoringWindow,

    nextLikelyEvent,

    confidence:
      leaderChance,

    raw: {
      homeGoalRaw:
        round(homeGoalRaw),

      awayGoalRaw:
        round(awayGoalRaw),

      noGoalRaw:
        round(noGoalRaw)
    }
  };
}

function buildNarrative(match, pulse) {

  const homeName =
    match.home || "Home";

  const awayName =
    match.away || "Away";

  const pressureWinner =
    pulse.homePressure >= pulse.awayPressure
      ? homeName
      : awayName;

  const momentumWinner =
    pulse.homeMomentum >= pulse.awayMomentum
      ? homeName
      : awayName;

  const threatWinner =
    pulse.homeThreat >= pulse.awayThreat
      ? homeName
      : awayName;

  return {

    pressureVerdict:
      pressureWinner +
      " impose actuellement la pression territoriale.",

    momentumVerdict:
      momentumWinner +
      " contrôle le rythme émotionnel du match.",

    dangerVerdict:
      threatWinner +
      " génère actuellement la menace offensive principale.",

    chaosVerdict:
      pulse.chaosScore >= 70
        ? "Le match devient instable et peut basculer rapidement."
        : "Le match reste relativement contrôlé tactiquement."
  };
}

function buildState(
  homePressure,
  awayPressure,
  chaos,
  minute,
  nextGoal
) {

  if (
    nextGoal.scoringWindow === "DANGER"
  ) {
    return "MATCH_EXPLODES";
  }

  if (
    nextGoal.scoringWindow === "CRITICAL"
  ) {
    return "GOAL_IMMINENT";
  }

  if (
    nextGoal.scoringWindow === "OPEN"
  ) {
    return "GOAL_WINDOW_OPEN";
  }

  if (
    minute > 75 &&
    chaos > 55
  ) {
    return "LATE_GOAL_THREAT";
  }

  if (chaos > 75) {
    return "CHAOS_RISING";
  }

  if (
    homePressure >
    awayPressure + 25
  ) {
    return "HOME_PRESSURE_BUILDING";
  }

  if (
    awayPressure >
    homePressure + 25
  ) {
    return "AWAY_PRESSURE_BUILDING";
  }

  return "CONTROLLED_STATE";
}

function buildPulseLiveState(match, context) {

  const stats =
    context.stats || null;

  if (
    !stats ||
    !stats.home ||
    !stats.away
  ) {
    return {
      available: false,
      state: "NO_STATS"
    };
  }

  const home = {
    possession:
      safe(stats.home.possession),

    shots:
      safe(stats.home.shots),

    shotsOn:
      safe(stats.home.shotsOn),

    corners:
      safe(stats.home.corners),

    xg:
      safe(stats.home.xg),

    xgAvailable:
      !!stats.home.xgAvailable
  };

  const away = {
    possession:
      safe(stats.away.possession),

    shots:
      safe(stats.away.shots),

    shotsOn:
      safe(stats.away.shotsOn),

    corners:
      safe(stats.away.corners),

    xg:
      safe(stats.away.xg),

    xgAvailable:
      !!stats.away.xgAvailable
  };

  const minute =
    Number(match.minute || 0);

  const dominanceScore =
    computeDominance(home, away);

  const homePressure =
    computePressure(home);

  const awayPressure =
    computePressure(away);

  const chaosScore =
    computeChaos(
      home,
      away,
      minute
    );

  const homeThreat =
    computeThreat(home);

  const awayThreat =
    computeThreat(away);

  const homeMomentum =
    computeMomentum(
      home,
      away,
      minute
    );

  const awayMomentum =
    computeMomentum(
      away,
      home,
      minute
    );

  const nextGoal =
    computeNextGoalModel(
      home,
      away,
      minute,
      chaosScore
    );

  const state =
    buildState(
      homePressure,
      awayPressure,
      chaosScore,
      minute,
      nextGoal
    );

  const pulse = {

    available: true,

    state,

    dominanceScore,

    chaosScore,
    chaosLevel:
      chaosLevel(chaosScore),

    homePressure,
    awayPressure,

    pressureLevel:
      pressureLevel(
        Math.max(
          homePressure,
          awayPressure
        )
      ),

    homeThreat,
    awayThreat,

    threatLevel:
      threatLevel(
        Math.max(
          homeThreat,
          awayThreat
        )
      ),

    homeMomentum,
    awayMomentum,

    momentumLevel:
      momentumLevel(
        Math.max(
          homeMomentum,
          awayMomentum
        )
      ),

    homeDominance:
      clamp(
        50 + dominanceScore,
        0,
        100
      ),

    awayDominance:
      clamp(
        50 - dominanceScore,
        0,
        100
      ),

    nextGoal,

    homeGoalChance:
      nextGoal.homeGoalChance,

    awayGoalChance:
      nextGoal.awayGoalChance,

    noGoalChance:
      nextGoal.noGoalChance,

    scoringWindow:
      nextGoal.scoringWindow,

    nextLikelyEvent:
      nextGoal.nextLikelyEvent,

    confidence:
      nextGoal.confidence,

    xgAvailable: {
      home: home.xgAvailable,
      away: away.xgAvailable,
      any:
        home.xgAvailable ||
        away.xgAvailable
    },

    home,
    away
  };

  const narrative =
    buildNarrative(
      match,
      pulse
    );

  return {
    ...pulse,
    ...narrative
  };
}

module.exports = {
  buildPulseLiveState
};
