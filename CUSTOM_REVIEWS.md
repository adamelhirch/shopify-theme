# Custom Reviews

Base de travail du systeme d'avis proprietaire Vanille Desire.

## Objectif

- Stocker les avis dans Shopify, pas dans une app de rendu tierce.
- Garder un front 100% custom dans le theme.
- Brancher une vraie app privee de collecte/moderation sans refaire l'affichage.

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

## Phase suivante pour une vraie app privee

L'app privee devra gerer:

- formulaire de depot d'avis
- verification commande / email
- moderation
- calcul automatique des moyennes
- ecriture des metaobjects `vd_review`
- mise a jour des metachamps agreges produit

Le front du theme est deja prepare pour consommer ces donnees custom.
