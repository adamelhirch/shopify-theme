# Recipes Service

Service local de reference pour piloter une base de recettes souveraine hors du theme Shopify.

## Ce que le service gere

- registre prive des recettes et guides
- soumissions externes
- moderation `draft`, `pending`, `approved`, `rejected`, `archived`
- historique de revisions par recette
- journal d'audit
- historique des publications du registre public
- export des seules recettes `approved` vers `assets/vd-recipes-registry.json`

## Lancer le service

```bash
ruby apps/recipes-service/server.rb
```

Le serveur tourne par defaut sur `http://127.0.0.1:4567`.

Variables utiles:

```bash
export VD_RECIPES_PORT=4567
export VD_RECIPES_ADMIN_TOKEN=change-me
```

## Endpoints

Public / partenaires:

- `GET /health`
- `GET /dashboard`
- `GET /recipes`
- `GET /recipes?status=approved&q=vanille&access=member`
- `GET /recipes/:slug`
- `GET /recipes/:slug/history`
- `POST /recipes`
  Sans token admin, l'appel est traite comme une soumission externe.

Admin:

- `GET /admin`
- `GET /submissions`
- `GET /publications`
- `GET /audit`
- `POST /recipes`
  Avec token admin, creation directe d'une recette interne.
- `PATCH /recipes/:slug`
- `POST /recipes/:slug/update`
- `POST /recipes/:slug/approve`
- `POST /recipes/:slug/reject`
- `POST /recipes/:slug/archive`
- `POST /exports/registry`

Les routes admin attendent:

```text
X-VD-Admin-Token: votre-token
X-VD-Reviewer: Nom du relecteur
```

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
- le rappel des endpoints utiles

## Export vers le theme

```bash
ruby bin/export-recipes-store.rb
```

Ou via API:

```bash
curl -X POST \
  -H "X-VD-Admin-Token: change-me" \
  -H "X-VD-Reviewer: Studio" \
  http://127.0.0.1:4567/exports/registry
```

## Etape suivante recommandee

Quand on voudra passer en backend complet de production:

- remplacer le fichier JSON par PostgreSQL
- brancher une authentification admin / partenaires
- ajouter une vraie UI de moderation edition par edition
- versionner les publications par environnement
- connecter la publication a Shopify via app proxy, webhook ou pipeline CI
