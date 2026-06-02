const express = require("express");
const { buildAnalysisContext } = require("../services/analysisData.service");
const { buildPrompt } = require("../services/prompt.service");
const { askClaude } = require("../services/anthropic.service");
const { buildPulseLiveState } = require("../services/pulseEngine.service");
const { clearFixtureCache } = require("../services/footballApi.service");

const router = express.Router();

// In-memory cache for Claude responses keyed by fixtureId + lang.
// Avoids redundant Anthropic calls when multiple users analyze the same live match.
const claudeCache = new Map();
const CLAUDE_CACHE_TTL_MS = 90 * 1000;

function getClaudeCache(fixtureId, lang) {
  const key = `${fixtureId}_${lang}`;
  const entry = claudeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CLAUDE_CACHE_TTL_MS) {
    claudeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setClaudeCache(fixtureId, lang, data) {
  claudeCache.set(`${fixtureId}_${lang}`, { data, ts: Date.now() });
}

function cleanClaudeText(rawText) {
  return String(rawText || "")
    .replace(/```json/g, "")
    .replace(/```JSON/g, "")
    .replace(/```/g, "")
    .trim();
}

function safeJsonParse(rawText) {
  try {
    let cleaned = cleanClaudeText(rawText);

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned);
  } catch (error) {
    console.error("❌ JSON PARSE ERROR:", error.message);

    return {
      live: "",
      tactical: "<p>Lecture tactique indisponible.</p>",
      scorers: "<p>Lecture buteurs indisponible.</p>",
      assists: "<p>Lecture passeurs indisponible.</p>",
      penalties: "<p>Lecture penalties indisponible.</p>",
      rawUnavailable: true
    };
  }
}

function buildLocalLiveRead(match, pulse) {
  if (!pulse || !pulse.available) {
    return [
      "Stats live insuffisantes.",
      "Le tempo réel reste illisible.",
      "Attendre les prochains événements.",
      "Signal non exploitable pour le moment."
    ];
  }

  const home = match.home || "Domicile";
  const away = match.away || "Extérieur";

  const pressureTeam =
    pulse.homePressure >= pulse.awayPressure
      ? home
      : away;

  const threatTeam =
    pulse.homeThreat >= pulse.awayThreat
      ? home
      : away;

  const momentumTeam =
    pulse.homeMomentum >= pulse.awayMomentum
      ? home
      : away;

  const maxPressure = Math.max(
    pulse.homePressure || 0,
    pulse.awayPressure || 0
  );

  const maxThreat = Math.max(
    pulse.homeThreat || 0,
    pulse.awayThreat || 0
  );

  const maxMomentum = Math.max(
    pulse.homeMomentum || 0,
    pulse.awayMomentum || 0
  );

  const lines = [];

  if (maxPressure >= 70) {
    lines.push(`${pressureTeam} écrase le territoire.`);
  } else if (maxPressure >= 50) {
    lines.push(`${pressureTeam} installe une pression nette.`);
  } else {
    lines.push("Le territoire reste disputé.");
  }

  if (pulse.chaosScore >= 70) {
    lines.push("Match électrique. Tout peut basculer.");
  } else if (maxThreat >= 65) {
    lines.push(`${threatTeam} crée le danger le plus direct.`);
  } else if (maxPressure < 45 && maxThreat < 45) {
    lines.push("Les deux blocs se neutralisent.");
  } else {
    lines.push("Le danger existe mais reste contenu.");
  }

  if (maxMomentum >= 65) {
    lines.push(`${momentumTeam} prend l’ascendant émotionnel.`);
  } else {
    lines.push("Momentum encore instable.");
  }

  let signal = "Patienter. Signal encore incomplet.";

  if (
    pulse.scoringWindow === "CRITICAL" ||
    pulse.scoringWindow === "DANGER"
  ) {
    signal = "Signal fort de but dans les prochaines minutes.";
  } else if (pulse.scoringWindow === "OPEN") {
    signal = "Fenêtre de but ouverte. Surveiller l’action suivante.";
  } else if (pulse.scoringWindow === "FORMING") {
    signal = "Signal en formation. Attendre le prochain corner.";
  } else if (pulse.chaosScore >= 75) {
    signal = "Trop instable. Patienter avant décision.";
  }

  lines.push(signal);

  return lines.slice(0, 4);
}

function normalizeSections(sections, rawText, match, pulse) {
  const localLiveRead = buildLocalLiveRead(match, pulse);

  return {
    live: Array.isArray(sections.live)
      ? sections.live
      : localLiveRead,

    tactical:
      sections.tactical ||
      sections.planJeu ||
      "<p>Lecture tactique indisponible.</p>",

    scorers:
      sections.scorers ||
      "<p>Lecture buteurs indisponible.</p>",

    assists:
      sections.assists ||
      "<p>Lecture passeurs indisponible.</p>",

    penalties:
      sections.penalties ||
      "<p>Lecture penalties indisponible.</p>",

    tacticalJson: {
      planJeu: (sections.tactical && sections.tactical.planJeu) || sections.planJeu || "",
      realiteMatch: (sections.tactical && sections.tactical.realiteMatch) || sections.realiteMatch || "",
      evolutionTactique: (sections.tactical && sections.tactical.evolutionTactique) || sections.evolutionTactique || "",
      facteurDecisif: (sections.tactical && sections.tactical.facteurDecisif) || sections.facteurDecisif || "",
      intentionHome: (sections.tactical && sections.tactical.intentionHome) || sections.intentionHome || "",
      intentionAway: (sections.tactical && sections.tactical.intentionAway) || sections.intentionAway || ""
    },

    rawUnavailable: !!sections.rawUnavailable
  };
}

router.post("/analyze", async function(req, res) {
  try {
    const match = req.body.match;
    const lang = req.body.lang || "fr";
    const isLive = !!req.body.isLive;
    const lineups = req.body.lineups || null;
    const fast = req.body.fast === true;
    const noCache = !!req.body.noCache;

    if (!match) {
      return res.status(400).json({ error: "Match manquant" });
    }

    if (noCache && isLive && match.id) {
      clearFixtureCache(match.id);
    }

    const context = await buildAnalysisContext(match, lineups, { isLive });
    const pulse = isLive ? buildPulseLiveState(match, context) : null;

    // Fast mode: return Pulse data immediately without Claude
    if (fast) {
      return res.json({
        pulse,
        sections: null,
        fastMode: true,
        stats: context.stats,
        liveStats: context.liveStats,
        lineups: context.lineups,
        events: context.events,
        scoring: context.scoring,
        cards: context.cards,
        fixtureStatus: context.fixtureStatus,
        liveScore: context.liveScore,
        goalThreatTable: context.goalThreatTable,
        assistThreatTable: context.assistThreatTable,
        penaltyRiskTable: context.penaltyRiskTable,
        goalWindow: context.goalWindow,
        dataQuality: context.dataQuality
      });
    }

    let rawText = "";
    let parsedSections = {};

    // Check Claude response cache before calling the API (live matches only).
    const fixtureId = match.id || match.fixture?.id;
    const cachedSections = (!noCache && isLive && fixtureId)
      ? getClaudeCache(fixtureId, lang)
      : null;

    if (cachedSections) {
      parsedSections = cachedSections;
    } else {
      try {
        const prompt = buildPrompt(context, lang, isLive, pulse);
        rawText = await askClaude(prompt);
        parsedSections = safeJsonParse(rawText);
        if (isLive && fixtureId && !parsedSections.rawUnavailable) {
          setClaudeCache(fixtureId, lang, parsedSections);
        }
      } catch (claudeError) {
        console.error("❌ CLAUDE ERROR:", claudeError.message);

        parsedSections = {
          live: "",
          tactical: "<p>Lecture tactique indisponible.</p>",
          scorers: "<p>Lecture buteurs indisponible.</p>",
          assists: "<p>Lecture passeurs indisponible.</p>",
          penalties: "<p>Lecture penalties indisponible.</p>",
          rawUnavailable: true
        };
      }
    }

    const sections = normalizeSections(
      parsedSections,
      rawText,
      match,
      pulse
    );

    res.json({
      pulse,

      sections,

      text: Array.isArray(sections.live)
        ? sections.live.join("\n")
        : "",

      stats: context.stats,
      liveStats: context.liveStats,

      lineups: context.lineups,
      events: context.events,
      scoring: context.scoring,
      cards: context.cards,

      fixturePlayers: context.fixturePlayers,
      seasonPlayerStats: context.seasonPlayerStats,

      playerModels: context.playerModels,
      goalThreatTable: context.goalThreatTable,
      assistThreatTable: context.assistThreatTable,
      penaltyRiskTable: context.penaltyRiskTable,
      goalWindow: context.goalWindow,

      dataQuality: context.dataQuality,
      fixtureStatus: context.fixtureStatus,
      liveScore: context.liveScore
    });
  } catch (error) {
    console.error("❌ ANALYZE ERROR:", error.message);

    res.status(error.statusCode || 500).json({
      error: error.message
    });
  }
});

module.exports = router;
