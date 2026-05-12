# SCOUT IA — Guide de déploiement Railway

## Ce que contient ce dossier

```
scout-ia-backend/
├── server.js          ← Backend Express (proxy API)
├── package.json       ← Dépendances Node.js
├── public/
│   └── index.html     ← Application mobile (frontend)
└── README.md          ← Ce fichier
```

---

## Déploiement en 5 étapes

### Étape 1 — Créer un compte Railway (gratuit)
→ https://railway.app  (connexion avec GitHub recommandée)

### Étape 2 — Créer un repo GitHub
1. Va sur https://github.com/new
2. Nomme le repo `scout-ia`
3. Laisse tout par défaut, clique **Create repository**

### Étape 3 — Uploader les fichiers
Sur la page de ton repo GitHub vide :
1. Clique **uploading an existing file**
2. Glisse tout le contenu de ce dossier (server.js, package.json, et le dossier public/)
3. Clique **Commit changes**

### Étape 4 — Déployer sur Railway
1. Va sur https://railway.app/new
2. Choisis **Deploy from GitHub repo**
3. Sélectionne ton repo `scout-ia`
4. Railway détecte automatiquement Node.js et démarre le déploiement
5. Va dans **Variables** et ajoute :
   - `RAPIDAPI_KEY` = `2bde26ae81msha9aa92502b3083ap19121cjsn4de3c591f4b0`
   - `ANTHROPIC_KEY` = ta clé Anthropic (sur https://console.anthropic.com/settings/keys)
6. Va dans **Settings → Networking → Generate Domain**
7. Tu obtiens une URL du type : `https://scout-ia-xxxx.railway.app`

### Étape 5 — Configurer l'app
1. Ouvre `https://scout-ia-xxxx.railway.app` sur ton téléphone
2. Clique ⚙️ en haut à droite
3. Colle ton URL Railway
4. Enregistre → les matchs se chargent !

---

## Clé Anthropic
Crée-la gratuitement sur : https://console.anthropic.com/settings/keys
(plan gratuit disponible avec $5 de crédit offert)

---

## En cas de problème
- Vérifie que les 2 variables d'env sont bien ajoutées sur Railway
- Ouvre `https://ton-url.railway.app/health` → doit afficher `{"status":"ok",...}`
- Si `rapidapi: false` → la clé RapidAPI n'est pas configurée
