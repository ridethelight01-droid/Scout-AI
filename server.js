// version 2
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

// ── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rapidapi: !!RAPIDAPI_KEY, anthropic: !!ANTHROPIC_KEY });
});

// ── PROXY MATCHS (RapidAPI) ───────────────────────────────────────────────
// GET /api/matches?leagueId=39
app.get('/api/matches', async (req, res) => {
  const { leagueId } = req.query;
  if (!leagueId) return res.status(400).json({ error: 'leagueId requis' });
  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY non configurée' });

  try {
    const url = `https://${RAPIDAPI_HOST}/football-get-all-matches-by-league?leagueid=${leagueId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROXY ANALYSE IA (Anthropic) ──────────────────────────────────────────
// POST /api/analyze  { chapter, match, lang }
app.post('/api/analyze', async (req, res) => {
  const { chapter, match, lang } = req.body;
  if (!chapter || !match) return res.status(400).json({ error: 'chapter et match requis' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_KEY non configurée' });

  const L = lang === 'fr' ? 'Réponds entièrement en français.' : 'Respond entirely in English.';
  const m = match;

  const prompts = {
    pre: `Tu es un analyste football d'élite avec accès à la recherche web. Pour le match ${m.home} vs ${m.away} (${m.leagueName}) au ${m.stadium}, ${m.city}, le ${m.date} à ${m.time} :

1. FORME RÉCENTE — 5 derniers matchs de chaque équipe (résultats, buts, série en cours)
2. CONFRONTATIONS DIRECTES — historique head-to-head récent
3. STATS CLÉS — moyenne buts marqués/encaissés, possession, xG récents
4. LE STADE ${m.stadium} — capacité, altitude, taux victoires domicile de ${m.home} cette saison (%), avantage domicile notable
5. FAITS MARQUANTS — blessures importantes, suspensions, actualité

Sois précis avec les chiffres. ${L}`,

    compo: `Tu es un analyste football d'élite. Pour ${m.home} vs ${m.away} (${m.leagueName}) le ${m.date} :

1. SYSTÈME DE JEU ${m.home} — formation probable, pressing, construction, défense, joueurs clés
2. SYSTÈME DE JEU ${m.away} — même analyse complète
3. ENJEUX DU MATCH — titre, Europe, maintien, derby — pour chaque équipe
4. DUEL TACTIQUE — avantages secteur par secteur
5. SCÉNARIO ET SCORE PRÉDIT — score exact (ex: 2-1) avec % confiance et raisonnement détaillé

${L}`,

    scorers: `Tu es un analyste football d'élite avec web search. Pour ${m.home} vs ${m.away} (${m.leagueName}) le ${m.date} :

⚽ TOP 3 BUTEURS POTENTIELS — ${m.home}
Pour chaque joueur : nom, poste, buts saison, forme récente, % marquer 1ère MT, % marquer 2ème MT, justification

⚽ TOP 3 BUTEURS POTENTIELS — ${m.away}
Même structure.

Les % doivent être réalistes (bon buteur en forme : 25-40% par match). ${L}`,

    assists: `Tu es un analyste football d'élite. Pour ${m.home} vs ${m.away} (${m.leagueName}) le ${m.date} :

🎯 TOP 3 PASSEURS POTENTIELS — ${m.home}
Nom, poste, passes dé saison, rôle créatif, % passe dé 1ère MT, % passe dé 2ème MT, justification

🎯 TOP 3 PASSEURS POTENTIELS — ${m.away}
Même structure. Inclure xA si disponible.

${L}`,

    penalty: `Tu es un analyste football d'élite avec web search. Pour ${m.home} vs ${m.away} (${m.leagueName}) le ${m.date} :

1. ${m.home} — penalties obtenus saison (nombre + taux/match + contextes)
2. ${m.home} — penalties concédés (nombre + contextes + joueurs impliqués)
3. ${m.away} — penalties obtenus (même analyse)
4. ${m.away} — penalties concédés (même analyse)
5. JOUEURS CLÉS — qui provoque des fautes dans la surface ?
6. PROBABILITÉ GLOBALE — % chance qu'un penalty soit accordé
7. PAR MI-TEMPS — % 1ère MT vs % 2ème MT
8. SYNTHÈSE — quelle équipe en bénéficiera le plus ?

${L}`
  };

  const prompt = prompts[chapter];
  if (!prompt) return res.status(400).json({ error: 'chapter invalide' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || 'Aucune réponse générée.';

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FALLBACK → app HTML ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SCOUT IA backend running on port ${PORT}`));
