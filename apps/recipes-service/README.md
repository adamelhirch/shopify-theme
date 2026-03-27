# Recipes Service

Service local de reference pour piloter une base de recettes souveraine hors du theme Shopify.

## Ce que le service gere

- registre prive des recettes et guides
- soumissions externes
- roles `admin`, `editor`, `partner`
- moderation `draft`, `pending`, `approved`, `rejected`, `archived`
- historique de revisions par recette
- journal d'audit
- historique des publications du registre public
- export des seules recettes `approved` vers `assets/vd-recipes-registry.json`
- schema SQL de migration vers PostgreSQL dans `apps/recipes-service/schema.sql`
- backend local SQLite disponible pour sortir du JSON sans dependance externe
- adapter PostgreSQL natif disponible pour la cible de production

## Lancer le service

```bash
ruby apps/recipes-service/server.rb
```

Le serveur tourne par defaut sur `http://127.0.0.1:4567`.

Variables utiles:

```bash
export VD_RECIPES_PORT=4567
export VD_RECIPES_ADMIN_TOKEN=change-me
export VD_RECIPES_STORE=json
```

Backends disponibles:

- `VD_RECIPES_STORE=json` pour le store fichier actuel
- `VD_RECIPES_STORE=sqlite` pour la base SQLite locale
- `VD_RECIPES_STORE=postgres` pour une base PostgreSQL
- `VD_RECIPES_SQLITE_PATH=/chemin/recipes.sqlite3` pour choisir le fichier SQLite
- `VD_RECIPES_DATABASE_URL=postgres://...` pour la connexion PostgreSQL

Pour generer une base SQLite a partir du JSON actuel:

```bash
VD_RECIPES_SQLITE_PATH=apps/recipes-service/data/recipes.sqlite3 \
ruby bin/import-recipes-to-sqlite.rb
```

Puis lancer le service dessus:

```bash
VD_RECIPES_STORE=sqlite \
VD_RECIPES_SQLITE_PATH=apps/recipes-service/data/recipes.sqlite3 \
ruby apps/recipes-service/server.rb
```

Pour PostgreSQL:

```bash
VD_RECIPES_DATABASE_URL=postgres://localhost/vd_recipes \
ruby bin/import-recipes-to-postgres.rb
```

Puis lancer le service dessus:

```bash
VD_RECIPES_STORE=postgres \
VD_RECIPES_DATABASE_URL=postgres://localhost/vd_recipes \
ruby apps/recipes-service/server.rb
```

Les acteurs de demo sont definis dans `apps/recipes-service/data/actors.json`:

- `change-me` -> `admin`
- `editor-demo-token` -> `editor`
- `partner-demo-token` -> `partner`

Les tokens peuvent etre envoyes via:

- `X-VD-Token`
- `X-VD-Admin-Token`
- `Authorization: Bearer <token>`

## Endpoints

Public:

- `GET /health`
- `GET /dashboard`
- `GET /recipes`
- `GET /recipes?status=approved&q=vanille&access=member`
- `GET /recipes/:slug`
- `GET /recipes/:slug/history`

Authentifies:

- `GET /me`
- `POST /recipes`
  - `admin` / `editor`: creation directe d'une recette interne
  - `partner`: soumission externe passee en `pending`

Admin / edition:

- `GET /admin`
- `GET /actors`
- `GET /submissions`
- `GET /publications`
- `GET /audit`
- `PATCH /recipes/:slug`
- `POST /recipes/:slug/update`
- `POST /recipes/:slug/approve`
- `POST /recipes/:slug/reject`
- `POST /recipes/:slug/archive`
- `POST /exports/registry`

Les routes protegees attendent:

```text
X-VD-Token: votre-token
X-VD-Reviewer: Nom du relecteur
```

Le header `X-VD-Reviewer` reste optionnel; le service reprend sinon le nom de l'acteur authentifie.

## Interface admin locale

Le service expose un mini back-office HTML sur:

```text
http://127.0.0.1:4567/admin
```

Cette page donne:

- les compteurs clefs
- les soumissions en attente
- les recettes publiees
- l'historique des publications
- les derniers evenements d'audit
- les acteurs autorises
- le rappel des endpoints utiles

## Export vers le theme

```bash
ruby bin/export-recipes-store.rb
```

Ou via API:

```bash
curl -X POST \
  -H "X-VD-Token: change-me" \
  -H "X-VD-Reviewer: Studio" \
  http://127.0.0.1:4567/exports/registry
```

Voir aussi:

- `apps/recipes-service/data/actors.json`
- `apps/recipes-service/schema.sql`
- `apps/recipes-service/schema.sqlite.sql`
- `bin/import-recipes-to-sqlite.rb`
- `bin/import-recipes-to-postgres.rb`

## Etape suivante recommandee

Quand on voudra passer en backend complet de production:

- remplacer le fichier JSON par PostgreSQL
- brancher une authentification robuste avec rotation de secrets et sessions
- ajouter une vraie UI de moderation edition par edition
- versionner les publications par environnement
- connecter la publication a Shopify via app proxy, webhook ou pipeline CI
