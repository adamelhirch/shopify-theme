# Custom Reviews

Base de travail du systeme d'avis proprietaire Vanille Desire.

## Objectif

- Stocker les avis dans Shopify, pas dans une app de rendu tierce.
- Garder un front 100% custom dans le theme.
- Brancher une vraie app privee de collecte/moderation sans refaire l'affichage.
- Sortir totalement de Judge.me une fois la base historique recuperee.

## Donnees Shopify recommandees

### 1. Metaobject `vd_review`

Creer un type de metaobject `vd_review` avec ces champs:

- `quote`
  Type: texte multilignes
  Contenu principal de l'avis

- `author`
  Type: texte simple
  Nom affiche

- `rating`
  Type: entier
  Valeur attendue: `1` a `5`

- `review_date`
  Type: date
  Date de l'avis

- `context`
  Type: texte simple
  Optionnel. Ex: `Chef patissier, Lyon`

- `product`
  Type: reference produit
  Produit relie a l'avis

- `source`
  Type: texte simple
  Optionnel. Ex: `Avis client verifie`

- `verified`
  Type: booleen
  Optionnel. Sert de fallback si `source` est vide

- `legacy_uuid`
  Type: texte simple
  Optionnel. Permet de dedoublonner les anciens imports

- `verification_method`
  Type: texte simple
  Optionnel. Ex: `order_match`, `email_match`, `manual`

- `order_name`
  Type: texte simple
  Optionnel. Ex: `#1458`

- `status`
  Type: texte simple
  Valeurs recommandees: `published`, `pending`, `rejected`, `flagged`

### 1 bis. Metaobject `vd_review_request`

Type recommande pour la future app de workflow:

- `token`
  Type: texte simple
  Token unique porte par l'email / QR code

- `product`
  Type: reference produit

- `order_name`
  Type: texte simple

- `customer_email`
  Type: texte simple

- `state`
  Type: texte simple
  Valeurs recommandees: `queued`, `sent`, `opened`, `submitted`, `expired`

- `channel`
  Type: texte simple
  Ex: `post_purchase_email`, `qr_card`, `support_followup`

- `expires_at`
  Type: date et heure

### 1 ter. Metaobject `vd_review_qr`

Type recommande pour la couche QR:

- `product`
  Type: reference produit

- `landing_url`
  Type: URL

- `campaign`
  Type: texte simple

- `label`
  Type: texte simple

## Liaison des avis

### 2. Metachamp produit

Creer un metachamp produit:

- Namespace: `custom`
- Key: `vd_reviews`
- Type: `Liste de references de metaobjects`
- Metaobject cible: `vd_review`

Ce metachamp sert a relier des avis a un produit precis.

### 2 bis. Fallback JSON en production

Le theme sait aussi lire un metachamp produit JSON:

- Namespace: `custom`
- Key: `vd_reviews_json`
- Type: `json`

Ce fallback permet de migrer rapidement les avis existants sans attendre la couche
`metaobject` complete.

### 3. Metachamps agreges produit

Creer ces metachamps produit pour remplacer progressivement `product.metafields.reviews.*`:

- `custom.vd_rating_average`
  Type: nombre decimal

- `custom.vd_rating_count`
  Type: entier

Le theme prefere deja ces valeurs custom si elles existent.

### 4. Snapshot exportable de la base d'avis

Pour sortir de la dependance Judge.me, la base d'avis custom peut desormais etre
extraite localement:

```bash
./bin/export-custom-reviews.rb
```

Le script ecrit un snapshot complet dans:

- `data/custom-reviews-export.json`

Ce snapshot devient la base de travail de l'app reviews proprietaire.

### 5. Liens de demande d'avis / QR

Le script suivant prepare un CSV exploitable pour les futurs emails post-achat,
cartes dans les colis, QR codes imprimes et supports SAV:

```bash
./bin/build-review-request-links.rb
```

Il ecrit:

- `data/review-request-links.csv`

Chaque ligne contient:

- l'identifiant produit
- le handle
- l'URL produit
- l'URL de la future page de depot d'avis

### 6. Synthese admin type Judge.me

Le script suivant agrege le snapshot d'avis et le catalogue review / QR dans un
JSON exploitable par le mini backoffice maison:

```bash
./bin/generate-review-admin-data.rb
```

Il ecrit:

- `data/reviews-admin-summary.json`

### 7. Service reviews local

Le service applicatif de travail est maintenant disponible:

```bash
./bin/reviews-app-dev.rb
```

Il gere deja:

- depot d'avis
- review requests tokenisees
- moderation
- reponses marque
- dashboard local
- API admin vivante pour dashboard / produits / widgets / demandes

Persistence:

- `data/reviews-app-store.json`

### 8. Bootstrap Shopify des definitions

Le script suivant prepare Shopify pour la vraie app reviews:

```bash
./bin/bootstrap-reviews-metaobjects.rb
```

Il cree:

- metaobject `vd_review`
- metaobject `vd_review_request`
- metaobject `vd_review_qr`
- metachamps produit `custom.vd_reviews`
- metachamps produit `custom.vd_review_requests`
- agregats `custom.vd_rating_average`
- agregats `custom.vd_rating_count`

## Theme

### Section `VD Testimonials`

La section peut maintenant lire 3 sources:

1. `Selection d'avis custom`
   Via le setting `review_entries`

2. `Metachamp produit`
   Via `product.metafields.custom.vd_reviews`

3. `Blocs manuels`
   Secours editor-only

Le premier avis devient la citation vedette.

### Section `VD Product Reviews`

La fiche produit peut maintenant utiliser une section dediee:

- lecture directe de `product.metafields.custom.vd_reviews`
- hero review en tete
- liste secondaire d'avis du meme produit
- etat vide propre tant qu'aucun avis n'est relie

### Section `VD Review Request`

La page storefront de depot d'avis est prete:

- template `page.review-request`
- produit charge via `?product=handle`
- future soumission vers `/apps/vd-reviews/submit`
- base compatible email post-achat et QR codes

### Notes produit

Le badge note produit lit uniquement:

- `product.metafields.custom.vd_rating_average`
- `product.metafields.custom.vd_rating_count`
- `product.metafields.custom.vd_reviews`
- `product.metafields.custom.vd_reviews_json`

Il n'y a plus de fallback vers un ancien systeme de reviews tiers.

## Migration Judge.me

Le script `bin/migrate-judgeme-reviews.rb` :

- lit les produits qui ont encore un `reviews.rating_count`
- recupere les avis Judge.me depuis le storefront
- ecrit un payload JSON custom sur chaque produit
- met a jour `custom.vd_rating_average`
- met a jour `custom.vd_rating_count`

Commande :

```bash
./bin/migrate-judgeme-reviews.rb
```

## Etat actuel du systeme proprietaire

Ce qui est deja en place:

- badge note produit base sur `custom.vd_rating_average` et `custom.vd_rating_count`
- section produit custom `VD Product Reviews`
- section home testimonials capable de lire le systeme custom
- page storefront `VD Review Request`
- badge `Verifie` maison
- import historique Judge.me vers `custom.vd_reviews_json`
- backoffice statique type Judge.me dans `apps/reviews-admin/`
- synthese admin exploitable dans `data/reviews-admin-summary.json`

Ce qu'il reste a construire pour atteindre une vraie app reviews:

1. Ecriture des avis en `metaobjects` `vd_review`
2. App proxy Shopify branche sur le service reviews
3. Moderation back-office branchee a Shopify
4. Workflow post-achat Shopify
5. Liens tokenises par commande
6. Generation et impression de QR codes
7. Media reviews photo/video
8. Reponses internes / reponses marque
9. Signals anti spam / anti abus
10. Sync des agregats produit apres publication

## Roadmap recommandee

### Phase 1. Assainir la base

- figer le snapshot exporte
- valider le nombre total d'avis importes
- basculer progressivement de `vd_reviews_json` vers `vd_review`

### Phase 2. Workflow Shopify

- creation automatique d'une `vd_review_request` apres achat
- relance email apres delai configurable
- lien unique par commande / produit

### Phase 3. QR et offline

- QR par produit
- QR par commande
- QR imprime sur carte colis

### Phase 4. App privee complete

- moderation
- publication
- suppression / masquage
- analytics par produit
- gestion du verifie
