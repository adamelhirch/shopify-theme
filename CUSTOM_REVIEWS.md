# Custom Reviews

Base de travail pour sortir completement du rendu Judge.me.

## Objectif

- Stocker les avis dans Shopify, pas dans une app de rendu tierce.
- Garder un front 100% custom dans le theme.
- Pouvoir brancher plus tard une vraie app privee de collecte/moderation sans refaire l'affichage.

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
   Fallback editor-only

Le premier avis devient la citation vedette.

## Phase suivante pour une vraie app privee

Quand on voudra aller plus loin, l'app privee devra gerer:

- formulaire de depot d'avis
- verification commande / email
- moderation
- calcul automatique des moyennes
- ecriture des metaobjects `vd_review`
- mise a jour des metachamps agreges produit

Le front du theme est deja prepare pour consommer ces donnees custom.
