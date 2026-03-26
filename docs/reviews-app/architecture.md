# Reviews App Architecture

Objectif: transformer le socle custom reviews du theme en une vraie plateforme
independante, structuree comme Judge.me mais adaptee a Vanille Desire.

## Modules

### 1. Dashboard

- KPIs: nombre d avis, note moyenne, verifies, produits notes
- activite recente
- roadmap / etat des modules

Support actuel:

- `apps/reviews-admin/index.html`
- `data/reviews-admin-summary.json`

### 2. Commentaires / moderation

- liste des avis
- statut `published`, `pending`, `rejected`, `flagged`
- badge `verified`
- actions futures: publier, masquer, archiver, repondre

Support actuel:

- `apps/reviews-admin/reviews.html`

### 3. Demandes d'avis

- catalogues de liens post-achat
- QR par produit
- liens tokenises par commande
- campagnes email / SAV / colis

Support actuel:

- `bin/build-review-request-links.rb`
- `apps/reviews-admin/requests.html`

### 4. Widgets storefront

- badge notation produit
- section avis produit
- home testimonials
- page de depot d avis

Support actuel:

- `snippets/vd-review-rating-badge.liquid`
- `sections/vd-product-reviews.liquid`
- `sections/vd-testimonials.liquid`
- `sections/vd-review-request.liquid`

### 5. Data platform

- import historique
- snapshot local
- metaobjects `vd_review`
- review requests tokenisees
- agregats par produit

Support actuel:

- `bin/migrate-judgeme-reviews.rb`
- `bin/export-custom-reviews.rb`
- `bin/generate-review-admin-data.rb`
- `CUSTOM_REVIEWS.md`

## API cible

### Endpoint `POST /apps/vd-reviews/submit`

Payload:

```json
{
  "rating": 5,
  "author": "Jane Doe",
  "email": "jane@example.com",
  "order_name": "#1458",
  "title": "Excellent produit",
  "quote": "Avis complet",
  "context": "Patisserie maison",
  "product_handle": "vanille-bourbon-10-a-20-gousses",
  "token": "review-request-token"
}
```

Traitements attendus:

1. verifier le token ou la correspondance commande / email
2. creer ou mettre a jour `vd_review_request`
3. creer un `vd_review` en `pending` ou `published`
4. recalculer `vd_rating_average` et `vd_rating_count`
5. relier le review metaobject au produit

### Endpoint `POST /apps/vd-reviews/moderate`

Payload minimal:

```json
{
  "review_id": "gid://shopify/Metaobject/...",
  "status": "published"
}
```

### Endpoint `POST /apps/vd-reviews/respond`

Payload minimal:

```json
{
  "review_id": "gid://shopify/Metaobject/...",
  "reply": "Merci pour votre retour."
}
```

## Sequence recommandee

1. Stabiliser les metaobjects `vd_review`, `vd_review_request`, `vd_review_qr`
2. Migrer `vd_reviews_json` vers de vraies references metaobjects
3. Brancher la page storefront de depot d avis
4. Ajouter l app proxy ou le service d ingestion
5. Ajouter moderation + publication
6. Ajouter QR / emails post-achat
7. Ajouter media reviews et reponses marque
