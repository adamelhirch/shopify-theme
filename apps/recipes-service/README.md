# Recipes Service

Service local de reference pour gerer une base de recettes souveraine, avec soumissions externes, validation interne et export vers le theme Shopify.

## Objectif

- Conserver les recettes hors du front Shopify.
- Accepter des propositions externes.
- Garder un statut de moderation (`pending`, `approved`, `rejected`, `archived`).
- Exporter uniquement les recettes `approved` vers `assets/vd-recipes-registry.json`.

## Lancer le service

```bash
ruby apps/recipes-service/server.rb
```

Le serveur tourne par defaut sur `http://127.0.0.1:4567`.

## Endpoints

- `GET /health`
- `GET /recipes`
- `GET /recipes/:slug`
- `POST /submissions`
- `POST /recipes/:slug/approve`
- `POST /recipes/:slug/reject`

Les routes d'approbation et de rejet attendent un header:

```text
X-VD-Admin-Token: votre-token
```

Par defaut le token lu est `VD_RECIPES_ADMIN_TOKEN`, sinon `change-me`.

## Export vers le theme

```bash
ruby bin/export-recipes-store.rb
```

Cela transforme `apps/recipes-service/data/recipes_store.json` en registre public `assets/vd-recipes-registry.json`, consomme ensuite par le hub et la page recette.
