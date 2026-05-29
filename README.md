# SCOUT IA — Version refactorisée

Application d’analyse football avant-match et live.

## Structure

```txt
scout-ia-v2/
├── server.js
├── package.json
├── public/
│   └── index.html
└── src/
    ├── config/
    │   ├── env.js
    │   └── leagues.js
    ├── routes/
    │   ├── health.routes.js
    │   ├── matches.routes.js
    │   └── analysis.routes.js
    ├── services/
    │   ├── footballApi.service.js
    │   ├── analysisData.service.js
    │   ├── prompt.service.js
    │   └── anthropic.service.js
    └── utils/
        └── http.js
```

## Variables d’environnement obligatoires

À configurer sur Railway / Render / local :

```txt
RAPIDAPI_KEY=...
ANTHROPIC_KEY=...
ODDS_API_KEY=...
```

Important : aucune clé privée ne doit être codée directement dans le code.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir :

```txt
http://localhost:3000
```

## Endpoints

```txt
GET  /health
GET  /api/matches
GET  /api/lineups/:matchId
POST /api/analyze
```

## Ce qui a changé dans cette version

- Backend séparé en routes/services/config.
- Clé Odds API retirée du code source.
- Prompts IA rendus plus prudents et plus data-driven.
- Ajout d’un champ `dataQuality` dans la réponse d’analyse.
- Meilleure séparation entre données football et interprétation IA.

## Prochaine étape recommandée

Passer progressivement d’un mélange FootAPI/AllSports/OddsAPI vers une API football unique plus complète, idéalement API-Football ou SportMonks, afin de fiabiliser les compositions, statistiques live, blessures et données joueurs.
