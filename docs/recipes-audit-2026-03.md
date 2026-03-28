# Audit recettes - 2026-03

## Etat actuel

- Le hub recettes est rendu par [sections/vd-page-flow.liquid](/Users/leothuel/Documents/VD%20Site/sections/vd-page-flow.liquid).
- La fiche recette detail est rendue par [sections/vd-recipe-signature.liquid](/Users/leothuel/Documents/VD%20Site/sections/vd-recipe-signature.liquid) et [assets/vd-recipe-signature.js](/Users/leothuel/Documents/VD%20Site/assets/vd-recipe-signature.js).
- Le registre public alimente le front depuis [assets/vd-recipes-registry.json](/Users/leothuel/Documents/VD%20Site/assets/vd-recipes-registry.json).
- La base privee et le poste editorial passent par [apps/recipes-service/data/recipes_store.json](/Users/leothuel/Documents/VD%20Site/apps/recipes-service/data/recipes_store.json) et [apps/recipes-service/server.rb](/Users/leothuel/Documents/VD%20Site/apps/recipes-service/server.rb).
- L'app desktop locale est [VD Backoffice.app](/Users/leothuel/Desktop/VD%20Backoffice.app).

## Ce qui marche bien

- Le fond video du hub recettes est deja editable dans Shopify:
  - `recipes_background_video`
  - `recipes_video_url`
  - `recipes_background_image`
- Les medias recette sont deja pilotables dans l'editeur Shopify via les blocs `Media recette`:
  - `placement: hero`
  - `placement: gallery`
  - `placement: step`
- Le detail recette gere deja:
  - plein ecran
  - progression
  - portions
  - verrouillage client pour premium
  - schema `Recipe` et `FAQPage`
  - carrousel produits lies

## Frictions constatees

### Edition Shopify

- Le hub a bien un fond video global editable, mais les visuels recette restent dependants:
  - soit du registre JSON
  - soit des blocs `Media recette`
- Les nouvelles recettes sans image finale tombent vite sur des cartes visuellement pauvres si on ne prevoit pas de fallback.
- Il n'y avait pas d'affichage clair des sources / credits pour les recettes adaptees.

### Back-office recette

- Le plus gros frein etait la creation:
  - ingredients en JSON
  - etapes en JSON
  - FAQ en JSON
  - produits en JSON
- Pour une equipe editoriale, ce n'etait pas assez simple.
- La logique Shopify et preview etait deja forte, mais la saisie editoriale ne suivait pas.

### Catalogue / contenu

- Le repertoire etait encore leger: 8 recettes.
- Certaines fiches historiques n'avaient pas encore de produits relies propres.
- Le sourcing des recettes adaptees n'etait pas expose en front.

## Ameliorations posees dans ce lot

- Ajout d'un affichage `Sources & credits` sur les fiches recette.
- Ajout du champ `sources` dans la base recette et le registre public.
- Simplification du back-office:
  - ingredients en texte
  - etapes en texte
  - astuces en texte
  - FAQ en texte
  - sections SEO en texte
  - produits lies en texte
  - produit principal / collection / note en champs simples
- Le JSON avance reste disponible, mais seulement en mode replie.
- Ajout d'un fallback elegant pour les cartes sans photo finale.
- Ajout d'un premier lot de recettes sourcées et reliees aux produits.
- Passage du repertoire a 15 recettes publiees dans le registre.

## Verification video de fond

### Hub recettes

Le fond video du hub est bien modifiable dans l'editeur Shopify via:

- [sections/vd-page-flow.liquid](/Users/leothuel/Documents/VD%20Site/sections/vd-page-flow.liquid)
- settings:
  - `recipes_background_video`
  - `recipes_video_url`
  - `recipes_background_image`

### Hero recette

Le hero de chaque recette peut deja etre modifie:

- soit via le registre avec `hero.video_url` / `hero.image_url`
- soit via les blocs Shopify `Media recette` avec `placement = hero`

Donc oui, la video qui tourne en fond des recettes est bien accessible et changeable depuis l'editeur Shopify.

## Sources ouvertes retenues

Base retenue pour adaptations en cours:

- Wikibooks Cookbook, sous licence CC BY-SA 4.0
- exemples deja relies:
  - `Cookbook:Crème Brûlée I`
  - `Cookbook:Keralan Prawns`
  - `Cookbook:Banana Bread I`
  - `Cookbook:Carrot Cake I`
  - `Cookbook:Yeasted Vanilla Sponge Cake`
  - `Cookbook:Pineapple Upside-Down Cake in a Skillet`
  - `Cookbook:Pancake`
  - `Cookbook:Raisin Oatmeal Muffins`
  - `Cookbook:Apple Crumb Cake`

## Images libres de droit: voie recommandee

Pour travailler proprement avant les vraies photos:

1. Wikimedia Commons si une image editioriale convaincante existe deja.
2. Openverse pour filtrer les licences ouvertes.
3. Pexels / Unsplash uniquement comme provisoire editoriale, avec suivi des credits.
4. Ensuite remplacement par les vraies photos studio dans Shopify via blocs `Media recette`.

Exemples utiles deja identifies:

- Wikimedia Commons: visuels de preparation et plats finis lorsqu'une licence ouverte claire est disponible.
- Wikibooks / Wikimedia ecosysteme: pratique pour relier recette source et image libre dans le meme univers documentaire.
- Openverse: bon point d'entree pour filtrer `CC BY` / `CC0` avant integration editoriale.

## Priorites suivantes

1. Poser un vrai mini workflow media dans le back-office recette:
   - hero
   - galerie
   - medias par etape
   - credits image
2. Pousser les nouvelles recettes sur des pages dediees Shopify si on veut maximiser le SEO.
3. Ajouter un mode creation encore plus guide:
   - template
   - source
   - produits
   - ingredients
   - etapes
   - SEO
   - publication
