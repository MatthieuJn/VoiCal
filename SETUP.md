# Voical — Guide de mise en place

App de suivi nutritionnel : PWA + React + Vite + Supabase.

---

## Stack

| Outil | Rôle |
|---|---|
| **Vite** | Bundler / dev server |
| **React 18** | UI |
| **vite-plugin-pwa** | Transforme l'app en PWA installable sur mobile |
| **@supabase/supabase-js** | Client Supabase (auth + base de données) |
| **Supabase** (cloud) | Auth + PostgreSQL hébergé (free tier) |

---

## Fonctionnalités prévues

- Input textuel markdown → parsing automatique des macros (calories, protéines, glucides, lipides, fibres)
- Jauges circulaires journalières avec objectifs configurables
- Ajout de dépenses sportives (vélo, marche, sport…)
- Historique semaine / mois avec moyennes
- Auth email/password via Supabase
- Données persistées dans le cloud, accessibles depuis mobile

---

## Setup initial (fait une fois)

### 1. Autoriser les scripts PowerShell (Windows)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 2. Structure du projet

```
Voical/
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── .env               ← à remplir (ne pas committer)
├── .gitignore
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── lib/
│   │   ├── supabase.js
│   │   └── parser.js
│   └── components/
│       ├── Auth.jsx
│       ├── Gauge.jsx
│       ├── Dashboard.jsx
│       ├── History.jsx
│       └── Settings.jsx
└── supabase/
    └── schema.sql
```

### 3. Installer les dépendances

```powershell
npm install
```

### 4. Créer le fichier .env

```powershell
Copy-Item .env.example .env
```

Puis remplir `.env` avec les valeurs Supabase :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=ta_clé_anon_ici
```

---

## Supabase — Créer le projet

1. Aller sur [https://supabase.com](https://supabase.com) → **New project**
2. Choisir un nom (ex: `voical`), un mot de passe DB, région **EU West**
3. Attendre ~1 minute que le projet démarre
4. **Settings → API** → copier :
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

---

## Supabase — Créer les tables

Dans **SQL Editor** du projet Supabase, lancer `supabase/schema.sql` :

```sql
-- Objectifs journaliers par utilisateur
create table user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  calories integer not null default 2000,
  proteins integer not null default 150,
  carbs    integer not null default 200,
  fats     integer not null default 70,
  fibers   integer not null default 30,
  updated_at timestamptz default now()
);

-- Repas
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id) on delete cascade not null,
  date      date not null,
  name      text not null default 'Repas',
  raw_input text,
  calories  numeric(8,1) not null default 0,
  proteins  numeric(8,1) not null default 0,
  carbs     numeric(8,1) not null default 0,
  fats      numeric(8,1) not null default 0,
  fibers    numeric(8,1) not null default 0,
  created_at timestamptz default now()
);

-- Activités sportives
create table activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade not null,
  date           date not null,
  name           text not null,
  type           text not null default 'sport',
  calories_burned numeric(8,1) not null,
  created_at     timestamptz default now()
);

-- Sécurité : chaque utilisateur ne voit que ses données
alter table user_goals enable row level security;
alter table meals       enable row level security;
alter table activities  enable row level security;

create policy "own goals"      on user_goals  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meals"      on meals       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own activities" on activities  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## Lancer en développement

```powershell
npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173)

---

## Build production + déploiement

```powershell
npm run build
```

Le dossier `dist/` peut être déployé sur **Vercel**, **Netlify**, ou **GitHub Pages** (gratuit).

Pour Vercel (recommandé) :
1. Push le repo sur GitHub
2. [vercel.com](https://vercel.com) → Import project
3. Ajouter les variables d'env `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
4. Deploy → URL publique accessible depuis le téléphone

---

## Installer sur mobile (PWA)

Une fois déployé :
- **iPhone** : Safari → partager → "Sur l'écran d'accueil"
- **Android** : Chrome → menu → "Ajouter à l'écran d'accueil"
