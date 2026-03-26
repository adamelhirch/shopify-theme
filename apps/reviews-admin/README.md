# Reviews Admin

Prototype de backoffice reviews independant, organise comme un vrai produit a la
Judge.me mais alimente par la base maison Vanille Desire.

## Pages

- `index.html`
  Dashboard
- `reviews.html`
  Moderation / publication
- `requests.html`
  Demandes d avis, QR, liens post-achat
- `widgets.html`
  Modules storefront et etat d integration

## Donnees

Le backoffice lit le JSON local:

- `../../data/reviews-admin-summary.json`

Pour le regenerer:

```bash
./bin/export-custom-reviews.rb
./bin/build-review-request-links.rb
./bin/generate-review-admin-data.rb
```

## Ouverture locale

Option simple:

```bash
open apps/reviews-admin/index.html
```

Le rendu est purement front pour l instant. Il sert de base d organisation et
de surface admin avant branchement a une vraie app Shopify.
