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
const RAPIDAPI_HOST = 'free-api-live-football-data.p.rapidapi.com';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

app.get('/api/matches', async (req, res) => {
  const { leagueId } = req.query;
  if (!leagueId) return res.status(400).json({ error: 'leagueId requis' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configurée' });
  try {
    const url = `https://${RAPIDAPI_HOST}/football-get-all-matches-by-league?leagueid=${leagueId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY }
    });
    const data = await response.json();
    let matches = [];
    if (data && data.response && data.response.matches) matches = data.response.matches;
    else if (Array.isArray(data)) matches = data;
    const upcoming = matches.filter(function(m) {
      return m.status && m.status.notStarted === true;
    });
    res.json({ matches: upcoming });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  const { chapter, match, lang } = req.body;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configurée' });
  const L = lang === 'fr' ? 'Réponds entièrement en français.' : 'Respond entirely in English.';
  const m = match;
  const prompts = {
    pre: `Tu es un analyste football d'élite avec accès à la recherche web. Pour le match ${m.home} vs ${m.away} (${m.leagueName}) au ${m.stadium}, ${m.city}, le ${m.date} à ${m.time}, rédige un BRIEFING COMPLET AVANT MATCH : forme récente des 2 équipes (5 derniers matchs), confrontations directes, stats clés (buts, possession, xG), infos sur le stade (capacité, altitude, taux victoires domicile %), faits marquants (blessures, suspensions). ${L}`,
    compo: `Tu es un analyste football d'élite. Pour $
