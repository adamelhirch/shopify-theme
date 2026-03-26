# Reviews Service

Service local de travail pour la plateforme d'avis independante Vanille Desire.

## Objectif

Fournir une couche applicative concrete entre le theme Shopify et la future app
privee Shopify:

- reception des avis depuis la page storefront
- persistence locale des reviews et review requests
- moderation
- reponses marque
- base exploitable pour la synchro Shopify

## Lancement

```bash
./bin/reviews-app-dev.rb
```

Puis:

- `GET http://127.0.0.1:4567/healthz`
- `GET http://127.0.0.1:4567/api/dashboard`
- `GET http://127.0.0.1:4567/api/reviews`
- `GET http://127.0.0.1:4567/api/requests`

## Endpoints

### `POST /apps/vd-reviews/submit`

Reoit un avis depuis la page storefront `VD Review Request`.

### `POST /apps/vd-reviews/moderate`

Permet de changer le statut d'un avis:

- `published`
- `pending`
- `rejected`
- `flagged`

### `POST /apps/vd-reviews/respond`

Ajoute une reponse marque sur un avis.

### `POST /api/requests`

Cree une review request tokenisee localement.

## Persistance

Le service travaille sur:

- `data/reviews-app-store.json`

Ce fichier est ignore par Git.

Au premier lancement, il est bootstrappe a partir de:

- `data/custom-reviews-export.json`
- `data/review-request-links.csv`

## Sync Shopify

Le fichier local peut etre resynchronise vers Shopify avec:

```bash
./bin/sync-reviews-store-to-shopify.rb --dry-run
./bin/sync-reviews-store-to-shopify.rb
```

Cette synchro ecrit:

- `custom.vd_reviews_json`
- `custom.vd_rating_average`
- `custom.vd_rating_count`

sur les produits publies.
