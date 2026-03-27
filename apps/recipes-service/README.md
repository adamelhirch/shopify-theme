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
- `GET /recipes?status=approved`
- `GET /recipes/:slug`
- `GET /submissions`
- `POST /submissions`
- `POST /recipes/:slug/approve`
- `POST /recipes/:slug/reject`
- `POST /recipes/:slug/archive`
- `POST /exports/registry`

Les routes d'approbation et de rejet attendent un header:

```text
X-VD-Admin-Token: votre-token
```

Par defaut le token lu est `VD_RECIPES_ADMIN_TOKEN`, sinon `change-me`.

## Ce que cette base permet deja

- Registre prive des recettes et contenus guides.
- Soumissions externes en `pending`.
- Relecture interne puis passage en `approved`, `rejected` ou `archived`.
- Export API ou CLI du registre public consomme par Shopify.

## Etape suivante recommandee

Pour un vrai backend complet, le chemin logique est:

- remplacer le fichier JSON par PostgreSQL
- ajouter une authentification admin et partenaires
- exposer une UI de moderation
- versionner les recettes et publier par lot
- pousser automatiquement le registre public ou appeler directement Shopify via app proxy / headless endpoint

## Export vers le theme

```bash
ruby bin/export-recipes-store.rb
```

Cela transforme `apps/recipes-service/data/recipes_store.json` en registre public `assets/vd-recipes-registry.json`, consomme ensuite par le hub et la page recette.
